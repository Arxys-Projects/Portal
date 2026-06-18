import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { DealQuote, GetDealForQuoteResult, QuoteLineItem } from "@/lib/pipedrive/quote";
import {
  buildProjectQuoteSnapshot,
  buildSizingFromSubmission,
  composeQuoteIdentifier,
  computeNextVersion,
  resolveHeroImagePath,
  usableCapacityTb,
  type SizingProductSpecRow,
  type SizingSubmissionRow,
} from "./snapshot";
import {
  getProjectQuoteTerms,
  projectQuoteTermsSha256,
  PROJECT_QUOTE_TERMS_VERSION,
} from "./terms";
import {
  PROJECT_QUOTE_SNAPSHOT_VERSION,
  type ProjectQuoteSizing,
} from "./types";

// ---------------------------------------------------------------------------
// Fixtures. Clearly-fake data modeled on the real deal 4822 shapes captured in
// quote.test.ts (a priced V800 server line, a V255 management line, a $0
// info-only warranty line, a priced [MKT] custom line). No real PII.
// ---------------------------------------------------------------------------

// The exact QuoteLineItem key set, so a test can prove the snapshot stores raw
// commercial data with no derived field (for example partner-price-each) added.
const QUOTE_LINE_KEYS = [
  "productId",
  "productCode",
  "productName",
  "unitPrice",
  "discount",
  "discountType",
  "discountPercent",
  "discountedUnitPrice",
  "quantity",
  "lineAmount",
  "currency",
  "orderNr",
  "isInfoOnly",
].sort();

function makeLine(partial: Partial<QuoteLineItem> & { productId: number }): QuoteLineItem {
  return {
    productCode: null,
    productName: null,
    unitPrice: null,
    discount: null,
    discountType: null,
    discountPercent: null,
    discountedUnitPrice: null,
    quantity: null,
    lineAmount: null,
    currency: "USD",
    orderNr: null,
    isInfoOnly: false,
    ...partial,
  };
}

function makeDeal(lineItems: QuoteLineItem[], overrides: Partial<DealQuote> = {}): DealQuote {
  return {
    dealId: 4822,
    dealTitle: "Acme Test Project",
    updatedAt: "2026-06-10T00:00:00Z",
    owner: "Rep Example",
    organization: { name: "Acme Co", address: "1 Test St" },
    person: { name: "Pat Buyer", email: "pat@example.test", phone: "555-0100" },
    lineItems,
    // Deliberately not equal to any line sum: the snapshot stores it verbatim.
    productTotal: 999999.99,
    additionalDiscounts: null,
    currency: "USD",
    isEmpty: lineItems.length === 0,
    ...overrides,
  };
}

function makeSpecRow(over: Partial<NonNullable<SizingProductSpecRow>> = {}): NonNullable<SizingProductSpecRow> {
  return {
    model_name: "VideoX V800 720TB 4U 36Bay",
    form_factor: "4U Rackmount",
    rack_units: "4U",
    storage_raw_tb: 720,
    max_cameras: 800,
    max_bandwidth_mbps: 6000,
    drive_bays: 36,
    cpu_model_full: "AMD EPYC 9005 3.3Ghz 16/32 Core",
    ram_spec: "64GB ECC DDR5",
    os_edition: "Windows Server 2022 OR 2025 LTSC",
    hdd_count: 36,
    raid_level_display: "6",
    msrp: 74048,
    ...over,
  };
}

function makeSubmissionRow(over: Partial<SizingSubmissionRow> = {}): SizingSubmissionRow {
  return {
    id: "sub-1",
    project_name: "Acme Test Project",
    vms: "Milestone",
    retention_days: 30,
    cameras_count: 12,
    bandwidth_mbps: 240.5,
    storage_tb: 96.25,
    recommended_product_id: "VX5-V800-720",
    recommended_units: 1,
    groups_payload: {
      groups: [
        {
          name: "Lobby",
          cameras: 2,
          // Resolved labels banked by actions.ts. The builder must freeze these
          // verbatim and never read an index.
          resolutionLabel: "4MP (2560×1440)",
          codec: "h265",
          complexity: "high",
          complexityLabel: "High detail, low motion",
          recordingMode: "motion",
          fps: 15,
          recordingPercent: 50,
          motionPercent: 40,
          cameraVendor: "Axis",
          cameraModel: "P3265-LV",
          units: 2,
          sensorsPerCamera: 1,
          cameraModelModified: false,
          computed: { bandwidthMbps: 40.1, storageGb: 4096 },
        },
      ],
    },
    ...over,
  };
}

