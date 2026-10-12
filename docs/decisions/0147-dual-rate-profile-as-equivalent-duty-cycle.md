# 0147 - Continuous dual-rate profiles as one motion group at the event fps with an equivalent duty cycle

- **Status**: Accepted. An alternative to [0142](./0142-dual-rate-two-group-workaround.md), which stays valid; neither is needed once a real dual-rate control exists (the gap [0125](./0125-motion-duty-cycle-and-event-peak-bandwidth.md) named).
- **Date**: 2026-10-12

## Context

The Escambia Men's Prison spec (Section 28 23 14, 2.06.E) records every camera
continuously with variable frame rate: 15 fps for the 16 hours a day it assumes
motion, 5 fps for the other 8. The calculator's `GroupInput` has one integer `fps`
and a recording duty cycle (`motionPercent`, ADR 0125). There is still no way to say
"always recording, at two rates" in one group.

The seed document offered an 11.67 fps average. It cannot be entered (fps is an
integer, 1 to 60), and an average is not storage-equivalent anyway: the engine bills
fps on a sub-linear curve, `effectiveFps(f) = 15 × (f/15)^0.90` (ADR 0123), so 12 fps
bills 12.27 effective while the true 16 h + 8 h mix bills 11.86.

The project needed an exact stream count (2,469), an exact peak bandwidth, and a
valid recommendation, so the doubled camera count of ADR 0142 was not acceptable.

## Options considered

- **One continuous group at a rounded average fps (12).** Over-bills storage 3.5%
  and quotes the network at 12 fps when the cameras peak at 15.
- **ADR 0142: two motion groups per population** (15 fps at 67%, 5 fps at 33%).
  Storage is right, but the portal shows 4,736 "cameras" for 2,469 streams,
  bandwidth double-counts (16.6 vs 12.3 Gbit/s), and the doubled VSR load changed
  the recommendation (21 × VX5-V800-720 instead of 18 × VX5-V800-864).
- **One motion group at the event fps with an equivalent duty cycle.** Chosen.
- **Build the dual-rate control.** Correct, and out of scope for a seed.

## Decision

For a population that records continuously at an event rate for a fraction `f_e` of
the day and at a base rate for the rest (`f_b = 1 − f_e`), enter **one group**:
`recordingMode: "motion"`, `fps` = the event rate, and

```
motionPercent = ceil(100 × (f_e + f_b × effectiveFps(base) / effectiveFps(event)))
```

Escambia: `f_e = 16/24`, base 5 fps, event 15 fps → `0.6667 + 0.3333 × 5.5806 / 15`
= 0.7907 → **80**. Rounded up, never down, so storage is never under the exact
figure (+1.2% here).

The group name carries the real schedule (`16h@15fps+8h@5fps as 80%`), because every
surface prints "Motion-triggered 80%", which on its own reads as a motion share.

## Consequences

**Positive:** stream count, VSR load and peak bandwidth stay exact, so the
recommendation is the one the project actually needs. Storage is exact to the
rounding of one integer percent. One group per population keeps the 50-group cap
comfortable.

**Negative:** the motion figure on the calculator, the PDF and the Pipedrive "Motion
Activity %" field is a stand-in, readable only through the group name. The duty is
derived from the current fps curve; if `FPS_EXPONENT` changes, a new quote needs a
new figure (banked rows never recompute, by design). The base-rate share inherits
ADR 0129's low-fps bias (5 fps billed 19 to 32% below a seconds-GOP model), which on
Escambia is roughly 3 to 5% of motion-group storage.

**When to revisit:** when a real dual-rate control is built (recreate any submission
built this way or under ADR 0142), or if `FPS_EXPONENT` moves.
