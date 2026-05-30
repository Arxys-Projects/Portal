import "server-only";
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { type DocumentProps, renderToBuffer } from "@react-pdf/renderer";
import { type ReactElement, createElement } from "react";
import {
  ARXYS_GOLD,
  BG_LIGHT,
  BORDER_LIGHT,
  FOOTER_MUTED,
  STORAGE_GREEN,
  TEXT_MUTED,
  TEXT_SLATE,
} from "./colors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ComparisonPdfInput = {
  generatedAt: Date;
  partnerCompanyName: string;
  competitorBrand: string;
  competitorProductLine: string;
  competitorModelName: string;
  arxysModelName: string;
  arxysModelId: string;
  specs: Array<{ label: string; competitorVal: string; arxysVal: string }>;
  competitorPriceUsd: number | null;
  arxysMsrpUsd: number;
  serverCount: number;
  priceDeltaUsd: number | null;
  deploymentSavingsUsd: number | null;
  footerText: string;
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 3,
    borderBottomColor: ARXYS_GOLD,
    paddingBottom: 12,
    marginBottom: 20,
  },
  logo: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: ARXYS_GOLD,
    letterSpacing: 3,
  },
  headerRight: {
    fontSize: 9,
    color: TEXT_MUTED,
    textAlign: "right",
  },
  title: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 11,
    color: TEXT_MUTED,
    marginBottom: 20,
  },

  // Comparison match row
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: BG_LIGHT,
    borderWidth: 1,
    borderColor: BORDER_LIGHT,
    padding: 12,
    marginBottom: 20,
  },
  matchBox: {
    flex: 1,
  },
  matchLabel: {
    fontSize: 8,
    color: TEXT_MUTED,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 3,
  },
  matchModelName: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: TEXT_SLATE,
  },
  matchArrow: {
    fontSize: 16,
    color: ARXYS_GOLD,
    paddingHorizontal: 12,
  },

  // Spec table
  tableHeader: {
    flexDirection: "row",
    backgroundColor: TEXT_SLATE,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tableHeaderCell: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  colSpec: { flex: 2.2 },
  colComp: { flex: 2 },
  colArxys: { flex: 2 },

  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_LIGHT,
  },
  tableRowAlt: {
    backgroundColor: BG_LIGHT,
  },
  cellSpec: {
    fontSize: 9.5,
    color: TEXT_MUTED,
    fontFamily: "Helvetica-Bold",
    flex: 2.2,
  },
  cellComp: {
    fontSize: 9.5,
    color: TEXT_SLATE,
    flex: 2,
  },
  cellArxys: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    color: "#054A91",
    flex: 2,
  },

  // Pricing section
  pricingSection: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: BORDER_LIGHT,
    padding: 14,
  },
  pricingTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: TEXT_MUTED,
    marginBottom: 10,
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_LIGHT,
  },
  priceLabel: {
    fontSize: 10,
    color: TEXT_SLATE,
  },
  priceVal: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: TEXT_SLATE,
  },
  savingsVal: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: STORAGE_GREEN,
  },

  // Footer
  footer: {
    position: "absolute",
    bottom: 30,
    left: 50,
    right: 50,
    borderTopWidth: 1,
    borderTopColor: BORDER_LIGHT,
    paddingTop: 8,
  },
  footerText: {
    fontSize: 8,
    color: FOOTER_MUTED,
    textAlign: "center",
    lineHeight: 1.5,
  },
});

// ---------------------------------------------------------------------------
// Template component
// ---------------------------------------------------------------------------

function fmtUsd(n: number): string {
  return `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function ComparisonPdf({ data }: { data: ComparisonPdfInput }) {
  const dateStr = data.generatedAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <Document title="Arxys VideoX Server Comparison">
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>ARXYS</Text>
          <Text style={styles.headerRight}>
            {dateStr}{"\n"}
            {data.partnerCompanyName}
          </Text>
        </View>

        {/* Title */}
        <Text style={styles.title}>VideoX Server Comparison Report</Text>
        <Text style={styles.subtitle}>
          {data.competitorBrand} {data.competitorProductLine} vs. Arxys VideoX
        </Text>

        {/* Match row */}
        <View style={styles.matchRow}>
          <View style={styles.matchBox}>
            <Text style={styles.matchLabel}>{data.competitorBrand} {data.competitorProductLine}</Text>
            <Text style={styles.matchModelName}>{data.competitorModelName}</Text>
          </View>
          <Text style={styles.matchArrow}>→</Text>
          <View style={styles.matchBox}>
            <Text style={styles.matchLabel}>Arxys VideoX</Text>
            <Text style={[styles.matchModelName, { color: ARXYS_GOLD }]}>{data.arxysModelName}</Text>
          </View>
        </View>

        {/* Spec table header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, styles.colSpec]}>Specification</Text>
          <Text style={[styles.tableHeaderCell, styles.colComp]}>{data.competitorBrand}</Text>
          <Text style={[styles.tableHeaderCell, styles.colArxys]}>Arxys VideoX</Text>
        </View>

        {/* Spec rows */}
        {data.specs.map((spec, i) => (
          <View
            key={spec.label}
            style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}
          >
            <Text style={styles.cellSpec}>{spec.label}</Text>
            <Text style={styles.cellComp}>{spec.competitorVal}</Text>
            <Text style={styles.cellArxys}>{spec.arxysVal}</Text>
          </View>
        ))}

        {/* Pricing section */}
        {(data.competitorPriceUsd !== null || data.arxysMsrpUsd > 0) && (
          <View style={styles.pricingSection}>
            <Text style={styles.pricingTitle}>Pricing Comparison</Text>

            {data.competitorPriceUsd !== null && (
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>
                  {data.competitorBrand} quoted price
                </Text>
                <Text style={styles.priceVal}>{fmtUsd(data.competitorPriceUsd)}</Text>
              </View>
            )}

            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Arxys VideoX MSRP</Text>
              <Text style={styles.priceVal}>{fmtUsd(data.arxysMsrpUsd)}</Text>
            </View>

            {data.priceDeltaUsd !== null && data.priceDeltaUsd > 0 && (
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Savings per server</Text>
                <Text style={styles.savingsVal}>{fmtUsd(data.priceDeltaUsd)}</Text>
              </View>
            )}

            {data.deploymentSavingsUsd !== null &&
              data.deploymentSavingsUsd > 0 &&
              data.serverCount > 1 && (
                <View style={[styles.priceRow, { borderBottomWidth: 0 }]}>
                  <Text style={styles.priceLabel}>
                    Total savings — {data.serverCount}-server deployment
                  </Text>
                  <Text style={styles.savingsVal}>{fmtUsd(data.deploymentSavingsUsd)}</Text>
                </View>
              )}
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{data.footerText}</Text>
        </View>
      </Page>
    </Document>
  );
}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

export async function renderComparisonPdfBuffer(
  input: ComparisonPdfInput,
): Promise<Buffer> {
  const element = createElement(ComparisonPdf, { data: input }) as unknown as ReactElement<DocumentProps>;
  return renderToBuffer(element);
}

export function comparisonPdfFilename(generatedAt: Date): string {
  const yyyy = generatedAt.getFullYear();
  const mm = String(generatedAt.getMonth() + 1).padStart(2, "0");
  const dd = String(generatedAt.getDate()).padStart(2, "0");
  return `Arxys-Comparison-${yyyy}-${mm}-${dd}.pdf`;
}
