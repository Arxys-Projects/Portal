import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminOrInternal } from "@/lib/auth/require-admin-or-internal";
import { InviteForm } from "./invite-form";

export default async function NewPartnerPage() {
  const gate = await requireAdminOrInternal();
  if (!gate.ok) notFound();

  return (
    <div className="max-w-xl">
      <div className="mb-4">
        <Link
          href="/admin/partners"
          className="text-sm font-medium text-arxys-navy hover:underline"
        >
          ← Back to partners
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-ink">Invite partner</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Sends a Supabase invite email. The partner clicks the link, sets a
        password, and lands on the dashboard. Their status auto-flips from
        &lsquo;invited&rsquo; to &lsquo;active&rsquo; on their first sign-in.
      </p>
      <div className="mt-6 rounded-xl border-2 border-line bg-surface p-6">
        <InviteForm showInternalToggle={gate.isAdmin} />
      </div>
    </div>
  );
}
