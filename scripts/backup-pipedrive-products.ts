// Dump current Pipedrive Products to JSON. Run before scripts/push-prices.ts.
// Pairs with the Supabase backup-tables.ts pattern for free-plan rollback.
//
// Reads GET /api/v2/products (the v1 list is out of support since 2026-08-01).
// Each product keeps its full v2 shape, including `is_linkable` (whether it is
// on the deal picker). Deleted products are not returned by Pipedrive at all,
// so comparing two backups by id is how a deletion shows up.
//
// Run: node --env-file=.env.local --import tsx scripts/backup-pipedrive-products.ts

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { env } from "../src/lib/env";
import { listPipedriveProducts } from "../src/lib/pipedrive/product-api";

async function main() {
  console.log("=== Pipedrive Products backup ===\n");

  const products = await listPipedriveProducts(env.PIPEDRIVE_API_TOKEN);
  console.log(`\n[OK] Total: ${products.length} product(s)`);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `pipedrive-products-pre-step-5-${timestamp}.json`;
  const outDir = resolve(process.cwd(), "backups");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, filename);

  writeFileSync(outPath, JSON.stringify({ meta: { timestamp, count: products.length }, products }, null, 2), "utf8");
  console.log(`\nBackup written to: ${outPath}`);
}

main().catch((err) => {
  console.error("backup-pipedrive-products failed:", err);
  process.exit(1);
});
