# 0160 - SFP+ excludes 1U servers by `product_specs.rack_units`, with `sfp_addon` as a cross-check

- **Status**: Accepted
- **Date**: 2026-10-19
- **Related**: 0068 (recommender), 0094 (pool from product_specs), 0154 (eligibility not stored as a rule), 0159 (failover uses the same pool)

## Context

With SFP+ on, every recorder and failover gets the SFP28 NIC and the 10Gb transceiver pair, and a
1U chassis has no slot for them. Step 0 found that in the V200 to V800 pool only the V200-64/80/96 are
1U, and their `sfp_addon` reads "No". V400 to V800 are 2U to 4U and read "Optional", in two
spellings: "Optional - 2x 10Gb SFP+ ... available" on each family's lowest SKU and a bare "Optional"
on the other two. The partner path, Quick Calc and the golden tests must not change.

## Options considered

- **Key**: `rack_units` vs parsing the free-text `sfp_addon`. `rack_units` is free text too
  (`/admin/specs`), so an exact "1U" match would let "1 U" or "1RU" through.
- **Blank or unreadable rack units under SFP+**: keep the server vs leave it out.
- **Where to filter**: a separate pool per caller vs one option on the shared recommender, used
  by the failover too.
- **Loading the columns**: change `loadCandidateSpecs` now vs in Step 4 with the project path.

## Decision

- `recommend(input, specs, { excludeOneU })` and `recommendFailover(..., { excludeOneU })` share
  `applyPoolOptions` (`src/lib/recommend/pool-filters.ts`). Callers pass `excludeOneU` only when
  SFP+ is on. Without it the pool is the same array and nothing else changes.
- The key is `rack_units`, parsed as a whole number of units ("2U", "2 U", "2RU", any case). A
  server stays in the SFP+ pool only when it reads as 2U or more. 1U in any spelling, blank, and
  anything unreadable ("Tower", "1.5U") are left out: a build the card might not fit is worse than a
  smaller pool. Unreadable values are named in the warning.
- `sfp_addon` is cross-checked: whenever SFP+ is on, any pool SKU where it disagrees with
  `rack_units`, or either is blank, adds one warning naming them. A unit test reads both columns for
  every pool SKU from the repo's seed file (`20260602000001_quickcompare_columns.sql`, one block per
  family) and asserts that 1U and "No" pick out the same SKUs: exactly the three V200s.
- `ServerSpec` gains optional `rackUnits` / `sfpAddon`, and `selectCandidates` carries them.
  `loadCandidateSpecs` does not select them yet. Step 4 adds `rack_units, sfp_addon` to its query.
  Until then `excludeOneU` empties the pool and throws, rather than quoting SFP+ on a 1U.

## Consequences

**Positive:** the partner path's query and outputs are untouched (golden and recommender tests
pass unchanged, plus a test that the option off is identical). A spec edit that breaks the
agreement shows up on the next SFP+ calc.

**Negative:** the agreement test reads the seed file. A later admin edit to the live rows is caught
only by the runtime warning on the next SFP+ calc. Step 4 has one more column pair to load.

**When to revisit:** if a 1U model ever takes SFP+, or if `sfp_addon` becomes a clean yes/no.
