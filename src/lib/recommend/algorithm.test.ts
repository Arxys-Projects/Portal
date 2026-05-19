import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { recommend } from "./algorithm";
import { GB_PER_TB, type ServerSpec } from "./types";

// Matches the seed in 20260519052732_step5_submissions_and_seeds.sql.
// list_price_usd is the 1..6 order-proxy from the Step 5 decision.
const SPECS: readonly ServerSpec[] = [
  { productId: "p-v200", modelCode: "V200", maxCameras: 100, maxStorageTb:  64, listPriceUsd: 1 },
  { productId: "p-v400", modelCode: "V400", maxCameras: 200, maxStorageTb: 118, listPriceUsd: 2 },
  { productId: "p-v500", modelCode: "V500", maxCameras: 275, maxStorageTb: 210, listPriceUsd: 3 },
  { productId: "p-v600", modelCode: "V600", maxCameras: 275, maxStorageTb: 300, listPriceUsd: 4 },
  { productId: "p-v700", modelCode: "V700", maxCameras: 325, maxStorageTb: 430, listPriceUsd: 5 },
  { productId: "p-v800", modelCode: "V800", maxCameras: 325, maxStorageTb: 640, listPriceUsd: 6 },
];

const tb = (n: number) => n * GB_PER_TB;

describe("recommend", () => {
  it("small workload fits one V200 (cheapest single unit)", () => {
    const r = recommend({ totalCameras: 50, totalStorageGb: tb(5) }, SPECS);
    assert.equal(r.winner.modelCode, "V200");
    assert.equal(r.winner.units, 1);
    assert.equal(r.winner.totalCostUsd, 1);
    assert.equal(r.warnings.length, 0);
  });

  it("mid workload — 2x V200 beats 1x V400 on tiebreak (cheaper unit price)", () => {
    // 150 cams: V200 needs 2, V400 needs 1.
    // 100 TB: V200 needs ceil(100/64)=2, V400 needs ceil(100/118)=1.
    // Cost: 2*$1 = $2 (V200), 1*$2 = $2 (V400). Tie -> cheaper unit price wins.
    const r = recommend({ totalCameras: 150, totalStorageGb: tb(100) }, SPECS);
    assert.equal(r.winner.modelCode, "V200");
    assert.equal(r.winner.units, 2);
    assert.equal(r.winner.totalCostUsd, 2);
    assert.equal(r.warnings.length, 1); // units>1 warning
    assert.match(r.warnings[0], /stacks 2 units/);
  });

  it("large workload — V500 cheapest at 2 units", () => {
    // 500 cams, 400 TB.
    // V500: ceil(500/275)=2, ceil(400/210)=2 -> 2 units * $3 = $6  <- winner
    // V200: ceil(500/100)=5, ceil(400/64)=7  -> 7 units * $1 = $7
    // V600: ceil(500/275)=2, ceil(400/300)=2 -> 2 units * $4 = $8
    // V700: 2 units * $5 = $10
    const r = recommend({ totalCameras: 500, totalStorageGb: tb(400) }, SPECS);
    assert.equal(r.winner.modelCode, "V500");
    assert.equal(r.winner.units, 2);
    assert.equal(r.winner.totalCostUsd, 6);
  });

  it("camera-pathological — 5000 cams, 1 TB triggers exceeds-largest warning", () => {
    const r = recommend({ totalCameras: 5000, totalStorageGb: tb(1) }, SPECS);
    // V200: ceil(5000/100)=50 * $1 = $50  <- winner on unit-price tiebreak
    // V400: ceil(5000/200)=25 * $2 = $50  (tie on total; loses on unit price)
    assert.equal(r.winner.modelCode, "V200");
    assert.equal(r.winner.units, 50);
    assert.equal(r.winner.totalCostUsd, 50);
    assert.equal(r.warnings.length, 2);
    assert.ok(r.warnings.some((w) => /exceeds the largest single VideoX/.test(w)));
  });

  it("storage-pathological — 1 cam, 1000 TB drives unit count by storage", () => {
    const r = recommend({ totalCameras: 1, totalStorageGb: tb(1000) }, SPECS);
    // V800: ceil(1000/640)=2 -> 2 * $6 = $12
    // V700: ceil(1000/430)=3 -> 3 * $5 = $15
    // V600: ceil(1000/300)=4 -> 4 * $4 = $16
    // V500: ceil(1000/210)=5 -> 5 * $3 = $15
    // V400: ceil(1000/118)=9 -> 9 * $2 = $18
    // V200: ceil(1000/64)=16 -> 16 * $1 = $16
    assert.equal(r.winner.modelCode, "V800");
    assert.equal(r.winner.units, 2);
    assert.equal(r.winner.driverDimension, "storage");
    assert.equal(r.warnings.length, 2);
  });

  it("rejects empty specs", () => {
    assert.throws(() => recommend({ totalCameras: 1, totalStorageGb: 1 }, []), /specs list is empty/);
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
      assert.ok(r.alternatives[i].totalCostUsd >= r.alternatives[i - 1].totalCostUsd);
    }
  });
});
