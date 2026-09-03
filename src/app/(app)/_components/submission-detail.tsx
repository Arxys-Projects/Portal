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
import { PIPEDRIVE_WINDOW_TARGET } from "@/lib/pipedrive/url";
import { codecLabel } from "@/lib/calculator/tables";
import { bandwidthBasis, retentionSummary } from "@/lib/calculator/compute";

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
  // Required decimal RAID-net capacity on calc_version 2 rows; the old
  // raw-video × 1.2 figure on version 1. Not comparable across the two.
  storage_tb: number;
  // Phase A (ADRs 0123–0128). null on version-1 rows, which had no
  // user-visible buffer and never separated footage from capacity-to-buy.
  recorded_storage_tb: number | null;
  calc_version: number;
  max_disk_utilization_pct: number | null;
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
  // ADR 0132 — banked per group from calc_version 3 on. Absent on earlier rows,
  // where the row's single retention_days applied to every group.
  retentionDays?: number;
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

export type SubmissionLineageSummary = {
  parent: { id: string; project_name: string | null; created_at: string } | null;
  children: { id: string; project_name: string | null; created_at: string }[];
};

function lineageDetailHref(mode: "admin" | "partner", id: string): string {
  return mode === "admin" ? `/admin/submissions/${id}` : `/submissions/${id}`;
}

