import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { recommend } from "./algorithm";
import { GB_PER_TB, type ServerSpec } from "./types";
import { usableCapacityTb } from "@/lib/capacity-utils";

// Matches the Phase 2 Step 3+4 seed (one mid-tier SKU per V-family) — real
// MSRPs from the Master Sheet, family-level max_cameras carried forward from
// the old server_specs (Q3(b) decision). usableStorageTb is the RAID
// net-usable figure derived from the real product_specs config (hdd_count +
// raid_level_display, post the 2026-06-05 fix migration) — sizing divides
// against this, not the raw nameplate maxStorageTb. See ADR 0068.
//
// Effective RAID config / usable:
//   V200  80 raw, 4 drv, RAID 5  -> 60   V600 320 raw, 16 drv, RAID 60 -> 240
//   V400 160 raw, 8 drv, RAID 6  -> 120  V700 480 raw, 24 drv, RAID 60 -> 400
//   V500 240 raw, 12 drv, RAID 6 -> 200  V800 720 raw, 36 drv, RAID 60 -> 640
const usable = (raw: number, hdd: number, raid: string) =>
  usableCapacityTb(raw, hdd, raid) as number;

const SPECS: readonly ServerSpec[] = [
  { sku: "VX5-V200-80",  productGroup: "V200", productName: "VideoX V200 80TB",  maxCameras: 100, maxStorageTb:  80, usableStorageTb: usable( 80,  4, "5"),  msrp: 16640, priceType: "numeric" },
  { sku: "VX5-V400-160", productGroup: "V400", productName: "VideoX V400 160TB", maxCameras: 200, maxStorageTb: 160, usableStorageTb: usable(160,  8, "6"),  msrp: 26910, priceType: "numeric" },
  { sku: "VX5-V500-240", productGroup: "V500", productName: "VideoX V500 240TB", maxCameras: 275, maxStorageTb: 240, usableStorageTb: usable(240, 12, "6"),  msrp: 35926, priceType: "numeric" },
  { sku: "VX5-V600-320", productGroup: "V600", productName: "VideoX V600 320TB", maxCameras: 275, maxStorageTb: 320, usableStorageTb: usable(320, 16, "60"), msrp: 41659, priceType: "numeric" },
  { sku: "VX5-V700-480", productGroup: "V700", productName: "VideoX V700 480TB", maxCameras: 325, maxStorageTb: 480, usableStorageTb: usable(480, 24, "60"), msrp: 54512, priceType: "numeric" },
  { sku: "VX5-V800-720", productGroup: "V800", productName: "VideoX V800 720TB", maxCameras: 325, maxStorageTb: 720, usableStorageTb: usable(720, 36, "60"), msrp: 74048, priceType: "numeric" },
];

const tb = (n: number) => n * GB_PER_TB;
const specBySku = (sku: string) => SPECS.find((s) => s.sku === sku)!;

