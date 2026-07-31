import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { C, F, loadPng, px, registerDatasheetFonts } from "./tokens";
import type { DatasheetContent, ImageSlot, SpecRow } from "./types";

// The "Ledger" datasheet template — VideoX NVRs and management servers.
//
// TWO SHEETS, ONE TEMPLATE (ADR 0111). The V250/V255 management sheet renders
// through this file. It shares page 1, page 3 and every styling rule with the
// NVR sheet, and differs in exactly two page-2 blocks, both of which arrive as
// data: `performance` is a discriminated union (a Max Video Stream Rate table
// plus its parameter strip, or a Management Capacity table with no strip), and
// `orderable` carries its own columns and weights. Nothing else in here asks
// which kind of sheet it is rendering — that is the test of whether this was
// the right call, and the reason a fix to the warranty band or the ladder does
// not have to be made twice.
//
// No `import "server-only"` here, matching ProjectQuotePdf.tsx: the marker
// throws under plain Node, which would put this template out of reach of both
// `tsx --test` and the mockup render script. It belongs on the render entry
// point that loads assets and talks to Supabase, not on the component.
// Recreated from the Phase 2 design handoff for @react-pdf/renderer, which
// supports a flexbox subset and NO CSS grid, so every `display: grid` in the
// handoff's HTML reference is a nested flex row here.
//
// THREE PAGES, not the handoff's two. The handoff measured both server pages
// at exactly 1056px with zero slack and carried a standing recommendation for
// a third page ("Known constraints" §1): specs and rear-panel photography move
// off page 2, page 2 keeps the VSR and ordering tables, and the spec values
// come back up from ~6.8pt to ~8pt. This is that layout, for review.
//
//   p1  identity, positioning, the pitch   (unchanged from the handoff)
//   p2  positioning and ordering           (model ladder + VSR + orderable + rear I/O)
//   p3  technical specifications           (the spec grid at 8pt, on its own)
//
// The model ladder sits at the top of page 2, not on page 1. It answers
// "where does this SKU sit in the line", which is an ordering question, and
// moving it is what lets page 1's product photo be tall enough for a real
// front-3/4 shot. The rear-panel frame is deliberately shallower than that
// product shot rather than the other way round.

const PAGE_W = px(816);

