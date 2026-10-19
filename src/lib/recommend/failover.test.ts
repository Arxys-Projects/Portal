import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { recommendFailover } from "./failover";
import { GB_PER_TB, type ServerSpec } from "./types";
import { FROZEN_POOL } from "./seeded-pool.test-fixtures";
import { AVAILABLE_CAPACITY_FACTOR } from "@/lib/capacity-utils";
import { UTILIZATION_DEFAULT_PCT } from "@/lib/calculator/tables";

// The frozen 2026-08-12 recommender pool (18 SKUs, V200 to V800), the same file
// the golden harness sizes against. Its figures reproduce the brief's Step 0
// item 5 illustration exactly (V700-480 at $75,995, V800-864 at $117,054).
const POOL = FROZEN_POOL;

const tb = (n: number) => n * GB_PER_TB;
const spec = (
  sku: string,
  maxCameras: number,
  usableStorageTb: number,
  msrp: number,
  extra: Partial<ServerSpec> = {},
): ServerSpec => ({
  sku,
  productGroup: sku.split("-")[0],
  productName: sku,
  maxCameras,
  maxStorageTb: usableStorageTb,
  usableStorageTb,
  msrp,
  priceType: "numeric",
  ...extra,
});

describe("recommendFailover: count", () => {
  const pool = [spec("P-1", 100, 100, 1000), spec("F-1", 100, 100, 500)];
  const groups = [{ storageGb: tb(10), retentionDays: 30 }];

  it("is ceil(primary units ÷ primaries per failover)", () => {
    const cases: Array<[units: number, ratio: number, expected: number]> = [
      [1, 2, 1],
      [2, 2, 1],
      [3, 2, 2],
      [18, 2, 9],
      [7, 3, 3],
      [5, 1, 5],
      [4, 10, 1],
    ];
    for (const [units, ratio, expected] of cases) {
      const r = recommendFailover({ sku: "P-1", units }, groups, 15, ratio, pool);
      assert.equal(r.units, expected, `${units} primaries at ${ratio} per failover`);
      assert.equal(r.choice?.units, expected);
    }
  });
});

describe("recommendFailover: sizing", () => {
  it("Escambia shape: 18 × V800-864 at half retention gives 9 × V700-480 (Step 0 item 5)", () => {
    // ~690 TB of required capacity per primary at a uniform 30 days.
    const groups = [{ storageGb: tb(18 * 690), retentionDays: 30 }];
    const r = recommendFailover({ sku: "VX5-V800-864", units: 18 }, groups, 15, 2, POOL);
    assert.equal(r.units, 9);
    assert.equal(r.requiredMaxCameras, 325);
    assert.ok(Math.abs(r.requiredPerUnitTb - 345) < 1e-9);
    assert.equal(r.choice?.sku, "VX5-V700-480");
    assert.equal(r.choice?.usableStorageTb, 400);
    assert.equal(r.choice?.unitMsrp, 75995);
    assert.deepEqual(r.warnings, []);
  });

  it("sizes on required capacity, the primary's basis (ADR 0159)", () => {
    // On the recorded-data basis (no buffer, no binary charge) each unit would
    // need about 271 TB, which a V700-384 holds. On the primary's basis it needs
    // 345 TB, a V700-480. This pins the difference ADR 0159 records.
    const required = tb(18 * 690);
    const recorded = required * (UTILIZATION_DEFAULT_PCT / 100) * AVAILABLE_CAPACITY_FACTOR;
    const onRecorded = recommendFailover(
      { sku: "VX5-V800-864", units: 18 },
      [{ storageGb: recorded, retentionDays: 30 }],
      15,
      2,
      POOL,
    );
    assert.equal(onRecorded.choice?.sku, "VX5-V700-384");
    const onRequired = recommendFailover(
      { sku: "VX5-V800-864", units: 18 },
      [{ storageGb: required, retentionDays: 30 }],
      15,
      2,
      POOL,
    );
    assert.equal(onRequired.choice?.sku, "VX5-V700-480");
  });

  it("mixed retention: daily load is each group's storage ÷ its own retention, summed", () => {
    // 100 TB kept 20 days writes 5 TB/day; 300 TB kept 100 days writes 3 TB/day.
    // Total ÷ longest retention would say 4 TB/day and under-size the failover.
    const groups = [
      { storageGb: tb(100), retentionDays: 20 },
      { storageGb: tb(300), retentionDays: 100 },
    ];
    const r = recommendFailover({ sku: "VX5-V500-240", units: 2 }, groups, 15, 2, POOL);
    assert.ok(Math.abs(r.dailyLoadGb - tb(8)) < 1e-6);
    // Both retentions exceed 15 days: 8 TB/day × 15 days ÷ 2 primaries = 60 TB.
    assert.ok(Math.abs(r.requiredPerUnitTb - 60) < 1e-9);
    assert.equal(r.units, 1);
    // ≥ 275 cameras and ≥ 60 TB: the V500-192 (160 TB, $42,577) is the cheapest.
    assert.equal(r.choice?.sku, "VX5-V500-192");
  });

  it("failover days past a short group's retention still multiply its daily load (the locked formula)", () => {
    // 50 failover days on a 20-day group and a 100-day group: (5 + 3) TB/day x 50
    // = 400 TB for one primary. Capping each group at its own retention would ask
    // for 100 + 150 = 250 TB (a V700-384); ADR 0159 records that alternative.
    const groups = [
      { storageGb: tb(100), retentionDays: 20 },
      { storageGb: tb(300), retentionDays: 100 },
    ];
    const r = recommendFailover({ sku: "VX5-V700-480", units: 1 }, groups, 50, 2, POOL);
    assert.equal(r.requiredPerUnitTb, 400);
    assert.equal(r.choice?.sku, "VX5-V700-480");
  });

  it("each failover must match the primary SKU's camera capacity", () => {
    // Storage is trivial, so a V200 or V400 would be cheapest if cameras did not count.
    const r = recommendFailover(
      { sku: "VX5-V600-320", units: 1 },
      [{ storageGb: tb(1), retentionDays: 30 }],
      15,
      2,
      POOL,
    );
    assert.equal(r.requiredMaxCameras, 275);
    assert.ok((r.choice?.maxCameras ?? 0) >= 275);
    assert.equal(r.choice?.sku, "VX5-V500-192");
  });

  it("no qualifying SKU: no choice, a warning, and the count still given", () => {
    // 2 × 900 TB per primary at 30 days; 30 failover days needs 900 TB per unit,
    // above the largest usable in the pool (V800-864, 720 TB).
    const r = recommendFailover(
      { sku: "VX5-V800-864", units: 2 },
      [{ storageGb: tb(1800), retentionDays: 30 }],
      30,
      2,
      POOL,
    );
    assert.equal(r.choice, null);
    assert.equal(r.units, 1);
    assert.ok(Math.abs(r.requiredPerUnitTb - 900) < 1e-9);
    assert.equal(r.warnings.length, 1);
    assert.match(r.warnings[0], /No failover server fits: each one needs 900 TB usable and 325 cameras/);
  });
});

