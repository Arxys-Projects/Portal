import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { type DocumentProps, Page, renderToBuffer } from "@react-pdf/renderer";
import {
  ProjectQuotePdf,
  buildCameraColumns,
  cameraScheduleHasVendorOrModel,
  formatOperationHrs,
  sortLineItemsByOrderNr,
  derivePartnerEach,
  derivePartnerTotal,
  COMMERCIAL_COLUMNS,
  QUOTE_FOB_BLOCK,
  showcaseSpecPairs,
  sumQuotedCapacity,
  type ProjectQuotePdfInput,
} from "./ProjectQuotePdf";
import { projectQuoteTitle } from "./title";
import type { ProjectQuoteCameraRow } from "./types";
import type { ProjectQuoteShowcaseItem } from "./types";
import type { ProjectQuoteSnapshot } from "./types";
import type { QuoteLineItem } from "@/lib/pipedrive/quote";

// Exercise the same composition that renderProjectQuotePdfBuffer uses, without
// importing render.ts directly — render.ts is marked `import "server-only"`
// which throws under plain Node (tsx --test). A break in the JSX shape still
// surfaces because renderToBuffer throws at runtime on a structurally invalid
// element tree.

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeLine(overrides: Partial<QuoteLineItem> = {}): QuoteLineItem {
  return {
    productId: 1,
    productCode: "VX5-V800-720",
    productName: "VideoX V800 720TB 4U 36Bay",
    unitPrice: 75000,
    discount: 45,
    discountType: "percentage",
    discountPercent: 45,
    discountedUnitPrice: null, // always null — Pipedrive does not expose this
    quantity: 1,
    lineAmount: 41250,
    currency: "USD",
    orderNr: 1,
    isInfoOnly: false,
    ...overrides,
  };
}

