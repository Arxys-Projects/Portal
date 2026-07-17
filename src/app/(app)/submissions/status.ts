// Submission lifecycle status — reduced to three states (ADR 0081).
// Single source of truth for the status enum, ordering, and display metadata.
// Shared by the Server Actions, the partner pipeline view, and the admin list.
// No framework imports here so it is safe in both server and client bundles.
//
// The column is NOT NULL with default 'open' (ADR 0081): every submission is
// exactly one of open / won / lost. The old draft/sent/on-hold/NULL states were
// folded into 'open' by the 20260717000002 migration.

export const SUBMISSION_STATUSES = ["open", "won", "lost"] as const;

export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

// `badge` = soft-tint pill classes; `dot` = the solid status colour used by the
// pipeline status <select> dot (ADR 0075 palette). Only presentation fields —
// the enum, labels, and helpers below stay the single source of truth.
// TODO(0081-ui): the Design pass finalizes the treatment (Won highlighted,
// Lost de-emphasized/greyed). These are functional placeholders.
export const STATUS_META: Record<
  SubmissionStatus,
  { label: string; badge: string; dot: string }
> = {
  open: { label: "Open", badge: "bg-[#eef2f8] text-[#2c4a7c] border-[#cdd9ec]", dot: "#3a5c9a" },
  won: { label: "Won", badge: "bg-[#e7f4ec] text-[#136340] border-[#b6ddc6]", dot: "#177a4f" },
  lost: { label: "Lost", badge: "bg-[#fbeceb] text-[#a12c20] border-[#f0c6c1]", dot: "#c0392b" },
};

// Delete is permitted only when the submission has no terminal state, i.e. it
// is still Open. Won / Lost are protected (mirrors the DB delete-guard).
export function isDeletable(status: SubmissionStatus): boolean {
  return status === "open";
}
