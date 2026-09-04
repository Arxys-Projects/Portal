import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SubmissionDetailRow } from "./submission-detail";

// Phase 2 Step 3+4: submissions.recommended_product_id is TEXT now (was UUID
// FK to products.id). The FK is gone, so PostgREST can't embed the products
// row automatically. We load the submission first, then look up the SKU in a
// second query. Pre-migration rows carry a UUID-shaped TEXT value that
// resolves to no row — the detail page renders "(legacy data)" in that case.

type SubmissionBase = Omit<SubmissionDetailRow, "product">;

export type SubmissionLineage = {
  parent: { id: string; project_name: string | null; created_at: string } | null;
  children: { id: string; project_name: string | null; created_at: string }[];
};

// ADR 0093 step 2 — revision lineage for the detail-page banner. RLS-scoped:
// a viewer only sees a parent/child row they already have access to, so this
// can never leak a submission outside the caller's normal visibility.
export async function loadSubmissionLineage(id: string): Promise<SubmissionLineage> {
  const supabase = await createSupabaseServerClient();

  const { data: self } = await supabase
    .from("submissions")
    .select("parent_submission_id")
    .eq("id", id)
    .maybeSingle();

  let parent: SubmissionLineage["parent"] = null;
  if (self?.parent_submission_id) {
    const { data } = await supabase
      .from("submissions")
      .select("id, project_name, created_at")
      .eq("id", self.parent_submission_id)
      .maybeSingle();
    parent = data ?? null;
  }

  const { data: childRows } = await supabase
    .from("submissions")
    .select("id, project_name, created_at")
    .eq("parent_submission_id", id)
    .order("created_at", { ascending: false });

  return { parent, children: childRows ?? [] };
}

export async function loadSubmissionDetail(
  id: string,
): Promise<SubmissionDetailRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("submissions")
    .select(
      `id, project_name, cameras_count, resolution_code, codec, complexity, vms,
       retention_days, bandwidth_mbps, storage_tb, recorded_storage_tb,
       calc_version, max_disk_utilization_pct, recommended_product_id,
       recommended_units, total_list_price_usd, total_partner_price_usd,
       pipedrive_deal_id, email_sent_at, created_at, groups_payload`,
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
    // Phase A columns. Absent stamp = a row written before the column existed,
    // which is by definition the pre-Phase-A sizing model (ADR 0126).
    recorded_storage_tb:
      data.recorded_storage_tb == null ? null : Number(data.recorded_storage_tb),
    calc_version: data.calc_version ?? 1,
    max_disk_utilization_pct: data.max_disk_utilization_pct,
    recommended_product_id: data.recommended_product_id,
    recommended_units: data.recommended_units,
    total_list_price_usd:
      data.total_list_price_usd === null ? null : Number(data.total_list_price_usd),
    total_partner_price_usd:
      data.total_partner_price_usd === null ? null : Number(data.total_partner_price_usd),
    pipedrive_deal_id: data.pipedrive_deal_id,
    email_sent_at: data.email_sent_at,
    created_at: data.created_at,
    groups_payload: data.groups_payload,
  };

  // Look up the SKU separately; legacy UUID-shaped values won't match any
  // row and the caller renders "(legacy data)" in that case.
  let product: SubmissionDetailRow["product"] = null;
  if (data.recommended_product_id && !isUuidShaped(data.recommended_product_id)) {
    const { data: productRow } = await supabase
      .from("current_products")
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
