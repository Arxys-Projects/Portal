// Candidate-pool loader shared by the full calculator submit and the Quick
// Calc preview (ADR 0082). One query path so both tools size against exactly
// the same SKU pool: active, numeric-priced products with camera/storage
// capacity, storage sized net-usable via product_specs (ADR 0068).
import type { SupabaseClient } from "@supabase/supabase-js";
import { usableCapacityTb } from "@/lib/capacity-utils";
import type { ServerSpec } from "./types";

export type CandidatePool =
  | { status: "ok"; specs: ServerSpec[] }
  | { status: "db-error"; context: "load products" | "load product specs"; error: unknown }
  | { status: "empty" };

export async function loadCandidateSpecs(
  supabase: SupabaseClient,
): Promise<CandidatePool> {
  // Phase 2 Step 3+4: products is SKU-PK with inline max_cameras +
  // max_storage_tb. recommend() filters MKT/CFQ defensively but we also filter
  // at the query level to keep the candidate pool tight (Q4(a)).
  const { data: productRows, error: productError } = await supabase
    .from("current_products")
    .select("sku, product_name, product_group, msrp, price_type, max_cameras, max_storage_tb")
    .eq("active", true)
    .eq("price_type", "numeric")
    .not("max_cameras", "is", null)
    .not("max_storage_tb", "is", null)
    .order("sort_order");
  if (productError) {
    return { status: "db-error", context: "load products", error: productError };
  }
  if (!productRows || productRows.length === 0) {
    return { status: "empty" };
  }

  // ADR 0068: storage sizing is net-usable, not raw nameplate. The usable
  // figure is derived from product_specs (storage_raw_tb + hdd_count +
  // raid_level_display) via usableCapacityTb — products.max_storage_tb is raw.
  // product_specs.id == products.sku, so we join in-process.
  const { data: specRows, error: specError } = await supabase
    .from("product_specs")
    .select("id, storage_raw_tb, hdd_count, raid_level_display");
  if (specError) {
    return { status: "db-error", context: "load product specs", error: specError };
  }
  const usableBySku = new Map<string, number>();
  for (const row of specRows ?? []) {
    const usable = usableCapacityTb(
      Number(row.storage_raw_tb),
      row.hdd_count == null ? null : Number(row.hdd_count),
      row.raid_level_display,
    );
    if (usable != null) usableBySku.set(row.id as string, usable);
  }

  // A SKU with no resolvable net-usable figure (no product_specs row) cannot be
  // sized storage-first; fall back to its raw nameplate so it stays a valid
  // candidate rather than vanishing.
  const specs: ServerSpec[] = productRows.map((row) => ({
    sku: row.sku,
    productGroup: row.product_group,
    productName: row.product_name,
    maxCameras: row.max_cameras as number,
    maxStorageTb: Number(row.max_storage_tb),
    usableStorageTb: usableBySku.get(row.sku) ?? Number(row.max_storage_tb),
    msrp: Number(row.msrp),
    priceType: "numeric" as const,
  }));

  return { status: "ok", specs };
}
