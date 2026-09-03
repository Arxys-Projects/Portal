# 0143 — "Over-provisioning X%" means X% free disk space, not a storage multiplier

- **Status**: Accepted
- **Date**: 2026-09-01

## Context

A brief for five JCT Solutions / Monmouth County calculator submissions specified
"Over-provisioning: 30%" alongside the base (not pre-inflated) sensor counts. That term
does not exist anywhere in the calculator's schema or UI — the closest candidate field is
`max_disk_utilization_pct` (ADR 0126, "the one buffer"), where
`required_available_capacity = required_recorded_data / (utilization / 100)`.

Two readings of "30% over-provisioning" onto that field diverge meaningfully:

- **Multiplicative buffer**: over-provision by 30% means capacity = needed × 1.30, so
  `utilization = 100 / 1.30 ≈ 77%`.
- **Free-space target**: 30% of the array should sit empty, so `utilization = 100 − 30 = 70%`.

Asked directly, Andy clarified the old (legacy, pre-portal) calculator style added a flat
20% extra storage; the new intent is different — 30% of each array's capacity should be
left free for adding more cameras later, and sites should spread across more, smaller
servers rather than fewer large ones.

## Options considered

- **77% utilization** (multiplicative over-provisioning ratio) — rejected; not what was
  meant.
- **70% utilization** (30% free disk space) — chosen, per direct confirmation.

## Decision

`max_disk_utilization_pct = 70` for all five JCT/Monmouth submissions. In general, when a
brief says "N% over-provisioning" or "N% free space" without naming the calculator's own
field, read it as `max_disk_utilization_pct = 100 − N`, not as a multiplier — confirm with
Andy if the brief's own wording doesn't make the direction unambiguous.

## Consequences

**Positive:** submissions size arrays with genuine headroom for camera growth, matching the
stated business intent (spread across smaller servers, more free space per install) rather
than silently reproducing the old ×1.2 legacy margin under a new name.

**Negative:** none — this is a vocabulary mapping, not a math change. The field, formula, and
60–88 UI range (ADR 0126/0131) are unchanged; 70 sits inside that range (also within the
DB's wider 60–90 CHECK constraint) but below the UI's default-is-the-ceiling design intent
(ADR 0126's "MAX and DEFAULT are the same number" is about the *default*, not a floor — a
caller may still request a lower, more conservative utilization).

**When to revisit:** if a future brief uses "over-provisioning" again, re-confirm rather than
assuming — this ADR records one resolved instance of an ambiguous term, not a permanent
glossary entry.
