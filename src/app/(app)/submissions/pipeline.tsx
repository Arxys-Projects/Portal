"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  STATUS_META,
  SUBMISSION_STATUSES,
  NO_STATUS_BADGE,
  isDeletable,
  type SubmissionStatus,
} from "./status";
import {
  deleteSubmission,
  togglePreferred,
  updateSubmissionStatus,
  type ActionResult,
} from "./actions";

export type StatusFilter = "all" | SubmissionStatus | "none";

export type PipelineRow = {
  id: string;
  createdAt: string;
  recommendedUnits: number;
  totalListPriceUsd: number | null;
  status: SubmissionStatus | null;
  isPreferred: boolean;
  productGroup: string | null;
  familySlug: string | null;
};

export type PipelineGroup = {
  key: string;
  projectName: string | null; // null = ungrouped
  rows: PipelineRow[];
};

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  ...SUBMISSION_STATUSES.map((s) => ({ value: s, label: STATUS_META[s].label })),
  { value: "none", label: "No Status" },
];

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

function formatPrice(n: number | null): string {
  if (n === null) return "—";
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={filled ? "#FBB040" : "none"}
      stroke={filled ? "#FBB040" : "currentColor"}
      strokeWidth="2"
      strokeLinejoin="round"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

export function Pipeline({
  groups,
  activeStatus,
}: {
  groups: PipelineGroup[];
  activeStatus: StatusFilter;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function perform(id: string, fn: () => Promise<ActionResult>) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error);
      } else {
        router.refresh();
      }
      setBusyId(null);
      setConfirmDeleteId(null);
    });
  }

  const total = groups.reduce((acc, g) => acc + g.rows.length, 0);

  return (
    <div>
      <div className="mb-4">
        <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
          ← Back to dashboard
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">My Pipeline</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Your calculator submissions, grouped by project. {total} shown.
          </p>
        </div>
        <Link
          href="/calculator"
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          New calculation
        </Link>
      </div>

      {/* Status filter bar */}
      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const isActive = f.value === activeStatus;
          return (
            <Link
              key={f.value}
              href={
                f.value === "all"
                  ? { pathname: "/submissions" }
                  : { pathname: "/submissions", query: { status: f.value } }
              }
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                isActive
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {error ? (
        <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {total === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">
          {activeStatus === "all" ? (
            <>
              You have not saved a calculation yet.{" "}
              <Link href="/calculator" className="text-blue-600 hover:underline">
                Start one now.
              </Link>
            </>
          ) : (
            "No submissions match this filter."
          )}
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          {groups.map((group) => (
            <section
              key={group.key}
              className="overflow-hidden rounded-lg border border-neutral-200 bg-white"
            >
              <header className="border-b border-neutral-200 bg-neutral-50 px-4 py-2">
                <h2 className="text-sm font-semibold text-neutral-900">
                  {group.projectName ?? (
                    <span className="text-neutral-500">Ungrouped</span>
                  )}
                </h2>
              </header>
              <table className="w-full text-sm">
                <thead className="text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="w-10 px-4 py-2"></th>
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">Recommendation</th>
                    <th className="px-4 py-2 text-right">List price</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {group.rows.map((row) => {
                    const rowBusy = isPending && busyId === row.id;
                    return (
                      <tr key={row.id} className={rowBusy ? "opacity-50" : undefined}>
                        {/* Preferred star */}
                        <td className="px-4 py-2">
                          <button
                            type="button"
                            aria-label={row.isPreferred ? "Unmark preferred" : "Mark preferred"}
                            title={row.isPreferred ? "Preferred quote" : "Mark as preferred"}
                            disabled={isPending}
                            onClick={() => perform(row.id, () => togglePreferred(row.id))}
                            className="text-neutral-300 hover:text-[#FBB040] disabled:cursor-not-allowed"
                          >
                            <StarIcon filled={row.isPreferred} />
                          </button>
                        </td>

                        {/* Date */}
                        <td className="px-4 py-2 text-neutral-600">{formatDate(row.createdAt)}</td>

                        {/* Recommendation */}
                        <td className="px-4 py-2 text-neutral-700">
                          {row.recommendedUnits} ×{" "}
                          {row.productGroup && row.familySlug ? (
                            <Link
                              href={`/price-book/${row.familySlug}`}
                              className="font-medium text-[#054A91] hover:underline"
                            >
                              {row.productGroup}
                            </Link>
                          ) : (
                            (row.productGroup ?? "")
                          )}
                        </td>

                        {/* List price */}
                        <td className="px-4 py-2 text-right text-neutral-700">
                          {formatPrice(row.totalListPriceUsd)}
                        </td>

                        {/* Status selector */}
                        <td className="px-4 py-2">
                          <select
                            aria-label="Submission status"
                            disabled={isPending}
                            value={row.status ?? ""}
                            onChange={(e) =>
                              perform(row.id, () =>
                                updateSubmissionStatus(
                                  row.id,
                                  e.target.value === ""
                                    ? null
                                    : (e.target.value as SubmissionStatus),
                                ),
                              )
                            }
                            className={`rounded-full border px-2 py-1 text-xs font-medium focus:outline-none disabled:cursor-not-allowed ${
                              row.status ? STATUS_META[row.status].badge : NO_STATUS_BADGE
                            }`}
                          >
                            <option value="">No status</option>
                            {SUBMISSION_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {STATUS_META[s].label}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Actions: View · Revise · PDF · Delete */}
                        <td className="px-4 py-2">
                          <div className="flex items-center justify-end gap-3">
                            <Link
                              href={`/submissions/${row.id}`}
                              className="text-blue-600 hover:underline"
                            >
                              View
                            </Link>
                            <Link
                              href={`/calculator?revise=${row.id}`}
                              className="text-blue-600 hover:underline"
                            >
                              Revise
                            </Link>
                            <a
                              href={`/api/submissions/${row.id}/pdf`}
                              download
                              className="text-blue-600 hover:underline"
                            >
                              PDF
                            </a>
                            {isDeletable(row.status) ? (
                              confirmDeleteId === row.id ? (
                                <span className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={isPending}
                                    onClick={() =>
                                      perform(row.id, () => deleteSubmission(row.id))
                                    }
                                    className="font-medium text-red-600 hover:underline disabled:cursor-not-allowed"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isPending}
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="text-neutral-500 hover:underline"
                                  >
                                    Cancel
                                  </button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  aria-label="Delete submission"
                                  title="Delete (draft only)"
                                  disabled={isPending}
                                  onClick={() => {
                                    setError(null);
                                    setConfirmDeleteId(row.id);
                                  }}
                                  className="text-neutral-400 hover:text-red-600 disabled:cursor-not-allowed"
                                >
                                  <TrashIcon />
                                </button>
                              )
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
