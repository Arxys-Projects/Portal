import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { InternalToggle, PartnerRowActions } from "./partner-row-actions";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

function statusPill(status: string) {
  const cls =
    status === "active"
      ? "bg-green-50 text-green-700 border-green-200"
      : status === "invited"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : status === "suspended"
          ? "bg-red-50 text-red-700 border-red-200"
          : "bg-neutral-50 text-neutral-700 border-neutral-200";
  return (
    <span
      className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {status}
    </span>
  );
}

export default async function AdminPartnersPage() {
  const supabase = await createSupabaseServerClient();
  const { data: rows, error } = await supabase
    .from("partners")
    .select("id, company_name, contact_name, role, status, is_internal, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Partners</h1>
        <p className="mt-3 text-sm text-red-600">
          Failed to load partners: {error.message}
        </p>
      </div>
    );
  }

  // Emails live on auth.users — not on partners. Fetch and join in memory.
  // listUsers caps at perPage=200; with a small partner base this is fine.
  // If the partner base grows past 200, paginate here and capture in JOURNAL.
  const adminClient = createSupabaseAdminClient();
  const emailById = new Map<string, string>();
  const list = await adminClient.auth.admin.listUsers({ perPage: 200 });
  if (list.error) {
    console.error("listUsers failed", list.error);
  } else {
    for (const u of list.data.users) {
      if (u.email) emailById.set(u.id, u.email);
    }
  }

  type Row = {
    id: string;
    company_name: string;
    contact_name: string;
    role: string;
    status: string;
    is_internal: boolean;
    created_at: string;
  };
  const partners = (rows ?? []) as Row[];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Partners</h1>
          <p className="mt-1 text-sm text-neutral-600">
            All partners across the portal. {partners.length} total.
          </p>
        </div>
        <Link
          href="/admin/partners/new"
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Invite partner
        </Link>
      </div>

      {partners.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">
          No partners yet. Click <strong>Invite partner</strong> to get started.
        </p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2">Company</th>
                <th className="px-4 py-2">Contact</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Internal</th>
                <th className="px-4 py-2">Created</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {partners.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 text-neutral-900">{p.company_name}</td>
                  <td className="px-4 py-3 text-neutral-700">{p.contact_name}</td>
                  <td className="px-4 py-3 text-neutral-600">
                    {emailById.get(p.id) ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{p.role}</td>
                  <td className="px-4 py-3">{statusPill(p.status)}</td>
                  <td className="px-4 py-3">
                    <InternalToggle id={p.id} isInternal={Boolean(p.is_internal)} />
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {formatDate(p.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <PartnerRowActions
                      id={p.id}
                      status={p.status as "active" | "invited" | "suspended"}
                    />
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
