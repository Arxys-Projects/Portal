import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

function cutoffIsoDaysAgo(days: number): string {
  // Wrapped so the impure clock read isn't inline in the render body
  // (react-hooks/purity rule treats Server Components as render functions).
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export default async function AdminOverviewPage() {
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
      <p className="mt-2 text-sm text-neutral-600">
        Partner roster + submissions across all partners.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border-2 border-line bg-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Partners
          </p>
          <p className="mt-2 text-3xl font-bold text-ink">
            {counts.total}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            {counts.active} active · {counts.invited} invited · {counts.suspended} suspended
          </p>
          <Link
            href="/admin/partners"
            className="mt-3 inline-block text-sm text-arxys-navy hover:underline"
          >
            Manage partners →
          </Link>
        </div>

        <div className="rounded-xl border-2 border-line bg-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Submissions (all time)
          </p>
          <p className="mt-2 text-3xl font-bold text-ink">
            {submissionsTotal}
          </p>
          <Link
            href="/admin/submissions"
            className="mt-3 inline-block text-sm text-arxys-navy hover:underline"
          >
            Browse submissions →
          </Link>
        </div>

        <div className="rounded-xl border-2 border-line bg-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Last 30 days
          </p>
          <p className="mt-2 text-3xl font-bold text-ink">
            {submissions30}
          </p>
          <p className="mt-1 text-xs text-neutral-500">submissions</p>
        </div>
      </div>

      <section className="mt-8">
        <h2 className="text-base font-bold text-ink">
          Recent submissions
        </h2>
        {recentRows.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">No submissions yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border-2 border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b-2 border-line bg-arxys-navy-soft text-left text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">
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
                      <td className="px-4 py-2 text-neutral-600">
                        {formatDate(row.created_at)}
                      </td>
                      <td className="px-4 py-2 text-neutral-900">
                        {p?.company_name ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-neutral-900">
                        {row.project_name ?? "(untitled)"}
                      </td>
                      <td className="px-4 py-2 text-right text-neutral-700">
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
