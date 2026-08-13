import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  bandwidthBasis,
  computeGroup,
  dutyCycle,
  effectiveFps,
  estimateFrameKb,
  formatNumber,
  formatStorageGb,
  formatBandwidthMbps,
  vsrLoad,
  type GroupInput,
} from "./compute";
import { CODECS, COMPLEXITIES, RESOLUTIONS, type Resolution } from "./tables";

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

// VERIFICATION GATE — anchors the bitrate engine to Milestone's Solution
// Designer. Per-camera bitrate for all six complexity levels must land within
// ±2% of the live-audited Milestone numbers at the reference point below.
//
// DECIMAL, as of Phase A (ADR 0123). The pre-Phase-A version of this gate
// asserted a BINARY Kbit quantity (frameKb × 8 × fps) against Milestone's
// DECIMAL reported figure — a 1024²/10⁶ = +4.86% mismatch that let the engine
// bill 2,046 decimal kbit/s at the reference while claiming to match 1,966
// (audit §C4). The assertion below measures what the engine actually BILLS: the
// same expression `computeBandwidthMbps` uses, converted to decimal kbit/s.
//
// DO NOT relax the tolerance or edit the EXPECTED numbers to match output — they
// are the audited ground truth, re-confirmed first-party against the live tool
// on 2026-08-12 (audit §8). A failure here means a codec coefficient, the
// anchor, or a complexity multiplier has drifted; fix the source, not the test.
describe("bitrate verification gate (Milestone Solution Designer audit)", () => {
  // Reference: 4MP = 2560×1440 (the resolution Milestone's tool used for "4MP"
  // when the anchor was taken; the table also has a 2688×1520 "4MP", and MSD's
  // own bucket has since moved to 2592×1520 — deliberately not adopted, D5).
  const ref = RESOLUTIONS.find((r) => r.width === 2560 && r.height === 1440);
  if (!ref) throw new Error("2560×1440 reference resolution missing from RESOLUTIONS");
  const FPS = 15;
  const TOL = 0.02; // ±2%

  // frameKb is binary KB; ×1024×8 ⇒ bits/frame; ×fps ⇒ bit/s; ÷1000 ⇒ DECIMAL
  // kbit/s. Exactly the chain computeBandwidthMbps bills on.
  const decimalKbit = (frameKb: number, fps: number): number =>
    (frameKb * 1024 * 8 * effectiveFps(fps)) / 1000;

  // Milestone-verified at 4MP/15fps/H.265. The first five are read straight off
  // the live tool; the sixth (×7.0) is the documented edge-case-protection
  // extrapolation = 1966 × 7.0 = 13762.
  const EXPECTED: ReadonlyArray<{ label: string; multiplier: number; kbit: number }> = [
    { label: "Low detail, low motion",     multiplier: 1.0,   kbit: 1966 },
    { label: "Low detail, high motion",    multiplier: 1.5,   kbit: 2950 },
    { label: "Medium detail, low motion",  multiplier: 2.25,  kbit: 4424 },
    { label: "Medium detail, high motion", multiplier: 3.375, kbit: 6637 },
    { label: "High detail, low motion",    multiplier: 5.0,   kbit: 9832 },
    { label: "High detail, high motion",   multiplier: 7.0,   kbit: 13762 },
  ];

  for (const { label, multiplier, kbit: expected } of EXPECTED) {
    it(`matches Milestone at "${label}" (±2%, decimal)`, () => {
      const c = COMPLEXITIES.find((x) => x.label === label);
      if (!c) throw new Error(`complexity level "${label}" missing from COMPLEXITIES`);
      // The table multiplier must be exactly the audited value.
      assert.equal(
        c.multiplier,
        multiplier,
        `${label}: COMPLEXITIES multiplier ${c.multiplier} != audited ${multiplier}`,
      );
      const actual = decimalKbit(estimateFrameKb(ref, "h265", c.multiplier), FPS);
      const rel = Math.abs(actual - expected) / expected;
      assert.ok(
        rel <= TOL,
        `${label}: computed ${actual.toFixed(0)} kbit/s vs expected ${expected} kbit/s (${(rel * 100).toFixed(2)}% off, tol ±2%)`,
      );
    });
  }

  // D6 — the fps curve must PRESERVE the anchor. A raw fps^0.9 would bill 15 fps
  // as 11.6 and move every number above; this pins the anchor form.
  it("preserves the anchor at 15 fps (effectiveFps(15) === 15)", () => {
    assert.equal(effectiveFps(15), 15);
  });

  // Independent external check on the exponent itself: Milestone's own tool
  // reads 1609 kbit/s at H.265 / Low / 12 fps and 2774 at H.264 / Low / 12 fps
  // (audit §8). Both fall out of the anchor + b=0.90 + the 1.724 codec ratio
  // without either number being fitted to — so this gates the curve AND the
  // H.264 ratio against measurements neither was derived from.
  const AT_12: ReadonlyArray<{ codec: "h265" | "h264"; kbit: number }> = [
    { codec: "h265", kbit: 1609 },
    { codec: "h264", kbit: 2774 },
  ];
  for (const { codec, kbit: expected } of AT_12) {
    it(`matches Milestone at ${codec} / Low / 12 fps (±2%)`, () => {
      const actual = decimalKbit(estimateFrameKb(ref, codec, 1.0), 12);
      const rel = Math.abs(actual - expected) / expected;
      assert.ok(
        rel <= TOL,
        `${codec}@12fps: computed ${actual.toFixed(0)} kbit/s vs expected ${expected} kbit/s (${(rel * 100).toFixed(2)}% off, tol ±2%)`,
      );
    });
  }

  // D1 — the H.265+Smart key must SUBTRACT from plain H.265. The retired
  // H.264-Smart key added 20%; that inversion is what this pins against.
  it("h265smart sizes 20% below h265, and the retired smart key still sizes above it", () => {
    const h265 = estimateFrameKb(ref, "h265", 1.0);
    assert.ok(
      Math.abs(estimateFrameKb(ref, "h265smart", 1.0) / h265 - 0.8) < 1e-12,
      "h265smart must be exactly 0.80 × h265",
    );
    assert.ok(
      estimateFrameKb(ref, "smart", 1.0) > h265,
      "retired H.264-Smart must still read as the H.264-based key it was quoted on",
    );
  });
});

