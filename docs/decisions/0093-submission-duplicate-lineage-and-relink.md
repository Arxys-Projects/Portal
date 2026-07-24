# 0093 — Submission revision lineage, delete-error surfacing, and Pipedrive relink

- **Status**: Proposed (step 1 implemented in working tree 2026-07-24, not yet committed/deployed)
- **Date**: 2026-07-24

## Context

Investigated a live production case where four `submissions` rows all represented one real job (North Bergen SD grant quote submitted on behalf of JCT Solutions) — see the 2026-07-24 JOURNAL entry for the specific diagnosis and manual cleanup. The rows existed because two internal Arxys users independently ran the calculator for the same job, unaware the other had already submitted.

Four separate, mostly-independent design gaps combined to produce the confusion:

- ADR [0039](./0039-quote-revision-rehydration.md) made every calculator revision a brand-new `submissions` row with no `parent_submission_id`, explicitly deferring lineage tracking. Nothing links a revision back to its source at the data level.
- The Pipedrive sync call in `submitCalculation` (`src/app/(app)/calculator/actions.ts:517-555`) is wrapped in a single `try/catch` that only logs on failure. A failed sync leaves `pipedrive_deal_id` permanently `null` with no retry or backfill path anywhere in the codebase.
- `adminDeleteSubmission` (`src/app/(app)/admin/submissions/actions.ts:51-66`) is missing the zero-row-deleted check that the partner-facing delete path has (`src/app/(app)/submissions/actions.ts:121-132`), and delete failures caused by the `project_quotes.submission_id on delete restrict` FK surface only as a generic `dbError()` string, hiding the real cause from the admin.
- The admin "Grouped" view clusters submissions by a literal lowercase/trim text match on `project_name` plus effective partner (`src/lib/pipeline/forecast.ts:87-89`). Any spelling difference, or a different creating partner acting on behalf of the same customer, puts true duplicates in different buckets — or scatters them across the ungrouped flat list entirely.

None of these are regressions; each was a deliberate, documented scope cut at the time. They compound because nothing detects or warns about the duplicate at submit time, so the first signal anyone gets is an admin manually noticing two deals for one customer.

## Options considered

- **Do nothing, handle case-by-case.** Cheap per-incident, but this has now happened twice (two different internal users, same job) and each recurrence needs a manual DB query + Pipedrive edit to untangle.
- **Add `parent_submission_id` migration**, revisiting ADR 0039's explicit deferral now that it's caused real production confusion. Gives a first-class lineage relationship; requires a migration.
- **Improve the grouping heuristic only** (fuzzy project-name match, no schema change). Cheaper, but still heuristic — doesn't fix the "no lineage" gap and does nothing to prevent the double-Pipedrive-deal outcome, which happens at submit time, not display time.
- **Warn at submit time.** Before inserting a fresh (non-revision) submission, check for an existing `open` submission with the same effective on-behalf-of partner within a recent window, and warn the submitting user. Directly prevents the specific recurrence seen here.
- **Fix delete-surfacing and Pipedrive relink independently.** Smaller, valuable regardless of the lineage decision, and doesn't need a migration.

## Decision

Proposed sequencing (not yet started — this ADR scopes the work, it doesn't ship it):

1. **No-migration guardrails**, shippable anytime:
   - Fix `adminDeleteSubmission` to check the deleted row count and return a real error, matching the partner-facing path.
   - Have `dbError()` (or the delete action) recognize Postgres `23503` (FK restrict) and surface "Can't delete — this submission has a generated quote" instead of the generic message.
   - Add a warning at calculator submit time when an `open` submission already exists for the same effective on-behalf-of partner within N days, so the *submitting* user catches the duplicate before it reaches Pipedrive.
2. **Schema change** (needs the same migration-approval gate this repo uses elsewhere, e.g. ADR 0083): add a nullable `parent_submission_id uuid references submissions(id)`, set on every `?revise=` insert. Use it — not the `project_name` text match — to group revisions in the admin Grouped view and to power a "revision history" affordance on the submission detail page.
3. **Pipedrive resiliency**: replace the silent `catch` in `actions.ts` with a stored sync-failure flag plus a manual "Retry Pipedrive link" admin action, instead of leaving `pipedrive_deal_id` null forever with no way to recover.

## Consequences

**Positive:** prevents recurrence of the exact case handled manually on 2026-07-24; makes delete failures actionable instead of mysterious; gives admins one place to see a job's full revision history instead of reconstructing it by hand from timestamps and fuzzy names.

**Negative:** step 2 is a real migration and, per this repo's practice, ships only on migration approval, not silently alongside other work. Step 3 changes existing swallow-and-log behavior for Pipedrive sync, so it needs a regression check that existing revision-update flows (ADR 0040's non-destructive update) aren't disturbed by adding a stored failure state.

**When to revisit:** if another duplicate-submission incident happens before this ships, that's the signal to prioritize step 1 (the no-migration guardrails) immediately rather than waiting to bundle it with the schema change.

## Step 1 status (2026-07-24)

Forced early: two more orphan drafts for the same North Bergen SD job appeared *after* the manual cleanup in the 2026-07-24 JOURNAL entry, confirming the bug was still fully live. Step 1 is implemented in the working tree (not yet committed or deployed):

- `adminDeleteSubmission` ([`src/app/(app)/admin/submissions/actions.ts`](../../src/app/(app)/admin/submissions/actions.ts)) now checks the deleted row count (matching the partner-facing path) and returns "This submission can't be deleted because a quote has been generated from it." on a `23503` FK-restrict instead of the generic message.
- `submitCalculation` ([`src/app/(app)/calculator/actions.ts`](../../src/app/(app)/calculator/actions.ts)) now warns (non-blocking, surfaced through the existing `recommendation.warnings` array) when another `open` submission already exists for the same on-behalf-of target within the last 14 days and isn't the current submit's declared revision source. Scoped to on-behalf submissions only, so a partner's own normal revision flow (whose source row stays open) never trips it.

258/258 tests pass, `tsc --noEmit` clean. Steps 2 (`parent_submission_id` migration) and 3 (Pipedrive retry/relink action) remain proposed only.
