import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { requireAdminOrInternal } from "@/lib/auth/require-admin-or-internal";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Phase 8 Step C — admins and is_internal users both reach /admin/*.
  // Mutating actions and the XLSX export still gate on isAdmin inside their
  // own handlers / components. Failing closed at the layout gives the same
  // admin-only existence (404, not 403) for everyone else.
  const gate = await requireAdminOrInternal();
  if (!gate.ok) notFound();

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
              Partner Pipeline
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