function makeSizing(): ProjectQuoteSizing {
  return buildSizingFromSubmission({
    submission: makeSubmissionRow(),
    partner: { company_name: "Reseller Inc", contact_name: "Sam Channel" },
    product: {
      product_group: "V800",
      product_name: "VideoX V800 720TB",
      max_cameras: 800,
      max_storage_tb: 720,
    },
    productSpec: makeSpecRow(),
  });
}

// ---------------------------------------------------------------------------

describe("computeNextVersion", () => {
  it("starts at 1 when none exist and increments otherwise", () => {
    assert.equal(computeNextVersion(null), 1);
    assert.equal(computeNextVersion(0), 1);
    assert.equal(computeNextVersion(2), 3);
    assert.equal(computeNextVersion(41), 42);
  });
});

describe("composeQuoteIdentifier", () => {
  it("composes DealID-V#-date from the UTC date of generatedAt", () => {
    assert.equal(composeQuoteIdentifier(4822, 3, new Date("2026-06-16T12:00:00Z")), "4822-V3-2026-06-16");
  });
});

describe("usableCapacityTb", () => {
  it("applies RAID parity overhead and falls back safely", () => {
    assert.equal(usableCapacityTb(720, 36, "6"), (720 * 34) / 36); // RAID 6 -> 2 parity
    assert.equal(usableCapacityTb(720, 36, "60"), (720 * 32) / 36); // RAID 60 -> 4 parity
    assert.equal(usableCapacityTb(100, null, null), 100); // unknown drive count -> raw
    assert.equal(usableCapacityTb(null, 12, "5"), null);
  });
});

describe("resolveHeroImagePath", () => {
  it("resolves a /public hero path for a known family and null otherwise", () => {
    const v800 = resolveHeroImagePath("V800");
    assert.ok(v800 && v800.startsWith("/price-book/"), `expected a hero path, got ${String(v800)}`);
    assert.equal(resolveHeroImagePath("NOPE"), null);
    assert.equal(resolveHeroImagePath(null), null);
  });
});

describe("buildSizingFromSubmission", () => {
  it("freezes resolved labels (not indices) and the Phase 10 camera fields", () => {
    const sizing = makeSizing();
    assert.equal(sizing.cameraSchedule.length, 1);
    const row = sizing.cameraSchedule[0];
    assert.equal(row.resolutionLabel, "4MP (2560×1440)"); // banked label, frozen verbatim
    assert.equal(row.codec, "h265");
    assert.equal(row.complexityLabel, "High detail, low motion");
    assert.equal(row.recordingMode, "motion");
    assert.equal(row.hoursPerDay, 12); // 50% of 24
    assert.equal(row.cameraVendor, "Axis");
    assert.equal(row.cameraModel, "P3265-LV");
    assert.equal(row.units, 2);
    assert.equal(row.sensorsPerCamera, 1);
    assert.equal(row.cameras, 2);
    // No lookup index is present on the frozen row.
    assert.equal("resolutionIdx" in row, false);
  });

  it("freezes totals, the resolved server spec, hero path, and reseller block", () => {
    const sizing = makeSizing();
    assert.equal(sizing.vms, "Milestone");
    assert.equal(sizing.retentionDays, 30);
    assert.equal(sizing.totals.cameras, 12);
    assert.equal(sizing.storageTb, 96.25);
    assert.equal(sizing.serverSpec?.sku, "VX5-V800-720");
    assert.equal(sizing.serverSpec?.modelName, "VideoX V800");
    assert.equal(sizing.serverSpec?.usablePerUnitTb, (720 * 34) / 36);
    assert.ok(sizing.primaryServerHeroImagePath?.startsWith("/price-book/"));
    assert.equal(sizing.partner.companyName, "Reseller Inc");
    assert.equal(sizing.partner.contactName, "Sam Channel");
  });

  it("tolerates a missing product spec (legacy / unresolved) without throwing", () => {
    const sizing = buildSizingFromSubmission({
      submission: makeSubmissionRow({ recommended_product_id: "VX5-V800-720" }),
      partner: null,
      product: null,
      productSpec: null,
    });
    assert.equal(sizing.serverSpec, null);
    assert.equal(sizing.partner.companyName, "(unknown)");
    assert.equal(sizing.recommendation.modelCode, "(unknown)");
  });
});

