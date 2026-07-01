"use client";

// PortalHeader — the one full-width app chrome bar (ADR 0075 reskin).
// Client component so it can derive the active tab from usePathname() and run
// the <900px collapse. The sign-out server action is passed in from the server
// layout; all data (name/company/admin) arrives as plain props.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import HelpModal from "@/app/(app)/dashboard/help-modal";
import { cx } from "./ui/styles";

// ── Nav ────────────────────────────────────────────────────────────────────
// Internal items map 1:1 to routes; the two "external" items are the brief's
// Resources + Support. Support points at the live Arxys support page (same URL
// the dashboard card uses). Resources has no in-app route yet — PLACEHOLDER
// until Andy confirms the real destination.
const RESOURCES_URL = "https://www.arxys.com/support/"; // footer's "Support & Resources" target; confirm if a dedicated resources page exists
const SUPPORT_URL = "https://www.arxys.com/company/support/";

type NavItem = { label: string; href: string; external?: boolean };

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Calculator", href: "/calculator" },
  { label: "Pipeline", href: "/submissions" },
  { label: "Compare", href: "/videox-compare" },
  { label: "Products & Prices", href: "/price-book" },
  { label: "Resources", href: RESOURCES_URL, external: true },
  { label: "Support", href: SUPPORT_URL, external: true },
];

function initialsOf(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

interface PortalHeaderProps {
  contactName: string | null;
  companyName: string | null;
  hasPartner: boolean;
  showAdmin: boolean;
  signOutAction: () => Promise<void>;
}

export default function PortalHeader({
  contactName,
  companyName,
  hasPartner,
  showAdmin,
  signOutAction,
}: PortalHeaderProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (item: NavItem) =>
    !item.external &&
    (pathname === item.href || pathname.startsWith(item.href + "/"));

  function navLink(item: NavItem, onClick?: () => void) {
    const active = isActive(item);
    const base =
      "whitespace-nowrap text-[13.5px] font-medium transition-colors hover:text-arxys-navy";
    if (item.external) {
      return (
        <a
          key={item.label}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClick}
          className={cx(base, "text-[#3a4351]")}
        >
          {item.label}
        </a>
      );
    }
    return (
      <Link
        key={item.label}
        href={item.href}
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        className={cx(
          base,
          active ? "font-semibold text-arxys-navy" : "text-[#3a4351]",
        )}
      >
        {item.label}
      </Link>
    );
  }

  // Desktop nav item with the 2px underline sitting on the bar's bottom edge.
  function deskNavLink(item: NavItem) {
    const active = isActive(item);
    return (
      <div
        key={item.label}
        className={cx(
          "flex items-center border-b-2 py-[19px]",
          active ? "border-arxys-navy" : "border-transparent",
        )}
      >
        {navLink(item)}
      </div>
    );
  }

  const avatar = (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-arxys-navy text-[12px] font-semibold text-white">
      {initialsOf(contactName)}
    </span>
  );

  return (
    <header className="w-full border-b border-line bg-surface">
      <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-4 px-6">
        {/* Left: logo lockup + desktop nav */}
        <div className="flex items-center gap-7">
          <Link href="/dashboard" className="flex items-center gap-2.5 py-[13px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/email/arxys-logo.png"
              alt="Arxys"
              width={104}
              height={22}
              style={{ height: "22px", width: "auto" }}
            />
            <span className="hidden text-[13px] font-medium text-[#5c6472] sm:inline">
              <span className="mr-2 text-[#c7ced8]">|</span>Partner Portal
            </span>
          </Link>
          <nav className="hidden items-center gap-6 min-[900px]:flex">
            {NAV_ITEMS.map(deskNavLink)}
          </nav>
        </div>

        {/* Right: guide + admin + user (desktop) */}
        <div className="hidden items-center gap-4 min-[900px]:flex">
          <HelpModal />
          {showAdmin ? (
            <Link
              href="/admin"
              aria-current={pathname.startsWith("/admin") ? "page" : undefined}
              className={cx(
                "text-[13.5px] font-medium transition-colors hover:text-arxys-navy",
                pathname.startsWith("/admin")
                  ? "font-semibold text-arxys-navy"
                  : "text-[#3a4351]",
              )}
            >
              Admin
            </Link>
          ) : null}
          <div className="flex items-center gap-2.5 border-l border-[#e2e6ea] pl-4">
            {hasPartner ? (
              <>
                {avatar}
                <span className="text-[13.5px] font-semibold text-[#26303f]">
                  {contactName ?? "Account"}
                </span>
              </>
            ) : (
              <span className="text-xs text-amber-600">
                No partner record — contact an admin.
              </span>
            )}
            <form action={signOutAction}>
              <button
                type="submit"
                className="ml-1 rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium text-ink-soft transition-colors hover:border-arxys-navy hover:text-arxys-navy"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>

        {/* Mobile: hamburger */}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          className="my-3 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink-soft min-[900px]:hidden"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {menuOpen ? <path d="M18 6 6 18M6 6l12 12" /> : <><path d="M3 6h18" /><path d="M3 12h18" /><path d="M3 18h18" /></>}
          </svg>
        </button>
      </div>

      {/* Mobile: dropdown panel */}
      {menuOpen ? (
        <div className="border-t border-line bg-surface px-6 py-3 min-[900px]:hidden">
          <div className="flex flex-col gap-3">
            {NAV_ITEMS.map((item) => navLink(item, () => setMenuOpen(false)))}
            {showAdmin ? (
              <Link
                href="/admin"
                onClick={() => setMenuOpen(false)}
                className={cx(
                  "text-[13.5px] font-medium hover:text-arxys-navy",
                  pathname.startsWith("/admin")
                    ? "font-semibold text-arxys-navy"
                    : "text-[#3a4351]",
                )}
              >
                Admin
              </Link>
            ) : null}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
            <div className="flex items-center gap-2.5">
              {avatar}
              <span className="text-[13.5px] font-semibold text-[#26303f]">
                {hasPartner ? contactName ?? "Account" : "No partner record"}
                {companyName ? (
                  <span className="ml-1 font-normal text-ink-soft">· {companyName}</span>
                ) : null}
              </span>
            </div>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium text-ink-soft hover:border-arxys-navy hover:text-arxys-navy"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </header>
  );
}
