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
}: {
  group: PartnerGroup;
  openPipeline: number;
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
          {/* TODO(0081-ui): Weighted Forecast retired (ADR 0081); value stubbed.
              The Design pass removes/reworks this column. */}
          <div>
            <p className="text-xs text-ink-soft">Weighted forecast</p>
            <p className="text-sm font-semibold tabular-nums text-ink-soft">—</p>
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
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between px-6 py-2.5 text-left hover:bg-[#f7f9fc]"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-medium text-ink">
            {deal.project_name ?? "(untitled)"}
          </span>
          {deal.pipedrive_deal_id ? (
            <StatusBadge variant="source">Pipedrive</StatusBadge>
          ) : null}
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

      {expanded ? (
        <div className="bg-[#f7f9fc] px-8 pb-3 pt-1">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-ink-soft">
                <th className="py-1.5 font-bold uppercase tracking-wide">Date</th>
                <th className="py-1.5 font-bold uppercase tracking-wide">Status</th>
                <th className="py-1.5 text-right font-bold uppercase tracking-wide">List price</th>
                <th className="py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {deal.submissions.map((s) => (
                <tr key={s.id} className="border-t border-line-soft">
                  <td className="py-1.5 text-ink-soft">{formatDate(s.created_at)}</td>
                  <td className="py-1.5">
                    <StatusBadge variant="status" status={s.status} />
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-ink">
                    {formatPrice(s.total_list_price_usd)}
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
      {/* Summary tiles. TODO(0081-ui): Weighted Forecast retired (ADR 0081) —
          value stubbed to "—"; the Design pass removes/reworks the tile. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricTile label="Active partners" value={String(totalActivePartners)} />
        <MetricTile label="Open pipeline" value={formatPrice(totalOpenPipeline)} />
        <MetricTile label="Weighted forecast" value="—" />
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
            openPipeline={groupOpenPipeline(group.deals)}
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

// Straight sum of Open-deal list prices for one partner (ADR 0081; no weighting).
function groupOpenPipeline(
  deals: (Deal & { submissions: SubmissionMini[] })[],
): number {
  let openPipeline = 0;
  for (const deal of deals) {
    if (deal.status === "open") openPipeline += deal.total_list_price_usd ?? 0;
  }
  return openPipeline;
}
