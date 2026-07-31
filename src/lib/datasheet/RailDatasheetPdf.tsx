import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { C, F, loadPng, px, registerDatasheetFonts } from "./tokens";
import type { RailContent, RailImageSlot, RailSpecRow } from "./rail-types";

// The "Rail" datasheet template — VideoX SW security workstations.
//
// Recreated from the Phase 2 design handoff (§"Rail (Workstation)") for
// @react-pdf/renderer, which supports a flexbox subset and NO CSS grid, so
// every `display: grid` in the handoff's HTML reference — the stream matrix,
// the two-column spec grid, the 66px label columns — is a nested flex row here.
//
// Measurements are written in the handoff's own CSS px and passed through px(),
// the same convention DatasheetPdf.tsx uses, so the file stays checkable
// against the handoff line by line.
//
//   page     816 × 1056, flex ROW, no page padding
//   rail     214 fixed · #F5F7F9 · border-right 1px · padding 44 22 30 · gap 18
//   content  flex 1 · padding 44 44 30 · gap 13 · min-width 0
//
// ONE PAGE, and that is a hard constraint, not a default: the handoff measured
// the design at exactly 1056px with zero slack. Unlike the Ledger sheet (ADR
// 0105) there is no standing recommendation to spill — a workstation sheet that
// runs to two pages is a design change, not an implementation detail. If a SKU
// stops fitting, raise it rather than letting react-pdf break the page.
//
// No `import "server-only"`, matching DatasheetPdf.tsx: the marker throws under
// plain Node, which would put the template out of reach of `tsx --test` and the
// mockup render script.

const RAIL_W = px(214);
// 816 − 214 rail − 1 border − 44 − 44 content padding. The product photo is
// this wide plus the 44px it bleeds into the right margin, i.e. 557 × 110 —
// which is exactly the native size of public/datasheet/sw-front.png.
const CONTENT_W = px(513);
const BLEED = px(44);