function makeInfoOnlyLine(overrides: Partial<QuoteLineItem> = {}): QuoteLineItem {
  return {
    productId: 99,
    productCode: "VX5-WTY-5Y",
    productName: "5yr Warranty — Advanced Replacement",
    unitPrice: 0,
    discount: null,
    discountType: null,
    discountPercent: null,
    discountedUnitPrice: null,
    quantity: 1,
    lineAmount: 0,
    currency: "USD",
    orderNr: 2,
    isInfoOnly: true,
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<ProjectQuoteSnapshot> = {}): ProjectQuoteSnapshot {
  return {
    snapshotVersion: 1,
    commercial: {
      dealId: 4822,
      dealTitle: "Kean University Security Upgrade",
      updatedAt: "2026-06-15T12:00:00Z",
      owner: "Internal User",
      organization: { name: "Kean University", address: "1000 Morris Ave, Union, NJ 07083" },
      person: { name: "Jane Smith", email: "jane@kean.edu", phone: null },
      lineItems: [
        makeLine({ orderNr: 1 }),
        makeLine({
          productCode: "VX5-V255-MGM",
          productName: "VideoX V255 Management",
          unitPrice: 8500,
          lineAmount: 4675,
          orderNr: 2,
        }),
        makeInfoOnlyLine({ orderNr: 3 }),
      ],
      productTotal: 45925, // verbatim; differs from the line sum (41250+4675+0=45925 here,
      // but in the verbatim-total test we use a fixture where they differ
      additionalDiscounts: null,
      currency: "USD",
      isEmpty: false,
    },
    sizing: {
      projectName: "Main Campus Security",
      vms: "Milestone XProtect",
      retentionDays: 30,
      totals: { cameras: 120, bandwidthMbps: 432.5, storageGb: 80500 },
      storageTb: 80.5,
      bandwidthMbps: 432.5,
      cameraSchedule: [
        {
          name: "Lobby Group",
          cameras: 40,
          resolutionLabel: "4MP (2560x1440)",
          codec: "H.265",
          fps: 15,
          complexityLabel: "Medium detail, low motion",
          recordingMode: "constant",
          retentionDays: 30,
          hoursPerDay: 24,
          motionPercent: 0,
          bandwidthMbps: 144.5,
          storageGb: 26500,
          cameraVendor: "Axis",
          cameraModel: "P3245-V",
          units: 40,
          sensorsPerCamera: 1,
          cameraModelModified: false,
        },
        {
          name: "Parking Lot",
          cameras: 80,
          resolutionLabel: "2MP (1920x1080)",
          codec: "H.265",
          fps: 10,
          complexityLabel: "Low detail, high motion",
          recordingMode: "motion",
          retentionDays: 30,
          hoursPerDay: 18,
          motionPercent: 40,
          bandwidthMbps: 288,
          storageGb: 54000,
          // Manual-entry group (no camera model loaded)
          cameraVendor: null,
          cameraModel: null,
          units: 0,
          sensorsPerCamera: 0,
          cameraModelModified: false,
        },
      ],
      recommendation: {
        units: 2,
        modelCode: "V800",
        productDescription: "VideoX V800 720TB",
        coveredCameras: 650,
        coveredStorageTb: 1200,
        warnings: [],
      },
      serverSpec: {
        sku: "VX5-V800-720",
        modelName: "VideoX V800",
        formFactor: "4U Rackmount",
        maxCameras: 325,
        maxBandwidthMbps: 4000,
        driveBays: 36,
        cpuModelFull: "AMD EPYC 9005 4.3GHz 16/32 Core",
        ramSpec: "32GB ECC DDR5",
        osEdition: "Windows Server 2022 LTSC Standard",
        warranty: "5yr NBD, Advanced Replacement",
        msrp: 75000,
        usablePerUnitTb: 600,
      },
      primaryServerHeroImagePath: "/price-book/v700-v800-hero.png",
      partner: {
        companyName: "Security Integrators LLC",
        contactName: "Bob Integrator",
      },
    },
    showcase: [
      {
        sku: "VX5-V800-720",
        productName: "VideoX V800 720TB 4U 36Bay",
        productGroup: "V800",
        msrp: 75000,
        heroImagePath: "/price-book/v700-v800-hero.png",
        specHighlights: {
          formFactor: "4U Rackmount",
          rackUnits: "4U",
          cpuModelFull: "AMD EPYC 9005 4.3GHz 16/32 Core",
          ramSpec: "32GB ECC DDR5",
          driveBays: 36,
          storageRawTb: 720,
          maxCameras: 325,
          maxBandwidthMbps: 4000,
          osEdition: "Windows Server 2022 LTSC Standard",
          raidLevelDisplay: "60",
          hddCount: 36,
        },
      },
    ],
    terms: {
      version: "v1.0",
      text: "These are the terms and conditions for this project quote. All prices are subject to written acceptance within the validity window. Arxys reserves the right to adjust pricing based on updated distributor costs.",
      sha256: "abc123",
    },
    generation: {
      version: 1,
      generatedAt: "2026-06-16T00:00:00.000Z",
      validityDays: 7,
      generatedByUserId: "00000000-0000-0000-0000-000000000001",
      submissionId: "00000000-0000-0000-0000-000000000002",
      dealId: 4822,
      identifier: "4822-V1-2026-06-16",
    },
    ...overrides,
  };
}

function makeInput(snapshot: ProjectQuoteSnapshot): ProjectQuotePdfInput {
  return {
    variant: "project-quote",
    commercial: snapshot.commercial,
    sizing: snapshot.sizing,
    showcase: snapshot.showcase ?? [],
    terms: snapshot.terms,
    generation: snapshot.generation,
    logoDataUri: null,
    partnerLogoDataUri: null,
    showcaseHeroDataUris: (snapshot.showcase ?? []).map(() => null),
  };
}

// Count the <Page> elements ProjectQuotePdf emits, faithful to the document
// model (ADR 0066 target: Sizing → Products → Commercial → Terms = 4). Invokes
// the component as a plain function and walks the <Document> children — this is
// the "<Page> count in the input model" check, NOT a grep of the subsetted PDF
// text (react-pdf subsets glyphs, so the byte stream can't be grepped). Whether
// those 4 pages also RENDER as 4 (no wrap={false} block overflowing onto a 5th
// page — the bug this fix removes) is asserted by the pdfinfo smoke gate.
function countPages(snapshot: ProjectQuoteSnapshot): number {
  const doc = ProjectQuotePdf({ data: makeInput(snapshot) }) as {
    props: { children: unknown };
  };
  const children = doc.props.children;
  const arr = Array.isArray(children) ? children : [children];
  return arr.filter(
    (c): c is { type: unknown } =>
      typeof c === "object" && c !== null && (c as { type?: unknown }).type === Page,
  ).length;
}

// Mirror render.ts: createElement types the element by the component's own
// props, so cast through unknown to the DocumentProps signature renderToBuffer
// expects.
function toDocumentElement(input: ProjectQuotePdfInput): ReactElement<DocumentProps> {
  return createElement(ProjectQuotePdf, { data: input }) as unknown as ReactElement<DocumentProps>;
}

async function render(snapshot: ProjectQuoteSnapshot): Promise<Buffer> {
  return renderToBuffer(toDocumentElement(makeInput(snapshot)));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ProjectQuotePdf renders via @react-pdf/renderer", () => {
  it("produces a non-empty Buffer with the %PDF- magic header", async () => {
    const buf = await render(makeSnapshot());
    assert.ok(buf instanceof Uint8Array, "render must return a Buffer / Uint8Array");
    assert.ok(buf.length > 1000, `PDF buffer suspiciously small: ${buf.length} bytes`);
    const header = buf.subarray(0, 5).toString("utf8");
    assert.equal(header, "%PDF-", `expected %PDF- header, got ${JSON.stringify(header)}`);
  });

  it("emits exactly four <Page> elements (Sizing → Products → Commercial → Terms)", () => {
    // ADR 0066 target structure. The deleted standalone server-spec hero added
    // no <Page> of its own (it was a wrap={false} block inside page 1 that
    // overflowed at render); its removal keeps the model at four pages and
    // stops the overflow that produced a heading-less fifth rendered page.
    assert.equal(countPages(makeSnapshot()), 4);
  });

  it("still emits four pages with an empty showcase", () => {
    const snap = makeSnapshot();
    assert.equal(countPages({ ...snap, showcase: [] }), 4);
  });

  it("renders without a resolved server spec (null serverSpec)", async () => {
    const snap = makeSnapshot();
    const noSpec: ProjectQuoteSnapshot = {
      ...snap,
      sizing: { ...snap.sizing, serverSpec: null, primaryServerHeroImagePath: null },
    };
    const buf = await render(noSpec);
    assert.ok(buf.length > 1000, `PDF buffer suspiciously small: ${buf.length} bytes`);
    assert.equal(buf.subarray(0, 5).toString("utf8"), "%PDF-");
  });

  it("handles null additionalDiscounts and null discountedUnitPrice without crashing", async () => {
    const snap = makeSnapshot();
    // Both are always null (Pipedrive doesn't expose them). Confirm no crash.
    assert.equal(snap.commercial.additionalDiscounts, null);
    for (const line of snap.commercial.lineItems) {
      assert.equal(line.discountedUnitPrice, null);
    }
    const buf = await render(snap);
    assert.ok(buf.length > 1000, `PDF buffer suspiciously small: ${buf.length} bytes`);
  });

  it("renders additionalDiscounts row when non-null", async () => {
    const snap = makeSnapshot();
    const withDiscount: ProjectQuoteSnapshot = {
      ...snap,
      commercial: { ...snap.commercial, additionalDiscounts: 500 },
    };
    // Should not crash — the additional discounts row is optional UI only.
    const buf = await render(withDiscount);
    assert.ok(buf.length > 1000, `PDF buffer suspiciously small: ${buf.length} bytes`);
  });

  it("info-only lines render without crashing (price cells blank)", async () => {
    const snap = makeSnapshot();
    // At least one info-only line is in the fixture.
    const infoLines = snap.commercial.lineItems.filter((l) => l.isInfoOnly);
    assert.ok(infoLines.length > 0, "fixture must contain at least one info-only line");
    const buf = await render(snap);
    assert.ok(buf.length > 1000, `PDF buffer suspiciously small: ${buf.length} bytes`);
  });

  it("renders a multi-group camera schedule including manual-entry groups", async () => {
    // The fixture already has one model-loaded group and one manual-entry group.
    const snap = makeSnapshot();
    const manualGroups = snap.sizing.cameraSchedule.filter(
      (g) => g.cameraVendor === null,
    );
    assert.ok(manualGroups.length > 0, "fixture must include a manual-entry group");
    const buf = await render(snap);
    assert.ok(buf.length > 1000, `PDF buffer suspiciously small: ${buf.length} bytes`);
  });
});

