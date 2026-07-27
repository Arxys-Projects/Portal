// Push the Arxys Master Sheet (Google Sheets CSV) to the portal (Supabase
// products) and/or to Pipedrive Products. Shows a full change preview and
// requires typing CONFIRM before writing anything.
//
// products is APPEND-ONLY (migration 20260702000001): each price change is a
// new row for the SKU with its own effective_date. The portal + Excel read the
// current_products view, which resolves the latest row with effective_date <=
// today. Pipedrive is NEVER pushed automatically — only the explicit
// --target=pipedrive / --target=all steps below push it. A SKU that is
// active=false in the portal (EOL/superseded) is archived in Pipedrive
// (active_flag=false), never re-pushed active — keeping availability in sync in
// one run and closing the "resurrection" trap (ADR 0078).
//
// Run:
//   Portal + Pipedrive (default, matches the monthly cycle):
//     node --env-file=.env.local --import tsx scripts/push-prices.ts
//   Portal only (write versioned rows; any effective date, past or future):
//     node --env-file=.env.local --import tsx scripts/push-prices.ts --target=portal
//     node --env-file=.env.local --import tsx scripts/push-prices.ts --target=portal --effective-date=2026-08-01
//   Pipedrive only (push current-as-of-today prices; idempotent):
//     node --env-file=.env.local --import tsx scripts/push-prices.ts --target=pipedrive
//   Dry run (no writes): add --dry-run to any of the above.
//
// Prerequisites (run before a live push):
//   1. scripts/backup-tables.ts   (dumps products + friends to backups/)
//   2. scripts/backup-pipedrive-products.ts
//
// Capacity preservation: max_cameras + max_storage_tb are carried forward from
// the SKU's current row into each new versioned row (projectCurrentAsOfToday and
// pushPortalRows). This script is now their ONLY writer and there is no reader
// left anywhere in the app:
//
//   * The old calculator filter `not('max_cameras', 'is', null)` is GONE — ADR
//     0094 moved the recommender's pool to product_specs, taking it from 6 SKUs
//     to 18 precisely because these columns are populated for only 6.
//   * Covered capacity on the System Estimate PDF, Project Quote, and Customer
//     Proposal comes from product_specs via coveredCapacity() (ADR 0092).
//   * The Price Book computes net-usable from product_specs too, and the four
//     remaining dead reads were removed 2026-07-24.
//
// The carry-forward is retained ON PURPOSE, not by oversight. products is
// append-only, so dropping it would make the next run insert current rows with
// NULL capacity and silently strip the 6 SKUs that still hold real values.
// Retiring these columns properly means a drop migration, not a quiet stop —
// see JOURNAL 2026-07-24 and the spec-unification brief.

import { validateSheet } from "./validate-prices-sheet";
import { parse } from "csv-parse/sync";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import { env } from "../src/lib/env";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PriceType = "numeric" | "market" | "call_for_quote";

type Target = "portal" | "pipedrive" | "all";

type SheetRow = {
  sku: string;
  productName: string;
  msrpRaw: string;
  priceType: PriceType;
  productGroup: string;
  sortOrder: number;
};

// A row of the current_products view: the current-as-of-today price + attrs
// for a SKU. `id` is the winning products row (used to stamp pushed_to_pipedrive_at).
type CurrentProduct = {
  id: number;
  sku: string;
  product_name: string;
  msrp: number | null;
  price_type: PriceType;
  product_group: string;
  sort_order: number;
  active: boolean;
  max_cameras: number | null;
  max_storage_tb: number | null;
  pushed_to_pipedrive_at: string | null;
};

type PdProduct = {
  id: number;
  name: string;
  code: string | null;
  active_flag: boolean;
  prices: Array<{ price: number; currency: string }>;
};

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