const s = StyleSheet.create({
  page: {
    width: PAGE_W,
    paddingTop: px(44),
    paddingHorizontal: px(48),
    paddingBottom: px(30),
    fontFamily: F.sans,
    color: C.body,
    backgroundColor: "#FFFFFF",
  },

  // ── Header ─────────────────────────────────────────────────────────────
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  logo: { width: px(128) },
  logoFallback: { fontFamily: F.display, fontSize: px(18), color: C.gold, letterSpacing: 2 },
  headerRight: { alignItems: "flex-end" },
  // Line heights are transcribed from the handoff's type table and are load
  // bearing, not polish: @react-pdf/renderer defaults to roughly 1.2, and the
  // display sizes are specified at 0.92–1.0. Leaving them off adds ~9px under
  // the 56px numeral alone, which is what first pushed page 1's footer onto a
  // page of its own.
  runningMark: {
    fontSize: px(9.5),
    lineHeight: 1,
    fontWeight: 700,
    letterSpacing: px(9.5) * 0.24,
    color: C.navy,
    textTransform: "uppercase",
  },
  productClass: { fontSize: px(9), lineHeight: 1.5, fontWeight: 500, color: C.muted, marginTop: px(4) },
  headerRule: { height: px(2.5), backgroundColor: C.navy, marginTop: px(8) },

  // ── Hero ───────────────────────────────────────────────────────────────
  hero: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: px(14),
  },
  modelNumeral: {
    fontFamily: F.display,
    fontSize: px(56), lineHeight: 0.92,
    fontWeight: 600,
    letterSpacing: px(56) * -0.015,
    color: C.navy,
  },
  modelSeparator: { color: C.separator },
  descriptor: {
    fontSize: px(16), lineHeight: 1.25,
    fontWeight: 600,
    letterSpacing: px(16) * 0.06,
    color: C.muted,
    textTransform: "uppercase",
    // The 0.92 line height on the numeral above crops its descender space, so
    // the gap the handoff draws has to be put back explicitly.
    marginTop: px(18),
  },
  heroLeft: { flex: 1, paddingRight: px(20) },
  // No shrink: the pills keep their measure and the descriptor gives way, which
  // is the handoff's rule for this row ("nowrap and no flex shrink") — without
  // it "CE / UKCA" breaks mid-string the moment the descriptor gets long.
  pills: { flexDirection: "row", alignItems: "center", flexShrink: 0 },
  pill: {
    borderWidth: 1,
    borderColor: C.hairline,
    paddingVertical: px(6),
    paddingHorizontal: px(9),
    marginLeft: px(8),
  },
  pillText: {
    fontSize: px(7.5), lineHeight: 1,
    fontWeight: 700,
    letterSpacing: px(7.5) * 0.1,
    color: C.navy,
    textTransform: "uppercase",
  },

  // ── Headline spec strip ────────────────────────────────────────────────
  strip: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.hairline,
    paddingVertical: px(11),
    marginTop: px(14),
  },
  stripCell: { flex: 1 },
  stripKey: {
    fontSize: px(8), lineHeight: 1,
    fontWeight: 700,
    letterSpacing: px(8) * 0.13,
    color: C.muted,
    textTransform: "uppercase",
  },
  stripValue: {
    fontFamily: F.display,
    fontSize: px(14), lineHeight: 1,
    fontWeight: 600,
    color: C.ink,
    marginTop: px(5),
  },

  // ── Section headers ────────────────────────────────────────────────────
  sectionHead: {
    fontSize: px(10.5), lineHeight: 1,
    fontWeight: 700,
    letterSpacing: px(10.5) * 0.15,
    color: C.navy,
    textTransform: "uppercase",
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  sectionCaption: { fontSize: px(8.5), lineHeight: 1.2, color: C.muted },

  // ── Model ladder ───────────────────────────────────────────────────────
  ladder: { flexDirection: "row", marginTop: px(7) },
  ladderCell: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.hairline,
    marginRight: px(3),
    alignItems: "center",
    paddingBottom: px(7),
  },
  ladderCellLast: { marginRight: 0 },
  // The active cell's ONLY differentiator: a 3px gold bar on its top edge.
  ladderBar: { height: px(3), width: "100%" },
  ladderModel: {
    fontFamily: F.display,
    fontSize: px(11), lineHeight: 1,
    fontWeight: 600,
    color: C.navy,
    marginTop: px(6),
  },
  ladderDetail: { fontSize: px(7.5), lineHeight: 1, color: C.muted, marginTop: px(2) },
  ladderCapacity: { fontSize: px(9), lineHeight: 1, fontWeight: 700, color: C.ink, marginTop: px(3) },

  // ── Usage / attributes ─────────────────────────────────────────────────
  twoCol: { flexDirection: "row", marginTop: px(14) },
  usageCol: { flex: 1.08, paddingRight: px(30) },
  attrCol: { flex: 1 },
  paragraph: { fontSize: px(10.5), lineHeight: 1.6, color: C.body, marginTop: px(7) },
  attrGrid: { flexDirection: "row", marginTop: px(7) },
  attrHalf: { flex: 1 },
  attrRow: { flexDirection: "row", marginBottom: px(6), paddingRight: px(6) },
  attrBullet: {
    width: px(4),
    height: px(4),
    backgroundColor: C.gold,
    marginTop: px(4),
    marginRight: px(7),
  },
  attrText: { flex: 1, fontSize: px(9), lineHeight: 1.45, color: C.body },

  // ── Image slots ────────────────────────────────────────────────────────
  // The slot keeps its space whether or not a photo exists — the layout never
  // reflows around a missing asset, which is what makes one template safe to
  // render for every SKU.
  slot: {
    backgroundColor: C.wash,
    borderWidth: 1,
    borderColor: C.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  slotLabel: { fontSize: px(10), lineHeight: 1.2, color: C.brandGrey },

  // ── Warranty band ──────────────────────────────────────────────────────
  band: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.goldWash,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.goldWashBorder,
    paddingVertical: px(13),
    paddingHorizontal: px(16),
    marginTop: px(14),
  },
  seal: { width: px(72), height: px(72), marginRight: px(16) },
  sealHeld: {
    width: px(72),
    height: px(72),
    marginRight: px(16),
    borderWidth: 1,
    borderColor: C.sealRing,
    borderStyle: "dashed",
    borderRadius: px(36),
    alignItems: "center",
    justifyContent: "center",
  },
  sealHeldText: { fontSize: px(7), fontWeight: 700, color: C.goldDark, letterSpacing: 0.5 },
  bandTitle: { fontFamily: F.display, fontSize: px(13), lineHeight: 1.2, fontWeight: 600, color: C.navy },
  bandBody: { fontSize: px(9.5), lineHeight: 1.5, color: C.body, marginTop: px(3) },

  // ── Feature grid ───────────────────────────────────────────────────────
  featureGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: px(7) },
  featureCell: { width: "50%", flexDirection: "row", paddingRight: px(30), marginBottom: px(16) },
  featureMark: {
    width: px(14),
    height: px(14),
    borderWidth: px(1.5),
    borderColor: C.navy,
    marginRight: px(10),
    marginTop: px(1),
    alignItems: "center",
    justifyContent: "center",
  },
  featureMarkInner: { width: px(6), height: px(6), backgroundColor: C.gold },
  featureTitle: { fontFamily: F.display, fontSize: px(10.5), lineHeight: 1.3, fontWeight: 600, color: C.navy },
  featureBody: { fontSize: px(9.5), lineHeight: 1.55, color: C.body, marginTop: px(3) },

  // ── VMS validated row ──────────────────────────────────────────────────
  vmsRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderColor: C.hairline,
    paddingVertical: px(11),
  },
  vmsLabel: {
    width: px(70),
    fontSize: px(7.5), lineHeight: 1.35,
    fontWeight: 700,
    letterSpacing: px(7.5) * 0.16,
    color: C.navy,
    textTransform: "uppercase",
  },
  // Set large on purpose: VMS compatibility is the first qualifying question
  // an integrator asks. Swap for real logo art when it exists, keep the size.
  vmsName: {
    fontFamily: F.display,
    fontSize: px(14), lineHeight: 1,
    fontWeight: 600,
    color: C.ink,
    marginRight: px(22),
  },

  // ── Footer ─────────────────────────────────────────────────────────────
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderTopWidth: 1,
    borderColor: C.hairline,
    paddingTop: px(9),
    marginTop: "auto",
  },
  footerText: { fontSize: px(7.5), lineHeight: 1.5, color: C.muted },
  // 2280 × 620 native, so 52 × 14 keeps the mark's aspect ratio exactly.
  footerAmd: { width: px(52), height: px(14), marginRight: px(16), objectFit: "contain" },
  pageNumber: { fontSize: px(7.5), lineHeight: 1, fontWeight: 600, letterSpacing: px(7.5) * 0.14, color: C.muted },

  // ── Page 2/3 title row ─────────────────────────────────────────────────
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    borderBottomWidth: px(2.5),
    borderColor: C.navy,
    paddingBottom: px(7),
  },
  titleModel: { fontFamily: F.display, fontSize: px(19), lineHeight: 1, fontWeight: 600, color: C.navy },
  titleRunning: {
    fontSize: px(12), lineHeight: 1,
    fontWeight: 700,
    letterSpacing: px(12) * 0.12,
    color: C.muted,
    textTransform: "uppercase",
    marginLeft: px(10),
  },

  // ── Tables ─────────────────────────────────────────────────────────────
  table: { borderWidth: 1, borderColor: C.hairline, marginTop: px(8) },
  tableHead: { flexDirection: "row", backgroundColor: C.wash },
  tableHeadCell: {
    fontSize: px(8.5), lineHeight: 1,
    fontWeight: 700,
    letterSpacing: px(8.5) * 0.11,
    color: C.navy,
    textTransform: "uppercase",
    paddingVertical: px(8),
    paddingHorizontal: px(13),
  },
  tableRow: { flexDirection: "row", borderTopWidth: 1, borderColor: C.tableRule },
  tableCell: {
    fontSize: px(9),
    color: C.body,
    paddingVertical: px(9),
    paddingHorizontal: px(13),
  },
  streamCount: { fontFamily: F.display, fontSize: px(13), lineHeight: 1, fontWeight: 600, color: C.navy },
  // The capacity table's counterpart to streamCount. Navy and bold for the same
  // reason, but left at the 9px table size: its cells are phrases ("250 and
  // above"), and a phrase set at the numeral's 13px wraps the column.
  capacityCell: { fontWeight: 700, color: C.navy },
  partNumber: { fontWeight: 600, color: C.navy },
  usableCell: { fontWeight: 700, color: C.ink },
  tableCaption: { fontSize: px(8.5), lineHeight: 1.5, color: C.caption, marginTop: px(7) },

  // ── VSR parameter strip ────────────────────────────────────────────────
  // Not decoration: this is what makes the stream count defensible to an
  // integrator. Keep it adjacent to the table, never drop it.
  paramStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: C.wash,
    borderLeftWidth: px(2),
    borderColor: C.gold,
    paddingVertical: px(9),
    paddingHorizontal: px(13),
    marginTop: px(10),
  },
  paramItem: { flexDirection: "row", marginRight: px(16), marginVertical: px(2) },
  paramLabel: {
    fontSize: px(8), lineHeight: 1.2,
    fontWeight: 700,
    letterSpacing: px(8) * 0.1,
    color: C.navy,
    textTransform: "uppercase",
    marginRight: px(5),
  },
  paramValue: { fontSize: px(8.5), lineHeight: 1.2, color: C.body },

  // ── Spec grid (page 3, raised to ~8pt) ─────────────────────────────────
  specGrid: { flexDirection: "row", marginTop: px(10) },
  specCol: { flex: 1 },
  specColLeft: { flex: 1, paddingRight: px(26) },
  specColHead: {
    fontSize: px(10.5), lineHeight: 1,
    fontWeight: 700,
    letterSpacing: px(10.5) * 0.15,
    color: C.navy,
    textTransform: "uppercase",
    borderBottomWidth: 1,
    borderColor: C.navy,
    paddingBottom: px(5),
  },
  specRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: C.specRule,
    // Page 3 carries only the spec grid, so the rows get the room the third
    // page was bought for — the handoff's 5px was a two-page compromise.
    paddingVertical: px(11),
  },
  // The handoff's label column is 82px against an 8.5px label. Page 3 raises
  // the spec type, so the column has to widen with it or "Operating system"
  // runs straight into its value with no gutter.
  specLabel: {
    width: px(104),
    paddingRight: px(8),
    fontSize: px(9.5),
    fontWeight: 600,
    color: C.muted,
    lineHeight: 1.35,
  },
  specValue: { flex: 1, fontSize: px(10.7), lineHeight: 1.45, color: C.ink },
});

