"use client";

// A single /projects row: the fixed 3-zone primary line (identity / state /
// actions), the secondary line (products + fact trays), the additive top
// strip or archived strip, and the download split-menu that grows the card.
//
// This switches on row_state and available_actions.*.kind for the VISUAL
// variant only — every label printed here comes straight off
// available_actions.*.label, verbatim, per the phase-1 contract.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type MouseEvent, type ReactNode } from "react";
import type { ProjectQueueRow } from "@/lib/projects/types";
import { Button, IconButton, buttonClasses, iconButtonClasses } from "@/app/(app)/_components/ui";
import { cx } from "@/app/(app)/_components/ui/styles";
import { highlightSegments } from "./filter";
import { formatDayLabel, formatUsd0 } from "./format";
import {
  DOT_COLOR,
  TEXT_TONE_CLASS,
  archivedStripText,
  cardBorder,
  productsSourceChip,
  stateZoneCopy,
  topStripCopy,
  valueCellText,
} from "./row-copy";
import { relinkPipedriveAction, restoreProjectAction } from "./actions";

const CARD_BORDER_CLASS: Record<ReturnType<typeof cardBorder>, string> = {
  default: "border border-line",
  "amber-2": "border-2 border-[#d97706]",
  "red-2": "border-2 border-danger",
  dashed: "border border-dashed border-line-strong",
};