type Args = { target: Target; dryRun: boolean; effectiveDate: string };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseArgs(argv: string[]): Args {
  const dryRun = argv.includes("--dry-run");

  const targetArg = argv.find((a) => a.startsWith("--target="));
  const targetRaw = targetArg ? targetArg.split("=")[1] : "all";
  if (targetRaw !== "portal" && targetRaw !== "pipedrive" && targetRaw !== "all") {
    console.error(`Invalid --target=${targetRaw}. Use portal | pipedrive | all.`);
    process.exit(1);
  }

  const edArg = argv.find((a) => a.startsWith("--effective-date="));
  const effectiveDate = edArg ? edArg.split("=")[1] : todayIso();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) || isNaN(Date.parse(effectiveDate))) {
    console.error(`Invalid --effective-date=${effectiveDate}. Use YYYY-MM-DD.`);
    process.exit(1);
  }
  if (edArg && targetRaw === "pipedrive") {
    console.error("--effective-date is meaningless with --target=pipedrive (it pushes current-as-of-today). Aborting.");
    process.exit(1);
  }

  return { target: targetRaw, dryRun, effectiveDate };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SHEET_ID = "12zwFhDynV6T4ehxui7y-i6F-8XjEYFRBPgsAicpksmk";
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;
const PD_BASE = "https://api.pipedrive.com/v1";

function derivePriceType(msrpRaw: string): PriceType {
  if (msrpRaw === "MKT" || msrpRaw === "") return "market";
  if (msrpRaw === "Call for Quote") return "call_for_quote";
  return "numeric";
}

// Pipedrive display name + price, from a price_type + name/msrp pair.
function pdName(name: string, priceType: PriceType): string {
  if (priceType === "market") return `[MKT] ${name}`;
  if (priceType === "call_for_quote") return `[CFQ] ${name}`;
  return name;
}

function pdPrice(priceType: PriceType, msrp: number | null): number {
  return priceType === "numeric" ? Number(msrp ?? 0) : 0;
}

function sheetMsrp(row: SheetRow): number | null {
  return row.priceType === "numeric" ? Number(row.msrpRaw) : null;
}

function fmt(n: number | null): string {
  if (n == null) return "—";
  return "$" + n.toLocaleString("en-US");
}

