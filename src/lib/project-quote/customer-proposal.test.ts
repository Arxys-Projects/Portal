import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { type DocumentProps, Page, renderToBuffer } from "@react-pdf/renderer";
import {
  ProjectQuotePdf,
  CUSTOMER_PROPOSAL_COLUMNS,
  type ProjectQuotePdfInput,
} from "./ProjectQuotePdf";
import { assembleCustomerProposalCommercial } from "./customer-proposal";
import type { DealQuote } from "@/lib/pipedrive/quote";
import type { ProjectQuoteSnapshot } from "./types";

// ===========================================================================
// ADR 0089 — Customer Proposal tests, incl. the REQUIRED build-failing
// discount-leak guard.
//
// The fixture is built so every partner/discount value is numerically DISTINCT
// from every MSRP value the Customer Proposal legitimately shows, so an
// absence-assertion cannot false-pass on a coincidental match:
//
//   Line 1: MSRP 75,000 × 1, 40% disc → partner each/total 45,000 (lineAmount 45,000)
//   Line 2: MSRP 10,000 × 2, 25% disc → partner each 7,500, partner total 15,000
//   MSRP grand total (Customer Proposal)     = 75,000 + 20,000 = 95,000
//   Partner/deal grand total (productTotal)  = 45,000 + 15,000 = 60,000
//
//   ALLOWED (may appear):   75,000 · 10,000 · 20,000 · 95,000 · qty 1 · qty 2
//   FORBIDDEN (must not):   40% · 25% · 45,000 · 7,500 · 15,000 · 60,000
// ===========================================================================

const FORBIDDEN_NUMBERS = [40, 25, 45000, 7500, 15000, 60000];
const FORBIDDEN_FORMATTED = ["40%", "25%", "45,000", "7,500", "15,000", "60,000"];
const FORBIDDEN_KEYS = [
  "discount",
  "discountPercent",
  "discountType",
  "discountedUnitPrice",
  "lineAmount",
  "additionalDiscounts",
  "dealTitle",
  "unitPrice",
];

