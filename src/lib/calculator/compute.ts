import {
  type Codec,
  type CodecValue,
  type Complexity,
  type Resolution,
  UTILIZATION_DEFAULT_PCT,
  clampUtilizationPct,
} from "./tables";
import { AVAILABLE_CAPACITY_FACTOR } from "../capacity-utils";

// ---------------------------------------------------------------------------
// The sizing stack (calculator math rework, ADRs 0123–0133)
// ---------------------------------------------------------------------------
//
//   modeled video            ← accurate: anchor, fps curve, codec, duty cycle,
//                               each group at ITS OWN retention (0132)
//     = required recorded data ← the Milestone-comparable figure
//     ÷ utilization%  (0126)   ← THE ONE BUFFER, default 88% (0131)
//     ÷ 0.8931        (0127)   ← physics: decimal → VMS-visible
//     = required decimal RAID-net capacity
//     ÷ parity ratio (usableCapacityTb, unchanged)
//     = required drive nameplate → SKU selection
//
// Governing principle: ONE deliberate buffer, everything else models reality as
// accurately as the evidence supports. Accuracy corrections are not repurposed
// as hidden margin, and margin is not hidden inside accuracy. What this replaced
// was four overlapping margins — a +4.07% bitrate bias, a ×1.2 "database
// overhead", a ×1.2 hardware floor, and an unsourced 0.2 motion floor — none
// individually stated and none ever multiplied together.
//
// The Phase A stack had one more term: a per-group audio/metadata toggle
// applying +5% to the stream rate. ADR 0131 reversed it — audio and analytics
// metadata are fixed kbit/s add-ons, not a percentage of video bitrate, so a
// flat percentage was wrong in both directions at once and the honest combined
// magnitude (0–4%, skewed low) does not earn a UI control. It is gone from
// bandwidth entirely and folded into the buffer default on storage.
// See docs/audits/calculator-math-audit.md and docs/calculator-math-phase-2-plan.md.

/**
 * The sizing model a submission was produced by, banked on every row as
 * `submissions.calc_version`.
 *
 *   1 — everything before Phase A. Raw video at the +4.07% binary/decimal
 *       anchor, ×1.2 STORAGE_OVERHEAD, ×1.2 STORAGE_FLOOR in the recommender,
 *       the `0.2 + 0.8·m` motion blend, no binary charge, no audio term.
 *   2 — Phase A (ADRs 0123–0128). Re-anchored bitrate, motion as an exact duty
 *       cycle, one Max disk utilization buffer defaulting to 90%, the
 *       decimal→binary charge, and a +5% audio/metadata term on the stream rate.
 *   3 — Phases B + the D8 reversal (ADRs 0131–0133). The audio/metadata term is
 *       gone; the buffer default tightened 90% → 88% to carry a small
 *       storage-only cushion in its place; retention is PER CAMERA GROUP.
 *
 * `storage_tb` means something different at each of these boundaries, so nothing
 * should compare the column across one without checking the stamp. `retention_days`
 * also changes meaning at 3: on a version 1/2 row it is the single retention
 * every group was sized at, and on a version 3 row it is the LONGEST group
 * retention, with the per-group values in `groups_payload`.
 *
 * Nothing is ever backfilled across a boundary — no single utilization value
 * reproduces the old ×1.44 under version-2 semantics, and version 1/2 rows carry
 * no per-group retention to recover. Banked rows render their banked values.
 */
export const CALC_VERSION = 3;

// ---------------------------------------------------------------------------
// Bitrate anchor (ADR 0123, D5)
// ---------------------------------------------------------------------------
//
// FULL re-anchor to Milestone's decimal figure. The ADR 0050 anchor matched a
// BINARY Kbit quantity against Milestone's DECIMAL reported figure, so at the
// reference point the engine billed 2,046 decimal kbit/s where Milestone says
// 1,966: +1.63% intended rounding plus +2.44% nobody chose (audit §C4).
// Re-anchored exactly, because the buffer slider is now the declared margin and
// the bitrate has to be accurate rather than quietly padded.
//
// Reference point: 2560×1440 · 15 fps · H.265 · complexity 1.0 → 1,966 decimal
// kbit/s. Re-confirmed first-party against the live Milestone Solution Designer
// on 2026-08-12 (audit §8), so this is a reproducible anchor, not a historical
// one.
const ANCHOR_KBIT_PER_SEC = 1966;
const ANCHOR_PIXELS = 2560 * 1440;
const ANCHOR_FPS = 15;

