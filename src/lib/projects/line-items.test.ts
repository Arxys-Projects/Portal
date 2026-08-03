import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PRODUCTS_DISPLAY_MAX_ITEMS,
  diffLineItems,
  fingerprintDealProducts,
  fingerprintFromCacheColumn,
  fingerprintSnapshotLineItems,
  quotedProductsDisplay,
  recommendedProductsDisplay,
  sameLineItems,
} from "./line-items";
import type { PdDealProduct } from "@/lib/pipedrive/client";
import type { DealLineFingerprint } from "./types";

function pdLine(o: Partial<PdDealProduct> & { product_id: number }): PdDealProduct {
  return {
    id: o.id ?? o.product_id * 100,
    product_id: o.product_id,
    name: o.name ?? `Product ${o.product_id}`,
    item_price: o.item_price ?? 1000,
    discount: o.discount ?? 0,
    discount_type: o.discount_type ?? "percentage",
    quantity: o.quantity ?? 1,
    sum: o.sum ?? 1000,
    currency: o.currency ?? "USD",
    order_nr: o.order_nr ?? 1,
  };
}

function line(o: Partial<DealLineFingerprint> & { product_id: number }): DealLineFingerprint {
  return {
    product_id: o.product_id,
    code: o.code ?? null,
    name: o.name ?? null,
    quantity: o.quantity ?? 1,
    unit_price: o.unit_price ?? 1000,
    line_amount: o.line_amount ?? 1000,
  };
}

describe("fingerprintDealProducts", () => {
  it("returns an empty array for the null Pipedrive gives a deal with no products", () => {
    // GET /deals/{id}/products returns data: null, not [], for an empty deal.
    assert.deepEqual(fingerprintDealProducts(null), []);
    assert.deepEqual(fingerprintDealProducts(undefined), []);
  });

  it("drops the ordering fields from the stored shape but sorts by them first", () => {
    const fingerprint = fingerprintDealProducts([
      pdLine({ product_id: 9, order_nr: 2 }),
      pdLine({ product_id: 4, order_nr: 1 }),
    ]);
    assert.deepEqual(
      fingerprint.map((l) => l.product_id),
      [4, 9],
    );
    assert.equal("order_nr" in fingerprint[0], false);
    assert.equal("attachment_id" in fingerprint[0], false);
  });

  it("leaves code null, because the deal payload does not carry a product code", () => {
    const [only] = fingerprintDealProducts([pdLine({ product_id: 1 })]);
    assert.equal(only.code, null);
  });

  it("coerces numeric strings, which is how PostgREST and Pipedrive both hand back money", () => {
    const [only] = fingerprintDealProducts([
      { ...pdLine({ product_id: 1 }), item_price: "2500.50" as unknown as number },
    ]);
    assert.equal(only.unit_price, 2500.5);
  });
});

describe("fingerprintSnapshotLineItems", () => {
  it("reads the frozen QuoteLineItem shape out of jsonb", () => {
    const fingerprint = fingerprintSnapshotLineItems([
      {
        productId: 7,
        productCode: "VX5-V800",
        productName: "V800 Server",
        quantity: 2,
        unitPrice: 40000,
        lineAmount: 72000,
        orderNr: 1,
      },
    ]);
    assert.deepEqual(fingerprint, [
      {
        product_id: 7,
        code: "VX5-V800",
        name: "V800 Server",
        quantity: 2,
        unit_price: 40000,
        line_amount: 72000,
      },
    ]);
  });

  it("survives a snapshot with missing or junk fields rather than throwing", () => {
    assert.deepEqual(fingerprintSnapshotLineItems(null), []);
    assert.deepEqual(fingerprintSnapshotLineItems("nope"), []);
    // A line with no resolvable productId is dropped, not kept as NaN.
    assert.deepEqual(fingerprintSnapshotLineItems([{ quantity: 1 }, null]), []);
  });
});

describe("fingerprintFromCacheColumn", () => {
  it("distinguishes 'never read' (null) from 'read, and empty' ([])", () => {
    // This distinction is load-bearing: null means there is no comparison basis
    // and drift must not be reported, [] means the deal genuinely has no lines.
    assert.equal(fingerprintFromCacheColumn(null), null);
    assert.deepEqual(fingerprintFromCacheColumn([]), []);
  });
});

describe("sameLineItems", () => {
  it("ignores order", () => {
    const a = [line({ product_id: 1 }), line({ product_id: 2 })];
    const b = [line({ product_id: 2 }), line({ product_id: 1 })];
    assert.equal(sameLineItems(a, b), true);
  });

  it("ignores code and name, which one side of the comparison cannot supply", () => {
    const fromDeal = [line({ product_id: 1, code: null, name: "Renamed in Pipedrive" })];
    const fromSnapshot = [line({ product_id: 1, code: "VX5-V800", name: "V800 Server" })];
    assert.equal(sameLineItems(fromDeal, fromSnapshot), true);
  });

  it("notices a quantity or price change", () => {
    assert.equal(
      sameLineItems([line({ product_id: 1, quantity: 1 })], [line({ product_id: 1, quantity: 2 })]),
      false,
    );
    assert.equal(
      sameLineItems(
        [line({ product_id: 1, unit_price: 1000 })],
        [line({ product_id: 1, unit_price: 900 })],
      ),
      false,
    );
  });

  it("treats null as incomparable, never as equal to an empty list", () => {
    assert.equal(sameLineItems(null, []), false);
    assert.equal(sameLineItems(null, null), true);
  });
});

