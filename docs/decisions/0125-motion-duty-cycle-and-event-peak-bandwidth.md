# 0125 — Motion is a recording duty cycle; quoted bandwidth is the event peak

- **Status**: Accepted. Supersedes the motion model set in [#0050](./0050-codec-bitrate-reanchor.md).
- **Date**: 2026-08-12

## Context

`applyMotionAdjustment` computed `frameKb × (0.2 + 0.8 · m)` — a weighted average
between a 20% idle bitrate floor and the full event rate, with recorded *hours*
unchanged. The audit could trace no source for it (§C7). The legacy calculator
used `0.3 + 0.7·m`, also unsourced; ADR 0050 lowered the floor to 0.2 by judgment.

Three findings against it:

1. **No vendor models motion this way.** Milestone scales recorded *time* with
   idle ≈ 0. Axis Site Designer uses per-scene profiles. The Seagate–Milestone
   reference architecture sizes by hours recorded.
2. **It is wrong in direction for CBR.** An idle CBR camera pads to 100% of target
   by design (bit stuffing). A CBR camera on "Motion-only 50%" was **under-sized
   ×0.6** — the tool's largest anti-conservative lever.
3. **First-party proof.** An exported Milestone proposal at motion 70% reproduces
   to five digits with an exact ×0.70 duty cycle and a data rate invariant to
   motion %. Reversing the 400-camera proposal independently yields a duty cycle
   of **exactly 0.7000**.

Separately, `bandwidthMbps` inherited the motion weighting, so the quoted Mbit/s
was a **time-average**. Milestone's proposals quote the full event rate
(271.58 Mbps/server = Σkbit ÷ 4 ÷ 1000). Networks must carry the peak. And the
displayed `bitrateMbps` was binary Mibit labeled Mbit — 4.63% below what the
engine billed — which the form then multiplied by 1000 to print "Kbit/s".

## Options considered

- **Keep the blend, document it as a deliberate conservative hybrid** — no diff,
  but leaves CBR deals under-sized in the one direction that fails in the field.
- **Duty cycle with a small floor** (say 0.1) — hedges the smart-codec reading,
  but reintroduces an unsourced constant, which is what this phase removes.
- **Duty cycle, exact, no floor** — matches the reference tool.
- Add a **separate smart-damping slider** alongside — expresses the same physical
  effect twice.
- Bandwidth: keep the time-average, or quote the event peak.

## Decision

**Motion is a recording duty cycle applied exactly, with no idle floor. Bandwidth
is computed at duty cycle 1.0, always.**

Three orthogonal controls, no blended coefficient anywhere:

| Control | Multiplies | Values |
|---|---|---|
| Operation Hours | hours of day recorded | 1–24 |
| Recording mode | fraction of those hours written | Continuous = 1.0 · Motion-triggered = motion% exactly |
| Codec | bitrate per pixel | `h265` · `h265smart` · `h264` |

**No separate smart-damping knob.** ADR 0124's codec coefficient *is* the damping.
A second knob would express the same effect twice and multiply — the compounding
this phase exists to remove.

The mode itself means 1.0: `dutyCycle()` returns 1 for `"constant"` regardless of
what `motionPercent` carries. The server still pins motion% to 100 under
Continuous, but only so the banked and displayed value matches the figure the math
used — it is no longer load bearing.

The existing **20–100 UI clamp stays**. With no floor in the math it is now the
only limit on how aggressive a user can be, which is the right place for it: a
visible, adjustable bound rather than a hidden coefficient.

**Storage keeps the duty cycle; bandwidth does not.** These now deliberately
differ, and every surface that prints the bandwidth figure says so beside it —
summary card, per-group readout, table header, PDF capacity bar, both emails.
Leaving that unexplained would read as a bug.

`bitrateMbps` is now decimal and equals `bandwidthMbps / cameras` exactly, which
fixes the display unit bug and makes the form's `× 1000` correct as written.

## Consequences

**Positive:** motion means what a partner thinks it means, and matches what
Milestone bills; CBR deals stop being under-sized; the quoted network figure is
one a switch can actually be sized against; storage and bandwidth remain mutually
consistent to 15 digits, now on the right basis.

**Negative:** motion-triggered groups get **smaller** — ×0.60 → ×0.50 at motion
50, ×0.36 → ×0.20 at motion 20 — which compounds with ADR 0124 on smart-codec
deals. Quoted bandwidth rises sharply on low-motion groups (×2.52 at motion 25):
correct, but partners who have anchored on the old figure will notice. Removing
the floor means a user who sets motion to the 20% clamp gets exactly one fifth the
storage, with no math-side backstop — the clamp is the whole protection.

**When to revisit:** if Milestone's Speedup mode (a low baseline fps auto-raised
during events) is worth modeling, that is a genuine second rate and would need its
own control rather than a floor bolted back onto this one.