const s = StyleSheet.create({
  page: {
    flexDirection: "row",
    fontFamily: F.sans,
    color: C.ink,
    backgroundColor: "#FFFFFF",
  },

  // ── Rail ───────────────────────────────────────────────────────────────
  rail: {
    width: RAIL_W,
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: C.wash,
    borderRightWidth: 1,
    borderColor: C.hairline,
    paddingTop: px(44),
    paddingHorizontal: px(22),
    paddingBottom: px(30),
    gap: px(18),
  },
  logo: { width: px(120) },
  logoFallback: { fontFamily: F.display, fontSize: px(18), color: C.gold, letterSpacing: 2 },

  // Line heights are transcribed from the handoff's type table and are load
  // bearing, not polish: @react-pdf/renderer defaults to roughly 1.2 and the
  // display sizes are specified at 0.95–1.0, so leaving them off silently adds
  // height to a page that has no slack.
  runningMark: {
    fontSize: px(9.5),
    lineHeight: 1,
    fontWeight: 700,
    letterSpacing: px(9.5) * 0.24,
    color: C.navy,
  },
  modelNumeral: {
    fontFamily: F.display,
    fontSize: px(42),
    lineHeight: 0.95,
    fontWeight: 600,
    letterSpacing: px(42) * -0.015,
    color: C.navy,
    marginTop: px(9),
  },
  productClass: {
    fontSize: px(9),
    lineHeight: 1.5,
    fontWeight: 600,
    letterSpacing: px(9) * 0.09,
    color: C.muted,
    textTransform: "uppercase",
  },
  productClassFirst: { marginTop: px(8) },
  partNumber: {
    fontSize: px(9),
    lineHeight: 1,
    fontWeight: 600,
    color: C.navy,
    marginTop: px(9),
    paddingTop: px(8),
    borderTopWidth: 1,
    borderColor: C.hairline,
  },

  rule: { height: 1, backgroundColor: C.hairline },

  // The rail's section header is a size down from the content column's 10.5px.
  railHead: {
    fontSize: px(9.5),
    lineHeight: 1,
    fontWeight: 700,
    letterSpacing: px(9.5) * 0.14,
    color: C.navy,
    textTransform: "uppercase",
  },
  attrList: { gap: px(7), marginTop: px(7) },
  attrRow: { flexDirection: "row", gap: px(6), alignItems: "flex-start" },
  attrBullet: {
    width: px(3),
    height: px(3),
    backgroundColor: C.gold,
    flexGrow: 0,
    flexShrink: 0,
    marginTop: px(5),
  },
  attrText: { flex: 1, fontSize: px(8.5), lineHeight: 1.45, fontWeight: 400, color: C.body },

  // ── Warranty card ──────────────────────────────────────────────────────
  // On Rail there is no full-width band to give the warranty, so it becomes a
  // bordered card inside the rail with the seal centered above the title.
  warrantyCard: {
    backgroundColor: C.goldWash,
    borderWidth: 1,
    borderColor: C.goldWashBorder,
    paddingVertical: px(12),
    paddingHorizontal: px(11),
    alignItems: "center",
    gap: px(8),
  },
  seal: { width: px(62), height: px(62) },
  // Held slot: 1px dashed ring, micro-label, nothing drawn that pretends to be
  // a brand mark. No 3-year seal graphic exists — see the ADR.
  sealHeld: {
    width: px(62),
    height: px(62),
    flexGrow: 0,
    flexShrink: 0,
    borderWidth: 1,
    borderColor: C.sealRing,
    borderStyle: "dashed",
    borderRadius: px(31),
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  sealHeldText: {
    fontSize: px(6),
    lineHeight: 1,
    fontWeight: 700,
    letterSpacing: px(6) * 0.1,
    color: C.goldDark,
  },
  warrantyTitle: {
    fontFamily: F.display,
    fontSize: px(9.5),
    lineHeight: 1.3,
    fontWeight: 600,
    color: C.navy,
    textAlign: "center",
  },
  warrantyBody: {
    fontSize: px(8),
    lineHeight: 1.55,
    fontWeight: 400,
    color: C.body,
    textAlign: "center",
  },

  // ── Compliance pills ───────────────────────────────────────────────────
  // Full-width stacked blocks in the rail rather than Ledger's inline row.
  pillList: { gap: px(5), marginTop: px(5) },
  pill: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: C.hairline,
    paddingVertical: px(5),
    paddingHorizontal: px(8),
    // No shrink, and the label never wraps: without this "CE / FCC" breaks
    // mid-string as soon as the rail's inner measure tightens.
    flexGrow: 0,
    flexShrink: 0,
  },
  pillText: {
    fontSize: px(7),
    lineHeight: 1,
    fontWeight: 700,
    letterSpacing: px(7) * 0.1,
    color: C.navy,
  },

  address: { fontSize: px(7), lineHeight: 1.6, fontWeight: 400, color: C.muted },

  // ── Content column ─────────────────────────────────────────────────────
  content: {
    flex: 1,
    minWidth: 0,
    paddingTop: px(44),
    paddingHorizontal: px(44),
    paddingBottom: px(30),
    gap: px(13),
  },
  headline: {
    fontFamily: F.display,
    fontSize: px(20),
    lineHeight: 1.35,
    fontWeight: 600,
    color: C.navy,
  },
  headlineRule: { height: px(2.5), width: px(56), backgroundColor: C.gold, marginTop: px(11) },
  usage: { fontSize: px(10.5), lineHeight: 1.6, fontWeight: 400, color: C.body },

  // ── Photo slot ─────────────────────────────────────────────────────────
  // Bleeds right by the content padding, so the frame is 557 wide against the
  // 513px measure. Keeps its space whether or not a photo exists — the layout
  // never reflows around a missing asset, which is what makes one template safe
  // to render for every SKU.
  photo: { width: CONTENT_W + BLEED, height: px(110), marginRight: -BLEED },
  photoHeld: {
    backgroundColor: C.wash,
    borderWidth: 1,
    borderColor: C.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  photoLabel: { fontSize: px(10), lineHeight: 1.2, color: C.brandGrey },

  // ── Camera stream matrix ───────────────────────────────────────────────
  sectionRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  sectionHead: {
    fontSize: px(10.5),
    lineHeight: 1,
    fontWeight: 700,
    letterSpacing: px(10.5) * 0.15,
    color: C.navy,
    textTransform: "uppercase",
  },
  ceiling: { fontSize: px(8), lineHeight: 1, fontWeight: 500, color: C.muted },

  table: { borderWidth: 1, borderColor: C.hairline },
  tableHead: { flexDirection: "row", backgroundColor: C.wash, borderBottomWidth: 1, borderColor: C.hairline },
  tableHeadCell: {
    paddingVertical: px(7),
    paddingHorizontal: px(12),
    fontSize: px(8.5),
    lineHeight: 1,
    fontWeight: 700,
    letterSpacing: px(8.5) * 0.11,
    color: C.navy,
    textTransform: "uppercase",
  },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderColor: C.tableRule },
  tableCell: { paddingVertical: px(7), paddingHorizontal: px(12), fontSize: px(9), lineHeight: 1 },
  cellRes: { fontWeight: 500, color: C.ink },
  cellPlain: { fontWeight: 400, color: C.body },
  // Streams are the number an integrator reads first — navy and semibold, but
  // not the Poppins 13px display figure Ledger uses; this table is denser.
  cellStreams: { fontWeight: 600, color: C.navy },
  caption: { fontSize: px(7.5), lineHeight: 1.5, fontWeight: 400, color: C.muted },

  // ── Spec grid ──────────────────────────────────────────────────────────
  // Two flex columns, 24px gutter. Balance them BY ROW COUNT, not semantics —
  // an unbalanced grid is what caused a page overflow in the design pass.
  specGrid: { flexDirection: "row", gap: px(24), flex: 1 },
  specCol: { flex: 1 },
  specColHead: {
    fontSize: px(10.5),
    lineHeight: 1,
    fontWeight: 700,
    letterSpacing: px(10.5) * 0.15,
    color: C.navy,
    textTransform: "uppercase",
    borderBottomWidth: 1,
    borderColor: C.navy,
    paddingBottom: px(7),
    marginBottom: px(7),
  },
  specRow: {
    flexDirection: "row",
    gap: px(9),
    paddingVertical: px(3),
    borderBottomWidth: 1,
    borderColor: C.specRule,
  },
  // 66px on Rail, against Ledger's 82px.
  specLabel: {
    width: px(66),
    flexGrow: 0,
    flexShrink: 0,
    fontSize: px(8),
    lineHeight: 1.35,
    fontWeight: 600,
    color: C.muted,
  },
  specValue: { flex: 1, fontSize: px(8.5), lineHeight: 1.45, fontWeight: 400, color: C.ink },

  // ── Footer ─────────────────────────────────────────────────────────────
  footer: {
    borderTopWidth: 1,
    borderColor: C.hairline,
    paddingTop: px(8),
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerText: { fontSize: px(7), lineHeight: 1.5, fontWeight: 400, color: C.muted },
  pageNumber: {
    fontSize: px(7.5),
    lineHeight: 1,
    fontWeight: 600,
    letterSpacing: px(7.5) * 0.14,
    color: C.muted,
  },
});

// Matrix column weights, from the handoff's `grid-template-columns`.
const COLS = [1, 0.8, 0.8, 1];

function SpecList({ rows }: { rows: RailSpecRow[] }) {
  return (
    <>
      {rows.map((r) => (
        <View key={r.label} style={s.specRow}>
          <Text style={s.specLabel}>{r.label}</Text>
          <Text style={s.specValue}>{r.value}</Text>
        </View>
      ))}
    </>
  );
}

function PhotoSlot({ slot }: { slot: RailImageSlot }) {
  const src = slot.path ? loadPng(slot.path) : null;
  // eslint-disable-next-line jsx-a11y/alt-text
  if (src) return <Image src={src} style={{ ...s.photo, objectFit: "contain" }} />;
  return (
    <View style={[s.photo, s.photoHeld]}>
      <Text style={s.photoLabel}>{slot.placeholder}</Text>
    </View>
  );
}

function Rail({ data }: { data: RailContent }) {
  const logo = loadPng("/datasheet/arxys-logo.png");
  const seal = data.warranty.sealPath ? loadPng(data.warranty.sealPath) : null;

  return (
    <View style={s.rail}>
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      {logo ? <Image src={logo} style={s.logo} /> : <Text style={s.logoFallback}>ARXYS</Text>}

      <View>
        <Text style={s.runningMark}>{data.runningMark}</Text>
        <Text style={s.modelNumeral}>{data.model}</Text>
        {data.productClass.map((line, i) => (
          <Text key={line} style={[s.productClass, i === 0 ? s.productClassFirst : {}]}>
            {line}
          </Text>
        ))}
        <Text style={s.partNumber}>{data.partNumber}</Text>
      </View>

      <View style={s.rule} />

      <View>
        <Text style={s.railHead}>{data.attributesHeading}</Text>
        <View style={s.attrList}>
          {data.attributes.map((attr) => (
            <View key={attr} style={s.attrRow}>
              <View style={s.attrBullet} />
              <Text style={s.attrText}>{attr}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={s.rule} />

      <View style={s.warrantyCard}>
        {seal ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <Image src={seal} style={s.seal} />
        ) : (
          <View style={s.sealHeld}>
            <Text style={s.sealHeldText}>{data.warranty.years} YR SEAL</Text>
          </View>
        )}
        <Text style={s.warrantyTitle}>{data.warranty.title}</Text>
        <Text style={s.warrantyBody}>{data.warranty.body}</Text>
      </View>

      <View>
        <Text style={s.railHead}>{data.complianceHeading}</Text>
        <View style={s.pillList}>
          {data.compliance.map((label) => (
            <View key={label} style={s.pill}>
              <Text style={s.pillText}>{label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ flex: 1 }} />

      <View>
        {data.address.map((line) => (
          <Text key={line} style={s.address}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

function Content({ data }: { data: RailContent }) {
  return (
    <View style={s.content}>
      <View>
        <Text style={s.headline}>{data.headline}</Text>
        <View style={s.headlineRule} />
      </View>

      <Text style={s.usage}>{data.usage}</Text>

      <PhotoSlot slot={data.productPhoto} />

      <View style={s.sectionRow}>
        <Text style={s.sectionHead}>{data.matrixHeading}</Text>
        <Text style={s.ceiling}>{data.ceilingLine}</Text>
      </View>

      <View style={s.table}>
        <View style={s.tableHead}>
          {["Resolution", "Codec", "Camera Streams", "Bandwidth"].map((h, i) => (
            <Text key={h} style={[s.tableHeadCell, { flex: COLS[i] }]}>
              {h}
            </Text>
          ))}
        </View>
        {/* Keyed on resolution AND codec: this matrix lists both H.264 and H.265
            at the same resolution, so resolution alone collides and react-pdf
            warns that duplicate keys may duplicate or omit children. */}
        {data.matrix.map((row) => (
          <View key={`${row.resolution}·${row.codec}`} style={s.tableRow}>
            <Text style={[s.tableCell, s.cellRes, { flex: COLS[0] }]}>{row.resolution}</Text>
            <Text style={[s.tableCell, s.cellPlain, { flex: COLS[1] }]}>{row.codec}</Text>
            <Text style={[s.tableCell, s.cellStreams, { flex: COLS[2] }]}>{row.streams}</Text>
            <Text style={[s.tableCell, s.cellPlain, { flex: COLS[3] }]}>{row.bandwidth}</Text>
          </View>
        ))}
      </View>

      <Text style={s.caption}>{data.matrixCaption}</Text>

      <View style={s.specGrid}>
        <View style={s.specCol}>
          <Text style={s.specColHead}>{data.hardwareHeading}</Text>
          <SpecList rows={data.hardware} />
        </View>
        <View style={s.specCol}>
          <Text style={s.specColHead}>{data.performanceHeading}</Text>
          <SpecList rows={data.performance} />
        </View>
      </View>

      <View style={s.footer}>
        <View>
          {data.footerNote.map((line) => (
            <Text key={line} style={s.footerText}>
              {line}
            </Text>
          ))}
        </View>
        <Text style={s.pageNumber}>1 / 1</Text>
      </View>
    </View>
  );
}

export function RailDatasheetPdf({ data }: { data: RailContent }) {
  registerDatasheetFonts();
  return (
    <Document
      title={`Arxys ${data.model} Datasheet`}
      author="Arxys"
      subject={data.productClass.join(" ")}
      creator="Arxys Partner Portal"
    >
      <Page size="LETTER" style={s.page}>
        <Rail data={data} />
        <Content data={data} />
      </Page>
    </Document>
  );
}
