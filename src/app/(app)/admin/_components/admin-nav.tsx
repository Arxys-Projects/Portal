"use client";

// Admin sub-nav (ADR 0075 reskin). Client component so the current section can
// be highlighted via usePathname(); the layout that renders it stays a server
// component (it awaits the admin gate).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/app/(app)/_components/ui/styles";

const ITEMS = [
  { label: "Overview", href: "/admin", exact: true },
  { label: "Partners", href: "/admin/partners" },
  { label: "Requests", href: "/admin/requests" },
  { label: "Partner Pipeline", href: "/admin/submissions" },
];

export default function AdminNav({ pendingRequests = 0 }: { pendingRequests?: number }) {
  const pathname = usePathname();
  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  const linkClass = (active: boolean) =>
    cx(
      "block rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors",
      active
        ? "bg-arxys-navy font-semibold text-white"
        : "text-[#3a4656] hover:bg-arxys-navy-soft hover:text-arxys-navy",
    );

  return (
    <>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.09em] text-[#5c6472]">
        Admin
      </p>
      <ul className="flex flex-col gap-1">
        {ITEMS.map((item) => {
          const showBadge = item.href === "/admin/requests" && pendingRequests > 0;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cx(
                  linkClass(isActive(item.href, item.exact)),
                  "flex items-center justify-between gap-2",
                )}
              >
                <span>{item.label}</span>
                {showBadge ? (
                  <span
                    className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-arxys-gold px-1.5 py-0.5 text-[11px] font-bold leading-none text-arxys-text-on-gold"
                    aria-label={`${pendingRequests} pending`}
                  >
                    {pendingRequests}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-6 mb-2 text-[11px] font-bold uppercase tracking-[0.09em] text-[#5c6472]">
        Back to
      </p>
      <ul className="flex flex-col gap-1">
        <li>
          <Link href="/dashboard" className={linkClass(false)}>
            Dashboard
          </Link>
        </li>
      </ul>
    </>
  );
}
