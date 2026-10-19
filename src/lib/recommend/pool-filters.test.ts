import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { recommend } from "./algorithm";
import {
  applyPoolOptions,
  parseRackUnits,
  sfpAddonOffered,
  sfpSpecDisagreements,
} from "./pool-filters";
import { GB_PER_TB } from "./types";
import {
  FROZEN_POOL as POOL,
  SEED_SPECS_FILE,
  readSeededFamilySpecs,
  seededPool,
} from "./seeded-pool.test-fixtures";

// rack_units and sfp_addon for every pool SKU, from the repo's seed file.
const POOL_WITH_RACK = seededPool();

// The live table also carries a longer spelling on each family's lowest SKU
// (JOURNAL, 2026-08 datasheet sweep, quoted there with its middle elided). The
// seed file has only the short one, so the reader is tested on both.
const LONG_OPTIONAL = "Optional - 2x 10Gb SFP+ ... available";

const tb = (n: number) => n * GB_PER_TB;
const V200S = ["VX5-V200-64", "VX5-V200-80", "VX5-V200-96"];

describe("SFP+ spec readers", () => {
  it("reads both live spellings of optional, and No in any case", () => {
    assert.equal(sfpAddonOffered("Optional"), "yes");
    assert.equal(sfpAddonOffered(LONG_OPTIONAL), "yes");
    assert.equal(sfpAddonOffered("  optional "), "yes");
    assert.equal(sfpAddonOffered("No"), "no");
    assert.equal(sfpAddonOffered("NO"), "no");
    assert.equal(sfpAddonOffered(null), "unknown");
    assert.equal(sfpAddonOffered(""), "unknown");
    assert.equal(sfpAddonOffered("Optionally"), "unknown");
  });

  it("parses the free-text rack units an admin might type", () => {
    for (const v of ["1U", " 1u ", "1 U", "1RU", "1 ru"]) assert.equal(parseRackUnits(v), 1, v);
    assert.equal(parseRackUnits("2U"), 2);
    assert.equal(parseRackUnits("4 RU"), 4);
    assert.equal(parseRackUnits("11U"), 11);
    for (const v of [null, undefined, "", "  ", "1.5U", "Tower", "2U/3U", "U", "one U"]) {
      assert.equal(parseRackUnits(v), null, String(v));
    }
  });

});

describe(`sfp_addon agrees with rack_units on every pool SKU (${SEED_SPECS_FILE})`, () => {
  it("the seed file sets both columns for every family, and covers every pool SKU", () => {
    const families = readSeededFamilySpecs();
    assert.deepEqual(
      families.map((f) => f.idPrefix),
      ["VX5-V100-", "VX5-V200-", "VX5-V400-", "VX5-V500-", "VX5-V600-", "VX5-V700-", "VX5-V800-"],
    );
    assert.ok(families.every((f) => f.rackUnits && f.sfpAddon));
    assert.equal(POOL_WITH_RACK.length, 18);
    assert.ok(POOL_WITH_RACK.every((s) => s.rackUnits && s.sfpAddon), "a pool SKU has no seed block");
  });

  it("finds no disagreement: 1U says No, everything bigger says Optional", () => {
    assert.deepEqual(sfpSpecDisagreements(POOL_WITH_RACK), []);
    const oneU = POOL_WITH_RACK.filter((s) => parseRackUnits(s.rackUnits) === 1).map((s) => s.sku);
    const noSfp = POOL_WITH_RACK.filter((s) => sfpAddonOffered(s.sfpAddon) === "no").map((s) => s.sku);
    assert.deepEqual(oneU, V200S);
    assert.deepEqual(noSfp, V200S);
  });

  it("reports each kind of disagreement", () => {
    const bad = sfpSpecDisagreements([
      { sku: "A", rackUnits: "1U", sfpAddon: "Optional" },
      { sku: "B", rackUnits: "2U", sfpAddon: "No" },
      { sku: "C", rackUnits: null, sfpAddon: "Optional" },
      { sku: "D", rackUnits: "2U", sfpAddon: null },
      { sku: "E", rackUnits: "2U", sfpAddon: "Ask sales" },
      { sku: "F", rackUnits: "3U", sfpAddon: "Optional" },
    ]);
    assert.deepEqual(bad, [
      'A: 1U but SFP add-on says "Optional"',
      'B: 2U but SFP add-on says "No"',
      "C: rack units blank",
      "D: SFP add-on blank",
      'E: SFP add-on "Ask sales" not recognized',
    ]);
  });
});

