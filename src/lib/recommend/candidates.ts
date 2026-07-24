// Candidate-pool loader shared by the full calculator submit and the Quick
// Calc preview (ADR 0082). One query path so both tools size against exactly
// the same SKU pool.
//
// Capacity comes from product_specs, NOT the inline current_products columns
// (ADR 0094). product_specs carries complete camera + storage figures for all
// 21 rack SKUs; current_products.max_cameras / max_storage_tb are populated for
// only 6 of them — a residue of the original Step 3/4 six-SKU seed that the
// Master Sheet push never backfilled, because the Sheet has no capacity
// columns and push-prices.ts only carries existing values forward. Sizing off
// current_products therefore limited the pool to one capacity tier per family
// and made the whole V100 range unreachable. See the Phase 0 spec audit
// (datasheets/spec-source-audit-phase0.md §4.1).
//
// Storage is sized net-usable, never raw nameplate (ADR 0068), via
// usableCapacityTb() over storage_raw_tb + hdd_count + raid_level_display
// (ADR 0092 for the RAID 60 span math). product_specs.id IS the SKU, so the
// join to current_products.sku is done in-process.
import type { SupabaseClient } from "@supabase/supabase-js";
import { usableCapacityTb } from "@/lib/capacity-utils";
import type { ServerSpec } from "./types";

// Families the recommender may propose. The calculator sizes video surveillance
// only, so this is V200–V800: the V100 is a small-site/satellite value box that
// is quoted directly rather than sized, and access control (V150/V260/V265),
// management/directory (V250/V255) and workstations (SW*) are not video
// recorders. An allowlist rather than a blocklist, so a newly-seeded family
// cannot silently enter the pool and get recommended before anyone reviews it.
const RECOMMENDABLE_PRODUCT_GROUPS: ReadonlySet<string> = new Set([
  "V200",
  "V400",
  "V500",
  "V600",
  "V700",
  "V800",
]);

export type CandidatePool =
  | { status: "ok"; specs: ServerSpec[] }
  | { status: "db-error"; context: "load products" | "load product specs"; error: unknown }
  | { status: "empty" };

// The current_products slice supplying price and naming.
export type ProductPriceRow = {
  sku: string;
  product_name: string;
  product_group: string;
  msrp: number | string | null;
};

// The product_specs slice supplying capacity and RAID configuration.
export type SpecCapacityRow = {
  id: string;
  max_cameras: number | string | null;
  storage_raw_tb: number | string | null;
  hdd_count: number | string | null;
  raid_level_display: string | null;
};

/**
 * Pure pool assembly — kept free of Supabase so it is unit-testable on its own
 * (same split as cell-value.ts). Joins price rows to spec rows on sku == id,
 * drops anything outside RECOMMENDABLE_PRODUCT_GROUPS or missing a spec row,
 * and derives net-usable storage per unit.
 *
 * Callers are expected to have already filtered to active + numeric price.
 */
export function selectCandidates(
  productRows: readonly ProductPriceRow[],
  specRows: readonly SpecCapacityRow[],
): ServerSpec[] {
  const specBySku = new Map(specRows.map((row) => [row.id, row]));
  const specs: ServerSpec[] = [];

  for (const row of productRows) {
    if (!RECOMMENDABLE_PRODUCT_GROUPS.has(row.product_group)) continue;

    // No product_specs row means no capacity and no RAID configuration, so the
    // SKU cannot be sized on either dimension. Skipping is correct: guessing
    // from the raw nameplate would overstate usable storage and could
    // under-spec the recommendation.
    const spec = specBySku.get(row.sku);
    if (!spec || spec.max_cameras == null || spec.storage_raw_tb == null) continue;

    const rawTb = Number(spec.storage_raw_tb);
    const usableTb = usableCapacityTb(
      rawTb,
      spec.hdd_count == null ? null : Number(spec.hdd_count),
      spec.raid_level_display,
    );
    if (usableTb == null) continue;

    specs.push({
      sku: row.sku,
      productGroup: row.product_group,
      productName: row.product_name,
      maxCameras: Number(spec.max_cameras),
      maxStorageTb: rawTb,
      usableStorageTb: usableTb,
      msrp: Number(row.msrp),
      priceType: "numeric" as const,
    });
  }

  return specs;
}

export async function loadCandidateSpecs(
  supabase: SupabaseClient,
): Promise<CandidatePool> {
  // recommend() filters MKT/CFQ defensively but we also filter at the query
  // level to keep the candidate pool tight (Q4(a)). Price and product naming
  // stay with current_products — the versioned, effective-dated source of
  // truth for MSRP (ADR 0086).
  const { data: productRows, error: productError } = await supabase
    .from("current_products")
    .select("sku, product_name, product_group, msrp, price_type")
    .eq("active", true)
    .eq("price_type", "numeric")
    .order("sort_order");
  if (productError) {
    return { status: "db-error", context: "load products", error: productError };
  }
  if (!productRows || productRows.length === 0) {
    return { status: "empty" };
  }

  const { data: specRows, error: specError } = await supabase
    .from("product_specs")
    .select("id, max_cameras, storage_raw_tb, hdd_count, raid_level_display");
  if (specError) {
    return { status: "db-error", context: "load product specs", error: specError };
  }
  const specs = selectCandidates(
    productRows as unknown as ProductPriceRow[],
    (specRows ?? []) as unknown as SpecCapacityRow[],
  );

  if (specs.length === 0) {
    return { status: "empty" };
  }

  return { status: "ok", specs };
}
