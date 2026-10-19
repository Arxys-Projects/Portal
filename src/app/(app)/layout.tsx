import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getViewer, isActive, isStaff } from "@/lib/auth/viewer";
import { signOut } from "./_actions/logout";
import InternalBar from "./_components/internal-bar";
import PortalHeader from "./_components/portal-header";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const viewer = await getViewer();
  if (!viewer) {
    redirect("/login");
  }
  const { user } = viewer;
  let partner = viewer.partner;

  if (partner?.status === "invited") {
    // First protected-page load after invite → flip to 'active'. Use the
    // service-role client so we don't depend on the partners-UPDATE RLS policy
    // admitting a self-status change; the operation is idempotent. A failed
    // flip throws to the error page and keeps the session, so a reload
    // retries it; signing the invitee out here would tell them they have no
    // access. The page shares the cache()d viewer, so on this first load it
    // always sees 'invited'; a page gate on requireActive() would 404 it.
    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from("partners")
      .update({ status: "active" })
      .eq("id", user.id);
    if (error) {
      console.error("auto-activate failed", { userId: user.id, error });
      throw new Error("Could not finish setting up your account. Reload the page to try again.");
    }
    partner = { ...partner, status: "active" };
  }

  // Fail closed (ADR 0164): only an active partners row gets in. Suspended
  // and row-less Auth users are signed out. Sign out before redirecting —
  // otherwise the proxy bounces the still-authed user from /login back to
  // /dashboard (src/lib/supabase/proxy.ts:59-64). A layout runs on full
  // document loads only: it renders in parallel with the page and does not
  // re-run on client navigation. Actions, route handlers and sensitive pages
  // call requireActive() themselves.
  if (!isActive({ user, partner })) {
    await supabase.auth.signOut();
    redirect(
      partner?.status === "suspended" ? "/login?error=suspended" : "/login?error=no_access",
    );
  }

  // Phase 8 Step C — internal users get the same partner-grouped pipeline
  // view + invite-partner flow as admins, read-only.
  const isAdminOrInternal = isStaff({ user, partner });

  // Pending access-request count for the internal bar's Requests badge — the
  // same query admin/layout.tsx runs, needed here too now that Requests is
  // reachable from every page an internal viewer is on, not just /admin/*.
  let pendingRequests = 0;
  if (isAdminOrInternal) {
    const { count } = await supabase
      .from("access_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    pendingRequests = count ?? 0;
  }

  return (
    <div className="min-h-screen bg-page">
      <PortalHeader
        contactName={partner?.contact_name ?? null}
        companyName={partner?.company_name ?? null}
        hasPartner={Boolean(partner)}
        showAdmin={isAdminOrInternal}
        signOutAction={signOut}
      />
      {isAdminOrInternal ? <InternalBar pendingRequests={pendingRequests} /> : null}
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
