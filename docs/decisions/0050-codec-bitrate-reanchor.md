# 0050 — Re-anchor codec bitrate to the live Milestone audit; 20% motion idle floor; motion is bitrate-weighting only

- **Status**: Accepted
- **Date**: 2026-06-05

## Context

With the six-level Milestone complexity curve adopted ([0049](./0049-milestone-complexity-curve.md)),
the existing codec coefficients (`h265 0.07, h264 0.12, smart 0.084`) produced
per-camera bitrates roughly **2× hotter** than Milestone's XProtect calculator
at the same inputs. The curve and the absolute scale are separate concerns: the
curve sets the *shape*, the codec factor sets the *anchor*.

Two related knobs also needed clarifying. **Motion** had a 30% idle floor
(`0.3 + 0.7·P`) and **Operation Hours** reduces recorded hours — these were
being conflated in the UI as one "hours" field, but they are mathematically
independent (one weights bitrate, the other scales hours).

The H.265 factor was audited live against the Milestone XProtect tool: at 4MP
(2560×1440), 15fps, H.265, Constant, 100% motion, the five Milestone complexity
levels produce **1966 / 2950 / 4424 / 6637 / 9832 Kbit/s**.

## Options considered

- **Exact-fit factor (~0.03641)** — lands "Low/low" at exactly 1966 Kbit/s, zero
  bias.
- **Round up to 0.037** — lands ~1998 Kbit/s (+1.63%) across all levels;
  consistent small conservative headroom, one clean constant.
- **Keep the old 0.07 and rescale the multipliers instead** — would have buried
  the anchor inside the curve, making both harder to audit independently.

## Decision

Re-anchor `CODEC_BITRATE.h265 = 0.037`, deriving `h264 = 0.0634` and
`smart = 0.0444` from H.265 by the **prior codec ratios** (×0.12/0.07 and
×0.084/0.07) so the codec selector's relative behavior is unchanged. The +1.63%
bias from rounding up is accepted as conservative headroom. Lock it behind a
**hard verification-gate unit test** that asserts all six levels within ±2% of
the audited numbers (the sixth = 1966×7.0 = 13762 by construction); the test
fails the build if the factor or any multiplier drifts.

Lower the motion idle floor **30% → 20%** (`0.2 + 0.8·P`) so quiet scenes size
more aggressively against smart-codec idle bitrates. Keep motion as **bitrate
weighting only** — it never reduces hours. Recorded hours are reduced separately
and linearly by `recordingPercent` (Operation Hours). The UI exposes these as
two distinct controls plus a Recording mode (Constant pins motion to 100%).

## Consequences

**Positive:** Per-camera bitrate now matches a partner-facing reference tool
within ±2%, defensible in a sales conversation. The gate test makes the anchor
self-protecting. Motion and hours are cleanly separable knobs.

**Negative:** Every previously-computed quote value changes (all were throwaway
test rows, so no migration was needed). The ~1.6% upward bias means we are
always a hair above Milestone — intentional, but not zero.

**When to revisit:** If Milestone changes its calculator, or if sales wants
exact parity rather than conservative headroom, switch to the exact-fit factor
(~0.03641) and update the gate's expected numbers to the new audit.
