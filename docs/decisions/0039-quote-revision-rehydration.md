# 0039 — Quote revision via rehydration into a new submission row

- **Status**: Accepted
- **Date**: 2026-05-28

## Context

Phase 4 Step 3 lets a partner reopen a past quote, edit it, and save a revision. Two design questions fell out of this:

1. **Where does a revision live?** Mutating the original submission row in place would destroy the prior quote's history (pricing, recommendation, the deal it spawned). A revision is a new working document, not an overwrite.
2. **How do we reconstruct the calculator form from a stored row?** The form's selects (resolution / codec / complexity) are driven by *array indices* into the lookup tables in `tables.ts`. A stored row banks both the raw index (`resolutionIdx`) and the resolved value (`resolutionLabel`, codec `value`, complexity `tier`) inside `groups_payload`. If someone reorders those tables between when a row was written and when it's reopened, the raw index now points at the wrong entry.

The hard constraint for this step was **no database migration** — a revision must work using only the columns that already exist, with any new state being additive JSON inside the existing `input_state` blob.

## Options considered

- **Mutate the source row in place.** Simplest write path, but obliterates quote history and couples the revision to the original deal's lifecycle. Rejected.
- **Add a `parent_submission_id` column to link revisions.** Clean lineage, but requires a migration — explicitly out of scope. Deferred.
- **Rehydrate from raw indices only.** Trivial, but silently corrupts selections the moment a lookup table is reordered. Rejected as too fragile for data that lives indefinitely.
- **Rehydrate by resolved value, falling back to raw index.** Prefer the banked label / codec value / tier (order-independent); fall back to the stored index, then clamp to current array bounds. Survives table reordering. Chosen.
- **Version-stamp the stored shape** so rehydration can branch on which fields a row was written with (e.g. the Phase 4 Step 2 add-on booleans). Additive — just an integer field in the JSON blob. Chosen.

## Decision

**A revision is a brand-new `submissions` row (status `draft`); the source row is never mutated.** The revision flags (`isRevision`, `sourceSubmissionId`) are submit-flow control passed in the action payload — they are *not* banked into `input_state`, because they are not part of the reconstructable calculator state.

**Rehydration resolves table indices by value first, index second.** `fromStoredSubmission(row)` in [`rehydrate.ts`](../../src/lib/calculator/rehydrate.ts) overlays the banked `groups_payload` values (`resolutionLabel`, `codec`, `complexity`) onto a normalized `input_state`: it looks each up in the *current* table and uses that index; if the value no longer exists (a removed option) it falls back to the stored raw index; either way the result is clamped to current array bounds. `normalizeInputState()` coerces a partial/old/garbage blob into a fully-defaulted, range-clamped shape.

**`input_state` carries an additive `version` stamp** (`INPUT_STATE_VERSION = 1`). v1 is the marker that the two Phase 4 Step 2 add-on booleans are present; absent/0 = a pre-stamp row where add-ons were never written, so they default to `false` rather than trusting a field the writer never set. No migration — the stamp is just another key in the existing JSON column.

## Consequences

**Positive:**
- Quote history is preserved; each revision is its own auditable row with its own pricing and recommendation.
- Rehydration is resilient to lookup-table reordering — the whole point of banking resolved values. Covered by an index-shift resilience test in [`rehydrate.test.ts`](../../src/lib/calculator/rehydrate.test.ts).
- Zero schema change. Everything rides existing columns.

**Negative:**
- No explicit lineage link between a revision and its source (no `parent_submission_id`). Project grouping in the pipeline is by `project_name` only, so revisions of the same project still cluster, but there is no first-class "this is a revision of #X" relationship. Accepted for this step.
- The version stamp is a soft contract enforced only in `normalizeInputState` — a hand-edited `input_state` with a wrong version could mis-gate fields. Low risk; `input_state` is server-written.

**When to revisit:**
- If revision lineage becomes a product requirement (e.g. "show revision history for this quote"), that lands as a migration adding `parent_submission_id` and supersedes the no-link decision here.
- If the stored shape changes in a way rehydration must branch on, bump `INPUT_STATE_VERSION` and add the branch in `normalizeInputState`.
