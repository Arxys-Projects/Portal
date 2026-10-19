# 0159 - Failover servers are sized on the primary's basis, from each group's own daily load

- **Status**: Accepted. One open question for Andy: the retention cap under "Options considered". The
  failover days default it describes changed to the longest retention in [0162](./0162-failover-days-default-to-the-longest-retention.md),
  which makes the cap decide whether mixed-retention calcs get a failover at all.
- **Date**: 2026-10-19
- **Related**: 0068 (storage-first sizing), 0126/0127 (the one buffer and the binary charge), 0132 (per-group retention), 0160 (SFP+ 1U exclusion)

## Context

The brief locks the failover rule: count = ceil(primary units ÷ primaries per failover); each
failover needs `max_cameras` ≥ the primary SKU's and usable storage ≥ (daily load ÷ primary units)
× failover days; pick the cheapest qualifying SKU; warn if none qualifies. Failover days default to
half the calc's longest retention. Step 3 had to pick the storage basis and the daily load on a
mixed-retention calc. `recommend()` takes only calc totals (`RecommendationInput` has no retention),
so the per-group figures come from the calc's computed groups, which carry both.

## Options considered

- **Basis**: required capacity (what the primary sizes on: the utilization buffer and the binary
  charge included) vs recorded data. On Escambia's shape (18 × V800-864, uniform retention, half
  of it as failover days) the first gives 9 × V700-480 and the second 9 × V700-384.
- **Daily load**: total ÷ longest retention (under-sizes short groups), total ÷ shortest
  (over-sizes long ones), or Σ each group's storage ÷ its own retention.
- **Failover days past a group's retention** (open, for Andy): count them, as the locked formula
  does, or cap each group at its own retention. The default days come from the longest retention,
  so a mixed calc often has groups shorter than the failover days: a 7-day group at 45 days is
  counted 6.4 times its daily load beyond what it keeps. The cap is right if the failover server
  applies each camera's retention while it records; the literal formula is right if it keeps
  everything until the primary returns and recordings merge back. Milestone describes merge-back;
  whether any VMS applies per-camera retention on the failover meanwhile was not checked. Step 3
  implements the locked formula. Capping is a one-line change in `recommendFailover`.

## Decision

- The basis is the primary's: `computeGroup`'s `storageGb`. A failover covering a primary runs at
  that primary's fill limit, so the two are compared like for like.
- Daily load is Σ (group `storageGb` ÷ group retention). Per-unit need = (daily load ÷ primary
  units) × failover days, for every group.
- One failover covers one failed primary at a time, so it is sized on one primary's share even when
  the ratio is above 1. Two primaries failing together behind one failover is outside the design.
  The share assumes load spreads evenly over the primaries, as the primary's own sizing does.
- Cameras: the failover's `max_cameras` must reach the primary SKU's.
- Same pool and filters as the primary (numeric price, the V200 to V800 allowlist, the SFP+ 1U
  exclusion), through the shared `applyPoolOptions`. Cheapest by MSRP, the field the primary ranks
  on; ties go to the tighter storage fit, then the lower camera rating, then SKU.
- No qualifying SKU returns no choice, the count, the per-unit need and a warning; it never falls
  back to the primary's SKU. For the rep this means no single server holds that many days of one
  primary's footage: the calc saves without failover lines, and the rep lowers the failover days or
  asks sales engineering. A lower ratio adds failovers but does not shrink each one.
- Failover days are whole days from 1 to 730. `resolveSystemDesign` refuses 0 and fractions with an
  error; `recommendFailover` throws on them as `recommend()` does on bad input.
- Code: `recommendFailover` in `src/lib/recommend/failover.ts`.

## Consequences

**Positive:** uniform calcs at the default days get exactly the brief's numbers (Escambia: 9 ×
V700-480 at $75,995 each in the frozen pool, against $117,054 for a V800-864). The literal formula
never under-sizes, whatever the VMS does with retention on a failover server.

**Negative:** mixed-retention calcs with a short heavy group get large failovers, or none that fits
(a test pins a 7-day / 365-day calc where nothing fits at the default 183 days).

**When to revisit:** when Andy confirms how the VMSes he quotes handle retention on failover servers
(then adopt or reject the cap), or if failovers must cover two failed primaries at once.
