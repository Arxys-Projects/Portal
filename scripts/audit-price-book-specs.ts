// Price Book product pages vs live product_specs: a read-only drift audit.
//
//   node --env-file=.env.local --import tsx scripts/audit-price-book-specs.ts
//
// For each of the seven product_specs families (V100 to V800) this prints the
// authored families.ts values, the live canonical-row values, and the drift
// between them. It also records the evidence for the brief's gotchas: the V400
// RAID basis (G2), hidden -NCD rows in the datasheet's model groups (G3), the
// CPU twin columns (G6) and the adjacent copy drift (G10).
//
// READ ONLY. One PostgREST GET per table with the service key, the same pattern
// as scripts/render-datasheet.ts. Nothing here writes.
//
// Relative imports and a plain .ts entry, for the reason render-datasheet.ts
// gives: tsx loads .ts as CJS, and src/lib/datasheet/load.ts carries
// `server-only`, which throws under plain Node.

import { FAMILIES, type Family } from "../src/lib/price-book/families";
import {
  buildLedgerContent,
  canonicalRow,
  groupByModel,
  type ProductSpecRow,
} from "../src/lib/datasheet/from-product-specs";
import { VMS_VALIDATED } from "../src/lib/datasheet/copy";
import { availableCapacityTb, usableCapacityTb } from "../src/lib/capacity-utils";

const MODELS = ["V100", "V200", "V400", "V500", "V600", "V700", "V800"] as const;

/** Every column this audit reads, including the ones the adapter's type omits. */
type LiveRow = ProductSpecRow & {
  gbe_1_ports: number | null;
  cpu_cores_threads: string | null;
  cpu_model: string | null;
  os: string | null;
  warranty: string | null;
  vms_certified: string | null;
};

type ProductRow = {
  sku: string;
  product_group: string;
  hidden_from_catalog: boolean;
  active: boolean;
};

async function fetchLive(): Promise<{ specs: LiveRow[]; products: ProductRow[] }> {
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
  const groups = MODELS.join(",");
  const [specs, products] = await Promise.all([
    get("product_specs?select=*&order=id"),
    get(
      `current_products?select=sku,product_group,hidden_from_catalog,active` +
        `&product_group=in.(${groups})&order=sort_order`,
    ),
  ]);
  return { specs, products };
}

const h = (title: string) => console.log(`\n## ${title}\n`);
const show = (v: unknown) => (v === null || v === undefined ? "∅" : JSON.stringify(v));

/** The SKUs the family page lists: same filter as [slug]/page.tsx. */
function visibleSkus(family: Family, products: ProductRow[]): Set<string> {
  return new Set(
    products
      .filter((p) => family.productGroups.includes(p.product_group))
      .filter((p) => p.active && !p.hidden_from_catalog)
      .map((p) => p.sku),
  );
}

const COLUMNS: (keyof LiveRow)[] = [
  "max_cameras_h265",
  "max_bandwidth_mbps",
  "warranty_years",
  "warranty_terms",
  "warranty",
  "os_edition",
  "os",
  "hdd_count",
  "drive_bays",
  "raid_level_display",
  "raid_level_alt_display",
  "raid_support",
  "battery_raid",
  "rack_units",
  "form_factor",
  "cpu_model_full",
  "cpu_model",
  "cores_threads",
  "cpu_cores_threads",
  "ram_spec",
  "os_drive_desc",
  "os_ssd_type",
  "os_redundancy",
  "gbe_10_ports",
  "gbe_1_ports",
  "network",
  "sfp_addon",
  "remote_mgmt",
  "hotswap_power",
  "power_redundancy",
  "power_wattage",
  "vms_certified",
];

/** Columns whose value differs between a model's visible SKUs. */
function perSkuDifferences(rows: LiveRow[]): string[] {
  const out: string[] = [];
  for (const key of Object.keys(rows[0]) as (keyof LiveRow)[]) {
    if (["id", "model_name", "storage_raw_tb", "updated_at", "updated_by", "product_sku"].includes(key)) continue;
    const values = new Set(rows.map((r) => JSON.stringify(r[key] ?? null)));
    if (values.size > 1) {
      out.push(`${key}: ${rows.map((r) => `${r.id}=${show(r[key])}`).join(" | ")}`);
    }
  }
  return out;
}

function capacityLine(row: LiveRow, level: string | null): string {
  const usable = usableCapacityTb(row.storage_raw_tb, row.hdd_count, level);
  if (usable == null) return "∅";
  const available = availableCapacityTb(usable);
  return `${Math.round(usable * 10) / 10} TB (${available == null ? "∅" : Math.round(available * 10) / 10} TB available)`;
}

