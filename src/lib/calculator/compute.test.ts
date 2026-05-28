import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatNumber, formatStorageGb, formatBandwidthMbps } from "./compute";

describe("formatNumber", () => {
  it("formats numbers below 1000 to two decimals", () => {
    assert.equal(formatNumber(1.5), "1.50");
    assert.equal(formatNumber(999.9), "999.90");
    assert.equal(formatNumber(0), "0.00");
  });

  it("formats numbers >= 1000 to two decimals with thousands separator", () => {
    assert.equal(formatNumber(1000), "1,000.00");
    assert.equal(formatNumber(1234.5), "1,234.50");
    assert.equal(formatNumber(1234.56), "1,234.56");
    // Previously truncated to one decimal — now rounds to two.
    assert.equal(formatNumber(1234.567), "1,234.57");
    assert.equal(formatNumber(10000), "10,000.00");
  });

  it("returns — for non-finite values", () => {
    assert.equal(formatNumber(Infinity), "—");
    assert.equal(formatNumber(NaN), "—");
  });

  it("respects the decimals parameter for sub-1000 values", () => {
    assert.equal(formatNumber(1.5, 0), "2");
    assert.equal(formatNumber(1.5, 1), "1.5");
  });
});

describe("formatStorageGb", () => {
  it("formats GB values below 1000 as GB", () => {
    assert.equal(formatStorageGb(512), "512.00 GB");
  });

  it("formats values >= 1000 GB as TB with two decimals", () => {
    assert.equal(formatStorageGb(1500), "1.50 TB");
    assert.equal(formatStorageGb(2000), "2.00 TB");
  });
});

describe("formatBandwidthMbps", () => {
  it("formats values below 1000 as Mbps", () => {
    assert.equal(formatBandwidthMbps(500), "500.00 Mbps");
  });

  it("formats values >= 1000 as Gbps with two decimals", () => {
    assert.equal(formatBandwidthMbps(1500), "1.50 Gbps");
  });
});
