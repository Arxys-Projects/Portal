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
  { label: "Partner Pipeline", href: "/admin/submissions" },
];

export default function AdminNav() {
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
        {ITEMS.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className={linkClass(isActive(item.href, item.exact))}>
              {item.label}
            </Link>
          </li>
        ))}
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
