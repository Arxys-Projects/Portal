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
//   * The buffer is the Max disk utilization cap (ADR 0126), pinned to the 90%
//     default here so Quick Calc stays a fixed standard. The old "+20% storage
//     overhead" constant is gone.
//
// NOT CHANGED IN PHASE A: complexityIdx stays 2 (multiplier 2.25). The audit
// found this conflicts with the published VSR stream ratings, which were
// established at ~3.2 Mbit/s ≈ complexity tier 2 (1.5) — so the default sizing
// profile presents streams ~38% heavier than the ratings were measured at, while
// vsrLoad varies with resolution only. That is decision D10 and belongs to
// Phase C; resolving it here would fold a second large movement into Phase A's
// golden diff and make neither attributable. Confirmed with Andy 2026-08-12.

export const QUICK_CALC_GROUP = {
  name: "Camera streams",
  resolutionIdx: 14,
  codecIdx: 0,
  complexityIdx: 2,
  fps: 15,
  recordingMode: "motion" as const,
  recordingPercent: 100,
  motionPercent: 75,
  recordsAudioMetadata: true,
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
  "Audio + metadata recorded",
  "90% max disk utilization",
] as const;
