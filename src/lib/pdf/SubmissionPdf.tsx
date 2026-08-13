import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import {
  ARXYS_GOLD,
  ARXYS_NAVY,
  BG_LIGHT,
  BORDER_LIGHT,
  FOOTER_MUTED,
  TEXT_MUTED,
  TEXT_SLATE,
  TRACK_GRAY,
} from "./colors";
import type { SubmissionPdfInput } from "./types";
import { availableCapacityTb, utilizationNote } from "@/lib/capacity-utils";
import { bandwidthBasis } from "@/lib/calculator/compute";

const styles = StyleSheet.create({
  page: {
    paddingTop: 34,
    paddingHorizontal: 44,
    paddingBottom: 50,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: TEXT_SLATE,
    lineHeight: 1.4,
  },

  // 1. Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  logo: { width: 120 },
  logoFallback: {
    fontSize: 24,
    fontFamily: "Helvetica-Bold",
    color: ARXYS_GOLD,
    letterSpacing: 3,
  },
  tagline: {
    fontSize: 8,
    color: TEXT_MUTED,
    marginTop: 4,
    maxWidth: 200,
  },
  headerRight: { alignItems: "flex-end" },
  estimatePill: {
    backgroundColor: ARXYS_NAVY,
    color: "#ffffff",
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.5,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  headerMeta: { fontSize: 9, color: TEXT_MUTED, textAlign: "right" },
  headerMetaStrong: {
    fontSize: 9,
    color: TEXT_SLATE,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
  },
  rule: {
    borderBottomWidth: 2,
    borderBottomColor: ARXYS_NAVY,
    marginTop: 8,
    marginBottom: 12,
  },

  // Section heading
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: ARXYS_NAVY,
    marginBottom: 6,
  },

  // 2. Camera schedule
  tableHeaderRow: { flexDirection: "row", backgroundColor: ARXYS_NAVY },
  th: {
    color: "#ffffff",
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    textTransform: "uppercase",
    padding: 5,
  },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: BORDER_LIGHT,
  },
  td: { fontSize: 8, padding: 5 },
  totalsRow: { flexDirection: "row", backgroundColor: "#dbe4f0" },
  totalsCell: { fontSize: 8, padding: 5, fontFamily: "Helvetica-Bold" },

  // Each camera group renders as a two-tier block: a full-width header line
  // (group name + stream count), then a full-width specs row. The count lives
  // on the header line, so the specs grid has room for the long descriptive
  // scene labels and the operation-hours text.
  groupHeaderRow: {
    backgroundColor: BG_LIGHT,
    paddingVertical: 4,
    paddingHorizontal: 5,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_LIGHT,
  },
  groupHeaderText: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: ARXYS_NAVY,
  },
  groupHeaderCount: {
    fontFamily: "Helvetica",
    color: TEXT_MUTED,
  },

  // 7-column specs grid (widths sum to 100). Group name + count are lifted out
  // onto the header line above, freeing width for Scene complexity / Operation
  // hrs. Totals label spans the first five columns so the Bandwidth / Storage
  // totals stay aligned under their headers.
  colRes: { width: "15%" },
  colCodec: { width: "12%" },
  colFps: { width: "7%", textAlign: "right" },
  colScene: { width: "26%" },
  colHrs: { width: "16%" },
  colBw: { width: "12%", textAlign: "right" },
  colSt: { width: "12%", textAlign: "right" },
  colTotalsLabel: { width: "76%" },
  tableNote: {
    fontSize: 7.5,
    fontStyle: "italic",
    color: TEXT_MUTED,
    marginTop: 4,
    marginBottom: 9,
  },
  recDisclaimer: {
    fontSize: 8,
    fontStyle: "italic",
    color: TEXT_MUTED,
    marginTop: -2,
    marginBottom: 8,
  },

  // 3. Capacity bars
  barBlock: { marginBottom: 5 },
  barLabel: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: TEXT_SLATE,
    marginBottom: 2,
  },
  barTrack: {
    height: 10,
    backgroundColor: TRACK_GRAY,
    borderRadius: 2,
  },
  barFill: { height: 10, borderRadius: 2 },
  barValue: { fontSize: 8, color: TEXT_MUTED, marginTop: 2 },

  // 4. Recommended server
  recRow: { flexDirection: "row", marginBottom: 6 },
  recImageCol: {
    width: 130,
    alignItems: "center",
    justifyContent: "center",
    paddingRight: 16,
  },
  recImage: { width: 120 },
  recImagePlaceholder: {
    width: 120,
    height: 72,
    backgroundColor: BG_LIGHT,
    borderWidth: 1,
    borderColor: BORDER_LIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  recDetailCol: { flex: 1 },
  recModel: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: ARXYS_NAVY,
    lineHeight: 1.1,
    marginBottom: 2,
  },
  recSku: { fontSize: 9, color: TEXT_MUTED, marginBottom: 7 },
  specGrid: { flexDirection: "row", flexWrap: "wrap" },
  specPair: { width: "50%", marginBottom: 3 },
  specKey: {
    fontSize: 7,
    color: TEXT_MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  specVal: { fontSize: 9, fontFamily: "Helvetica-Bold", color: TEXT_SLATE },

  // 5. Pricing row
  pricingRow: {
    flexDirection: "row",
    backgroundColor: ARXYS_NAVY,
    marginBottom: 8,
  },
  pricingCell: {
    flex: 1,
    padding: 10,
    alignItems: "center",
  },
  pricingLabel: {
    fontSize: 7,
    color: "#c7d2e0",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 3,
  },
  pricingValue: { fontSize: 15, fontFamily: "Helvetica-Bold", color: "#ffffff" },
  pricingValueGold: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    color: ARXYS_GOLD,
  },
  pricingDivider: { width: 1, backgroundColor: "#33507a" },

  // 6. Value badges
  badgeRow: { flexDirection: "row", marginBottom: 10 },
  badge: { flex: 1, alignItems: "center", paddingHorizontal: 4 },
  badgeCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: ARXYS_NAVY,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 5,
  },
  badgeLetter: { color: "#ffffff", fontSize: 12, fontFamily: "Helvetica-Bold" },
  badgeTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: TEXT_SLATE,
    textAlign: "center",
  },
  badgeSub: { fontSize: 7, color: TEXT_MUTED, textAlign: "center" },

  // 7. Footer
  footer: {
    position: "absolute",
    bottom: 24,
    left: 44,
    right: 44,
    borderTopWidth: 1,
    borderTopColor: BORDER_LIGHT,
    paddingTop: 8,
  },
  footerDisclaimer: {
    fontSize: 7,
    color: FOOTER_MUTED,
    lineHeight: 1.5,
    marginBottom: 5,
  },
  footerCompany: {
    fontSize: 7.5,
    color: TEXT_MUTED,
    fontFamily: "Helvetica-Bold",
  },
});

