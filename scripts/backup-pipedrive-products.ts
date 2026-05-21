// Dump current Pipedrive Products to JSON. Run before scripts/push-prices.ts.
// Pairs with the Supabase backup-tables.ts pattern for free-plan rollback.
//
// Run: node --env-file=.env.local --import tsx scripts/backup-pipedrive-products.ts

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { env } from "../src/lib/env";

const PD_BASE = "https://api.pipedrive.com/v1";

type PdProduct = {
  id: number;
  name: string;
  code: string | null;
  prices: Array<{ price: number; currency: string }>;
  active_flag: boolean;
};

async function fetchAllProducts(): Promise<PdProduct[]> {
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
      additional_data?: { pagination?: { more_items_in_collection?: boolean; next_start?: number } };
    };
    if (!json.success) throw new Error(`Pipedrive GET /products: ${json.error}`);
    const items = json.data ?? [];
    out.push(...items);
    console.log(`  fetched ${items.length} product(s) (start=${start})`);
    if (!json.additional_data?.pagination?.more_items_in_collection) break;
    start = json.additional_data.pagination.next_start ?? start + 100;
  }
  return out;
}

async function main() {
  console.log("=== Pipedrive Products backup ===\n");

  const products = await fetchAllProducts();
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