function Highlighted({ text, query }: { text: string; query: string }) {
  const segments = highlightSegments(text, query);
  return (
    <>
      {segments.map((seg, i) =>
        seg.match ? (
          <mark key={i} className="rounded-sm bg-arxys-gold/50 text-inherit">
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}

function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return <span className="mt-1 block text-xs text-danger">{message}</span>;
}

// A task-slot action that calls a server action directly (no confirm dialog):
// Restore and Retry Pipedrive link.
function AsyncTaskButton({
  label,
  size,
  variant,
  run,
  onDone,
}: {
  label: string;
  size: "md" | "lg";
  variant: "primary" | "outline";
  run: () => Promise<{ ok: true } | { ok: false; error: string }>;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-end">
      <Button
        variant={variant}
        size={size}
        disabled={isPending}
        onClick={(e) => {
          e.stopPropagation();
          setError(null);
          startTransition(async () => {
            const result = await run();
            if (!result.ok) setError(result.error);
            else onDone();
          });
        }}
      >
        {isPending ? "Working…" : label}
      </Button>
      <InlineError message={error} />
    </span>
  );
}

function DealStatusPill({ row }: { row: ProjectQueueRow }) {
  if (row.deal_link_state === "missing") {
    return (
      <span className="rounded-full bg-danger-soft px-2.5 py-0.5 text-[13px] font-semibold text-danger">
        No deal
      </span>
    );
  }
  const label = row.pipedrive_deal_status
    ? `Deal ${row.pipedrive_deal_status}`
    : "Deal status unknown";
  return (
    <span className="rounded-full bg-panel px-2.5 py-0.5 text-[13px] font-semibold text-ink-soft">
      {label}
    </span>
  );
}

function DashedChip({ tone = "grey", children }: { tone?: "grey" | "amber"; children: ReactNode }) {
  return (
    <span
      className={cx(
        "whitespace-nowrap rounded-full border border-dashed px-2.5 py-0.5 text-[13px] font-medium",
        tone === "amber" ? "border-[#e0b374] text-[#b45309]" : "border-line-strong text-ink-soft",
      )}
    >
      {children}
    </span>
  );
}

function OpenProjectLink({ submissionId }: { submissionId: string }) {
  return (
    <Link
      href={`/admin/submissions/${submissionId}`}
      aria-label="Open project"
      title="Open project"
      onClick={(e) => e.stopPropagation()}
      className={iconButtonClasses("default", "h-10 w-10")}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="7" y1="17" x2="17" y2="7" />
        <polyline points="7 7 17 7 17 17" />
      </svg>
    </Link>
  );
}

function RowMenu({ onArchive }: { onArchive: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <IconButton
        label="More actions"
        className="h-10 w-10"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </IconButton>
      {open ? (
        <div
          className="absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-lg border border-line bg-surface shadow-[0_12px_28px_rgba(15,42,83,0.16)]"
          onMouseLeave={() => setOpen(false)}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onArchive();
            }}
            className="block w-full px-3.5 py-2.5 text-left text-sm font-medium text-ink hover:bg-arxys-navy-soft"
          >
            Archive
          </button>
        </div>
      ) : null}
    </div>
  );
}

export type ProjectRowProps = {
  row: ProjectQueueRow;
  nowIso: string;
  viewerId: string;
  query: string;
  focused?: boolean;
  compact?: boolean;
  downloadMenuOpen: boolean;
  onToggleDownloadMenu: () => void;
  onRequestGenerate: (row: ProjectQueueRow) => void;
  onRequestArchive: (row: ProjectQueueRow) => void;
  onMutated: () => void;
  rowRef?: (el: HTMLDivElement | null) => void;
};

export function ProjectRow({
  row,
  nowIso,
  viewerId,
  query,
  focused,
  compact,
  downloadMenuOpen,
  onToggleDownloadMenu,
  onRequestGenerate,
  onRequestArchive,
  onMutated,
  rowRef,
}: ProjectRowProps) {
  const router = useRouter();
  const zone = stateZoneCopy(row, nowIso);
  const strip = topStripCopy(row, nowIso);
  const archivedText = archivedStripText(row, viewerId, nowIso);
  const valueOverride = valueCellText(row);
  const productsChip = productsSourceChip(row.products_source);
  const size: "md" | "lg" = compact ? "md" : "lg";
  const { task, download, pipedrive } = row.available_actions;

  function openDetail() {
    router.push(`/admin/submissions/${row.submission_id}`);
  }

  function onCardClick(e: MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, textarea, select")) return;
    openDetail();
  }

  const taskNode = (() => {
    switch (task.kind) {
      case "retry_pipedrive_link":
        return (
          <AsyncTaskButton
            label={task.label}
            size={size}
            variant="primary"
            run={() => relinkPipedriveAction(row.submission_id)}
            onDone={onMutated}
          />
        );
      case "restore_from_archive":
        return (
          <AsyncTaskButton
            label={task.label}
            size={size}
            variant="outline"
            run={() => restoreProjectAction(row.submission_id)}
            onDone={onMutated}
          />
        );
      case "add_line_items":
        return (
          <a
            href={task.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={buttonClasses("outline", size)}
          >
            {task.label}
          </a>
        );
      case "generate_proposal":
      case "generate_next_proposal":
        return (
          <Button
            size={size}
            onClick={(e) => {
              e.stopPropagation();
              onRequestGenerate(row);
            }}
          >
            {task.label}
          </Button>
        );
      case "download_proposal":
        return (
          <a
            href={`/api/submissions/${task.proposal_submission_id}/project-quote/pdf?version=${task.version}&variant=customer-proposal`}
            download
            onClick={(e) => e.stopPropagation()}
            className={buttonClasses("primary", size)}
          >
            {task.label}
          </a>
        );
    }
  })();

  const downloadNode =
    download.kind === "download_submission_only" ? (
      <a
        href={`/api/submissions/${row.submission_id}/pdf`}
        download
        onClick={(e) => e.stopPropagation()}
        className={buttonClasses("secondary", size)}
      >
        {download.label}
      </a>
    ) : (
      <button
        type="button"
        aria-expanded={downloadMenuOpen}
        onClick={(e) => {
          e.stopPropagation();
          onToggleDownloadMenu();
        }}
        className={cx(buttonClasses("secondary", size), "gap-1.5")}
      >
        {download.label} <span aria-hidden>{downloadMenuOpen ? "︿" : "⌄"}</span>
      </button>
    );

  const pipedriveNode =
    pipedrive.kind === "open_deal" ? (
      <a
        href={pipedrive.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={buttonClasses("primary", size)}
      >
        <span className="flex h-4 w-4 items-center justify-center rounded-[3px] bg-white/20 text-[10px] font-black">
          P
        </span>
        {pipedrive.label}
      </a>
    ) : (
      <Button size={size} disabled>
        <span className="flex h-4 w-4 items-center justify-center rounded-[3px] bg-black/10 text-[10px] font-black">
          P
        </span>
        {pipedrive.label}
      </Button>
    );

  return (
    <div
      ref={rowRef}
      tabIndex={-1}
      onClick={onCardClick}
      className={cx(
        "cursor-pointer rounded-[14px] transition-shadow",
        compact ? "bg-panel" : "bg-surface",
        CARD_BORDER_CLASS[cardBorder(row.row_state)],
        focused && "ring-[3px] ring-arxys-navy",
      )}
    >
      {strip ? (
        <div
          className={cx(
            "rounded-t-[13px] px-5 py-2 text-[15px] font-semibold",
            strip.tone === "green" ? "bg-[#e8f5ee] text-[#136340]" : "bg-[#fdf1e0] text-[#8a4b0a]",
          )}
        >
          {strip.text}
        </div>
      ) : null}

      {archivedText ? (
        <div className="flex flex-wrap items-center gap-3 rounded-t-[13px] bg-panel px-5 py-2 text-[15px] text-ink-soft">
          <span>{archivedText}</span>
          <AsyncTaskButton
            label="Undo"
            size="md"
            variant="outline"
            run={() => restoreProjectAction(row.submission_id)}
            onDone={onMutated}
          />
        </div>
      ) : null}

      <div className={row.row_state === "archived" ? "opacity-70" : undefined}>
      <div className="flex items-start gap-4 p-5">
        {/* Identity — flex:1, min-width:0 */}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-2xl font-bold text-ink">
            <Highlighted text={row.project_name ?? "Untitled project"} query={query} />
          </h3>
          <p className="mt-0.5 truncate text-[17px] text-ink-soft">
            <Highlighted text={row.partner_company_name} query={query} />
          </p>
        </div>

        {/* State — fixed 230px */}
        <div className={compact ? "w-[190px] shrink-0" : "w-[230px] shrink-0"}>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: DOT_COLOR[zone.dot] }}
            />
            <span className={cx("text-[19px] font-bold leading-snug", TEXT_TONE_CLASS[zone.tone])}>
              {zone.headline}
            </span>
          </div>
          <p className="mt-0.5 text-[16px] leading-snug text-ink-soft">{zone.qualifier}</p>
        </div>

        {/* Actions — fixed MINIMUM widths per slot, flex:none. Every slot has
            a floor regardless of its label's length (task labels run from
            "Retry Pipedrive link" to "New Project Proposal v4"), so the
            primary action starts at the same x on every row in the ordinary
            case; min-width (not a hard cap) lets a slot grow past its floor
            for an unusually long label instead of clipping or overlapping the
            next one — the guarantee is "never moves or clips", not an exact
            620px total. The icon slots stay in the DOM even when inert (an
            archived row has no "···" menu) so the row never visually jumps,
            per the same rule IconButton's own docstring states. */}
        <div className={cx("flex shrink-0 items-start gap-2", compact && "gap-1.5")}>
          <div className={cx("shrink-0", compact ? "min-w-[190px]" : "min-w-[250px]")}>{taskNode}</div>
          <div className={cx("shrink-0", compact ? "min-w-[100px]" : "min-w-[130px]")}>{downloadNode}</div>
          <div className={cx("shrink-0", compact ? "min-w-[110px]" : "min-w-[140px]")}>{pipedriveNode}</div>
          {!compact ? (
            <div className="w-11 shrink-0">
              <OpenProjectLink submissionId={row.submission_id} />
            </div>
          ) : null}
          {!compact ? (
            <div className="w-11 shrink-0">
              {row.row_state !== "archived" ? (
                <RowMenu onArchive={() => onRequestArchive(row)} />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Secondary line */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line-soft px-5 py-2.5 text-[16px]">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cx(
              "shrink-0 rounded border px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em]",
              productsChip.dashed
                ? "border-dashed border-line-strong text-ink-soft"
                : "border-[#bcd0e6] bg-arxys-navy-soft text-arxys-navy",
            )}
          >
            {productsChip.label}
          </span>
          <span className={cx("truncate", productsChip.dashed ? "italic text-ink-soft" : "text-ink")}>
            {productsChip.dashed ? "Calculator output, not yet quoted · " : null}
            <Highlighted text={row.products_display} query={query} />
          </span>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {row.is_superseded || (!row.pipedrive_read_ok && row.deal_link_state === "linked") ? (
            <>
              <div className="flex items-center gap-2">
                {row.is_superseded ? <DashedChip>Superseded by a newer submission</DashedChip> : null}
                {!row.pipedrive_read_ok && row.deal_link_state === "linked" ? (
                  <DashedChip tone="amber">
                    Pipedrive unreachable
                    {row.pipedrive_status_as_of
                      ? ` · read ${formatDayLabel(row.pipedrive_status_as_of, nowIso)}`
                      : ""}
                  </DashedChip>
                ) : null}
              </div>
              <span className="h-4 w-px shrink-0 bg-line" aria-hidden="true" />
            </>
          ) : null}
          <DealStatusPill row={row} />
          <span className="whitespace-nowrap text-ink-soft">Created {formatDayLabel(row.created_at, nowIso)}</span>
          <span className="whitespace-nowrap text-[17px] font-bold tabular-nums text-ink">
            {valueOverride ?? (row.pipedrive_deal_value !== null ? formatUsd0(row.pipedrive_deal_value) : "—")}
          </span>
        </div>
      </div>
      </div>

      {downloadMenuOpen && download.kind === "download_split" ? (
        <div className="flex justify-end border-t border-line-soft px-5 py-3" onClick={(e) => e.stopPropagation()}>
          <div className="w-80 overflow-hidden rounded-lg border border-line bg-surface">
            <a
              href={`/api/submissions/${download.proposal_submission_id}/project-quote/pdf?version=${download.proposal_version}&variant=customer-proposal`}
              download
              className="block border-b border-line-soft px-4 py-3 hover:bg-arxys-navy-soft"
            >
              <span className="block text-sm font-bold text-ink">
                Project Proposal v{download.proposal_version} (PDF)
              </span>
              <span className="block text-xs text-ink-soft">The quote you send to the customer</span>
            </a>
            <a
              href={`/api/submissions/${row.submission_id}/pdf`}
              download
              className="block px-4 py-3 hover:bg-arxys-navy-soft"
            >
              <span className="block text-sm font-bold text-ink">Calculator submission (PDF)</span>
              <span className="block text-xs text-ink-soft">Sizing inputs and recommendation, internal</span>
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
