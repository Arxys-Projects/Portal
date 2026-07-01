import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { productGroupToFamilySlug } from "@/lib/price-book/families";
import { SUBMISSION_STATUSES, isActiveStatus, type SubmissionStatus } from "./status";
import { Pipeline, type PipelineGroup, type PipelineRow, type StatusFilter } from "./pipeline";
import { groupIntoDeals, computeWeightedForecast, type SubmissionRow } from "@/lib/pipeline/forecast";

// A UUID-shaped recommended_product_id signals a pre-Step-3+4 submission whose
// FK target was dropped. Post-migration rows carry SKU strings.
function isUuidShaped(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

type Search = Promise<{ status?: string }>;

export default async function PartnerSubmissionsPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const { status: statusParam } = await searchParams;
  const activeStatus: StatusFilter =
    statusParam === "none" ||
    (SUBMISSION_STATUSES as readonly string[]).includes(statusParam ?? "")
      ? (statusParam as StatusFilter)
      : "all";

  // RLS scopes the caller to rows they own OR rows prepared on their behalf
  // (Phase 8: submissions_select_on_behalf_target). No application filter on
  // partner_id — the viewer id is used only to tell the two apart for display.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const viewerId = user?.id ?? null;
  let query = supabase
    .from("submissions")
    .select(
      `id, partner_id, project_name, recommended_units, total_list_price_usd,
       recommended_product_id, status, is_preferred, created_at,
       on_behalf_of_partner_id, on_behalf_of_company_name`,
    )
    .order("created_at", { ascending: false });
  if (activeStatus === "none") {
    query = query.is("status", null);
  } else if (activeStatus !== "all") {
    query = query.eq("status", activeStatus);
  }
  const { data, error } = await query;

  if (error) {
    console.error("[load submissions]", error);
    return (
      <div>
        <h1 className="text-2xl font-bold text-ink">My Pipeline</h1>
        <p className="mt-3 text-sm text-danger">
          Failed to load submissions. Please try again.
        </p>
      </div>
    );
  }

  type Row = {
    id: string;
    partner_id: string;
    project_name: string | null;
    recommended_units: number;
    total_list_price_usd: number | null;
    recommended_product_id: string | null;
    status: string | null;
    is_preferred: boolean;
    created_at: string;
    on_behalf_of_partner_id: string | null;
    on_behalf_of_company_name: string | null;
  };
  const rows = (data ?? []) as Row[];

  // A row is "incoming on-behalf" when it was prepared FOR the viewer by someone
  // else (Phase 8 surfaces these): the FK target is the viewer, but the creator
  // is not. These get a "Prepared by Arxys" marker, not an "On behalf of …"
  // label — labeling the viewer's own company as the target reads as nonsense.
  function isIncomingOnBehalf(r: Row): boolean {
    return (
      viewerId !== null &&
      r.on_behalf_of_partner_id === viewerId &&
      r.partner_id !== viewerId
    );
  }

  // Two sets of names to resolve via the admin client (RLS hides other
  // partners): outgoing target company names (FK target, for rows the viewer
  // prepared for someone) and incoming creator names (the rep, for rows
  // prepared for the viewer). Both are off-RLS lookups by id.
  const outgoingTargetIds = new Set<string>();
  const incomingCreatorIds = new Set<string>();
  for (const r of rows) {
    if (isIncomingOnBehalf(r)) {
      incomingCreatorIds.add(r.partner_id);
    } else if (r.on_behalf_of_partner_id) {
      outgoingTargetIds.add(r.on_behalf_of_partner_id);
    }
  }
  const obNameById = new Map<string, string>();
  const repNameById = new Map<string, string>();
  const lookupIds = [...new Set([...outgoingTargetIds, ...incomingCreatorIds])];
  if (lookupIds.length > 0) {
    const admin = createSupabaseAdminClient();
    const { data: partnersData } = await admin
      .from("partners")
      .select("id, company_name, contact_name")
      .in("id", lookupIds);
    for (const p of partnersData ?? []) {
      obNameById.set(p.id, p.company_name);
      repNameById.set(p.id, p.contact_name);
    }
  }

  // Outgoing on-behalf target name for the group label. Incoming rows return
  // null here — they carry the "Prepared by Arxys" marker instead.
  function onBehalfCompany(r: Row): string | null {
    if (isIncomingOnBehalf(r)) return null;
    if (r.on_behalf_of_company_name) return r.on_behalf_of_company_name;
    if (r.on_behalf_of_partner_id) {
      return obNameById.get(r.on_behalf_of_partner_id) ?? null;
    }
    return null;
  }

  // "Prepared by Arxys" rep name for an incoming row, when known.
  function preparedByRep(r: Row): string | null {
    if (!isIncomingOnBehalf(r)) return null;
    return repNameById.get(r.partner_id) ?? null;
  }

  // Phase 2 Step 3+4: recommended_product_id is TEXT (SKU or legacy UUID). The
  // FK is gone, so batch-fetch the products for this page and join in memory.
  const skuSet = new Set<string>();
  for (const r of rows) {
    if (r.recommended_product_id && !isUuidShaped(r.recommended_product_id)) {
      skuSet.add(r.recommended_product_id);
    }
  }
  const productBySku = new Map<string, { product_group: string }>();
  if (skuSet.size > 0) {
    const { data: productRows } = await supabase
      .from("products")
      .select("sku, product_group")
      .in("sku", [...skuSet]);
    for (const p of productRows ?? []) {
      productBySku.set(p.sku, { product_group: p.product_group });
    }
  }

  function toPipelineRow(r: Row): PipelineRow {
    const product = r.recommended_product_id
      ? productBySku.get(r.recommended_product_id) ?? null
      : null;
    const isLegacy =
      !product &&
      r.recommended_product_id !== null &&
      isUuidShaped(r.recommended_product_id);
    const familySlug = product ? productGroupToFamilySlug(product.product_group) : null;
    const productGroup = product ? product.product_group : isLegacy ? "(legacy)" : null;
    return {
      id: r.id,
      createdAt: r.created_at,
      recommendedUnits: r.recommended_units,
      totalListPriceUsd:
        r.total_list_price_usd === null ? null : Number(r.total_list_price_usd),
      status: (r.status as SubmissionStatus | null) ?? null,
      isPreferred: Boolean(r.is_preferred),
      productGroup,
      familySlug,
    };
  }

  // Group by project name (case-insensitive). Empty/null project → ungrouped.
  // Rows arrive newest-first, so each group's rows preserve that order.
  const grouped = new Map<
    string,
    {
      projectName: string | null;
      onBehalfCompanyName: string | null;
      preparedByArxys: boolean;
      preparedByRep: string | null;
      rows: PipelineRow[];
    }
  >();
  for (const r of rows) {
    const trimmed = r.project_name?.trim() ?? "";
    const key = trimmed.toLowerCase();
    if (!grouped.has(key)) {
      grouped.set(key, {
        projectName: trimmed || null,
        onBehalfCompanyName: null,
        preparedByArxys: false,
        preparedByRep: null,
        rows: [],
      });
    }
    const g = grouped.get(key)!;
    g.rows.push(toPipelineRow(r));
    if (!g.onBehalfCompanyName) g.onBehalfCompanyName = onBehalfCompany(r);
    if (isIncomingOnBehalf(r)) {
      g.preparedByArxys = true;
      if (!g.preparedByRep) g.preparedByRep = preparedByRep(r);
    }
  }

  // Sort groups: ungrouped last; among the rest, groups with an active-status
  // submission first; then by most-recent submission within each tier.
  const groups: PipelineGroup[] = [...grouped.values()]
    .map((g) => ({
      key: g.projectName ? g.projectName.toLowerCase() : "__ungrouped__",
      projectName: g.projectName,
      onBehalfCompanyName: g.onBehalfCompanyName,
      preparedByArxys: g.preparedByArxys,
      preparedByRep: g.preparedByRep,
      rows: g.rows,
    }))
    .sort((a, b) => {
      const aUng = a.projectName === null;
      const bUng = b.projectName === null;
      if (aUng !== bUng) return aUng ? 1 : -1;
      const aActive = a.rows.some((row) => isActiveStatus(row.status));
      const bActive = b.rows.some((row) => isActiveStatus(row.status));
      if (aActive !== bActive) return aActive ? -1 : 1;
      const aRecent = a.rows[0]?.createdAt ?? "";
      const bRecent = b.rows[0]?.createdAt ?? "";
      return bRecent.localeCompare(aRecent);
    });

  // Dollar totals for the summary bar. Uses groupIntoDeals to dedup correctly
  // (including on-behalf grouping). Lost deals are excluded from open pipeline
  // — computeWeightedForecast already skips draft/null; lost is pre-filtered here.
  const forecastRows: SubmissionRow[] = rows.map((r) => ({
    id: r.id,
    partner_id: r.partner_id,
    project_name: r.project_name,
    status: r.status,
    is_preferred: r.is_preferred,
    total_list_price_usd: r.total_list_price_usd,
    pipedrive_deal_id: null,
    created_at: r.created_at,
    on_behalf_of_partner_id: r.on_behalf_of_partner_id,
    on_behalf_of_company_name: r.on_behalf_of_company_name,
  }));
  const deals = groupIntoDeals(forecastRows, []);
  const openDeals = deals.filter((d) => d.status !== "lost");
  const { totalOpenPipeline, weightedForecast } = computeWeightedForecast(openDeals);

  return (
    <Pipeline
      groups={groups}
      activeStatus={activeStatus}
      totalOpenPipeline={totalOpenPipeline}
      weightedForecast={weightedForecast}
    />
  );
}
