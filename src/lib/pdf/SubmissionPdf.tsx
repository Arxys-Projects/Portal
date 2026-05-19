import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import {
  ARXYS_GOLD,
  BANDWIDTH_CYAN,
  BG_LIGHT,
  BORDER_LIGHT,
  CAMERAS_BLUE,
  FOOTER_MUTED,
  NOTE_BG,
  NOTE_BORDER,
  NOTE_TEXT,
  RECOMMEND_BG,
  STORAGE_GREEN,
  TEXT_MUTED,
  TEXT_SLATE,
} from "./colors";
import type { SubmissionPdfInput } from "./types";

const styles = StyleSheet.create({
  page: {
    paddingTop: 50,
    paddingHorizontal: 50,
    paddingBottom: 80,
    fontSize: 11,
    fontFamily: "Helvetica",
    color: TEXT_SLATE,
    lineHeight: 1.4,
  },
  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 3,
    borderBottomColor: ARXYS_GOLD,
    paddingBottom: 15,
    marginBottom: 25,
  },
  logo: {
    fontSize: 24,
    fontFamily: "Helvetica-Bold",
    color: ARXYS_GOLD,
    letterSpacing: 3,
  },
  headerRight: {
    fontSize: 9,
    color: TEXT_MUTED,
    textAlign: "right",
  },
  // Title
  title: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    marginTop: 5,
    marginBottom: 20,
  },
  // 3-up summary boxes
  summaryRow: {
    flexDirection: "row",
    marginBottom: 25,
  },
  summaryBox: {
    flex: 1,
    backgroundColor: BG_LIGHT,
    padding: 15,
    alignItems: "center",
  },
  summaryGutter: { width: "2%" },
  summaryLabel: {
    fontSize: 8,
    color: TEXT_MUTED,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
  },
  // Section heading
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    borderBottomWidth: 2,
    borderBottomColor: BORDER_LIGHT,
    marginTop: 10,
    marginBottom: 10,
    paddingBottom: 4,
  },
  // Project info table
  infoTable: {
    fontSize: 10,
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: "row",
    paddingVertical: 3,
  },
  infoLabel: {
    width: 130,
    color: TEXT_MUTED,
  },
  infoValue: {
    flex: 1,
    fontFamily: "Helvetica-Bold",
  },
  infoValuePlain: {
    flex: 1,
  },
  // Camera details table
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: ARXYS_GOLD,
  },
  tableHeaderCell: {
    color: "#ffffff",
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    textTransform: "uppercase",
    padding: 6,
  },
  tableBodyRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: BORDER_LIGHT,
  },
  tableBodyRowAlt: {
    flexDirection: "row",
    backgroundColor: BG_LIGHT,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_LIGHT,
  },
  tableBodyCell: {
    fontSize: 9,
    padding: 5,
  },
  // Column widths (must sum to ~100%)
  colGroup: { width: "16%" },
  colQty: { width: "6%" },
  colRes: { width: "12%" },
  colCodec: { width: "9%" },
  colFps: { width: "6%" },
  colScene: { width: "10%" },
  colHrs: { width: "8%" },
  colMotion: { width: "8%" },
  colBw: { width: "12%" },
  colSt: { width: "13%" },
  // Recommend box
  recommendBox: {
    backgroundColor: RECOMMEND_BG,
    borderWidth: 2,
    borderColor: CAMERAS_BLUE,
    padding: 15,
    marginBottom: 15,
  },
  recommendTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: CAMERAS_BLUE,
  },
  recommendCapacity: {
    fontSize: 9,
    marginTop: 6,
    color: "#334155",
  },
  // Warning note (yellow)
  noteBox: {
    backgroundColor: NOTE_BG,
    borderLeftWidth: 4,
    borderLeftColor: NOTE_BORDER,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginVertical: 8,
    fontSize: 9,
    color: NOTE_TEXT,
  },
  // Footer
  footer: {
    marginTop: 25,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER_LIGHT,
    fontSize: 8,
    color: FOOTER_MUTED,
  },
});

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatBandwidthMbps(mbps: number): string {
  return `${mbps.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Mbps`;
}

function formatStorageGb(gb: number): string {
  if (gb >= 1000) {
    return `${(gb / 1000).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TB`;
  }
  return `${gb.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GB`;
}

function formatNumber(n: number, decimals = 0): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

const COLUMNS: ReadonlyArray<{ key: keyof typeof styles; label: string }> = [
  { key: "colGroup", label: "Group" },
  { key: "colQty", label: "Qty" },
  { key: "colRes", label: "Resolution" },
  { key: "colCodec", label: "Codec" },
  { key: "colFps", label: "FPS" },
  { key: "colScene", label: "Scene" },
  { key: "colHrs", label: "Hrs/Day" },
  { key: "colMotion", label: "Motion" },
  { key: "colBw", label: "Bandwidth" },
  { key: "colSt", label: "Storage" },
];

