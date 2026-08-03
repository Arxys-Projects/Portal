"use client";

// The two /projects confirm dialogs (screenshot 4d). Neither uses a toast:
// success closes the dialog and lets the row itself carry the permanent
// record (the green strip, the archived strip) after router.refresh().

import { useEffect, useState, useTransition, type ReactNode } from "react";
import type { ProjectQueueRow } from "@/lib/projects/types";
import { Button, buttonClasses } from "@/app/(app)/_components/ui";
import { formatClockTime, formatDayAndClock, formatDayLabel, formatUsd0 } from "./format";
import { formatDealStatusLabel } from "./row-copy";
import {
  archiveProjectAction,
  generateProposalAction,
  previewDealForGenerateAction,
  type DealPreviewResult,
} from "./actions";

function DialogShell({
  onClose,
  children,
  wide,
}: {
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0d1b33]/50 px-4 py-10"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`w-full ${wide ? "max-w-2xl" : "max-w-lg"} rounded-[14px] border border-line bg-surface p-6 shadow-[0_24px_60px_-16px_rgba(15,42,83,0.35)]`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generate confirm — the trust loop.
// ---------------------------------------------------------------------------

export function GenerateDialog({
  row,
  nextVersion,
  onClose,
  onGenerated,
}: {
  row: ProjectQueueRow;
  nextVersion: number;
  onClose: () => void;
  onGenerated: () => void;
}) {
  const [preview, setPreview] = useState<DealPreviewResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (row.pipedrive_deal_id === null) return;
    previewDealForGenerateAction(row.pipedrive_deal_id).then((result) => {
      if (!cancelled) setPreview(result);
    });
    return () => {
      cancelled = true;
    };
  }, [row.pipedrive_deal_id]);

  function handleGenerate() {
    setSubmitError(null);
    startTransition(async () => {
      const result = await generateProposalAction(row.submission_id);
      if (!result.ok) {
        setSubmitError(result.error);
        return;
      }
      onGenerated();
    });
  }

  const canGenerate = preview?.ok === true && !isPending;

  return (
    <DialogShell onClose={onClose} wide>
      <h2 className="text-2xl font-extrabold text-ink">Generate Project Proposal v{nextVersion}</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {row.project_name ?? "Untitled project"} · {row.partner_company_name} · Pipedrive deal #
        {row.pipedrive_deal_id ?? "—"}
      </p>

      <div className="mt-5 border-t border-line-soft pt-4">
        {preview === null ? (
          <p className="text-sm text-ink-soft">Reading line items from Pipedrive…</p>
        ) : preview.ok ? (
          <>
            <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-[#3f4b5b]">
              Line items read from Pipedrive at {formatClockTime(preview.readAt)}
            </p>
            <div className="mt-2 overflow-hidden rounded-lg border border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-panel text-left text-[11px] font-bold uppercase tracking-[0.06em] text-[#3f4b5b]">
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">List price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {preview.lines.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-3 text-ink-soft">
                        No line items on this deal.
                      </td>
                    </tr>
                  ) : (
                    preview.lines.map((line, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-ink">{line.label}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink">{line.quantity ?? 1}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink">
                          {line.unitPrice === null ? "—" : formatUsd0(line.unitPrice)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line bg-panel">
                    <td className="px-3 py-2 font-bold text-ink" colSpan={2}>
                      Total on the PDF
                    </td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums text-ink">
                      {preview.total === null ? "—" : formatUsd0(preview.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        ) : (
          <p className="rounded-lg border border-[#f0c6c2] bg-danger-soft px-3 py-2 text-sm text-danger">
            {preview.error}
          </p>
        )}
      </div>

      <p className="mt-4 text-sm text-ink-soft">
        v{nextVersion} becomes the current Project Proposal for this project.
        {row.current_quote_version !== null
          ? ` v${row.current_quote_version} stays downloadable and is marked superseded.`
          : ""}{" "}
        Nothing is sent to anyone.
      </p>

      {submitError ? <p className="mt-3 text-sm text-danger">{submitError}</p> : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={handleGenerate} disabled={!canGenerate}>
          {isPending ? "Generating…" : `Generate Project Proposal V${nextVersion}`}
        </Button>
        <Button variant="secondary" size="lg" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        {row.pipedrive_deal_url ? (
          <a
            href={row.pipedrive_deal_url}
            target="_blank"
            rel="noopener noreferrer"
            className={`${buttonClasses("ghost", "md")} ml-auto`}
          >
            Check the deal in Pipedrive ↗
          </a>
        ) : null}
      </div>
    </DialogShell>
  );
}

// ---------------------------------------------------------------------------
// Archive confirm.
// ---------------------------------------------------------------------------

export function ArchiveDialog({
  row,
  nowIso,
  onClose,
  onArchived,
}: {
  row: ProjectQueueRow;
  nowIso: string;
  onClose: () => void;
  onArchived: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleArchive() {
    setError(null);
    startTransition(async () => {
      const result = await archiveProjectAction(row.submission_id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onArchived();
    });
  }

  const dealStatusLine = row.pipedrive_deal_id
    ? `${formatDealStatusLabel(row.pipedrive_deal_status)} · read ${
        row.pipedrive_status_as_of ? formatDayAndClock(row.pipedrive_status_as_of, nowIso) : "never"
      }`
    : "Not linked";

  const quoteLine =
    row.current_quote_version !== null && row.current_quote_generated_at
      ? `v${row.current_quote_version} · generated ${formatDayLabel(row.current_quote_generated_at, nowIso)}`
      : "No quote generated";

  return (
    <DialogShell onClose={onClose}>
      <h2 className="text-2xl font-extrabold text-ink">
        Archive &quot;{row.project_name ?? "this project"}&quot;?
      </h2>

      <div className="mt-4 space-y-2 rounded-lg bg-panel px-4 py-3 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span className="text-ink-soft">Pipedrive deal status</span>
          <span className="font-semibold text-ink">{dealStatusLine}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-ink-soft">Current quote</span>
          <span className="font-semibold text-ink">{quoteLine}</span>
        </div>
      </div>

      <p className="mt-4 text-sm text-ink-soft">
        Archiving hides it from your queue. Quotes, versions and the Pipedrive link stay exactly as
        they are, partners see no change, and Undo sits on the row afterwards.
      </p>

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={handleArchive} disabled={isPending}>
          {isPending ? "Archiving…" : "Archive project"}
        </Button>
        <Button variant="secondary" size="lg" onClick={onClose} disabled={isPending}>
          Keep in queue
        </Button>
        {row.pipedrive_deal_url ? (
          <a
            href={row.pipedrive_deal_url}
            target="_blank"
            rel="noopener noreferrer"
            className={`${buttonClasses("ghost", "md")} ml-auto`}
          >
            Mark it lost in Pipedrive ↗
          </a>
        ) : null}
      </div>
    </DialogShell>
  );
}
