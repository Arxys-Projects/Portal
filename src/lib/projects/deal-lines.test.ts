import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PdProduct } from "@/lib/pipedrive/product-sync";
import type { PdV2DealProduct } from "@/lib/pipedrive/project-deal-api";
import { planClaimResolution } from "./claim-resolution";
import {
  diffBomAgainstDeal,
  parseBankedBom,
  planDealLines,
  roleComment,
  roleFromComment,
  type BomLineIn,
} from "./deal-lines";
import { sameLineItems } from "./line-items";

// Step 5 (ADR 0170): the pure half of project deal lines.

const product = (id: number, code: string | null, price: number | null, extra: Partial<PdProduct> = {}): PdProduct => ({
  id,
  name: `Product ${code}`,
  code,
  is_linkable: true,
  prices: price === null ? [] : [{ price, currency: "USD" }],
  ...extra,
});

const PRODUCTS: PdProduct[] = [
  product(1433, "VX5-V250-MGM", 14020),
  product(1415, "VX5-NIC-SFP28", 670),
  product(1416, "VX5-GPU-A1000", 1706),
  product(1459, "VX5-SW10-100", 6426),
  product(1501, "VX5-V800-864", 117054.37),
];

const BOM: BomLineIn[] = [
  { sku: "VX5-V800-864", qty: 18, role: "recorder" },
  { sku: "VX5-GPU-A1000", qty: 18, role: "recorder" },
  { sku: "VX5-GPU-A1000", qty: 9, role: "failover" },
  { sku: "VX5-V250-MGM", qty: 1, role: "mgmt" },
];

