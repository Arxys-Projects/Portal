"use client";

// The By-partner view (screenshot 4b) — the same filtered queue, grouped by
// company instead of by recency. groupProjectRowsByPartner takes rows the
// caller has ALREADY filtered (by-partner.ts's own contract), so the board
// applies q/mine/status/archived first and hands the result straight here.

import { useState, type ReactNode } from "react";
import type { ProjectQueueRow } from "@/lib/projects/types";
import { groupProjectRowsByPartner } from "@/lib/projects/by-partner";
import { buttonClasses } from "@/app/(app)/_components/ui";
import { cx } from "@/app/(app)/_components/ui/styles";
import { formatUsd0 } from "./format";
import { ProjectRow } from "./project-row";

function WarningPill({ tone = "amber", children }: { tone?: "amber" | "red"; children: ReactNode }) {
  return (
    <span
      className={cx(
        "whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tone === "red" ? "bg-danger-soft text-danger" : "bg-[#fdf1e0] text-[#8a4b0a]",
      )}
    >
      {children}
    </span>
  );
}

export type ByPartnerViewProps = {
  rows: ProjectQueueRow[];
  query: string;
  nowIso: string;
  viewerId: string;
  isAdmin: boolean;
  onRequestGenerate: (row: ProjectQueueRow) => void;
  onRequestArchive: (row: ProjectQueueRow) => void;
  onMutated: () => void;
};

export function ByPartnerView({
  rows,
  query,
  nowIso,
  viewerId,
  isAdmin,
  onRequestGenerate,
  onRequestArchive,
  onMutated,
}: ByPartnerViewProps) {
  const groups = groupProjectRowsByPartner(rows);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div>
      {isAdmin ? (
        <div className="flex justify-end">
          <a href="/api/admin/forecast/xlsx" className={buttonClasses("secondary", "sm")}>
            Export XLSX
          </a>
        </div>
      ) : null}

      <div className={cx("space-y-3", isAdmin && "mt-3")}>
        {groups.map((g) => {
          const isOpen = !collapsed.has(g.company_key);
          return (
            <section
              key={g.company_key}
              className="overflow-hidden rounded-[14px] border border-line bg-surface"
            >
              <button
                type="button"
                onClick={() => toggle(g.company_key)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-5 py-4 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h3 className="text-xl font-bold text-ink">{g.company_name}</h3>
                    <span className="text-sm text-ink-soft">
                      {g.project_count} project{g.project_count === 1 ? "" : "s"} · {g.contact_count}{" "}
                      contact{g.contact_count === 1 ? "" : "s"}
                    </span>
                    {g.needs_price_update_count > 0 ? (
                      <WarningPill>
                        {g.needs_price_update_count} quote
                        {g.needs_price_update_count === 1 ? "" : "s"} need pricing updates
                      </WarningPill>
                    ) : null}
                    {g.missing_deal_link_count > 0 ? (
                      <WarningPill tone="red">
                        {g.missing_deal_link_count} project{g.missing_deal_link_count === 1 ? "" : "s"}{" "}
                        has no deal link
                      </WarningPill>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-6">
                  <div className="text-right">
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#3f4b5b]">
                      Open pipeline
                    </p>
                    <p className="text-lg font-bold tabular-nums text-ink">
                      {formatUsd0(g.open_pipeline_usd)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#3f4b5b]">
                      Won
                    </p>
                    <p className="text-lg font-bold tabular-nums text-ink">{formatUsd0(g.won_usd)}</p>
                  </div>
                  <span
                    aria-hidden="true"
                    className={cx(
                      "flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-soft transition-transform",
                      isOpen && "rotate-180",
                    )}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </span>
                </div>
              </button>

              {isOpen ? (
                <div className="space-y-2 border-t border-line bg-panel p-3">
                  {g.rows.map((row) => (
                    <ProjectRow
                      key={row.submission_id}
                      row={row}
                      nowIso={nowIso}
                      viewerId={viewerId}
                      query={query}
                      onRequestGenerate={onRequestGenerate}
                      onRequestArchive={onRequestArchive}
                      onMutated={onMutated}
                    />
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-ink-soft">
        Pre-CRM partner activity — not synced with Pipedrive stage. Open pipeline is the straight sum
        of open-deal list prices (ADR 0081).
      </p>
    </div>
  );
}
