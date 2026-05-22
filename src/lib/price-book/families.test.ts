import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FAMILIES, datasheetUrlFor } from "./families";

describe("FAMILIES", () => {
  it("has unique slugs", () => {
    const slugs = FAMILIES.map((f) => f.slug);
    assert.equal(new Set(slugs).size, slugs.length);
  });

  it("every family has at least one productGroup", () => {
    for (const f of FAMILIES) {
      assert.ok(f.productGroups.length > 0, `${f.slug} has no productGroups`);
    }
  });

  it("sortOrder is dense and unique", () => {
    const sorted = [...FAMILIES]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((f) => f.sortOrder);
    for (let i = 0; i < sorted.length; i++) {
      assert.equal(sorted[i], i + 1, "sortOrder must be 1..N");
    }
  });

  it("datasheetUrlFor follows arxys.com convention", () => {
    assert.equal(
      datasheetUrlFor("V400"),
      "https://www.arxys.com/wp-content/uploads/Arxys-VideoX-Factsheet-V400-V5.pdf",
    );
  });

  it("every family has 3 kpis", () => {
    for (const f of FAMILIES) {
      assert.equal(f.kpis.length, 3, `${f.slug} does not have exactly 3 kpis`);
    }
  });

  it("every family has at least 3 keyFeatures", () => {
    for (const f of FAMILIES) {
      assert.ok(
        f.keyFeatures.length >= 3,
        `${f.slug} has fewer than 3 keyFeatures`,
      );
    }
  });

  it("every family has at least 3 technicalSpecs", () => {
    for (const f of FAMILIES) {
      assert.ok(
        f.technicalSpecs.length >= 3,
        `${f.slug} has fewer than 3 technicalSpecs`,
      );
    }
  });

  it("skuTableColumns always includes sku, product, and msrp", () => {
    for (const f of FAMILIES) {
      assert.ok(
        f.skuTableColumns.includes("sku"),
        `${f.slug} skuTableColumns missing sku`,
      );
      assert.ok(
        f.skuTableColumns.includes("product"),
        `${f.slug} skuTableColumns missing product`,
      );
      assert.ok(
        f.skuTableColumns.includes("msrp"),
        `${f.slug} skuTableColumns missing msrp`,
      );
    }
  });

  it("tier section productGroups do not overlap with primary productGroups", () => {
    for (const f of FAMILIES) {
      const primary = new Set(f.productGroups);
      for (const tier of f.tierSections) {
        for (const pg of tier.productGroups) {
          assert.ok(
            !primary.has(pg),
            `${f.slug} tier section productGroup '${pg}' overlaps primary`,
          );
        }
      }
    }
  });
});
