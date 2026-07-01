import type { ReactNode } from "react";
import { cx } from "./styles";

/**
 * A single metric tile for data panels that are NOT destinations — the
 * dashboard Pipeline Summary and admin top-stat rows (ADR 0067). No arrow,
 * no hover affordance: it reports a number, it doesn't navigate.
 *
 * ADR 0075 adds a `stat` treatment: a true-white card with a 3px navy top rule
 * and a navy number (the mockup's totals / admin-stat look). `soft` is the
 * original navy-tint tile and stays the default so existing callers are
 * unchanged.
 */
export function MetricTile({
  label,
  value,
  variant = "soft",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  variant?: "soft" | "stat";
  className?: string;
}) {
  const isStat = variant === "stat";
  return (
    <div
      className={cx(
        isStat
          ? "rounded-[10px] border border-line border-t-[3px] border-t-arxys-navy bg-surface px-4 py-3.5"
          : "rounded-lg border border-line-soft bg-arxys-navy-soft px-3.5 py-3",
        className,
      )}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#3f4b5b]">
        {label}
      </p>
      <div
        className={cx(
          "mt-1 font-extrabold tabular-nums",
          isStat ? "text-2xl text-arxys-navy" : "text-xl text-ink",
        )}
      >
        {value}
      </div>
    </div>
  );
}
