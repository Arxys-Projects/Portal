import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { recommend } from "./algorithm";
import { GB_PER_TB, type ServerSpec } from "./types";

// Matches the Phase 2 Step 3+4 seed (one mid-tier SKU per V-family) — real
// MSRPs from the Master Sheet, family-level max_cameras carried forward from
// the old server_specs (Q3(b) decision), SKU-tier max_storage_tb. See ADR
// 0031 + 0032 for the rationale.
const SPECS: readonly ServerSpec[] = [
  { sku: "VX5-V200-80",  productGroup: "V200", productName: "VideoX V200 80TB",  maxCameras: 100, maxStorageTb:  80, msrp: 16640, priceType: "numeric" },
  { sku: "VX5-V400-160", productGroup: "V400", productName: "VideoX V400 160TB", maxCameras: 200, maxStorageTb: 160, msrp: 26910, priceType: "numeric" },
  { sku: "VX5-V500-240", productGroup: "V500", productName: "VideoX V500 240TB", maxCameras: 275, maxStorageTb: 240, msrp: 35926, priceType: "numeric" },
  { sku: "VX5-V600-320", productGroup: "V600", productName: "VideoX V600 320TB", maxCameras: 275, maxStorageTb: 320, msrp: 41659, priceType: "numeric" },
  { sku: "VX5-V700-480", productGroup: "V700", productName: "VideoX V700 480TB", maxCameras: 325, maxStorageTb: 480, msrp: 54512, priceType: "numeric" },
  { sku: "VX5-V800-720", productGroup: "V800", productName: "VideoX V800 720TB", maxCameras: 325, maxStorageTb: 720, msrp: 74048, priceType: "numeric" },
];

const tb = (n: number) => n * GB_PER_TB;