describe("recommend (storage-first, ADR 0068)", () => {
  it("small workload fits one VX5-V200-80 (cheapest single unit)", () => {
    const r = recommend({ totalCameras: 50, totalStorageGb: tb(5), totalVsr: 50 }, SPECS);
    assert.equal(r.winner.sku, "VX5-V200-80");
    assert.equal(r.winner.productGroup, "V200");
    assert.equal(r.winner.units, 1);
    assert.equal(r.winner.totalCostUsd, 16640);
    assert.equal(r.warnings.length, 0);
  });

  it("medium workload — 1x VX5-V400-160 beats 2x V200 on total cost", () => {
    // 150 cams (VSR 150), 100 TB usable required.
    // storage floor 100×1.2=120; VSR floor uses ×1.1.
    // V200: storage ceil(120/60)=2; vsr ceil(165/100)=2 -> 2 * $16640 = $33,280
    // V400: storage ceil(120/120)=1; vsr ceil(165/200)=1 -> 1 * $26910 = $26,910 <- winner
    const r = recommend({ totalCameras: 150, totalStorageGb: tb(100), totalVsr: 150 }, SPECS);
    assert.equal(r.winner.sku, "VX5-V400-160");
    assert.equal(r.winner.units, 1);
    assert.equal(r.winner.totalCostUsd, 26910);
    assert.equal(r.warnings.length, 0);
  });

  it("large workload — VX5-V600-320 cheapest at 2 units (usable-driven)", () => {
    // 500 cams (VSR 500), 400 TB usable. storage floor 480; VSR floor ×1.1.
    // V200: storage ceil(480/60)=8;   vsr ceil(550/100)=6  -> 8 * $16640 = $133,120
    // V400: storage ceil(480/120)=4;  vsr ceil(550/200)=3  -> 4 * $26910 = $107,640
    // V500: storage ceil(480/200)=3;  vsr ceil(550/275)=2  -> 3 * $35926 = $107,778
    // V600: storage ceil(480/240)=2;  vsr ceil(550/275)=2  -> 2 * $41659 = $83,318 <- winner
    // V700: storage ceil(480/400)=2;  vsr ceil(550/325)=2  -> 2 * $54512 = $109,024
    // V800: storage ceil(480/640)=1;  vsr ceil(550/325)=2  -> 2 * $74048 = $148,096
    const r = recommend({ totalCameras: 500, totalStorageGb: tb(400), totalVsr: 500 }, SPECS);
    assert.equal(r.winner.sku, "VX5-V600-320");
    assert.equal(r.winner.units, 2);
    assert.equal(r.winner.totalCostUsd, 83318);
    assert.equal(r.winner.driverDimension, "storage");
    // VSR 500 > 325 (largest single-unit VSR capacity) -> exceeds-largest fires
    // alongside the units>1 warning.
    assert.equal(r.warnings.length, 2);
    assert.match(r.warnings[0], /stacks 2 units of VX5-V600-320/);
    assert.ok(r.warnings.some((w) => /exceeds the largest single VideoX SKU/.test(w)));
  });

  it("camera-pathological — 5000 cams, 1 TB is VSR-driven", () => {
    // VSR 5000, 1 TB usable. storage floor trivial; VSR floor ×1.1 dominates.
    // V200: vsr ceil(5500/100)=55 * $16640 = $915,200
    // V400: vsr ceil(5500/200)=28 * $26910 = $753,480
    // V500: vsr ceil(5500/275)=20 * $35926 = $718,520  <- winner
    // V600: vsr ceil(5500/275)=20 * $41659 = $833,180
    // V700: vsr ceil(5500/325)=17 * $54512 = $926,704
    const r = recommend({ totalCameras: 5000, totalStorageGb: tb(1), totalVsr: 5000 }, SPECS);
    assert.equal(r.winner.sku, "VX5-V500-240");
    assert.equal(r.winner.units, 20);
    assert.equal(r.winner.totalCostUsd, 718520);
    assert.equal(r.winner.driverDimension, "cameras");
    assert.equal(r.warnings.length, 2);
    assert.ok(r.warnings.some((w) => /exceeds the largest single VideoX SKU/.test(w)));
  });

  it("storage-pathological — 1 cam, 1000 TB drives unit count by storage", () => {
    // storage floor 1000×1.2=1200, on net-usable per unit.
    // V200: ceil(1200/60)=20 * $16640 = $332,800
    // V500: ceil(1200/200)=6 * $35926 = $215,556
    // V700: ceil(1200/400)=3 * $54512 = $163,536
    // V800: ceil(1200/640)=2 * $74048 = $148,096  <- winner
    const r = recommend({ totalCameras: 1, totalStorageGb: tb(1000), totalVsr: 1 }, SPECS);
    assert.equal(r.winner.sku, "VX5-V800-720");
    assert.equal(r.winner.units, 2);
    assert.equal(r.winner.driverDimension, "storage");
    assert.equal(r.warnings.length, 2);
    assert.ok(r.warnings.some((w) => /exceeds the largest single VideoX SKU/.test(w)));
  });

  // ── ADR 0068 regression: the real deal that exposed the bug ───────────────
  it("observed failing case — 1,764.3 TB net-usable + 332 cameras is sized with ≥20% headroom", () => {
    const neededUsableTb = 1764.3;
    const totalVsr = 332; // resolution-normalized; nominal-4MP streams
    const r = recommend(
      { totalCameras: 332, totalStorageGb: tb(neededUsableTb), totalVsr },
      SPECS,
    );
    const w = r.winner;
    const spec = specBySku(w.sku);

    // Storage HARD floor (1.2 net-usable) holds — the old engine returned
    // 4×V700 = 1600 usable < 1764.3 (110% over). The fix must clear 1.2×.
    assert.ok(
      w.units * spec.usableStorageTb >= neededUsableTb * 1.2,
      `chosen ${w.units}×${w.sku} usable ${w.units * spec.usableStorageTb} must be >= ${neededUsableTb * 1.2}`,
    );
    // VSR SOFT floor (1.1) holds.
    assert.ok(totalVsr <= (spec.maxCameras * w.units) / 1.1);
    // Honest utilization — comfortably under capacity, not the old 110%.
    const storageUtil = (neededUsableTb / (w.units * spec.usableStorageTb)) * 100;
    assert.ok(storageUtil <= 83, `utilization ${storageUtil}% must be <= ~83%`);
    // coveredStorageTb is net-usable, not raw nameplate.
    assert.equal(w.coveredStorageTb, w.units * spec.usableStorageTb);
    // Storage is the binding constraint and selects the larger-storage V800.
    assert.equal(w.sku, "VX5-V800-720");
    assert.equal(w.units, 4);
  });

  it("storage-first model change — high-storage / low-camera deal picks a larger-storage SKU, not many small units", () => {
    // 2 cameras, 800 TB usable. Cameras are a non-factor; storage alone decides.
    const r = recommend({ totalCameras: 2, totalStorageGb: tb(800), totalVsr: 2 }, SPECS);
    assert.equal(r.winner.productGroup, "V800");
    assert.equal(r.winner.driverDimension, "storage");
    // The cheapest small-SKU alternative needs far more boxes for the same job.
    const v200 = r.alternatives.find((a) => a.productGroup === "V200")!;
    assert.ok(
      v200.units > r.winner.units * 3,
      `V200 needs ${v200.units} units vs winner ${r.winner.units}`,
    );
  });

  it("rejects empty specs", () => {
    assert.throws(
      () => recommend({ totalCameras: 1, totalStorageGb: 1, totalVsr: 1 }, []),
      /specs list is empty/,
    );
  });

  it("rejects zero cameras", () => {
    assert.throws(
      () => recommend({ totalCameras: 0, totalStorageGb: 0, totalVsr: 0 }, SPECS),
      /totalCameras must be > 0/,
    );
  });

  it("alternatives are returned and ordered by cost", () => {
    const r = recommend({ totalCameras: 50, totalStorageGb: tb(5), totalVsr: 50 }, SPECS);
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
    const mixed: ServerSpec[] = [
      ...SPECS,
      { sku: "VX5-MKT-DUMMY", productGroup: "MKT", productName: "Market dummy", maxCameras: 9999, maxStorageTb: 9999, usableStorageTb: 9999, msrp: 0, priceType: "market" },
      { sku: "VX5-CFQ-DUMMY", productGroup: "CFQ", productName: "CFQ dummy",    maxCameras: 9999, maxStorageTb: 9999, usableStorageTb: 9999, msrp: 0, priceType: "call_for_quote" },
    ];
    const r = recommend({ totalCameras: 50, totalStorageGb: tb(5), totalVsr: 50 }, mixed);
    assert.equal(r.winner.sku, "VX5-V200-80");
    assert.ok(r.alternatives.every((c) => c.sku !== "VX5-MKT-DUMMY"));
    assert.ok(r.alternatives.every((c) => c.sku !== "VX5-CFQ-DUMMY"));
  });

  it("throws when no numeric-priced SKUs remain after filtering", () => {
    const allMkt: ServerSpec[] = [
      { sku: "VX5-MKT-A", productGroup: "MKT", productName: "A", maxCameras: 100, maxStorageTb: 80, usableStorageTb: 60, msrp: 0, priceType: "market" },
    ];
    assert.throws(
      () => recommend({ totalCameras: 50, totalStorageGb: tb(5), totalVsr: 50 }, allMkt),
      /no numeric-priced SKUs/,
    );
  });

  // Tighter-fit tie-break (tertiary; see ADR 0032, carried into ADR 0068).
  it("tighter-fit tie-break: same cost + same units -> smaller excess wins", () => {
    // Identical msrp + identical units; storage is the driver and TIE-A has the
    // tighter net-usable fit (less over-provisioning):
    //   TIE-A: 1×10 - 5 =  5 excess  <- wins
    //   TIE-B: 1×20 - 5 = 15 excess
    const tieSpecs: ServerSpec[] = [
      { sku: "TIE-A", productGroup: "TIE", productName: "Tight A", maxCameras: 1000, maxStorageTb: 10, usableStorageTb: 10, msrp: 1000, priceType: "numeric" },
      { sku: "TIE-B", productGroup: "TIE", productName: "Loose B", maxCameras: 1000, maxStorageTb: 20, usableStorageTb: 20, msrp: 1000, priceType: "numeric" },
    ];
    const r = recommend({ totalCameras: 50, totalStorageGb: tb(5), totalVsr: 50 }, tieSpecs);
    assert.equal(r.winner.sku, "TIE-A");
    assert.equal(r.winner.totalCostUsd, 1000);
    assert.equal(r.winner.units, 1);
    assert.equal(r.winner.driverDimension, "storage");
  });
});