function priceLabel(priceType: PriceType, msrp: number | null): string {
  if (priceType === "numeric") return fmt(msrp);
  if (priceType === "market") return "MKT";
  return "CFQ";
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchSheetRows(): Promise<SheetRow[]> {
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching master sheet CSV`);
  const csvText = await res.text();
  const allRows = parse(csvText, { relax_column_count: true }) as string[][];
  const dataRows = allRows.slice(1).filter((r) => r.some((c) => c.trim() !== ""));
  return dataRows.map((r, i) => {
    const sku = (r[0] ?? "").trim();
    const productName = (r[1] ?? "").trim();
    const msrpRaw = (r[2] ?? "").trim();
    const priceType = derivePriceType(msrpRaw);
    return {
      sku,
      productName,
      msrpRaw,
      priceType,
      productGroup: sku.split("-")[1] ?? "UNKNOWN",
      sortOrder: i + 1,
    };
  });
}

// Current-as-of-today price per SKU — the SAME resolution the portal + Excel
// use. Reads the current_products view, not the raw products history.
async function fetchCurrentProducts(admin: SupabaseClient): Promise<CurrentProduct[]> {
  const { data, error } = await admin
    .from("current_products")
    .select(
      "id, sku, product_name, msrp, price_type, product_group, sort_order, active, max_cameras, max_storage_tb, pushed_to_pipedrive_at",
    );
  if (error) throw new Error(`Supabase select current_products failed: ${error.message}`);
  return (data ?? []) as CurrentProduct[];
}

async function fetchPdProducts(): Promise<PdProduct[]> {
  const out: PdProduct[] = [];
  let start = 0;
  for (;;) {
    const url = new URL(`${PD_BASE}/products`);
    url.searchParams.set("api_token", env.PIPEDRIVE_API_TOKEN);
    url.searchParams.set("limit", "100");
    url.searchParams.set("start", String(start));
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Pipedrive GET /products failed (${res.status})`);
    const json = (await res.json()) as {
      success: boolean;
      error?: string;
      data: PdProduct[] | null;
      additional_data?: {
        pagination?: { more_items_in_collection?: boolean; next_start?: number };
      };
    };
    if (!json.success) throw new Error(`Pipedrive GET /products: ${json.error}`);
    const items = json.data ?? [];
    out.push(...items);
    if (!json.additional_data?.pagination?.more_items_in_collection) break;
    start = json.additional_data.pagination.next_start ?? start + 100;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pipedrive write helpers
// ---------------------------------------------------------------------------

async function pdPost(path: string, body: unknown): Promise<unknown> {
  const url = new URL(`${PD_BASE}${path}`);
  url.searchParams.set("api_token", env.PIPEDRIVE_API_TOKEN);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { success: boolean; error?: string; data: unknown };
  if (!res.ok || !json.success) throw new Error(`Pipedrive POST ${path}: ${json.error ?? res.status}`);
  return json.data;
}

async function pdPut(path: string, body: unknown): Promise<unknown> {
  const url = new URL(`${PD_BASE}${path}`);
  url.searchParams.set("api_token", env.PIPEDRIVE_API_TOKEN);
  const res = await fetch(url.toString(), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { success: boolean; error?: string; data: unknown };
  if (!res.ok || !json.success) throw new Error(`Pipedrive PUT ${path}: ${json.error ?? res.status}`);
  return json.data;
}

// ---------------------------------------------------------------------------
// Portal change set: Master Sheet vs current_products (what versioned rows to
// insert). A SKU that is unchanged vs its current row is NOT re-versioned.
// ---------------------------------------------------------------------------

type PortalChange = {
  row: SheetRow;
  oldPriceType: PriceType | null;
  oldMsrp: number | null;
};

type PortalChanges = {
  newRows: SheetRow[]; // SKU not present as a current product
  updatedRows: PortalChange[]; // present but price/name/group/type differs
  flaggedRemoval: CurrentProduct[]; // current product no longer in the Sheet
};

function computePortalChanges(
  sheetRows: SheetRow[],
  current: CurrentProduct[],
): PortalChanges {
  const sheetSkus = new Set(sheetRows.map((r) => r.sku));
  const curBySku = new Map(current.map((c) => [c.sku, c]));

  const newRows: SheetRow[] = [];
  const updatedRows: PortalChange[] = [];

  for (const row of sheetRows) {
    const cur = curBySku.get(row.sku);
    if (!cur) {
      newRows.push(row);
      continue;
    }
    const expectedMsrp = sheetMsrp(row);
    const curMsrp = cur.msrp == null ? null : Number(cur.msrp);
    const differs =
      cur.product_name !== row.productName ||
      curMsrp !== expectedMsrp ||
      cur.product_group !== row.productGroup ||
      cur.price_type !== row.priceType;
    if (differs) {
      updatedRows.push({ row, oldPriceType: cur.price_type, oldMsrp: curMsrp });
    }
  }

  const flaggedRemoval = current.filter((c) => !sheetSkus.has(c.sku));
  return { newRows, updatedRows, flaggedRemoval };
}

// ---------------------------------------------------------------------------
// Pipedrive change set: current_products vs live Pipedrive (what to push).
// Pipedrive receives current-as-of-today prices, NOT the raw Sheet — so a
// future-dated portal row does not reach Pipedrive until its date arrives.
// ---------------------------------------------------------------------------

type PipedriveChanges = {
  newInPd: CurrentProduct[];
  updatedInPd: Array<{ cur: CurrentProduct; id: number }>;
  // Portal-deactivated SKUs (active=false) still active_flag=true in Pipedrive —
  // to be archived (active_flag=false), NOT re-pushed active. See ADR 0078.
  archiveInPd: Array<{ cur: CurrentProduct; id: number }>;
  flaggedRemoval: PdProduct[];
};

function computePipedriveChanges(
  current: CurrentProduct[],
  pdProducts: PdProduct[],
): PipedriveChanges {
  const curSkus = new Set(current.map((c) => c.sku));
  const pdByCode = new Map(pdProducts.filter((p) => p.code).map((p) => [p.code!, p]));

  const newInPd: CurrentProduct[] = [];
  const updatedInPd: Array<{ cur: CurrentProduct; id: number }> = [];
  const archiveInPd: Array<{ cur: CurrentProduct; id: number }> = [];

  for (const cur of current) {
    const pd = pdByCode.get(cur.sku);

    // current_products has no `active` filter, so portal-deactivated SKUs still
    // resolve here. Treat active=false as an ARCHIVE signal, not a push: never
    // create it, never re-push it active (that would resurrect an EOL/superseded
    // SKU — the trap in ADR 0078). If it's present and still active in Pipedrive,
    // archive it so one pipeline run keeps Pipedrive availability in sync with the
    // portal. Already-archived / never-created SKUs are skipped (idempotent).
    if (!cur.active) {
      if (pd && pd.active_flag) archiveInPd.push({ cur, id: pd.id });
      continue;
    }

    if (!pd) {
      newInPd.push(cur);
      continue;
    }
    const existingPrice = pd.prices?.[0]?.price ?? null;
    const differs =
      pd.name !== pdName(cur.product_name, cur.price_type) ||
      existingPrice !== pdPrice(cur.price_type, cur.msrp);
    if (differs) updatedInPd.push({ cur, id: pd.id });
  }

  const flaggedRemoval = pdProducts.filter((p) => p.code && !curSkus.has(p.code));
  return { newInPd, updatedInPd, archiveInPd, flaggedRemoval };
}

// For the --target=all DRY-RUN preview only: the Pipedrive diff must reflect the
// current state AFTER the portal rows are inserted (the live run re-reads the DB
// post-insert). Apply the portal changes to a copy of `current` when the effective
// date is today or past; future-dated rows don't affect current-as-of-today.
function projectCurrentAsOfToday(
  current: CurrentProduct[],
  portal: PortalChanges,
  effectiveDate: string,
): CurrentProduct[] {
  if (effectiveDate > todayIso()) return current;
  const bySku = new Map(current.map((c) => [c.sku, { ...c }]));
  const applied = [...portal.newRows, ...portal.updatedRows.map((u) => u.row)];
  for (const r of applied) {
    const existing = bySku.get(r.sku);
    bySku.set(r.sku, {
      id: existing?.id ?? -1,
      sku: r.sku,
      product_name: r.productName,
      msrp: sheetMsrp(r),
      price_type: r.priceType,
      product_group: r.productGroup,
      sort_order: r.sortOrder,
      active: true,
      max_cameras: existing?.max_cameras ?? null,
      max_storage_tb: existing?.max_storage_tb ?? null,
      pushed_to_pipedrive_at: existing?.pushed_to_pipedrive_at ?? null,
    });
  }
  return [...bySku.values()];
}

// ---------------------------------------------------------------------------
// Preview printer
// ---------------------------------------------------------------------------

function printPreview(
  portal: PortalChanges,
  pipedrive: PipedriveChanges | null,
  args: Args,
): void {
  console.log("\n=== Change preview ===\n");
  console.log(`Target:            ${args.target}`);
  if (args.target !== "pipedrive") {
    console.log(`Effective date:    ${args.effectiveDate}${args.effectiveDate > todayIso() ? "  (FUTURE — not current until this date)" : ""}`);
  }
  console.log(`Touches Pipedrive: ${pipedrive ? "YES" : "NO"}\n`);

  if (args.target !== "pipedrive") {
    console.log(`Portal (Supabase products — append-only):`);
    console.log(`  New versioned rows:      ${portal.newRows.length}`);
    console.log(`  Updated (new versions):  ${portal.updatedRows.length}`);
    console.log(`  Flagged removal:         ${portal.flaggedRemoval.length} (not touched automatically)`);

    if (portal.newRows.length > 0) {
      console.log(`\n[Portal NEW — effective ${args.effectiveDate}]`);
      for (const r of portal.newRows) {
        console.log(`  + ${r.sku}  ${r.productName}  ${priceLabel(r.priceType, sheetMsrp(r))}`);
      }
    }
    if (portal.updatedRows.length > 0) {
      console.log(`\n[Portal UPDATED — new version effective ${args.effectiveDate}]`);
      for (const c of portal.updatedRows) {
        const oldLabel = priceLabel(c.oldPriceType ?? "numeric", c.oldMsrp);
        const newLabel = priceLabel(c.row.priceType, sheetMsrp(c.row));
        console.log(`  ~ ${c.row.sku}  ${c.row.productName}  ${oldLabel} → ${newLabel}`);
      }
    }
    if (portal.flaggedRemoval.length > 0) {
      console.log(`\n[Portal FLAGGED FOR REMOVAL — not touched automatically]`);
      for (const p of portal.flaggedRemoval) console.log(`  ? ${p.sku}  ${p.product_name}`);
    }
  }

  if (pipedrive) {
    console.log(`\nPipedrive (from current-as-of-today prices):`);
    console.log(`  New:              ${pipedrive.newInPd.length} product(s)`);
    console.log(`  Updated:          ${pipedrive.updatedInPd.length} product(s)`);
    console.log(`  Archived:         ${pipedrive.archiveInPd.length} product(s) (portal active=false → active_flag=false)`);
    console.log(`  Flagged removal:  ${pipedrive.flaggedRemoval.length} product(s) (not touched automatically)`);

    if (pipedrive.newInPd.length > 0) {
      console.log(`\n[Pipedrive NEW]`);
      for (const c of pipedrive.newInPd) {
        console.log(`  + ${c.sku}  ${pdName(c.product_name, c.price_type)}  ${fmt(pdPrice(c.price_type, c.msrp))}`);
      }
    }
    if (pipedrive.updatedInPd.length > 0) {
      console.log(`\n[Pipedrive UPDATED]`);
      for (const { cur } of pipedrive.updatedInPd) {
        console.log(`  ~ ${cur.sku}  ${pdName(cur.product_name, cur.price_type)}  ${fmt(pdPrice(cur.price_type, cur.msrp))}`);
      }
    }
    if (pipedrive.archiveInPd.length > 0) {
      console.log(`\n[Pipedrive ARCHIVE — portal-deactivated, active_flag → false, deal history kept]`);
      for (const { cur } of pipedrive.archiveInPd) {
        console.log(`  ⊘ ${cur.sku}  ${pdName(cur.product_name, cur.price_type)}`);
      }
    }
    if (pipedrive.flaggedRemoval.length > 0) {
      console.log(`\n[Pipedrive FLAGGED FOR REMOVAL — not touched automatically]`);
      for (const p of pipedrive.flaggedRemoval) console.log(`  ? ${p.code}  ${p.name}`);
    }
  } else if (args.target === "portal") {
    console.log(`\nPipedrive: SKIPPED (target=portal). pushed_to_pipedrive_at untouched.`);
  }
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

async function promptConfirm(): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout });
    rl.question(
      "\nReview the changes above. Type CONFIRM to push or CANCEL to exit: ",
      (answer) => {
        rl.close();
        resolve(answer.trim() === "CONFIRM");
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Portal write — APPEND-ONLY. Inserts a new versioned row (sku, effective_date)
// for each new/changed SKU. Unchanged SKUs are not re-versioned. Same-day
// re-runs overwrite that day's row via onConflict(sku, effective_date).
// ---------------------------------------------------------------------------

async function pushPortalRows(
  admin: SupabaseClient,
  portal: PortalChanges,
  current: CurrentProduct[],
  effectiveDate: string,
): Promise<{ successCount: number; errors: string[] }> {
  const curBySku = new Map(current.map((c) => [c.sku, c]));
  const timestamp = new Date().toISOString();

  const changedRows: SheetRow[] = [
    ...portal.newRows,
    ...portal.updatedRows.map((c) => c.row),
  ];

  const insertRows = changedRows.map((r) => {
    const cur = curBySku.get(r.sku);
    return {
      sku: r.sku,
      product_name: r.productName,
      msrp: sheetMsrp(r),
      price_type: r.priceType,
      product_group: r.productGroup,
      sort_order: r.sortOrder,
      active: true,
      max_cameras: cur?.max_cameras ?? null,
      max_storage_tb: cur?.max_storage_tb ?? null,
      effective_date: effectiveDate,
      updated_at: timestamp,
    };
  });

  const errors: string[] = [];
  let successCount = 0;
  if (insertRows.length === 0) return { successCount, errors };

  const CHUNK = 100;
  for (let i = 0; i < insertRows.length; i += CHUNK) {
    const chunk = insertRows.slice(i, i + CHUNK);
    // Untyped client resolves upsert values as `never` for literal table names;
    // the runtime type is correct. onConflict on the (sku, effective_date) key
    // makes same-day re-runs idempotent (a correction overwrites that day's row).
    const { error } = await admin
      .from("products")
      .upsert(chunk as unknown as never[], { onConflict: "sku,effective_date" });
    if (error) {
      errors.push(`Supabase insert chunk ${i}-${i + chunk.length}: ${error.message}`);
    } else {
      successCount += chunk.length;
    }
  }

  return { successCount, errors };
}

// ---------------------------------------------------------------------------
// Pipedrive write — pushes current-as-of-today prices, archives portal-deactivated
// SKUs (active_flag=false), then stamps pushed_to_pipedrive_at on the winning
// products rows it pushed or archived. Idempotent: a second run finds no diff and
// nothing left to archive, so it pushes/stamps nothing.
// ---------------------------------------------------------------------------

async function pushPipedrive(
  admin: SupabaseClient,
  pipedrive: PipedriveChanges,
): Promise<{ successCount: number; archivedCount: number; errors: string[]; stampErrors: string[] }> {
  const errors: string[] = [];
  const pushedIds: number[] = [];

  const toPush: Array<{ cur: CurrentProduct; id?: number }> = [
    ...pipedrive.newInPd.map((cur) => ({ cur })),
    ...pipedrive.updatedInPd.map(({ cur, id }) => ({ cur, id })),
  ];

  for (const { cur, id } of toPush) {
    const payload = {
      name: pdName(cur.product_name, cur.price_type),
      code: cur.sku,
      prices: [{ price: pdPrice(cur.price_type, cur.msrp), currency: "USD" }],
      active_flag: true,
    };
    try {
      if (id !== undefined) {
        await pdPut(`/products/${id}`, payload);
      } else {
        await pdPost("/products", payload);
      }
      pushedIds.push(cur.id);
    } catch (err) {
      errors.push(`${cur.sku}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Archive portal-deactivated SKUs (active_flag=false), NOT delete — the product
  // stays on existing deals + in reporting but drops off new-deal pickers. This
  // folds in what scripts/archive-eol-pipedrive-products.ts used to do as a manual
  // second step, and closes the resurrection trap: an inactive SKU is archived, not
  // re-pushed active, even if it was re-priced (ADR 0078). Only sends active_flag —
  // we don't refresh the price of a retired product.
  const archivedIds: number[] = [];
  for (const { cur, id } of pipedrive.archiveInPd) {
    try {
      await pdPut(`/products/${id}`, { active_flag: false });
      archivedIds.push(cur.id);
    } catch (err) {
      errors.push(`${cur.sku} (archive): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Stamp pushed_to_pipedrive_at on the exact products rows we synced — pushed or
  // archived. Idempotency comes from the diff / active_flag checks, not the stamp;
  // this is the audit trail of "last reconciled with Pipedrive".
  const stampErrors: string[] = [];
  const stampIds = [...pushedIds, ...archivedIds];
  if (stampIds.length > 0) {
    const { error } = await admin
      .from("products")
      .update({ pushed_to_pipedrive_at: new Date().toISOString() } as unknown as never)
      .in("id", stampIds);
    if (error) stampErrors.push(`stamp pushed_to_pipedrive_at: ${error.message}`);
  }

  return { successCount: pushedIds.length, archivedCount: archivedIds.length, errors, stampErrors };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv);
  console.log(`=== push-prices.ts [target=${args.target}${args.dryRun ? ", DRY RUN" : ""}] ===\n`);

  // 1. Validate the sheet (only relevant when we read it — portal / all).
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let sheetRows: SheetRow[] = [];
  if (args.target !== "pipedrive") {
    console.log("Step 1: Validating master sheet...");
    const { violations, rowCount } = await validateSheet();
    if (violations.length > 0) {
      console.error(`\n${violations.length} validation violation(s) — fix before pushing:`);
      for (const v of violations) console.error(`  - ${v}`);
      process.exit(1);
    }
    console.log(`Sheet valid. ${rowCount} data row(s).\n`);

    sheetRows = await fetchSheetRows();
    const emptyNames = sheetRows.filter((r) => r.productName === "");
    if (emptyNames.length > 0) {
      console.error(`${emptyNames.length} row(s) with empty product name:`);
      for (const r of emptyNames) console.error(`  - ${r.sku}`);
      process.exit(1);
    }
  }

  // 2. Fetch current portal state (+ Pipedrive if we'll touch it).
  console.log("Step 2: Fetching current products (+ Pipedrive if targeted)...");
  const willTouchPipedrive = args.target === "pipedrive" || args.target === "all";
  const current = await fetchCurrentProducts(admin);
  const pdProducts = willTouchPipedrive ? await fetchPdProducts() : [];

  console.log(`  Sheet: ${sheetRows.length} row(s)`);
  console.log(`  Supabase (current_products): ${current.length} SKU(s)`);
  if (willTouchPipedrive) console.log(`  Pipedrive: ${pdProducts.length} existing product(s)`);

  // 3. Compute change sets + preview.
  console.log("\nStep 3: Computing change set...");
  const portal =
    args.target === "pipedrive"
      ? { newRows: [], updatedRows: [], flaggedRemoval: [] }
      : computePortalChanges(sheetRows, current);
  const pipedrivePreview = willTouchPipedrive
    ? computePipedriveChanges(
        args.target === "all" ? projectCurrentAsOfToday(current, portal, args.effectiveDate) : current,
        pdProducts,
      )
    : null;
  printPreview(portal, pipedrivePreview, args);

  if (args.dryRun) {
    console.log("\n[DRY RUN] No writes performed.");
    process.exit(0);
  }

  // 4. Confirm.
  const confirmed = await promptConfirm();
  if (!confirmed) {
    console.log("Cancelled. No changes made.");
    process.exit(0);
  }

  // 5. Push.
  console.log("\nStep 4: Pushing...");
  let totalErrors = 0;

  if (args.target === "portal" || args.target === "all") {
    console.log("  → Portal: inserting versioned rows...");
    const res = await pushPortalRows(admin, portal, current, args.effectiveDate);
    if (res.errors.length > 0) {
      console.error("  Portal errors:");
      for (const e of res.errors) console.error(`    ${e}`);
    } else {
      console.log(`  ✓ Portal: ${res.successCount} versioned row(s) written (effective ${args.effectiveDate})`);
    }
    totalErrors += res.errors.length;
  }

  if (args.target === "pipedrive" || args.target === "all") {
    // Re-resolve current-as-of-today so a target=all run picks up rows just
    // inserted with today's effective date.
    const currentForPd = await fetchCurrentProducts(admin);
    const pdChanges = computePipedriveChanges(currentForPd, pdProducts);
    console.log("  → Pipedrive: pushing current-as-of-today prices...");
    const res = await pushPipedrive(admin, pdChanges);
    if (res.errors.length > 0) {
      console.error("  Pipedrive errors:");
      for (const e of res.errors) console.error(`    ${e}`);
    }
    if (res.stampErrors.length > 0) {
      console.error("  Stamp errors:");
      for (const e of res.stampErrors) console.error(`    ${e}`);
    }
    if (res.errors.length === 0 && res.stampErrors.length === 0) {
      console.log(`  ✓ Pipedrive: ${res.successCount} product(s) pushed, ${res.archivedCount} archived + stamped`);
    }
    totalErrors += res.errors.length + res.stampErrors.length;
  }

  console.log(`\n=== Complete (${totalErrors} error(s)) ===`);
  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("push-prices failed:", err);
  process.exit(1);
});