// ── Small building blocks ─────────────────────────────────────────────────

function Footer({ data, page, total }: { data: DatasheetContent; page: number; total: number }) {
  // Every VideoX server in scope runs an AMD EPYC part, so the AMD mark rides
  // the footer of every page rather than being called out in a feature block.
  const amd = loadPng("/datasheet/amd-logo.png");
  return (
    <View style={s.footer}>
      <View style={{ flex: 1 }}>
        <Text style={s.footerText}>{data.footerAddress}</Text>
        <Text style={s.footerText}>{page === 1 ? data.footerNote : data.revisionLine}</Text>
      </View>
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      {amd ? <Image src={amd} style={s.footerAmd} /> : null}
      <Text style={s.pageNumber}>
        {page} / {total}
      </Text>
    </View>
  );
}

/**
 * A sized frame that shows the photo when the spec record has one and stays
 * empty when it doesn't — the layout never reflows around a missing asset,
 * which is what makes one template safe to render for every SKU.
 *
 * `flex` mode hands the slot whatever vertical space the rest of the page
 * leaves, floored at `minHeight`. Page 2's rear-panel slot uses it so the
 * page's slack ends up inside the frame instead of pooling above the footer,
 * and so a SKU with longer tables than the V800's still fits.
 */
function PhotoSlot({
  slot,
  height,
  flex = false,
  minHeight,
}: {
  slot: ImageSlot;
  height?: number;
  flex?: boolean;
  minHeight?: number;
}) {
  const src = slot.path ? loadPng(slot.path) : null;
  const box = flex ? { flex: 1, minHeight, marginTop: px(14) } : { height, marginTop: px(14) };
  // eslint-disable-next-line jsx-a11y/alt-text
  if (src) return <Image src={src} style={{ ...box, objectFit: "contain" }} />;
  return (
    <View style={[s.slot, box]}>
      <Text style={s.slotLabel}>{slot.placeholder}</Text>
    </View>
  );
}