// --- Formatting helpers -----------------------------------------------------

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function fmtTb(tb: number): string {
  return `${tb.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} TB`;
}

function fmtMbps(mbps: number): string {
  return mbps.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function fmtUsd(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function dash(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

export const SCHEDULE_COLUMNS: ReadonlyArray<{ key: keyof typeof styles; label: string }> = [
  { key: "colRes", label: "Resolution" },
  { key: "colCodec", label: "Codec" },
  { key: "colFps", label: "FPS" },
  { key: "colScene", label: "Scene complexity" },
  { key: "colHrs", label: "Operation hrs" },
  { key: "colBw", label: "Bandwidth (Mbit/s)" },
  { key: "colSt", label: "Storage (TB)" },
];

// Operation-hours cell text: the daily hours figure plus the recording mode.
// Motion-triggered groups surface their motion percentage — under ADR 0125 that
// percentage is the exact fraction of those hours written, so it is what the
// reader needs to interpret the storage column.
function operationHoursText(g: SubmissionPdfInput["groups"][number]): string {
  if (g.recordingMode === "motion") {
    return `${g.hoursPerDay} (motion ${g.motionPercent}%)`;
  }
  return `${g.hoursPerDay} (continuous)`;
}

const VALUE_BADGES: ReadonlyArray<{ letter: string; title: string; subtitle: string }> = [
  { letter: "U", title: "Made in USA", subtitle: "San Diego, CA" },
  { letter: "N", title: "NDAA compliant", subtitle: "Federal-ready" },
  { letter: "W", title: "5-year warranty", subtitle: "Advanced replacement" },
  { letter: "S", title: "White-glove support", subtitle: "US-based engineers" },
  { letter: "H", title: "Hardware acceleration", subtitle: "Purpose-built" },
];

function CapacityBar({
  label,
  fillPct,
  color,
  value,
  note,
}: {
  label: string;
  fillPct: number;
  color: string;
  value: string;
  note?: string;
}) {
  const width = `${Math.max(0, Math.min(100, fillPct))}%`;
  return (
    <View style={styles.barBlock}>
      <Text style={styles.barLabel}>{label}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width, backgroundColor: color }]} />
      </View>
      <Text style={styles.barValue}>
        {value}
        {note ? `   ·   ${note}` : ""}
      </Text>
    </View>
  );
}

