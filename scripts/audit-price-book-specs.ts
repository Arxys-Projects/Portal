// Price Book product pages vs their live datasheets: a read-only drift check.
//
//   node --env-file=.env.local --import tsx scripts/audit-price-book-specs.ts
//
// For each product_specs family (V100 to V800) this rebuilds, from live rows,
// what /price-book/{slug} renders (hero stats, Key Features, Technical Specs and
// the SKU table's net-usable column) and what /api/datasheet/{model} renders,
// then compares the facts both print. Exits non-zero on any mismatch, or when a
// family has no rows to derive from.
//
// The page is built the way the page builds it: only SKUs listed in
// current_products with hidden_from_catalog = false. The datasheet is built the
// way the route builds it: every product_specs row. So a hidden -NCD copy that
// drifts from its visible twin shows up here as a mismatch (see the 2026-10-09
// audit, docs/audits/price-book-spec-drift-audit.md, finding G3).
//
// READ ONLY. One PostgREST GET per table with the service key, the same pattern
// as scripts/render-datasheet.ts. Nothing here writes.
//
// Relative imports and a plain .ts entry, for the reason render-datasheet.ts
// gives: tsx loads .ts as CJS, and src/lib/datasheet/load.ts carries
// `server-only`, which throws under plain Node.

import { FAMILIES } from "../src/lib/price-book/families";
import { cellValue, type ProductRow } from "../src/lib/price-book/cell-value";
import {
  datasheetMismatches,
  resolveFamilyDisplay,
  type FamilySpecRow,
} from "../src/lib/price-book/family-specs";
import { buildLedgerContent, canonicalRow, groupByModel } from "../src/lib/datasheet/from-product-specs";

type ListedProduct = ProductRow & { product_group: string };

async function fetchLive(groups: string[]): Promise<{ specs: FamilySpecRow[]; products: ListedProduct[] }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("need SUPABASE_URL + service key; run with node --env-file=.env.local");
  }
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const get = async (query: string) => {
    const res = await fetch(`${url}/rest/v1/${query}`, { headers });
    if (!res.ok) throw new Error(`${query} GET ${res.status}: ${await res.text()}`);
    return res.json();
  };
  // The page's own filter: active, not hidden, in sort order.
  const [specs, products] = await Promise.all([
    get("product_specs?select=*&order=id"),
    get(
      `current_products?select=sku,product_name,msrp,price_type,product_group` +
        `&product_group=in.(${groups.join(",")})&active=eq.true&hidden_from_catalog=eq.false&order=sort_order`,
    ),
  ]);
  return { specs, products };
}

async function main(): Promise<void> {
  const families = FAMILIES.filter((f) => f.specSource === "product_specs");
  const { specs, products } = await fetchLive(families.flatMap((f) => f.productGroups));
  const datasheetGroups = groupByModel(specs);
  let failures = 0;

  console.log(`# Price Book vs datasheet, live rows read ${new Date().toISOString()}`);

  for (const family of families) {
    const model = family.productGroups[0];
    const listed = products.filter((p) => p.product_group === model);
    const listedSkus = new Set(listed.map((p) => p.sku));
    const pageRows = specs.filter((s) => listedSkus.has(s.id));
    const page = resolveFamilyDisplay(family, pageRows);

    console.log(`\n## ${model}  /price-book/${family.slug}`);
    if (page.sourceSku === null) {
      console.log(`!! no product_specs rows for the listed SKUs (${[...listedSkus].join(", ") || "none"})`);
      failures++;
      continue;
    }

    const sheetGroup = datasheetGroups.get(model) ?? [];
    const sheetRowId = sheetGroup.length > 0 ? canonicalRow(sheetGroup).id : "none";
    const hidden = sheetGroup.map((r) => r.id).filter((id) => !listedSkus.has(id));
    console.log(`page row ${page.sourceSku} · datasheet row ${sheetRowId}`);
    if (hidden.length > 0) console.log(`datasheet also reads unlisted rows: ${hidden.join(", ")}`);

    console.log(`hero  ${page.kpis.map((k) => `${k.label}: ${k.value} ${k.unit}`).join(" | ")}`);
    for (const b of page.keyFeatures) console.log(`feat  ${b}`);
    for (const b of page.technicalSpecs) console.log(`tech  ${b}`);

    const bySku = new Map(specs.map((s) => [s.id, s]));
    for (const product of listed) {
      const spec = bySku.get(product.sku);
      const cell = cellValue(
        "netStorage",
        product,
        spec && {
          storage_raw_tb: spec.storage_raw_tb == null ? null : Number(spec.storage_raw_tb),
          hdd_count: spec.hdd_count,
          raid_level_display: spec.raid_level_display,
          max_bandwidth_mbps: spec.max_bandwidth_mbps,
        },
        family.skuExtraData?.[product.sku],
      );
      console.log(`sku   ${product.sku.padEnd(16)} ${cell}`);
    }

    const mismatches = datasheetMismatches(page, buildLedgerContent(model, specs));
    if (mismatches.length === 0) {
      console.log("parity OK");
    } else {
      failures += mismatches.length;
      for (const m of mismatches) console.log(`!! ${m}`);
    }
  }

  console.log(`\n${failures === 0 ? "No" : failures} page-vs-datasheet mismatch${failures === 1 ? "" : "es"}.`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
