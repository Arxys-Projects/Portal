// Push the Arxys Master Sheet (Google Sheets CSV) to Supabase products and
// Pipedrive Products. Shows a full change preview and requires typing CONFIRM
// before writing anything.
//
// Run:         node --env-file=.env.local --import tsx scripts/push-prices.ts
// Dry-run:     node --env-file=.env.local --import tsx scripts/push-prices.ts --dry-run
//
// Prerequisites:
//   1. Run scripts/backup-tables.ts pre-step-5-6-real-pricing
//   2. Run scripts/backup-pipedrive-products.ts
//
// Capacity preservation: max_cameras + max_storage_tb on the 6 V-family seed
// rows must not be clobbered by this UPSERT. The script reads existing Supabase
// products first and carries those values forward in the UPSERT payload.
// Non-V-family rows that have null capacity stay null — the calculator's product
// query filters to `not('max_cameras', 'is', null)` so they're never recommended.

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

type SheetRow = {
  sku: string;
  productName: string;
  msrpRaw: string;
  priceType: PriceType;
  productGroup: string;
  sortOrder: number;
};

type SupabaseProduct = {
  sku: string;
  product_name: string;
  msrp: number | null;
  price_type: PriceType;
  product_group: string;
  sort_order: number;
  active: boolean;
  max_cameras: number | null;
  max_storage_tb: number | null;
};

type PdProduct = {
  id: number;
  name: string;
  code: string | null;
  prices: Array<{ price: number; currency: string }>;
};

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

function pdName(row: SheetRow): string {
  if (row.priceType === "market") return `[MKT] ${row.productName}`;
  if (row.priceType === "call_for_quote") return `[CFQ] ${row.productName}`;
  return row.productName;
}

function pdPrice(row: SheetRow): number {
  return row.priceType === "numeric" ? Number(row.msrpRaw) : 0;
}

