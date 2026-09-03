# 0135 — Excluded a nonexistent camera model number rather than fabricate its specs

- **Status**: Accepted
- **Date**: 2026-08-17

## Context

A corrected camera BOM for the new "Williamson Co. ADC Site 2" project
(Cornerstone Detention - HQ) listed `PNM-A16084RVD` at qty 44. This model
does not exist. `camera_specs` had no row for it, and neither did
Hanwha's own site or any distributor.

Hanwha's product-details page (`hanwhavision.com/us/products/product-details/{slug}`)
silently 307-redirects an unresolvable product code to the generic category
listing — verified against known-real models (which resolve normally) and a
deliberately fake slug (which redirects identically). `pnm-a16084rvd` redirects,
as does every plausible near-typo (`a16085rvd`, `16082rvd`, `a16084rvq`,
`a16085rvq`, `c16084rvd`, `16084rvd`). A follow-up sweep of ADI, B&H, CDW,
Anixter, and Hanwha's US/EU/global sites found zero hits anywhere.

The likely source: the number conflates two distinct real Wisenet P
multi-directional families that never share these parts — the 2-sensor
`12082`/`12083`-`RVD` family and the 4-sensor `16083`/`16013`-`RVQ`/`RQZ`
family — plus an "A" prefix belonging to an unrelated Wisenet A-series line.
No source names any of these as the intended correction, so it reads as a
transcription error, not a resolvable SKU.

## Options considered

- **Guess the intended model from naming-pattern similarity** (e.g.
  `PNM-C16083RVQ`) and seed/quote against it — rejected: no source confirms
  the substitution, and guessing a different SKU's specs onto this line
  item would misquote by whatever the two models actually differ on.
- **Seed a row with placeholder/estimated specs** — rejected outright per
  standing project convention (`scripts/load-camera-specs.ts`'s stop-and-flag
  gate): fabricated specs are worse than no row.
- **Exclude the line entirely, flag for correction** — chosen.

## Decision

`PNM-A16084RVD` was not seeded into `camera_specs` and its qty-44 line was
left out of the new submission entirely, rather than substituted with a
guessed model or estimated specs. The gap is flagged for Andy to supply the
correct model number, at which point the line can be added.

## Consequences

**Positive:** the submission's totals (cameras, bandwidth, storage, SKU
recommendation) are exact for every line that IS real, with no silent
misquote hiding in one guessed line.

**Negative:** the new submission (`ce0946e5-6789-4a34-81ef-0786f5b18226`)
undercounts total cameras by 44 and understates storage/bandwidth
accordingly until the real model is identified and added.

**When to revisit:** as soon as the correct model number is confirmed —
seed its real spec row (per the same gate this ADR follows), then add its
line to the submission via `/calculator?revise=ce0946e5-6789-4a34-81ef-0786f5b18226`.
