"use client";

// PortalHeader — the one full-width app chrome bar (ADR 0075 reskin).
// Client component so it can derive the active tab from usePathname() and run
// the <900px collapse. The sign-out server action is passed in from the server
// layout; all data (name/company/admin) arrives as plain props.
//
// "Compare ▾" is a dropdown covering the two comparison tools (ADR 0084 —
// Compare split): one persuasion destination (VMS Server Comparison) and one
// selection utility (VideoX Quick Compare), sharing a single top-level slot
// because the bar already fought crowding (ADR 0070).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import HelpModal from "@/app/(app)/dashboard/help-modal";
import { cx } from "./ui/styles";

// ── Nav ────────────────────────────────────────────────────────────────────
// Internal items map 1:1 to routes; "Support" is the one external item,
// pointing at the live Arxys support page (same URL the dashboard card uses).
const SUPPORT_URL = "https://www.arxys.com/company/support/";

type NavItem = { label: string; href: string; external?: boolean };

const NAV_BEFORE_COMPARE: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Calculator", href: "/calculator" },
  { label: "Pipeline", href: "/submissions" },
];

const COMPARE_ITEMS: (NavItem & { subtitle: string })[] = [
  {
    label: "VMS Server Comparison",
    href: "/comparison",
    subtitle: "Arxys vs a competitor — should I switch",
  },
  {
    label: "VideoX Quick Compare",
    href: "/videox-compare",
    subtitle: "Model vs model — which VideoX",
  },
];

const NAV_AFTER_COMPARE: NavItem[] = [
  { label: "Products & Prices", href: "/price-book" },
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
  const [compareOpen, setCompareOpen] = useState(false);
  const compareRef = useRef<HTMLDivElement>(null);

  // Close the Compare dropdown on outside click / Escape / route change.
  useEffect(() => {
    setCompareOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!compareOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (compareRef.current && !compareRef.current.contains(e.target as Node)) {
        setCompareOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setCompareOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [compareOpen]);

  const isActive = (item: NavItem) =>
    !item.external &&
    (pathname === item.href || pathname.startsWith(item.href + "/"));

  const compareActive = COMPARE_ITEMS.some(isActive);

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
            {NAV_BEFORE_COMPARE.map(deskNavLink)}

            {/* Compare ▾ dropdown */}
            <div
              ref={compareRef}
              className={cx(
                "relative flex items-center border-b-2 py-[19px]",
                compareActive ? "border-arxys-navy" : "border-transparent",
              )}
            >
              <button
                type="button"
                onClick={() => setCompareOpen((v) => !v)}
                aria-expanded={compareOpen}
                aria-haspopup="menu"
                className={cx(
                  "whitespace-nowrap text-[13.5px] font-medium transition-colors hover:text-arxys-navy",
                  compareActive
                    ? "font-semibold text-arxys-navy"
                    : "text-[#3a4351]",
                )}
              >
                Compare ▾
              </button>
              {compareOpen ? (
                <div
                  role="menu"
                  className="absolute -left-2 top-[60px] z-40 w-[250px] overflow-hidden rounded-[10px] border border-line-strong bg-surface shadow-[0_12px_28px_rgba(15,42,83,0.16)]"
                >
                  {COMPARE_ITEMS.map((item, i) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      role="menuitem"
                      onClick={() => setCompareOpen(false)}
                      className={cx(
                        "block px-3.5 py-2.5 transition-colors hover:bg-arxys-navy-soft",
                        i < COMPARE_ITEMS.length - 1 &&
                          "border-b border-line-soft",
                      )}
                    >
                      <span className="block text-[13px] font-bold text-ink">
                        {item.label}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-ink-soft">
                        {item.subtitle}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>

            {NAV_AFTER_COMPARE.map(deskNavLink)}
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

      {/* Mobile: dropdown panel — Compare's two tools listed flat */}
      {menuOpen ? (
        <div className="border-t border-line bg-surface px-6 py-3 min-[900px]:hidden">
          <div className="flex flex-col gap-3">
            {NAV_BEFORE_COMPARE.map((item) => navLink(item, () => setMenuOpen(false)))}
            {COMPARE_ITEMS.map((item) => navLink(item, () => setMenuOpen(false)))}
            {NAV_AFTER_COMPARE.map((item) => navLink(item, () => setMenuOpen(false)))}
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
