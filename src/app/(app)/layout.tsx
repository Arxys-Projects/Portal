import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "./_actions/logout";

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
    .select("company_name, contact_name, role, status")
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

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <img
              src="/email/arxys-logo.png"
              alt="Arxys"
              width={140}
              height={24}
              style={{ height: "auto" }}
            />
            {partner ? (
              <p className="text-xs text-neutral-500">
                {partner.company_name} · {partner.contact_name}
                {partner.role === "admin" ? " · admin" : null}
              </p>
            ) : (
              <p className="text-xs text-amber-600">
                Your account is missing a partner record. Contact an admin.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isAdmin ? (
              <Link
                href="/admin"
                className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
              >
                Admin
              </Link>
            ) : null}
            <form action={signOut}>
              <button
                type="submit"
                className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
