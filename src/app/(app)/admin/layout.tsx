import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { requireAdminOrInternal } from "@/lib/auth/require-admin-or-internal";
import AdminNav from "./_components/admin-nav";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Phase 8 Step C — admins and is_internal users both reach /admin/*.
  // Mutating actions and the XLSX export still gate on isAdmin inside their
  // own handlers / components. Failing closed at the layout gives the same
  // admin-only existence (404, not 403) for everyone else.
  const gate = await requireAdminOrInternal();
  if (!gate.ok) notFound();

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[208px_1fr]">
      <nav className="md:sticky md:top-4 md:self-start">
        <AdminNav />
      </nav>
      <div>{children}</div>
    </div>
  );
}
