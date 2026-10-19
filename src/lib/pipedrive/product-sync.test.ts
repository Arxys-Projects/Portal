import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCreatePayload,
  buildRetirePayload,
  buildUpdatePayload,
  computePipedriveChanges,
  groupByCode,
  pdName,
  pdPrice,
  type PdProduct,
  type SyncProduct,
} from "./product-sync";

function cur(sku: string, overrides: Partial<SyncProduct> = {}): SyncProduct {
  return {
    id: 1,
    sku,
    product_name: `Product ${sku}`,
    msrp: 1000,
    price_type: "numeric",
    active: true,
    ...overrides,
  };
}

function pd(id: number, code: string | null, overrides: Partial<PdProduct> = {}): PdProduct {
  return {
    id,
    name: `Product ${code}`,
    code,
    is_linkable: true,
    prices: [{ price: 1000, currency: "USD", cost: 0, direct_cost: 0, notes: "" }],
    ...overrides,
  };
}

describe("pdName / pdPrice", () => {
  it("prefixes MKT and CFQ names and prices them at 0", () => {
    assert.equal(pdName("RAM", "market"), "[MKT] RAM");
    assert.equal(pdName("SW30", "call_for_quote"), "[CFQ] SW30");
    assert.equal(pdName("V800", "numeric"), "V800");
    assert.equal(pdPrice("market", 500), 0);
    assert.equal(pdPrice("numeric", "117054"), 117054);
    assert.equal(pdPrice("numeric", null), 0);
  });
});

describe("computePipedriveChanges", () => {
  it("creates a portal SKU Pipedrive does not have and leaves a matching one alone", () => {
    const c = computePipedriveChanges([cur("A"), cur("B")], [pd(10, "B")]);
    assert.deepEqual(c.newInPd.map((x) => x.sku), ["A"]);
    assert.equal(c.updatedInPd.length, 0);
    assert.equal(c.retireInPd.length, 0);
  });

  it("updates on a name or USD price difference and says which", () => {
    const c = computePipedriveChanges(
      [cur("A", { msrp: 2000 }), cur("B", { product_name: "Renamed" })],
      [pd(10, "A"), pd(11, "B")],
    );
    assert.deepEqual(
      c.updatedInPd.map((u) => [u.cur.sku, u.product.id, u.reasons]),
      [
        ["A", 10, ["price"]],
        ["B", 11, ["name"]],
      ],
    );
  });

  it("compares the USD price, not whichever price is listed first", () => {
    const product = pd(10, "A", {
      prices: [
        { price: 900, currency: "EUR" },
        { price: 1000, currency: "USD" },
      ],
    });
    assert.equal(computePipedriveChanges([cur("A")], [product]).updatedInPd.length, 0);
  });

  it("retires a portal-inactive SKU that is still on the deal picker", () => {
    const c = computePipedriveChanges([cur("OLD", { active: false })], [pd(10, "OLD")]);
    assert.deepEqual(c.retireInPd.map((r) => r.product.id), [10]);
    assert.equal(c.newInPd.length, 0);
    assert.equal(c.updatedInPd.length, 0);
  });

  it("skips a portal-inactive SKU that is already retired or absent, so a re-run is a no-op", () => {
    const c = computePipedriveChanges(
      [cur("OLD", { active: false }), cur("GONE", { active: false })],
      [pd(10, "OLD", { is_linkable: false })],
    );
    assert.equal(c.retireInPd.length, 0);
    assert.equal(c.newInPd.length, 0, "an inactive SKU is never created");
  });

  it("puts a reactivated SKU back on the picker", () => {
    const c = computePipedriveChanges([cur("A")], [pd(10, "A", { is_linkable: false })]);
    assert.deepEqual(c.updatedInPd.map((u) => u.reasons), [["relink"]]);
  });

  it("refuses a portal SKU whose code two products share, and writes nothing for it", () => {
    // The live VX5-V600-320 case: the picker product carries the stale price.
    const c = computePipedriveChanges(
      [cur("VX5-V600-320", { msrp: 56461 })],
      [
        pd(1443, "VX5-V600-320", { prices: [{ price: 41659, currency: "USD" }] }),
        pd(1485, "VX5-V600-320", { is_linkable: false, prices: [{ price: 56461, currency: "USD" }] }),
      ],
    );
    assert.deepEqual(
      c.blockingDuplicates.map((d) => [d.code, d.products.map((p) => p.id)]),
      [["VX5-V600-320", [1443, 1485]]],
    );
    assert.equal(c.newInPd.length, 0);
    assert.equal(c.updatedInPd.length, 0);
    assert.equal(c.retireInPd.length, 0);
  });

  it("refuses a duplicated code on an inactive SKU too, rather than retiring one of them", () => {
    const c = computePipedriveChanges([cur("OLD", { active: false })], [pd(10, "OLD"), pd(11, "OLD")]);
    assert.equal(c.blockingDuplicates.length, 1);
    assert.equal(c.retireInPd.length, 0);
  });

  it("reports duplicated legacy codes without blocking, and flags non-portal codes", () => {
    const c = computePipedriveChanges([cur("A")], [pd(10, "A"), pd(20, "LEGACY"), pd(21, "LEGACY"), pd(30, "X")]);
    assert.equal(c.blockingDuplicates.length, 0);
    assert.deepEqual(c.otherDuplicates.map((d) => d.code), ["LEGACY"]);
    assert.deepEqual(c.flaggedRemoval.map((p) => p.id).sort(), [20, 21, 30]);
  });

  it("ignores products with no code", () => {
    assert.equal(groupByCode([pd(1, null), pd(2, "")]).size, 0);
  });
});

describe("payloads", () => {
  it("creates a product linkable, with a USD price", () => {
    assert.deepEqual(buildCreatePayload(cur("A", { msrp: 670 })), {
      name: "Product A",
      code: "A",
      prices: [{ price: 670, currency: "USD" }],
      is_linkable: true,
    });
  });

  it("updates name and USD price, keeps the other prices and the cost fields", () => {
    const product = pd(10, "A", {
      prices: [
        { price: 900, currency: "EUR", cost: 0, direct_cost: 0, notes: "" },
        { price: 1000, currency: "USD", cost: 5, direct_cost: 2, notes: "n" },
      ],
    });
    assert.deepEqual(buildUpdatePayload(cur("A", { msrp: 1200 }), product), {
      name: "Product A",
      code: "A",
      prices: [
        { price: 900, currency: "EUR", cost: 0, direct_cost: 0, notes: "" },
        { price: 1200, currency: "USD", cost: 5, direct_cost: 2, notes: "n" },
      ],
      is_linkable: true,
    });
  });

  it("adds a USD price when the product had none", () => {
    const product = pd(10, "A", { prices: [] });
    assert.deepEqual(buildUpdatePayload(cur("A"), product).prices, [{ price: 1000, currency: "USD" }]);
  });

  it("retires by clearing is_linkable only, sending the prices back unchanged", () => {
    // Never active_flag: in Pipedrive that deletes the product.
    const payload = buildRetirePayload(pd(10, "OLD"));
    assert.deepEqual(payload, {
      is_linkable: false,
      prices: [{ price: 1000, currency: "USD", cost: 0, direct_cost: 0, notes: "" }],
    });
    assert.ok(!("active_flag" in payload));
  });
});
