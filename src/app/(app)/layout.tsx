import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "./_actions/logout";
import InternalBar from "./_components/internal-bar";
import PortalHeader from "./_components/portal-header";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: partner } = await supabase
    .from("partners")
    .select("company_name, contact_name, role, status, is_internal")
    .eq("id", user.id)
    .maybeSingle();

  if (partner?.status === "suspended") {
    // Sign out before redirecting — otherwise the proxy bounces the still-authed
    // user from /login back to /dashboard (src/lib/supabase/proxy.ts:59-64).
    await supabase.auth.signOut();
    redirect("/login?error=suspended");
  }

  if (partner?.status === "invited") {
    // First protected-page load after invite → flip to 'active'. Use the
    // service-role client so we don't depend on the partners-UPDATE RLS policy
    // admitting a self-status change; the operation is idempotent.
    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from("partners")
      .update({ status: "active" })
      .eq("id", user.id);
    if (error) {
      console.error("auto-activate failed", { userId: user.id, error });
    }
  }

  const isAdmin = partner?.role === "admin";
  const isInternal = Boolean(partner?.is_internal);
  // Phase 8 Step C — internal users get the same partner-grouped pipeline
  // view + invite-partner flow as admins, read-only.
  const isAdminOrInternal = isAdmin || isInternal;

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
