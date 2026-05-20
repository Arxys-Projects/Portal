import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    notFound();
  }

  const { data: partner } = await supabase
    .from("partners")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();

  // Defensive re-check — RLS already prevents non-admins from reading the rows
  // we'd load, but failing closed at the layout avoids partial-render leaks
  // and gives admin-only existence (404, not 403).
  if (partner?.role !== "admin" || partner.status !== "active") {
    notFound();
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[200px_1fr]">
      <nav className="md:sticky md:top-4 md:self-start">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Admin
        </p>
        <ul className="flex flex-col gap-1 text-sm">
          <li>
            <Link
              href="/admin"
              className="block rounded px-2 py-1.5 text-neutral-700 hover:bg-neutral-100"
            >
              Overview
            </Link>
          </li>
          <li>
            <Link
              href="/admin/partners"
              className="block rounded px-2 py-1.5 text-neutral-700 hover:bg-neutral-100"
            >
              Partners
            </Link>
          </li>
          <li>
            <Link
              href="/admin/submissions"
              className="block rounded px-2 py-1.5 text-neutral-700 hover:bg-neutral-100"
            >
              Submissions
            </Link>
          </li>
        </ul>
        <p className="mt-6 mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Back to
        </p>
        <ul className="flex flex-col gap-1 text-sm">
          <li>
            <Link
              href="/dashboard"
              className="block rounded px-2 py-1.5 text-neutral-700 hover:bg-neutral-100"
            >
              Dashboard
            </Link>
          </li>
        </ul>
      </nav>
      <div>{children}</div>
    </div>
  );
}
