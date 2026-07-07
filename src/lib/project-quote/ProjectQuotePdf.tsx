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
import { usableCapacityTb } from "@/lib/capacity-utils";
import type { QuoteLineItem } from "@/lib/pipedrive/quote";

import type {
  ProjectQuoteCameraRow,
  ProjectQuoteShowcaseItem,
  ProjectQuoteShowcaseSpecHighlights,
  ProjectQuoteSnapshot,
} from "./types";

export type ProjectQuotePdfInput = {
  snapshot: ProjectQuoteSnapshot;
  logoDataUri: string | null;
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
  return `${mbps.toLocaleString("en-US", { maximumFractionDigits: 1 })} Mbit/s`;
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

// Partner price-each, DERIVED at render: raw MSRP (unitPrice) × (1 − pct/100),
// rounded to whole dollars. The snapshot never stores this — discountedUnitPrice
// is null by design (ADR 0059) — so it is recomputed here purely for display.
// Null MSRP → null (renders as an em-dash). discountPercent is null for
// amount-type discounts; per the column spec the derivation reads the percent
// only, so an amount-type line falls back to its raw MSRP. Exported for tests.
export function derivePartnerEach(line: QuoteLineItem): number | null {
  if (line.unitPrice == null) return null;
  const pct = line.discountPercent ?? 0;
  return Math.round(line.unitPrice * (1 - pct / 100));
}

// Partner line total, DERIVED: partner-each × quantity. Display-only — the grand
// total row stays the verbatim deal productTotal and is NEVER a re-sum of these
// (the binding rule / verbatim-total guard). Null partner-each → null.
export function derivePartnerTotal(line: QuoteLineItem): number | null {
  const each = derivePartnerEach(line);
  if (each == null) return null;
  return each * (line.quantity ?? 0);
}

// ---------------------------------------------------------------------------
// Showcase spec highlights (page 2)
// ---------------------------------------------------------------------------

// Cap on rendered highlights — two lines of the 4-column grid. The grid is a
// marketing summary (ADR 0066: "intentionally light on specs"), and the bound
// keeps a spec-rich server's row to roughly 100pt so five rows fit one page.
const SHOWCASE_MAX_PAIRS = 8;

// Spec highlight pairs for a showcase row, most-marketing-relevant first. Null
// fields are omitted entirely, so a sparse add-on yields a short pair list (the
// grid wraps to fewer lines and the row is shorter); a spec-rich server is
// capped at SHOWCASE_MAX_PAIRS so its row stays bounded. The caller renders
// nothing when empty — no "not available" note. Exported so a test can assert
// both the omit-nulls rule and the cap.
export function showcaseSpecPairs(
  spec: ProjectQuoteShowcaseSpecHighlights,
): Array<{ key: string; value: string }> {
  const pairs: Array<{ key: string; value: string } | null> = [
    spec.formFactor ? { key: "Form factor", value: spec.formFactor } : null,
    spec.rackUnits ? { key: "Rack units", value: spec.rackUnits } : null,
    spec.maxCameras != null
      ? { key: "Max camera streams", value: `${spec.maxCameras} streams` }
      : null,
    spec.maxBandwidthMbps != null
      ? {
          key: "Max bandwidth",
          value: `${spec.maxBandwidthMbps.toLocaleString("en-US")} Mbit/s`,
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
  return pairs
    .filter((p): p is { key: string; value: string } => p !== null)
    .slice(0, SHOWCASE_MAX_PAIRS);
}

// ---------------------------------------------------------------------------
// Camera-schedule column selection
// ---------------------------------------------------------------------------

// A non-empty vendor OR model on this row. The snapshot freezes null for the
// manual-entry (no-model) marker; an empty string is treated the same.
function rowHasVendorOrModel(g: ProjectQuoteCameraRow): boolean {
  return (
    (g.cameraVendor != null && g.cameraVendor !== "") ||
    (g.cameraModel != null && g.cameraModel !== "")
  );
}

// True when ANY group in the schedule carries vendor/model data — the decision
// that picks the 9-column (with Vendor/Model) layout over the 7-column sizing
// layout. Exported for test assertions (mirrors sortLineItemsByOrderNr).
export function cameraScheduleHasVendorOrModel(rows: ProjectQuoteCameraRow[]): boolean {
  return rows.some(rowHasVendorOrModel);
}

// Operation-hrs cell: the frozen recording hours, with the motion percent in
// parentheses for motion-mode groups (e.g. "18 (motion 40%)"). Constant-mode
// groups record 24/7, so the motion percent is not meaningful and is omitted.
// No sizing is recomputed — both values are read verbatim from the snapshot.
export function formatOperationHrs(g: ProjectQuoteCameraRow): string {
  const hrs = String(g.hoursPerDay);
  if (g.recordingMode === "motion") {
    return `${hrs} (motion ${g.motionPercent}%)`;
  }
  return hrs;
}

// One rendered camera-schedule column: header label, width, optional
// right-alignment, and the cell text for a group row.
export type CameraColumn = {
  header: string;
  width: string;
  align?: "right";
  cell: (g: ProjectQuoteCameraRow) => string;
};

// Format a bandwidth value (Mb/s) for a schedule cell — verbatim, no recompute.
function fmtBwCell(mbps: number): string {
  return mbps.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

// Format a storage value (GB frozen → TB display) for a schedule cell.
function fmtStorageCell(gb: number): string {
  return (gb / 1000).toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

// The shared sizing columns (Layout A). Layout B prepends Vendor/Model and
// re-widths every column, so the two layouts are built from distinct constants.
// Exported so tests can assert the exact column set each layout renders.
export function buildCameraColumns(showVendorModel: boolean): CameraColumn[] {
  const sizing: CameraColumn[] = showVendorModel
    ? [
        { header: "Resolution", width: CAMB_RES, cell: (g) => g.resolutionLabel || "—" },
        { header: "Codec", width: CAMB_CODEC, cell: (g) => g.codec || "—" },
        { header: "FPS", width: CAMB_FPS, align: "right", cell: (g) => (g.fps > 0 ? String(g.fps) : "—") },
        { header: "Scene complexity", width: CAMB_COMPLEXITY, cell: (g) => g.complexityLabel || "—" },
        { header: "Operation hrs", width: CAMB_OPHRS, cell: formatOperationHrs },
        { header: "Bw (Mbit/s)", width: CAMB_BW, align: "right", cell: (g) => fmtBwCell(g.bandwidthMbps) },
        { header: "Storage (TB)", width: CAMB_STORE, align: "right", cell: (g) => fmtStorageCell(g.storageGb) },
      ]
    : [
        { header: "Resolution", width: CAMA_RES, cell: (g) => g.resolutionLabel || "—" },
        { header: "Codec", width: CAMA_CODEC, cell: (g) => g.codec || "—" },
        { header: "FPS", width: CAMA_FPS, align: "right", cell: (g) => (g.fps > 0 ? String(g.fps) : "—") },
        { header: "Scene complexity", width: CAMA_COMPLEXITY, cell: (g) => g.complexityLabel || "—" },
        { header: "Operation hrs", width: CAMA_OPHRS, cell: formatOperationHrs },
        { header: "Bw (Mbit/s)", width: CAMA_BW, align: "right", cell: (g) => fmtBwCell(g.bandwidthMbps) },
        { header: "Storage (TB)", width: CAMA_STORE, align: "right", cell: (g) => fmtStorageCell(g.storageGb) },
      ];
  if (!showVendorModel) return sizing;
  return [
    { header: "Vendor", width: CAMB_VENDOR, cell: (g) => dash(g.cameraVendor) },
    { header: "Model", width: CAMB_MODEL, cell: (g) => dash(g.cameraModel) },
    ...sizing,
  ];
}

// ---------------------------------------------------------------------------
// Column-width constants (commercial table, camera schedule)
// ---------------------------------------------------------------------------

// Commercial table ("Quote line items"): seven columns in the canonical Arxys
// price flow — CODE · PRODUCT · MSRP EACH · DISC % · PARTNER EACH · QTY ·
// PARTNER TOTAL. The six fixed widths sum to 65%; PRODUCT absorbs the
// remaining 35% via flex: 1 on its cell, so the rendered row totals 100%.
const COM_CODE = "11%";
const COM_MSRP = "13%";
const COM_DISC = "8%";
const COM_PARTNER_EACH = "13%";
const COM_QTY = "6%";
const COM_PARTNER_TOTAL = "14%";
// PRODUCT fills the remaining 35% via flex: 1 on the cell.

// The rendered commercial columns, in order. PRODUCT has width null → flex: 1
// (absorbs the slack); every other column is fixed-width and right-aligned
// (numeric/currency). Exported so tests assert the exact column order and that
// the fixed widths leave room for the flexing PRODUCT column.
export type CommercialColumn = { header: string; width: string | null; align?: "right" };
export const COMMERCIAL_COLUMNS: CommercialColumn[] = [
  { header: "Code", width: COM_CODE },
  { header: "Product", width: null },
  { header: "MSRP each", width: COM_MSRP, align: "right" },
  { header: "Disc %", width: COM_DISC, align: "right" },
  { header: "Partner each", width: COM_PARTNER_EACH, align: "right" },
  { header: "Qty", width: COM_QTY, align: "right" },
  { header: "Partner total", width: COM_PARTNER_TOTAL, align: "right" },
];

// Camera schedule — two layouts, chosen per snapshot (see
// cameraScheduleHasVendorOrModel). Both sum to 100% at US-Letter portrait
// width. The numeric columns (FPS, Bw, Storage) are right-aligned; every text
// column is left-aligned.
//
// Layout A — no group carries vendor/model data. The submission-detail sizing
// column set, 7 columns: Resolution / Codec / FPS / Scene complexity /
// Operation hrs / Bw / Storage.
const CAMA_RES = "17%";
const CAMA_CODEC = "10%";
const CAMA_FPS = "8%";
const CAMA_COMPLEXITY = "24%";
const CAMA_OPHRS = "15%";
const CAMA_BW = "13%";
const CAMA_STORE = "13%";
// Totals-row label spans everything except the Bw and Storage cells.
const CAMA_TOTALS_LABEL = "74%"; // 100 - CAMA_BW - CAMA_STORE

// Layout B — at least one group carries vendor/model data. Vendor and Model
// are prepended to the same sizing set, 9 columns.
const CAMB_VENDOR = "9%";
const CAMB_MODEL = "12%";
const CAMB_RES = "13%";
const CAMB_CODEC = "8%";
const CAMB_FPS = "6.5%";
const CAMB_COMPLEXITY = "17%";
const CAMB_OPHRS = "12%";
const CAMB_BW = "10.5%";
const CAMB_STORE = "12%";
const CAMB_TOTALS_LABEL = "77.5%"; // 100 - CAMB_BW - CAMB_STORE

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
  rule: { borderBottomWidth: 2, borderBottomColor: ARXYS_NAVY, marginTop: 8, marginBottom: 6 },
  // Validity disclaimer under the rule, repeated on every page.
  headerDisclaimer: { fontSize: 7, fontStyle: "italic", color: TEXT_MUTED, marginBottom: 12 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: ARXYS_NAVY,
    marginBottom: 7,
  },
  // Page 1 "Project parameters" heading line with the partner company at right.
  page1HeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  preparedForLine: { fontSize: 8, color: TEXT_MUTED, marginBottom: 7 },
  preparedForName: { fontSize: 9, fontFamily: "Helvetica-Bold", color: ARXYS_NAVY },

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

  // Showcase rows (page 2). Each product is a compact, thin-bordered full-width
  // row (hero left, name + SKU·family, then a 4-column spec-highlight grid),
  // sized so five rows fit with the header and footer. A product with fewer
  // highlights wraps to fewer grid lines, so its row is shorter — no tall empty
  // boxes. Not a 2-column card grid.
  showcaseRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: BORDER_LIGHT,
    borderRadius: 2,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginBottom: 7,
    alignItems: "center",
  },
  showcaseImageCol: { width: 92, marginRight: 12, alignItems: "center", justifyContent: "center" },
  // Bounded height + contain: hero PNGs vary from square (1080×1080) to wide
  // banners, so an unconstrained width would let a square image blow up the row
  // height. Fixing the box keeps every row ~the same height (five fit a page).
  showcaseImage: { width: 86, height: 46, objectFit: "contain" },
  showcaseImagePlaceholder: {
    width: 86,
    height: 46,
    backgroundColor: BG_LIGHT,
    borderWidth: 1,
    borderColor: BORDER_LIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  showcaseDetailCol: { flex: 1 },
  showcaseProductName: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: ARXYS_NAVY,
    lineHeight: 1.1,
    marginBottom: 1,
  },
  showcaseProductMeta: { fontSize: 7.5, color: TEXT_MUTED, marginBottom: 4 },
  showcaseSpecGrid: { flexDirection: "row", flexWrap: "wrap" },
  showcaseSpecPair: { width: "25%", marginBottom: 2, paddingRight: 6 },
  showcaseSpecKey: { fontSize: 5.5, lineHeight: 1.1, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: 0.5 },
  showcaseSpecVal: { fontSize: 7.5, lineHeight: 1.15, fontFamily: "Helvetica-Bold", color: TEXT_SLATE },
  emptyShowcase: { fontSize: 9, color: TEXT_MUTED, marginTop: 10 },

  // Quoted solution capacity bars (page 2), below the product cards.
  quotedSolutionBlock: { marginTop: 14 },

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
    width: COM_PARTNER_TOTAL,
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: ARXYS_NAVY,
    padding: 5,
    textAlign: "right",
  },

  // Terms (page 4) — identity block as a 3-column, 2-row grid.
  termsIdGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: BG_LIGHT,
    borderWidth: 1,
    borderColor: BORDER_LIGHT,
    paddingTop: 10,
    paddingBottom: 4,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  termsIdCell: { width: "33.33%", marginBottom: 6, paddingRight: 8 },
  termsIdCellWide: { width: "66.66%", marginBottom: 6, paddingRight: 8 },
  termsIdLabel: {
    fontSize: 6.5,
    color: TEXT_MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  termsIdValue: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: TEXT_SLATE },
  // Compact so the full multi-clause T&Cs fit on a single page.
  termsText: { fontSize: 6.5, color: TEXT_SLATE, lineHeight: 1.32 },

  // Terms / Shipping / FOB block — sits near the bottom of the line-items page
  // (marginTop:auto pushes it above the fixed footer). Compact label/value
  // rows matching the small-print weight; bold right-aligned labels, plain
  // left-aligned values. Not a heavy bordered table.
  fobBlock: { marginTop: "auto", paddingTop: 10 },
  fobRow: { flexDirection: "row", marginBottom: 2 },
  fobLabel: {
    width: 110,
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: TEXT_SLATE,
    textAlign: "right",
    paddingRight: 8,
  },
  fobValue: { fontSize: 7.5, color: TEXT_SLATE },

  // Fixed footer (repeated on every rendered page within a <Page>). Two lines:
  // a centered Arxys contact line, then a quote-ref | validity row.
  footer: {
    position: "absolute",
    bottom: 20,
    left: 44,
    right: 44,
    borderTopWidth: 1,
    borderTopColor: BORDER_LIGHT,
    paddingTop: 5,
  },
  // Address line: bold and ~23% larger than the original 6.5pt (→ 8pt), so the
  // company contact line is the visually dominant footer element.
  footerContact: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: FOOTER_MUTED,
    textAlign: "center",
    marginBottom: 2,
  },
  footerRow: { flexDirection: "row", justifyContent: "space-between" },
  // Quote-ref / validity row: ~10% larger than the original 7pt (→ 7.7pt),
  // normal weight, kept visibly smaller than the bold 8pt address line above.
  footerLeft: { fontSize: 7.7, color: TEXT_MUTED },
  footerRight: { fontSize: 7.7, color: TEXT_MUTED, textAlign: "right" },
});

