import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickHeadroomOption } from "./headroom";
import type { RecommendationCandidate } from "./types";

function cand(
  sku: string,
  coveredCameras: number,
  coveredStorageTb: number,
  totalCostUsd: number,
  units = 1,
): RecommendationCandidate {
  return {
    sku,
    productGroup: sku,
    productName: sku,
    units,
    unitMsrp: totalCostUsd / units,
    totalCostUsd,
    coveredCameras,
    coveredStorageTb,
    driverDimension: "cameras",
  };
}

describe("pickHeadroomOption", () => {
  const winner = cand("winner", 100, 10, 5000);

  it("returns null when no alternative beats both dimensions", () => {
    const alts = [
      cand("more-cams-only", 200, 5, 8000),   // cameras ok, storage less
      cand("more-storage-only", 50, 20, 8000), // storage ok, cameras less
    ];
    assert.equal(pickHeadroomOption(winner, alts), null);
  });

  it("returns the only qualifying alternative", () => {
    const alts = [cand("bigger", 200, 20, 8000)];
    const result = pickHeadroomOption(winner, alts);
    assert.equal(result?.sku, "bigger");
  });

  it("picks the cheapest qualifying alternative", () => {
    const alts = [
      cand("expensive", 200, 20, 12000),
      cand("cheap", 200, 20, 8000),
    ];
    const result = pickHeadroomOption(winner, alts);
    assert.equal(result?.sku, "cheap");
  });

  it("prefers fewer units when cost is tied", () => {
    const alts = [
      cand("two-units", 200, 20, 10000, 2),
      cand("one-unit", 200, 20, 10000, 1),
    ];
    const result = pickHeadroomOption(winner, alts);
    assert.equal(result?.sku, "one-unit");
  });

  it("requires strictly greater than winner on both dimensions", () => {
    const alts = [
      cand("equal-cams", 100, 20, 8000),   // cameras equal, not strictly greater
      cand("equal-storage", 200, 10, 8000), // storage equal, not strictly greater
    ];
    assert.equal(pickHeadroomOption(winner, alts), null);
  });

  it("returns null for empty alternatives", () => {
    assert.equal(pickHeadroomOption(winner, []), null);
  });
});
