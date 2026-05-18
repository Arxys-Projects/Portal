# 0011 — Camera groups: persist as child rows (decision pending Step 5)

- **Status**: Accepted (deferred implementation)
- **Date**: 2026-05-18

## Context

The legacy calculator's central concept is the **camera group** — one project may have several groups, each with different resolution / codec / fps / complexity / motion characteristics. Bandwidth and storage roll up across groups. The PDF and email show per-group detail.

Our `submissions` table (migration `20260515193702_initial_schema.sql`) has a single row per submission with **single-valued** columns: `resolution_code`, `codec`, `complexity`, `cameras_count`, `bandwidth_mbps`, `storage_tb`. It doesn't capture per-group breakdown.

Step 4 builds the calculator UI with full group fidelity (the user can add, duplicate, remove groups; totals roll up live). It does not save anything to the DB. Step 5 will introduce save + recommendation, and at that point we have to choose how to persist groups.

## Options considered

- **A. Single-row aggregate (current schema).** Compute the totals client-side, save only the aggregates. Lose per-group breakdown at the DB level. PDF can still show detail because it's rendered from a snapshot at submit time, but the historical record loses it.
- **B. `submission_groups` child table** with FK to `submissions(id)`. One row per group. Normalized, queryable, and inspectable in the Supabase Table Editor. Adds a join when reading.
- **C. JSON column on `submissions`** holding the groups array. Single row to read, no join, but inspecting / aggregating across submissions is awkward without query gymnastics.

## Decision

**Defer the implementation to Step 5, but commit to option B (`submission_groups` child table).** Reasoning:

- Per-group detail is part of the quote — admins reviewing a submission a year later need to see exactly what the partner specified. Aggregates aren't enough.
- A normalized child table beats JSON for queryability: admin filters like "show me submissions with any 4K group" or "biggest groups by storage" are SQL, not JSON path expressions.
- The migration for the new table will land in Step 5 alongside the recommendation algorithm — both are part of the same logical change (extend the schema to support the full submission flow).

## Consequences

**Positive:**
- Step 4 ships cleanly without DB changes.
- Step 5 has one schema-level change to land instead of two.
- The eventual schema preserves the data shape that the calculator already produces, so the form doesn't have to flatten or stringify groups at submit time.

**Negative:**
- Step 5 will be a slightly bigger change (migration + recommendation algo + persist code).
- Existing `submissions` columns for `resolution_code` / `codec` / `complexity` will be dropped or repurposed in Step 5's migration. Mitigated by the fact that the table is empty — no production data to migrate.

## When to revisit

If Step 5 reveals that per-group queryability is never used in practice and the join overhead is annoying, we can collapse to JSON later. Unlikely.