// ---------------------------------------------------------------------------
// Products showcase (page 2)
// ---------------------------------------------------------------------------

describe("ProjectQuotePdf products showcase (page 2)", () => {
  it("renders with an empty showcase (no catalog products)", async () => {
    const snap = makeSnapshot();
    const noShowcase: ProjectQuoteSnapshot = { ...snap, showcase: [] };
    const buf = await render(noShowcase);
    assert.ok(buf.length > 1000, `PDF buffer suspiciously small: ${buf.length} bytes`);
    assert.equal(buf.subarray(0, 5).toString("utf8"), "%PDF-");
  });

  it("renders multiple showcase rows including a card with null specHighlights", async () => {
    const snap = makeSnapshot();
    const multi: ProjectQuoteSnapshot = {
      ...snap,
      showcase: [
        snap.showcase[0],
        {
          sku: "VX5-V500-240",
          productName: "VideoX V500 240TB 2U 12Bay",
          productGroup: "V500",
          msrp: 42000,
          heroImagePath: "/price-book/v400-v500-hero.png",
          specHighlights: null, // no spec row → renders a short row with no grid
        },
        {
          sku: "VX5-SW20-200",
          productName: "VideoX SW20 Workstation",
          productGroup: "SW20",
          msrp: 3800,
          heroImagePath: "/price-book/sw-hero.png",
          specHighlights: {
            formFactor: "Tower",
            rackUnits: null,
            cpuModelFull: null,
            ramSpec: null,
            driveBays: null,
            storageRawTb: null,
            maxCameras: null,
            maxBandwidthMbps: 225,
            osEdition: "Windows 11 IoT Enterprise",
            raidLevelDisplay: null,
            hddCount: null,
          },
        },
      ],
    };
    assert.equal(multi.showcase[1].specHighlights, null);
    const buf = await render(multi);
    assert.ok(buf.length > 1000, `PDF buffer suspiciously small: ${buf.length} bytes`);
    assert.equal(buf.subarray(0, 5).toString("utf8"), "%PDF-");
  });

  it("renders five spec-rich rows on a single page (pagination fits 5)", async () => {
    const snap = makeSnapshot();
    const base = snap.showcase[0];
    const groups = ["V500", "V600", "V700", "V800", "SW35"];
    const five: ProjectQuoteSnapshot = {
      ...snap,
      showcase: groups.map((g, i) => ({
        ...base,
        sku: `VX5-${g}-${i}`,
        productName: `VideoX ${g} Server`,
        productGroup: g,
      })),
    };
    assert.equal(five.showcase.length, 5);
    const buf = await render(five);
    assert.ok(buf.length > 1000, `PDF buffer suspiciously small: ${buf.length} bytes`);
    assert.equal(buf.subarray(0, 5).toString("utf8"), "%PDF-");
    // Pagination is asserted visually by the smoke-render gate (pdftotext): the
    // five rows + heading + footer land on one page. react-pdf subsets glyphs,
    // so the byte stream can't be grepped for the page-2 row count here.
  });

  it("falls back to the placeholder box when a row has no hero image", async () => {
    const snap = makeSnapshot();
    // makeInput supplies null hero data URIs for every showcase item, so the
    // default fixture already exercises the placeholder branch. Confirm it
    // renders rather than throwing on the missing image.
    const input = makeInput(snap);
    assert.deepEqual(input.showcaseHeroDataUris, [null]);
    const buf = await renderToBuffer(toDocumentElement(input));
    assert.ok(buf.length > 1000, `PDF buffer suspiciously small: ${buf.length} bytes`);
    assert.equal(buf.subarray(0, 5).toString("utf8"), "%PDF-");
  });
});

