"use client";

import { useState } from "react";
import Link from "next/link";
import { type SubmissionStatus } from "@/app/(app)/submissions/status";
import {
  StatusBadge,
  MetricTile,
  buttonClasses,
} from "@/app/(app)/_components/ui";
import type { Deal } from "@/lib/pipeline/forecast";

type SubmissionMini = {
  id: string;
  project_name: string | null;
  status: SubmissionStatus;
  is_preferred: boolean;
  total_list_price_usd: number | null;
  created_at: string;
  // ADR 0093 step 2 — true when a later revision (parent_submission_id) points
  // back to this row. Still status="open" in the DB (ADR 0081's lifecycle is
  // deal-outcome, not revision position), but it is no longer the live copy.
  superseded: boolean;
  // Per-submission deal id. Distinct from the deal row's id above: rows in one
  // lineage can point at different deals (or none), which is exactly what you
  // need to see before choosing which submission to open.
  pipedrive_deal_id: string | null;
};

export type PartnerGroup = {
  partner_id: string;
  partner_name: string;
  deals: (Deal & { submissions: SubmissionMini[] })[];
};

function formatPrice(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `$${Number(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

function PartnerCard({
  group,
  openPipeline,
  wonTotal,
}: {
  group: PartnerGroup;
  openPipeline: number;
  wonTotal: number;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="overflow-hidden rounded-xl border-2 border-line bg-surface">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-[#f7f9fc]"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-ink">{group.partner_name}</span>
          <span className="text-xs text-ink-soft">
            {group.deals.length} deal{group.deals.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-6 text-right">
          <div>
            <p className="text-xs text-ink-soft">Open pipeline</p>
            <p className="text-sm font-semibold tabular-nums text-ink">
              {formatPrice(openPipeline)}
            </p>
          </div>
          <div>
            <p className="text-xs text-ink-soft">Won</p>
            <p className="text-sm font-semibold tabular-nums text-ink">
              {formatPrice(wonTotal)}
            </p>
          </div>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`text-arxys-navy transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {expanded ? (
        <div className="border-t border-line">
          {group.deals.map((deal) => (
            <DealRow key={deal.representative_id} deal={deal} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DealRow({ deal }: { deal: Deal & { submissions: SubmissionMini[] } }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-line-soft last:border-0">
      {/* The Pipedrive link is a SIBLING of the expand button, not a child of it:
          an <a> nested inside a <button> is invalid HTML and the two click
          targets fight each other. The button still fills the row so the whole
          strip stays clickable to expand. */}
      <div className="flex w-full items-center gap-3 pr-4 hover:bg-[#f7f9fc]">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex flex-1 items-center justify-between px-6 py-2.5 text-left"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-medium text-ink">
              {deal.project_name ?? "(untitled)"}
            </span>
            <StatusBadge variant="status" status={deal.status as SubmissionStatus} />
          </div>
          <div className="flex items-center gap-4 text-right">
            <span className="text-sm tabular-nums text-ink">
              {formatPrice(deal.total_list_price_usd)}
            </span>
            <span className="text-xs text-ink-soft">
              {deal.all_submission_ids.length} submission
              {deal.all_submission_ids.length !== 1 ? "s" : ""}
            </span>
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className={`text-arxys-navy transition-transform ${expanded ? "rotate-180" : ""}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </button>
        {/* Replaces the old non-clickable "Pipedrive" badge. Carrying the deal
            NUMBER is the point: it lets you confirm you're about to open the
            right deal without clicking through to a submission first. When
            there's no deal, say so explicitly rather than showing nothing —
            an empty space reads as "not loaded", not as "none". */}
        {deal.pipedrive_deal_id ? (
          <a
            href={`https://app.pipedrive.com/deal/${deal.pipedrive_deal_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-lg border-2 border-arxys-navy px-2.5 py-1 text-xs font-bold text-arxys-navy hover:bg-arxys-navy hover:text-white"
          >
            Pipedrive #{deal.pipedrive_deal_id} ↗
          </a>
        ) : (
          <span className="shrink-0 px-2.5 py-1 text-xs font-semibold text-ink-soft">
            No Pipedrive deal
          </span>
        )}
      </div>

      {expanded ? (
        <div className="bg-[#f7f9fc] px-8 pb-3 pt-1">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-ink-soft">
                <th className="py-1.5 font-bold uppercase tracking-wide">Date</th>
                <th className="py-1.5 font-bold uppercase tracking-wide">Status</th>
                <th className="py-1.5 text-right font-bold uppercase tracking-wide">List price</th>
                <th className="py-1.5 pl-4 font-bold uppercase tracking-wide">Pipedrive</th>
                <th className="py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {deal.submissions.map((s) => (
                <tr key={s.id} className="border-t border-line-soft">
                  <td className="py-1.5 text-ink-soft">{formatDate(s.created_at)}</td>
                  <td className="py-1.5">
                    <div className="flex items-center gap-1.5">
                      <StatusBadge variant="status" status={s.status} />
                      {s.superseded ? (
                        <StatusBadge variant="on-behalf">Superseded</StatusBadge>
                      ) : null}
                    </div>
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-ink">
                    {formatPrice(s.total_list_price_usd)}
                  </td>
                  <td className="py-1.5 pl-4">
                    {s.pipedrive_deal_id ? (
                      <a
                        href={`https://app.pipedrive.com/deal/${s.pipedrive_deal_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold text-arxys-navy underline decoration-2 underline-offset-2 hover:no-underline"
                      >
                        #{s.pipedrive_deal_id} ↗
                      </a>
                    ) : (
                      // Spelled out, not left blank — a missing link on this row
                      // means the submission never reached the CRM, which is a
                      // fact worth reading, not an empty cell.
                      <span className="text-ink-soft">None</span>
                    )}
                  </td>
                  <td className="py-1.5 text-right">
                    <Link
                      href={`/admin/submissions/${s.id}`}
                      className={buttonClasses("primary", "sm")}
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export function PartnerGroupView({
  groups,
  totalActivePartners,
  totalOpenPipeline,
  statusCounts,
}: {
  groups: PartnerGroup[];
  totalActivePartners: number;
  totalOpenPipeline: number;
  statusCounts: Record<string, number>;
}) {
  return (
    <div className="mt-6 space-y-4">
      {/* Summary tiles — three-state model (ADR 0081), no weighting. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MetricTile label="Active partners" value={String(totalActivePartners)} />
        <MetricTile label="Open pipeline" value={formatPrice(totalOpenPipeline)} />
        <MetricTile
          label="By status"
          value={
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 pt-0.5 text-[13px] font-bold">
              {Object.entries(statusCounts).map(([st, n]) => (
                <span key={st} className="text-ink">
                  {st}: <strong>{n}</strong>
                </span>
              ))}
            </div>
          }
        />
      </div>

      {/* Per-partner rows */}
      <div className="space-y-2">
        {groups.map((group) => (
          <PartnerCard
            key={group.partner_id}
            group={group}
            openPipeline={groupTotal(group.deals, "open")}
            wonTotal={groupTotal(group.deals, "won")}
          />
        ))}
      </div>

      <p className="text-xs text-ink-soft">
        Pre-CRM partner activity — not synced with Pipedrive stage. Open pipeline
        is the straight sum of Open-deal list prices (ADR 0081).
      </p>
    </div>
  );
}

// Straight sum of deal list prices at one status for one partner (ADR 0081;
// no weighting).
function groupTotal(
  deals: (Deal & { submissions: SubmissionMini[] })[],
  status: "open" | "won",
): number {
  let total = 0;
  for (const deal of deals) {
    if (deal.status === status) total += deal.total_list_price_usd ?? 0;
  }
  return total;
}