// Bits per pixel per frame. Derived rather than hardcoded so the anchor above is
// the single source of truth and the reference point reproduces exactly.
const H265_BPP = (ANCHOR_KBIT_PER_SEC * 1000) / (ANCHOR_PIXELS * ANCHOR_FPS);

// H.264 : H.265 = 1.724 — the live MSD measurement (H.264/Low/12 fps = 2774 vs
// H.265/Low/12 fps = 1609, audit §8), NOT the legacy inherited 1.714 whose
// 0.12/0.07 ratio traces to the unsourced legacy calculator. Since the whole
// table is anchored to Milestone, the ratio comes from Milestone too.
// Confirmed with Andy 2026-08-12.
const H264_RATIO = 1.724;

// H.265 + Smart Codec = 20% below plain H.265 (ADR 0124, D1).
//
// 20% is the deliberately conservative END of the evidence, not its midpoint.
// Vendor claims run 30–80% (Hikvision 66.8% avg, Axis Zipstream "50%+", Hanwha
// 30–80%); independent measurement is much lower and scene-dependent (IPVM
// 20–30% on H.265+; Benchmark measured 47% in good weather collapsing to 7–18%
// in rain). 20% is the measured floor for constant-motion scenes. Rationale:
// never risk under-spec.
const H265_SMART_RATIO = 0.8;

// Retired (ADR 0124). H.264-Smart: a "30% off H.264" Zipstream-era figure from
// the legacy tool. Kept resolvable — and re-anchored with the rest of the table,
// since the +4.07% slip was an error on every key, not just the live ones — so a
// revived pre-Phase-A quote still reads as what it was quoted on. Never offered
// for new work: at 1.207 × H.265 it ADDS storage versus plain H.265.
const SMART_H264_RATIO = 0.7;

const CODEC_BITRATE: Record<CodecValue, number> = {
  h265: H265_BPP,
  h265smart: H265_BPP * H265_SMART_RATIO,
  h264: H265_BPP * H264_RATIO,
  smart: H265_BPP * H264_RATIO * SMART_H264_RATIO,
};

// ---------------------------------------------------------------------------
// Frame-rate curve (ADR 0123, D6)
// ---------------------------------------------------------------------------

/**
 * Anchor-preserving sub-linear frame-rate scaling.
 *
 *   effective_fps = 15 × (fps / 15) ^ 0.90
 *
 * Milestone's own tool scales sub-linearly: measured b ≈ 0.90 across a
 * 10/12/15/18 fps sweep, reproduced on three complexity tiers (audit §8).
 * Measured encoder *emission* supports a lower 0.6–0.77 (and would quote
 * larger still), but 0.90 is what preserves parity with the anchor tool.
 *
 * The anchor form is load bearing. 15 fps must bill exactly 15 or the whole
 * calibration moves; a raw `fps ^ 0.9` would bill 15 fps as 11.6 and destroy it.
 * At 12 fps this bills 12.2756 rather than 12 (+2.30%).
 */
export const FPS_EXPONENT = 0.9;

export function effectiveFps(fps: number): number {
  const f = Math.max(0, fps);
  if (f === 0) return 0;
  return ANCHOR_FPS * Math.pow(f / ANCHOR_FPS, FPS_EXPONENT);
}

// ---------------------------------------------------------------------------
// Retention (ADR 0132, D9)
// ---------------------------------------------------------------------------

/**
 * How a project's retention reads as one figure when its groups disagree.
 *
 * Retention is per camera group since ADR 0132, so every surface that used to
 * print one submission-wide number needs a way to say "these groups differ"
 * without inventing an average. Regulated ranges make mixed projects the point
 * of the feature, not an edge case: Nevada gaming 7→15 days, cannabis 30–180 by
 * state, PCI/PII 90.
 *
 * `max` is the figure banked in `submissions.retention_days` on a version-3 row
 * — the longest requirement the project has to satisfy, and the only single
 * number that is never an under-statement.
 */
