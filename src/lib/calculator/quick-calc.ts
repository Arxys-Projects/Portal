// Quick Project Calculation & Quote — the fixed Arxys VSR standard (ADR 0082).
// One lump camera group with everything but the stream count pinned. Shared by
// the Quick Calc form (labels + payload build) and the preview action so the
// preview, the saved submission, and the printed System Estimate always agree.
//
// Encoding notes (see docs/decisions/0082 and the calculator engine):
//   * "Record on motion 75% at 24 h/day" must be sent as recordingMode:
//     "motion" + recordingPercent: 100 (hours-of-day percent) + motionPercent:
//     75. Under ADR 0125 that motion % is now an exact duty cycle with no idle
//     floor, so Quick Calc stores 0.75× the continuous figure rather than the
//     old 0.80×.
//   * resolutionIdx 14 = "4MP (2560×1440)", the VSR reference resolution.
//   * complexityIdx 2 = "Medium detail, low motion".
//   * codecIdx 0 = H.265 (HEVC) — index 0 in CODECS both before and after the
//     h265smart addition (ADR 0124).
//   * The buffer is the Max disk utilization cap (ADR 0126), pinned here rather
//     than exposed as a slider so Quick Calc stays a fixed standard. It is
//     deliberately MORE conservative than the full calculator's default —
//     see QUICK_CALC_UTILIZATION_PCT below.
//   * Retention is per group since ADR 0132, and Quick Calc has exactly one
//     group, so its single retention input IS that group's retention. Nothing
//     structural changed here.
//
// NOT CHANGED IN PHASE A OR B: complexityIdx stays 2 (multiplier 2.25). The audit
// found this conflicts with the published VSR stream ratings, which were
// established at ~3.2 Mbit/s ≈ complexity tier 2 (1.5) — so the default sizing
// profile presents streams ~38% heavier than the ratings were measured at, while
// vsrLoad varies with resolution only. That is decision D10; ADR 0133 records the
// rating basis and puts the conflict in front of Andy, and the fix waits on a
// bench measurement rather than an invented derate factor.

/**
 * Max disk utilization for Quick Calc — 80%, i.e. a 20% buffer.
 *
 * Deliberately more conservative than the full calculator's default (Andy,
 * 2026-08-12): Quick Calc takes a stream count and a retention period and
 * nothing else, so it is a rough estimate by construction and carries more scene
 * uncertainty than a properly configured multi-group project.
 *
 * NOTE the semantics — this is a CAP, not an additive margin. 80% means
 * `÷ 0.80 = ×1.25`, so it is slightly MORE cushion than the old
 * `STORAGE_OVERHEAD = 1.2` constant it replaces, not the same. No utilization
 * value reproduces ×1.20 exactly (that would be 83.33%), and chasing it would
 * mean an off-scale number in the UI for no benefit.
 *
 * HELD AT 80 through the ADR 0131 buffer change, which tightened the full
 * calculator's default 90% → 88% to carry a storage-only cushion in place of the
 * reversed audio/metadata term. Quick Calc needs no share of that cushion: at
 * ÷0.80 = ×1.25 against the calculator's ×1.136 it already carries more than
 * double the margin, for exactly the reason above. So Quick Calc's storage drops
 * the full −4.76% of the removed +5% with nothing added back, and stays the more
 * conservative of the two tools (80% vs 88%).
 */
export const QUICK_CALC_UTILIZATION_PCT = 80;

export const QUICK_CALC_GROUP = {
  name: "Camera streams",
  resolutionIdx: 14,
  codecIdx: 0,
  complexityIdx: 2,
  fps: 15,
  recordingMode: "motion" as const,
  recordingPercent: 100,
  motionPercent: 75,
} as const;

// Read-only assumption pills, in display order (2026-07-16 design handoff).
export const QUICK_CALC_ASSUMPTIONS = [
  "4MP (2560×1440)",
  "15 FPS",
  "H.265 (HEVC)",
  "Medium detail, low motion",
  "Record on motion · 75%",
  "24 h / day",
  "1 stream / camera",
  "80% max disk utilization",
] as const;
