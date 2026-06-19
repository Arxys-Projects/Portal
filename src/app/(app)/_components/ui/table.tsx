import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from "react";
import { cx } from "./styles";

/**
 * One Table chrome for every list page (ADR 0067, Decision 5): shared header
 * weight, border colour, row height, cell padding, and hover. Wrap in the
 * `Table` element (it provides the horizontal-scroll container + outer border)
 * and compose with THead/TBody/TR/TH/TD.
 */
export function Table({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border-2 border-line">
      <table className={cx("w-full border-collapse text-sm", className)}>
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead>{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TR({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <tr className={cx("transition-colors hover:bg-[#f7f9fc]", className)}>
      {children}
    </tr>
  );
}

interface CellProps {
  numeric?: boolean;
  className?: string;
  children?: ReactNode;
}

export function TH({
  numeric,
  className,
  children,
  ...rest
}: CellProps & ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cx(
        "border-b-2 border-line bg-arxys-navy-soft px-3.5 py-2.5",
        "text-[11px] font-extrabold uppercase tracking-wide text-ink-soft",
        numeric ? "text-right" : "text-left",
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export function TD({
  numeric,
  className,
  children,
  ...rest
}: CellProps & TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cx(
        "border-b border-line-soft px-3.5 py-3 text-ink",
        numeric ? "text-right tabular-nums" : "",
        className,
      )}
      {...rest}
    >
      {children}
    </td>
  );
}
