import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import Footer from "@/app/(app)/_components/footer";
import {
  Card,
  NavCard,
  MetricTile,
  StatusBadge,
} from "@/app/(app)/_components/ui";
import RegisterDealForm from "./register-deal-form";
import HelpModal from "./help-modal";
import {
  CalculatorIcon,
  PipelineIcon,
  PriceBookIcon,
  ComparisonIcon,
  QuickCompareIcon,
  SpreadsheetIcon,
  SupportIcon,
  AdminIcon,
  DealIcon,
} from "./icons";
import { groupIntoDeals, computeWeightedForecast, type SubmissionRow } from "@/lib/pipeline/forecast";
import { type SubmissionStatus } from "@/app/(app)/submissions/status";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: partner } = user
    ? await supabase
        .from("partners")
        .select("id, role, company_name, contact_name")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };
  const isAdmin = partner?.role === "admin";

  // Partner funnel — RLS-scoped to the current user's own submissions.
  const { data: ownSubs } = user
    ? await supabase
        .from("submissions")
        .select(
          `id, partner_id, project_name, status, is_preferred,
           total_list_price_usd, pipedrive_deal_id, created_at,
           on_behalf_of_partner_id, on_behalf_of_company_name`,
        )
        .order("created_at", { ascending: false })
    : { data: null };

  const ownSubmissions = (ownSubs ?? []) as SubmissionRow[];
  // For on-behalf submissions the grouping resolves to a target partner the
  // viewer can't read under their own RLS scope. Resolve just those targets'
  // names via the admin client so the dashboard shows a company, not a UUID.
  const partnersForGrouping = partner
    ? [{ id: partner.id, company_name: partner.company_name }]
    : [];
  const onBehalfIds = [
    ...new Set(
      ownSubmissions
        .map((s) => s.on_behalf_of_partner_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (partner && onBehalfIds.length > 0) {
    const admin = createSupabaseAdminClient();
    const { data: targets } = await admin
      .from("partners")
      .select("id, company_name")
      .in("id", onBehalfIds);
    for (const t of targets ?? []) {
      partnersForGrouping.push({ id: t.id, company_name: t.company_name });
    }
  }
  const deals = partner
    ? groupIntoDeals(ownSubmissions, partnersForGrouping)
    : [];
  const { totalOpenPipeline, weightedForecast } = computeWeightedForecast(deals);

  // Status counts per deal (representative submission).
  const statusCounts: Partial<Record<SubmissionStatus | "none", number>> = {};
  let draftCount = 0;
  for (const deal of deals) {
    if (deal.status === null || deal.status === "draft") {
      draftCount += 1;
    } else {
      const s = deal.status as SubmissionStatus;
      statusCounts[s] = (statusCounts[s] ?? 0) + 1;
    }
  }
  const statusEntries = Object.entries(statusCounts) as [SubmissionStatus, number][];

  return (
    <div className="min-h-screen bg-page">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight text-ink">
            Arxys Partner Dashboard
          </h1>
          <HelpModal />
        </div>
        <p className="mt-1 text-sm text-ink-soft">
          Welcome back{partner?.contact_name ? `, ${partner.contact_name}` : ""}
          {partner?.company_name ? ` · ${partner.company_name}` : ""}.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* ── Tools ── */}
          <NavCard
            href="/calculator"
            icon={<CalculatorIcon />}
            title="Calculator"
            subtitle="Estimate bandwidth and storage for a new deployment."
          />
          <NavCard
            href="/submissions"
            icon={<PipelineIcon />}
            title="My Pipeline"
            subtitle="Browse your past calculator submissions and reports."
          />
          <NavCard
            href="/price-book"
            icon={<PriceBookIcon />}
            title="VideoX V5 Price Book"
            subtitle="Browse families, specs, and current MSRPs."
          />

          {/* ── Pipeline Summary — data panel, no arrow (not a destination) ── */}
          {deals.length > 0 ? (
            <Card className="lg:col-span-3 sm:col-span-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-bold text-ink">My Pipeline Summary</h2>
                <p className="text-xs text-ink-soft">
                  Pre-CRM activity — one value per project (preferred or most recent quote).
                </p>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricTile label="Open pipeline" value={fmtPrice(totalOpenPipeline)} />
                <MetricTile label="Weighted forecast" value={fmtPrice(weightedForecast)} />
                <MetricTile
                  label="By status"
                  value={
                    statusEntries.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 pt-0.5 text-[13px] font-bold">
                        {statusEntries.map(([st, n]) => (
                          <StatusBadge key={st} variant="status" status={st}>
                            {n}
                          </StatusBadge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-base text-ink-soft">—</span>
                    )
                  }
                />
                <MetricTile
                  label="Drafts (excl. $)"
                  value={String(draftCount)}
                />
              </div>
            </Card>
          ) : null}

          {/* ── Resources ── */}
          <NavCard
            href="/comparison"
            icon={<ComparisonIcon />}
            title="VMS Server Comparison"
            subtitle="See how Arxys VideoX stacks up against Milestone and Avigilon — spec for spec, price for price."
          />
          <NavCard
            href="/videox-compare"
            icon={<QuickCompareIcon />}
            title="VideoX Quick Compare"
            subtitle="Compare every VideoX V5 NVR model side by side."
          />
          <NavCard
            href="/api/price-book/xlsx"
            icon={<SpreadsheetIcon />}
            title="VideoX Price List"
            subtitle="Download the current VideoX MSRP price book as Excel (XLSX)."
            variant="download"
          />

          {/* ── Support (one card) + Register a Deal ── */}
          <NavCard
            href="https://www.arxys.com/company/support/"
            icon={<SupportIcon />}
            title="Support"
            subtitle="Documentation and tickets with the Arxys support team."
            external
          />
          <Card className="sm:col-span-2">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-arxys-navy-soft text-arxys-navy">
                <DealIcon />
              </span>
              <div className="min-w-0">
                <h2 className="text-[15px] font-bold text-ink">Register a Deal</h2>
                <p className="mt-1 text-[13px] text-ink-soft">
                  Lock in partner protection on a specific opportunity. Andy will follow up.
                </p>
              </div>
            </div>
            <div className="mt-4">
              <RegisterDealForm />
            </div>
          </Card>

          {/* ── Admin — full-width footer destination ── */}
          {isAdmin ? (
            <div className="lg:col-span-3 sm:col-span-2">
              <NavCard
                href="/admin"
                icon={<AdminIcon />}
                title="Admin"
                subtitle="Manage partners and review all submissions."
                fullWidth
              />
            </div>
          ) : null}
        </div>

        <Footer />
      </div>
    </div>
  );
}

function fmtPrice(n: number): string {
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