async function main(): Promise<void> {
  const { specs, products } = await fetchLive();
  const allGroups = groupByModel(specs);

  console.log(`# Price Book spec drift audit, live rows read ${new Date().toISOString()}`);
  console.log(`product_specs rows: ${specs.length}; visible-filter source: current_products`);

  for (const model of MODELS) {
    const family = FAMILIES.find((f) => f.productGroups.includes(model) && f.productGroups.length === 1);
    if (!family) throw new Error(`no family for ${model}`);
    const visible = visibleSkus(family, products);
    const visibleRows = specs.filter((r) => visible.has(r.id));
    const visibleGroup = groupByModel(visibleRows).get(model) ?? [];
    const allGroup = allGroups.get(model) ?? [];

    h(`${model} (/price-book/${family.slug})`);
    console.log(`visible SKUs: ${[...visible].join(", ")}`);
    console.log(`all product_specs rows in datasheet group: ${allGroup.map((r) => r.id).join(", ")}`);
    if (visibleGroup.length === 0) {
      console.log("!! no visible rows");
      continue;
    }
    const canon = canonicalRow(visibleGroup) as LiveRow;
    const canonAll = canonicalRow(allGroup) as LiveRow;
    console.log(`canonical row (visible): ${canon.id}; canonical row (datasheet, all rows): ${canonAll.id}`);

    console.log("\n### Authored (families.ts)");
    for (const k of family.kpis) console.log(`kpi  ${k.label}: ${k.value} ${k.unit}`);
    for (const f of family.keyFeatures) console.log(`feat ${f}`);
    for (const s of family.technicalSpecs) console.log(`tech ${s}`);

    console.log("\n### Live canonical row");
    for (const col of COLUMNS) console.log(`${String(col).padEnd(22)} ${show(canon[col])}`);

    const diffs = perSkuDifferences(visibleGroup as LiveRow[]);
    console.log("\n### Columns that differ across the visible SKUs");
    console.log(diffs.length === 0 ? "(none)" : diffs.join("\n"));

    const ncdDiffs = allGroup.length !== visibleGroup.length
      ? perSkuDifferences(allGroup as LiveRow[]).filter((d) => d.includes("-NCD"))
      : [];
    if (allGroup.length !== visibleGroup.length) {
      console.log("\n### Columns that differ once hidden rows are included");
      console.log(ncdDiffs.length === 0 ? "(none)" : ncdDiffs.join("\n"));
    }

    console.log("\n### Net usable, per visible SKU");
    for (const row of visibleGroup as LiveRow[]) {
      const override = family.skuExtraData?.[row.id]?.netStorage ?? null;
      const live = capacityLine(row, row.raid_level_display);
      const alt = row.raid_level_alt_display ? ` | alt ${row.raid_level_alt_display}: ${capacityLine(row, row.raid_level_alt_display)}` : "";
      console.log(
        `${row.id.padEnd(16)} raw ${row.storage_raw_tb} × ${row.hdd_count} drives, level ${show(row.raid_level_display)}` +
          ` | override ${show(override)} | computed ${live}${alt}`,
      );
      if (model === "V400") {
        console.log(
          `${"".padEnd(16)} G2: as RAID 5 ${capacityLine(row, "5")} | as RAID 6 ${capacityLine(row, "6")}`,
        );
      }
    }

    console.log("\n### Datasheet (all rows, as /api/datasheet renders today)");
    const sheet = buildLedgerContent(model, specs);
    for (const kv of sheet.headline) console.log(`headline ${kv.key}: ${kv.value}`);
    console.log(`orderable rows: ${sheet.orderable.rows.map((r) => r.join(" / ")).join(" ; ")}`);
    console.log(`orderable caption: ${sheet.orderable.caption}`);
    for (const a of sheet.attributes) console.log(`attr ${a}`);
    for (const r of sheet.hardware) console.log(`hw   ${r.label}: ${r.value}`);
    const env = sheet.environmental.find((r) => r.label === "Power");
    if (env) console.log(`env  Power: ${env.value}`);
    console.log(`warranty: ${sheet.warranty ? `${sheet.warranty.years} / ${sheet.warranty.title} / ${sheet.warranty.body}` : "∅"}`);
  }

  h("G6 CPU twin columns");
  for (const r of specs as LiveRow[]) {
    const fromFull = /(\d+)\/(\d+)\s*Core/i.exec(r.cpu_model_full ?? "");
    const full = fromFull ? `${fromFull[1]}C/${fromFull[2]}T` : "?";
    const agree = full === r.cores_threads && full === r.cpu_cores_threads;
    console.log(
      `${r.id.padEnd(18)} full=${show(r.cpu_model_full)} cores_threads=${show(r.cores_threads)} cpu_cores_threads=${show(r.cpu_cores_threads)} cpu_model=${show(r.cpu_model)}${agree ? "" : "  <-- disagree"}`,
    );
  }

  h("G10 VMS lists");
  console.log(`copy.VMS_VALIDATED (datasheet): ${VMS_VALIDATED.join(", ")}`);
  console.log("[slug]/page.tsx compliance strip: Milestone, Avigilon, Genetec, NXWitness, Hanwha, Exacq, Axxonsoft");
  console.log("price-book/page.tsx Enterprise Grade box: Milestone, Avigilon, Genetec, NXWitness, Hanwha, Exacq, Axxonsoft");
  const vms = new Map<string, string[]>();
  for (const r of specs as LiveRow[]) {
    const key = r.vms_certified ?? "∅";
    vms.set(key, [...(vms.get(key) ?? []), r.id]);
  }
  for (const [value, ids] of vms) console.log(`product_specs.vms_certified ${show(value)}: ${ids.join(", ")}`);

  h("G10 warranty columns");
  const warranty = new Map<string, string[]>();
  for (const r of specs as LiveRow[]) {
    const key = `years=${show(r.warranty_years)} terms=${show(r.warranty_terms)} legacy=${show(r.warranty)}`;
    warranty.set(key, [...(warranty.get(key) ?? []), r.id]);
  }
  for (const [value, ids] of warranty) console.log(`${value}\n    ${ids.join(", ")}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
