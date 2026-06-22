import Link from "next/link";
import type { ReactNode } from "react";
import {
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  buttonClasses,
} from "@/app/(app)/_components/ui";

export type SubmissionDetailRow = {
  id: string;
  project_name: string | null;
  cameras_count: number;
  resolution_code: string;
  codec: string;
  complexity: string;
  vms: string | null;
  retention_days: number;
  bandwidth_mbps: number;
  storage_tb: number;
  // Phase 2 Step 3+4: TEXT after the SKU-PK migration. Holds a SKU
  // (`VX5-V800-720`) for new submissions, a UUID-shaped string for
  // pre-migration legacy rows, or null.
  recommended_product_id: string | null;
  recommended_units: number;
  total_list_price_usd: number | null;
  total_partner_price_usd: number | null;
  pipedrive_deal_id: number | null;
  created_at: string;
  groups_payload: unknown;
  // null when the recommended_product_id is a legacy UUID with no matching
  // row, or when no recommendation was attached.
  product: { sku: string; product_name: string; product_group: string } | null;
};

export type SubmissionPartnerSummary = {
  id: string;
  companyName: string;
  contactName: string;
};

type GroupRow = {
  name?: string;
  cameras?: number;
  resolutionLabel?: string;
  codec?: string;
  complexity?: string;
  complexityLabel?: string;
  fps?: number;
  recordingPercent?: number;
  motionPercent?: number;
  computed?: {
    bandwidthMbps?: number;
    storageGb?: number;
  };
};

// Mirrors render.ts fallbackComplexityLabel. For legacy rows banked before the
// six-level rework that have no complexityLabel, derive a display label from
// the coarse tier word. Keep in sync with the PDF helper.
function fallbackComplexityLabel(tier: string | undefined): string {
  switch (tier) {
    case "low": return "Low detail";
    case "med": return "Medium detail";
    case "high": return "High detail";
    default: return "Standard";
  }
}

function extractGroups(payload: unknown): GroupRow[] {
  if (!payload || typeof payload !== "object") return [];
  const candidate = (payload as { groups?: unknown }).groups;
  if (!Array.isArray(candidate)) return [];
  return candidate as GroupRow[];
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function formatNumber(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatPrice(n: number | null | undefined): string {
  if (n === null || n === undefined) return "Pricing TBD";
  return `$${formatNumber(Number(n), 2)}`;
}

// Left-label key/value table. Keeps its label/value shape (ADR 0067) but
// shares the firmed border, navy-soft header tone, and ink text tokens with
// the column-header Table.
function KvTable({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 overflow-hidden rounded-xl border-2 border-line bg-surface">
      <table className="w-full text-sm">
        <tbody className="divide-y divide-line-soft">{children}</tbody>
      </table>
    </div>
  );
}

function KvRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <tr>
      <th className="w-48 bg-arxys-navy-soft px-4 py-2.5 text-left align-top text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">
        {label}
      </th>
      <td className="px-4 py-2.5 text-ink">{children}</td>
    </tr>
  );
}

