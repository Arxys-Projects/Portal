import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyMotionAdjustment,
  estimateFrameKb,
  formatNumber,
  formatStorageGb,
  formatBandwidthMbps,
  vsrLoad,
} from "./compute";
import { COMPLEXITIES, RESOLUTIONS, type Resolution } from "./tables";

describe("vsrLoad (resolution-normalized camera load, ADR 0068)", () => {
  // Resolution-normalized: vsr = cameras × (megapixels / 4), megapixels = w×h/1e6.
  const res = (width: number, height: number): Resolution => ({ label: "", width, height });
  const r8mp = res(3840, 2160); // 8.2944 MP -> 2.0736 VSR/cam
  const r4mp = res(2560, 1440); // 3.6864 MP -> 0.9216 VSR/cam
  const r2mp = res(1600, 1200); // 1.92 MP   -> 0.48   VSR/cam
  const r720 = res(1280, 720); //  0.9216 MP -> 0.2304 VSR/cam
  const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

  it("scales linearly with camera count and pixel area", () => {
    close(vsrLoad(1, r8mp), 2.0736);
    close(vsrLoad(1, r4mp), 0.9216);
    close(vsrLoad(1, r2mp), 0.48);
    close(vsrLoad(1, r720), 0.2304);
    close(vsrLoad(10, r4mp), 9.216);
  });

  it("sums a mixed-resolution schedule correctly", () => {
    // 5×8MP + 20×4MP + 40×2MP + 100×720p
    const total =
      vsrLoad(5, r8mp) + vsrLoad(20, r4mp) + vsrLoad(40, r2mp) + vsrLoad(100, r720);
    // 10.368 + 18.432 + 19.2 + 23.04 = 71.04
    close(total, 71.04);
  });

  it("zero cameras contribute zero load", () => {
    close(vsrLoad(0, r8mp), 0);
  });
});

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
  it("formats values below 1000 as Mbit/s", () => {
    assert.equal(formatBandwidthMbps(500), "500.00 Mbit/s");
  });

  it("formats values >= 1000 as Gbit/s with two decimals", () => {
    assert.equal(formatBandwidthMbps(1500), "1.50 Gbit/s");
  });
});

// VERIFICATION GATE — re-anchors the bitrate engine to Milestone's XProtect
// calculator. Per-camera bitrate for all six complexity levels must land within
// ±2% of the live-audited Milestone numbers at the reference point below.
//
// DO NOT relax the tolerance or edit the EXPECTED numbers to match output — they
// are the audited ground truth. A failure here means the codec factor
// (CODEC_BITRATE.h265) or a complexity multiplier has drifted; fix the source,
// not the test.
describe("bitrate verification gate (Milestone XProtect audit)", () => {
  // Reference: 4MP = 2560×1440 (the resolution Milestone's tool used for "4MP";
  // the table also has a 2688×1520 "4MP" — the 0.037 anchor is for 2560×1440).
  const ref = RESOLUTIONS.find((r) => r.width === 2560 && r.height === 1440);
  if (!ref) throw new Error("2560×1440 reference resolution missing from RESOLUTIONS");
  const FPS = 15;
  const TOL = 0.02; // ±2%

  // frameKb is in KB; ×8 ⇒ Kbit/frame; ×fps ⇒ Kbit/s. Same derivation the UI uses.
  const bitrateKbit = (frameKb: number): number => frameKb * 8 * FPS;

  // Milestone-verified at 4MP/15fps/H.265/Constant/100% motion. The first five
  // are read straight off the live tool; the sixth (×7.0) is the documented
  // edge-case-protection extrapolation = 1966 × 7.0 = 13762.
  const EXPECTED: ReadonlyArray<{ label: string; multiplier: number; kbit: number }> = [
    { label: "Low detail, low motion",     multiplier: 1.0,   kbit: 1966 },
    { label: "Low detail, high motion",    multiplier: 1.5,   kbit: 2950 },
    { label: "Medium detail, low motion",  multiplier: 2.25,  kbit: 4424 },
    { label: "Medium detail, high motion", multiplier: 3.375, kbit: 6637 },
    { label: "High detail, low motion",    multiplier: 5.0,   kbit: 9832 },
    { label: "High detail, high motion",   multiplier: 7.0,   kbit: 13762 },
  ];

  for (const { label, multiplier, kbit: expected } of EXPECTED) {
    it(`matches Milestone at "${label}" (±2%)`, () => {
      const c = COMPLEXITIES.find((x) => x.label === label);
      if (!c) throw new Error(`complexity level "${label}" missing from COMPLEXITIES`);
      // The table multiplier must be exactly the audited value.
      assert.equal(
        c.multiplier,
        multiplier,
        `${label}: COMPLEXITIES multiplier ${c.multiplier} != audited ${multiplier}`,
      );
      // motion 100% ⇒ adjustment ×1.0, so estimateFrameKb alone is the event rate.
      const actual = bitrateKbit(estimateFrameKb(ref, "h265", c.multiplier));
      const rel = Math.abs(actual - expected) / expected;
      assert.ok(
        rel <= TOL,
        `${label}: computed ${actual.toFixed(0)} Kbit/s vs expected ${expected} Kbit/s (${(rel * 100).toFixed(2)}% off, tol ±2%)`,
      );
    });
  }

  it("applies the 20% motion idle floor (Low/low at motion 20% ⇒ ~708 Kbit/s)", () => {
    const low = COMPLEXITIES.find((x) => x.label === "Low detail, low motion");
    if (!low) throw new Error("\"Low detail, low motion\" missing from COMPLEXITIES");
    const frameKb = applyMotionAdjustment(estimateFrameKb(ref, "h265", low.multiplier), 20);
    const actual = bitrateKbit(frameKb);
    const expected = 1966 * (0.2 + 0.8 * 0.2); // 1966 × 0.36 ≈ 708
    const rel = Math.abs(actual - expected) / expected;
    assert.ok(
      rel <= TOL,
      `motion floor: computed ${actual.toFixed(0)} Kbit/s vs expected ${expected.toFixed(0)} Kbit/s (${(rel * 100).toFixed(2)}% off, tol ±2%)`,
    );
  });
});
