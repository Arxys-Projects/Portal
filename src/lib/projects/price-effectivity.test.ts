import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { lastRepricingDate } from "./price-effectivity";
import type { PriceVersionRow } from "./price-effectivity";

const NOW = new Date("2026-08-20T12:00:00Z");

function row(sku: string, effective_date: string, msrp: number | null): PriceVersionRow {
  return { sku, effective_date, msrp };
}

describe("lastRepricingDate", () => {
  it("returns null for an empty table", () => {
    assert.equal(lastRepricingDate([], NOW), null);
  });

  it("returns null when every SKU has only its debut row", () => {
    // A freshly seeded table: 36 SKUs, one version each, nothing repriced yet.
    const rows = [row("A", "2026-05-05", 100), row("B", "2026-05-05", 200)];
    assert.equal(lastRepricingDate(rows, NOW), null);
  });

  it("returns the date of the row that changed an existing SKU's price", () => {
    const rows = [row("A", "2026-05-05", 100), row("A", "2026-07-02", 120)];
    assert.equal(lastRepricingDate(rows, NOW), "2026-07-02");
  });

  // The regression this function exists for (ADR 0141): three new "-NCD" SKUs
  // debuted 2026-08-18 and pinned max(effective_date) to that date, flagging
  // every open-deal quote as needing a price update.
  it("ignores a new SKU's debut row even when it is the newest row in the table", () => {
    const rows = [
      row("VX5-V400-128", "2026-05-05", 24975),
      row("VX5-V400-128", "2026-07-02", 31034),
      row("VX5-V400-128-NCD", "2026-08-18", 33796),
      row("VX5-V500-288-NCD", "2026-08-18", 54981),
    ];
    assert.equal(lastRepricingDate(rows, NOW), "2026-07-02");
  });

  it("takes the newest repricing across SKUs, not the newest per SKU", () => {
    const rows = [
      row("A", "2026-05-05", 100),
      row("A", "2026-07-02", 120),
      row("B", "2026-05-05", 200),
      row("B", "2026-08-01", 210),
    ];
    assert.equal(lastRepricingDate(rows, NOW), "2026-08-01");
  });

  it("ignores a re-pushed row that carries an identical price", () => {
    // A no-op push: a new version row whose msrp matches the one it supersedes
    // did not change what anything costs, so no quote became stale.
    const rows = [
      row("A", "2026-05-05", 100),
      row("A", "2026-07-02", 120),
      row("A", "2026-08-18", 120),
    ];
    assert.equal(lastRepricingDate(rows, NOW), "2026-07-02");
  });

  it("treats null -> a real price as a repricing", () => {
    // Several seeded SKUs carry a null msrp (quote-only). Acquiring a price is
    // a real change, and null must not compare equal to 0.
    const rows = [row("A", "2026-05-05", null), row("A", "2026-07-02", 8359)];
    assert.equal(lastRepricingDate(rows, NOW), "2026-07-02");
  });

  it("treats a real price -> null as a repricing", () => {
    const rows = [row("A", "2026-05-05", 8359), row("A", "2026-07-02", null)];
    assert.equal(lastRepricingDate(rows, NOW), "2026-07-02");
  });

  it("does not treat null -> null as a repricing", () => {
    const rows = [row("A", "2026-05-05", null), row("A", "2026-07-02", null)];
    assert.equal(lastRepricingDate(rows, NOW), null);
  });

  it("excludes a repricing staged for a future date until it takes effect", () => {
    const rows = [
      row("A", "2026-05-05", 100),
      row("A", "2026-07-02", 120),
      row("A", "2026-09-01", 150),
    ];
    assert.equal(lastRepricingDate(rows, NOW), "2026-07-02");
    assert.equal(lastRepricingDate(rows, new Date("2026-09-01T00:00:00Z")), "2026-09-01");
  });

  it("counts a repricing effective today", () => {
    const rows = [row("A", "2026-05-05", 100), row("A", "2026-08-20", 120)];
    assert.equal(lastRepricingDate(rows, NOW), "2026-08-20");
  });

  it("does not depend on input row order", () => {
    const rows = [
      row("A", "2026-07-02", 120),
      row("B", "2026-05-05", 200),
      row("A", "2026-05-05", 100),
      row("B", "2026-08-18", 200),
    ];
    assert.equal(lastRepricingDate(rows, NOW), "2026-07-02");
    assert.equal(lastRepricingDate([...rows].reverse(), NOW), "2026-07-02");
  });

  it("skips rows with a null effective_date rather than throwing", () => {
    const rows = [
      { sku: "A", msrp: 100, effective_date: null },
      row("A", "2026-05-05", 100),
      row("A", "2026-07-02", 120),
    ];
    assert.equal(lastRepricingDate(rows, NOW), "2026-07-02");
  });

  it("compares numerically when msrp arrives as a numeric string", () => {
    // PostgREST returns `numeric` columns as strings in some configurations;
    // "120" and 120 are the same price.
    const rows = [
      row("A", "2026-05-05", 120),
      { sku: "A", msrp: "120" as unknown as number, effective_date: "2026-07-02" },
    ];
    assert.equal(lastRepricingDate(rows, NOW), null);
  });
});