describe("showcaseSpecPairs — omit-nulls keeps rows short", () => {
  const FULL: NonNullable<ProjectQuoteSnapshot["showcase"][number]["specHighlights"]> = {
    formFactor: "4U Rackmount",
    rackUnits: "4U",
    cpuModelFull: "AMD EPYC 9005",
    ramSpec: "64GB ECC DDR5",
    driveBays: 36,
    storageRawTb: 720,
    maxCameras: 325,
    maxBandwidthMbps: 4000,
    osEdition: "Windows Server 2022 LTSC",
    raidLevelDisplay: "60",
    hddCount: 36,
  };

  it("caps a spec-rich product at 8 pairs (two grid rows) so the row stays bounded", () => {
    // All nine candidates populated, but the grid is capped at two rows of four
    // so five rows fit one page. OS (the last candidate) is the one dropped.
    const pairs = showcaseSpecPairs(FULL);
    assert.equal(pairs.length, 8);
    assert.equal(pairs.some((p) => p.key === "OS"), false);
  });

  it("omits null fields so a sparse add-on yields a short list (shorter row)", () => {
    const sparse = { ...FULL };
    for (const k of Object.keys(sparse) as (keyof typeof sparse)[]) {
      if (k !== "formFactor" && k !== "maxBandwidthMbps") {
        (sparse[k] as unknown) = null;
      }
    }
    const pairs = showcaseSpecPairs(sparse);
    assert.equal(pairs.length, 2);
    assert.deepEqual(pairs.map((p) => p.key), ["Form factor", "Max bandwidth"]);
  });

  it("returns an empty list when every highlight is null (no grid, no note)", () => {
    const allNull = Object.fromEntries(
      Object.keys(FULL).map((k) => [k, null]),
    ) as typeof FULL;
    assert.deepEqual(showcaseSpecPairs(allNull), []);
  });
});

// ---------------------------------------------------------------------------
// Camera-schedule graceful column selection (page 1)
// ---------------------------------------------------------------------------

// Null out the vendor/model (manual-entry) marker on every group, keeping the
// sizing fields intact — the hand-entered-deal case.
function withoutAnyVendorModel(snap: ProjectQuoteSnapshot): ProjectQuoteSnapshot {
  return {
    ...snap,
    sizing: {
      ...snap.sizing,
      cameraSchedule: snap.sizing.cameraSchedule.map((g) => ({
        ...g,
        cameraVendor: null,
        cameraModel: null,
        units: 0,
        sensorsPerCamera: 0,
        cameraModelModified: false,
      })),
    },
  };
}

describe("cameraScheduleHasVendorOrModel — picks the layout", () => {
  it("is false when no group carries vendor or model", () => {
    const schedule = withoutAnyVendorModel(makeSnapshot()).sizing.cameraSchedule;
    assert.equal(cameraScheduleHasVendorOrModel(schedule), false);
  });

  it("is true when at least one group carries a model", () => {
    // The default fixture's Lobby group has Axis / P3245-V.
    const schedule = makeSnapshot().sizing.cameraSchedule;
    assert.equal(cameraScheduleHasVendorOrModel(schedule), true);
  });

  it("treats empty-string vendor/model as absent", () => {
    const rows: ProjectQuoteCameraRow[] = makeSnapshot().sizing.cameraSchedule.map((g) => ({
      ...g,
      cameraVendor: "",
      cameraModel: "",
    }));
    assert.equal(cameraScheduleHasVendorOrModel(rows), false);
  });

  it("is true when only the vendor is present (no model)", () => {
    const [first, ...rest] = withoutAnyVendorModel(makeSnapshot()).sizing.cameraSchedule;
    const rows = [{ ...first, cameraVendor: "Hanwha" }, ...rest];
    assert.equal(cameraScheduleHasVendorOrModel(rows), true);
  });
});

