import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { requireAdminOrInternal } from "@/lib/auth/require-admin-or-internal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AdminNav from "./_components/admin-nav";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Phase 8 Step C — admins and is_internal users both reach /admin/*.
  // Mutating actions and the XLSX export still gate on isAdmin inside their
  // own handlers / components. Failing closed at the layout gives the same
  // admin-only existence (404, not 403) for everyone else.
  const gate = await requireAdminOrInternal();
  if (!gate.ok) notFound();

  // Pending access-request count for the nav badge. RLS lets admin/internal
  // read access_requests; no polling — refreshes on normal navigation.
  const supabase = await createSupabaseServerClient();
  const { count: pendingRequests } = await supabase
    .from("access_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[208px_1fr]">
      <nav className="md:sticky md:top-4 md:self-start">
        <AdminNav pendingRequests={pendingRequests ?? 0} />
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