describe("applyPoolOptions", () => {
  it("returns the same array, with no warnings, when no option is on", () => {
    for (const options of [{}, { excludeOneU: false }]) {
      const r = applyPoolOptions(POOL_WITH_RACK, options);
      assert.equal(r.pool, POOL_WITH_RACK);
      assert.deepEqual(r.warnings, []);
    }
  });

  it("excludeOneU removes exactly the V200s from the live-shaped pool", () => {
    const r = applyPoolOptions(POOL_WITH_RACK, { excludeOneU: true });
    assert.equal(r.pool.length, 15);
    assert.ok(r.pool.every((s) => s.productGroup !== "V200"));
    assert.deepEqual(r.warnings, []);
  });

  it("leaves out a server with blank rack units, and says so", () => {
    const pool = POOL_WITH_RACK.map((s) => (s.sku === "VX5-V500-240" ? { ...s, rackUnits: null } : s));
    const r = applyPoolOptions(pool, { excludeOneU: true });
    assert.equal(r.pool.length, 14);
    assert.ok(!r.pool.some((s) => s.sku === "VX5-V500-240"));
    assert.equal(r.warnings.length, 1);
    assert.match(r.warnings[0], /VX5-V500-240: rack units blank/);
  });

  it("excludes a 1U typed another way (\"1 U\", \"1RU\"), and an unreadable value", () => {
    const retyped = POOL_WITH_RACK.map((s) =>
      s.sku === "VX5-V200-64"
        ? { ...s, rackUnits: "1 U" }
        : s.sku === "VX5-V200-80"
          ? { ...s, rackUnits: "1RU" }
          : s.sku === "VX5-V400-128"
            ? { ...s, rackUnits: "Tower" }
            : s,
    );
    const r = applyPoolOptions(retyped, { excludeOneU: true });
    assert.ok(!r.pool.some((s) => s.productGroup === "V200"));
    assert.ok(!r.pool.some((s) => s.sku === "VX5-V400-128"));
    assert.equal(r.pool.length, 14);
    // The two 1U spellings agree with "No", so only the unreadable one is reported.
    assert.equal(r.warnings.length, 1);
    assert.match(r.warnings[0], /VX5-V400-128: rack units "Tower" not recognized/);
    assert.doesNotMatch(r.warnings[0], /V200/);
  });

  it("keeps a 2U server whose sfp_addon says No, but warns", () => {
    const pool = POOL_WITH_RACK.map((s) => (s.sku === "VX5-V400-160" ? { ...s, sfpAddon: "No" } : s));
    const r = applyPoolOptions(pool, { excludeOneU: true });
    assert.ok(r.pool.some((s) => s.sku === "VX5-V400-160"));
    assert.match(r.warnings[0], /VX5-V400-160: 2U but SFP add-on says "No"/);
  });

  it("empties a pool loaded without rack_units (the partner path's loader today)", () => {
    const r = applyPoolOptions(POOL, { excludeOneU: true });
    assert.equal(r.pool.length, 0);
  });
});

describe("recommend with excludeOneU (SFP+ on)", () => {
  const small = { totalCameras: 50, totalStorageGb: tb(5), totalVsr: 50 };

  it("SFP+ on a calc that would have picked a V200 picks the cheapest non-1U server", () => {
    const off = recommend(small, POOL_WITH_RACK);
    assert.equal(off.winner.sku, "VX5-V200-64");

    const on = recommend(small, POOL_WITH_RACK, { excludeOneU: true });
    // Cheapest 2U in the frozen pool: one V400-128 at $31,034.
    assert.equal(on.winner.sku, "VX5-V400-128");
    assert.equal(on.winner.units, 1);
    assert.equal(on.winner.totalCostUsd, 31034);
    assert.ok([on.winner, ...on.alternatives].every((c) => c.productGroup !== "V200"));
    assert.equal(on.alternatives.length, 14);
    assert.deepEqual(on.warnings, []);
  });

  it("a V200 whose rack units read \"1 U\" is still never picked with SFP+", () => {
    const pool = POOL_WITH_RACK.map((s) => (s.productGroup === "V200" ? { ...s, rackUnits: "1 U" } : s));
    const r = recommend(small, pool, { excludeOneU: true });
    assert.equal(r.winner.sku, "VX5-V400-128");
  });

  it("throws rather than quote SFP+ from a pool with no rack units", () => {
    assert.throws(
      () => recommend(small, POOL, { excludeOneU: true }),
      /no SKUs left after excluding 1U servers/,
    );
  });

  it("puts the spec warning after the sizing warnings", () => {
    const pool = POOL_WITH_RACK.map((s) => (s.sku === "VX5-V200-64" ? { ...s, sfpAddon: "Optional" } : s));
    const r = recommend({ totalCameras: 500, totalStorageGb: tb(400), totalVsr: 500 }, pool, {
      excludeOneU: true,
    });
    assert.match(r.warnings[0], /stacks \d+ units/);
    assert.match(r.warnings[r.warnings.length - 1], /VX5-V200-64: 1U but SFP add-on says "Optional"/);
  });
});

describe("default path is unchanged (bit-identical)", () => {
  // A spread of workloads across both drivers and the single/stacked boundary.
  const inputs = [
    { totalCameras: 1, totalStorageGb: tb(1), totalVsr: 1 },
    { totalCameras: 50, totalStorageGb: tb(5), totalVsr: 50 },
    { totalCameras: 150, totalStorageGb: tb(100), totalVsr: 150 },
    { totalCameras: 500, totalStorageGb: tb(400), totalVsr: 500 },
    { totalCameras: 332, totalStorageGb: tb(1764.3), totalVsr: 332 },
    { totalCameras: 2469, totalStorageGb: tb(12420), totalVsr: 2469 },
    { totalCameras: 5000, totalStorageGb: tb(1), totalVsr: 5000 },
  ];

  it("no options, empty options and excludeOneU false all give the same result", () => {
    for (const input of inputs) {
      const base = recommend(input, POOL);
      assert.deepEqual(recommend(input, POOL, {}), base);
      assert.deepEqual(recommend(input, POOL, { excludeOneU: false }), base);
    }
  });

  it("carrying rackUnits / sfpAddon on the specs changes nothing when the option is off", () => {
    for (const input of inputs) {
      assert.deepEqual(recommend(input, POOL_WITH_RACK), recommend(input, POOL));
    }
  });
});