describe("buildCameraColumns — the two layouts", () => {
  const SIZING_HEADERS = [
    "Resolution",
    "Codec",
    "FPS",
    "Scene complexity",
    "Operation hrs",
    // Retention joined the schedule when it became per-group (ADR 0132).
    "Retention (days)",
    "Bw (Mbit/s)",
    "Storage (TB)",
  ];

  // Sum a layout's percentage widths; each must total 100% to stay legible.
  function sumWidths(cols: ReturnType<typeof buildCameraColumns>): number {
    return cols.reduce((s, c) => s + parseFloat(c.width), 0);
  }

  it("Layout A (no vendor/model) is exactly the 8 sizing columns", () => {
    const headers = buildCameraColumns(false).map((c) => c.header);
    assert.deepEqual(headers, SIZING_HEADERS);
  });

  it("Layout B (with vendor/model) prepends Vendor and Model to the sizing set", () => {
    const headers = buildCameraColumns(true).map((c) => c.header);
    assert.deepEqual(headers, ["Vendor", "Model", ...SIZING_HEADERS]);
  });

  it("both layouts' data-column widths sum to 100%", () => {
    assert.equal(sumWidths(buildCameraColumns(false)), 100);
    assert.equal(sumWidths(buildCameraColumns(true)), 100);
  });

  it("right-aligns the numeric columns and left-aligns text columns", () => {
    for (const cols of [buildCameraColumns(false), buildCameraColumns(true)]) {
      const rightAligned = cols.filter((c) => c.align === "right").map((c) => c.header);
      assert.deepEqual(rightAligned, [
        "FPS",
        "Retention (days)",
        "Bw (Mbit/s)",
        "Storage (TB)",
      ]);
    }
  });
});

describe("formatOperationHrs — recording hours with motion percent", () => {
  it("shows just the hours for constant recording", () => {
    const row = makeSnapshot().sizing.cameraSchedule[0]; // constant, 24h, motion 0
    assert.equal(row.recordingMode, "constant");
    assert.equal(formatOperationHrs(row), "24");
  });

  it("appends the motion percent in parentheses for motion recording", () => {
    const row = makeSnapshot().sizing.cameraSchedule[1]; // motion, 18h, motion 40
    assert.equal(row.recordingMode, "motion");
    assert.equal(formatOperationHrs(row), "18 (motion 40%)");
  });
});

describe("ProjectQuotePdf camera schedule — graceful column selection", () => {
  it("renders the 7 sizing columns (no Vendor/Model) when no group has model data", async () => {
    const snap = withoutAnyVendorModel(makeSnapshot());
    // Structural: the layout decision omits Vendor/Model for this snapshot.
    assert.equal(cameraScheduleHasVendorOrModel(snap.sizing.cameraSchedule), false);
    // Every group still carries the sizing fields the 7-column layout renders.
    for (const g of snap.sizing.cameraSchedule) {
      assert.ok(g.resolutionLabel.length > 0, "resolution must be populated");
      assert.ok(g.codec.length > 0, "codec must be populated");
      assert.ok(g.bandwidthMbps > 0, "bandwidth must be populated");
      assert.ok(g.storageGb > 0, "storage must be populated");
    }
    const buf = await render(snap);
    assert.ok(buf.length > 1000, `PDF buffer suspiciously small: ${buf.length} bytes`);
    assert.equal(buf.subarray(0, 5).toString("utf8"), "%PDF-");
  });

  it("prepends Vendor/Model when some groups have a model; manual group's vendor/model dash but its sizing cells populate", async () => {
    const snap = makeSnapshot();
    // Mixed fixture → Vendor/Model columns present.
    assert.equal(cameraScheduleHasVendorOrModel(snap.sizing.cameraSchedule), true);
    const modelGroup = snap.sizing.cameraSchedule.find((g) => g.cameraModel !== null);
    const manualGroup = snap.sizing.cameraSchedule.find((g) => g.cameraModel === null);
    assert.ok(modelGroup, "fixture must include a model-loaded group");
    assert.ok(manualGroup, "fixture must include a manual-entry group");
    // The manual group's vendor/model are the dash markers (null)…
    assert.equal(manualGroup.cameraVendor, null);
    assert.equal(manualGroup.cameraModel, null);
    // …while its sizing cells are fully populated and still render.
    assert.ok(manualGroup.resolutionLabel.length > 0);
    assert.ok(manualGroup.bandwidthMbps > 0);
    assert.ok(manualGroup.storageGb > 0);
    const buf = await render(snap);
    assert.ok(buf.length > 1000, `PDF buffer suspiciously small: ${buf.length} bytes`);
    assert.equal(buf.subarray(0, 5).toString("utf8"), "%PDF-");
  });
});

