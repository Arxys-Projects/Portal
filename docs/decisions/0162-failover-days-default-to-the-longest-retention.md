# 0162 - Failover days default to the calc's longest retention

- **Status**: Accepted (Andy, 2026-10-19). Migration applied and verified 2026-10-19 (read-back: `value` 1). The mixed-retention
  problem under "Consequences" is resolved by [0163](./0163-failover-holds-each-group-at-most-its-own-retention.md).
- **Date**: 2026-10-19
- **Related**: 0154 (rules are admin-edited), 0158 (system design resolution), 0159 (failover sizing and its open retention-cap question)

## Context

The brief locked the failover days default at half the calc's longest retention, rounded up, and
Step 1 seeded `failover_days_fraction = 0.5`. On 2026-10-19 Andy set the default to the longest
retention itself. The rep can still type any failover days from 1 to 730.

## Options considered

- **Where the default lives**: change the code to ignore the rule vs set the admin-edited rule
  `failover_days_fraction` to 1. The engine already computes `ceil(longest retention × fraction)`
  and accepts fractions up to 1, and the brief says every default is admin-editable.
- **How the live value changes**: an admin edit by hand vs a migration, which also brings a fresh
  database to the same value and keeps a rollback.

## Decision

- Migration `20261019000001_failover_days_default_longest_retention.sql` sets
  `failover_days_fraction` to 1 and rewrites its description. It changes the row only while it
  still holds the seeded 0.5, so a value an admin set on purpose is left alone. Rollback in
  `supabase/rollback/failover-days-default-longest-retention-rollback.sql`. Andy applies it in the
  SQL editor.
- No engine change. The test fixture mirrors the new seed, and the tests pin the new defaults.

## Consequences

**Positive:** a failover covering a failed primary holds that primary's footage for the full
retention.

**Negative:**
- On uniform calcs each failover needs one primary's full share of storage, so it is usually the
  primary's own SKU. On the frozen pool, Escambia's shape gives 9 × V800-864 ($117,054 each),
  where half retention gave 9 × V700-480 ($75,995).
- Under ADR 0159's locked formula, every group is counted for the full failover days, including
  groups that keep less. On mixed-retention calcs the default then usually finds no failover at all.
  A tested example (groups at 90, 14 and 30 days) needs 1,299 TB per failover against 720 TB for the
  largest server. ADR 0159's open cap would make each failover hold exactly one primary's share,
  which the primary's SKU always fits.

**When to revisit:** when Andy answers ADR 0159's cap question, or if failover cost on large
projects pushes the default back down.
