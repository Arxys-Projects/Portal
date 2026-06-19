import type { ReactNode } from "react";
import {
  STATUS_META,
  NO_STATUS_BADGE,
  type SubmissionStatus,
} from "@/app/(app)/submissions/status";
import { cx, BADGE_BASE, BADGE_SOURCE, BADGE_ON_BEHALF } from "./styles";

type StatusBadgeProps =
  | { variant: "source"; children: ReactNode; className?: string }
  | { variant: "on-behalf"; children: ReactNode; className?: string }
  | {
      variant: "status";
      status: SubmissionStatus | null;
      /** Optional trailing content (e.g. a count) shown after the label. */
      children?: ReactNode;
      className?: string;
    };

/**
 * One StatusBadge collapsing the portal's scattered chips into three semantic
 * variants (ADR 0067, Decision 6):
 *   • source    — provenance (e.g. Pipedrive), navy.
 *   • status    — submission lifecycle; colours come from STATUS_META so the
 *                 enum stays the single source of truth.
 *   • on-behalf — attribution; neutral (the gold treatment is retired).
 */
export function StatusBadge(props: StatusBadgeProps) {
  if (props.variant === "status") {
    const meta = props.status ? STATUS_META[props.status] : null;
    return (
      <span className={cx(BADGE_BASE, meta?.badge ?? NO_STATUS_BADGE, props.className)}>
        {meta?.label ?? "No status"}
        {props.children != null ? (
          <span className="font-bold opacity-80">{props.children}</span>
        ) : null}
      </span>
    );
  }

  const tone = props.variant === "source" ? BADGE_SOURCE : BADGE_ON_BEHALF;
  return (
    <span className={cx(BADGE_BASE, tone, props.className)}>{props.children}</span>
  );
}
