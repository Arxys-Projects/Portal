import { requireAdminOrInternal } from "@/lib/auth/require-admin-or-internal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RequestRowActions } from "./request-row-actions";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

function statusPill(status: string) {
  const cls =
    status === "approved"
      ? "bg-green-50 text-green-700 border-green-200"
      : status === "pending"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : status === "rejected"
          ? "bg-red-50 text-red-700 border-red-200"
          : "bg-neutral-50 text-ink-soft border-neutral-200";
  return (
    <span
      className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {status}
    </span>
  );
}

type Row = {
  id: string;
  name: string;
  email: string;
  company_name: string;
  status: string;
  existing_user: boolean;
  created_at: string;
  converted_at: string | null;
};

export default async function AdminRequestsPage() {
  await requireAdminOrInternal();

  // Read via the authenticated server client — RLS restricts this to
  // admin/internal. anon and plain partners get nothing.
  const supabase = await createSupabaseServerClient();
  const { data: rows, error } = await supabase
    .from("access_requests")
    .select("id, name, email, company_name, status, existing_user, created_at, converted_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[load access_requests]", error);
    return (
      <div>
        <h1 className="text-2xl font-bold text-ink">Access requests</h1>
        <p className="mt-3 text-sm text-danger">
          Failed to load access requests. Please try again.
        </p>
      </div>
    );
  }

  // Pending first, then most-recent within each group (the query already sorts
  // by created_at desc, so a stable partition is enough).
  const all = (rows ?? []) as Row[];
  const requests = [
    ...all.filter((r) => r.status === "pending"),
    ...all.filter((r) => r.status !== "pending"),
  ];
  const pendingCount = all.filter((r) => r.status === "pending").length;

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-ink">Access requests</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Partner-access requests submitted from the login page. {requests.length}{" "}
          total, {pendingCount} pending.
        </p>
      </div>

      {requests.length === 0 ? (
        <p className="mt-6 text-sm text-ink-soft">
          No access requests yet.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border-2 border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b-2 border-line bg-arxys-navy-soft text-left text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-4 py-2">Company</th>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Submitted</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {requests.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 text-ink">{r.company_name}</td>
                  <td className="px-4 py-3 text-ink-soft">{r.name}</td>
                  <td className="px-4 py-3 text-ink-soft">
                    {r.email}
                    {r.existing_user ? (
                      <span
                        className="ml-2 inline-block rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                        title="An account already exists for this email."
                      >
                        existing user
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">
                    {formatDate(r.created_at)}
                  </td>
                  <td className="px-4 py-3">{statusPill(r.status)}</td>
                  <td className="px-4 py-3">
                    {r.status === "pending" ? (
                      <RequestRowActions
                        id={r.id}
                        name={r.name}
                        email={r.email}
                        companyName={r.company_name}
                      />
                    ) : (
                      <span className="text-xs text-ink-soft">
                        {r.status === "approved" && r.converted_at
                          ? `invited ${formatDate(r.converted_at)}`
                          : "—"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
