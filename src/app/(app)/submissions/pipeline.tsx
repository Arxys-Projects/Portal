"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  STATUS_META,
  SUBMISSION_STATUSES,
  isDeletable,
  type SubmissionStatus,
} from "./status";
import {
  Button,
  IconButton,
  Select,
  StatusBadge,
  buttonClasses,
} from "@/app/(app)/_components/ui";
import {
  deleteSubmission,
  togglePreferred,
  updateSubmissionStatus,
  type ActionResult,
} from "./actions";

export type StatusFilter = "all" | SubmissionStatus;

export type PipelineRow = {
  id: string;
  createdAt: string;
  recommendedUnits: number;
  totalListPriceUsd: number | null;
  status: SubmissionStatus;
  isPreferred: boolean;
  productGroup: string | null;
  familySlug: string | null;
};

export type PipelineGroup = {
  key: string;
  projectName: string | null; // null = ungrouped
  // Set when the viewer ran this project on behalf of a partner (internal only).
  onBehalfCompanyName?: string | null;
  // Set when this project was prepared FOR the viewer by an Arxys rep (Phase 8).
  preparedByArxys?: boolean;
  preparedByRep?: string | null;
  rows: PipelineRow[];
  // ADR 0083 — the viewer's own Project Quote revisions for this project
  // (newest version first). Empty until the partner-SELECT policy is applied.
  quotes?: { submissionId: string; version: number; createdAt: string }[];
};

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  ...SUBMISSION_STATUSES.map((s) => ({ value: s, label: STATUS_META[s].label })),
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
      fill={filled ? "#14346b" : "none"}
      stroke={filled ? "#14346b" : "currentColor"}
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

