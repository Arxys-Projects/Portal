import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Footer from "@/app/(app)/_components/footer";
import RegisterDealForm from "./register-deal-form";
import { groupIntoDeals, computeWeightedForecast, type SubmissionRow } from "@/lib/pipeline/forecast";
import { STATUS_META, type SubmissionStatus } from "@/app/(app)/submissions/status";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: partner } = user
    ? await supabase
        .from("partners")
        .select("id, role, company_name, contact_name, email")
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
           total_list_price_usd, pipedrive_deal_id, created_at`,
        )
        .order("created_at", { ascending: false })
    : { data: null };

  const ownSubmissions = (ownSubs ?? []) as SubmissionRow[];
  const deals = partner
    ? groupIntoDeals(ownSubmissions, [
        { id: partner.id, company_name: partner.company_name },
      ])
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

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-3xl font-semibold text-neutral-900">
          Arxys Partner Dashboard
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          Welcome back{user?.email ? `, ${user.email}` : ""}.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {/* Calculator */}
          <Link
            href="/calculator"
            className="group rounded-lg border-2 border-neutral-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow-md"
          >
            <h2 className="text-xl font-semibold text-neutral-900 group-hover:text-blue-700">
              Calculator
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Estimate bandwidth and storage for a new deployment.
            </p>
          </Link>

          {/* My Pipeline */}
          <Link
            href="/submissions"
            className="group rounded-lg border-2 border-neutral-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow-md"
          >
            <h2 className="text-xl font-semibold text-neutral-900 group-hover:text-blue-700">
              My Pipeline
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Browse your past calculator submissions and reports.
            </p>
          </Link>

          {/* Pipeline funnel */}
          {deals.length > 0 ? (
            <div className="rounded-lg border-2 border-neutral-200 bg-white p-6 shadow-sm sm:col-span-2">
              <h2 className="text-xl font-semibold text-neutral-900">
                My Pipeline Summary
              </h2>
              <p className="mt-1 text-xs text-neutral-500">
                Pre-CRM activity — one value per project (preferred or most recent quote).
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <FunnelStat
                  label="Open pipeline"
                  value={fmtPrice(totalOpenPipeline)}
                />
                <FunnelStat
                  label="Weighted forecast"
                  value={fmtPrice(weightedForecast)}
                />
                <div className="rounded border border-neutral-100 bg-neutral-50 px-3 py-2">
                  <p className="text-xs text-neutral-500">By status</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    {(Object.entries(statusCounts) as [SubmissionStatus, number][]).map(
                      ([st, n]) => (
                        <span key={st} className="text-xs text-neutral-700">
                          <span
                            className={`inline-block rounded-full border px-1.5 py-0.5 ${STATUS_META[st].badge}`}
                          >
                            {STATUS_META[st].label}
                          </span>{" "}
                          {n}
                        </span>
                      ),
                    )}
                  </div>
                </div>
                {draftCount > 0 ? (
                  <FunnelStat
                    label="Drafts (excluded from $)"
                    value={String(draftCount)}
                  />
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Price book */}
          <Link
            href="/price-book"
            className="group rounded-lg border-2 border-neutral-200 bg-white p-6 shadow-sm transition hover:border-[#054A91] hover:shadow-md"
          >
            <h2 className="text-xl font-semibold text-neutral-900 group-hover:text-[#054A91]">
              VideoX V5 Price Book
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Browse families, specs, and current MSRPs.
            </p>
            <p className="mt-3 text-sm font-medium text-[#054A91]">
              Open price book →
            </p>
          </Link>

          {/* XLSX download */}
          <Link
            href="/api/price-book/xlsx"
            className="rounded-lg border-2 border-neutral-200 bg-white p-6 shadow-sm transition hover:border-[#fbb040] hover:shadow-md"
          >
            <h2 className="text-xl font-semibold text-neutral-900">
              VideoX Price List
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Download the current VideoX MSRP price book as an Excel
              spreadsheet.
            </p>
            <p className="mt-3 text-sm font-medium text-[#fbb040]">
              Download XLSX →
            </p>
          </Link>

          {/* Support */}
          <div className="rounded-lg border-2 border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-neutral-900">Support</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Access documentation or open a ticket with the Arxys support team.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <a
                href="https://www.arxys.com/company/support/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-[#054A91] hover:underline"
              >
                Support Documentation →
              </a>
              <a
                href="https://arxys.supportsystem.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center rounded bg-[#fbb040] px-4 py-2 text-sm font-semibold text-[#1a1a1a] transition hover:bg-[#e69e2c]"
              >
                Open a Support Ticket
              </a>
            </div>
          </div>

          {/* Deal Registration */}
          <div className="rounded-lg border-2 border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-neutral-900">
              Register a Deal
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Lock in partner protection on a specific opportunity — Andy will
              follow up.
            </p>
            <div className="mt-4">
              <RegisterDealForm
                partnerId={partner?.id ?? ""}
                companyName={partner?.company_name ?? ""}
                contactName={partner?.contact_name ?? ""}
                partnerEmail={partner?.email ?? user?.email ?? ""}
              />
            </div>
          </div>

          {/* Admin */}
          {isAdmin ? (
            <Link
              href="/admin"
              className="group rounded-lg border-2 border-neutral-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow-md"
            >
              <h2 className="text-xl font-semibold text-neutral-900 group-hover:text-blue-700">
                Admin
              </h2>
              <p className="mt-1 text-sm text-neutral-600">
                Manage partners and review all submissions.
              </p>
            </Link>
          ) : null}
        </div>

        <Footer />
      </div>
    </div>
  );
}

function FunnelStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-neutral-100 bg-neutral-50 px-3 py-2">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-0.5 text-base font-semibold text-neutral-900">{value}</p>
    </div>
  );
}

function fmtPrice(n: number): string {
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