export type RetentionSummary = {
  min: number;
  max: number;
  /** True when every group shares one retention (so `label` is a bare figure). */
  uniform: boolean;
  /** Display form: "30 days" when uniform, "7–90 days" when not. */
  label: string;
};

export function retentionSummary(days: readonly number[]): RetentionSummary {
  const valid = days.filter((d) => Number.isFinite(d) && d > 0);
  if (valid.length === 0) {
    return { min: 0, max: 0, uniform: true, label: "—" };
  }
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const uniform = min === max;
  return {
    min,
    max,
    uniform,
    label: uniform ? `${max} days` : `${min}–${max} days`,
  };
}

/**
 * VSR (Video Surveillance Reference) load for a camera group: a
 * resolution-normalized stream count where a 4MP stream ≈ 1.0 VSR.
 *
 *   vsr = cameras × (megapixels / 4),  megapixels = width × height / 1e6
 *
 * Resolution-normalized ONLY — fps, codec, motion, and retention are
 * deliberately excluded (EPYC 9005 makes fps a non-factor within range; ~all
 * deals run 12–15 fps). Used solely by the recommendation engine's per-unit
 * camera-capacity check (max_cameras is VSR-referenced), never for storage or
 * bandwidth sizing. See ADR 0068.
 */
export function vsrLoad(cameras: number, resolution: Resolution): number {
  const megapixels = (resolution.width * resolution.height) / 1_000_000;
  return cameras * (megapixels / 4);
}

/**
 * Estimated frame size in KB, at the full event rate.
 *
 *   frame_kb = (pixels × bitrate_factor × complexity) / 8 / 1024
 *
 * NOTE the /1024: frameKb is BINARY KB. That is harmless in the sizing path —
 * `computeBandwidthMbps` and `computeRawStorageGb` both multiply the 1024 back
 * out, so it cancels exactly and both bill decimal. It is preserved here only
 * because the value is banked per group in groups_payload. What it must never
 * again do is leak into a *displayed* figure without the 1024 being unwound —
 * that was audit §C4's unit bug, and the ADR 0050 calibration slip beneath it.
 */
export function estimateFrameKb(
  resolution: Resolution,
  codec: CodecValue,
  complexityMultiplier: number,
): number {
  const pixels = resolution.width * resolution.height;
  const bitrate = CODEC_BITRATE[codec] ?? CODEC_BITRATE.h264;
  return (pixels * bitrate * complexityMultiplier) / 8 / 1024;
}

/**
 * Recording duty cycle — the fraction of operating hours actually written
 * (ADR 0125, D2).
 *
 *   Continuous       → 1.0
 *   Motion-triggered → motion% exactly, NO idle floor
 *
 * This replaces `applyMotionAdjustment`'s `0.2 + 0.8·m` bitrate blend, which was
 * unsourced, matched no vendor model, and was wrong in DIRECTION for CBR cameras
 * (idle CBR pads to 100% of target by design, so a CBR camera on "Motion-only
 * 50%" was under-sized ×0.6). Milestone bills motion exactly as a duty cycle —
 * confirmed first-party, with an exported proposal reproduced to five digits
 * (audit §8).
 *
 * There is deliberately no separate smart-damping knob: the codec coefficient
 * (`h265smart`) IS the damping. A second knob would express the same physical
 * effect twice and multiply — the compounding this phase exists to remove.
 *
 * The 20–100 clamp lives in the UI and the submit schema. With no floor in the
 * math, that clamp is now the only limit on how aggressive a user can be.
 */
export function dutyCycle(input: {
  recordingMode?: "constant" | "motion";
  motionPercent: number;
}): number {
  // Continuous means 1.0 by definition — it no longer needs motion% pinned to
  // 100 server-side to size correctly (though callers still do, so the banked
  // value matches the figure the math used).
  if (input.recordingMode === "constant") return 1;
  return Math.max(0, Math.min(100, input.motionPercent)) / 100;
}

