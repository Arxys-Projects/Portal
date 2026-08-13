# 0130 — One bandwidth figure, with a version-aware basis statement

- **Status**: Accepted
- **Date**: 2026-08-13
- **Relates to**: [#0125](./0125-motion-duty-cycle-and-event-peak-bandwidth.md) (made bandwidth the event peak), [#0089](./0089-customer-proposal-and-partner-logo-system.md) (Customer Proposal strips the capacity block), [#0067](./0067-portal-ui-design-system.md) (surface design)

## Context

The Genetec StreamVault teardown found that their single bandwidth figure changes
meaning silently: scene activity below 100% reduces it, recording percentage below
100% does not. Two knobs, identical storage reductions, bandwidth figures 2× apart.
The proposed fix was to report **peak ingest** and **average ingest** separately.

Phase 0 established that the portal is not in that position:

- There is **no scene-activity input** and **no duty-cycle reduction on bandwidth**.
  Since ADR 0125, `computeBandwidthMbps` is called at duty cycle 1.0 always, so a
  version-2 figure already *is* the event peak. There is no second number to show.
- Operation Hours and Motion % reach storage only. The complexity tier reaches the
  stream rate, so it correctly reaches both — that is a bitrate level, not a
  reduction factor.

So the work was never "compute two numbers"; it was "label the one number
unambiguously". But the labeling had a real defect that the Genetec framing did
not predict.

**The "peak" claims were unconditional while the meaning is version-dependent.**
Pre-Phase-A `computeGroup` ran `applyMotionAdjustment(frameKb, motionPercent)` —
the `0.2 + 0.8·m` blend — *before* computing bandwidth (verified in
`300d70b^:src/lib/calculator/compute.ts:135-139`), so a version-1 row banked a
motion-weighted average. Factor `0.2+0.8m` against the peak's 1.0 puts a
motion-triggered v1 row **20% below the true peak at motion 75 and 64% below at
the motion-20 clamp**. Continuous v1 rows pinned motion% to 100 and are unaffected.

Three surfaces asserted "peak" on those rows anyway: the submission detail Totals
row and per-group column header, and the System Estimate PDF's capacity bar note.
Meanwhile the Project Quote said nothing at all about bandwidth on its v1 branch —
the one case where the qualifier actually matters — and the **Customer Proposal
stated no basis in either version**, because ADR 0089 §3 strips the capacity bars
*and the sizing-basis note that explains them* while still rendering a `Bw` column.

## Options considered

- **Show "Peak ingest" and "Average ingest" side by side**, as the brief proposed —
  but for a v2 row there is no average to show, and manufacturing one by applying
  the duty cycle to bandwidth would resurrect precisely the time-average ADR 0125
  removed. Worse, printing it beside the peak invites sizing a switch on the lower
  number.
- **Rename the single figure to "Peak ingest."** Rejected on audience: the primary
  user is not tech-savvy, and "ingest" is not their word. "Bandwidth … peak while
  recording" already says it in language an integrator and a non-technical reader
  both parse.
- **Recompute or backfill v1 bandwidth to a true peak.** Rejected: it rewrites
  figures on already-issued documents, and ADR 0125/0126 already established that
  v1 rows are not comparable across the boundary. The stamp exists for this.
- **Fix the copy in place at each of the surfaces.** Rejected: the same sentence
  was already hand-written in three renderers and had already drifted apart.

## Decision

**One bandwidth figure, and its basis is read off `calc_version` by a single
shared helper.** `bandwidthBasis(calcVersion)` in `compute.ts` returns
`{ isEventPeak, short, clause }`; the copy lives there and nowhere else.

| Surface | v2 | v1 |
|---|---|---|
| Detail Totals + group column header | "Mbit/s peak" | "Mbit/s motion-weighted avg" |
| Detail — new **Network sizing** row | peak, in words, with what to size | states the true peak is higher, and to re-save |
| System Estimate PDF capacity bar | "peak while recording" | "motion-weighted average" |
| System Estimate + Project Quote prose | `Network sizing: …` clause | same clause, version-appropriate — **now on both branches** |
| Camera-schedule note (**both** PDF variants) | what the Bw column means | same |

Two deliberate scope choices. The **live** surfaces — calculator UI, Quick Calc
(which renders no bandwidth at all), and the submit-time emails — keep their
unconditional "peak" wording, because they only ever run the current engine.
And the **appliance** `max_bandwidth_mbps` shown by the Price Book, datasheets,
and VideoX/QuickCompare is a different quantity — hardware capability, not
required ingest — and is deliberately untouched.

The Customer Proposal's basis went into the camera-schedule note rather than the
capacity block, because that note is the only one of the two that renders in the
stripped variant. No field was added to the shared snapshot and the assembler is
untouched, so the discount leak guard is structurally unaffected — and it passes.

## Consequences

**Positive:** no banked figure is described as something it is not; the Customer
Proposal states its Bw basis for the first time; a legacy quote now tells the
reader the network figure is low and what to do about it; the sentence exists once
instead of three times, so it cannot drift again. Six new tests pin it, including
a render-level assertion in both variants and a canary proving the Customer
Proposal assertion is satisfied by the schedule note rather than by bars that are
supposed to be absent.

**Negative:** legacy quotes now carry a visible caveat, which reads as a downgrade
to anyone who had trusted the old number — correct, but it will prompt questions.
"Motion-weighted avg" is a longer column header than "peak" and pushes that column
wider on the detail table. And the v1 clause tells the reader to re-save the quote,
which resizes it under the current model — right for accuracy, but it is a nudge
toward a number that will differ from the one they were originally given.

**When to revisit:** if a scene-activity or duty-cycle input is ever added to the
bandwidth path, the peak/average split this ADR declined becomes necessary and
should be reopened against the brief's original framing. Also if `groups_payload`
is ever migrated wholesale, v1 bandwidth could be restated at the event rate and
the second branch retired.
