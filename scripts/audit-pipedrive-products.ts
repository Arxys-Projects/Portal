// Read-only audit of the Pipedrive product catalog against current_products.
// Makes NO writes anywhere. Run it before a price push, or whenever the
// push-prices preview stops on a duplicate code.
//
// Lists, using the same rules as scripts/push-prices.ts (src/lib/pipedrive/product-sync.ts):
//   * portal SKUs whose code two or more Pipedrive products share (these block
//     the price push), with the deals each product sits on, to decide which to keep
//   * what the next --target=pipedrive run would create, update, and retire
//   * portal SKUs whose product is $0, [MKT] or [CFQ] in Pipedrive
//   * VX5 products in the newest backups/pipedrive-products-*.json that Pipedrive
//     no longer returns (deleted; v1 active_flag=false did this, ADR 0150)
//   * duplicated codes that are not portal SKUs (legacy; reported only)
//
// Run: node --env-file=.env.local --import tsx scripts/audit-pipedrive-products.ts

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { env } from "../src/lib/env";
import { listPipedriveProducts } from "../src/lib/pipedrive/product-api";
import {
  computePipedriveChanges,
  pdName,
  pdPrice,
  usdPrice,
  type PdProduct,
  type SyncProduct,
} from "../src/lib/pipedrive/product-sync";

type CurrentRow = SyncProduct & { hidden_from_catalog: boolean };

function money(n: number | null): string {
  return n == null ? "no USD price" : `$${n.toLocaleString("en-US")}`;
}

function describe(p: PdProduct): string {
  return `#${p.id} ${p.is_linkable ? "linkable" : "NOT linkable"} ${money(usdPrice(p))} "${p.name}"`;
}

// GET /v1/products/{id}/deals — still in the v1 reference. Read-only; a failure
// degrades to "unknown" rather than stopping the audit.
async function dealsForProduct(id: number): Promise<string> {
  const url = new URL(`https://api.pipedrive.com/v1/products/${id}/deals`);
  url.searchParams.set("api_token", env.PIPEDRIVE_API_TOKEN);
  url.searchParams.set("status", "all_not_deleted");
  url.searchParams.set("limit", "500");
  try {
    const res = await fetch(url.toString());
    const json = (await res.json()) as { success: boolean; data: Array<{ id: number; status: string }> | null };
    if (!res.ok || !json.success) return `deals unknown (${res.status})`;
    const deals = json.data ?? [];
    if (deals.length === 0) return "on no deals";
    return `on ${deals.length} deal(s): ${deals.map((d) => `${d.id} ${d.status}`).join(", ")}`;
  } catch {
    return "deals unknown (network)";
  }
}

function newestBackup(): { file: string; products: PdProduct[] } | null {
  const dir = resolve(process.cwd(), "backups");
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => /^pipedrive-products-.*\.json$/.test(f)).sort();
  } catch {
    return null;
  }
  const file = files.at(-1);
  if (!file) return null;
  const parsed = JSON.parse(readFileSync(resolve(dir, file), "utf8")) as { products?: PdProduct[] };
  return { file, products: parsed.products ?? [] };
}

async function main() {
  console.log("=== Pipedrive product catalog audit (read-only) ===\n");

  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin
    .from("current_products")
    .select("id, sku, product_name, msrp, price_type, active, hidden_from_catalog");
  if (error) throw new Error(`current_products: ${error.message}`);
  const current = (data ?? []) as CurrentRow[];
  const products = await listPipedriveProducts(env.PIPEDRIVE_API_TOKEN);
  console.log(`current_products: ${current.length} SKU(s). Pipedrive: ${products.length} product(s), ` +
    `${products.filter((p) => !p.is_linkable).length} not linkable.\n`);

  const changes = computePipedriveChanges(current, products);

  console.log(`[1] Portal SKUs with a duplicated code (block the price push): ${changes.blockingDuplicates.length}`);
  for (const { code, products: dupes } of changes.blockingDuplicates) {
    const sku = current.find((c) => c.sku === code)!;
    console.log(`  ${code}  portal: ${sku.active ? "active" : "inactive"}, ` +
      `${money(pdPrice(sku.price_type, sku.msrp))}, "${pdName(sku.product_name, sku.price_type)}"`);
    for (const p of dupes) console.log(`    ${describe(p)}  ${await dealsForProduct(p.id)}`);
  }

  console.log(`\n[2] Next --target=pipedrive run would:`);
  console.log(`  create ${changes.newInPd.length}: ${changes.newInPd.map((c) => c.sku).join(", ") || "-"}`);
  console.log(`  update ${changes.updatedInPd.length}:`);
  for (const u of changes.updatedInPd) {
    console.log(`    ${u.cur.sku}  ${describe(u.product)}  → ${money(pdPrice(u.cur.price_type, u.cur.msrp))} (${u.reasons.join(", ")})`);
  }
  console.log(`  retire ${changes.retireInPd.length}:`);
  for (const r of changes.retireInPd) console.log(`    ${r.cur.sku}  ${describe(r.product)}`);

  console.log(`\n[3] Portal SKUs whose Pipedrive product is $0, [MKT] or [CFQ]:`);
  const bySku = new Map(products.filter((p) => p.code).map((p) => [p.code as string, p]));
  for (const c of current) {
    const p = bySku.get(c.sku);
    if (!p) continue;
    const price = usdPrice(p);
    if (!price || /^\[(MKT|CFQ)\]/.test(p.name)) {
      console.log(`  ${c.sku} (portal ${c.active ? "active" : "inactive"}${c.hidden_from_catalog ? ", hidden" : ""})  ${describe(p)}`);
    }
  }

  const backup = newestBackup();
  console.log(`\n[4] VX5 products in the newest backup that Pipedrive no longer returns:`);
  if (!backup) {
    console.log("  no backups/pipedrive-products-*.json found");
  } else {
    const liveIds = new Set(products.map((p) => p.id));
    const gone = backup.products.filter((p) => (p.code ?? "").startsWith("VX5-") && !liveIds.has(p.id));
    console.log(`  backup: ${backup.file} (${backup.products.length} products)`);
    for (const p of gone) console.log(`  #${p.id} ${p.code} "${p.name}"`);
    if (gone.length === 0) console.log("  none");
  }

  console.log(`\n[5] Duplicated codes that are not portal SKUs (not touched by the price push): ${changes.otherDuplicates.length}`);
  for (const { code, products: dupes } of changes.otherDuplicates) {
    console.log(`  ${code}: ${dupes.map((p) => `#${p.id}${p.is_linkable ? "" : " (not linkable)"}`).join(", ")}`);
  }

  console.log("\nNo writes performed.");
}

main().catch((err) => {
  console.error("audit-pipedrive-products failed:", err);
  process.exit(1);
});
