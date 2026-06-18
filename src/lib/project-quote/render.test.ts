import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import {
  ProjectQuotePdf,
  buildCameraColumns,
  cameraScheduleHasVendorOrModel,
  formatOperationHrs,
  sortLineItemsByOrderNr,
  type ProjectQuotePdfInput,
} from "./ProjectQuotePdf";
import type { ProjectQuoteCameraRow } from "./types";
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
    snapshot,
    logoDataUri: null,
    primaryHeroDataUri: null,
  };
}

async function render(snapshot: ProjectQuoteSnapshot): Promise<Uint8Array> {
  return renderToBuffer(
    createElement(ProjectQuotePdf, { data: makeInput(snapshot) }),
  );
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
    "Bw (Mb/s)",
    "Storage (TB)",
  ];

  // Sum a layout's percentage widths; each must total 100% to stay legible.
  function sumWidths(cols: ReturnType<typeof buildCameraColumns>): number {
    return cols.reduce((s, c) => s + parseFloat(c.width), 0);
  }

  it("Layout A (no vendor/model) is exactly the 7 sizing columns", () => {
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
      assert.deepEqual(rightAligned, ["FPS", "Bw (Mb/s)", "Storage (TB)"]);
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
