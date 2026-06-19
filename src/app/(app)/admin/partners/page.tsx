import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminOrInternal } from "@/lib/auth/require-admin-or-internal";
import { EditableName, InternalToggle, PartnerRowActions } from "./partner-row-actions";
import { updatePartnerCompanyName, updatePartnerContactName } from "./actions";
import { buttonClasses } from "@/app/(app)/_components/ui";

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
  const gate = await requireAdminOrInternal();
  const isAdmin = gate.ok && gate.isAdmin;
  const supabase = await createSupabaseServerClient();
  const { data: rows, error } = await supabase
    .from("partners")
    .select("id, company_name, contact_name, role, status, is_internal, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[load partners]", error);
    return (
      <div>
        <h1 className="text-2xl font-bold text-ink">Partners</h1>
        <p className="mt-3 text-sm text-danger">
          Failed to load partners. Please try again.
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
          <h1 className="text-2xl font-bold text-ink">Partners</h1>
          <p className="mt-1 text-sm text-ink-soft">
            All partners across the portal. {partners.length} total.
          </p>
        </div>
        <Link href="/admin/partners/new" className={buttonClasses("primary", "sm")}>
          Invite partner
        </Link>
      </div>

      {partners.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">
          No partners yet. Click <strong>Invite partner</strong> to get started.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border-2 border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b-2 border-line bg-arxys-navy-soft text-left text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">
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
            <tbody className="divide-y divide-line-soft">
              {partners.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 text-neutral-900">
                    {isAdmin ? (
                      <EditableName
                        id={p.id}
                        value={p.company_name}
                        fieldName="companyName"
                        label="company name"
                        action={updatePartnerCompanyName}
                      />
                    ) : (
                      p.company_name
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">
                    {isAdmin ? (
                      <EditableName
                        id={p.id}
                        value={p.contact_name}
                        fieldName="contactName"
                        label="contact name"
                        action={updatePartnerContactName}
                      />
                    ) : (
                      p.contact_name
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {emailById.get(p.id) ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{p.role}</td>
                  <td className="px-4 py-3">{statusPill(p.status)}</td>
                  <td className="px-4 py-3">
                    {isAdmin ? (
                      <InternalToggle id={p.id} isInternal={Boolean(p.is_internal)} />
                    ) : (
                      <span className="text-xs text-neutral-500">
                        {p.is_internal ? "Internal ✓" : "—"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {formatDate(p.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    {isAdmin ? (
                      <PartnerRowActions
                        id={p.id}
                        status={p.status as "active" | "invited" | "suspended"}
                      />
                    ) : (
                      <span className="text-xs text-neutral-400">—</span>
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