/**
 * Bandwidth (Mbps) for a single camera group — the EVENT PEAK (ADR 0125, D7).
 *
 *   bandwidth_mbps = (frame_kb × 1024 × 8 × effective_fps × cameras) / 1e6
 *
 * Computed at duty cycle 1.0, ALWAYS. Networks must carry the peak, not a
 * time-average, and Milestone's exported proposals quote the full event rate
 * (271.58 Mbps/server = Σkbit ÷ 4 ÷ 1000, audit §8). Storage keeps the duty
 * cycle. The two now differ deliberately — every surface that prints this figure
 * says so next to it.
 *
 * Output is decimal Mbit/s.
 */
export function computeBandwidthMbps(
  frameKb: number,
  fps: number,
  cameras: number,
): number {
  return (frameKb * 1024 * 8 * effectiveFps(fps) * cameras) / 1e6;
}

/**
 * Modeled video (decimal GB) for a single camera group over `retentionDays`,
 * before the utilization buffer or the binary conversion.
 *
 *   storage_gb_raw =
 *     (frame_kb × 1024 × effective_fps × cameras × days × 86400
 *       × operating_fraction × duty_cycle) / 1e9
 *
 * `recordingPercent` is Operation Hours as a percent of the day (100 = 24 h);
 * `duty` is the recording duty cycle within those hours. The two multiply, which
 * is correct: scheduled hours × the fraction of them written.
 */
export function computeRawStorageGb(
  frameKb: number,
  fps: number,
  cameras: number,
  retentionDays: number,
  recordingPercent: number,
  duty: number,
): number {
  return (
    (frameKb *
      1024 *
      effectiveFps(fps) *
      cameras *
      retentionDays *
      24 *
      3600 *
      (recordingPercent / 100) *
      duty) /
    1e9
  );
}

export type GroupComputed = {
  // Per-frame size in binary KB at the full event rate (see estimateFrameKb).
  frameKb: number;
  // Per-camera stream rate, DECIMAL Mbit/s, at the event rate. Equals
  // bandwidthMbps / cameras exactly.
  bitrateMbps: number;
  // Group network load, decimal Mbit/s, at the event rate (duty cycle 1.0).
  bandwidthMbps: number;
  // Modeled video over this group's own retention — no buffer, no binary charge.
  // This is "required recorded data": the figure directly comparable to a
  // Milestone proposal's "Total storage" line, and the one every surface calls
  // "footage".
  //
  // Phase A also carried a separate `rawStorageGb` (video before the +5%
  // audio/metadata term). ADR 0131 removed that term, which made the two fields
  // identical by definition — so the split is gone rather than left as two names
  // for one number. If counted-data terms ever return properly measured in
  // kbit/s, re-introduce the split then.
  recordedStorageGb: number;
  // Required decimal RAID-net capacity: recorded data ÷ utilization ÷ 0.8931.
  // This is what the recommender sizes against and what submissions.storage_tb
  // banks. It is NOT the same basis as the pre-Phase-A storageGb.
  storageGb: number;
};

export type GroupInput = {
  cameras: number;
  resolution: Resolution;
  codec: Codec;
  complexity: Complexity;
  fps: number;
  // Days of footage kept for THIS group (ADR 0132, D9). Required rather than
  // defaulted on purpose: it used to be one submission-wide argument, and a
  // silent default here would let a caller size a group at the wrong retention
  // with nothing failing. Every call site has to state it.
  retentionDays: number;
  recordingPercent: number;  // Operation Hours as a percent of the day, 0–100
  motionPercent: number;     // 0–100; read only under recordingMode "motion"
  // Absent means "honor motionPercent" — every pre-Phase-A caller pinned
  // motionPercent to 100 under Continuous, so the two agree.
  recordingMode?: "constant" | "motion";
};