export function SubmissionDetail({
  submission,
  partner,
  mode,
  canRevise,
  generateQuoteButton,
  projectQuotePanel,
  lineage,
  relinkPipedriveButton,
}: {
  submission: SubmissionDetailRow;
  partner?: SubmissionPartnerSummary;
  mode: "admin" | "partner";
  canRevise?: boolean;
  generateQuoteButton?: ReactNode;
  projectQuotePanel?: ReactNode;
  lineage?: SubmissionLineageSummary;
  // ADR 0093 step 3 — "Retry Pipedrive link" control, supplied by the admin
  // page when the viewer may act on it. Replaces the bare "no deal linked" text.
  relinkPipedriveButton?: ReactNode;
}) {
  const groups = extractGroups(submission.groups_payload);
  // ADR 0130 — whether this row's banked Mbit/s is the event peak or the
  // pre-Phase-A motion-weighted average. Read from the stamp, never assumed.
  const bandwidth = bandwidthBasis(submission.calc_version);
  // ADR 0132 — retention is per group. A row that banked none (calc_version 1/2)
  // has retention_days as every group's retention, so falling back to it renders
  // those rows exactly as before rather than as a gap.
  const groupRetentions = groups.map((g) => g.retentionDays ?? submission.retention_days);
  const retention = retentionSummary(
    groupRetentions.length > 0 ? groupRetentions : [submission.retention_days],
  );
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
        {lineage?.parent ? (
          <p className="mt-1 text-sm text-ink-soft">
            Revision of{" "}
            <Link
              href={lineageDetailHref(mode, lineage.parent.id)}
              className="font-semibold text-arxys-navy hover:underline"
            >
              {lineage.parent.project_name || "(untitled submission)"} ·{" "}
              {formatDate(lineage.parent.created_at)}
            </Link>
          </p>
        ) : null}
        {lineage && lineage.children.length > 0 ? (
          <p className="mt-1 text-sm font-semibold text-danger">
            Superseded by{" "}
            {lineage.children.map((child, i) => (
              <span key={child.id}>
                {i > 0 ? ", " : ""}
                <Link
                  href={lineageDetailHref(mode, child.id)}
                  className="underline decoration-2 underline-offset-2"
                >
                  {formatDate(child.created_at)}
                </Link>
              </span>
            ))}{" "}
            — this copy is no longer the current revision.
          </p>
        ) : null}
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
            Download Calculator Submission PDF
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
              target={PIPEDRIVE_WINDOW_TARGET}
              rel="noreferrer"
              className={buttonClasses("secondary")}
            >
              Open Pipedrive deal #{submission.pipedrive_deal_id} ↗
            </a>
          ) : null}
          {mode === "admin" && !submission.pipedrive_deal_id
            ? (relinkPipedriveButton ?? (
                <span className="text-xs text-ink-soft">
                  No Pipedrive deal linked to this submission.
                </span>
              ))
            : null}
        </div>
      </header>

      {projectQuotePanel}

      <section>
        <h2 className="text-base font-bold text-ink">Calculator inputs</h2>
        <KvTable>
          <KvRow label="VMS">{submission.vms ?? "—"}</KvRow>
          {/* ADR 0132 — one figure when every group agrees, otherwise the range
              plus a pointer to the per-group column, rather than a single number
              that is only true of the longest group. */}
          <KvRow label="Retention">
            {retention.uniform ? (
              retention.label
            ) : (
              <>
                {retention.label} — set per camera group, shown in the breakdown below
              </>
            )}
          </KvRow>
          <KvRow label="Primary resolution">{submission.resolution_code}</KvRow>
          <KvRow label="Primary codec / complexity">
            {codecLabel(submission.codec)} ·{" "}
            {groups[0]?.complexityLabel ??
              fallbackComplexityLabel(groups[0]?.complexity ?? submission.complexity)}
          </KvRow>
          <KvRow label="Totals">
            {formatNumber(submission.cameras_count)} cameras ·{" "}
            {/* ADR 0130 — the stamp decides whether this figure is a peak. A
                version-1 row banked a motion-weighted average, so claiming
                "peak" on it would under-state the network by up to 64%. */}
            {formatNumber(submission.bandwidth_mbps, 2)} Mbit/s {bandwidth.short} ·{" "}
            {formatNumber(submission.storage_tb, 2)} TB net usable needed
          </KvRow>
          <KvRow label="Network sizing">
            {bandwidth.isEventPeak ? (
              <>
                {formatNumber(submission.bandwidth_mbps, 2)} Mbit/s is the peak while
                recording — the full rate every camera streams the moment something
                happens. Recording on motion cuts storage but not this figure, so size
                switches and uplinks for at least this much.
              </>
            ) : (
              <>
                {formatNumber(submission.bandwidth_mbps, 2)} Mbit/s is a motion-weighted
                average, not the network peak. The pre-2026-08 model reduced bandwidth for
                motion-triggered groups, so the true peak is higher — up to{" "}
                {Math.round(100 / 0.36 - 100)}% higher on a group at the 20% motion floor.
                Re-save this quote to size it on the current model.
              </>
            )}
          </KvRow>
          {/* ADR 0126 — state the sizing basis in words rather than leaving the
              reader to assume one. A version-1 row predates the buffer, so it
              says that instead of showing a cap it was never sized against. */}
          <KvRow label="Storage sizing">
            {submission.calc_version >= 2 && submission.recorded_storage_tb != null ? (
              <>
                {formatNumber(submission.recorded_storage_tb, 2)} TB of recorded footage over{" "}
                {retention.label}, sized to run at no more than{" "}
                {submission.max_disk_utilization_pct ?? 90}% full and adjusted for the
                capacity a formatted disk presents to the VMS, needs{" "}
                <strong className="font-semibold text-ink">
                  {formatNumber(submission.storage_tb, 2)} TB of net usable storage
                </strong>{" "}
                — the figure to match against a server&apos;s Net Usable rating. RAID
                parity is not included in it, because Net Usable is already stated after
                parity drives: compare the two directly and add nothing. That{" "}
                {100 - (submission.max_disk_utilization_pct ?? 90)}% is the only safety
                margin in this estimate.
              </>
            ) : (
              <>
                Sized by the pre-2026-08 model, which applied a fixed internal overhead
                rather than a stated disk-utilization cap. Recorded-footage and
                utilization figures were not captured for this estimate, and its storage
                figure is not directly comparable to one produced after that change.
              </>
            )}
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
                <TH numeric>Retention (days)</TH>
                <TH numeric>Mbit/s {bandwidth.short}</TH>
                <TH numeric>GB to buy</TH>
              </TR>
            </THead>
            <TBody>
              {groups.map((g, i) => (
                <TR key={i}>
                  <TD>{g.name || `Group ${i + 1}`}</TD>
                  <TD numeric>{formatNumber(g.cameras)}</TD>
                  <TD>{g.resolutionLabel ?? "—"}</TD>
                  {/* codecLabel resolves retired keys too, so a quote taken on
                      H.264-Smart still reads as what it was quoted on rather
                      than as a bare "smart" (ADR 0124). */}
                  <TD>{codecLabel(g.codec)}</TD>
                  <TD>{g.complexityLabel ?? fallbackComplexityLabel(g.complexity)}</TD>
                  <TD numeric>{formatNumber(g.fps)}</TD>
                  <TD numeric>{Math.round(((g.recordingPercent ?? 0) / 100) * 24)}</TD>
                  <TD numeric>{formatNumber(g.motionPercent)}</TD>
                  {/* Falls back to the row scalar for a pre-0132 row, which had
                      exactly this retention on every group. */}
                  <TD numeric>{formatNumber(g.retentionDays ?? submission.retention_days)}</TD>
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
