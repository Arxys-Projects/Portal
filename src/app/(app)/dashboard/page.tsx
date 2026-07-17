import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import Footer from "@/app/(app)/_components/footer";
import {
  Card,
  NavCard,
  MetricTile,
} from "@/app/(app)/_components/ui";
import Link from "next/link";
import type { ReactNode } from "react";
import RegisterDealForm from "./register-deal-form";
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
import { groupIntoDeals, computePipelineTotals, type SubmissionRow } from "@/lib/pipeline/forecast";
import { STATUS_META, type SubmissionStatus } from "@/app/(app)/submissions/status";

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
  const { openPipeline } = computePipelineTotals(deals);

  const recent = ownSubmissions.slice(0, 3);
  const firstName = partner?.contact_name?.trim().split(/\s+/)[0] ?? null;

  return (
    <div className="mx-auto max-w-6xl">
      {/* Greeting */}
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">
        Welcome back{firstName ? `, ${firstName}` : ""}
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        Arxys{partner?.company_name ? ` · ${partner.company_name}` : ""} — here&apos;s
        your pipeline and tools.
      </p>

      {/* Metric strip — each tile links into the pipeline. */}
      {/* TODO(0081-ui): ADR 0081 retired Weighted Forecast and the Sent/Drafts
          statuses. Their tile values are stubbed to "—" here; the Design pass
          removes/reworks these tiles (only Open pipeline remains meaningful). */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Link href="/submissions" className="block">
          <MetricTile
            variant="stat"
            label="Open pipeline"
            value={fmtPrice(openPipeline)}
            className="h-full transition-colors hover:border-arxys-navy"
          />
        </Link>
        <Link href="/submissions" className="block">
          <MetricTile
            variant="stat"
            label="Weighted forecast"
            value="—"
            className="h-full transition-colors hover:border-arxys-navy"
          />
        </Link>
        <Link href="/submissions" className="block">
          <MetricTile
            variant="stat"
            label="Sent"
            value="—"
            className="h-full transition-colors hover:border-arxys-navy"
          />
        </Link>
        <Link href="/submissions" className="block">
          <MetricTile
            variant="stat"
            label="Drafts"
            value="—"
            className="h-full transition-colors hover:border-arxys-navy"
          />
        </Link>
      </div>

      {/* Calculator hero + pick up where you left off */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_1fr]">
        <div className="rounded-[14px] bg-[linear-gradient(140deg,#1a3f7c,#0d2247)] p-7 text-white">
          <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-white/70">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 text-white">
              <CalculatorIcon />
            </span>
            Start here
          </span>
          <h2 className="mt-3 text-2xl font-bold tracking-tight">
            Storage &amp; Bandwidth Calculator
          </h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-white/85">
            Size a job in minutes — cameras, retention, recording mode. H.265
            savings and Arxys pricing calculated automatically.
          </p>
          <Link
            href="/calculator"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-arxys-navy transition-colors hover:bg-arxys-navy-soft"
          >
            New estimate →
          </Link>
        </div>

        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#222c3a]">
            Pick up where you left off
          </p>
          {recent.length > 0 ? (
            <div className="mt-2 space-y-2.5">
              {recent.map((s) => (
                <Link
                  key={s.id}
                  href={`/calculator?revise=${s.id}`}
                  className="group block rounded-[14px] border border-line bg-surface px-4 py-3 transition-[transform,border-color,box-shadow] duration-150 hover:-translate-y-0.5 hover:border-arxys-navy hover:shadow-[0_10px_24px_-12px_rgba(15,42,83,0.30)]"
                >
                  <p className="truncate text-sm font-semibold text-ink">
                    {s.project_name?.trim() || "Untitled quote"}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {s.status
                      ? STATUS_META[s.status as SubmissionStatus]?.label ?? "No status"
                      : "No status"}{" "}
                    · {fmtEditedDate(s.created_at)}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-ink-soft">No saved quotes yet.</p>
          )}
          <Link
            href="/submissions"
            className="mt-3 inline-block text-sm font-semibold text-arxys-navy hover:underline"
          >
            View all saved quotes →
          </Link>
        </div>
      </div>

      {/* ── Tools ── */}
      <SectionLabel>Tools</SectionLabel>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
      </div>

      {/* ── Reference ── */}
      <SectionLabel>Reference</SectionLabel>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <NavCard
          href="/price-book"
          icon={<PriceBookIcon />}
          title="VideoX V5 Price Book"
          subtitle="Browse families, specs, and current MSRPs."
        />
        <NavCard
          href="/comparison"
          icon={<ComparisonIcon />}
          title="VMS Server Comparison"
          subtitle="See how Arxys VideoX stacks up against Milestone, Avigilon, and Genetec — spec for spec, price for price."
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
      </div>

      {/* ── Your work ── */}
      <SectionLabel>Your work</SectionLabel>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="sm:col-span-2">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-arxys-navy-soft text-arxys-navy">
              <DealIcon />
            </span>
            <div className="min-w-0">
              <h2 className="text-[15px] font-bold text-ink">Register a Deal</h2>
              <p className="mt-1 text-[13px] text-ink-soft">
                Lock in partner protection on a specific opportunity. Andy will
                follow up.
              </p>
            </div>
          </div>
          <div className="mt-4">
            <RegisterDealForm />
          </div>
        </Card>
        <NavCard
          href="https://www.arxys.com/company/support/"
          icon={<SupportIcon />}
          title="Support"
          subtitle="Documentation and tickets with the Arxys support team."
          external
        />
      </div>

      {isAdmin ? (
        <div className="mt-8">
          <NavCard
            href="/admin"
            icon={<AdminIcon />}
            title="Admin"
            subtitle="Manage partners and review all submissions."
            fullWidth
          />
        </div>
      ) : null}

      <Footer />
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="mt-8 text-[12.5px] font-bold uppercase tracking-[0.1em] text-[#222c3a]">
      {children}
    </h2>
  );
}

function fmtEditedDate(value: string): string {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "—";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  return new Date(value).toISOString().slice(0, 10);
}

function fmtPrice(n: number): string {
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
