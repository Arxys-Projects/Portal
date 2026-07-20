// Quick Project Calculation & Quote — the fixed Arxys VSR standard (ADR 0082).
// One lump camera group with everything but the stream count pinned. Shared by
// the Quick Calc form (labels + payload build) and the preview action so the
// preview, the saved submission, and the printed System Estimate always agree.
//
// Encoding notes (see docs/decisions/0082 and the calculator engine):
//   * "Record on motion 75% at 24 h/day" must be sent as recordingMode:
//     "motion" + recordingPercent: 100 (hours-of-day percent) + motionPercent:
//     75. Sending "constant" would pin motion to 100 server-side.
//   * resolutionIdx 14 = "4MP (2560×1440)", the VSR reference resolution.
//   * complexityIdx 2 = "Medium detail, low motion".
//   * codecIdx 0 = H.265 (HEVC).
//   * The +20% storage overhead is STORAGE_OVERHEAD inside computeGroup — an
//     engine constant, not an input.

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
  "+20% storage overhead",
] as const;
