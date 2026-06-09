# 0052 — System Estimate PDF reads banked complexity label & recording mode

- **Status**: Accepted
- **Date**: 2026-06-09

## Context

The 2026-06-05 calculator rework (ADRs #0049, #0050) replaced the three vague
complexity tiers with six descriptive scene labels and added a Constant /
Motion-only recording mode. Both land in `groups_payload` as `complexityLabel`
and `recordingMode` ([actions.ts](../../src/app/(app)/calculator/actions.ts)).

The customer-facing System Estimate PDF still showed the old tier word
("high"/"low") because its mapping layer (`render.ts → mapGroups`) only read the
legacy `complexity` tier and dropped the two new fields — they were never added
to the PDF's `GroupsPayload` / `SubmissionPdfGroup` types. The storage/bandwidth
numbers were already correct (they flow through `recordingPercent` /
`motionPercent`), so the gap was labels only.

Legacy rows banked **before** the rework carry only a tier word — no
`complexityLabel`, no `recordingMode`.

## Options considered

- **Re-derive the label from the multiplier/tier index in the PDF** — rejected:
  duplicates the `COMPLEXITIES` table in a second place and drifts the moment the
  curve changes; tier alone now collapses 6 levels → 3 so it can't recover the
  exact label anyway.
- **Plumb a fresh field end-to-end from compute** — unnecessary: the data is
  already persisted; only the PDF mapping layer was discarding it.
- **Read the already-banked `complexityLabel` / `recordingMode` at the mapping
  layer, with a coarse fallback for legacy rows** — chosen.

## Decision

`mapGroups` reads `complexityLabel` and `recordingMode` straight from
`groups_payload`. Legacy rows with no `complexityLabel` fall back to a coarse
tier-derived label (`low→"Low detail"`, `med→"Medium detail"`,
`high→"High detail"`, else `"Standard"`); a missing/garbage `recordingMode`
defaults to `"constant"`. No label is ever reconstructed from the multiplier.

## Consequences

**Positive:** PDF shows the full descriptive scene label and the recording mode
(folded into the operation-hours cell) with no new pipeline field; the
`COMPLEXITIES` table stays the single source of truth.

**Negative:** Legacy submissions can only show the coarse fallback label — the
precise six-level label can't be recovered because it was never banked. This is
an accepted limitation; those rows predate the data.

**When to revisit:** if legacy rows are ever backfilled with `complexityLabel`,
or if the PDF needs a field that genuinely isn't in `groups_payload` (then plumb
it from compute, don't re-derive).