function fmt(n: number): string {
  return "$" + n.toLocaleString("en-US");
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

async function fetchSupabaseProducts(
  admin: SupabaseClient,
): Promise<SupabaseProduct[]> {
  const { data, error } = await admin.from("products").select("*");
  if (error) throw new Error(`Supabase select failed: ${error.message}`);
  return (data ?? []) as SupabaseProduct[];
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
// Change set
// ---------------------------------------------------------------------------

type ChangeSet = {
  newInSupabase: SheetRow[];
  updatedInSupabase: SheetRow[];
  flaggedForRemovalSupabase: SupabaseProduct[];
  newInPipedrive: SheetRow[];
  updatedInPipedrive: Array<{ row: SheetRow; id: number }>;
  flaggedForRemovalPipedrive: PdProduct[];
};

function computeChangeSet(
  sheetRows: SheetRow[],
  sbProducts: SupabaseProduct[],
  pdProducts: PdProduct[],
): ChangeSet {
  const sheetSkus = new Set(sheetRows.map((r) => r.sku));
  const sbBysku = new Map(sbProducts.map((p) => [p.sku, p]));
  const pdByCode = new Map(
    pdProducts.filter((p) => p.code).map((p) => [p.code!, p]),
  );

  const newInSupabase: SheetRow[] = [];
  const updatedInSupabase: SheetRow[] = [];
  const newInPipedrive: SheetRow[] = [];
  const updatedInPipedrive: Array<{ row: SheetRow; id: number }> = [];

  for (const row of sheetRows) {
    const sbExisting = sbBysku.get(row.sku);
    if (!sbExisting) {
      newInSupabase.push(row);
    } else {
      const expectedMsrp = row.priceType === "numeric" ? Number(row.msrpRaw) : null;
      const sbDiffers =
        sbExisting.product_name !== row.productName ||
        sbExisting.msrp !== expectedMsrp ||
        sbExisting.product_group !== row.productGroup ||
        sbExisting.price_type !== row.priceType;
      if (sbDiffers) updatedInSupabase.push(row);
    }

    const pdExisting = pdByCode.get(row.sku);
    if (!pdExisting) {
      newInPipedrive.push(row);
    } else {
      const existingPrice = pdExisting.prices?.[0]?.price ?? null;
      const pdDiffers =
        pdExisting.name !== pdName(row) || existingPrice !== pdPrice(row);
      if (pdDiffers) updatedInPipedrive.push({ row, id: pdExisting.id });
    }
  }

  const flaggedForRemovalSupabase = sbProducts.filter((p) => !sheetSkus.has(p.sku));
  const flaggedForRemovalPipedrive = pdProducts.filter(
    (p) => p.code && !sheetSkus.has(p.code),
  );

  return {
    newInSupabase,
    updatedInSupabase,
    flaggedForRemovalSupabase,
    newInPipedrive,
    updatedInPipedrive,
    flaggedForRemovalPipedrive,
  };
}

// ---------------------------------------------------------------------------
// Preview printer
// ---------------------------------------------------------------------------

function printPreview(cs: ChangeSet): void {
  console.log("\n=== Change preview ===\n");

  console.log(`Supabase:`);
  console.log(`  New:              ${cs.newInSupabase.length} row(s)`);
  console.log(`  Updated:          ${cs.updatedInSupabase.length} row(s)`);
  console.log(`  Flagged removal:  ${cs.flaggedForRemovalSupabase.length} row(s)`);

  console.log(`\nPipedrive:`);
  console.log(`  New:              ${cs.newInPipedrive.length} product(s)`);
  console.log(`  Updated:          ${cs.updatedInPipedrive.length} product(s)`);
  console.log(`  Flagged removal:  ${cs.flaggedForRemovalPipedrive.length} product(s)`);

  if (cs.newInSupabase.length > 0) {
    console.log(`\n[Supabase NEW]`);
    for (const r of cs.newInSupabase) {
      const price =
        r.priceType === "numeric" ? fmt(Number(r.msrpRaw)) : r.msrpRaw || "MKT";
      console.log(`  + ${r.sku}  ${r.productName}  ${price}`);
    }
  }

  if (cs.updatedInSupabase.length > 0) {
    console.log(`\n[Supabase UPDATED]`);
    for (const r of cs.updatedInSupabase) {
      const price =
        r.priceType === "numeric" ? fmt(Number(r.msrpRaw)) : r.msrpRaw || "MKT";
      console.log(`  ~ ${r.sku}  ${r.productName}  ${price}`);
    }
  }

  if (cs.flaggedForRemovalSupabase.length > 0) {
    console.log(`\n[Supabase FLAGGED FOR REMOVAL — not touched automatically]`);
    for (const p of cs.flaggedForRemovalSupabase) {
      console.log(`  ? ${p.sku}  ${p.product_name}`);
    }
  }

  if (cs.newInPipedrive.length > 0) {
    console.log(`\n[Pipedrive NEW]`);
    for (const r of cs.newInPipedrive) {
      console.log(`  + ${r.sku}  ${pdName(r)}  ${r.priceType === "numeric" ? fmt(pdPrice(r)) : pdPrice(r)}`);
    }
  }

  if (cs.updatedInPipedrive.length > 0) {
    console.log(`\n[Pipedrive UPDATED]`);
    for (const { row } of cs.updatedInPipedrive) {
      console.log(`  ~ ${row.sku}  ${pdName(row)}  ${row.priceType === "numeric" ? fmt(pdPrice(row)) : pdPrice(row)}`);
    }
  }

  if (cs.flaggedForRemovalPipedrive.length > 0) {
    console.log(`\n[Pipedrive FLAGGED FOR REMOVAL — not touched automatically]`);
    for (const p of cs.flaggedForRemovalPipedrive) {
      console.log(`  ? ${p.code}  ${p.name}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

async function promptConfirm(): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout });
    rl.question(
      '\nReview the changes above. Type CONFIRM to push or CANCEL to exit: ',
      (answer) => {
        rl.close();
        resolve(answer.trim() === "CONFIRM");
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

async function pushToSupabase(
  admin: SupabaseClient,
  sheetRows: SheetRow[],
  existingProducts: SupabaseProduct[],
): Promise<{ successCount: number; errors: string[] }> {
  const existingBysku = new Map(existingProducts.map((p) => [p.sku, p]));
  const timestamp = new Date().toISOString();

  const upsertRows = sheetRows.map((r) => {
    const existing = existingBysku.get(r.sku);
    return {
      sku: r.sku,
      product_name: r.productName,
      msrp: r.priceType === "numeric" ? Number(r.msrpRaw) : null,
      price_type: r.priceType,
      product_group: r.productGroup,
      sort_order: r.sortOrder,
      active: true,
      max_cameras: existing?.max_cameras ?? null,
      max_storage_tb: existing?.max_storage_tb ?? null,
      updated_at: timestamp,
    };
  });

  const errors: string[] = [];
  let successCount = 0;
  const CHUNK = 100;

  for (let i = 0; i < upsertRows.length; i += CHUNK) {
    const chunk = upsertRows.slice(i, i + CHUNK);
    // Supabase untyped client (no Database generic) resolves upsert values as
    // `never` for literal table names. Escape via double assertion — the runtime
    // type is correct; only the TypeScript inference is wrong here.
    const { error } = await admin
      .from("products")
      .upsert(chunk as unknown as never[], { onConflict: "sku" });
    if (error) {
      errors.push(`Supabase upsert chunk ${i}-${i + chunk.length}: ${error.message}`);
    } else {
      successCount += chunk.length;
    }
  }

  return { successCount, errors };
}

async function pushToPipedrive(
  sheetRows: SheetRow[],
  existingPd: PdProduct[],
): Promise<{ successCount: number; errors: string[] }> {
  const pdByCode = new Map(
    existingPd.filter((p) => p.code).map((p) => [p.code!, p]),
  );
  const errors: string[] = [];
  let successCount = 0;

  for (const row of sheetRows) {
    const payload = {
      name: pdName(row),
      code: row.sku,
      prices: [{ price: pdPrice(row), currency: "USD" }],
      active_flag: true,
    };

    const existing = pdByCode.get(row.sku);
    try {
      if (existing) {
        await pdPut(`/products/${existing.id}`, payload);
      } else {
        await pdPost("/products", payload);
      }
      successCount++;
    } catch (err) {
      errors.push(`${row.sku}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { successCount, errors };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  if (isDryRun) {
    console.log("=== push-prices.ts [DRY RUN] ===\n");
  } else {
    console.log("=== push-prices.ts ===\n");
  }

  // 1. Validate the sheet
  console.log("Step 1/4: Validating master sheet...");
  const { violations, rowCount } = await validateSheet();
  if (violations.length > 0) {
    console.error(`\n${violations.length} validation violation(s) — fix before pushing:`);
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }
  console.log(`Sheet valid. ${rowCount} data row(s).\n`);

  // 2. Fetch data
  console.log("Step 2/4: Fetching sheet rows, Supabase products, Pipedrive products...");

  const sheetRows = await fetchSheetRows();

  // Extra check: product names must be non-empty
  const emptyNames = sheetRows.filter((r) => r.productName === "");
  if (emptyNames.length > 0) {
    console.error(`${emptyNames.length} row(s) with empty product name:`);
    for (const r of emptyNames) console.error(`  - ${r.sku}`);
    process.exit(1);
  }

  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [sbProducts, pdProducts] = await Promise.all([
    fetchSupabaseProducts(admin),
    fetchPdProducts(),
  ]);

  console.log(`  Sheet: ${sheetRows.length} row(s)`);
  console.log(`  Supabase: ${sbProducts.length} existing product(s)`);
  console.log(`  Pipedrive: ${pdProducts.length} existing product(s)`);

  // 3. Compute change set + print preview
  console.log("\nStep 3/4: Computing change set...");
  const cs = computeChangeSet(sheetRows, sbProducts, pdProducts);
  printPreview(cs);

  if (isDryRun) {
    console.log("\n[DRY RUN] No writes performed.");
    process.exit(0);
  }

  // 4. Confirm
  const confirmed = await promptConfirm();
  if (!confirmed) {
    console.log("Cancelled. No changes made.");
    process.exit(0);
  }

  // 5. Push
  console.log("\nStep 4/4: Pushing...");

  console.log("  → Supabase UPSERT...");
  const sbResult = await pushToSupabase(admin, sheetRows, sbProducts);
  if (sbResult.errors.length > 0) {
    console.error(`  Supabase errors:`);
    for (const e of sbResult.errors) console.error(`    ${e}`);
  } else {
    console.log(`  ✓ Supabase: ${sbResult.successCount} row(s) upserted`);
  }

  console.log("  → Pipedrive UPSERT...");
  const pdResult = await pushToPipedrive(sheetRows, pdProducts);
  if (pdResult.errors.length > 0) {
    console.error(`  Pipedrive errors:`);
    for (const e of pdResult.errors) console.error(`    ${e}`);
  } else {
    console.log(`  ✓ Pipedrive: ${pdResult.successCount} product(s) upserted`);
  }

  const totalErrors = sbResult.errors.length + pdResult.errors.length;
  console.log(`\n=== Complete ===`);
  console.log(`Supabase: ${sbResult.successCount} ok, ${sbResult.errors.length} error(s)`);
  console.log(`Pipedrive: ${pdResult.successCount} ok, ${pdResult.errors.length} error(s)`);

  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("push-prices failed:", err);
  process.exit(1);
});