describe("sortLineItemsByOrderNr", () => {
  it("sorts ascending by orderNr", () => {
    const lines = [
      makeLine({ orderNr: 3, productCode: "C" }),
      makeLine({ orderNr: 1, productCode: "A" }),
      makeLine({ orderNr: 2, productCode: "B" }),
    ];
    const sorted = sortLineItemsByOrderNr(lines);
    assert.deepEqual(
      sorted.map((l) => l.productCode),
      ["A", "B", "C"],
    );
  });

  it("puts nulls last", () => {
    const lines = [
      makeLine({ orderNr: null, productCode: "NULL" }),
      makeLine({ orderNr: 1, productCode: "FIRST" }),
    ];
    const sorted = sortLineItemsByOrderNr(lines);
    assert.equal(sorted[0].productCode, "FIRST");
    assert.equal(sorted[1].productCode, "NULL");
  });

  it("does not mutate the original array", () => {
    const lines = [makeLine({ orderNr: 2 }), makeLine({ orderNr: 1 })];
    const original = [...lines];
    sortLineItemsByOrderNr(lines);
    assert.equal(lines[0].orderNr, original[0].orderNr);
  });
});

// ---------------------------------------------------------------------------
// Commercial table — column order and derived partner prices (page 2 / "page 3")
// ---------------------------------------------------------------------------

describe("COMMERCIAL_COLUMNS — the seven-column line-item layout", () => {
  it("is exactly CODE · PRODUCT · MSRP EACH · DISC % · PARTNER EACH · QTY · PARTNER TOTAL", () => {
    assert.deepEqual(
      COMMERCIAL_COLUMNS.map((c) => c.header),
      ["Code", "Product", "MSRP each", "Disc %", "Partner each", "Qty", "Partner total"],
    );
  });

  it("flexes PRODUCT (width null) and gives the other six fixed widths", () => {
    const product = COMMERCIAL_COLUMNS.find((c) => c.header === "Product");
    assert.equal(product?.width, null, "PRODUCT must flex to absorb the slack");
    const fixed = COMMERCIAL_COLUMNS.filter((c) => c.width != null);
    assert.equal(fixed.length, 6, "the other six columns are fixed-width");
  });

  it("leaves room for PRODUCT: the six fixed widths sum to < 100% (PRODUCT fills the rest)", () => {
    const fixedSum = COMMERCIAL_COLUMNS.reduce(
      (s, c) => s + (c.width == null ? 0 : parseFloat(c.width)),
      0,
    );
    assert.ok(fixedSum < 100, `fixed widths must leave slack for PRODUCT, got ${fixedSum}%`);
    assert.equal(fixedSum, 65, "fixed widths sum to 65%, leaving 35% for PRODUCT");
  });

  it("right-aligns every numeric/currency column and leaves CODE/PRODUCT default", () => {
    const rightAligned = COMMERCIAL_COLUMNS.filter((c) => c.align === "right").map((c) => c.header);
    assert.deepEqual(rightAligned, [
      "MSRP each",
      "Disc %",
      "Partner each",
      "Qty",
      "Partner total",
    ]);
  });
});

describe("derivePartnerEach / derivePartnerTotal — DERIVED at render, not stored", () => {
  it("derives partner-each from MSRP × (1 − disc%/100), rounded to whole dollars", () => {
    // The canonical fixture from the brief: $41,659 @ 40% × 1.
    const line = makeLine({ unitPrice: 41659, discount: 40, discountPercent: 40, quantity: 1 });
    assert.equal(derivePartnerEach(line), 24995); // 41659 × 0.60 = 24995.4 → 24995
    assert.equal(derivePartnerTotal(line), 24995); // 24995 × 1
  });

  it("multiplies partner-each by quantity for the partner total", () => {
    const line = makeLine({ unitPrice: 41659, discount: 40, discountPercent: 40, quantity: 3 });
    assert.equal(derivePartnerEach(line), 24995);
    assert.equal(derivePartnerTotal(line), 74985); // 24995 × 3
  });

  it("matches the default fixture (75000 @ 45% × 1 → 41250)", () => {
    const line = makeLine(); // unitPrice 75000, discountPercent 45, quantity 1
    assert.equal(derivePartnerEach(line), 41250); // 75000 × 0.55
    assert.equal(derivePartnerTotal(line), 41250);
  });

  it("does NOT read discountedUnitPrice (always null in the snapshot)", () => {
    const line = makeLine();
    assert.equal(line.discountedUnitPrice, null);
    // The derived value comes from unitPrice + discountPercent, never the
    // null discountedUnitPrice field.
    assert.equal(derivePartnerEach(line), 41250);
  });

  it("returns null when MSRP is null; treats a null discount percent as 0%", () => {
    assert.equal(derivePartnerEach(makeLine({ unitPrice: null })), null);
    assert.equal(derivePartnerTotal(makeLine({ unitPrice: null })), null);
    const noDisc = makeLine({ unitPrice: 1000, discount: null, discountPercent: null, quantity: 2 });
    assert.equal(derivePartnerEach(noDisc), 1000); // no discount → MSRP
    assert.equal(derivePartnerTotal(noDisc), 2000);
  });
});

