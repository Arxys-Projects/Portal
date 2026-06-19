import type { ReactNode } from "react";
import { cx } from "./styles";

/**
 * A single metric tile for data panels that are NOT destinations — the
 * dashboard Pipeline Summary and admin top-stat rows (ADR 0067). No arrow,
 * no hover affordance: it reports a number, it doesn't navigate.
 */
export function MetricTile({
  label,
  value,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "rounded-lg border border-line-soft bg-arxys-navy-soft px-3.5 py-3",
        className,
      )}
    >
      <p className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">
        {label}
      </p>
      <div className="mt-1 text-xl font-extrabold tabular-nums text-ink">
        {value}
      </div>
    </div>
  );
}
