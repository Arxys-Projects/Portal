import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SubmissionDetailRow } from "./submission-detail";

// Joined shape returned from Supabase before we flatten the embed.
type Joined = Omit<SubmissionDetailRow, "product"> & {
  products:
    | { name: string; description: string | null; sku: string }
    | { name: string; description: string | null; sku: string }[]
    | null;
};

export async function loadSubmissionDetail(
  id: string,
): Promise<SubmissionDetailRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("submissions")
    .select(
      `id, project_name, cameras_count, resolution_code, codec, complexity, vms,
       retention_days, bandwidth_mbps, storage_tb, recommended_units,
       total_list_price_usd, total_partner_price_usd, pipedrive_deal_id,
       created_at, groups_payload,
       products:recommended_product_id(name, description, sku)`,
    )
    .eq("id", id)
    .maybeSingle<Joined>();
  if (error || !data) return null;
  const product = Array.isArray(data.products)
    ? (data.products[0] ?? null)
    : data.products;
  return {
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
    recommended_units: data.recommended_units,
    total_list_price_usd:
      data.total_list_price_usd === null ? null : Number(data.total_list_price_usd),
    total_partner_price_usd:
      data.total_partner_price_usd === null
        ? null
        : Number(data.total_partner_price_usd),
    pipedrive_deal_id: data.pipedrive_deal_id,
    created_at: data.created_at,
    groups_payload: data.groups_payload,
    product,
  };
}
