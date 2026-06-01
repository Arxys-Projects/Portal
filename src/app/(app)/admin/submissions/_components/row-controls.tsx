"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SUBMISSION_STATUSES, STATUS_META, type SubmissionStatus } from "@/app/(app)/submissions/status";
import { adminUpdateStatus, adminDeleteSubmission } from "../actions";

export function RowControls({
  submissionId,
  status,
}: {
  submissionId: string;
  status: SubmissionStatus | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    const next = val === "" ? null : (val as SubmissionStatus);
    setError(null);
    startTransition(async () => {
      const res = await adminUpdateStatus(submissionId, next);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const res = await adminDeleteSubmission(submissionId);
      if (!res.ok) {
        setError(res.error);
        setConfirmDelete(false);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={status ?? ""}
        onChange={handleStatusChange}
        disabled={isPending}
        className="rounded border border-neutral-300 px-1.5 py-0.5 text-xs text-neutral-700 focus:border-blue-500 focus:outline-none disabled:opacity-50"
      >
        <option value="">— no status —</option>
        {SUBMISSION_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_META[s].label}
          </option>
        ))}
      </select>

      {confirmDelete ? (
        <div className="flex items-center gap-1">
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="rounded bg-red-600 px-2 py-0.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            Confirm delete
          </button>
          <button
            onClick={() => setConfirmDelete(false)}
            disabled={isPending}
            className="text-xs text-neutral-500 hover:underline"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirmDelete(true)}
          disabled={isPending}
          className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
          title="Delete submission"
        >
          Delete
        </button>
      )}

      {error ? (
        <span className="text-xs text-red-600">{error}</span>
      ) : null}
    </div>
  );
}
