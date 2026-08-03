"use client";

// The /projects client board — everything interactive: search, filter chips,
// the Recent/By-partner toggle, keyboard navigation, the two dialogs, and the
// URL sync that makes a reload restore exactly what was on screen
// (acceptance check 8).
//
// Filtering runs entirely in memory against the full row set the server
// already loaded (queue.ts's own scale note: single-digit-partner,
// double-digit-submission) — there is no per-keystroke round trip. The URL is
// kept in sync via the plain History API rather than next/navigation's
// router, so retyping a search query never triggers a server refetch; the
// ONLY server round trips this page makes after the initial load are real
// mutations or a deliberate Refresh.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import type { ProjectQueueResult, ProjectQueueRow } from "@/lib/projects/types";
import { buttonClasses } from "@/app/(app)/_components/ui";
import { cx } from "@/app/(app)/_components/ui/styles";
import { refreshProjectsAction } from "./actions";
import { ByPartnerView } from "./by-partner-view";
import { ArchiveDialog, GenerateDialog } from "./dialogs";
import {
  DEFAULT_FILTERS,
  applyFilters,
  applyNonSearchFilters,
  archivedMatches,
  attentionIdSets,
  closestMatch,
  filtersToSearch,
  type ProjectsFilterState,
} from "./filter";
import { formatDayAndClock, formatUsd0 } from "./format";
import { ProjectRow } from "./project-row";

const PAGE_SIZE = 20;
const THIRTY_DAYS_MS = 30 * 86_400_000;

function SearchGlyph() {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function Chip({
  active,
  dashed,
  clearable,
  onClick,
  children,
}: {
  active: boolean;
  dashed?: boolean;
  clearable?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors",
        active
          ? "border-arxys-navy bg-arxys-navy text-white"
          : dashed
            ? "border-dashed border-line-strong bg-transparent text-ink-soft hover:border-arxys-navy hover:text-arxys-navy"
            : "border-line bg-surface text-ink-soft hover:border-arxys-navy hover:text-arxys-navy",
      )}
    >
      {children}
      {active && clearable ? <span aria-hidden="true">✕</span> : null}
    </button>
  );
}

export type ProjectsBoardProps = {
  queue: ProjectQueueResult;
  viewerId: string;
  viewerName: string | null;
  isAdmin: boolean;
  nowIso: string;
  initialFilters: ProjectsFilterState;
};