describe("recommend", () => {
  it("small workload fits one VX5-V200-80 (cheapest single unit)", () => {
    const r = recommend({ totalCameras: 50, totalStorageGb: tb(5) }, SPECS);
    assert.equal(r.winner.sku, "VX5-V200-80");
    assert.equal(r.winner.productGroup, "V200");
    assert.equal(r.winner.units, 1);
    assert.equal(r.winner.totalCostUsd, 16640);
    assert.equal(r.warnings.length, 0);
  });

  it("medium workload — 1x VX5-V400-160 beats 2x V200 on total cost", () => {
    // 150 cams, 100 TB.
    // V200: ceil(150/100)=2; ceil(100/80)=2 -> 2 units * $16640 = $33,280
    // V400: ceil(150/200)=1; ceil(100/160)=1 -> 1 unit  * $26910 = $26,910  <- winner
    const r = recommend({ totalCameras: 150, totalStorageGb: tb(100) }, SPECS);
    assert.equal(r.winner.sku, "VX5-V400-160");
    assert.equal(r.winner.units, 1);
    assert.equal(r.winner.totalCostUsd, 26910);
    assert.equal(r.warnings.length, 0);
  });

  it("large workload — VX5-V500-240 cheapest at 2 units", () => {
    // 500 cams, 400 TB.
    // V200: ceil(500/100)=5; ceil(400/80)=5  -> 5 * $16640 = $83,200
    // V400: ceil(500/200)=3; ceil(400/160)=3 -> 3 * $26910 = $80,730
    // V500: ceil(500/275)=2; ceil(400/240)=2 -> 2 * $35926 = $71,852  <- winner
    // V600: ceil(500/275)=2; ceil(400/320)=2 -> 2 * $41659 = $83,318
    const r = recommend({ totalCameras: 500, totalStorageGb: tb(400) }, SPECS);
    assert.equal(r.winner.sku, "VX5-V500-240");
    assert.equal(r.winner.units, 2);
    assert.equal(r.winner.totalCostUsd, 71852);
    // 500 cams > 325 (V600/V700/V800 max_cameras = largest single-unit cam
    // capacity), so the exceeds-largest warning also fires alongside the
    // units>1 warning.
    assert.equal(r.warnings.length, 2);
    assert.match(r.warnings[0], /stacks 2 units of VX5-V500-240/);
    assert.ok(r.warnings.some((w) => /exceeds the largest single VideoX SKU/.test(w)));
  });

  it("camera-pathological — 5000 cams, 1 TB triggers exceeds-largest warning", () => {
    const r = recommend({ totalCameras: 5000, totalStorageGb: tb(1) }, SPECS);
    // V200: ceil(5000/100)=50 * $16640 = $832,000
    // V400: ceil(5000/200)=25 * $26910 = $672,750  <- winner
    // V500: ceil(5000/275)=19 * $35926 = $682,594
    // V600: ceil(5000/275)=19 * $41659 = $791,521
    // V700: ceil(5000/325)=16 * $54512 = $872,192
    // V800: ceil(5000/325)=16 * $74048 = $1,184,768
    assert.equal(r.winner.sku, "VX5-V400-160");
    assert.equal(r.winner.units, 25);
    assert.equal(r.winner.totalCostUsd, 672750);
    assert.equal(r.winner.driverDimension, "cameras");
    assert.equal(r.warnings.length, 2);
    assert.ok(r.warnings.some((w) => /exceeds the largest single VideoX SKU/.test(w)));
  });

  it("storage-pathological — 1 cam, 1000 TB drives unit count by storage", () => {
    const r = recommend({ totalCameras: 1, totalStorageGb: tb(1000) }, SPECS);
    // V200: ceil(1000/80)=13 * $16640 = $216,320
    // V400: ceil(1000/160)=7 * $26910 = $188,370
    // V500: ceil(1000/240)=5 * $35926 = $179,630
    // V600: ceil(1000/320)=4 * $41659 = $166,636
    // V700: ceil(1000/480)=3 * $54512 = $163,536
    // V800: ceil(1000/720)=2 * $74048 = $148,096  <- winner
    assert.equal(r.winner.sku, "VX5-V800-720");
    assert.equal(r.winner.units, 2);
    assert.equal(r.winner.driverDimension, "storage");
    assert.equal(r.warnings.length, 2);
    assert.ok(r.warnings.some((w) => /exceeds the largest single VideoX SKU/.test(w)));
  });

  it("rejects empty specs", () => {
    assert.throws(
      () => recommend({ totalCameras: 1, totalStorageGb: 1 }, []),
      /specs list is empty/,
    );
  });

  it("rejects zero cameras", () => {
    assert.throws(
      () => recommend({ totalCameras: 0, totalStorageGb: 0 }, SPECS),
      /totalCameras must be > 0/,
    );
  });

  it("alternatives are returned and ordered by cost", () => {
    const r = recommend({ totalCameras: 50, totalStorageGb: tb(5) }, SPECS);
    assert.equal(r.alternatives.length, SPECS.length - 1);
    for (let i = 1; i < r.alternatives.length; i++) {
      assert.ok(
        r.alternatives[i].totalCostUsd >= r.alternatives[i - 1].totalCostUsd,
        `alternatives[${i}] (${r.alternatives[i].sku} @ ${r.alternatives[i].totalCostUsd}) should be >= alternatives[${i - 1}] (${r.alternatives[i - 1].sku} @ ${r.alternatives[i - 1].totalCostUsd})`,
      );
    }
  });

  // Phase 2 Step 4 — MKT/CFQ filter (Q4(a) in
  // docs/phase-2/step-3-and-4-schema-and-algorithm.md).
  it("MKT and CFQ SKUs are filtered out of the candidate pool", () => {
    // A workload that VX5-V200-80 fits trivially, with two MKT/CFQ SKUs that
    // would be "cheaper" if their msrp counted ($0 placeholder). The algorithm
    // must skip them and return the numeric V200 anyway.
    const mixed: ServerSpec[] = [
      ...SPECS,
      { sku: "VX5-MKT-DUMMY", productGroup: "MKT", productName: "Market dummy", maxCameras: 9999, maxStorageTb: 9999, msrp: 0,  priceType: "market" },
      { sku: "VX5-CFQ-DUMMY", productGroup: "CFQ", productName: "CFQ dummy",    maxCameras: 9999, maxStorageTb: 9999, msrp: 0,  priceType: "call_for_quote" },
    ];
    const r = recommend({ totalCameras: 50, totalStorageGb: tb(5) }, mixed);
    assert.equal(r.winner.sku, "VX5-V200-80");
    assert.ok(r.alternatives.every((c) => c.sku !== "VX5-MKT-DUMMY"));
    assert.ok(r.alternatives.every((c) => c.sku !== "VX5-CFQ-DUMMY"));
  });

  it("throws when no numeric-priced SKUs remain after filtering", () => {
    const allMkt: ServerSpec[] = [
      { sku: "VX5-MKT-A", productGroup: "MKT", productName: "A", maxCameras: 100, maxStorageTb: 80, msrp: 0, priceType: "market" },
    ];
    assert.throws(
      () => recommend({ totalCameras: 50, totalStorageGb: tb(5) }, allMkt),
      /no numeric-priced SKUs/,
    );
  });

  // Phase 2 Step 4 — tighter-fit tie-break (tertiary; see ADR 0032).
  it("tighter-fit tie-break: same cost + same units -> smaller excess wins", () => {
    // Two synthetic SKUs at identical msrp with identical units required for
    // the workload, but TIE-A has tighter cam-fit. With totalCost ($1000)
    // and units (1) equal, excess in driver (cameras) decides:
    //   TIE-A: 100 - 50 = 50 excess
    //   TIE-B: 200 - 50 = 150 excess  -> A wins
    const tieSpecs: ServerSpec[] = [
      { sku: "TIE-A", productGroup: "TIE", productName: "Tight A",   maxCameras: 100, maxStorageTb: 10, msrp: 1000, priceType: "numeric" },
      { sku: "TIE-B", productGroup: "TIE", productName: "Loose B",   maxCameras: 200, maxStorageTb: 10, msrp: 1000, priceType: "numeric" },
    ];
    const r = recommend({ totalCameras: 50, totalStorageGb: tb(5) }, tieSpecs);
    assert.equal(r.winner.sku, "TIE-A");
    assert.equal(r.winner.totalCostUsd, 1000);
    assert.equal(r.winner.units, 1);
  });
});