function fmtAmount(n: number): string {
  if (n === 0) return "$0";
  if (n === Math.floor(n)) return `$${n.toLocaleString()}`;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function Pipeline({
  groups,
  activeStatus,
  openPipeline,
}: {
  groups: PipelineGroup[];
  activeStatus: StatusFilter;
  openPipeline?: number;
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

  // Shared between the desktop table cells and the <sm card layout.
  function renderStatusControl(row: PipelineRow) {
    return (
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: STATUS_META[row.status].dot }}
        />
        <div className="w-36">
          <Select
            aria-label="Submission status"
            disabled={isPending}
            value={row.status}
            onChange={(e) =>
              perform(row.id, () =>
                updateSubmissionStatus(row.id, e.target.value as SubmissionStatus),
              )
            }
            className="py-1.5 pr-8 text-xs"
          >
            {SUBMISSION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </Select>
        </div>
      </div>
    );
  }

  function renderActions(row: PipelineRow) {
    const deletable = isDeletable(row.status);
    return (
      <div className="flex items-center justify-end gap-2">
        <Link href={`/submissions/${row.id}`} className={buttonClasses("primary", "sm")}>
          View
        </Link>
        <Link
          href={`/calculator?revise=${row.id}`}
          className={buttonClasses("secondary", "sm")}
        >
          Revise
        </Link>
        <a
          href={`/api/submissions/${row.id}/pdf`}
          download
          className={buttonClasses("secondary", "sm")}
        >
          PDF
        </a>
        {confirmDeleteId === row.id ? (
          <span className="flex items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={isPending}
              onClick={() => perform(row.id, () => deleteSubmission(row.id))}
            >
              Confirm
            </Button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setConfirmDeleteId(null)}
              className="text-xs font-medium text-ink-soft hover:text-ink disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </span>
        ) : (
          <IconButton
            tone="danger"
            label={deletable ? "Delete (open only)" : "Delete unavailable once won or lost"}
            disabled={isPending || !deletable}
            onClick={() => {
              setError(null);
              setConfirmDeleteId(row.id);
            }}
            className="h-8 w-8"
          >
            <TrashIcon />
          </IconButton>
        )}
      </div>
    );
  }

  function renderStar(row: PipelineRow) {
    return (
      <button
        type="button"
        aria-label={row.isPreferred ? "Unmark preferred" : "Mark preferred"}
        title={row.isPreferred ? "Preferred quote" : "Mark as preferred"}
        disabled={isPending}
        onClick={() => perform(row.id, () => togglePreferred(row.id))}
        className="text-[#c8cfda] transition-colors hover:text-arxys-navy disabled:cursor-not-allowed"
      >
        <StarIcon filled={row.isPreferred} />
      </button>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <Link href="/dashboard" className="text-sm font-medium text-arxys-navy hover:underline">
          ← Back to dashboard
        </Link>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">My Pipeline</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Your calculator submissions, grouped by project. {total} shown.
          </p>
        </div>
        <Link href="/calculator" className={buttonClasses("primary")}>
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
              className={`rounded-full border px-3.5 py-1 text-xs font-semibold transition-colors ${
                isActive
                  ? "border-arxys-navy bg-arxys-navy text-white"
                  : "border-[#b9c4d5] bg-surface text-ink-soft hover:border-arxys-navy hover:text-arxys-navy"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {/* Summary bar — Open Pipeline only, straight sum (ADR 0081). */}
      {openPipeline !== undefined ? (
        <div className="mt-3 rounded-lg border border-line border-l-[3px] border-l-arxys-navy bg-surface px-4 py-2.5 text-sm text-ink-soft">
          <span className="font-semibold text-ink">Open Pipeline:</span>{" "}
          {fmtAmount(openPipeline)}
        </div>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-lg border border-[#f0c6c2] bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {total === 0 ? (
        <p className="mt-6 text-sm text-ink-soft">
          {activeStatus === "all" ? (
            <>
              You have not saved a calculation yet.{" "}
              <Link href="/calculator" className="font-medium text-arxys-navy hover:underline">
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
              className="overflow-hidden rounded-[14px] border border-line bg-surface"
            >
              <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
                <h2 className="text-base font-bold text-ink">
                  {group.projectName ?? <span className="text-ink-soft">Ungrouped</span>}
                </h2>
                {group.onBehalfCompanyName ? (
                  <StatusBadge variant="on-behalf">
                    On behalf of {group.onBehalfCompanyName}
                  </StatusBadge>
                ) : null}
                {group.preparedByArxys ? (
                  <StatusBadge variant="source">
                    Prepared by Arxys
                    {group.preparedByRep ? ` · ${group.preparedByRep}` : ""}
                  </StatusBadge>
                ) : null}
              </header>

              {/* Project Quote documents (ADR 0083) — the partner's own quote
                  revisions, downloadable. Pricing lives only inside the PDF. */}
              {group.quotes && group.quotes.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2.5 border-b border-line-soft bg-panel px-4 py-2.5">
                  <span className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-[#3f4b5b]">
                    Project quotes
                  </span>
                  {group.quotes.map((q) => (
                    <a
                      key={`${q.submissionId}-v${q.version}`}
                      href={`/api/submissions/${q.submissionId}/project-quote/pdf?version=${q.version}`}
                      download
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#b9c4d5] bg-surface px-2.5 py-1 text-xs font-semibold text-arxys-navy transition-colors hover:border-arxys-navy hover:bg-arxys-navy-soft"
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      Quote v{q.version} · {formatDate(q.createdAt)}
                    </a>
                  ))}
                </div>
              ) : null}
              {/* <sm: card layout (rows reflow to cards on phone) */}
              <div className="divide-y divide-line-soft sm:hidden">
                {group.rows.map((row) => {
                  const rowBusy = isPending && busyId === row.id;
                  const rowTone =
                    row.status === "won"
                      ? "bg-[#f2f9f5]"
                      : row.status === "lost"
                        ? "opacity-60"
                        : undefined;
                  return (
                    <div
                      key={row.id}
                      className={
                        ["px-4 py-3", rowTone, rowBusy ? "opacity-50" : undefined]
                          .filter(Boolean)
                          .join(" ")
                      }
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          {renderStar(row)}
                          <span className="text-xs text-ink-soft">
                            {formatDate(row.createdAt)}
                          </span>
                        </div>
                        {renderStatusControl(row)}
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                        <span className="text-ink">
                          {row.recommendedUnits} ×{" "}
                          {row.productGroup && row.familySlug ? (
                            <Link
                              href={`/price-book/${row.familySlug}`}
                              className="font-semibold text-arxys-navy hover:underline"
                            >
                              {row.productGroup}
                            </Link>
                          ) : (
                            (row.productGroup ?? "")
                          )}
                        </span>
                        <span className="tabular-nums font-semibold text-ink">
                          {formatPrice(row.totalListPriceUsd)}
                        </span>
                      </div>
                      <div className="mt-2.5">{renderActions(row)}</div>
                    </div>
                  );
                })}
              </div>

              {/* ≥sm: table layout */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line bg-panel text-left text-[11px] font-bold uppercase tracking-[0.06em] text-[#3f4b5b]">
                      <th className="w-10 px-4 py-2.5"></th>
                      <th className="px-4 py-2.5">Date</th>
                      <th className="px-4 py-2.5">Recommendation</th>
                      <th className="px-4 py-2.5 text-right">List price</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {group.rows.map((row) => {
                      const rowBusy = isPending && busyId === row.id;
                      // Won rows get a soft highlight, Lost rows recede (0081 UI pass).
                      const rowTone =
                        row.status === "won"
                          ? "bg-[#f2f9f5]"
                          : row.status === "lost"
                            ? "opacity-60"
                            : undefined;
                      return (
                        <tr
                          key={row.id}
                          className={
                            [rowTone, rowBusy ? "opacity-50" : undefined]
                              .filter(Boolean)
                              .join(" ") || undefined
                          }
                        >
                          {/* Preferred star */}
                          <td className="px-4 py-2.5">{renderStar(row)}</td>

                          {/* Date */}
                          <td className="px-4 py-2.5 text-ink-soft">{formatDate(row.createdAt)}</td>

                          {/* Recommendation */}
                          <td className="px-4 py-2.5 text-ink">
                            {row.recommendedUnits} ×{" "}
                            {row.productGroup && row.familySlug ? (
                              <Link
                                href={`/price-book/${row.familySlug}`}
                                className="font-semibold text-arxys-navy hover:underline"
                              >
                                {row.productGroup}
                              </Link>
                            ) : (
                              (row.productGroup ?? "")
                            )}
                          </td>

                          {/* List price */}
                          <td className="px-4 py-2.5 text-right tabular-nums text-ink">
                            {formatPrice(row.totalListPriceUsd)}
                          </td>

                          {/* Status selector — colored dot + native select */}
                          <td className="px-4 py-2.5">{renderStatusControl(row)}</td>

                          {/* Actions: View · Revise · PDF · Delete (consistent icon) */}
                          <td className="px-4 py-2.5">{renderActions(row)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
