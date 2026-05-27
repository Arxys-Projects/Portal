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

export const STATUS_META: Record<
  SubmissionStatus,
  { label: string; badge: string }
> = {
  draft: { label: "Draft", badge: "bg-neutral-100 text-neutral-700 border-neutral-300" },
  sent: { label: "Sent", badge: "bg-blue-100 text-blue-800 border-blue-300" },
  won: { label: "Won", badge: "bg-green-100 text-green-800 border-green-300" },
  lost: { label: "Lost", badge: "bg-red-100 text-red-800 border-red-300" },
  "on-hold": { label: "On Hold", badge: "bg-yellow-100 text-yellow-800 border-yellow-300" },
};

// Styling for a submission with no status set.
export const NO_STATUS_BADGE = "bg-neutral-50 text-neutral-400 border-neutral-200";

// A status counts as "active" (advanced past draft) for pipeline sort order.
export function isActiveStatus(status: SubmissionStatus | null): boolean {
  return status !== null && status !== "draft";
}

// Delete is permitted only when the submission carries no business state.
export function isDeletable(status: SubmissionStatus | null): boolean {
  return status === null || status === "draft";
}
