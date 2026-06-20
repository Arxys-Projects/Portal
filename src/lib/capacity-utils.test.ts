import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { usableCapacityTb, utilizationNote } from "./capacity-utils";

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
