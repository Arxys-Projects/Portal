"use client";

// The internal-only second nav bar (screenshot 2c) — a navy strip immediately
// below the ordinary partner header, holding the destinations that only exist
// for internal/admin viewers. Deliberately global chrome (rendered from the
// shared (app) layout, not from /projects itself): SALES is the only link that
// points at /projects, so it has to render on every page an internal user
// visits or there would be no way to navigate there in the first place.
//
// Nothing partner-facing changes — this renders nothing at all for a partner
// viewer (the layout only mounts it when isAdminOrInternal).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui/styles";

type InternalNavItem = { label: string; href: string };

const SIBLINGS: InternalNavItem[] = [
  { label: "Partners", href: "/admin/partners" },
  { label: "Requests", href: "/admin/requests" },
  { label: "Specs & Datasheets", href: "/admin/datasheets" },
];

export default function InternalBar({
  pendingRequests = 0,
}: {
  pendingRequests?: number;
}) {
  const pathname = usePathname();
  const salesActive = pathname === "/projects" || pathname.startsWith("/projects/");

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="w-full bg-arxys-navy">
      <div className="mx-auto flex max-w-[1320px] items-center gap-6 px-6">
        <Link
          href="/projects"
          aria-current={salesActive ? "page" : undefined}
          className={cx(
            "border-b-2 py-3 text-[19px] font-extrabold uppercase tracking-[0.05em] transition-colors",
            salesActive
              ? "border-arxys-gold text-white"
              : "border-transparent text-[#c3cee3] hover:text-white",
          )}
        >
          Sales
        </Link>

        <nav className="flex items-center gap-5">
          {SIBLINGS.map((item) => {
            const active = isActive(item.href);
            const showBadge = item.href === "/admin/requests" && pendingRequests > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex items-center gap-1.5 text-[13.5px] font-medium transition-colors",
                  active ? "text-white" : "text-[#a9b7d4] hover:text-white",
                )}
              >
                {item.label}
                {showBadge ? (
                  <span
                    className="inline-flex min-w-[1.125rem] items-center justify-center rounded-full bg-arxys-gold px-1.5 py-0.5 text-[11px] font-bold leading-none text-arxys-text-on-gold"
                    aria-label={`${pendingRequests} pending`}
                  >
                    {pendingRequests}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
