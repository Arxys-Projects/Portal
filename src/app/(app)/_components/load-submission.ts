import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SubmissionDetailRow } from "./submission-detail";

// Phase 2 Step 3+4: submissions.recommended_product_id is TEXT now (was UUID
// FK to products.id). The FK is gone, so PostgREST can't embed the products
// row automatically. We load the submission first, then look up the SKU in a
// second query. Pre-migration rows carry a UUID-shaped TEXT value that
// resolves to no row — the detail page renders "(legacy data)" in that case.

type SubmissionBase = Omit<SubmissionDetailRow, "product">;

export async function loadSubmissionDetail(
  id: string,
): Promise<SubmissionDetailRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("submissions")
    .select(
      `id, project_name, cameras_count, resolution_code, codec, complexity, vms,
       retention_days, bandwidth_mbps, storage_tb, recommended_product_id,
       recommended_units, total_list_price_usd, total_partner_price_usd,
       pipedrive_deal_id, created_at, groups_payload`,
    )
    .eq("id", id)
    .maybeSingle<SubmissionBase & { recommended_product_id: string | null }>();
  if (error || !data) return null;

  const base: SubmissionBase = {
    id: data.id,
    project_name: data.project_name,
    cameras_count: data.cameras_count,
    resolution_code: data.resolution_code,
    codec: data.codec,
    complexity: data.complexity,
    vms: data.vms,
    retention_days: data.retention_days,
    bandwidth_mbps: Number(data.bandwidth_mbps),
    storage_tb: Number(data.storage_tb),
    recommended_product_id: data.recommended_product_id,
    recommended_units: data.recommended_units,
    total_list_price_usd:
      data.total_list_price_usd === null ? null : Number(data.total_list_price_usd),
    total_partner_price_usd:
      data.total_partner_price_usd === null ? null : Number(data.total_partner_price_usd),
    pipedrive_deal_id: data.pipedrive_deal_id,
    created_at: data.created_at,
    groups_payload: data.groups_payload,
  };

  // Look up the SKU separately; legacy UUID-shaped values won't match any
  // row and the caller renders "(legacy data)" in that case.
  let product: SubmissionDetailRow["product"] = null;
  if (data.recommended_product_id && !isUuidShaped(data.recommended_product_id)) {
    const { data: productRow } = await supabase
      .from("products")
      .select("sku, product_name, product_group")
      .eq("sku", data.recommended_product_id)
      .maybeSingle();
    if (productRow) {
      product = {
        sku: productRow.sku,
        product_name: productRow.product_name,
        product_group: productRow.product_group,
      };
    }
  }

  return { ...base, product };
}

function isUuidShaped(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
