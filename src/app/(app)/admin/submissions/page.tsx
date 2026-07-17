import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminOrInternal } from "@/lib/auth/require-admin-or-internal";
import {
  STATUS_META,
  SUBMISSION_STATUSES,
  type SubmissionStatus,
} from "@/app/(app)/submissions/status";
import {
  groupIntoDeals,
  computePipelineTotals,
  type SubmissionRow,
} from "@/lib/pipeline/forecast";
import {
  PartnerGroupView,
  type PartnerGroup,
} from "./_components/partner-group-view";
import { RowControls } from "./_components/row-controls";
import { Select, StatusBadge, buttonClasses } from "@/app/(app)/_components/ui";

const PAGE_SIZE = 50;

function PreferredStar({ preferred }: { preferred: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={preferred ? "#14346b" : "none"}
      stroke={preferred ? "#14346b" : "#c8cfda"}
      strokeWidth="2"
      strokeLinejoin="round"
      aria-label={preferred ? "Preferred quote" : "Not preferred"}
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

function formatPrice(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `$${Number(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// A UUID-shaped recommended_product_id signals a pre-Step-3+4 submission
// whose FK target was dropped. Post-migration rows carry SKU strings.
function isUuidShaped(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

type Search = Promise<{
  partnerId?: string;
  page?: string;
  groupBy?: string;
  status?: string;
  from?: string;
  to?: string;
}>;

export default async function AdminSubmissionsPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const {
    partnerId,
    page: pageParam,
    groupBy,
    status: statusParam,
    from: fromDate,
    to: toDate,
  } = await searchParams;

  const isPartnerGrouped = groupBy !== "flat";

  // Phase 8 Step C — internal users see this page read-only. isAdmin gates
  // the XLSX export and per-row status / delete controls. The action handlers
  // themselves still re-check role = admin (defense in depth).
  const gate = await requireAdminOrInternal();
  const isAdmin = gate.ok && gate.isAdmin;

  const supabase = await createSupabaseServerClient();

  // Load partners list (for filter dropdown and for the forecast grouping).
  const { data: partnerRows } = await supabase
    .from("partners")
    .select("id, company_name")
    .order("company_name");

  // --- Partner group-by view ---
  if (isPartnerGrouped) {
    // Fetch all submissions with pipeline-relevant columns — no pagination
    // needed at single-digit-partner scale; group in memory.
    let q = supabase
      .from("submissions")
      .select(
        `id, partner_id, project_name, status, is_preferred,
         total_list_price_usd, pipedrive_deal_id, created_at,
         on_behalf_of_partner_id, on_behalf_of_company_name`,
      )
      .order("created_at", { ascending: false });

    if (statusParam && statusParam !== "all") {
      q = q.eq("status", statusParam);
    }
    if (fromDate) q = q.gte("created_at", `${fromDate}T00:00:00Z`);
    if (toDate) q = q.lte("created_at", `${toDate}T23:59:59Z`);

    const { data: allRows, error } = await q;
    if (error) {
      console.error("[admin load submissions]", error);
      return <ErrorMessage message="Something went wrong — please try again." />;
    }

    const submissions = (allRows ?? []) as SubmissionRow[];
    const partners = (partnerRows ?? []).map((p) => ({
      id: p.id,
      company_name: p.company_name,
    }));

    const deals = groupIntoDeals(submissions, partners);
    const { openPipeline } = computePipelineTotals(deals);

    // Build per-partner groups for the UI.
    // Each group carries the deals + the individual submission rows for drill-down.
    type SubMini = {
      id: string;
      project_name: string | null;
      status: SubmissionStatus;
      is_preferred: boolean;
      total_list_price_usd: number | null;
      created_at: string;
    };
    const subById = new Map<string, SubMini>();
    for (const s of submissions) {
      subById.set(s.id, {
        id: s.id,
        project_name: s.project_name,
        status: s.status as SubmissionStatus,
        is_preferred: s.is_preferred,
        total_list_price_usd: s.total_list_price_usd,
        created_at: s.created_at,
      });
    }

    const partnerGroupMap = new Map<string, PartnerGroup>();
    for (const deal of deals) {
      if (!partnerGroupMap.has(deal.partner_id)) {
        partnerGroupMap.set(deal.partner_id, {
          partner_id: deal.partner_id,
          partner_name: deal.partner_name,
          deals: [],
        });
      }
      const group = partnerGroupMap.get(deal.partner_id)!;
      const dealSubs = deal.all_submission_ids
        .map((id) => subById.get(id))
        .filter((s): s is SubMini => s !== undefined);
      group.deals.push({ ...deal, submissions: dealSubs });
    }

    const groups = [...partnerGroupMap.values()];
    // A partner is "active" if they have a live (open or won) deal — ADR 0081
    // removed the draft state, so lost-only partners are the only exclusion.
    const activePartners = groups.filter((g) =>
      g.deals.some((d) => d.status === "open" || d.status === "won"),
    ).length;

    // Status counts across all deals (the representative per deal).
    const statusCounts: Record<string, number> = {};
    for (const deal of deals) {
      const s = deal.status ?? "open";
      statusCounts[s] = (statusCounts[s] ?? 0) + 1;
    }

    return (
      <div>
        <PageHeader
          total={submissions.length}
          partnerRows={partnerRows ?? []}
          partnerId={partnerId}
          groupBy={groupBy}
          statusParam={statusParam}
          fromDate={fromDate}
          toDate={toDate}
          showExport={isAdmin}
        />
        <PartnerGroupView
          groups={groups}
          totalActivePartners={activePartners}
          totalOpenPipeline={openPipeline}
          statusCounts={statusCounts}
        />
      </div>
    );
  }

  // --- Project / flat list view ---
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("submissions")
    .select(
      `id, project_name, cameras_count, recommended_units, total_list_price_usd,
       total_partner_price_usd, recommended_product_id, status, is_preferred,
       created_at, on_behalf_of_partner_id, on_behalf_of_company_name,
       partners!submissions_partner_id_fkey!inner(id, company_name)`,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (partnerId) query = query.eq("partner_id", partnerId);
  if (statusParam && statusParam !== "all") {
    query = query.eq("status", statusParam);
  }
  if (fromDate) query = query.gte("created_at", `${fromDate}T00:00:00Z`);
  if (toDate) query = query.lte("created_at", `${toDate}T23:59:59Z`);

  const { data, error, count } = await query;
  if (error) {
    console.error("[admin load submissions paginated]", error);
    return <ErrorMessage message="Something went wrong — please try again." />;
  }

  type Row = {
    id: string;
    project_name: string | null;
    cameras_count: number;
    recommended_units: number;
    total_list_price_usd: number | null;
    total_partner_price_usd: number | null;
    recommended_product_id: string | null;
    status: string | null;
    is_preferred: boolean;
    created_at: string;
    on_behalf_of_partner_id: string | null;
    on_behalf_of_company_name: string | null;
    partners:
      | { id: string; company_name: string }
      | { id: string; company_name: string }[]
      | null;
  };
  const rows = (data ?? []) as Row[];

  // Batch-resolve on-behalf-of target company names. For FK-linked targets
  // (on_behalf_of_partner_id set), the name comes from the partners table via
  // the admin client (RLS would block a per-row lookup under the viewer's scope).
  // Free-text targets (on_behalf_of_company_name set) are already in the row.
  const onBehalfIds = [
    ...new Set(
      rows
        .map((r) => r.on_behalf_of_partner_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const onBehalfNameById = new Map<string, string>();
  if (onBehalfIds.length > 0) {
    const adminClient = createSupabaseAdminClient();
    const { data: obPartners } = await adminClient
      .from("partners")
      .select("id, company_name")
      .in("id", onBehalfIds);
    for (const p of obPartners ?? []) {
      onBehalfNameById.set(p.id as string, p.company_name as string);
    }
  }

  // Batch-fetch products by SKU for this page.
  const skuSet = new Set<string>();
  for (const r of rows) {
    if (r.recommended_product_id && !isUuidShaped(r.recommended_product_id)) {
      skuSet.add(r.recommended_product_id);
    }
  }
  const productBySku = new Map<string, { sku: string; product_group: string }>();
  if (skuSet.size > 0) {
    const { data: productRows } = await supabase
      .from("current_products")
      .select("sku, product_group")
      .in("sku", [...skuSet]);
    for (const p of productRows ?? []) {
      productBySku.set(p.sku, { sku: p.sku, product_group: p.product_group });
    }
  }

  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        total={total}
        partnerRows={partnerRows ?? []}
        partnerId={partnerId}
        groupBy={groupBy}
        statusParam={statusParam}
        fromDate={fromDate}
        toDate={toDate}
      />

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">
          No submissions match this view.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border-2 border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b-2 border-line bg-arxys-navy-soft text-left text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Partner</th>
                <th className="px-4 py-2">Project</th>
                <th className="px-4 py-2">Recommendation</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-center">Preferred</th>
                <th className="px-4 py-2 text-right">Streams</th>
                <th className="px-4 py-2 text-right">List price</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {rows.map((r) => {
                const partner = Array.isArray(r.partners)
                  ? r.partners[0]
                  : r.partners;
                // Effective partner name: on-behalf target takes precedence.
                const effectivePartnerName =
                  (r.on_behalf_of_partner_id
                    ? onBehalfNameById.get(r.on_behalf_of_partner_id)
                    : null) ??
                  r.on_behalf_of_company_name ??
                  partner?.company_name ??
                  "—";
                const product = r.recommended_product_id
                  ? productBySku.get(r.recommended_product_id) ?? null
                  : null;
                const isLegacy =
                  !product &&
                  r.recommended_product_id !== null &&
                  isUuidShaped(r.recommended_product_id);
                const recommendationLabel = product
                  ? `${r.recommended_units} × ${product.product_group}`
                  : isLegacy
                    ? `${r.recommended_units} × (legacy)`
                    : `${r.recommended_units} ×`;
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-2 text-neutral-600">
                      {formatDate(r.created_at)}
                    </td>
                    <td className="px-4 py-2 text-neutral-900">
                      {effectivePartnerName}
                    </td>
                    <td className="px-4 py-2 text-neutral-900">
                      {r.project_name ?? "(untitled)"}
                    </td>
                    <td className="px-4 py-2 text-neutral-700">
                      {recommendationLabel}
                    </td>
                    <td className="px-4 py-2">
                      {isAdmin ? (
                        <RowControls
                          submissionId={r.id}
                          status={r.status as SubmissionStatus}
                        />
                      ) : (
                        <StatusBadge
                          variant="status"
                          status={r.status as SubmissionStatus}
                        />
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex justify-center">
                        <PreferredStar preferred={Boolean(r.is_preferred)} />
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right text-neutral-700">
                      {r.cameras_count}
                    </td>
                    <td className="px-4 py-2 text-right text-neutral-700">
                      {formatPrice(r.total_list_price_usd)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link
                        href={`/admin/submissions/${r.id}`}
                        className={buttonClasses("primary", "sm")}
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm text-neutral-600">
          <p>
            Page {page} of {pageCount}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={{
                  pathname: "/admin/submissions",
                  query: {
                    groupBy: "flat",
                    ...(partnerId ? { partnerId } : {}),
                    ...(statusParam ? { status: statusParam } : {}),
                    ...(fromDate ? { from: fromDate } : {}),
                    ...(toDate ? { to: toDate } : {}),
                    page: page - 1,
                  },
                }}
                className={buttonClasses("secondary", "sm")}
              >
                ← Previous
              </Link>
            ) : null}
            {page < pageCount ? (
              <Link
                href={{
                  pathname: "/admin/submissions",
                  query: {
                    groupBy: "flat",
                    ...(partnerId ? { partnerId } : {}),
                    ...(statusParam ? { status: statusParam } : {}),
                    ...(fromDate ? { from: fromDate } : {}),
                    ...(toDate ? { to: toDate } : {}),
                    page: page + 1,
                  },
                }}
                className={buttonClasses("secondary", "sm")}
              >
                Next →
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">Partner Pipeline</h1>
      <p className="mt-3 text-sm text-danger">
        Failed to load submissions: {message}
      </p>
    </div>
  );
}

function PageHeader({
  total,
  partnerRows,
  partnerId,
  groupBy,
  statusParam,
  fromDate,
  toDate,
  showExport,
}: {
  total: number;
  partnerRows: { id: string; company_name: string }[];
  partnerId?: string;
  groupBy?: string;
  statusParam?: string;
  fromDate?: string;
  toDate?: string;
  showExport?: boolean;
}) {
  const isPartnerGrouped = groupBy !== "flat";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">
            Partner Pipeline
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {isPartnerGrouped
              ? "Grouped by partner. Weighted forecast."
              : `All submissions, flat list. ${total} total.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Grouped / Flat toggle */}
          <Link
            href={{
              pathname: "/admin/submissions",
              query: {
                ...(isPartnerGrouped ? { groupBy: "flat" } : {}),
                ...(statusParam ? { status: statusParam } : {}),
                ...(fromDate ? { from: fromDate } : {}),
                ...(toDate ? { to: toDate } : {}),
              },
            }}
            className={buttonClasses("secondary", "sm")}
          >
            {isPartnerGrouped ? "Flat list" : "Grouped"}
          </Link>
          {showExport ? (
            <Link
              href="/api/admin/forecast/xlsx"
              className={buttonClasses("secondary", "sm")}
            >
              Export XLSX
            </Link>
          ) : null}
        </div>
      </div>

      {/* Filters */}
      <form method="get" className="flex flex-wrap items-end gap-2">
        {!isPartnerGrouped ? (
          <input type="hidden" name="groupBy" value="flat" />
        ) : null}

        {/* Partner filter (project view only) */}
        {!isPartnerGrouped ? (
          <label className="text-xs font-semibold text-ink-soft">
            Partner
            <Select name="partnerId" defaultValue={partnerId ?? ""} className="mt-1 py-1.5 text-sm">
              <option value="">All partners</option>
              {partnerRows.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.company_name}
                </option>
              ))}
            </Select>
          </label>
        ) : null}

        {/* Status filter */}
        <label className="text-xs font-semibold text-ink-soft">
          Status
          <Select name="status" defaultValue={statusParam ?? "all"} className="mt-1 py-1.5 text-sm">
            <option value="all">All</option>
            {SUBMISSION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </Select>
        </label>

        {/* Date range */}
        <label className="text-xs font-semibold text-ink-soft">
          From
          <input
            type="date"
            name="from"
            defaultValue={fromDate ?? ""}
            className="mt-1 block rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink focus:border-arxys-navy focus:outline-none focus:ring-2 focus:ring-arxys-navy/15"
          />
        </label>
        <label className="text-xs font-semibold text-ink-soft">
          To
          <input
            type="date"
            name="to"
            defaultValue={toDate ?? ""}
            className="mt-1 block rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink focus:border-arxys-navy focus:outline-none focus:ring-2 focus:ring-arxys-navy/15"
          />
        </label>

        <button type="submit" className={buttonClasses("primary", "sm")}>
          Apply
        </button>
        {(partnerId || statusParam || fromDate || toDate) ? (
          <Link
            href={{
              pathname: "/admin/submissions",
              query: isPartnerGrouped ? {} : { groupBy: "flat" },
            }}
            className="text-xs font-medium text-arxys-navy hover:underline"
          >
            Clear filters
          </Link>
        ) : null}
      </form>
    </div>
  );
}