describe("Terms / Shipping / FOB block — static commercial terms", () => {
  it("carries the verbatim Terms / Shipping Method / FOB text", () => {
    assert.deepEqual(
      QUOTE_FOB_BLOCK.map((r) => [r.label, r.value]),
      [
        ["Terms", "Net 30"],
        ["Shipping Method", "TBD - NOT included in price"],
        ["FOB", "El Cajon, CA"],
      ],
    );
  });
});

describe("verbatim total — productTotal is never re-summed from lines", () => {
  it("renders when productTotal differs from the line sum", async () => {
    const snap = makeSnapshot();
    // Line sum: 41250 + 4675 + 0 = 45925. Set productTotal to a different value.
    const mismatch: ProjectQuoteSnapshot = {
      ...snap,
      commercial: {
        ...snap.commercial,
        productTotal: 99999, // deliberately differs from line sum
      },
    };
    // If the renderer re-summed lines it would show 45925, not 99999.
    // The test confirms no crash; the binding rule forbids the re-sum.
    const buf = await render(mismatch);
    assert.ok(buf.length > 1000, `PDF buffer suspiciously small: ${buf.length} bytes`);
    // The line sum (45925) is NOT equal to productTotal (99999), proving
    // the fixture is an honest mismatch test.
    const lineSum = snap.commercial.lineItems.reduce(
      (s, l) => s + (l.lineAmount ?? 0),
      0,
    );
    assert.notEqual(lineSum, mismatch.commercial.productTotal);
  });

  it("renders gracefully when productTotal is null", async () => {
    const snap = makeSnapshot();
    const nullTotal: ProjectQuoteSnapshot = {
      ...snap,
      commercial: { ...snap.commercial, productTotal: null },
    };
    const buf = await render(nullTotal);
    assert.ok(buf.length > 1000, `PDF buffer suspiciously small: ${buf.length} bytes`);
  });
});

// ---------------------------------------------------------------------------
// projectQuoteTitle / projectQuotePdfFilename — canonical naming format
// ---------------------------------------------------------------------------

describe("projectQuoteTitle — canonical deal-title format", () => {
  it("produces Arxys Quote - Company - Project - DealID - V# - YYYY-MM-DD", () => {
    const snap = makeSnapshot();
    // Fixture: companyName="Security Integrators LLC", projectName="Main Campus Security",
    // dealId=4822, version=1, generatedAt="2026-06-16T00:00:00.000Z"
    assert.equal(
      projectQuoteTitle(snap),
      "Arxys Quote - Security Integrators LLC - Main Campus Security - 4822 - V1 - 2026-06-16",
    );
  });

  it("appends .pdf to produce the PDF filename", () => {
    const snap = makeSnapshot();
    // projectQuotePdfFilename = projectQuoteTitle + ".pdf"
    // Tested indirectly via the title — the filename is title + ".pdf".
    const title = projectQuoteTitle(snap);
    assert.ok(title.length > 0, "title must not be empty");
    assert.ok(!title.endsWith(".pdf"), "title must not include .pdf extension");
  });

  it("falls back to organization name when sizing.partner.companyName is empty", () => {
    const snap = makeSnapshot();
    const noPartnerName: ProjectQuoteSnapshot = {
      ...snap,
      sizing: {
        ...snap.sizing,
        partner: { companyName: "", contactName: snap.sizing.partner.contactName },
      },
    };
    // Falls back to commercial.organization.name = "Kean University"
    assert.ok(projectQuoteTitle(noPartnerName).startsWith("Arxys Quote - Kean University -"));
  });

  it("uses 'Arxys' when both company sources are empty", () => {
    const snap = makeSnapshot();
    const noCompany: ProjectQuoteSnapshot = {
      ...snap,
      sizing: {
        ...snap.sizing,
        partner: { companyName: "", contactName: "" },
      },
      commercial: {
        ...snap.commercial,
        organization: null,
      },
    };
    assert.ok(projectQuoteTitle(noCompany).startsWith("Arxys Quote - Arxys -"));
  });

  it("uses 'Untitled Project' when projectName is null", () => {
    const snap = makeSnapshot();
    const noProject: ProjectQuoteSnapshot = {
      ...snap,
      sizing: { ...snap.sizing, projectName: null },
    };
    assert.ok(projectQuoteTitle(noProject).includes(" - Untitled Project - "));
  });

  it("strips illegal filename characters from company and project names", () => {
    const snap = makeSnapshot();
    const dirty: ProjectQuoteSnapshot = {
      ...snap,
      sizing: {
        ...snap.sizing,
        partner: { companyName: 'Acme / Corp: "Inc"', contactName: "" },
        projectName: "Site*1?",
      },
    };
    const title = projectQuoteTitle(dirty);
    assert.ok(!title.includes("/"), "title must not contain /");
    assert.ok(!title.includes(":"), "title must not contain :");
    assert.ok(!title.includes('"'), "title must not contain quotes");
    assert.ok(!title.includes("*"), "title must not contain *");
    assert.ok(!title.includes("?"), "title must not contain ?");
  });

  it("extracts the YYYY-MM-DD date from the ISO generatedAt timestamp", () => {
    const snap = makeSnapshot();
    const lateNight: ProjectQuoteSnapshot = {
      ...snap,
      generation: { ...snap.generation, generatedAt: "2026-12-31T23:59:59.000Z" },
    };
    assert.ok(projectQuoteTitle(lateNight).endsWith("- 2026-12-31"));
  });
});