function SpecList({ rows }: { rows: SpecRow[] }) {
  return (
    <>
      {rows.map((row) => (
        <View key={row.label} style={s.specRow}>
          <Text style={s.specLabel}>{row.label}</Text>
          <Text style={s.specValue}>{row.value}</Text>
        </View>
      ))}
    </>
  );
}

/**
 * The 56px hero numeral.
 *
 * A sheet covering two SKUs is titled "V250 / V255", and the handoff sets that
 * separator in `#B9C2CB` — the one place the separator token is used, and only
 * at display size, because at 3.4:1 it would fail AA as text. Here it is a
 * glyph between two model names rather than text carrying meaning: the names
 * either side are navy at 8.6:1 and reading the "/" is not required to
 * understand them. A single-model sheet never enters this branch.
 */
function ModelNumeral({ model }: { model: string }) {
  const parts = model.split("/").map((p) => p.trim());
  if (parts.length === 1) return <Text style={s.modelNumeral}>{model}</Text>;
  return (
    <Text style={s.modelNumeral}>
      {parts.map((part, i) => (
        <Text key={part}>
          {i > 0 ? <Text style={s.modelSeparator}>/</Text> : null}
          {part}
        </Text>
      ))}
    </Text>
  );
}

function PageTitle({ data, right }: { data: DatasheetContent; right: string }) {
  return (
    <View style={s.titleRow}>
      <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
        <Text style={s.titleModel}>{data.model}</Text>
        <Text style={s.titleRunning}>{right}</Text>
      </View>
      <Text style={[s.runningMark, { fontSize: px(11), letterSpacing: px(11) * 0.2 }]}>
        {data.runningMark}
      </Text>
    </View>
  );
}