export default function ProjectsBoard({
  queue,
  viewerId,
  viewerName,
  isAdmin,
  nowIso,
  initialFilters,
}: ProjectsBoardProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [filters, setFilters] = useState<ProjectsFilterState>(initialFilters);
  const [quotesWindowOnly, setQuotesWindowOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [downloadMenuOpenId, setDownloadMenuOpenId] = useState<string | null>(null);
  const [generateDialogRow, setGenerateDialogRow] = useState<ProjectQueueRow | null>(null);
  const [archiveDialogRow, setArchiveDialogRow] = useState<ProjectQueueRow | null>(null);
  const [isRefreshing, startRefresh] = useTransition();

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const rowElsRef = useRef<Map<string, HTMLDivElement>>(new Map());

  function updateFilters(patch: Partial<ProjectsFilterState>) {
    setFilters((prev) => ({ ...prev, ...patch }));
    setVisibleCount(PAGE_SIZE);
    setFocusedIndex(null);
    setQuotesWindowOnly(false);
  }

  function onMutated() {
    router.refresh();
  }

  // Keep the URL in sync with filter state via the plain History API — never
  // next/navigation's router, which would round-trip to the server on every
  // keystroke. A hard reload re-enters through page.tsx, which parses the
  // same params server-side (acceptance check 8).
  useEffect(() => {
    const url = `${pathname}${filtersToSearch(filters)}`;
    window.history.replaceState(null, "", url);
  }, [filters, pathname]);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  const attention = useMemo(() => attentionIdSets(queue.attention), [queue.attention]);

  const scopedCount = useMemo(
    () => applyNonSearchFilters(queue.rows, filters, viewerName, attention).length,
    [queue.rows, filters, viewerName, attention],
  );

  const filteredBeforeWindow = useMemo(
    () => applyFilters(queue.rows, filters, viewerName, attention),
    [queue.rows, filters, viewerName, attention],
  );

  const filteredRows = useMemo(() => {
    if (!quotesWindowOnly) return filteredBeforeWindow;
    const cutoff = new Date(nowIso).getTime() - THIRTY_DAYS_MS;
    return filteredBeforeWindow.filter((r) => {
      if (!r.current_quote_generated_at) return false;
      return new Date(r.current_quote_generated_at).getTime() >= cutoff;
    });
  }, [filteredBeforeWindow, quotesWindowOnly, nowIso]);

  const archivedMatchRows = useMemo(
    () => archivedMatches(queue.rows, filters, viewerName, attention),
    [queue.rows, filters, viewerName, attention],
  );

  const namePool = useMemo(() => {
    const set = new Set<string>();
    for (const r of queue.rows) {
      if (r.project_name) set.add(r.project_name);
      set.add(r.partner_company_name);
    }
    return Array.from(set);
  }, [queue.rows]);

  const closest = filters.q.trim() ? closestMatch(filters.q, namePool) : null;

  const slicedRows = useMemo(() => filteredRows.slice(0, visibleCount), [filteredRows, visibleCount]);

  // Keyboard: ↑ ↓ move the row focus ring, Enter opens the focused project, /
  // focuses search. Scoped to the Recent view — the By-partner view nests rows
  // inside collapsible groups, where a single flat index doesn't mean much.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const active = document.activeElement;
      const tag = active?.tagName;

      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (filters.view !== "recent" || slicedRows.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((idx) => {
          const next = idx === null ? 0 : Math.min(idx + 1, slicedRows.length - 1);
          rowElsRef.current.get(slicedRows[next]?.submission_id)?.scrollIntoView({ block: "nearest" });
          return next;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((idx) => {
          if (idx === null) return null;
          const next = Math.max(idx - 1, 0);
          rowElsRef.current.get(slicedRows[next]?.submission_id)?.scrollIntoView({ block: "nearest" });
          return next;
        });
      } else if (e.key === "Enter" && tag !== "BUTTON" && tag !== "A") {
        if (focusedIndex !== null && slicedRows[focusedIndex]) {
          router.push(`/admin/submissions/${slicedRows[focusedIndex].submission_id}`);
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [filters.view, slicedRows, focusedIndex, router]);

  function handleRefresh() {
    startRefresh(async () => {
      await refreshProjectsAction();
      router.refresh();
    });
  }

  const asOfText = queue.totals.open_pipeline_as_of
    ? `Read ${formatDayAndClock(queue.totals.open_pipeline_as_of, nowIso)}`
    : "Never read";

  const rowCommonProps = {
    nowIso,
    viewerId,
    query: filters.q,
    downloadMenuOpenId,
    onRequestGenerate: (row: ProjectQueueRow) => setGenerateDialogRow(row),
    onRequestArchive: (row: ProjectQueueRow) => setArchiveDialogRow(row),
    onMutated,
  };

  return (
    <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen px-4 sm:px-6">
      <div className="mx-auto max-w-[1440px] space-y-5 py-2">
        {/* Bands A + C — one navy command band */}
        <div className="rounded-[16px] bg-arxys-navy p-5">
          <div className="flex flex-wrap items-stretch gap-5">
            <div className="flex min-w-[300px] flex-1 flex-col justify-center rounded-[14px] bg-surface p-5">
              <p className="text-[13px] font-bold uppercase tracking-[0.09em] text-ink-soft">Start here</p>
              <p className="mt-1 text-xl font-bold text-ink">Start a new project calculation</p>
              <Link
                href="/calculator"
                className={cx(buttonClasses("primary", "lg"), "mt-3 w-fit")}
              >
                Open calculator →
              </Link>
            </div>

            <div className="flex min-w-[240px] flex-col justify-center px-1 text-white">
              <p className="text-[13px] font-bold uppercase tracking-[0.09em] text-[#9fb0d1]">
                Open pipeline · from Pipedrive, display only
              </p>
              <p className="mt-1 text-[38px] font-bold leading-none tabular-nums">
                {formatUsd0(queue.totals.open_pipeline_usd)}
              </p>
              <div className="mt-2.5 flex items-center gap-3 text-[13px] text-[#c3cee3]">
                <span>{asOfText}</span>
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="rounded-lg border border-[#5670a0] px-2.5 py-1 text-[13px] font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-60"
                >
                  {isRefreshing ? "Refreshing…" : "↻ Refresh"}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                updateFilters({ status: "open", mine: false, archived: false, q: "", attention: null })
              }
              className="min-w-[160px] rounded-[14px] border border-line bg-surface p-4 text-left shadow-[0_2px_0_0_rgba(15,42,83,0.10)] transition-colors hover:bg-arxys-navy-soft"
            >
              <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-[#3f4b5b]">
                Open projects
              </p>
              <p className="mt-1 text-[34px] font-bold tabular-nums text-ink">
                {queue.totals.open_project_count}
              </p>
              <p className="mt-1 text-[15px] font-bold text-arxys-navy">Show in queue →</p>
            </button>

            <button
              type="button"
              onClick={() => {
                updateFilters({ mine: false, archived: false, q: "", attention: null, status: null });
                setQuotesWindowOnly(true);
              }}
              className="min-w-[160px] rounded-[14px] border border-line bg-surface p-4 text-left shadow-[0_2px_0_0_rgba(15,42,83,0.10)] transition-colors hover:bg-arxys-navy-soft"
            >
              <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-[#3f4b5b]">
                Quotes · 30 days
              </p>
              <p className="mt-1 text-[34px] font-bold tabular-nums text-ink">
                {queue.totals.quotes_last_30_days}
              </p>
              <p className="mt-1 text-[15px] font-bold text-arxys-navy">Show in queue →</p>
            </button>
          </div>
        </div>

        {/* Band B — attention, absent when empty */}
        {queue.attention.expired_quote_submission_ids.length > 0 ||
        queue.attention.missing_deal_link_submission_ids.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {queue.attention.expired_quote_submission_ids.length > 0 ? (
              <div
                role="button"
                tabIndex={0}
                onClick={() => updateFilters({ attention: "expired" })}
                onKeyDown={(e) => e.key === "Enter" && updateFilters({ attention: "expired" })}
                className="flex min-w-[320px] flex-1 cursor-pointer items-center justify-between gap-3 rounded-[12px] bg-[#fdf1e0] px-5 py-3.5"
              >
                <span className="text-[16px] text-[#8a4b0a]">
                  <strong className="text-xl font-extrabold">
                    {queue.attention.expired_quote_submission_ids.length}
                  </strong>{" "}
                  quotes expired on deals still open
                </span>
                <button type="button" className={buttonClasses("amber", "md")}>
                  Show these {queue.attention.expired_quote_submission_ids.length} →
                </button>
              </div>
            ) : null}
            {queue.attention.missing_deal_link_submission_ids.length > 0 ? (
              <div
                role="button"
                tabIndex={0}
                onClick={() => updateFilters({ attention: "missing_link" })}
                onKeyDown={(e) => e.key === "Enter" && updateFilters({ attention: "missing_link" })}
                className="flex min-w-[320px] flex-1 cursor-pointer items-center justify-between gap-3 rounded-[12px] bg-danger-soft px-5 py-3.5"
              >
                <span className="text-[16px] text-danger">
                  <strong className="text-xl font-extrabold">
                    {queue.attention.missing_deal_link_submission_ids.length}
                  </strong>{" "}
                  no Pipedrive deal — cannot be quoted
                </span>
                <button type="button" className={buttonClasses("destructive", "md")}>
                  Show these {queue.attention.missing_deal_link_submission_ids.length} →
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Band D — the queue */}
        {queue.rows.length === 0 ? (
          <div className="rounded-[14px] border border-line bg-surface p-10 text-center">
            <p className="text-[13px] font-bold uppercase tracking-[0.09em] text-ink-soft">
              No projects at all
            </p>
            <p className="mt-2 text-2xl font-bold text-ink">Nothing here yet</p>
            <p className="mt-2 text-[16px] text-ink-soft">
              Projects appear here once a calculation is saved. Start one and it lands at the top of
              this list.
            </p>
            <Link href="/calculator" className={cx(buttonClasses("primary", "lg"), "mt-4 inline-flex")}>
              Start a new project calculation →
            </Link>
          </div>
        ) : (
          <div>
            <div className="flex items-stretch gap-3">
              <div className="relative flex-1">
                <SearchGlyph />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={filters.q}
                  onChange={(e) => updateFilters({ q: e.target.value })}
                  placeholder='Search a project or partner — "Riverside"'
                  className="h-[68px] w-full rounded-[14px] border border-line bg-surface pl-12 pr-44 text-[22px] font-medium text-ink placeholder:text-ink-soft/70 focus:border-arxys-navy focus:outline-none focus:ring-2 focus:ring-arxys-navy/15"
                />
                <div className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-3 whitespace-nowrap text-[15px] text-ink-soft">
                  {filters.q.trim() ? (
                    <>
                      <span>
                        {filteredRows.length} of {scopedCount} projects
                      </span>
                      <button
                        type="button"
                        onClick={() => updateFilters({ q: "" })}
                        className="font-semibold text-arxys-navy hover:underline"
                      >
                        Clear ✕
                      </button>
                    </>
                  ) : (
                    <span>{scopedCount} projects</span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 overflow-hidden rounded-[14px] border border-line">
                <button
                  type="button"
                  onClick={() => updateFilters({ view: "recent" })}
                  className={cx(
                    "px-5 text-[15px] font-bold transition-colors",
                    filters.view === "recent"
                      ? "bg-arxys-navy text-white"
                      : "bg-surface text-ink-soft hover:bg-arxys-navy-soft",
                  )}
                >
                  Recent
                </button>
                <button
                  type="button"
                  onClick={() => updateFilters({ view: "partner" })}
                  className={cx(
                    "border-l border-line px-5 text-[15px] font-bold transition-colors",
                    filters.view === "partner"
                      ? "bg-arxys-navy text-white"
                      : "bg-surface text-ink-soft hover:bg-arxys-navy-soft",
                  )}
                >
                  By partner
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Chip active={filters.mine} clearable onClick={() => updateFilters({ mine: !filters.mine })}>
                Projects I created
              </Chip>
              <Chip
                active={filters.status === "open"}
                onClick={() => updateFilters({ status: filters.status === "open" ? null : "open" })}
              >
                Open
              </Chip>
              <Chip
                active={filters.status === "won"}
                onClick={() => updateFilters({ status: filters.status === "won" ? null : "won" })}
              >
                Won
              </Chip>
              <Chip
                active={filters.status === "lost"}
                onClick={() => updateFilters({ status: filters.status === "lost" ? null : "lost" })}
              >
                Lost
              </Chip>
              <Chip
                active={filters.archived}
                dashed
                onClick={() => updateFilters({ archived: !filters.archived })}
              >
                Show archived
              </Chip>
              {filters.attention ? (
                <Chip active clearable onClick={() => updateFilters({ attention: null })}>
                  {filters.attention === "expired" ? "Expired quotes" : "No Pipedrive deal"}
                </Chip>
              ) : null}
              {quotesWindowOnly ? (
                <Chip active clearable onClick={() => setQuotesWindowOnly(false)}>
                  Quotes · last 30 days
                </Chip>
              ) : null}
              <span className="ml-auto text-[13px] text-ink-soft">Most recently updated</span>
            </div>

            <div className="mt-4">
              {filteredRows.length === 0 ? (
                filters.q.trim() ? (
                  <div className="rounded-[14px] border border-line bg-surface p-8">
                    <p className="text-[13px] font-bold uppercase tracking-[0.09em] text-ink-soft">
                      Search returned nothing
                    </p>
                    <p className="mt-1 text-xl font-bold text-ink">
                      No project matches &quot;{filters.q}&quot;
                    </p>
                    <p className="mt-1 text-[15px] text-ink-soft">
                      Search covers project name and partner company.
                      {closest ? (
                        <>
                          {" "}
                          Closest match: <strong className="text-ink">{closest}</strong>.
                        </>
                      ) : null}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      {closest ? (
                        <Button2 onClick={() => updateFilters({ q: closest })}>
                          Search &quot;{closest}&quot; instead
                        </Button2>
                      ) : null}
                      {!filters.archived ? (
                        <Button2 variant="secondary" onClick={() => updateFilters({ archived: true })}>
                          Include archived
                        </Button2>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[14px] border border-line bg-surface p-8">
                    <p className="text-xl font-bold text-ink">No projects match these filters.</p>
                    <div className="mt-4">
                      <Button2
                        variant="secondary"
                        onClick={() =>
                          updateFilters({ ...DEFAULT_FILTERS, mine: false, archived: true })
                        }
                      >
                        Clear filters
                      </Button2>
                    </div>
                  </div>
                )
              ) : filters.view === "recent" ? (
                <div className="space-y-4">
                  {archivedMatchRows.length > 0 ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-line-strong bg-panel px-4 py-3 text-[15px]">
                      <span className="text-ink-soft">
                        {archivedMatchRows.length} archived project
                        {archivedMatchRows.length === 1 ? "" : "s"} also match
                        {archivedMatchRows.length === 1 ? "es" : ""} &quot;{filters.q}&quot;
                      </span>
                      <button
                        type="button"
                        onClick={() => updateFilters({ archived: true })}
                        className={buttonClasses("secondary", "sm")}
                      >
                        Show archived matches
                      </button>
                    </div>
                  ) : null}

                  {slicedRows.map((row, i) => (
                    <ProjectRow
                      key={row.submission_id}
                      row={row}
                      focused={focusedIndex === i}
                      downloadMenuOpen={downloadMenuOpenId === row.submission_id}
                      onToggleDownloadMenu={() =>
                        setDownloadMenuOpenId((cur) => (cur === row.submission_id ? null : row.submission_id))
                      }
                      rowRef={(el) => {
                        if (el) rowElsRef.current.set(row.submission_id, el);
                        else rowElsRef.current.delete(row.submission_id);
                      }}
                      {...rowCommonProps}
                    />
                  ))}

                  <div className="flex items-center justify-between gap-4">
                    {slicedRows.length < filteredRows.length ? (
                      <button
                        type="button"
                        onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                        className={buttonClasses("secondary", "md")}
                      >
                        Show {Math.min(PAGE_SIZE, filteredRows.length - slicedRows.length)} more projects
                      </button>
                    ) : (
                      <span />
                    )}
                    <span className="text-[13px] text-ink-soft">
                      ↑ ↓ move through rows · Enter opens the project · / focuses search
                    </span>
                  </div>
                </div>
              ) : (
                <ByPartnerView
                  rows={filteredRows}
                  query={filters.q}
                  nowIso={nowIso}
                  viewerId={viewerId}
                  isAdmin={isAdmin}
                  downloadMenuOpenId={downloadMenuOpenId}
                  onToggleDownloadMenu={(id) =>
                    setDownloadMenuOpenId((cur) => (cur === id ? null : id))
                  }
                  onRequestGenerate={(row) => setGenerateDialogRow(row)}
                  onRequestArchive={(row) => setArchiveDialogRow(row)}
                  onMutated={onMutated}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {generateDialogRow ? (
        <GenerateDialog
          row={generateDialogRow}
          nextVersion={
            generateDialogRow.available_actions.task.kind === "generate_proposal" ||
            generateDialogRow.available_actions.task.kind === "generate_next_proposal"
              ? generateDialogRow.available_actions.task.next_version
              : 1
          }
          onClose={() => setGenerateDialogRow(null)}
          onGenerated={() => {
            setGenerateDialogRow(null);
            router.refresh();
          }}
        />
      ) : null}

      {archiveDialogRow ? (
        <ArchiveDialog
          row={archiveDialogRow}
          nowIso={nowIso}
          onClose={() => setArchiveDialogRow(null)}
          onArchived={() => {
            setArchiveDialogRow(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

// A plain secondary/primary button for the empty-state panels — buttonClasses
// applied to a native button rather than pulling in the shared Button
// component's own prop surface for two one-off call sites.
function Button2({
  variant = "primary",
  onClick,
  children,
}: {
  variant?: "primary" | "secondary";
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className={buttonClasses(variant, "md")}>
      {children}
    </button>
  );
}