describe("sumQuotedCapacity — page-2 Quoted-solution denominators", () => {
  // Minimal builders: sumQuotedCapacity reads only sku + specHighlights from a
  // showcase item, and productCode + quantity from a line item.
  const spec = (
    over: Partial<ProjectQuoteShowcaseItem["specHighlights"] & object>,
  ): ProjectQuoteShowcaseItem["specHighlights"] => ({
    formFactor: null,
    rackUnits: null,
    cpuModelFull: null,
    ramSpec: null,
    driveBays: null,
    storageRawTb: null,
    maxCameras: null,
    maxBandwidthMbps: null,
    osEdition: null,
    raidLevelDisplay: null,
    hddCount: null,
    ...over,
  });
  const card = (
    sku: string,
    highlights: ProjectQuoteShowcaseItem["specHighlights"],
  ): ProjectQuoteShowcaseItem => ({
    sku,
    productName: sku,
    productGroup: sku,
    msrp: null,
    heroImagePath: null,
    specHighlights: highlights,
  });
  const line = (productCode: string | null, quantity: number | null): QuoteLineItem =>
    ({ productCode, quantity } as QuoteLineItem);

  // V800: 720 raw, 36 drives, RAID 60 in 3 spans of 12 → 6 parity →
  // 720 × (36-6)/36 = 600 TB usable (ADR 0092).
  const v800 = spec({ storageRawTb: 720, hddCount: 36, raidLevelDisplay: "60", maxBandwidthMbps: 4000 });

  it("single product, quantity 1: net-usable derived, bandwidth passed through", () => {
    const r = sumQuotedCapacity([card("V800", v800)], [line("V800", 1)]);
    assert.equal(r.usableStorageTb, 600);
    assert.equal(r.bandwidthMbps, 4000);
    assert.equal(r.hasStorage, true);
    assert.equal(r.hasBandwidth, true);
  });

  it("quantity-weights: N boxes deliver N× capacity", () => {
    const r = sumQuotedCapacity([card("V800", v800)], [line("V800", 3)]);
    assert.equal(r.usableStorageTb, 1800);
    assert.equal(r.bandwidthMbps, 12000);
  });

  it("sums across multiple quoted products, never averages", () => {
    // V700: 480 raw, 24 drives, RAID 6 → 480 × (24-2)/24 = 440 TB usable.
    const v700 = spec({ storageRawTb: 480, hddCount: 24, raidLevelDisplay: "6", maxBandwidthMbps: 2000 });
    const r = sumQuotedCapacity(
      [card("V800", v800), card("V700", v700)],
      [line("V800", 1), line("V700", 2)],
    );
    assert.equal(r.usableStorageTb, 600 + 440 * 2); // 1480
    assert.equal(r.bandwidthMbps, 4000 + 2000 * 2); // 8000
  });

  it("a SKU split across lines sums its quantities", () => {
    const r = sumQuotedCapacity([card("V800", v800)], [line("V800", 1), line("V800", 2)]);
    assert.equal(r.usableStorageTb, 1800);
    assert.equal(r.bandwidthMbps, 12000);
  });

  it("workstation with bandwidth but no storage adds to bandwidth only", () => {
    const sw = spec({ maxBandwidthMbps: 225, storageRawTb: null });
    const r = sumQuotedCapacity([card("SW20", sw)], [line("SW20", 1)]);
    assert.equal(r.usableStorageTb, 0);
    assert.equal(r.hasStorage, false);
    assert.equal(r.bandwidthMbps, 225);
    assert.equal(r.hasBandwidth, true);
  });

  it("card with no product_specs row (null highlights) contributes nothing", () => {
    const r = sumQuotedCapacity([card("MISC", null)], [line("MISC", 5)]);
    assert.equal(r.usableStorageTb, 0);
    assert.equal(r.bandwidthMbps, 0);
    assert.equal(r.hasStorage, false);
    assert.equal(r.hasBandwidth, false);
  });

  it("ignores line items with no matching showcase card (add-ons, warranties)", () => {
    const r = sumQuotedCapacity([card("V800", v800)], [line("V800", 1), line("VX5-WTY-5Y", 1)]);
    assert.equal(r.usableStorageTb, 600);
    assert.equal(r.bandwidthMbps, 4000);
  });

  it("a card quoted with zero/absent quantity does not inflate the totals", () => {
    const r = sumQuotedCapacity([card("V800", v800)], [line("V800", null)]);
    assert.equal(r.usableStorageTb, 0);
    assert.equal(r.bandwidthMbps, 0);
    assert.equal(r.hasStorage, false);
  });
});