// ── Pages ─────────────────────────────────────────────────────────────────

function PageOne({ data }: { data: DatasheetContent }) {
  const logo = loadPng("/datasheet/arxys-logo.png");
  const warranty = data.warranty;
  const seal = warranty?.sealPath ? loadPng(warranty.sealPath) : null;

  return (
    <Page size="LETTER" style={s.page}>
      <View style={s.header}>
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        {logo ? <Image src={logo} style={s.logo} /> : <Text style={s.logoFallback}>ARXYS</Text>}
        <View style={s.headerRight}>
          <Text style={s.runningMark}>{data.runningMark}</Text>
          <Text style={s.productClass}>{data.productClass}</Text>
        </View>
      </View>
      <View style={s.headerRule} />

      <View style={s.hero}>
        {/* flex + a gutter, so a long descriptor WRAPS instead of running into
            the pills. "4 Bay · 1U Rack · Management / Directory Server" is 22
            characters longer than "36 Bay · 4U Rack · V5 Video Server" and sat
            hard against the NDAA pill with no gap at all; the handoff's own
            V250 render wraps it onto two lines. */}
        <View style={s.heroLeft}>
          <ModelNumeral model={data.model} />
          <Text style={s.descriptor}>{data.descriptor}</Text>
        </View>
        {/* nowrap + no shrink: without it "CE / UKCA" splits across two lines
            whenever the descriptor claims more of the hero row. */}
        <View style={s.pills}>
          {data.compliance.map((label) => (
            <View key={label} style={s.pill}>
              <Text style={s.pillText}>{label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={s.strip}>
        {data.headline.map((stat) => (
          <View key={stat.key} style={s.stripCell}>
            <Text style={s.stripKey}>{stat.key}</Text>
            <Text style={s.stripValue}>{stat.value}</Text>
          </View>
        ))}
      </View>

      <View style={s.twoCol}>
        <View style={s.usageCol}>
          <Text style={s.sectionHead}>{data.usageHeading}</Text>
          <Text style={s.paragraph}>{data.usage}</Text>
        </View>
        <View style={s.attrCol}>
          <Text style={s.sectionHead}>Key attributes</Text>
          <View style={s.attrGrid}>
            {[0, 1].map((half) => (
              <View key={half} style={s.attrHalf}>
                {data.attributes
                  .filter((_, i) => i % 2 === half)
                  .map((attr) => (
                    <View key={attr} style={s.attrRow}>
                      <View style={s.attrBullet} />
                      <Text style={s.attrText}>{attr}</Text>
                    </View>
                  ))}
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* The height is per sheet and measured, not a constant — page 1's only
          flexible child is the feature grid and it sits at its content minimum,
          so it absorbs nothing and the frame is the only block that can pay for
          an extra line anywhere above it. See PAGE1_PHOTO_HEIGHT. */}
      <PhotoSlot slot={data.productPhoto} height={px(data.productPhotoHeight)} />

      {/* No band at all when the row has no warranty term. Omitting a block is
          the same rule the spec grid follows for an empty column (ADR 0109 §3):
          a shorter page is correct, an assumed term is a false claim. */}
      {warranty ? (
        <View style={s.band}>
          {seal ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={seal} style={s.seal} />
          ) : (
            <View style={s.sealHeld}>
              <Text style={s.sealHeldText}>{warranty.years} YR SEAL</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={s.bandTitle}>{warranty.title}</Text>
            <Text style={s.bandBody}>{warranty.body}</Text>
          </View>
        </View>
      ) : null}

      <View style={{ marginTop: px(14) }}>
        <Text style={s.sectionHead}>{data.featuresHeading}</Text>
        <View style={s.featureGrid}>
          {data.features.map((feature) => (
            <View key={feature.title} style={s.featureCell}>
              <View style={s.featureMark}>
                <View style={s.featureMarkInner} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.featureTitle}>{feature.title}</Text>
                <Text style={s.featureBody}>{feature.body}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={s.vmsRow}>
        <Text style={s.vmsLabel}>Validated with</Text>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
          {data.vmsValidated.map((name) => (
            <Text key={name} style={s.vmsName}>
              {name}
            </Text>
          ))}
        </View>
      </View>

      <Footer data={data} page={1} total={3} />
    </Page>
  );
}

function PageTwo({ data }: { data: DatasheetContent }) {
  // Column weights from the handoff: VSR 1.15 / .7 / .95 / 1.2. The Management
  // Capacity table's four columns are Role / Cameras / Recording / Notes, and
  // Notes carries a full clause so it takes the slack the VSR comparison
  // column takes on the other sheet.
  const vsr = [1.15, 0.7, 0.95, 1.2];
  const cap = [1.35, 0.85, 0.7, 1.6];
  const perf = data.performance;
  const ord = data.orderable.columns;

  return (
    <Page size="LETTER" style={s.page}>
      <PageTitle data={data} right="Performance & Ordering" />

      <View style={{ marginTop: px(18) }}>
        <View style={s.sectionRow}>
          <Text style={s.sectionHead}>{data.ladderHeading}</Text>
          <Text style={s.sectionCaption}>{data.ladderCaption}</Text>
        </View>
        <View style={s.ladder}>
          {data.ladder.map((cell, i) => (
            <View
              key={cell.model}
              style={[s.ladderCell, i === data.ladder.length - 1 ? s.ladderCellLast : {}]}
            >
              <View
                style={[s.ladderBar, { backgroundColor: cell.active ? C.gold : "transparent" }]}
              />
              <Text style={s.ladderModel}>{cell.model}</Text>
              <Text style={s.ladderDetail}>{cell.detail}</Text>
              <Text style={s.ladderCapacity}>{cell.capacity}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={[s.sectionRow, { marginTop: px(20) }]}>
        <Text style={s.sectionHead}>{perf.heading}</Text>
        <Text style={s.sectionCaption}>{perf.ceilingLine}</Text>
      </View>

      {perf.kind === "vsr" ? (
        <>
          <View style={s.table}>
            <View style={s.tableHead}>
              {["Resolution", "Codec", "Camera Streams", "vs. 4MP Baseline"].map((h, i) => (
                <Text key={h} style={[s.tableHeadCell, { flex: vsr[i] }]}>
                  {h}
                </Text>
              ))}
            </View>
            {/* Keyed on resolution AND codec: a sheet may list both H.264 and
                H.265 at the same resolution (every SW workstation matrix does),
                and resolution alone then collides — react-pdf warns that
                duplicate keys may duplicate or omit children. */}
            {perf.rows.map((row) => (
              <View key={`${row.resolution}·${row.codec}`} style={s.tableRow}>
                <Text style={[s.tableCell, { flex: vsr[0] }]}>{row.resolution}</Text>
                <Text style={[s.tableCell, { flex: vsr[1] }]}>{row.codec}</Text>
                <View style={[s.tableCell, { flex: vsr[2] }]}>
                  <Text style={s.streamCount}>{row.streams}</Text>
                </View>
                <Text style={[s.tableCell, { flex: vsr[3] }]}>{row.comparison}</Text>
              </View>
            ))}
          </View>

          <View style={s.paramStrip}>
            <View style={s.paramItem}>
              <Text style={[s.paramLabel, { color: C.goldDark }]}>VSR Parameters</Text>
            </View>
            {perf.parameters.map((param) => (
              <View key={param.label} style={s.paramItem}>
                <Text style={s.paramLabel}>{param.label}</Text>
                <Text style={s.paramValue}>{param.value}</Text>
              </View>
            ))}
          </View>
        </>
      ) : (
        // No parameter strip. The strip states the recording parameters a stream
        // count was measured against, and this machine records nothing — so it
        // is absent rather than empty, which is the same rule the warranty band
        // follows for a row with no term.
        <View style={s.table}>
          <View style={s.tableHead}>
            {["Role", "Cameras", "Recording", "Notes"].map((h, i) => (
              <Text key={h} style={[s.tableHeadCell, { flex: cap[i] }]}>
                {h}
              </Text>
            ))}
          </View>
          {perf.rows.map((row) => (
            <View key={row.role} style={s.tableRow}>
              <Text style={[s.tableCell, { flex: cap[0] }]}>{row.role}</Text>
              {/* The figure a reader came for, so it takes the navy weight the
                  VSR table gives its stream count — at table size, not the
                  13px display size, because these are phrases and not numerals. */}
              <Text style={[s.tableCell, s.capacityCell, { flex: cap[1] }]}>{row.cameras}</Text>
              <Text style={[s.tableCell, { flex: cap[2] }]}>{row.recording}</Text>
              <Text style={[s.tableCell, { flex: cap[3] }]}>{row.notes}</Text>
            </View>
          ))}
        </View>
      )}

      <Text style={s.tableCaption}>{perf.caption}</Text>

      <View style={{ marginTop: px(30) }}>
        <Text style={s.sectionHead}>Orderable configurations</Text>
        <View style={s.table}>
          <View style={s.tableHead}>
            {ord.map((col) => (
              <Text key={col.header} style={[s.tableHeadCell, { flex: col.flex }]}>
                {col.header}
              </Text>
            ))}
          </View>
          {data.orderable.rows.map((row) => (
            <View key={row[0]} style={s.tableRow}>
              {row.map((cell, i) => (
                <Text
                  key={ord[i]?.header ?? i}
                  style={[
                    s.tableCell,
                    ord[i]?.emphasis === "partNumber" ? s.partNumber : {},
                    ord[i]?.emphasis === "strong" ? s.usableCell : {},
                    { flex: ord[i]?.flex ?? 1 },
                  ]}
                >
                  {cell}
                </Text>
              ))}
            </View>
          ))}
        </View>
        <Text style={s.tableCaption}>{data.orderable.caption}</Text>
      </View>

      {/* The handoff's rear slot was 84px tall — roughly 4.4:1 for a chassis
          that is about 2.5:1 — because page 2 had no room for more. The third
          page is what buys the aspect ratio back: at the full 720px measure,
          280px is 2.6:1. */}
      <View style={{ marginTop: px(26) }}>
        <Text style={s.sectionHead}>Rear I/O panel</Text>
        <PhotoSlot slot={data.rearIo} height={px(200)} />
      </View>

      <View style={{ marginTop: px(24) }}>
        <Text style={s.sectionHead}>General information</Text>
        <Text style={[s.paragraph, { fontSize: px(10) }]}>{data.generalInfo}</Text>
      </View>

      <Footer data={data} page={2} total={3} />
    </Page>
  );
}

function PageThree({ data }: { data: DatasheetContent }) {
  return (
    <Page size="LETTER" style={s.page}>
      <PageTitle data={data} right="Technical Specifications" />

      <View style={s.specGrid}>
        <View style={s.specColLeft}>
          <Text style={s.specColHead}>Hardware information</Text>
          <SpecList rows={data.hardware} />
        </View>
        <View style={s.specCol}>
          <Text style={s.specColHead}>Regulatory & environmental</Text>
          <SpecList rows={data.environmental} />
        </View>
      </View>

      <Footer data={data} page={3} total={3} />
    </Page>
  );
}

export function DatasheetPdf({ data }: { data: DatasheetContent }) {
  registerDatasheetFonts();
  return (
    <Document
      title={`Arxys ${data.model} Datasheet`}
      author="Arxys"
      subject={data.descriptor}
      creator="Arxys Partner Portal"
    >
      <PageOne data={data} />
      <PageTwo data={data} />
      <PageThree data={data} />
    </Document>
  );
}