describe("buildProjectQuoteSnapshot", () => {
  const sizing = makeSizing();
  const deal = makeDeal([
    makeLine({ productId: 101, productCode: "VX5-V800-720", unitPrice: 74048, discount: 45, discountType: "percentage", discountPercent: 45, quantity: 6, lineAmount: 244358.4 }),
  ]);
  const terms = getProjectQuoteTerms();

  function buildOk(maxVersion: number | null) {
    return buildProjectQuoteSnapshot({
      submissionId: "sub-1",
      dealResult: { ok: true, deal },
      sizing,
      terms,
      existingMaxVersion: maxVersion,
      generatedAt: new Date("2026-06-16T12:00:00Z"),
      generatedByUserId: "user-internal-1",
      validityDays: 7,
    });
  }

  it("assembles a full row from a normal deal + submission", () => {
    const res = buildOk(2);
    assert.equal(res.ok, true);
    if (!res.ok) return;
    const { row } = res;
    assert.equal(row.submission_id, "sub-1");
    assert.equal(row.pipedrive_deal_id, 4822);
    assert.equal(row.snapshot.snapshotVersion, PROJECT_QUOTE_SNAPSHOT_VERSION);
    assert.equal(row.snapshot.generation.identifier, "4822-V3-2026-06-16");
    assert.equal(row.snapshot.generation.generatedAt, "2026-06-16T12:00:00.000Z");
    assert.equal(row.snapshot.generation.generatedByUserId, "user-internal-1");
    assert.equal(row.generated_at, "2026-06-16T12:00:00.000Z");
    assert.equal(row.validity_days, 7);
    assert.equal(row.generated_by, "user-internal-1");
    assert.equal(row.snapshot.sizing.vms, "Milestone");
  });

  it("increments version as max+1 (and starts at 1 with no prior rows)", () => {
    const a = buildOk(2);
    const b = buildOk(null);
    assert.equal(a.ok && a.row.version, 3);
    assert.equal(b.ok && b.row.version, 1);
  });

  it("stores the commercial data verbatim with no derived price added", () => {
    const res = buildOk(0);
    assert.ok(res.ok);
    if (!res.ok) return;
    const c = res.row.snapshot.commercial;
    // Verbatim: the stored deal deep-equals the raw DealQuote, productTotal and
    // all included.
    assert.deepEqual(c, deal);
    assert.equal(c.productTotal, 999999.99); // verbatim, not a line sum
    const line = c.lineItems[0];
    // Exactly the raw QuoteLineItem keys: no partner-price-each or any other
    // derived numeric was added.
    assert.deepEqual(Object.keys(line).sort(), QUOTE_LINE_KEYS);
    assert.equal("partnerPriceEach" in line, false);
    assert.equal(line.discountedUnitPrice, null); // never derived
  });

  it("freezes the in-force terms (version + full text + hash)", () => {
    const res = buildOk(0);
    assert.ok(res.ok);
    if (!res.ok) return;
    assert.equal(res.row.terms_version, terms.version);
    assert.equal(res.row.snapshot.terms.version, terms.version);
    assert.ok(res.row.snapshot.terms.text.length > 0);
    assert.equal(res.row.snapshot.terms.sha256, projectQuoteTermsSha256(res.row.snapshot.terms.text));
  });

  it("surfaces an empty deal as a typed result, not a throw", () => {
    const res = buildProjectQuoteSnapshot({
      submissionId: "sub-1",
      dealResult: { ok: true, deal: makeDeal([]) },
      sizing,
      terms,
      existingMaxVersion: null,
      generatedAt: new Date("2026-06-16T12:00:00Z"),
      generatedByUserId: "user-internal-1",
      validityDays: 7,
    });
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.reason, "empty_deal");
  });

  it("surfaces a deal-read error as a typed result, not a throw", () => {
    const dealResult: GetDealForQuoteResult = { ok: false, error: { kind: "not_found", status: 404, message: "no deal" } };
    const res = buildProjectQuoteSnapshot({
      submissionId: "sub-1",
      dealResult,
      sizing,
      terms,
      existingMaxVersion: null,
      generatedAt: new Date("2026-06-16T12:00:00Z"),
      generatedByUserId: "user-internal-1",
      validityDays: 7,
    });
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.reason, "deal_read_error");
    assert.equal(res.error.kind, "not_found");
  });
});

describe("getProjectQuoteTerms", () => {
  it("returns a version, non-empty text, and a stable sha256", () => {
    const t = getProjectQuoteTerms();
    assert.equal(t.version, PROJECT_QUOTE_TERMS_VERSION);
    assert.ok(t.text.length > 0);
    assert.match(t.sha256, /^[0-9a-f]{64}$/);
    assert.equal(t.sha256, projectQuoteTermsSha256(t.text)); // deterministic
  });

  it("carries the approved Arxys terms (not the retired placeholder)", () => {
    const t = getProjectQuoteTerms();
    // Anchors from the approved 2026-06-18 copy: the header, a numbered clause,
    // the Windows/VMS addendum, and the purchase-terms URL.
    assert.match(t.text, /^Arxys Terms and Conditions\./);
    assert.match(t.text, /title of all goods until full payment/);
    assert.match(t.text, /A Microsoft Windows license is included/);
    assert.match(t.text, /www\.arxys\.com\/purchaseterms/);
  });
});
