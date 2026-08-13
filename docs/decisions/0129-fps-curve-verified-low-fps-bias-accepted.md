# 0129 — The fps curve stays at b=0.90; the low-fps bias is accepted and recorded

- **Status**: Accepted
- **Date**: 2026-08-13
- **Relates to**: [#0123](./0123-bitrate-reanchor-and-sublinear-fps.md) (set the curve), [#0124](./0124-h265-smart-codec-key.md) (smart codec)

## Context

A black-box reverse-engineering of Genetec's StreamVault calculator
(svcalculator.genetec.com, 2026-08-13) solved their bitrate model empirically as
`MP × fps × (145.908 − 1.36487 × fps) × quality × activity`, and raised the
concern that the Arxys engine's fps term was **linear** — which would overstate
30 fps by ~30% and understate 5 fps by ~22%.

A read-only Phase 0 investigation found the premise no longer holds. ADR 0123
replaced the linear term with `effective_fps = 15 × (fps/15)^0.90` on 2026-08-12
(shipped, `300d70b`). `effectiveFps` in [`compute.ts`](../../src/lib/calculator/compute.ts)
is the only path fps takes into the math — there is no second linear
multiplication anywhere in `src`.

Three verified findings shaped this decision.

**1. The engine matches its anchor tool to 0.5%, and beats Genetec's own curve
where it counts.** Against Milestone Solution Designer's measured 10/12/15/18 fps
sweep (audit §8): +0.31% / −0.03% / 0.00% / +0.48%. Against Genetec's curve,
normalized at 15 fps: within ±1.2% from 5 to 12 fps, and **+11.5% at 30 fps** —
the engine is already the more conservative of the two at high frame rates, so
the concern that prompted this work is inverted.

**2. The engine assumes no GOP structure at all, and the exposure is at LOW fps.**
It is a power law through the origin with a constant local exponent of 0.90. A
GOP fixed in *frames* implies exponent 1.0; a GOP fixed in *seconds* (a 1–2 s
keyframe interval, how cameras are actually configured) implies an exponent that
**rises** toward 1 with fps and floors at a nonzero bitrate as fps → 0. Genetec's
exponent instead **falls** (0.95 at 5 fps → 0.61 at 30) — per-frame efficiency
decline, also through the origin. Neither tool models the constant-I-frame floor.
Relative to a seconds-GOP model at I:P = 8, T = 1 s, the engine bills:

| fps | vs linear | vs Genetec | vs seconds-GOP (I:P 8, T 1s) | vs (I:P 5, T 1s) |
|---|---|---|---|---|
| 5 | +11.6% | +0.7% | **−31.8%** | −21.5% |
| 7 | +7.9% | −0.7% | −20.9% | −13.0% |
| 10 | +4.1% | −1.2% | −10.2% | −5.8% |
| 12 | +2.3% | −1.0% | −5.3% | −2.9% |
| 15 | 0 | 0 | 0 | 0 |
| 20 | −2.8% | +2.8% | +5.6% | +2.6% |
| 30 | −6.7% | +11.5% | +11.0% | +4.3% |

So the 5–7 fps under-sizing risk is real (detention, K-12), it is **not** what
b=0.90 was chosen to fix, and moving to the measured-emission range b=0.6–0.77
would make it worse. Genetec agrees with the engine at 5 fps to within 0.7%, so
their tool is not evidence against this — both share the blind spot.

**3. Milestone's sweep only covers 10–18 fps.** Outside that band the 0.90
exponent is unvalidated extrapolation in both directions.

Two further Phase 0 facts bound the decision. Bitrate is **computed**, never
looked up: `camera_specs` carries no bitrate and no fps column, and the camera
model picker only fills the resolution bucket and sensor count. And stored
submissions **do not recompute** — `computeGroup` has three call sites (live
form, submit, quick-calc), none on a read path; sizing is frozen at three layers
(`submissions` scalar columns, `groups_payload.groups[].computed`, and the
immutable `project_quotes.snapshot`), each stamped with `calc_version`.

## Options considered

- **A. Derive a curve from vendor bitrate tables at multiple frame rates.** Checked
  the source material rather than assuming: `hanwha-roster-2026-08.json` parses the
  August 2026 Hanwha price list and carries model, item_type, mp_band, sensor_hint,
  aliases, MSRP, and stock/EOL flags. Frame rate appears only inside marketing
  description prose ("4MP @ 30 FPS") as a capability ceiling. No bitrate-at-fps
  dimension exists in this repo, and nothing in Phase 10 parses one.
- **B. Bench-measure it.** The durable asset, and defensible in front of an
  integrator — but a full curve refit is the wrong scope for the defect found.
- **C. Change nothing, document the bias, revisit when data exists.**
- **Adopt Genetec's coefficients.** Rejected on their own evidence: 30 fps returns
  less bitrate than 29 fps (non-monotonic), 5 fps sits 9.45% above their own curve,
  and the curve peaks at 53.5 fps then declines. Useful as corroboration that
  sublinearity is real, not as a source of numbers.
- **Add a GOP / keyframe-interval input.** Rejected: it asks partners a question
  they cannot answer, and the honest low-fps fix needs measurement first.

## Decision

**C — `FPS_EXPONENT` stays 0.90, and the low-fps bias is recorded here rather
than corrected.** The 10–18 fps band carrying effectively the whole book is
already matched to within 0.5% of the tool the entire bitrate table is anchored
to. Both candidate replacements move the number the wrong way: Genetec's curve
would shed the margin the engine currently holds at high fps, and b=0.6–0.77
would deepen the low-fps gap that is the actual defect.

**Option B is retained as the trigger, narrowed to the question that matters** —
not "what is b?" but *"what does a real camera at a 1-second keyframe interval
emit at 5, 7, and 10 fps?"* One camera, fixed resolution and quality, three
low-fps points. That tests whether the −20% to −32% gap is real at a fraction of
the cost of a curve refit, and it targets the only segment where the bias has a
field consequence.

No code change, no migration, and no historical-quote question to resolve: a
change here could not have moved a banked row or an issued document anyway, since
nothing recomputes on read. (A *revision* does resize under the current model —
deliberate, unchanged since Phase A — so that remains the one place a future
curve change would become visible on old work.)

## Consequences

**Positive:** the 30 fps concern is closed with numbers rather than left open; the
real defect is now named, quantified, and pointed at the deals it affects; the
engine keeps exact parity with its anchor tool in the band that matters; nothing
moves, so no quote changes and no golden-matrix diff.

**Negative:** 5–7 fps jobs stay sized 19–32% below what a keyframe-floor model
implies, and that is now a knowingly accepted exposure rather than an unknown one.
Detention and K-12 are exactly where those frame rates cluster. The engine's
0.90 is an empirical fit with no I/P-frame structure behind it, so it cannot be
reasoned about outside the 10–18 fps range it was measured in.

**When to revisit:** a bench sweep at 5/7/10 fps with a 1 s keyframe interval — if
it confirms the gap, the fix is likely a low-fps floor rather than a different
exponent, since the curvature a keyframe floor produces runs opposite to the
power law. Also if a real bid lands at ≤7 fps at material scale before that
measurement exists, in which case size it and flag the bias explicitly to the
integrator.