export function SubmissionDetail({
  submission,
  partner,
  mode,
  canRevise,
  generateQuoteButton,
}: {
  submission: SubmissionDetailRow;
  partner?: SubmissionPartnerSummary;
  mode: "admin" | "partner";
  canRevise?: boolean;
  generateQuoteButton?: ReactNode;
}) {
  const groups = extractGroups(submission.groups_payload);
  // Phase 2 Step 3+4: a UUID-shaped recommended_product_id signals a
  // pre-migration row whose family-UUID FK target was dropped. Render the
  // detail as "(legacy data)" so the partner / admin sees an explicit
  // limitation rather than a confusing "—".
  const isLegacyRecommendation =
    submission.product === null &&
    submission.recommended_product_id !== null &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      submission.recommended_product_id,
    );
  const productLabel = submission.product
    ? `${submission.product.product_name} (${submission.product.sku})`
    : isLegacyRecommendation
      ? "(legacy data — product details unavailable)"
      : "—";

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-ink">
          {submission.project_name || "(untitled submission)"}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Submitted {formatDate(submission.created_at)} · ID{" "}
          <code className="rounded bg-arxys-navy-soft px-1 py-0.5 text-xs text-ink">
            {submission.id}
          </code>
        </p>
        {mode === "admin" && partner ? (
          <p className="mt-1 text-sm text-ink-soft">
            Partner:{" "}
            <Link
              href={`/admin/partners`}
              className="font-semibold text-arxys-navy hover:underline"
            >
              {partner.companyName}
            </Link>{" "}
            — {partner.contactName}
          </p>
        ) : null}

        {/* Actions live directly under the header (ADR 0067). When a
            generateQuoteButton is present it is the primary action; the
            remaining controls are utility actions on the existing submission. */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {generateQuoteButton ? (
            <>
              {generateQuoteButton}
              <span className="h-5 w-px bg-line" aria-hidden />
            </>
          ) : null}
          <a
            href={`/api/submissions/${submission.id}/pdf`}
            className={buttonClasses(generateQuoteButton ? "secondary" : "primary")}
            download
          >
            Download PDF
          </a>
          {mode === "partner" || canRevise ? (
            <Link
              href={`/calculator?revise=${submission.id}`}
              className={buttonClasses("secondary")}
            >
              Edit / revise quote
            </Link>
          ) : null}
          {mode === "admin" && submission.pipedrive_deal_id ? (
            <a
              href={`https://app.pipedrive.com/deal/${submission.pipedrive_deal_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses("secondary")}
            >
              Open Pipedrive deal #{submission.pipedrive_deal_id} ↗
            </a>
          ) : null}
          {mode === "admin" && !submission.pipedrive_deal_id ? (
            <span className="text-xs text-ink-soft">
              No Pipedrive deal linked to this submission.
            </span>
          ) : null}
        </div>
      </header>

      <section>
        <h2 className="text-base font-bold text-ink">Calculator inputs</h2>
        <KvTable>
          <KvRow label="VMS">{submission.vms ?? "—"}</KvRow>
          <KvRow label="Retention (days)">{submission.retention_days}</KvRow>
          <KvRow label="Primary resolution">{submission.resolution_code}</KvRow>
          <KvRow label="Primary codec / complexity">
            {submission.codec} ·{" "}
            {groups[0]?.complexityLabel ??
              fallbackComplexityLabel(groups[0]?.complexity ?? submission.complexity)}
          </KvRow>
          <KvRow label="Totals">
            {formatNumber(submission.cameras_count)} cameras ·{" "}
            {formatNumber(submission.bandwidth_mbps, 2)} Mbit/s ·{" "}
            {formatNumber(submission.storage_tb, 2)} TB
          </KvRow>
        </KvTable>
      </section>

      {groups.length > 0 ? (
        <section>
          <h2 className="mb-3 text-base font-bold text-ink">Per-group breakdown</h2>
          <Table>
            <THead>
              <TR>
                <TH>Group</TH>
                <TH numeric>Cameras</TH>
                <TH>Resolution</TH>
                <TH>Codec</TH>
                <TH>Complexity</TH>
                <TH numeric>FPS</TH>
                <TH numeric>Rec Hrs</TH>
                <TH numeric>Motion %</TH>
                <TH numeric>Mbit/s</TH>
                <TH numeric>GB</TH>
              </TR>
            </THead>
            <TBody>
              {groups.map((g, i) => (
                <TR key={i}>
                  <TD>{g.name || `Group ${i + 1}`}</TD>
                  <TD numeric>{formatNumber(g.cameras)}</TD>
                  <TD>{g.resolutionLabel ?? "—"}</TD>
                  <TD>{g.codec ?? "—"}</TD>
                  <TD>{g.complexityLabel ?? fallbackComplexityLabel(g.complexity)}</TD>
                  <TD numeric>{formatNumber(g.fps)}</TD>
                  <TD numeric>{Math.round(((g.recordingPercent ?? 0) / 100) * 24)}</TD>
                  <TD numeric>{formatNumber(g.motionPercent)}</TD>
                  <TD numeric>{formatNumber(g.computed?.bandwidthMbps, 2)}</TD>
                  <TD numeric>{formatNumber(g.computed?.storageGb, 2)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </section>
      ) : null}

      <section>
        <h2 className="text-base font-bold text-ink">Recommendation</h2>
        <KvTable>
          <KvRow label="Recommended">
            {submission.recommended_units} × {productLabel}
          </KvRow>
          {submission.product?.product_group ? (
            <KvRow label="Product family">{submission.product.product_group}</KvRow>
          ) : null}
          <KvRow label="Total list price">
            {isLegacyRecommendation
              ? "(legacy pricing — pre-Phase-2)"
              : formatPrice(submission.total_list_price_usd)}
          </KvRow>
          {mode === "admin" ? (
            <KvRow label="Total partner price">
              {isLegacyRecommendation
                ? "(legacy pricing — pre-Phase-2)"
                : formatPrice(submission.total_partner_price_usd)}
            </KvRow>
          ) : null}
        </KvTable>
      </section>
    </div>
  );
}