describe("planDealLines", () => {
  it("resolves every line by exact code and passes the USD price through verbatim", () => {
    const plan = planDealLines(BOM, PRODUCTS);
    assert.ok(plan.ok);
    const v800 = plan.lines.find((l) => l.sku === "VX5-V800-864");
    assert.equal(v800?.unitPrice, 117054.37);
    assert.equal(String(v800?.unitPrice), "117054.37");
    assert.equal(v800?.pipedriveProductId, 1501);
    assert.deepEqual(
      plan.lines.map((l) => `${l.sku}|${l.role}|${l.qty}`),
      ["VX5-GPU-A1000|failover|9", "VX5-GPU-A1000|recorder|18", "VX5-V250-MGM|mgmt|1", "VX5-V800-864|recorder|18"],
    );
  });

  it("builds the fingerprint in the DealLineFingerprint shape with no price math", () => {
    const plan = planDealLines(BOM, PRODUCTS);
    assert.ok(plan.ok);
    assert.deepEqual(plan.fingerprint[0], {
      product_id: 1416,
      code: "VX5-GPU-A1000",
      name: "Product VX5-GPU-A1000",
      quantity: 9,
      unit_price: 1706,
      line_amount: null,
    });
    assert.ok(plan.fingerprint.every((f) => f.line_amount === null));
    // The same BOM in another order gives the same fingerprint.
    const again = planDealLines([...BOM].reverse(), PRODUCTS);
    assert.ok(again.ok);
    assert.deepEqual(again.fingerprint, plan.fingerprint);
  });

  it("refuses the whole set and lists every offender", () => {
    const products = [
      product(1, "MISSING-NOT", 1),
      product(2, "DUP", 10),
      product(3, "DUP", 12),
      product(4, "OFFPICKER", 10, { is_linkable: false }),
      product(5, "ZERO", 0),
      product(6, "MKT", 0, { name: "[MKT] Market item" }),
      product(7, "CFQ", 5, { name: "[CFQ] Call item" }),
      product(8, "NOUSD", null, { prices: [{ price: 10, currency: "EUR" }] }),
      product(9, "GOOD", 10),
    ];
    const bom: BomLineIn[] = ["MISSING", "DUP", "OFFPICKER", "ZERO", "MKT", "CFQ", "NOUSD", "GOOD"].map((sku) => ({
      sku,
      qty: 1,
      role: "recorder",
    }));
    const plan = planDealLines(bom, products);
    assert.ok(!plan.ok);
    assert.deepEqual(
      Object.fromEntries(plan.refusals.map((r) => [r.sku, r.reason])),
      {
        CFQ: "call-for-quote",
        DUP: "duplicate-code",
        MISSING: "missing",
        MKT: "market-price",
        NOUSD: "no-usd-price",
        OFFPICKER: "not-linkable",
        ZERO: "zero-price",
      },
    );
    assert.match(plan.refusals.find((r) => r.sku === "DUP")!.message, /#2, #3/);
  });

  it("does not block on a duplicate code the BOM does not use", () => {
    const plan = planDealLines(BOM, [...PRODUCTS, product(9001, "LEGACY-V3", 5), product(9002, "LEGACY-V3", 6)]);
    assert.ok(plan.ok);
  });

  it("a changed price changes the fingerprint", () => {
    const a = planDealLines(BOM, PRODUCTS);
    const b = planDealLines(BOM, PRODUCTS.map((p) => (p.id === 1433 ? product(1433, "VX5-V250-MGM", 14100) : p)));
    assert.ok(a.ok && b.ok);
    assert.equal(sameLineItems(a.fingerprint, b.fingerprint), false);
    assert.equal(sameLineItems(a.fingerprint, a.fingerprint), true);
  });
});

describe("parseBankedBom", () => {
  it("accepts the banked shape (ruleId is ignored)", () => {
    const parsed = parseBankedBom([{ sku: "VX5-V250-MGM", qty: 1, role: "mgmt", ruleId: null }]);
    assert.deepEqual(parsed, { ok: true, bom: [{ sku: "VX5-V250-MGM", qty: 1, role: "mgmt" }] });
  });

  it("refuses a repeat of one SKU and role, a bad role, a bad quantity and an empty list", () => {
    assert.equal(parseBankedBom([{ sku: "A", qty: 1, role: "mgmt" }, { sku: "A", qty: 2, role: "mgmt" }]).ok, false);
    assert.equal(parseBankedBom([{ sku: "A", qty: 1, role: "storage" }]).ok, false);
    assert.equal(parseBankedBom([{ sku: "A", qty: 1.5, role: "mgmt" }]).ok, false);
    assert.equal(parseBankedBom([{ sku: "A", qty: 0, role: "mgmt" }]).ok, false);
    assert.equal(parseBankedBom([]).ok, false);
    assert.equal(parseBankedBom({}).ok, false);
  });
});

describe("role comment", () => {
  it("round-trips every role and ignores a comment without one", () => {
    for (const role of ["recorder", "failover", "mgmt", "workstation"] as const) {
      assert.equal(roleFromComment(roleComment(role)), role);
    }
    assert.equal(roleFromComment("ARXYS ROLE: Failover"), "failover");
    assert.equal(roleFromComment("added by Jim"), null);
    assert.equal(roleFromComment(null), null);
  });
});

describe("diffBomAgainstDeal", () => {
  const codes = new Map(PRODUCTS.map((p) => [p.id, p.code as string]));
  const line = (id: number, productId: number, quantity: number, comments: string | null): PdV2DealProduct => ({
    id,
    product_id: productId,
    quantity,
    comments,
    item_price: 1,
  });
  const matching = (): PdV2DealProduct[] => [
    line(1, 1501, 18, roleComment("recorder")),
    line(2, 1416, 18, roleComment("recorder")),
    line(3, 1416, 9, roleComment("failover")),
    line(4, 1433, 1, roleComment("mgmt")),
  ];

  it("is clean when the deal matches, with one SKU in two roles", () => {
    const diff = diffBomAgainstDeal(BOM, matching(), codes);
    assert.equal(diff.clean, true);
  });

  it("reports a missing line", () => {
    const diff = diffBomAgainstDeal(BOM, matching().filter((l) => l.id !== 4), codes);
    assert.deepEqual(diff.missing, [{ sku: "VX5-V250-MGM", role: "mgmt", qty: 1 }]);
    assert.equal(diff.clean, false);
  });

  it("reports an extra line, including one a rep added by hand with no role", () => {
    const diff = diffBomAgainstDeal(BOM, [...matching(), line(5, 1459, 2, null)], codes);
    assert.deepEqual(diff.extra, [{ sku: "VX5-SW10-100", role: null, qty: 2, productId: 1459, attachmentId: 5 }]);
    assert.deepEqual(diff.missing, []);
  });

  it("reports a quantity mismatch on one role of a two-role SKU", () => {
    const lines = matching();
    lines[2] = line(3, 1416, 10, roleComment("failover"));
    const diff = diffBomAgainstDeal(BOM, lines, codes);
    assert.deepEqual(diff.quantity, [{ sku: "VX5-GPU-A1000", role: "failover", expected: 9, actual: 10, attachmentId: 3 }]);
    assert.deepEqual(diff.missing, []);
    assert.deepEqual(diff.extra, []);
  });

  it("reports a line filed under another role", () => {
    const lines = matching();
    lines[3] = line(4, 1433, 1, roleComment("recorder"));
    const diff = diffBomAgainstDeal(BOM, lines, codes);
    assert.deepEqual(diff.role, [{ sku: "VX5-V250-MGM", expected: "mgmt", actual: "recorder", qty: 1, attachmentId: 4 }]);
    assert.deepEqual(diff.missing, []);
    assert.deepEqual(diff.extra, []);
  });

  it("reports a second copy of a line as extra", () => {
    const diff = diffBomAgainstDeal(BOM, [...matching(), line(9, 1433, 1, roleComment("mgmt"))], codes);
    assert.equal(diff.extra.length, 1);
    assert.equal(diff.extra[0].attachmentId, 9);
  });
});

describe("planClaimResolution", () => {
  const claim = { id: 7, projectId: "p-1", submissionId: "s-1", pipedriveDealId: null, claimedAt: "2026-10-23T11:00:00Z" };
  const now = new Date("2026-10-23T12:00:00Z");

  it("attaches a deal that carries the project's id", () => {
    const plan = planClaimResolution({
      claim,
      action: "attach",
      dealId: 501,
      namedDeal: { id: 501, projectFieldValue: "p-1", isDeleted: false },
      dealsForProject: [501],
      now,
    });
    assert.deepEqual(plan, { ok: true, action: "attach", claimId: 7, dealId: 501, submissionId: "s-1" });
  });

  it("refuses to attach a deal of another project, a deleted deal or a missing one", () => {
    const base = { claim, action: "attach" as const, dealId: 501, dealsForProject: [], now };
    assert.equal(planClaimResolution({ ...base, namedDeal: { id: 501, projectFieldValue: "p-2", isDeleted: false } }).ok, false);
    assert.equal(planClaimResolution({ ...base, namedDeal: { id: 501, projectFieldValue: "p-1", isDeleted: true } }).ok, false);
    assert.equal(planClaimResolution({ ...base, namedDeal: null }).ok, false);
  });

  it("releases only when Pipedrive has no deal for the project", () => {
    assert.deepEqual(planClaimResolution({ claim, action: "release", dealsForProject: [], now }), {
      ok: true,
      action: "release",
      claimId: 7,
    });
    assert.equal(planClaimResolution({ claim, action: "release", dealsForProject: [501], now }).ok, false);
  });

  it("refuses to release a claim younger than 15 minutes, or with an unreadable time", () => {
    const young = { ...claim, claimedAt: "2026-10-23T11:50:00Z" };
    const r = planClaimResolution({ claim: young, action: "release", dealsForProject: [], now });
    assert.ok(!r.ok);
    assert.match(r.message, /10 minute\(s\) old/);
    assert.equal(planClaimResolution({ claim: { ...claim, claimedAt: "?" }, action: "release", dealsForProject: [], now }).ok, false);
  });

  it("never touches a claim that already holds a deal, or no claim", () => {
    assert.equal(planClaimResolution({ claim: { ...claim, pipedriveDealId: 501 }, action: "release", dealsForProject: [], now }).ok, false);
    assert.equal(planClaimResolution({ claim: null, action: "release", dealsForProject: [], now }).ok, false);
  });
});