// Company contact line printed in the footer of every page.
const ARXYS_CONTACT_LINE =
  "Arxys · 1810 Gillespie Way, Suite 108, El Cajon, CA 92020 · 619.258.7800 · arxys.com";

// Static commercial terms shown in the Terms / Shipping / FOB block at the
// bottom of the line-items page. Verbatim, fixed for every quote. Exported so
// a test can assert the exact text without parsing the rendered PDF.
export const QUOTE_FOB_BLOCK = [
  { label: "Terms", value: "Net 30" },
  { label: "Shipping Method", value: "TBD - NOT included in price" },
  { label: "FOB", value: "El Cajon, CA" },
] as const;

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function PageHeader({
  logoDataUri,
  identifier,
  generatedDateStr,
  disclaimer,
}: {
  logoDataUri: string | null;
  identifier: string;
  generatedDateStr: string;
  disclaimer: string;
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
      <Text style={styles.headerDisclaimer}>{disclaimer}</Text>
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
      <Text style={styles.footerContact}>{ARXYS_CONTACT_LINE}</Text>
      <View style={styles.footerRow}>
        <Text style={styles.footerLeft}>{identifier}</Text>
        <Text style={styles.footerRight}>{validityLine}</Text>
      </View>
    </View>
  );
}

// Sum the capacity DELIVERED by the equipment quoted on page 2, for the
// "Quoted solution" bars. Quantity-weighted: N boxes deliver N× capacity (the
// same weighting page 1 applies to the recommended server via recUnits), so a
// line's quantity multiplies its per-unit spec. Summed across every quoted
// server product — multi-product quotes add, they do not average.
//
// Net-usable storage is DERIVED from the frozen structured spec fields
// (storageRawTb / hddCount / raidLevelDisplay) via the shared usableCapacityTb
// helper, never parsed from a product title; bandwidth is the structured
// maxBandwidthMbps field. Both are already frozen in the snapshot showcase, so
// this computes at render with no new snapshot field and no version bump.
//
// A showcase card with no product_specs row (specHighlights null) or a null
// component contributes 0 to that bar; a SW workstation with bandwidth but no
// storage therefore adds to the bandwidth denominator only. `hasStorage` /
// `hasBandwidth` distinguish a genuine zero denominator (no delivering
// equipment) from a real total, mirroring page 1's "of X usable" vs "required".
// Exported for unit testing.
export function sumQuotedCapacity(
  showcase: ProjectQuoteShowcaseItem[],
  lineItems: QuoteLineItem[],
): {
  usableStorageTb: number;
  bandwidthMbps: number;
  hasStorage: boolean;
  hasBandwidth: boolean;
} {
  // Quantity per SKU, summed across line items (a SKU may appear on >1 line).
  // The showcase is keyed by SKU (deduped), so quantity lives on the raw deal
  // line items, joined by productCode === showcase sku.
  const qtyBySku = new Map<string, number>();
  for (const li of lineItems) {
    if (!li.productCode) continue;
    const q = li.quantity ?? 0;
    qtyBySku.set(li.productCode, (qtyBySku.get(li.productCode) ?? 0) + q);
  }

  let usableStorageTb = 0;
  let bandwidthMbps = 0;
  let hasStorage = false;
  let hasBandwidth = false;
  for (const item of showcase) {
    const h = item.specHighlights;
    if (!h) continue;
    const qty = qtyBySku.get(item.sku) ?? 0;
    if (qty <= 0) continue;
    const perUnit = usableCapacityTb(h.storageRawTb, h.hddCount, h.raidLevelDisplay);
    if (perUnit != null && perUnit > 0) {
      usableStorageTb += perUnit * qty;
      hasStorage = true;
    }
    if (h.maxBandwidthMbps != null && h.maxBandwidthMbps > 0) {
      bandwidthMbps += h.maxBandwidthMbps * qty;
      hasBandwidth = true;
    }
  }
  return { usableStorageTb, bandwidthMbps, hasStorage, hasBandwidth };
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
  const { snapshot, logoDataUri, showcaseHeroDataUris } = data;
  const { commercial, sizing, terms, generation } = snapshot;
  // Guard: rows frozen between ADR 0065 and 0066 have no `showcase` field.
  const showcase = snapshot.showcase ?? [];

  const generatedDateStr = fmtDate(generation.generatedAt);
  const expiryDateStr = fmtExpiryDate(generation.generatedAt, generation.validityDays);
  const validityLine = `Valid through ${expiryDateStr}`;
  // Validity disclaimer in the header of every page. The day count tracks the
  // quote's frozen validityDays so it can never drift from the "Valid through"
  // date computed from the same value.
  const headerDisclaimer = `Quote valid for a maximum of ${generation.validityDays} days from date of quote and subject to change without notice.`;

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

  // Totals from the snapshot's frozen aggregates — never re-summed from rows.
  const { cameras: totalCameras, bandwidthMbps: totalBwMbps, storageGb: totalStorageGb } =
    sizing.totals;
  const totalStorageTb = totalStorageGb / 1000;

  // Camera-schedule layout, chosen once for the whole schedule: Vendor/Model
  // columns appear only when at least one group carries that data. Each layout
  // ends with Bw then Storage, so the totals row spans the remainder.
  const showVendorModel = cameraScheduleHasVendorOrModel(sizing.cameraSchedule);
  const cameraColumns = buildCameraColumns(showVendorModel);
  const camBwWidth = showVendorModel ? CAMB_BW : CAMA_BW;
  const camStoreWidth = showVendorModel ? CAMB_STORE : CAMA_STORE;
  const camTotalsLabelWidth = showVendorModel ? CAMB_TOTALS_LABEL : CAMA_TOTALS_LABEL;

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
          disclaimer={headerDisclaimer}
        />
        <PageFooter identifier={generation.identifier} validityLine={validityLine} />

        {/* Project parameters — partner company shown at the right of the heading */}
        <View style={styles.page1HeaderRow}>
          <Text style={styles.sectionTitle}>Project parameters</Text>
          <Text style={styles.preparedForLine}>
            Prepared for{"  "}
            <Text style={styles.preparedForName}>{sizing.partner.companyName}</Text>
          </Text>
        </View>
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

        {/* Camera schedule — sizing columns, with Vendor/Model prepended only
            when a group carries that data (cameraScheduleHasVendorOrModel). */}
        <Text style={styles.sectionTitle}>Camera schedule</Text>
        <View>
          <View style={styles.tableHeaderRow}>
            {cameraColumns.map((col) => (
              <Text
                key={col.header}
                style={[styles.th, { width: col.width }, col.align === "right" ? { textAlign: "right" } : {}]}
              >
                {col.header}
              </Text>
            ))}
          </View>

          {sizing.cameraSchedule.map((g, i) => {
            const modified = rowHasVendorOrModel(g) && g.cameraModelModified;
            return (
              <View key={i} wrap={false}>
                <View style={styles.groupHeaderRow}>
                  <Text style={styles.groupHeaderText}>
                    {g.name}
                    <Text style={styles.groupHeaderCount}>
                      {"   ·   "}
                      {g.cameras} camera streams
                      {modified ? "   ·   modified" : ""}
                    </Text>
                  </Text>
                </View>
                <View style={styles.tr}>
                  {cameraColumns.map((col) => (
                    <Text
                      key={col.header}
                      style={[styles.td, { width: col.width }, col.align === "right" ? { textAlign: "right" } : {}]}
                    >
                      {col.cell(g)}
                    </Text>
                  ))}
                </View>
              </View>
            );
          })}

          <View style={styles.totalsRow} wrap={false}>
            <Text style={[styles.totalsCell, { width: camTotalsLabelWidth }]}>
              Totals   ·   {totalCameras} camera streams
            </Text>
            <Text style={[styles.totalsCell, { width: camBwWidth, textAlign: "right" }]}>
              {totalBwMbps.toLocaleString("en-US", { maximumFractionDigits: 1 })}
            </Text>
            <Text style={[styles.totalsCell, { width: camStoreWidth, textAlign: "right" }]}>
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
        <Text style={styles.tableNote}>
          Figures below reflect the camera requirements from the original calculator
          submission, not the equipment quoted in this document. See the quoted solution on
          page 2 for actual delivered capacity.
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
        </View>
      </Page>

      {/* ── Page 2: Products showcase ───────────────────────────────────── */}
      <Page size="LETTER" style={styles.page}>
        <PageHeader
          logoDataUri={logoDataUri}
          identifier={generation.identifier}
          generatedDateStr={generatedDateStr}
          disclaimer={headerDisclaimer}
        />
        <PageFooter identifier={generation.identifier} validityLine={validityLine} />

        {/* Marketing showcase — intentionally light on specs, distinct from the
            priced commercial table on page 3 (ADR 0066). One compact, full-width
            bordered row per eligible product; five fit on a page. */}
        <Text style={styles.sectionTitle}>Products in this quote</Text>

        {showcase.length === 0 ? (
          <Text style={styles.emptyShowcase}>
            No catalog products with price-book family records in this quote.
          </Text>
        ) : (
          showcase.map((item, i) => {
            const heroUri = showcaseHeroDataUris[i] ?? null;
            const pairs = item.specHighlights
              ? showcaseSpecPairs(item.specHighlights)
              : [];
            return (
              <View key={item.sku} style={styles.showcaseRow} wrap={false}>
                <View style={styles.showcaseImageCol}>
                  {heroUri ? (
                    // @react-pdf/renderer Image has no alt concept (not an HTML img).
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
                  <Text style={styles.showcaseProductMeta}>
                    {item.sku} · {item.productGroup}
                  </Text>
                  {/* Null highlights are omitted by showcaseSpecPairs; an item
                      with none renders no grid (and no note), so its row is
                      short. */}
                  {pairs.length > 0 ? (
                    <View style={styles.showcaseSpecGrid}>
                      {pairs.map((p) => (
                        <View key={p.key} style={styles.showcaseSpecPair}>
                          <Text style={styles.showcaseSpecKey}>{p.key}</Text>
                          <Text style={styles.showcaseSpecVal}>{p.value}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })
        )}

        {/* Quoted solution — delivered capacity of the equipment above vs the
            page-1 calculated requirement. Only shown when there is quoted
            equipment to measure; same bar pattern as page 1's System capacity. */}
        {showcase.length > 0
          ? (() => {
              const quoted = sumQuotedCapacity(showcase, commercial.lineItems);
              const storagePct =
                quoted.usableStorageTb > 0
                  ? (sizing.storageTb / quoted.usableStorageTb) * 100
                  : 0;
              const bandwidthPct =
                quoted.bandwidthMbps > 0
                  ? (sizing.bandwidthMbps / quoted.bandwidthMbps) * 100
                  : 0;
              return (
                <View style={styles.quotedSolutionBlock} wrap={false}>
                  <Text style={styles.sectionTitle}>Quoted solution</Text>
                  <Text style={styles.tableNote}>
                    Capacity delivered by the equipment above, compared to the original
                    calculated requirement on page 1.
                  </Text>
                  <CapacityBar
                    label="Total storage"
                    fillPct={storagePct}
                    color={ARXYS_NAVY}
                    value={
                      quoted.hasStorage
                        ? `${fmtTb(sizing.storageTb)} of ${fmtTb(quoted.usableStorageTb)} usable`
                        : `${fmtTb(sizing.storageTb)} required`
                    }
                  />
                  <CapacityBar
                    label="Bandwidth"
                    fillPct={bandwidthPct}
                    color={ARXYS_NAVY}
                    value={
                      quoted.hasBandwidth
                        ? `${fmtMbps(sizing.bandwidthMbps)} of ${fmtMbps(quoted.bandwidthMbps)}`
                        : `${fmtMbps(sizing.bandwidthMbps)} required`
                    }
                  />
                </View>
              );
            })()
          : null}
      </Page>

      {/* ── Page 3: Commercial ──────────────────────────────────────────── */}
      <Page size="LETTER" style={styles.page}>
        <PageHeader
          logoDataUri={logoDataUri}
          identifier={generation.identifier}
          generatedDateStr={generatedDateStr}
          disclaimer={headerDisclaimer}
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
            {COMMERCIAL_COLUMNS.map((col) => (
              <Text
                key={col.header}
                style={[
                  styles.commTh,
                  col.width == null ? { flex: 1 } : { width: col.width },
                  col.align === "right" ? { textAlign: "right" } : {},
                ]}
              >
                {col.header}
              </Text>
            ))}
          </View>

          {/* CODE · PRODUCT · MSRP EACH · DISC % · PARTNER EACH · QTY · PARTNER
              TOTAL. MSRP/disc are raw; partner-each and partner-total are
              DERIVED at render (derivePartnerEach / derivePartnerTotal) — never
              read from the snapshot. Info-only lines blank the four money cells
              but keep the quantity. */}
          {sortedLines.map((line, i) => (
            <View key={i} style={styles.commTr} wrap={false}>
              <Text style={[styles.commTdMuted, { width: COM_CODE }]}>
                {line.productCode ?? "—"}
              </Text>
              <Text style={[styles.commTd, { flex: 1 }]}>{line.productName ?? "—"}</Text>
              {line.isInfoOnly ? (
                <>
                  <Text style={[styles.commTd, { width: COM_MSRP }]} />
                  <Text style={[styles.commTd, { width: COM_DISC }]} />
                  <Text style={[styles.commTd, { width: COM_PARTNER_EACH }]} />
                  <Text style={[styles.commTdRight, { width: COM_QTY }]}>
                    {line.quantity ?? "—"}
                  </Text>
                  <Text style={[styles.commTd, { width: COM_PARTNER_TOTAL }]} />
                </>
              ) : (
                <>
                  <Text style={[styles.commTdRight, { width: COM_MSRP }]}>
                    {fmtMoney(line.unitPrice, currency)}
                  </Text>
                  <Text style={[styles.commTdRight, { width: COM_DISC }]}>
                    {fmtDiscountPct(line)}
                  </Text>
                  <Text style={[styles.commTdRight, { width: COM_PARTNER_EACH }]}>
                    {fmtMoney(derivePartnerEach(line), currency)}
                  </Text>
                  <Text style={[styles.commTdRight, { width: COM_QTY }]}>
                    {line.quantity ?? "—"}
                  </Text>
                  <Text style={[styles.commTdRight, { width: COM_PARTNER_TOTAL }]}>
                    {fmtMoney(derivePartnerTotal(line), currency)}
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
                  width: COM_PARTNER_TOTAL,
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

        {/* Terms / Shipping / FOB — static, pushed to the bottom of the page
            above the fixed footer (marginTop:auto on fobBlock). */}
        <View style={styles.fobBlock}>
          {QUOTE_FOB_BLOCK.map((row) => (
            <View key={row.label} style={styles.fobRow}>
              <Text style={styles.fobLabel}>{row.label}</Text>
              <Text style={styles.fobValue}>{row.value}</Text>
            </View>
          ))}
        </View>
      </Page>

      {/* ── Page 4: Terms ───────────────────────────────────────────────── */}
      <Page size="LETTER" style={styles.page}>
        <PageHeader
          logoDataUri={logoDataUri}
          identifier={generation.identifier}
          generatedDateStr={generatedDateStr}
          disclaimer={headerDisclaimer}
        />
        <PageFooter identifier={generation.identifier} validityLine={validityLine} />

        {/* Quote identity and partner block — 3 columns, 2 rows. */}
        <View style={styles.termsIdGrid}>
          <View style={styles.termsIdCell}>
            <Text style={styles.termsIdLabel}>Quote reference</Text>
            <Text style={styles.termsIdValue}>{generation.identifier}</Text>
          </View>
          <View style={styles.termsIdCell}>
            <Text style={styles.termsIdLabel}>Generated</Text>
            <Text style={styles.termsIdValue}>{generatedDateStr}</Text>
          </View>
          <View style={styles.termsIdCell}>
            <Text style={styles.termsIdLabel}>Valid through</Text>
            <Text style={styles.termsIdValue}>{expiryDateStr}</Text>
          </View>
          <View style={styles.termsIdCell}>
            <Text style={styles.termsIdLabel}>Terms version</Text>
            <Text style={styles.termsIdValue}>{terms.version}</Text>
          </View>
          <View style={styles.termsIdCellWide}>
            <Text style={styles.termsIdLabel}>Prepared for</Text>
            <Text style={styles.termsIdValue}>
              {sizing.partner.companyName} — {sizing.partner.contactName}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Terms and Conditions</Text>
        {/* One <Text> per paragraph (split on the blank line the terms text
            joins with) so react-pdf has natural break points; the compact
            termsText size keeps the full T&Cs on a single page. */}
        {terms.text.split("\n\n").map((para, i) => (
          <Text key={i} style={[styles.termsText, { marginBottom: 3 }]}>
            {para}
          </Text>
        ))}
      </Page>
    </Document>
  );
}
