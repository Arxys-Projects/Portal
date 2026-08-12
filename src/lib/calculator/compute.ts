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
// The sizing stack (Phase A of the calculator math rework, ADRs 0123–0128)
// ---------------------------------------------------------------------------
//
//   modeled raw video          ← accurate: anchor, fps curve, codec, duty cycle
//     × audio/metadata (0128)  ← counted data, not buffer
//     = required recorded data ← the Milestone-comparable figure
//     ÷ utilization%  (0126)   ← THE ONE BUFFER
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
// See docs/audits/calculator-math-audit.md and docs/calculator-math-phase-2-plan.md.

/**
 * The sizing model a submission was produced by, banked on every row as
 * `submissions.calc_version`.
 *
 *   1 — everything before Phase A. Raw video at the +4.07% binary/decimal
 *       anchor, ×1.2 STORAGE_OVERHEAD, ×1.2 STORAGE_FLOOR in the recommender,
 *       the `0.2 + 0.8·m` motion blend, no binary charge, no audio term.
 *   2 — Phase A (ADRs 0123–0128). The stack at the top of this file.
 *
 * `storage_tb` means something different either side of this line, so nothing
 * should compare the column across it without checking the stamp. Existing rows
 * are version 1 and are NOT backfilled — no single utilization value reproduces
 * the old ×1.44 under the new semantics.
 */
export const CALC_VERSION = 2;

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
// Audio / analytics metadata (ADR 0128, D8)
// ---------------------------------------------------------------------------
//
// Unmodeled before Phase A (grep-verified). Audio 24–64 kbit/s per camera =
// 0.6–3.2% of a 2–4 Mbit/s stream; analytics metadata 4–100 kbit/s = 0.5–5%.
// Combined 2–8% undercount wherever those streams record.
//
// Default ON because the published VSR rating profile itself specifies
// "On motion, VMD + metadata" — metadata is part of the profile the boxes were
// rated against. A per-group toggle rather than a blanket adder keeps the math
// accurate when those streams genuinely are not recorded.
//
// This is COUNTED DATA, not a second buffer. No other margin may be stacked
// alongside it. It is applied to the stream rate, so it reaches bitrate,
// bandwidth and storage identically — keeping the storage↔bandwidth identity
// the audit verified to 15 digits (§C4) intact.
export const AUDIO_METADATA_UPLIFT = 1.05;

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
 * Raw modeled video (decimal GB) for a single camera group over `retentionDays`,
 * before audio/metadata, the utilization buffer, or the binary conversion.
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
  // Modeled video only — no audio/metadata, no buffer, no binary charge.
  rawStorageGb: number;
  // Video + audio/metadata. This is "required recorded data": the figure that
  // is directly comparable to a Milestone proposal's "Total storage" line.
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
  recordingPercent: number;  // Operation Hours as a percent of the day, 0–100
  motionPercent: number;     // 0–100; read only under recordingMode "motion"
  // Absent means "honor motionPercent" — every pre-Phase-A caller pinned
  // motionPercent to 100 under Continuous, so the two agree.
  recordingMode?: "constant" | "motion";
  // Records audio and/or analytics metadata alongside video (ADR 0128).
  // Absent defaults to true, matching the form default and the VSR rating
  // profile these boxes were rated against.
  recordsAudioMetadata?: boolean;
};

export function computeGroup(
  input: GroupInput,
  retentionDays: number,
  utilizationPct: number = UTILIZATION_DEFAULT_PCT,
): GroupComputed {
  const frameKb = estimateFrameKb(
    input.resolution,
    input.codec.value,
    input.complexity.multiplier,
  );
  // Audio/metadata is a stream-rate adder, so it rides on bitrate, bandwidth and
  // storage alike rather than being bolted onto storage alone.
  const uplift = input.recordsAudioMetadata === false ? 1 : AUDIO_METADATA_UPLIFT;
  const streamFrameKb = frameKb * uplift;

  const bandwidthMbps = computeBandwidthMbps(streamFrameKb, input.fps, input.cameras);
  const bitrateMbps = input.cameras > 0 ? bandwidthMbps / input.cameras : 0;

  const duty = dutyCycle(input);
  const rawStorageGb = computeRawStorageGb(
    frameKb,
    input.fps,
    input.cameras,
    retentionDays,
    input.recordingPercent,
    duty,
  );
  const recordedStorageGb = rawStorageGb * uplift;

  // The one buffer, then the physics. Applied per group so the group column on
  // every table and PDF still sums to the project total — both steps are scalar,
  // so allocating them per group is exact.
  const utilization = clampUtilizationPct(utilizationPct) / 100;
  const storageGb = recordedStorageGb / utilization / AVAILABLE_CAPACITY_FACTOR;

  return {
    frameKb,
    bitrateMbps,
    bandwidthMbps,
    rawStorageGb,
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