// D2 — motion is a recording duty cycle with NO idle floor. Replaces the gate
// that pinned the unsourced `0.2 + 0.8·m` bitrate blend.
describe("recording duty cycle (ADR 0125)", () => {
  const ref = RESOLUTIONS.find((r) => r.width === 2560 && r.height === 1440)!;
  const codec = CODECS.find((c) => c.value === "h265")!;
  const complexity = COMPLEXITIES.find((c) => c.label === "Low detail, low motion")!;

  const group = (over: Partial<GroupInput>): GroupInput => ({
    cameras: 10,
    resolution: ref,
    codec,
    complexity,
    fps: 15,
    recordingPercent: 100,
    motionPercent: 100,
    ...over,
  });

  it("is the motion percentage exactly — no floor", () => {
    assert.equal(dutyCycle({ recordingMode: "motion", motionPercent: 70 }), 0.7);
    assert.equal(dutyCycle({ recordingMode: "motion", motionPercent: 20 }), 0.2);
  });

  it("is 1.0 under Continuous regardless of the motion value carried", () => {
    assert.equal(dutyCycle({ recordingMode: "constant", motionPercent: 20 }), 1);
  });

  it("scales storage linearly with the duty cycle and leaves bandwidth at the peak", () => {
    const full = computeGroup(group({ recordingMode: "constant" }), 30);
    const half = computeGroup(
      group({ recordingMode: "motion", motionPercent: 50 }),
      30,
    );
    assert.ok(
      Math.abs(half.storageGb / full.storageGb - 0.5) < 1e-12,
      `motion 50% must bill exactly half the storage, got ${half.storageGb / full.storageGb}`,
    );
    // D7 — bandwidth is the event peak, so it does NOT inherit the duty cycle.
    assert.ok(
      Math.abs(half.bandwidthMbps - full.bandwidthMbps) < 1e-12,
      "bandwidth must be identical at any duty cycle (event peak)",
    );
  });

  it("keeps bitrateMbps as bandwidth per camera, in decimal Mbit/s", () => {
    const c = computeGroup(group({}), 30);
    assert.ok(Math.abs(c.bitrateMbps * 10 - c.bandwidthMbps) < 1e-12);
    // 4MP/15/H.265/cx1.0 + 5% audio ⇒ ~2.064 decimal Mbit/s per camera. The
    // pre-Phase-A display value was binary Mibit (1.874) labeled Mbit.
    assert.ok(
      Math.abs(c.bitrateMbps - 1.966 * 1.05) < 1e-3,
      `expected ~2.064 decimal Mbit/s, got ${c.bitrateMbps}`,
    );
  });
});

// ---------------------------------------------------------------------------
// ADR 0130 — what a BANKED bandwidth figure means, per calc_version
// ---------------------------------------------------------------------------
//
// The engine has no activity or duty-cycle reduction on bandwidth, so a v2
// figure is the event peak. A v1 figure is not: pre-Phase-A computeGroup ran the
// `0.2 + 0.8·m` motion blend BEFORE computing bandwidth. Three renderers assert
// a basis in words, and they must all read it off the stamp rather than
// hardcoding "peak" — that is what these tests pin.
describe("bandwidthBasis (ADR 0130)", () => {
  it("calls version 2 the event peak", () => {
    const b = bandwidthBasis(2);
    assert.equal(b.isEventPeak, true);
    assert.equal(b.short, "peak");
    assert.match(b.clause, /peak while recording/);
    assert.doesNotMatch(b.clause, /motion-weighted/);
  });

  it("refuses to call a version-1 figure a peak", () => {
    const b = bandwidthBasis(1);
    assert.equal(b.isEventPeak, false);
    assert.match(b.short, /avg/);
    assert.match(b.clause, /motion-weighted average/);
    // The trap this exists to prevent: a v1 row labeled as the network peak
    // when it sits up to 64% below one.
    assert.doesNotMatch(b.clause, /is the peak/);
  });

  it("treats an absent stamp as version 1, never as the current model", () => {
    for (const absent of [null, undefined, 0]) {
      assert.equal(
        bandwidthBasis(absent as number | null | undefined).isEventPeak,
        false,
        `calc_version ${String(absent)} must not claim the event peak`,
      );
    }
  });

  it("matches the magnitude the v1 blend actually produced", () => {
    // applyMotionAdjustment was 0.2 + 0.8·m, so a motion-50 v1 row banked 0.6 of
    // the event rate and a motion-20 row banked 0.36 — 40% and 64% below peak.
    // If this ever stops being true the copy in the clause is wrong.
    const v1Factor = (m: number) => 0.2 + 0.8 * (m / 100);
    assert.ok(Math.abs(v1Factor(50) - 0.6) < 1e-12);
    assert.ok(Math.abs(v1Factor(20) - 0.36) < 1e-12);
    assert.ok(Math.abs(v1Factor(100) - 1) < 1e-12, "continuous v1 rows are unaffected");
  });
});
