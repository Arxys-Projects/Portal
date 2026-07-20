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
  const openProjects = deals.filter((d) => d.status === "open").length;
  const wonProjects = deals.filter((d) => d.status === "won").length;

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

      {/* Metric strip — three-state model (ADR 0081); each tile links into the pipeline. */}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
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
            label="Open projects"
            value={String(openProjects)}
            className="h-full transition-colors hover:border-arxys-navy"
          />
        </Link>
        <Link href="/submissions?status=won" className="block">
          <MetricTile
            variant="stat"
            label="Won projects"
            value={String(wonProjects)}
            className="h-full transition-colors hover:border-arxys-navy"
          />
        </Link>
      </div>

      {/* ── Size a job ── */}
      <SectionLabel>Size a job</SectionLabel>
      <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_1fr]">
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
            Size a job in full detail — cameras, retention, recording mode.
            H.265 savings and Arxys pricing calculated automatically.
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
                    {STATUS_META[s.status as SubmissionStatus]?.label ?? "Open"} ·{" "}
                    {fmtEditedDate(s.created_at)}
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
      <div className="mt-4">
        <NavCard
          href="/quick-calc"
          icon={<CalculatorIcon />}
          title="Quick Project Calculation & Quote"
          subtitle="No full camera specs yet? A saved quote from six inputs, sized on the Arxys VSR standard."
          fullWidth
        />
      </div>

      {/* ── Win a job ── */}
      <SectionLabel>Win a job</SectionLabel>
      <Link
        href="/comparison"
        className="group relative mt-3 flex items-center gap-4 rounded-[14px] border border-line border-l-[3px] border-l-arxys-gold bg-[linear-gradient(90deg,#fdf8ec,#ffffff)] px-5 py-5 transition-[transform,border-color,box-shadow] duration-150 hover:-translate-y-0.5 hover:border-arxys-navy hover:border-l-arxys-gold hover:shadow-[0_12px_28px_-14px_rgba(15,42,83,0.32)]"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] bg-[#f5e9c9] text-arxys-gold-text">
          <ComparisonIcon />
        </span>
        <span className="min-w-0 flex-1 pr-7">
          <span className="block text-lg font-bold text-ink">
            VMS Server Comparison
          </span>
          <span className="mt-1 block text-[13.5px] leading-relaxed text-ink-soft">
            Should you switch? Put Arxys VideoX next to your current appliance
            quote — spec for spec, price for price.
          </span>
        </span>
        <span className="absolute right-4 top-4 text-arxys-navy opacity-60">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="7" y1="17" x2="17" y2="7" />
            <polyline points="7 7 17 7 17 17" />
          </svg>
        </span>
      </Link>

      {/* ── Look it up ── */}
      <SectionLabel>Look it up</SectionLabel>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <NavCard
          href="/price-book"
          icon={<PriceBookIcon />}
          title="Products & Prices"
          subtitle="VideoX V5 families, specs, and current MSRPs."
        />
        <NavCard
          href="/videox-compare"
          icon={<QuickCompareIcon />}
          title="VideoX Quick Compare"
          subtitle="Every VideoX V5 NVR model side by side."
        />
        <NavCard
          href="/api/price-book/xlsx"
          icon={<SpreadsheetIcon />}
          title="VideoX Price List"
          subtitle="Download the current MSRP price book (XLSX)."
          variant="download"
        />
      </div>

      {/* ── Track my work ── */}
      <SectionLabel>Track my work</SectionLabel>
      <div className="mt-3">
        <NavCard
          href="/submissions"
          icon={<PipelineIcon />}
          title="My Pipeline"
          subtitle="Your saved quotes, grouped by project — status, list price, and revisions."
          fullWidth
        />
      </div>

      {/* ── Register a Deal + Support ── */}
      <div className="mt-7 grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
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
        <div className="mt-7">
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
