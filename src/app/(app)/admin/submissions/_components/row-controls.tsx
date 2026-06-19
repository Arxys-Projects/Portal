"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SUBMISSION_STATUSES, STATUS_META, type SubmissionStatus } from "@/app/(app)/submissions/status";
import { Button, IconButton, Select } from "@/app/(app)/_components/ui";
import { adminUpdateStatus, adminDeleteSubmission } from "../actions";

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

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
      <div className="w-32">
        <Select
          aria-label="Submission status"
          value={status ?? ""}
          onChange={handleStatusChange}
          disabled={isPending}
          className="py-1 pr-8 text-xs"
        >
          <option value="">— no status —</option>
          {SUBMISSION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </Select>
      </div>

      {confirmDelete ? (
        <div className="flex items-center gap-1">
          <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isPending}>
            Confirm delete
          </Button>
          <button
            onClick={() => setConfirmDelete(false)}
            disabled={isPending}
            className="text-xs font-medium text-ink-soft hover:text-ink"
          >
            Cancel
          </button>
        </div>
      ) : (
        <IconButton
          tone="danger"
          label="Delete submission"
          onClick={() => setConfirmDelete(true)}
          disabled={isPending}
          className="h-8 w-8"
        >
          <TrashIcon />
        </IconButton>
      )}

      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
  );
}
