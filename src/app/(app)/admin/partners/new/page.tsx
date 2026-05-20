import Link from "next/link";
import { InviteForm } from "./invite-form";

export default function NewPartnerPage() {
  return (
    <div className="max-w-xl">
      <div className="mb-4">
        <Link
          href="/admin/partners"
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back to partners
        </Link>
      </div>
      <h1 className="text-2xl font-semibold text-neutral-900">Invite partner</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Sends a Supabase invite email. The partner clicks the link, sets a
        password, and lands on the dashboard. Their status auto-flips from
        &lsquo;invited&rsquo; to &lsquo;active&rsquo; on their first sign-in.
      </p>
      <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-6">
        <InviteForm />
      </div>
    </div>
  );
}
