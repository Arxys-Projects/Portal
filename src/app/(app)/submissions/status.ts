// Submission lifecycle status — Phase 3 Step 5.
// Single source of truth for the status enum, ordering, and display metadata.
// Shared by the Server Actions, the partner pipeline view, and the admin list.
// No framework imports here so it is safe in both server and client bundles.

export const SUBMISSION_STATUSES = [
  "draft",
  "sent",
  "won",
  "lost",
  "on-hold",
] as const;

export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

// `badge` = soft-tint pill classes; `dot` = the solid status colour used by the
// pipeline status <select> dot (ADR 0075 palette). Only presentation fields —
// the enum, labels, and helpers below stay the single source of truth.
export const STATUS_META: Record<
  SubmissionStatus,
  { label: string; badge: string; dot: string }
> = {
  draft: { label: "Draft", badge: "bg-[#eef0f3] text-[#5c6472] border-[#d7dce3]", dot: "#8a93a0" },
  sent: { label: "Sent", badge: "bg-[#eaf1fc] text-[#1f4fa8] border-[#c3d8f4]", dot: "#2b62c9" },
  won: { label: "Won", badge: "bg-[#e7f4ec] text-[#136340] border-[#b6ddc6]", dot: "#177a4f" },
  lost: { label: "Lost", badge: "bg-[#fbeceb] text-[#a12c20] border-[#f0c6c1]", dot: "#c0392b" },
  "on-hold": { label: "On Hold", badge: "bg-[#fdf2e2] text-[#9a5f12] border-[#f2d9ac]", dot: "#d98a1e" },
};

// Styling for a submission with no status set.
export const NO_STATUS_BADGE = "bg-[#f2f4f7] text-[#6b7280] border-[#e0e4ea]";
export const NO_STATUS_DOT = "#b7bfc9";

// A status counts as "active" (advanced past draft) for pipeline sort order.
export function isActiveStatus(status: SubmissionStatus | null): boolean {
  return status !== null && status !== "draft";
}

// Delete is permitted only when the submission carries no business state.
export function isDeletable(status: SubmissionStatus | null): boolean {
  return status === null || status === "draft";
}
