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
} from "../pdf/colors";
import type { QuoteLineItem } from "@/lib/pipedrive/quote";
import type { ProjectQuoteShowcaseSpecHighlights, ProjectQuoteSnapshot } from "./types";

export type ProjectQuotePdfInput = {
  snapshot: ProjectQuoteSnapshot;
  logoDataUri: string | null;
  // Loaded from sizing.primaryServerHeroImagePath at render time.
  primaryHeroDataUri: string | null;
  // Indexed parallel to snapshot.showcase; loaded from each item.heroImagePath.
  showcaseHeroDataUris: (string | null)[];
};

// Sort ascending by orderNr; nulls sort last. Exported for test assertions.
export function sortLineItemsByOrderNr(items: QuoteLineItem[]): QuoteLineItem[] {
  return [...items].sort((a, b) => {
    if (a.orderNr == null && b.orderNr == null) return 0;
    if (a.orderNr == null) return 1;
    if (b.orderNr == null) return -1;
    return a.orderNr - b.orderNr;
  });
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function fmtExpiryDate(generatedAtIso: string, validityDays: number): string {
  const base = new Date(generatedAtIso).getTime();
  return new Date(base + validityDays * 86400 * 1000).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// Format a money value verbatim. Never rounds to different precision than what
// Math.round produces; the binding rule forbids recomputing prices.
function fmtMoney(n: number | null, currency: string | null): string {
  if (n == null) return "—";
  const rounded = Math.round(n).toLocaleString("en-US");
  if (currency === "USD" || currency == null) return `$${rounded}`;
  return `${currency} ${rounded}`;
}

function fmtTb(tb: number): string {
  return `${tb.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} TB`;
}

function fmtMbps(mbps: number): string {
  return `${mbps.toLocaleString("en-US", { maximumFractionDigits: 1 })} Mb/s`;
}

// Show em-dash for null/undefined/empty string; show 0 as "0" (matching the
// System Estimate pattern — callers that want to hide 0 check explicitly).
function dash(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

// Discount display for a line item. Shows the percent when type is
// "percentage" and the value is positive. Falls back to a flat amount format
// for "amount" type. Nothing is computed; only raw Pipedrive fields are read.
function fmtDiscountPct(line: QuoteLineItem): string {
  if (line.discountPercent != null && line.discountPercent > 0) {
    return `${line.discountPercent}%`;
  }
  if (line.discountType === "amount" && line.discount != null && line.discount > 0) {
    const currency = line.currency;
    return fmtMoney(line.discount, currency);
  }
  return "—";
}

// Spec highlight pairs for a showcase card. Null fields are omitted; the
// caller renders them only if the array is non-empty.
function showcaseSpecPairs(
  spec: ProjectQuoteShowcaseSpecHighlights,
): Array<{ key: string; value: string }> {
  const pairs: Array<{ key: string; value: string } | null> = [
    spec.formFactor ? { key: "Form factor", value: spec.formFactor } : null,
    spec.rackUnits ? { key: "Rack units", value: spec.rackUnits } : null,
    spec.maxCameras != null
      ? { key: "Max cameras", value: `${spec.maxCameras} streams` }
      : null,
    spec.maxBandwidthMbps != null
      ? {
          key: "Max bandwidth",
          value: `${spec.maxBandwidthMbps.toLocaleString("en-US")} Mb/s`,
        }
      : null,
    spec.storageRawTb != null
      ? { key: "Raw storage", value: fmtTb(spec.storageRawTb) }
      : null,
    spec.driveBays != null ? { key: "Drive bays", value: String(spec.driveBays) } : null,
    spec.cpuModelFull ? { key: "CPU", value: spec.cpuModelFull } : null,
    spec.ramSpec ? { key: "RAM", value: spec.ramSpec } : null,
    spec.osEdition ? { key: "OS", value: spec.osEdition } : null,
  ];
  return pairs.filter((p): p is { key: string; value: string } => p !== null);
}

// ---------------------------------------------------------------------------
// Column-width constants (commercial table, camera schedule)
// ---------------------------------------------------------------------------

// Commercial table: 6 columns summing to 100%.
const COM_CODE = "12%";
const COM_QTY = "7%";
const COM_UNIT_PRICE = "16%";
const COM_DISC = "12%";
const COM_LINE_TOTAL = "17%";
// Product name column fills the remaining space via flex: 1 on the cell.

// Camera schedule: 7 columns summing to 100%.
const CAM_VENDOR = "14%";
const CAM_MODEL = "19%";
const CAM_UNITS = "8%";
const CAM_SENSORS = "9%";
const CAM_RES = "16%";
const CAM_BW = "17%";
const CAM_STORE = "17%";
// Totals-row label spans vendor+model+units+sensors+resolution = 66%.
const CAM_TOTALS_LABEL = "66%";

// ---------------------------------------------------------------------------
// StyleSheet
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  page: {
    paddingTop: 34,
    paddingHorizontal: 44,
    paddingBottom: 56,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: TEXT_SLATE,
    lineHeight: 1.4,
  },

  // Header
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  logo: { width: 120 },
  logoFallback: { fontSize: 22, fontFamily: "Helvetica-Bold", color: ARXYS_GOLD, letterSpacing: 3 },
  tagline: { fontSize: 8, color: TEXT_MUTED, marginTop: 3 },
  headerRight: { alignItems: "flex-end" },
  quotePill: {
    backgroundColor: ARXYS_NAVY,
    color: "#ffffff",
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.5,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginBottom: 5,
  },
  headerMeta: { fontSize: 8.5, color: TEXT_MUTED, textAlign: "right" },
  rule: { borderBottomWidth: 2, borderBottomColor: ARXYS_NAVY, marginTop: 8, marginBottom: 13 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: ARXYS_NAVY,
    marginBottom: 7,
  },

  // Parameters block (page 1)
  paramsBlock: { flexDirection: "row", marginBottom: 14 },
  paramCol: { flex: 1, paddingRight: 6 },
  paramLabel: {
    fontSize: 6.5,
    color: TEXT_MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  paramValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: TEXT_SLATE },

  // Camera schedule (page 1)
  tableHeaderRow: { flexDirection: "row", backgroundColor: ARXYS_NAVY },
  th: {
    color: "#ffffff",
    fontFamily: "Helvetica-Bold",
    fontSize: 6.5,
    textTransform: "uppercase",
    padding: 4,
  },
  groupHeaderRow: {
    backgroundColor: BG_LIGHT,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_LIGHT,
  },
  groupHeaderText: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: ARXYS_NAVY },
  groupHeaderCount: { fontFamily: "Helvetica", color: TEXT_MUTED },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BORDER_LIGHT },
  td: { fontSize: 7.5, padding: 4 },
  totalsRow: { flexDirection: "row", backgroundColor: "#dbe4f0" },
  totalsCell: { fontSize: 7.5, padding: 4, fontFamily: "Helvetica-Bold" },
  tableNote: {
    fontSize: 7,
    fontStyle: "italic",
    color: TEXT_MUTED,
    marginTop: 4,
    marginBottom: 10,
  },

  // Capacity bars (page 1)
  barBlock: { marginBottom: 5 },
  barLabel: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: TEXT_SLATE, marginBottom: 2 },
  barTrack: { height: 10, backgroundColor: TRACK_GRAY, borderRadius: 2 },
  barFill: { height: 10, borderRadius: 2 },
  barValue: { fontSize: 7.5, color: TEXT_MUTED, marginTop: 2 },

  // Recommended server hero (page 1)
  recRow: { flexDirection: "row", marginTop: 10, marginBottom: 6 },
  recImageCol: {
    width: 130,
    alignItems: "center",
    justifyContent: "center",
    paddingRight: 14,
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
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    color: ARXYS_NAVY,
    lineHeight: 1.1,
    marginBottom: 2,
  },
  recSku: { fontSize: 8.5, color: TEXT_MUTED, marginBottom: 7 },
  specGrid: { flexDirection: "row", flexWrap: "wrap" },
  specPair: { width: "50%", marginBottom: 3 },
  specKey: { fontSize: 6.5, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: 0.5 },
  specVal: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: TEXT_SLATE },

  // Showcase cards (page 2)
  showcaseGrid: { flexDirection: "row", flexWrap: "wrap" },
  showcaseCard: {
    width: "49%",
    marginRight: "1%",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BORDER_LIGHT,
    padding: 9,
  },
  showcaseInner: { flexDirection: "row" },
  showcaseImageCol: { width: 76, marginRight: 10, alignItems: "center" },
  showcaseImage: { width: 70 },
  showcaseImagePlaceholder: {
    width: 70,
    height: 46,
    backgroundColor: BG_LIGHT,
    borderWidth: 1,
    borderColor: BORDER_LIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  showcaseDetailCol: { flex: 1 },
  showcaseProductName: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    color: ARXYS_NAVY,
    marginBottom: 2,
  },
  showcaseProductGroup: { fontSize: 7, color: TEXT_MUTED, marginBottom: 5 },
  showcaseSpecGrid: { flexDirection: "row", flexWrap: "wrap" },
  showcaseSpecPair: { width: "50%", marginBottom: 2 },
  showcaseSpecKey: { fontSize: 5.5, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: 0.5 },
  showcaseSpecVal: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: TEXT_SLATE },
  emptyShowcase: { fontSize: 9, color: TEXT_MUTED, marginTop: 10 },

  // Commercial table (page 3)
  commInfoBlock: {
    flexDirection: "row",
    backgroundColor: BG_LIGHT,
    borderWidth: 1,
    borderColor: BORDER_LIGHT,
    padding: 10,
    marginBottom: 13,
  },
  commInfoCol: { flex: 1, paddingRight: 6 },
  commInfoLabel: {
    fontSize: 6.5,
    color: TEXT_MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  commInfoValue: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: TEXT_SLATE },
  commHeaderRow: { flexDirection: "row", backgroundColor: ARXYS_NAVY },
  commTh: {
    color: "#ffffff",
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    textTransform: "uppercase",
    padding: 5,
  },
  commTr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BORDER_LIGHT },
  commTd: { fontSize: 7.5, padding: 5 },
  commTdRight: { fontSize: 7.5, padding: 5, textAlign: "right" },
  commTdMuted: { fontSize: 7.5, padding: 5, color: TEXT_MUTED },
  commTotalRow: {
    flexDirection: "row",
    borderTopWidth: 2,
    borderTopColor: ARXYS_NAVY,
    marginTop: 3,
  },
  commTotalLabel: {
    flex: 1,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: TEXT_SLATE,
    padding: 5,
  },
  commTotalValue: {
    width: COM_LINE_TOTAL,
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: ARXYS_NAVY,
    padding: 5,
    textAlign: "right",
  },

  // Terms (page 4)
  termsIdBlock: {
    backgroundColor: BG_LIGHT,
    borderWidth: 1,
    borderColor: BORDER_LIGHT,
    padding: 10,
    marginBottom: 13,
  },
  termsIdRow: { flexDirection: "row", marginBottom: 4 },
  termsIdLabel: { width: 100, fontSize: 7.5, color: TEXT_MUTED },
  termsIdValue: { flex: 1, fontSize: 7.5, fontFamily: "Helvetica-Bold", color: TEXT_SLATE },
  termsText: { fontSize: 7, color: TEXT_SLATE, lineHeight: 1.65 },

  // Fixed footer (repeated on every rendered page within a <Page>)
  footer: {
    position: "absolute",
    bottom: 20,
    left: 44,
    right: 44,
    borderTopWidth: 1,
    borderTopColor: BORDER_LIGHT,
    paddingTop: 5,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerLeft: { fontSize: 7, color: FOOTER_MUTED },
  footerCenter: { fontSize: 7, color: TEXT_MUTED, textAlign: "center" },
  footerRight: { fontSize: 7, color: TEXT_MUTED, textAlign: "right" },
});

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function PageHeader({
  logoDataUri,
  identifier,
  generatedDateStr,
}: {
  logoDataUri: string | null;
  identifier: string;
  generatedDateStr: string;
}) {
  return (
    <>
      <View style={styles.header}>
        <View>
          {logoDataUri ? (
            // @react-pdf/renderer Image has no alt concept (not an HTML img).
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image style={styles.logo} src={logoDataUri} />
          ) : (
            <Text style={styles.logoFallback}>ARXYS</Text>
          )}
          <Text style={styles.tagline}>
            Purpose-built video surveillance infrastructure
          </Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.quotePill}>PROJECT QUOTE</Text>
          <Text style={styles.headerMeta}>{identifier}</Text>
          <Text style={styles.headerMeta}>{generatedDateStr}</Text>
        </View>
      </View>
      <View style={styles.rule} />
    </>
  );
}