export function SubmissionPdf({ data }: { data: SubmissionPdfInput }) {
  const dailyGb = data.totals.storageGb / Math.max(data.retentionDays, 1);
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>ARXYS</Text>
          <View style={styles.headerRight}>
            <Text>Generated: {formatDate(data.generatedAt)}</Text>
            <Text>www.arxys.com/video-storage-calculator</Text>
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>Video Storage & Bandwidth Report</Text>

        {/* 3-up summary */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Total Cameras</Text>
            <Text style={[styles.summaryValue, { color: CAMERAS_BLUE }]}>
              {formatNumber(data.totals.cameras)}
            </Text>
          </View>
          <View style={styles.summaryGutter} />
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Total Bandwidth</Text>
            <Text style={[styles.summaryValue, { color: BANDWIDTH_CYAN }]}>
              {formatBandwidthMbps(data.totals.bandwidthMbps)}
            </Text>
          </View>
          <View style={styles.summaryGutter} />
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Total Storage</Text>
            <Text style={[styles.summaryValue, { color: STORAGE_GREEN }]}>
              {formatStorageGb(data.totals.storageGb)}
            </Text>
          </View>
        </View>

        {/* Project Information */}
        <Text style={styles.sectionTitle}>Project Information</Text>
        <View style={styles.infoTable}>
          {data.partner.contactName ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Prepared For:</Text>
              <Text style={styles.infoValue}>{data.partner.contactName}</Text>
            </View>
          ) : null}
          {data.partner.companyName ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Company:</Text>
              <Text style={styles.infoValuePlain}>{data.partner.companyName}</Text>
            </View>
          ) : null}
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email:</Text>
            <Text style={styles.infoValuePlain}>{data.partner.email}</Text>
          </View>
          {data.projectName ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Project:</Text>
              <Text style={styles.infoValuePlain}>{data.projectName}</Text>
            </View>
          ) : null}
          {data.vms ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>VMS:</Text>
              <Text style={styles.infoValuePlain}>{data.vms}</Text>
            </View>
          ) : null}
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Retention:</Text>
            <Text style={styles.infoValuePlain}>{data.retentionDays} days</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Daily Ingest:</Text>
            <Text style={styles.infoValuePlain}>{formatStorageGb(dailyGb)}/day</Text>
          </View>
        </View>

        {/* Camera Details */}
        <Text style={styles.sectionTitle}>Camera Details</Text>
        <View>
          <View style={styles.tableHeaderRow}>
            {COLUMNS.map((c) => (
              <Text key={c.label} style={[styles.tableHeaderCell, styles[c.key]]}>
                {c.label}
              </Text>
            ))}
          </View>
          {data.groups.map((g, i) => {
            const rowStyle = i % 2 === 1 ? styles.tableBodyRowAlt : styles.tableBodyRow;
            return (
              <View key={i} style={rowStyle}>
                <Text style={[styles.tableBodyCell, styles.colGroup]}>{g.name}</Text>
                <Text style={[styles.tableBodyCell, styles.colQty]}>{g.cameras}</Text>
                <Text style={[styles.tableBodyCell, styles.colRes]}>{g.resolutionLabel}</Text>
                <Text style={[styles.tableBodyCell, styles.colCodec]}>{g.codec}</Text>
                <Text style={[styles.tableBodyCell, styles.colFps]}>{g.fps}</Text>
                <Text style={[styles.tableBodyCell, styles.colScene]}>{g.complexity}</Text>
                <Text style={[styles.tableBodyCell, styles.colHrs]}>{g.hoursPerDay}</Text>
                <Text style={[styles.tableBodyCell, styles.colMotion]}>{g.motionPercent}%</Text>
                <Text style={[styles.tableBodyCell, styles.colBw]}>
                  {formatBandwidthMbps(g.bandwidthMbps)}
                </Text>
                <Text style={[styles.tableBodyCell, styles.colSt]}>
                  {formatStorageGb(g.storageGb)}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Recommended Hardware */}
        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Recommended Hardware</Text>
        <View style={styles.recommendBox}>
          <Text style={styles.recommendTitle}>
            {data.recommendation.units} x {data.recommendation.productDescription}
          </Text>
          <Text style={styles.recommendCapacity}>
            System Capacity: {formatNumber(data.recommendation.coveredCameras)} cameras
            {" / "}
            {formatNumber(data.recommendation.coveredStorageTb, 1)} TB
          </Text>
        </View>
        {data.recommendation.warnings.map((w, i) => (
          <View key={i} style={styles.noteBox}>
            <Text>{w}</Text>
          </View>
        ))}

        {/* Overhead note */}
        <View style={styles.noteBox}>
          <Text>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>Note: </Text>
            Storage includes ~20% overhead for VMS best practices (filesystem,
            database, recording buffers).
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>ARXYS | www.arxys.com | 619.258.7800 | sales@arxys.com</Text>
        </View>
      </Page>
    </Document>
  );
}
