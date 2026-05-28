"use client";

import { useState } from "react";
import Link from "next/link";
import {
  STATUS_META,
  NO_STATUS_BADGE,
  type SubmissionStatus,
} from "@/app/(app)/submissions/status";
import type { Deal } from "@/lib/pipeline/forecast";

type SubmissionMini = {
  id: string;
  project_name: string | null;
  status: SubmissionStatus | null;
  is_preferred: boolean;
  total_list_price_usd: number | null;
  created_at: string;
};

export type PartnerGroup = {
  partner_id: string;
  partner_name: string;
  deals: (Deal & { submissions: SubmissionMini[] })[];
  draft_count: number;
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

function StatusBadge({ status }: { status: SubmissionStatus | null }) {
  const meta = status ? STATUS_META[status] : null;
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${
        meta ? meta.badge : NO_STATUS_BADGE
      }`}
    >
      {meta ? meta.label : "—"}
    </span>
  );
}

function PartnerCard({
  group,
  openPipeline,
  weighted,
}: {
  group: PartnerGroup;
  openPipeline: number;
  weighted: number;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-neutral-50"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-neutral-900">
            {group.partner_name}
          </span>
          <span className="text-xs text-neutral-500">
            {group.deals.length} deal{group.deals.length !== 1 ? "s" : ""}
            {group.draft_count > 0
              ? ` · ${group.draft_count} draft${group.draft_count !== 1 ? "s" : ""}`
              : ""}
          </span>
        </div>
        <div className="flex items-center gap-6 text-right">
          <div>
            <p className="text-xs text-neutral-400">Open pipeline</p>
            <p className="text-sm font-medium text-neutral-800">
              {formatPrice(openPipeline)}
            </p>
          </div>
          <div>
            <p className="text-xs text-neutral-400">Weighted forecast</p>
            <p className="text-sm font-medium text-neutral-800">
              {formatPrice(weighted)}
            </p>
          </div>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`text-neutral-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {expanded ? (
        <div className="border-t border-neutral-100">
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

  const isDraftOrNull =
    deal.status === null || deal.status === "draft";

  return (
    <div className="border-b border-neutral-50 last:border-0">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-6 py-2.5 text-left hover:bg-neutral-50"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm text-neutral-800">
            {deal.project_name ?? "(untitled)"}
          </span>
          {deal.pipedrive_deal_id ? (
            <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">
              Pipedrive
            </span>
          ) : null}
          <StatusBadge status={deal.status as SubmissionStatus | null} />
        </div>
        <div className="flex items-center gap-4 text-right">
          <span className="text-sm text-neutral-700">
            {isDraftOrNull ? (
              <span className="text-neutral-400 italic">—</span>
            ) : (
              formatPrice(deal.total_list_price_usd)
            )}
          </span>
          <span className="text-xs text-neutral-400">
            {deal.all_submission_ids.length} submission
            {deal.all_submission_ids.length !== 1 ? "s" : ""}
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`text-neutral-300 transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {expanded ? (
        <div className="bg-neutral-50 px-8 pb-2">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-neutral-400">
                <th className="py-1 font-medium">Date</th>
                <th className="py-1 font-medium">Status</th>
                <th className="py-1 font-medium text-right">List price</th>
                <th className="py-1 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {deal.submissions.map((s) => (
                <tr key={s.id} className="border-t border-neutral-100">
                  <td className="py-1 text-neutral-600">{formatDate(s.created_at)}</td>
                  <td className="py-1">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="py-1 text-right text-neutral-600">
                    {s.status === null || s.status === "draft" ? (
                      <span className="italic text-neutral-400">—</span>
                    ) : (
                      formatPrice(s.total_list_price_usd)
                    )}
                  </td>
                  <td className="py-1 text-right">
                    <Link
                      href={`/admin/submissions/${s.id}`}
                      className="text-blue-600 hover:underline"
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
  totalWeighted,
  statusCounts,
  draftCount,
}: {
  groups: PartnerGroup[];
  totalActivePartners: number;
  totalOpenPipeline: number;
  totalWeighted: number;
  statusCounts: Record<string, number>;
  draftCount: number;
}) {
  return (
    <div className="mt-6 space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Active partners" value={String(totalActivePartners)} />
        <SummaryCard label="Open pipeline" value={formatPrice(totalOpenPipeline)} />
        <SummaryCard label="Weighted forecast" value={formatPrice(totalWeighted)} />
        <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
          <p className="text-xs text-neutral-500">By status</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            {Object.entries(statusCounts).map(([st, n]) => (
              <span key={st} className="text-xs text-neutral-700">
                {st}: <strong>{n}</strong>
              </span>
            ))}
            {draftCount > 0 ? (
              <span className="text-xs text-neutral-400 italic">
                drafts: {draftCount}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Per-partner rows */}
      <div className="space-y-2">
        {groups.map((group) => {
          const { openPipeline, weighted } = groupForecast(group.deals);
          return (
            <PartnerCard
              key={group.partner_id}
              group={group}
              openPipeline={openPipeline}
              weighted={weighted}
            />
          );
        })}
      </div>

      <p className="text-xs text-neutral-400">
        Pre-CRM partner activity — not synced with Pipedrive stage.
        Weights: Sent 40% · On Hold 20% · Won 100% · Lost 0%.
        Draft/unset values excluded from dollar totals.
      </p>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-neutral-900">{value}</p>
    </div>
  );
}

function groupForecast(deals: (Deal & { submissions: SubmissionMini[] })[]) {
  let openPipeline = 0;
  let weighted = 0;
  const PROB: Record<string, number> = {
    "on-hold": 0.2,
    sent: 0.4,
    won: 1.0,
    lost: 0.0,
  };
  for (const deal of deals) {
    if (deal.status === null || deal.status === "draft") continue;
    const value = deal.total_list_price_usd ?? 0;
    openPipeline += value;
    weighted += value * (PROB[deal.status] ?? 0);
  }
  return { openPipeline, weighted };
}
