# 0163 - A failover holds each camera group for at most that group's own retention

- **Status**: Accepted (Andy, 2026-10-19). Amends the storage formula of [0159](./0159-failover-sized-on-the-primarys-basis-from-per-group-daily-load.md); the rest of 0159 stands.
- **Date**: 2026-10-19
- **Related**: 0132 (per-group retention), 0159 (failover sizing), 0162 (failover days default to the longest retention)

## Context

ADR 0159 sized each failover as (daily load ÷ primary units) × failover days, where daily load is
the sum of each group's storage ÷ its own retention. That multiplies every group by the full
failover days, including groups that keep less. ADR 0162 then set the failover days default to the
calc's longest retention, so on any mixed-retention calc the shorter groups were counted for days
they do not keep. A tested calc with groups at 90, 14 and 30 days needed 1,299 TB per failover,
against 720 TB for the largest server, so nothing fit. 0159 left the cap open; Andy chose it.

## Options considered

- **Literal formula**: never under-sizes, even if a VMS keeps all failover footage until merge-back.
  At the new default it leaves most mixed-retention calcs with no failover.
- **Cap each group at its own retention**: the failover keeps no more of a group than the primary
  does. Each failover then holds at most one primary's share of the calc's storage.

## Decision

- Each group adds `(storage ÷ retention) × min(failover days, retention)` to what one failover
  holds. A group held for its whole retention adds its storage as is, so floating point cannot lift
  the total past the primary's sizing. Per-unit need = that total ÷ primary units.
- Everything else in 0159 is unchanged: the primary's sizing basis, the camera floor, the shared
  pool and filters, cheapest by MSRP, and no fallback to the primary's SKU.
- The resolver's warning for failover days past the longest retention now says the extra days
  change nothing.
- Code: `recommendFailover` in `src/lib/recommend/failover.ts`.

## Consequences

**Positive:**
- At the default (the longest retention) each failover holds exactly one primary's share. The
  primary's own SKU always qualifies, so a calc sized by `recommend()` never gets a failover bigger
  than its primary. The tested 90 / 14 / 30-day calc now gets 2 × V800-864.
- Shorter failover days still get a smaller server where one fits.
- With every retention at or above the failover days, the formula is the same as 0159's.

**Negative:**
- If a VMS keeps everything recorded on the failover until the primary returns, ignoring
  per-camera retention, a long outage on a mixed calc could fill the failover. That behaviour was
  not checked against any VMS.
- The "nothing fits" warning now fires only on input that disagrees with the primary's sizing.

**When to revisit:** if a VMS Arxys quotes turns out to keep all failover footage until merge-back.