function PageFooter({
  identifier,
  validityLine,
}: {
  identifier: string;
  validityLine: string;
}) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerLeft}>Arxys · arxys.com</Text>
      <Text style={styles.footerCenter}>{identifier}</Text>
      <Text style={styles.footerRight}>{validityLine}</Text>
    </View>
  );
}

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

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ProjectQuotePdf({ data }: { data: ProjectQuotePdfInput }) {
  const { snapshot, logoDataUri, primaryHeroDataUri, showcaseHeroDataUris } = data;
  const { commercial, sizing, showcase, terms, generation } = snapshot;

  const generatedDateStr = fmtDate(generation.generatedAt);
  const expiryDateStr = fmtExpiryDate(generation.generatedAt, generation.validityDays);
  const validityLine = `Valid through ${expiryDateStr}`;

  // ── Page 1: Sizing ────────────────────────────────────────────────────────

  const { serverSpec, recommendation } = sizing;
  const recUnits = recommendation.units;

  const availableStorageTb =
    serverSpec?.usablePerUnitTb != null
      ? serverSpec.usablePerUnitTb * recUnits
      : recommendation.coveredStorageTb || null;
  const storagePct =
    availableStorageTb && availableStorageTb > 0
      ? (sizing.storageTb / availableStorageTb) * 100
      : 0;

  const availableBandwidthMbps =
    serverSpec?.maxBandwidthMbps != null
      ? serverSpec.maxBandwidthMbps * recUnits
      : null;
  const bandwidthPct =
    availableBandwidthMbps && availableBandwidthMbps > 0
      ? (sizing.bandwidthMbps / availableBandwidthMbps) * 100
      : 0;

  const utilizationPct = Math.max(storagePct, bandwidthPct);

  const modelName = serverSpec?.modelName ?? recommendation.productDescription;
  const skuLine = serverSpec
    ? `${recUnits} × ${serverSpec.sku}${serverSpec.formFactor ? ` · ${serverSpec.formFactor}` : ""}`
    : `${recUnits} × ${recommendation.productDescription}`;

  const specPairs = serverSpec
    ? [
        {
          key: "Max cameras",
          value:
            serverSpec.maxCameras != null
              ? `${serverSpec.maxCameras} (H.265/H.264)`
              : "—",
        },
        {
          key: "Max bandwidth",
          value:
            serverSpec.maxBandwidthMbps != null
              ? `${serverSpec.maxBandwidthMbps.toLocaleString("en-US")} Mb/s`
              : "—",
        },
        {
          key: "Usable storage",
          value:
            serverSpec.usablePerUnitTb != null
              ? fmtTb(serverSpec.usablePerUnitTb)
              : "—",
        },
        { key: "Drive bays", value: dash(serverSpec.driveBays) },
        { key: "CPU", value: dash(serverSpec.cpuModelFull) },
        { key: "RAM", value: dash(serverSpec.ramSpec) },
        { key: "OS", value: dash(serverSpec.osEdition) },
        { key: "Warranty", value: serverSpec.warranty },
      ]
    : [];

  // Totals from the snapshot's frozen aggregates — never re-summed from rows.
  const { cameras: totalCameras, bandwidthMbps: totalBwMbps, storageGb: totalStorageGb } =
    sizing.totals;
  const totalStorageTb = totalStorageGb / 1000;

  // ── Page 3: Commercial ────────────────────────────────────────────────────

  // Sorted by orderNr ascending (to match the rep's Pipedrive display order).
  // The binding rule mandates verbatim rendering; no price is recomputed here.
  const sortedLines = sortLineItemsByOrderNr(commercial.lineItems);
  const { currency } = commercial;

  return (
    <Document title={`Arxys Project Quote ${generation.identifier}`}>
      {/* ── Page 1: Sizing ─────────────────────────────────────────────── */}
      <Page size="LETTER" style={styles.page}>
        <PageHeader
          logoDataUri={logoDataUri}
          identifier={generation.identifier}
          generatedDateStr={generatedDateStr}
        />
        <PageFooter identifier={generation.identifier} validityLine={validityLine} />

        {/* Project parameters */}
        <Text style={styles.sectionTitle}>Project parameters</Text>
        <View style={styles.paramsBlock}>
          <View style={styles.paramCol}>
            <Text style={styles.paramLabel}>Project</Text>
            <Text style={styles.paramValue}>{sizing.projectName ?? "—"}</Text>
          </View>
          <View style={styles.paramCol}>
            <Text style={styles.paramLabel}>VMS</Text>
            <Text style={styles.paramValue}>{sizing.vms ?? "—"}</Text>
          </View>
          <View style={styles.paramCol}>
            <Text style={styles.paramLabel}>Retention</Text>
            <Text style={styles.paramValue}>{sizing.retentionDays} days</Text>
          </View>
          <View style={styles.paramCol}>
            <Text style={styles.paramLabel}>Quote ref</Text>
            <Text style={styles.paramValue}>{generation.identifier}</Text>
          </View>
        </View>

        {/* Camera schedule — Phase 10 extended columns */}
        <Text style={styles.sectionTitle}>Camera schedule</Text>
        <View>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.th, { width: CAM_VENDOR }]}>Vendor</Text>
            <Text style={[styles.th, { width: CAM_MODEL }]}>Model</Text>
            <Text style={[styles.th, { width: CAM_UNITS, textAlign: "right" }]}>Units</Text>
            <Text style={[styles.th, { width: CAM_SENSORS, textAlign: "right" }]}>Sensors</Text>
            <Text style={[styles.th, { width: CAM_RES }]}>Resolution</Text>
            <Text style={[styles.th, { width: CAM_BW, textAlign: "right" }]}>Bw (Mb/s)</Text>
            <Text style={[styles.th, { width: CAM_STORE, textAlign: "right" }]}>Storage (TB)</Text>
          </View>

          {sizing.cameraSchedule.map((g, i) => {
            const hasModel = g.cameraVendor !== null;
            return (
              <View key={i} wrap={false}>
                <View style={styles.groupHeaderRow}>
                  <Text style={styles.groupHeaderText}>
                    {g.name}
                    <Text style={styles.groupHeaderCount}>
                      {"   ·   "}
                      {g.cameras} camera streams
                      {hasModel && g.cameraModelModified ? "   ·   modified" : ""}
                    </Text>
                  </Text>
                </View>
                <View style={styles.tr}>
                  <Text style={[styles.td, { width: CAM_VENDOR }]}>
                    {hasModel ? (g.cameraVendor ?? "—") : "—"}
                  </Text>
                  <Text style={[styles.td, { width: CAM_MODEL }]}>
                    {hasModel ? (g.cameraModel ?? "—") : "—"}
                  </Text>
                  <Text style={[styles.td, { width: CAM_UNITS, textAlign: "right" }]}>
                    {hasModel && g.units > 0 ? String(g.units) : "—"}
                  </Text>
                  <Text style={[styles.td, { width: CAM_SENSORS, textAlign: "right" }]}>
                    {hasModel && g.sensorsPerCamera > 0
                      ? String(g.sensorsPerCamera)
                      : "—"}
                  </Text>
                  <Text style={[styles.td, { width: CAM_RES }]}>
                    {g.resolutionLabel || "—"}
                  </Text>
                  <Text style={[styles.td, { width: CAM_BW, textAlign: "right" }]}>
                    {g.bandwidthMbps.toLocaleString("en-US", { maximumFractionDigits: 1 })}
                  </Text>
                  <Text style={[styles.td, { width: CAM_STORE, textAlign: "right" }]}>
                    {(g.storageGb / 1000).toLocaleString("en-US", {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}
                  </Text>
                </View>
              </View>
            );
          })}

          <View style={styles.totalsRow} wrap={false}>
            <Text style={[styles.totalsCell, { width: CAM_TOTALS_LABEL }]}>
              Totals   ·   {totalCameras} camera streams
            </Text>
            <Text style={[styles.totalsCell, { width: CAM_BW, textAlign: "right" }]}>
              {totalBwMbps.toLocaleString("en-US", { maximumFractionDigits: 1 })}
            </Text>
            <Text style={[styles.totalsCell, { width: CAM_STORE, textAlign: "right" }]}>
              {totalStorageTb.toLocaleString("en-US", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}
            </Text>
          </View>
        </View>
        <Text style={styles.tableNote}>
          Retention: {sizing.retentionDays} days. Figures derived from validated compression
          modeling; actual results depend on camera models, scene conditions, and VMS
          configuration. All figures assume even camera distribution across recording servers.
        </Text>

        {/* System capacity */}
        <View wrap={false}>
          <Text style={styles.sectionTitle}>System capacity</Text>
          <CapacityBar
            label="Total storage"
            fillPct={storagePct}
            color={ARXYS_NAVY}
            value={
              availableStorageTb
                ? `${fmtTb(sizing.storageTb)} of ${fmtTb(availableStorageTb)} usable`
                : `${fmtTb(sizing.storageTb)} required`
            }
          />
          <CapacityBar
            label="Bandwidth"
            fillPct={bandwidthPct}
            color={ARXYS_NAVY}
            value={
              availableBandwidthMbps
                ? `${fmtMbps(sizing.bandwidthMbps)} of ${fmtMbps(availableBandwidthMbps)}`
                : `${fmtMbps(sizing.bandwidthMbps)} required`
            }
          />
          <CapacityBar
            label="System utilization"
            fillPct={utilizationPct}
            color={ARXYS_GOLD}
            value={`${utilizationPct.toLocaleString("en-US", { maximumFractionDigits: 0 })}%`}
            note="20% headroom built in"
          />
        </View>

        {/* Recommended server hero */}
        <View style={styles.recRow} wrap={false}>
          <View style={styles.recImageCol}>
            {primaryHeroDataUri ? (
              // @react-pdf/renderer Image has no alt concept (not an HTML img).
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image style={styles.recImage} src={primaryHeroDataUri} />
            ) : (
              <View style={styles.recImagePlaceholder}>
                <Text style={{ fontSize: 9, color: TEXT_MUTED }}>{modelName}</Text>
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
              <Text style={{ fontSize: 8.5, color: TEXT_MUTED }}>
                Detailed specifications unavailable for this configuration.
              </Text>
            )}
          </View>
        </View>
      </Page>

      {/* ── Page 2: Showcase ────────────────────────────────────────────── */}
      <Page size="LETTER" style={styles.page}>
        <PageHeader
          logoDataUri={logoDataUri}
          identifier={generation.identifier}
          generatedDateStr={generatedDateStr}
        />
        <PageFooter identifier={generation.identifier} validityLine={validityLine} />

        <Text style={styles.sectionTitle}>Products in this quote</Text>

        {showcase.length === 0 ? (
          <Text style={styles.emptyShowcase}>
            No catalog products with price-book family records in this quote.
          </Text>
        ) : (
          <View style={styles.showcaseGrid}>
            {showcase.map((item, i) => {
              const heroUri = showcaseHeroDataUris[i] ?? null;
              const pairs = item.specHighlights
                ? showcaseSpecPairs(item.specHighlights)
                : [];
              return (
                <View key={item.sku} style={styles.showcaseCard} wrap={false}>
                  <View style={styles.showcaseInner}>
                    <View style={styles.showcaseImageCol}>
                      {heroUri ? (
                        // @react-pdf/renderer Image has no alt concept.
                        // eslint-disable-next-line jsx-a11y/alt-text
                        <Image style={styles.showcaseImage} src={heroUri} />
                      ) : (
                        <View style={styles.showcaseImagePlaceholder}>
                          <Text style={{ fontSize: 7, color: TEXT_MUTED }}>
                            {item.productGroup}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.showcaseDetailCol}>
                      <Text style={styles.showcaseProductName}>{item.productName}</Text>
                      <Text style={styles.showcaseProductGroup}>
                        {item.sku} · {item.productGroup}
                      </Text>
                      {pairs.length > 0 ? (
                        <View style={styles.showcaseSpecGrid}>
                          {pairs.map((p) => (
                            <View key={p.key} style={styles.showcaseSpecPair}>
                              <Text style={styles.showcaseSpecKey}>{p.key}</Text>
                              <Text style={styles.showcaseSpecVal}>{p.value}</Text>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <Text style={{ fontSize: 7.5, color: TEXT_MUTED }}>
                          Specifications not available.
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </Page>

      {/* ── Page 3: Commercial ──────────────────────────────────────────── */}
      <Page size="LETTER" style={styles.page}>
        <PageHeader
          logoDataUri={logoDataUri}
          identifier={generation.identifier}
          generatedDateStr={generatedDateStr}
        />
        <PageFooter identifier={generation.identifier} validityLine={validityLine} />

        {/* Deal / customer info */}
        <View style={styles.commInfoBlock}>
          {commercial.organization ? (
            <View style={styles.commInfoCol}>
              <Text style={styles.commInfoLabel}>Customer</Text>
              <Text style={styles.commInfoValue}>
                {commercial.organization.name ?? "—"}
              </Text>
            </View>
          ) : null}
          {commercial.person ? (
            <View style={styles.commInfoCol}>
              <Text style={styles.commInfoLabel}>Contact</Text>
              <Text style={styles.commInfoValue}>
                {commercial.person.name ?? "—"}
              </Text>
            </View>
          ) : null}
          <View style={styles.commInfoCol}>
            <Text style={styles.commInfoLabel}>Deal</Text>
            <Text style={styles.commInfoValue}>
              {commercial.dealTitle ?? generation.identifier}
            </Text>
          </View>
        </View>

        {/* Line-item table */}
        <Text style={styles.sectionTitle}>Quote line items</Text>
        <View>
          <View style={styles.commHeaderRow}>
            <Text style={[styles.commTh, { width: COM_CODE }]}>Code</Text>
            <Text style={[styles.commTh, { flex: 1 }]}>Product</Text>
            <Text style={[styles.commTh, { width: COM_QTY, textAlign: "right" }]}>Qty</Text>
            <Text style={[styles.commTh, { width: COM_UNIT_PRICE, textAlign: "right" }]}>
              Unit price
            </Text>
            <Text style={[styles.commTh, { width: COM_DISC, textAlign: "right" }]}>Disc</Text>
            <Text style={[styles.commTh, { width: COM_LINE_TOTAL, textAlign: "right" }]}>
              Line total
            </Text>
          </View>

          {sortedLines.map((line, i) => (
            <View key={i} style={styles.commTr} wrap={false}>
              <Text style={[styles.commTdMuted, { width: COM_CODE }]}>
                {line.productCode ?? "—"}
              </Text>
              <Text style={[styles.commTd, { flex: 1 }]}>{line.productName ?? "—"}</Text>
              <Text style={[styles.commTdRight, { width: COM_QTY }]}>
                {line.quantity ?? "—"}
              </Text>
              {line.isInfoOnly ? (
                <>
                  <Text style={[styles.commTd, { width: COM_UNIT_PRICE }]} />
                  <Text style={[styles.commTd, { width: COM_DISC }]} />
                  <Text style={[styles.commTd, { width: COM_LINE_TOTAL }]} />
                </>
              ) : (
                <>
                  <Text style={[styles.commTdRight, { width: COM_UNIT_PRICE }]}>
                    {fmtMoney(line.unitPrice, currency)}
                  </Text>
                  <Text style={[styles.commTdRight, { width: COM_DISC }]}>
                    {fmtDiscountPct(line)}
                  </Text>
                  <Text style={[styles.commTdRight, { width: COM_LINE_TOTAL }]}>
                    {fmtMoney(line.lineAmount, currency)}
                  </Text>
                </>
              )}
            </View>
          ))}

          {/* productTotal rendered verbatim — never re-summed from lines */}
          <View style={styles.commTotalRow}>
            <Text style={styles.commTotalLabel}>
              {commercial.additionalDiscounts != null
                ? "Subtotal (before additional discounts)"
                : "Total"}
            </Text>
            <Text style={styles.commTotalValue}>
              {fmtMoney(commercial.productTotal, currency)}
            </Text>
          </View>

          {commercial.additionalDiscounts != null ? (
            <View style={{ flexDirection: "row", marginTop: 4 }}>
              <Text style={{ flex: 1, fontSize: 8, color: TEXT_MUTED, paddingHorizontal: 5 }}>
                Additional discounts
              </Text>
              <Text
                style={{
                  width: COM_LINE_TOTAL,
                  fontSize: 8,
                  color: TEXT_MUTED,
                  textAlign: "right",
                  paddingHorizontal: 5,
                }}
              >
                {fmtMoney(commercial.additionalDiscounts, currency)}
              </Text>
            </View>
          ) : null}
        </View>

        {currency ? (
          <Text style={styles.tableNote}>All amounts in {currency}. Partner pricing as quoted.</Text>
        ) : null}
      </Page>

      {/* ── Page 4: Terms ───────────────────────────────────────────────── */}
      <Page size="LETTER" style={styles.page}>
        <PageHeader
          logoDataUri={logoDataUri}
          identifier={generation.identifier}
          generatedDateStr={generatedDateStr}
        />
        <PageFooter identifier={generation.identifier} validityLine={validityLine} />

        {/* Quote identity and partner block */}
        <View style={styles.termsIdBlock}>
          <View style={styles.termsIdRow}>
            <Text style={styles.termsIdLabel}>Quote reference</Text>
            <Text style={styles.termsIdValue}>{generation.identifier}</Text>
          </View>
          <View style={styles.termsIdRow}>
            <Text style={styles.termsIdLabel}>Generated</Text>
            <Text style={styles.termsIdValue}>{generatedDateStr}</Text>
          </View>
          <View style={styles.termsIdRow}>
            <Text style={styles.termsIdLabel}>Valid through</Text>
            <Text style={styles.termsIdValue}>{expiryDateStr}</Text>
          </View>
          <View style={styles.termsIdRow}>
            <Text style={styles.termsIdLabel}>Terms version</Text>
            <Text style={styles.termsIdValue}>{terms.version}</Text>
          </View>
          <View style={[styles.termsIdRow, { marginBottom: 0 }]}>
            <Text style={styles.termsIdLabel}>Prepared for</Text>
            <Text style={styles.termsIdValue}>
              {sizing.partner.companyName} — {sizing.partner.contactName}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Terms and Conditions</Text>
        <Text style={styles.termsText}>{terms.text}</Text>
      </Page>
    </Document>
  );
}
