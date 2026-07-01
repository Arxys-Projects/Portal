"use client";

import type { SelectHTMLAttributes } from "react";
import { cx } from "./styles";

/**
 * One styled Select — replaces every native `<select>` across the portal
 * (My Pipeline, both Admin views, status dropdowns). Keeps native semantics
 * and keyboard behaviour; only the chrome and chevron are restyled to match
 * the calculator's form vocabulary, recoloured to the navy accent.
 */
export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cx(
          "w-full appearance-none rounded-lg border border-[#b9c4d5] bg-surface text-ink",
          "text-sm pl-3 pr-9 py-2.5 cursor-pointer transition-colors",
          "focus:outline-none focus:border-arxys-navy focus:ring-2 focus:ring-arxys-navy/15",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-arxys-navy"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  );
}