describe("recommendFailover: pool and filters", () => {
  const groups = [{ storageGb: tb(10), retentionDays: 30 }];

  it("excludeOneU applies to the failover too", () => {
    // A hypothetical 1U box that clears both floors and is cheapest.
    const pool = [
      spec("P-2U", 300, 100, 5000, { rackUnits: "2U", sfpAddon: "Optional" }),
      spec("F-1U", 400, 100, 1000, { rackUnits: "1U", sfpAddon: "No" }),
      spec("F-2U", 300, 100, 3000, { rackUnits: "2U", sfpAddon: "Optional" }),
    ];
    const off = recommendFailover({ sku: "P-2U", units: 2 }, groups, 15, 2, pool);
    assert.equal(off.choice?.sku, "F-1U");
    const on = recommendFailover({ sku: "P-2U", units: 2 }, groups, 15, 2, pool, { excludeOneU: true });
    assert.equal(on.choice?.sku, "F-2U");
  });

  it("never picks an MKT or CFQ SKU", () => {
    const pool = [
      spec("P-1", 100, 100, 5000),
      spec("F-MKT", 999, 999, 0, { priceType: "market" }),
      spec("F-CFQ", 999, 999, 1, { priceType: "call_for_quote" }),
      spec("F-1", 100, 100, 3000),
    ];
    const r = recommendFailover({ sku: "P-1", units: 1 }, groups, 15, 2, pool);
    assert.equal(r.choice?.sku, "F-1");
  });

  it("on a price tie, the tighter storage fit wins", () => {
    const pool = [spec("P-1", 100, 100, 5000), spec("F-B", 100, 200, 3000), spec("F-A", 100, 120, 3000)];
    const r = recommendFailover({ sku: "P-1", units: 1 }, groups, 15, 2, pool);
    assert.equal(r.choice?.sku, "F-A");
  });

  it("refuses bad input rather than guess", () => {
    const pool = [spec("P-1", 100, 100, 5000)];
    assert.throws(() => recommendFailover({ sku: "NOPE", units: 1 }, groups, 15, 2, pool), /not in the candidate pool/);
    assert.throws(() => recommendFailover({ sku: "P-1", units: 0 }, groups, 15, 2, pool), /primary units/);
    // Failover days are whole days, 1 or more: 0 and fractions are refused here,
    // and resolveSystemDesign refuses them before sizing ever runs.
    assert.throws(() => recommendFailover({ sku: "P-1", units: 1 }, groups, 0, 2, pool), /failover days/);
    assert.throws(() => recommendFailover({ sku: "P-1", units: 1 }, groups, 1.5, 2, pool), /failover days/);
    assert.throws(() => recommendFailover({ sku: "P-1", units: 1 }, groups, 15, 0, pool), /primaries per failover/);
    assert.throws(() => recommendFailover({ sku: "P-1", units: 1 }, groups, 15, 1.5, pool), /primaries per failover/);
    assert.throws(() => recommendFailover({ sku: "P-1", units: 1 }, [], 15, 2, pool), /no camera groups/);
    assert.throws(
      () => recommendFailover({ sku: "P-1", units: 1 }, [{ storageGb: 1, retentionDays: 0 }], 15, 2, pool),
      /retention > 0/,
    );
    assert.throws(
      () => recommendFailover({ sku: "P-1", units: 1 }, groups, 15, 2, pool, { excludeOneU: true }),
      /no SKUs left/,
    );
  });
});
