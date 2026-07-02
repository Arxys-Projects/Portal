import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminOrInternal } from "@/lib/auth/require-admin-or-internal";
import { InviteForm } from "./invite-form";

type Search = Promise<{
  requestId?: string;
  email?: string;
  contactName?: string;
  companyName?: string;
}>;

export default async function NewPartnerPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const gate = await requireAdminOrInternal();
  if (!gate.ok) notFound();

  // Approve → prefill handoff from /admin/requests (ADR 0077).
  const { requestId, email, contactName, companyName } = await searchParams;

  return (
    <div className="max-w-xl">
      <div className="mb-4">
        <Link
          href={requestId ? "/admin/requests" : "/admin/partners"}
          className="text-sm font-medium text-arxys-navy hover:underline"
        >
          {requestId ? "← Back to requests" : "← Back to partners"}
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-ink">Invite partner</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Sends a Supabase invite email. The partner clicks the link, sets a
        password, and lands on the dashboard. Their status auto-flips from
        &lsquo;invited&rsquo; to &lsquo;active&rsquo; on their first sign-in.
      </p>
      {requestId ? (
        <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Pre-filled from an access request. Sending the invite will mark that
          request approved.
        </p>
      ) : null}
      <div className="mt-6 rounded-xl border-2 border-line bg-surface p-6">
        <InviteForm
          showInternalToggle={gate.isAdmin}
          defaultEmail={email ?? ""}
          defaultContactName={contactName ?? ""}
          defaultCompanyName={companyName ?? ""}
          requestId={requestId}
        />
      </div>
    </div>
  );
}