export function SubmissionPdf({ data }: { data: SubmissionPdfInput }) {
  const { serverSpec, recommendation } = data;
  const units = recommendation.units;

  // Camera schedule totals — summed from the per-group rows so the totals
  // line always reconciles with the table above it.
  const totalCameras = data.groups.reduce((s, g) => s + g.cameras, 0);
  const totalBandwidthMbps = data.groups.reduce((s, g) => s + g.bandwidthMbps, 0);
  const totalStorageTb = data.groups.reduce((s, g) => s + g.storageGb, 0) / 1000;

  // Capacity figures. Available storage prefers the RAID-computed usable
  // capacity; falls back to the recommendation's covered storage when the
  // product_specs join is missing (legacy rows).
  const availableStorageTb =
    serverSpec?.usablePerUnitTb != null
      ? serverSpec.usablePerUnitTb * units
      : recommendation.coveredStorageTb || null;
  const requiredStorageTb = data.storageTb;
  const storagePct =
    availableStorageTb && availableStorageTb > 0
      ? (requiredStorageTb / availableStorageTb) * 100
      : 0;

  // ADR 0127 — the capacity a formatted array actually presents to the VMS,
  // decimal RAID-net × 0.8931. Published so this document can be set beside a
  // Milestone proposal's "X TB of Y available" line and compared directly.
  const vmsAvailableTb = availableCapacityTb(availableStorageTb);

  const availableBandwidthMbps =
    serverSpec?.maxBandwidthMbps != null ? serverSpec.maxBandwidthMbps * units : null;
  const requiredBandwidthMbps = data.bandwidthMbps;
  // ADR 0130 — is this figure the event peak, or the pre-Phase-A
  // motion-weighted average? Read the stamp; never assert peak unconditionally.
  const bandwidth = bandwidthBasis(data.calcVersion);
  const bandwidthPct =
    availableBandwidthMbps && availableBandwidthMbps > 0
      ? (requiredBandwidthMbps / availableBandwidthMbps) * 100
      : 0;

  const utilizationPct = Math.max(storagePct, bandwidthPct);

  const skuLine = serverSpec
    ? `${units} × ${serverSpec.sku}${serverSpec.formFactor ? ` · ${serverSpec.formFactor}` : ""}`
    : `${units} × ${recommendation.productDescription}`;

  const modelName = serverSpec?.modelName ?? recommendation.productDescription;

  const specPairs: Array<{ key: string; value: string }> = serverSpec
    ? [
        {
          key: "Max camera streams",
          value: serverSpec.maxCameras != null ? `${serverSpec.maxCameras} (H.265/H.264)` : "—",
        },
        {
          key: "Max bandwidth",
          value:
            serverSpec.maxBandwidthMbps != null
              ? `${serverSpec.maxBandwidthMbps.toLocaleString("en-US")} Mbit/s`
              : "—",
        },
        { key: "Drive bays", value: dash(serverSpec.driveBays) },
        { key: "CPU", value: dash(serverSpec.cpuModelFull) },
        { key: "RAM", value: dash(serverSpec.ramSpec) },
        { key: "OS", value: dash(serverSpec.osEdition) },
        { key: "Warranty", value: serverSpec.warranty },
      ]
    : [];

  const unitMsrp = serverSpec?.msrp ?? null;
  const deploymentTotal = unitMsrp != null ? unitMsrp * units : null;

  return (
    <Document title="Arxys System Estimate">
      <Page size="LETTER" style={styles.page}>
        {/* 1. Header */}
        <View style={styles.header}>
          <View>
            {data.logoDataUri ? (
              // @react-pdf/renderer Image has no alt concept (not an HTML img).
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image style={styles.logo} src={data.logoDataUri} />
            ) : (
              <Text style={styles.logoFallback}>ARXYS</Text>
            )}
            <Text style={styles.tagline}>
              Purpose-built video surveillance infrastructure
            </Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.estimatePill}>SYSTEM ESTIMATE</Text>
            <Text style={styles.headerMeta}>{formatDate(data.generatedAt)}</Text>
            {data.projectName ? (
              <Text style={styles.headerMetaStrong}>Project: {data.projectName}</Text>
            ) : null}
            <Text style={styles.headerMeta}>
              Prepared for: {data.partner.companyName}
            </Text>
          </View>
        </View>
        <View style={styles.rule} />

        {/* 2. Camera schedule */}
        <Text style={styles.sectionTitle}>Camera schedule</Text>
        <View>
          <View style={styles.tableHeaderRow}>
            {SCHEDULE_COLUMNS.map((c) => (
              <Text key={c.label} style={[styles.th, styles[c.key]]}>
                {c.label}
              </Text>
            ))}
          </View>
          {data.groups.map((g, i) => (
            // Group block: header line + specs row stay together across page
            // breaks so a group is never split from its own header.
            <View key={i} wrap={false}>
              <View style={styles.groupHeaderRow}>
                <Text style={styles.groupHeaderText}>
                  {g.name}
                  <Text style={styles.groupHeaderCount}>
                    {"   ·   "}
                    {g.cameras} camera streams
                  </Text>
                </Text>
              </View>
              <View style={styles.tr}>
                <Text style={[styles.td, styles.colRes]}>{g.resolutionLabel}</Text>
                <Text style={[styles.td, styles.colCodec]}>{g.codec}</Text>
                <Text style={[styles.td, styles.colFps]}>{g.fps}</Text>
                <Text style={[styles.td, styles.colScene]}>{g.complexityLabel}</Text>
                <Text style={[styles.td, styles.colHrs]}>{operationHoursText(g)}</Text>
                <Text style={[styles.td, styles.colBw]}>{fmtMbps(g.bandwidthMbps)}</Text>
                <Text style={[styles.td, styles.colSt]}>
                  {(g.storageGb / 1000).toLocaleString("en-US", {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}
                </Text>
              </View>
            </View>
          ))}
          <View style={styles.totalsRow} wrap={false}>
            <Text style={[styles.totalsCell, styles.colTotalsLabel]}>
              Totals · {totalCameras} camera streams
            </Text>
            <Text style={[styles.totalsCell, styles.colBw]}>
              {fmtMbps(totalBandwidthMbps)}
            </Text>
            <Text style={[styles.totalsCell, styles.colSt]}>
              {totalStorageTb.toLocaleString("en-US", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}
            </Text>
          </View>
        </View>
        <Text style={styles.tableNote}>
          Retention period: {data.retentionDays} days. All figures assume even
          camera distribution across recording servers.
        </Text>

        {/* 3. Capacity bars */}
        <View wrap={false}>
          <Text style={styles.sectionTitle}>System capacity</Text>
          <CapacityBar
            label="Total storage"
            fillPct={storagePct}
            color={ARXYS_NAVY}
            value={
              availableStorageTb
                ? `${fmtTb(requiredStorageTb)} of ${fmtTb(availableStorageTb)} usable`
                : `${fmtTb(requiredStorageTb)} required`
            }
            note={vmsAvailableTb ? `${fmtTb(vmsAvailableTb)} available to the VMS` : undefined}
          />
          <CapacityBar
            label="Bandwidth"
            fillPct={bandwidthPct}
            color={ARXYS_NAVY}
            value={
              availableBandwidthMbps
                ? `${fmtMbps(requiredBandwidthMbps)} of ${fmtMbps(availableBandwidthMbps)} Mbit/s`
                : `${fmtMbps(requiredBandwidthMbps)} Mbit/s required`
            }
            /* ADR 0130 — a version-1 row banked a motion-weighted average, so
               this note reads off the stamp rather than asserting "peak" on a
               figure that isn't one. */
            note={bandwidth.isEventPeak ? "peak while recording" : "motion-weighted average"}
          />
          <CapacityBar
            label="System utilization"
            fillPct={utilizationPct}
            color={ARXYS_GOLD}
            value={`${utilizationPct.toLocaleString("en-US", { maximumFractionDigits: 0 })}%`}
            note={utilizationNote(utilizationPct)}
          />
          {/* How the storage figure was built. A version-1 row predates the
              Max-disk-utilization buffer and never separated footage from
              capacity-to-buy, so it says so rather than implying a cap it was
              never sized against (ADR 0126). */}
          <Text style={styles.tableNote}>
            {data.calcVersion >= 2 && data.recordedStorageTb != null
              ? `Storage sizing: ${fmtTb(data.recordedStorageTb)} of recorded footage over ` +
                `${data.retentionDays} days, sized so the array runs at no more than ` +
                `${data.maxDiskUtilizationPct ?? 90}% full, then adjusted for the capacity a ` +
                `formatted disk presents to the VMS. That ` +
                `${100 - (data.maxDiskUtilizationPct ?? 90)}% is the only safety margin in this ` +
                `estimate. Network sizing: ${bandwidth.clause}.`
              : "Storage sizing: produced by the pre-2026-08 model, which applied a fixed " +
                "internal overhead rather than a stated disk-utilization cap. Recorded-footage " +
                "and utilization figures were not captured for this estimate. " +
                `Network sizing: ${bandwidth.clause}.`}
          </Text>
        </View>

        {/* 4. Recommended server */}
        <Text style={styles.sectionTitle}>Recommended system</Text>
        <Text style={styles.recDisclaimer}>
          Possible system based on parameters. Arxys engineering will send a
          detailed quote with the final product recommendation.
        </Text>
        <View style={styles.recRow} wrap={false}>
          <View style={styles.recImageCol}>
            {data.heroDataUri ? (
              // @react-pdf/renderer Image has no alt concept (not an HTML img).
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image style={styles.recImage} src={data.heroDataUri} />
            ) : (
              <View style={styles.recImagePlaceholder}>
                <Text style={{ fontSize: 10, color: TEXT_MUTED }}>{modelName}</Text>
              </View>
            )}
          </View>
          <View style={styles.recDetailCol}>
            <Text style={styles.recModel}>{modelName}</Text>
            <Text style={styles.recSku}>{skuLine}</Text>
            {specPairs.length > 0 ? (
              <View style={styles.specGrid}>
                {specPairs.map((p) => (
                  <View key={p.key} style={styles.specPair}>
                    <Text style={styles.specKey}>{p.key}</Text>
                    <Text style={styles.specVal}>{p.value}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={{ fontSize: 9, color: TEXT_MUTED }}>
                Detailed specifications unavailable for this configuration.
              </Text>
            )}
          </View>
        </View>

        {/* 5. Pricing row */}
        {unitMsrp != null ? (
          <View style={styles.pricingRow} wrap={false}>
            <View style={styles.pricingCell}>
              <Text style={styles.pricingLabel}>Unit MSRP</Text>
              <Text style={styles.pricingValue}>{fmtUsd(unitMsrp)}</Text>
            </View>
            <View style={styles.pricingDivider} />
            <View style={styles.pricingCell}>
              <Text style={styles.pricingLabel}>Quantity</Text>
              <Text style={styles.pricingValue}>{units}</Text>
            </View>
            <View style={styles.pricingDivider} />
            <View style={styles.pricingCell}>
              <Text style={styles.pricingLabel}>Deployment total</Text>
              <Text style={styles.pricingValueGold}>
                {deploymentTotal != null ? fmtUsd(deploymentTotal) : "—"}
              </Text>
            </View>
          </View>
        ) : null}

        {/* 6. Value proposition badges */}
        <View style={styles.badgeRow} wrap={false}>
          {VALUE_BADGES.map((b) => (
            <View key={b.title} style={styles.badge}>
              <View style={styles.badgeCircle}>
                <Text style={styles.badgeLetter}>{b.letter}</Text>
              </View>
              <Text style={styles.badgeTitle}>{b.title}</Text>
              <Text style={styles.badgeSub}>{b.subtitle}</Text>
            </View>
          ))}
        </View>

        {/* 7. Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerDisclaimer}>
            This system estimate is provided for planning purposes. Storage and
            bandwidth figures are calculated using validated compression
            modeling and may vary based on actual camera models, scene
            conditions, and VMS configuration. Contact Arxys for an engineered
            quote validated against your specific deployment requirements.
          </Text>
          <Text style={styles.footerCompany}>
            Arxys · San Diego, CA · arxys.com · portal.arxys.com
          </Text>
        </View>
      </Page>
    </Document>
  );
}
