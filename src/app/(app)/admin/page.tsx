import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminOrInternal } from "@/lib/auth/require-admin-or-internal";
import { NavCard } from "@/app/(app)/_components/ui";
import type { ReactNode } from "react";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

function cutoffIsoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function PipelineIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="3" width="6" height="18" rx="1" />
      <rect x="9" y="7" width="6" height="14" rx="1" />
      <rect x="16" y="11" width="6" height="10" rx="1" />
    </svg>
  );
}

function PartnersIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="9" cy="7" r="3" />
      <circle cx="17" cy="7" r="3" />
      <path d="M1 21c0-4 3.6-7 8-7" />
      <path d="M15 14c4.4 0 8 3 8 7" />
    </svg>
  );
}

function SpreadsheetIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}

function StatCard({ label, value, detail, link }: { label: string; value: ReactNode; detail?: string; link?: { href: string; text: string } }) {
  return (
    <div className="rounded-[14px] border border-line border-t-[3px] border-t-arxys-navy bg-surface p-5">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#3f4b5b]">
        {label}
      </p>
      <p className="mt-2 text-3xl font-extrabold tabular-nums text-arxys-navy">{value}</p>
      {detail ? <p className="mt-1 text-xs text-ink-soft">{detail}</p> : null}
      {link ? (
        <Link href={link.href} className="mt-3 inline-block text-sm text-arxys-navy hover:underline">
          {link.text} →
        </Link>
      ) : null}
    </div>
  );
}

export default async function AdminOverviewPage() {
  const gate = await requireAdminOrInternal();
  const isAdmin = gate.ok && gate.isAdmin;

  const supabase = await createSupabaseServerClient();
  const last30Cutoff = cutoffIsoDaysAgo(30);

  const [partnersRes, submissionsCountRes, recentRes, recent30Res] =
    await Promise.all([
      supabase.from("partners").select("status"),
      supabase
        .from("submissions")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("submissions")
        .select(
          "id, project_name, cameras_count, created_at, partners!submissions_partner_id_fkey!inner(company_name)",
        )
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("submissions")
        .select("id", { count: "exact", head: true })
        .gte("created_at", last30Cutoff),
    ]);

  const partners = partnersRes.data ?? [];
  const counts = {
    total: partners.length,
    active: partners.filter((p) => p.status === "active").length,
    invited: partners.filter((p) => p.status === "invited").length,
    suspended: partners.filter((p) => p.status === "suspended").length,
  };
  const submissionsTotal = submissionsCountRes.count ?? 0;
  const submissions30 = recent30Res.count ?? 0;
  const recent = recentRes.data ?? [];

  type RecentRow = {
    id: string;
    project_name: string | null;
    cameras_count: number;
    created_at: string;
    partners: { company_name: string } | { company_name: string }[] | null;
  };
  const recentRows = recent as RecentRow[];

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">Admin overview</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Partner roster and pipeline across all partners.
      </p>

      {/* Navigation */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <NavCard
          href="/admin/submissions"
          icon={<PipelineIcon />}
          title="Partner Pipeline"
          subtitle="Review and manage all partner submissions, grouped by partner or as a flat list."
        />
        <NavCard
          href="/admin/partners"
          icon={<PartnersIcon />}
          title="Partners"
          subtitle="View the partner roster, invite new partners, and manage account status."
        />
        {isAdmin ? (
          <NavCard
            href="/api/admin/forecast/xlsx"
            icon={<SpreadsheetIcon />}
            title="Export Pipeline"
            subtitle="Download the full pipeline as an Excel workbook."
            variant="download"
          />
        ) : null}
      </div>

      {/* Stats */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Partners"
          value={counts.total}
          detail={`${counts.active} active · ${counts.invited} invited · ${counts.suspended} suspended`}
          link={{ href: "/admin/partners", text: "Manage partners" }}
        />
        <StatCard
          label="Partner Pipeline (all time)"
          value={submissionsTotal}
          link={{ href: "/admin/submissions", text: "Browse pipeline" }}
        />
        <StatCard
          label="Last 30 days"
          value={submissions30}
          detail="submissions"
        />
      </div>

      <section className="mt-8">
        <h2 className="text-base font-bold text-ink">Recent submissions</h2>
        {recentRows.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">No submissions yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-[14px] border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-panel text-left text-[11px] font-bold uppercase tracking-[0.06em] text-[#3f4b5b]">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Partner</th>
                  <th className="px-4 py-2">Project</th>
                  <th className="px-4 py-2 text-right">Cameras</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {recentRows.map((row) => {
                  const p = Array.isArray(row.partners)
                    ? row.partners[0]
                    : row.partners;
                  return (
                    <tr key={row.id}>
                      <td className="px-4 py-2 text-ink-soft">
                        {formatDate(row.created_at)}
                      </td>
                      <td className="px-4 py-2 text-ink">
                        {p?.company_name ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-ink">
                        {row.project_name ?? "(untitled)"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-ink">
                        {row.cameras_count}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Link
                          href={`/admin/submissions/${row.id}`}
                          className="text-sm text-arxys-navy hover:underline"
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
      </section>
    </div>
  );
}