export function computeGroup(
  input: GroupInput,
  utilizationPct: number = UTILIZATION_DEFAULT_PCT,
): GroupComputed {
  const frameKb = estimateFrameKb(
    input.resolution,
    input.codec.value,
    input.complexity.multiplier,
  );

  const bandwidthMbps = computeBandwidthMbps(frameKb, input.fps, input.cameras);
  const bitrateMbps = input.cameras > 0 ? bandwidthMbps / input.cameras : 0;

  const duty = dutyCycle(input);
  const recordedStorageGb = computeRawStorageGb(
    frameKb,
    input.fps,
    input.cameras,
    input.retentionDays,
    input.recordingPercent,
    duty,
  );

  // The one buffer, then the physics. Applied per group so the group column on
  // every table and PDF still sums to the project total — both steps are scalar,
  // so allocating them per group is exact. This is also what makes per-group
  // retention exact: each group divides its own footage, and the totals sum.
  const utilization = clampUtilizationPct(utilizationPct) / 100;
  const storageGb = recordedStorageGb / utilization / AVAILABLE_CAPACITY_FACTOR;

  return {
    frameKb,
    bitrateMbps,
    bandwidthMbps,
    recordedStorageGb,
    storageGb,
  };
}

// --- Display helpers ---------------------------------------------------

function withThousands(n: number): string {
  return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatNumber(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) return withThousands(n);
  return n.toFixed(decimals);
}

export function formatStorageGb(gb: number): string {
  if (!Number.isFinite(gb)) return "—";
  if (gb >= 1000) return `${formatNumber(gb / 1000)} TB`;
  return `${formatNumber(gb)} GB`;
}

export function formatBandwidthMbps(mbps: number): string {
  if (!Number.isFinite(mbps)) return "—";
  if (mbps >= 1000) return `${formatNumber(mbps / 1000)} Gbit/s`;
  return `${formatNumber(mbps)} Mbit/s`;
}

// ---------------------------------------------------------------------------
// What a BANKED bandwidth figure means (ADR 0130)
// ---------------------------------------------------------------------------
//
// The engine has no scene-activity or duty-cycle reduction on bandwidth: since
// ADR 0125 `computeBandwidthMbps` is called at duty cycle 1.0 always, so a
// version-2 figure IS the event peak and needs no companion average.
//
// A version-1 figure is NOT. Pre-Phase-A `computeGroup` ran
// `applyMotionAdjustment(frameKb, motionPercent)` — the `0.2 + 0.8·m` blend —
// BEFORE computing bandwidth, so the banked Mbit/s was a motion-weighted
// average. Factor 0.2+0.8m vs the peak's 1.0 puts a motion-triggered v1 row
// 20% below the true peak at motion 75, and 64% below at the motion-20 clamp.
// Continuous v1 rows pinned motionPercent to 100, so those are unaffected.
//
// Every surface that renders a STORED submission therefore has to read the
// stamp before claiming "peak" — the label is a property of the row, not of the
// display. The live calculator, Quick Calc, and the submit-time emails always
// run the current engine, so they may state peak unconditionally.
//
// This is deliberately ONE helper: the same sentence was being written by hand
// in three renderers and had already drifted (the Project Quote said nothing
// about bandwidth on the v1 branch, and the Customer Proposal states no basis
// at all).
export type BandwidthBasis = {
  /** True when the figure is the full event rate with no duty-cycle reduction. */
  isEventPeak: boolean;
  /** Terse qualifier for a value or a numeric column header. */
  short: string;
  /** One clause, lower-case, for appending to an existing sentence. */
  clause: string;
};

export function bandwidthBasis(calcVersion: number | null | undefined): BandwidthBasis {
  // An absent stamp is a pre-Phase-A row by definition (see CALC_VERSION).
  if ((calcVersion ?? 1) >= 2) {
    return {
      isEventPeak: true,
      short: "peak",
      clause:
        "bandwidth is the peak while recording, not a time-average, so it does not fall for " +
        "motion-triggered groups",
    };
  }
  return {
    isEventPeak: false,
    short: "motion-weighted avg",
    clause:
      "bandwidth is a motion-weighted average, not the network peak — the pre-2026-08 model " +
      "reduced it for motion-triggered groups, so size the network above this figure",
  };
}