describe("diffLineItems", () => {
  it("reports nothing when either side is missing a comparison basis", () => {
    assert.equal(diffLineItems(null, [line({ product_id: 1 })]).total, 0);
    assert.equal(diffLineItems([line({ product_id: 1 })], null).total, 0);
  });

  it("counts an edited line ONCE, not as a removal plus an addition", () => {
    // The number lands in user-facing copy ("v2 no longer matches the deal"), so
    // a single quantity edit has to read as one differing line.
    const drift = diffLineItems(
      [line({ product_id: 1, quantity: 3 })],
      [line({ product_id: 1, quantity: 1 })],
    );
    assert.deepEqual(drift, { changed: 1, added: 0, removed: 0, total: 1 });
  });

  it("counts an added line", () => {
    const drift = diffLineItems(
      [line({ product_id: 1 }), line({ product_id: 2 })],
      [line({ product_id: 1 })],
    );
    assert.deepEqual(drift, { changed: 0, added: 1, removed: 0, total: 1 });
  });

  it("counts a deleted line — the change Pipedrive's API cannot report at all", () => {
    const drift = diffLineItems(
      [line({ product_id: 1 })],
      [line({ product_id: 1 }), line({ product_id: 2 })],
    );
    assert.deepEqual(drift, { changed: 0, added: 0, removed: 1, total: 1 });
  });

  it("reports no drift when the deal still matches the proposal", () => {
    const same = [line({ product_id: 1, quantity: 2 }), line({ product_id: 5 })];
    assert.equal(diffLineItems(same, [...same].reverse()).total, 0);
  });

  it("blames the edited copy when one product appears on two lines", () => {
    const deal = [line({ product_id: 1, quantity: 1 }), line({ product_id: 1, quantity: 9 })];
    const quote = [line({ product_id: 1, quantity: 1 }), line({ product_id: 1, quantity: 2 })];
    assert.deepEqual(diffLineItems(deal, quote), {
      changed: 1,
      added: 0,
      removed: 0,
      total: 1,
    });
  });

  it("counts every line as removed when the deal has been emptied", () => {
    const drift = diffLineItems([], [line({ product_id: 1 }), line({ product_id: 2 })]);
    assert.deepEqual(drift, { changed: 0, added: 0, removed: 2, total: 2 });
  });
});

describe("quotedProductsDisplay", () => {
  it("counts what it hid instead of trailing off", () => {
    const lines = [
      line({ product_id: 1, code: "VX5-V800", quantity: 2 }),
      line({ product_id: 2, code: "SW10", quantity: 1 }),
      line({ product_id: 3, code: "NIC-10G" }),
      line({ product_id: 4, code: "WTY-3Y" }),
      line({ product_id: 5, code: "RAIL-1U" }),
    ];
    assert.equal(quotedProductsDisplay(lines), "2 × VX5-V800 · 1 × SW10 +3 more");
    assert.equal(PRODUCTS_DISPLAY_MAX_ITEMS, 2);
  });

  it("omits the +N suffix when nothing was hidden", () => {
    assert.equal(
      quotedProductsDisplay([line({ product_id: 1, code: "VX5-V800", quantity: 2 })]),
      "2 × VX5-V800",
    );
  });

  it("falls back to the product name, then the id, and is never blank", () => {
    assert.equal(quotedProductsDisplay([line({ product_id: 1, name: "Custom line" })]), "1 × Custom line");
    assert.equal(quotedProductsDisplay([line({ product_id: 42 })]), "1 × Product 42");
    assert.equal(quotedProductsDisplay([]), "No line items on the proposal");
  });
});

describe("recommendedProductsDisplay", () => {
  it("names the recommended SKU and its unit count", () => {
    assert.equal(recommendedProductsDisplay("VX5-V800", 2), "2 × VX5-V800");
  });

  it("names a legacy submission rather than printing a UUID at the user", () => {
    assert.equal(
      recommendedProductsDisplay("0f5b1e2a-1c4d-4b8e-9a11-6d3c8e7f2b40", 1),
      "Recommendation unavailable (legacy submission)",
    );
  });

  it("is never blank", () => {
    assert.equal(recommendedProductsDisplay(null, 1), "No recommendation recorded");
    assert.equal(recommendedProductsDisplay("VX5-V800", 0), "1 × VX5-V800");
  });
});