function makeCommercial(overrides: Partial<DealQuote> = {}): DealQuote {
  return {
    dealId: 4822,
    dealTitle: "Kean University Security Upgrade — 40% partner disc",
    updatedAt: "2026-06-15T12:00:00Z",
    owner: "Internal User",
    organization: { name: "Kean University", address: "1000 Morris Ave, Union, NJ" },
    person: { name: "Jane Smith", email: "jane@kean.edu", phone: null },
    lineItems: [
      {
        productId: 1,
        productCode: "VX5-V800-720",
        productName: "VideoX V800 720TB 4U 36Bay",
        unitPrice: 75000,
        discount: 40,
        discountType: "percentage",
        discountPercent: 40,
        discountedUnitPrice: null,
        quantity: 1,
        lineAmount: 45000,
        currency: "USD",
        orderNr: 1,
        isInfoOnly: false,
      },
      {
        productId: 2,
        productCode: "VX5-V255-MGM",
        productName: "VideoX V255 Management Node",
        unitPrice: 10000,
        discount: 25,
        discountType: "percentage",
        discountPercent: 25,
        discountedUnitPrice: null,
        quantity: 2,
        lineAmount: 15000,
        currency: "USD",
        orderNr: 2,
        isInfoOnly: false,
      },
    ],
    productTotal: 60000,
    additionalDiscounts: null,
    currency: "USD",
    isEmpty: false,
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<ProjectQuoteSnapshot> = {}): ProjectQuoteSnapshot {
  return {
    snapshotVersion: 1,
    commercial: makeCommercial(),
    sizing: {
      projectName: "Main Campus Security",
      vms: "Milestone XProtect",
      retentionDays: 30,
      totals: { cameras: 120, bandwidthMbps: 432.5, storageGb: 80500 },
      storageTb: 80.5,
      bandwidthMbps: 432.5,
      cameraSchedule: [
        {
          name: "Lobby",
          cameras: 40,
          resolutionLabel: "4MP (2560x1440)",
          codec: "H.265",
          fps: 15,
          complexityLabel: "Medium detail",
          recordingMode: "constant",
          hoursPerDay: 24,
          motionPercent: 0,
          bandwidthMbps: 144.5,
          storageGb: 26500,
          cameraVendor: null,
          cameraModel: null,
          units: 40,
          sensorsPerCamera: 1,
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
        cpuModelFull: "AMD EPYC 9005",
        ramSpec: "32GB ECC DDR5",
        osEdition: "Windows Server 2022 LTSC Standard",
        warranty: "5yr NBD, Advanced Replacement",
        msrp: 75000,
        usablePerUnitTb: 600,
      },
      primaryServerHeroImagePath: null,
      partner: { companyName: "Security Integrators LLC", contactName: "Bob Integrator" },
    },
    showcase: [
      {
        sku: "VX5-V800-720",
        productName: "VideoX V800 720TB 4U 36Bay",
        productGroup: "V800",
        msrp: 75000,
        heroImagePath: null,
        specHighlights: {
          formFactor: "4U Rackmount",
          rackUnits: "4U",
          cpuModelFull: "AMD EPYC 9005",
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
      text: "These are the Terms and Conditions for this project quote. Prices subject to written acceptance.",
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

// Mirror render.ts's shared input construction (render.ts is server-only and
// throws under tsx --test, so we build the input directly).
function sharedData(snapshot: ProjectQuoteSnapshot) {
  const showcase = snapshot.showcase ?? [];
  return {
    sizing: snapshot.sizing,
    showcase,
    terms: snapshot.terms,
    generation: snapshot.generation,
    logoDataUri: null,
    partnerLogoDataUri: null,
    showcaseHeroDataUris: showcase.map(() => null),
  };
}

function makeCustomerInput(snapshot: ProjectQuoteSnapshot): ProjectQuotePdfInput {
  return {
    ...sharedData(snapshot),
    variant: "customer-proposal",
    commercial: assembleCustomerProposalCommercial(snapshot.commercial),
  };
}

function makeProjectInput(snapshot: ProjectQuoteSnapshot): ProjectQuotePdfInput {
  return {
    ...sharedData(snapshot),
    variant: "project-quote",
    commercial: snapshot.commercial,
  };
}

function toElement(input: ProjectQuotePdfInput): ReactElement<DocumentProps> {
  return createElement(ProjectQuotePdf, { data: input }) as unknown as ReactElement<DocumentProps>;
}

// The renderer subsets font glyphs, so the emitted PDF's text layer cannot be
// grepped (see render.test.ts). The faithful place to scan "what renders" is the
// React element tree the component returns: every drawn string is a string child
// of a <Text>, and any money/discount value the renderer received shows up here.
// If a value is not in this tree it cannot be drawn, so this IS the rendered
// text-layer check — just read before glyph subsetting.
function collectElementText(node: unknown, out: string[]): void {
  if (node == null || typeof node === "boolean") return;
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return;
  }
  if (Array.isArray(node)) {
    for (const n of node) collectElementText(n, out);
    return;
  }
  if (typeof node === "object") {
    const el = node as { type?: unknown; props?: { children?: unknown } };
    // react-pdf primitives (Document/Page/View/Text/Image) have a STRING type;
    // our sub-components (PageHeader, the commercial bodies, CapacityBar…) have a
    // FUNCTION type. Invoke functions to expand their subtree (all are plain,
    // hook-free components), so text nested inside them is collected too.
    if (typeof el.type === "function") {
      const fn = el.type as (props: unknown) => unknown;
      collectElementText(fn(el.props ?? {}), out);
      return;
    }
    if (el.props && "children" in el.props) collectElementText(el.props.children, out);
  }
}

// All rendered strings for an input, joined. Invokes the component as a plain
// function (same as countPages) and walks its <Document> tree.
function renderedText(input: ProjectQuotePdfInput): string {
  const doc = ProjectQuotePdf({ data: input });
  const out: string[] = [];
  collectElementText(doc, out);
  return out.join("\n");
}

// The <Document title> — this string becomes the PDF metadata title.
function documentTitle(input: ProjectQuotePdfInput): string {
  const doc = ProjectQuotePdf({ data: input }) as { props?: { title?: string } };
  return doc.props?.title ?? "";
}

function squash(s: string): string {
  return s.replace(/\s+/g, "");
}

// Recursively gather every number, string, and key name in an object graph.
function gather(
  v: unknown,
  nums: Set<number>,
  strs: string[],
  keys: Set<string>,
): void {
  if (v === null || v === undefined) return;
  if (typeof v === "number") {
    nums.add(v);
    return;
  }
  if (typeof v === "string") {
    strs.push(v);
    return;
  }
  if (Array.isArray(v)) {
    for (const x of v) gather(x, nums, strs, keys);
    return;
  }
  if (typeof v === "object") {
    for (const [k, val] of Object.entries(v)) {
      keys.add(k);
      gather(val, nums, strs, keys);
    }
  }
}

// ---------------------------------------------------------------------------
// Assembler strip — the primary, airtight guarantee (ADR 0089 §2)
// ---------------------------------------------------------------------------

describe("assembleCustomerProposalCommercial strips partner/discount data", () => {
  it("physically removes every partner/discount VALUE from the object graph", () => {
    const view = assembleCustomerProposalCommercial(makeCommercial());
    const nums = new Set<number>();
    const strs: string[] = [];
    const keys = new Set<string>();
    gather(view, nums, strs, keys);

    for (const n of FORBIDDEN_NUMBERS) {
      assert.ok(!nums.has(n), `forbidden partner/discount value ${n} leaked into the assembled view`);
    }
    // Allowed MSRP values are present (sanity: the strip did not blank everything).
    assert.ok(nums.has(75000) && nums.has(10000) && nums.has(95000), "MSRP values must survive the strip");
  });

  it("physically removes every partner/discount KEY", () => {
    const view = assembleCustomerProposalCommercial(makeCommercial());
    const keys = new Set<string>();
    gather(view, new Set<number>(), [], keys);
    for (const k of FORBIDDEN_KEYS) {
      assert.ok(!keys.has(k), `forbidden key "${k}" is present on the assembled view`);
    }
  });

  it("recomputes the grand total as the MSRP line-total sum, NOT the partner total", () => {
    const view = assembleCustomerProposalCommercial(makeCommercial());
    assert.equal(view.grandTotal, 95000, "grand total must be the sum of MSRP line totals");
    assert.notEqual(view.grandTotal, 60000, "grand total must NOT be the inherited partner total");
    assert.equal(view.lineItems[0]?.productTotal, 75000);
    assert.equal(view.lineItems[1]?.productTotal, 20000);
  });

  it("PRICE EACH tracks the frozen snapshot unitPrice (MSRP freeze — Task 0 stored)", () => {
    // MSRP is frozen in the snapshot (commercial.lineItems[].unitPrice), never a
    // live lookup, so both documents reproduce the originally-quoted number. A
    // hypothetical current-price change cannot reach the render.
    const commercial = makeCommercial();
    const view = assembleCustomerProposalCommercial(commercial);
    view.lineItems.forEach((line, i) => {
      assert.equal(line.priceEach, commercial.lineItems[i].unitPrice);
    });
  });
});

// ---------------------------------------------------------------------------
// Column set (ADR 0089 §3)
// ---------------------------------------------------------------------------

describe("Customer Proposal commercial columns", () => {
  it("are exactly CODE · PRODUCT · PRICE EACH · QTY · PRODUCT TOTAL", () => {
    assert.deepEqual(
      CUSTOMER_PROPOSAL_COLUMNS.map((c) => c.header),
      ["Code", "Product", "Price each", "Qty", "Product total"],
    );
  });

  it("contain no DISC / PARTNER columns", () => {
    const headers = CUSTOMER_PROPOSAL_COLUMNS.map((c) => c.header.toLowerCase());
    for (const banned of ["disc %", "partner each", "partner total"]) {
      assert.ok(!headers.includes(banned), `column "${banned}" must not exist`);
    }
  });
});

// ---------------------------------------------------------------------------
// Rendered output — leak guard (build-failing) + content deltas
// ---------------------------------------------------------------------------

describe("Customer Proposal rendered output", () => {
  it("REQUIRED leak guard: no partner/discount value in the rendered text", () => {
    const snap = makeSnapshot();
    const cp = renderedText(makeCustomerInput(snap));

    // Canary: the SAME scan MUST find partner values in the Project Quote, which
    // proves the scan actually sees rendered strings (not vacuously passing
    // because everything happens to be absent).
    const pq = renderedText(makeProjectInput(snap));
    const canaryHits = FORBIDDEN_FORMATTED.filter((t) => pq.includes(t));
    assert.ok(
      canaryHits.length > 0,
      "canary failed: the scan does not see rendered partner values in the Project Quote, so the leak guard would be vacuous",
    );

    // The guard: none of the partner/discount values appear anywhere in the
    // Customer Proposal's rendered text.
    for (const token of FORBIDDEN_FORMATTED) {
      assert.ok(!cp.includes(token), `discount/partner value "${token}" leaked into the Customer Proposal`);
    }
    // Sanity: allowed MSRP values ARE present, so the scan is reading the CP.
    assert.ok(cp.includes("75,000") && cp.includes("95,000"), "MSRP values should render in the Customer Proposal");
  });

  it("REQUIRED leak guard: no partner/discount value in the PDF metadata title", () => {
    const title = documentTitle(makeCustomerInput(makeSnapshot()));
    assert.ok(title.includes("Customer Proposal"), "metadata title should identify the Customer Proposal");
    for (const token of [...FORBIDDEN_FORMATTED, "partner", "Partner", "disc", "Disc"]) {
      assert.ok(!title.includes(token), `metadata title must not carry "${token}" (got: ${title})`);
    }
  });

  it("renders to a valid PDF buffer without throwing", async () => {
    const buf = await renderToBuffer(toElement(makeCustomerInput(makeSnapshot())));
    assert.ok(buf.length > 1000, `PDF buffer suspiciously small: ${buf.length} bytes`);
    assert.equal(buf.subarray(0, 5).toString("utf8"), "%PDF-");
  });

  it("drops the DEAL cell and PO price-lock line; footnote is USD-only", () => {
    const cp = squash(renderedText(makeCustomerInput(makeSnapshot())));
    assert.ok(cp.includes(squash("All amounts in USD.")), "USD-only footnote must be present");
    assert.ok(!cp.includes(squash("Partner pricing as quoted")), "partner-pricing footnote must be gone");
    assert.ok(!cp.includes(squash("the quoted price is locked")), "PO price-lock line must be gone");
    // The DEAL cell exposed the raw Pipedrive title; it must be absent.
    assert.ok(!cp.includes(squash("Kean University Security Upgrade")), "DEAL cell (raw deal title) must be gone");
    // Customer / Contact identity is kept.
    assert.ok(cp.includes(squash("Kean University")) && cp.includes(squash("Jane Smith")));
  });

  it("content deltas: no System-capacity bars or Terms page; Quoted-solution kept; badge is CUSTOMER PROPOSAL", () => {
    const snap = makeSnapshot();
    const cp = squash(renderedText(makeCustomerInput(snap)));
    assert.ok(!cp.includes(squash("System capacity")), "System-capacity bars must be removed");
    assert.ok(!cp.includes(squash("Terms and Conditions")), "page-4 Terms must be removed");
    assert.ok(cp.includes(squash("Quoted solution")), "Quoted-solution bars must be kept");
    assert.ok(cp.includes(squash("Products in this quote")), "product spec blocks must be kept");
    assert.ok(cp.includes(squash("CUSTOMER PROPOSAL")), "badge must read CUSTOMER PROPOSAL");
    assert.ok(!cp.includes(squash("PROJECT QUOTE")), "Project Quote badge must not appear");

    // Control: the Project Quote keeps System capacity + Terms + its own badge.
    const pq = squash(renderedText(makeProjectInput(snap)));
    assert.ok(pq.includes(squash("System capacity")));
    assert.ok(pq.includes(squash("Terms and Conditions")));
    assert.ok(pq.includes(squash("PROJECT QUOTE")));
  });

  // ADR 0130 — the Customer Proposal strips the capacity bars AND the
  // sizing-basis note that explains them (ADR 0089 §3), but still renders a Bw
  // column. Before this change it therefore stated no bandwidth basis at all,
  // and the internal Project Quote asserted "peak" even on a version-1 row
  // whose banked figure was a motion-weighted average.
  it("states the bandwidth basis in BOTH variants, not only where the bars render", () => {
    const snap = makeSnapshot({
      sizing: { ...makeSnapshot().sizing, calcVersion: 2, recordedStorageTb: 72.4 },
    });
    for (const [name, input] of [
      ["Customer Proposal", makeCustomerInput(snap)],
      ["Project Quote", makeProjectInput(snap)],
    ] as const) {
      const text = squash(renderedText(input));
      assert.ok(
        text.includes(squash("peak while recording")),
        `${name} must say what its Bw column means`,
      );
    }
    // Canary: the bars (and their note) really are absent from the CP, so the
    // assertion above is being satisfied by the schedule note, not by them.
    const cp = squash(renderedText(makeCustomerInput(snap)));
    assert.ok(!cp.includes(squash("System capacity")), "CP must still strip the capacity bars");
  });

  it("never calls a version-1 figure the peak, in either variant", () => {
    const base = makeSnapshot().sizing;
    const snap = makeSnapshot({
      sizing: { ...base, calcVersion: 1, recordedStorageTb: null },
    });
    for (const [name, input] of [
      ["Customer Proposal", makeCustomerInput(snap)],
      ["Project Quote", makeProjectInput(snap)],
    ] as const) {
      const text = squash(renderedText(input));
      assert.ok(
        !text.includes(squash("peak while recording")),
        `${name} must NOT claim the event peak on a pre-Phase-A row`,
      );
      assert.ok(
        text.includes(squash("motion-weighted")),
        `${name} must say the figure is a motion-weighted average instead`,
      );
    }
  });

  it("emits 3 pages for the Customer Proposal and 4 for the Project Quote", () => {
    const snap = makeSnapshot();
    const count = (input: ProjectQuotePdfInput) => {
      const doc = ProjectQuotePdf({ data: input }) as { props: { children: unknown } };
      const children = doc.props.children;
      const arr = Array.isArray(children) ? children : [children];
      return arr.filter(
        (c): c is { type: unknown } =>
          typeof c === "object" && c !== null && (c as { type?: unknown }).type === Page,
      ).length;
    };
    assert.equal(count(makeCustomerInput(snap)), 3, "Customer Proposal = Sizing → Products → Commercial");
    assert.equal(count(makeProjectInput(snap)), 4, "Project Quote = Sizing → Products → Commercial → Terms");
  });
});
