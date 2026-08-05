import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FAMILIES, datasheetButtonsFor, familyBySlug } from "./families";

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

  it("every family offers at least one datasheet button", () => {
    for (const f of FAMILIES) {
      assert.ok(
        datasheetButtonsFor(f).length > 0,
        `${f.slug} would render "Documentation coming soon." — the SW regression ADR 0116 fixed`,
      );
    }
  });

  it("a live sheet and a static PDF are never both set", () => {
    // Two link targets for one document is how the stale one gets clicked.
    for (const f of FAMILIES) {
      assert.ok(
        !(f.datasheetModels.length > 0 && f.datasheetUrl),
        `${f.slug} carries both datasheetModels and a static datasheetUrl`,
      );
    }
  });

  it("live datasheet buttons point at the portal route, not arxys.com", () => {
    for (const f of FAMILIES) {
      for (const btn of datasheetButtonsFor(f)) {
        if (f.datasheetModels.length === 0) continue;
        assert.ok(
          btn.url.startsWith("/api/datasheet/") && btn.external === false,
          `${f.slug} live button has url ${btn.url}`,
        );
      }
    }
  });

  it("the ACM family keeps its static PDF — no live template exists", () => {
    // /api/datasheet/V260 answers 409 (ADR 0110). Swapping this link would
    // trade a working download for an error page.
    const v260 = familyBySlug("v260");
    assert.ok(v260);
    assert.deepEqual(v260.datasheetModels, []);
    const [btn, ...rest] = datasheetButtonsFor(v260);
    assert.equal(rest.length, 0);
    assert.equal(btn.external, true);
    assert.ok(btn.url.startsWith("https://www.arxys.com/"));
  });

  it("the SW family offers both workstation sheets, labelled apart", () => {
    // Slug "sw" is not a datasheet key; SW10 and SW20 are two separate sheets.
    const sw = familyBySlug("sw");
    assert.ok(sw);
    assert.deepEqual(
      datasheetButtonsFor(sw).map((b) => [b.label, b.url]),
      [
        ["SW10 Datasheet", "/api/datasheet/SW10"],
        ["SW20 Datasheet", "/api/datasheet/SW20"],
      ],
    );
  });

  it("a single-sheet family says 'Download Datasheet', not the model name", () => {
    const v600 = familyBySlug("v600");
    assert.ok(v600);
    assert.deepEqual(datasheetButtonsFor(v600), [
      { label: "Download Datasheet", url: "/api/datasheet/V600", external: false },
    ]);
  });

  it("every datasheet model key is a product group of its own family", () => {
    // Catches a typo'd key, which would 404 the download. It cannot prove the
    // key RENDERS — that needs live spec rows, and
    // `node --env-file=.env.local --import tsx scripts/render-datasheet.ts --all`
    // is the check that does (ADR 0116).
    for (const f of FAMILIES) {
      const known = new Set([
        ...f.productGroups,
        ...f.tierSections.flatMap((t) => t.productGroups),
      ]);
      for (const model of f.datasheetModels) {
        assert.ok(known.has(model), `${f.slug} datasheetModel '${model}' is not one of its groups`);
      }
    }
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
