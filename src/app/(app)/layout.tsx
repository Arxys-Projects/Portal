import { redirect } from "next/navigation";
import type { ReactNode } from "react";
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
    .select("company_name, contact_name, role")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-neutral-900">
              Arxys Partner Portal
            </p>
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
          <form action={signOut}>
            <button
              type="submit"
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
