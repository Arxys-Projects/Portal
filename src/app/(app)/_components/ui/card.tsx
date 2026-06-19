import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./styles";

/** Base surface — true-white card on the tinted page, firmed 2px border. */
export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        "rounded-xl border-2 border-line bg-surface p-5 shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

function ArrowGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="7" y1="17" x2="17" y2="7" />
      <polyline points="7 7 17 7 17 17" />
    </svg>
  );
}

function DownloadGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

interface NavCardProps {
  href: string;
  title: string;
  subtitle?: string;
  icon: ReactNode;
  /** Corner affordance: navigation arrow (default) or download glyph. */
  variant?: "arrow" | "download";
  /** External URLs render a plain anchor opening in a new tab. */
  external?: boolean;
  /** Horizontal full-width layout (e.g. the Admin footer destination). */
  fullWidth?: boolean;
  className?: string;
}

/**
 * Clickable card — the whole surface navigates (ADR 0067, Decision 7).
 * No inner buttons. Navy icon chip, near-black title, one secondary subtitle,
 * a corner glyph signalling the destination. 3px resting border firming to
 * navy on hover; keyboard-focusable as a link.
 */
export function NavCard({
  href,
  title,
  subtitle,
  icon,
  variant = "arrow",
  external = false,
  fullWidth = false,
  className,
}: NavCardProps) {
  const surface = cx(
    "group relative block rounded-xl border-[3px] border-line-strong bg-surface",
    "shadow-[0_2px_8px_rgba(16,24,40,0.10)] transition-[border-color,box-shadow]",
    "hover:border-arxys-navy hover:shadow-[0_8px_22px_rgba(16,24,40,0.15)]",
    "focus-visible:outline-none focus-visible:border-arxys-navy",
    "focus-visible:ring-2 focus-visible:ring-arxys-navy/40",
    fullWidth ? "flex items-center gap-4 px-6 py-4" : "p-5",
    className,
  );

  const chip = (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-arxys-navy-soft text-arxys-navy">
      {icon}
    </span>
  );

  const corner = (
    <span
      className={cx(
        "text-arxys-navy opacity-60 transition-[opacity,transform]",
        "group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5",
        fullWidth ? "ml-auto" : "absolute right-4 top-4",
      )}
    >
      {variant === "download" ? <DownloadGlyph /> : <ArrowGlyph />}
    </span>
  );

  const body = fullWidth ? (
    <>
      {chip}
      <span className="min-w-0">
        <span className="block text-base font-bold text-ink">{title}</span>
        {subtitle ? (
          <span className="mt-0.5 block text-sm text-ink-soft">{subtitle}</span>
        ) : null}
      </span>
      {corner}
    </>
  ) : (
    <>
      <span className="mb-3 block">{chip}</span>
      {corner}
      <span className="block text-[15px] font-bold text-ink">{title}</span>
      {subtitle ? (
        <span className="mt-1 block text-[13px] text-ink-soft">{subtitle}</span>
      ) : null}
    </>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={surface}>
        {body}
      </a>
    );
  }
  return (
    <Link href={href} className={surface}>
      {body}
    </Link>
  );
}
