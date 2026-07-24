import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { coveredCapacity, usableCapacityTb, utilizationNote } from "./capacity-utils";

describe("usableCapacityTb (RAID net-usable)", () => {
  it("RAID 5 reserves one parity drive", () => {
    // V200: 80 raw, 4 drives -> 80 × 3/4 = 60
    assert.equal(usableCapacityTb(80, 4, "5"), 60);
  });

  it("RAID 6 reserves two parity drives", () => {
    // V500: 240 raw, 12 drives -> 240 × 10/12 = 200
    assert.equal(usableCapacityTb(240, 12, "6"), 200);
  });

  it("RAID 60 reserves four parity drives", () => {
    // V700: 480 raw, 24 drives -> 480 × 20/24 = 400 (the deal that exposed the bug)
    assert.equal(usableCapacityTb(480, 24, "60"), 400);
  });

  it("falls back to RAID 5 on unknown level and returns raw when undersized", () => {
    assert.equal(usableCapacityTb(100, 4, "weird"), 75);
    assert.equal(usableCapacityTb(100, 1, "5"), 100);
    assert.equal(usableCapacityTb(null, 8, "6"), null);
  });
});

describe("coveredCapacity (delivered capacity on documents)", () => {
  // V500-192: 275 VSR, 192 raw over 12 drives RAID 6 -> 160 TB net usable.
  const v500_192 = {
    max_cameras: 275,
    storage_raw_tb: 192,
    hdd_count: 12,
    raid_level_display: "6",
  };

  it("reads capacity from the spec row, so a NULL-capacity products row is irrelevant", () => {
    // THE REGRESSION: current_products.max_cameras is NULL for 12 of the 18 pool
    // SKUs (ADR 0094). Reading it rendered "0 cameras covered" and passed the
    // storage requirement off as delivered capacity. The products row is not even
    // an argument here — that is the point.
    const { coveredCameras, coveredStorageTb } = coveredCapacity(1, v500_192, 122);
    assert.equal(coveredCameras, 275);
    assert.equal(coveredStorageTb, 160);
  });

  it("reports net-usable storage, never the raw nameplate (ADR 0068)", () => {
    // V800-720: 36 drives RAID 60 = 3 spans of 12 -> 6 parity -> 600, not 720.
    const { coveredStorageTb } = coveredCapacity(1, {
      max_cameras: 325,
      storage_raw_tb: 720,
      hdd_count: 36,
      raid_level_display: "60",
    }, 0);
    assert.equal(coveredStorageTb, 600);
    assert.notEqual(coveredStorageTb, 720);
  });

  it("scales both dimensions by the unit count", () => {
    const { coveredCameras, coveredStorageTb } = coveredCapacity(3, v500_192, 0);
    assert.equal(coveredCameras, 825);
    assert.equal(coveredStorageTb, 480);
  });

  it("falls back to the required storage only when there is no spec row at all", () => {
    // Legacy UUID-keyed submissions predating the SKU-PK migration. Cameras have
    // no meaningful fallback.
    const { coveredCameras, coveredStorageTb } = coveredCapacity(2, null, 122);
    assert.equal(coveredCameras, 0);
    assert.equal(coveredStorageTb, 122);
  });

  it("still reports storage when the spec row has no camera figure", () => {
    const { coveredCameras, coveredStorageTb } = coveredCapacity(1, {
      ...v500_192,
      max_cameras: null,
    }, 122);
    assert.equal(coveredCameras, 0);
    assert.equal(coveredStorageTb, 160);
  });

  it("falls back on storage when the spec row has no raw capacity", () => {
    const { coveredCameras, coveredStorageTb } = coveredCapacity(1, {
      ...v500_192,
      storage_raw_tb: null,
    }, 122);
    assert.equal(coveredCameras, 275); // cameras are independent
    assert.equal(coveredStorageTb, 122);
  });
});

describe("utilizationNote (honest capacity line, ADR 0068)", () => {
  it("states actual headroom at or under 100%", () => {
    assert.equal(utilizationNote(82.4), "18% headroom");
    assert.equal(utilizationNote(68.9), "31% headroom");
    assert.equal(utilizationNote(100), "0% headroom");
    assert.equal(utilizationNote(0), "100% headroom");
  });

  it("flags over-capacity above 100% — never asserts headroom that does not exist", () => {
    assert.equal(utilizationNote(110), "OVER CAPACITY");
    assert.equal(utilizationNote(100.4), "OVER CAPACITY");
  });
});
