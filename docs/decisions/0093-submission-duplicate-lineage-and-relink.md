# 0093 — Submission revision lineage, delete-error surfacing, and Pipedrive relink

- **Status**: Accepted — steps 1 and 2 shipped and live 2026-07-24 (step 1 via [PR #7](https://github.com/Arxys-Projects/Portal/pull/7); step 2 via [PR #8](https://github.com/Arxys-Projects/Portal/pull/8)); step 3 shipped same day (see "Correction 2" — silent-swallow fixed **and** the admin retry action built; the stored failure-reason column was deliberately not added). **Read "Correction 2" first: neither step 1 nor step 2 was the cause of the symptom this ADR was opened for.**
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

A third orphan appeared after step 1 was committed and pushed, because it had not yet merged to `main` — commit-and-push is not deploy. Opened [PR #7](https://github.com/Arxys-Projects/Portal/pull/7) (`fix/raid60-net-usable-capacity` → `main`) to close that gap; awaiting review/merge.

## Correction: the diagnosis in "Context" above was incomplete

PR #7 merged (2026-07-24) and step 1 went live, and the North Bergen SD submission still produced a second "Open" row the very next time it was revised — a 5th recurrence, by one user, one revise click. That is not explainable by the "two independent users" race this ADR's Context section opens with, and the step-1 warning is structurally incapable of catching it: its dup-check deliberately excludes `input.sourceSubmissionId` from the "existing open" comparison (`calculator/actions.ts`, now line 234) so a legitimate single-user revision never trips it — but on a plain revise, the *only* other open row for that on-behalf target is the source itself, which the filter throws away before ever counting anything.

The real mechanism, confirmed by tracing the revise flow end-to-end: `submitCalculation` ([`calculator/actions.ts`](../../src/app/(app)/calculator/actions.ts)) always `INSERT`s (line ~370), by design (ADR [0039](./0039-quote-revision-rehydration.md): "a revision is a brand-new row, the source is never mutated"). Nothing, anywhere, ever closes or flags the source row afterward. So **every** revision — on-behalf or not, one user or many — leaves the old row `status = "open"` forever while inserting a new, also-`"open"` row with a freshly recomputed price. The user's report ("anytime a project is revised it breaks, on every project") was the correct scope; the original two-user-race framing was a real but narrower instance of this same underlying gap, and happened to be the one an admin noticed first because it also produced a stray Pipedrive deal.

Step 2 (below) fixes the actual mechanism. Step 1's duplicate warning stays in place — it still catches the genuinely-independent two-user case that lineage tracking alone can't distinguish from an intentional fresh submission — but it was never a fix for revise-time duplication, and the ADR text above should not be read as having claimed it was.

## Step 2 status (2026-07-24)

Implemented in the working tree (not yet committed/deployed):

- **Migration** [`20260724000001_submission_revision_lineage.sql`](../../supabase/migrations/20260724000001_submission_revision_lineage.sql): additive nullable `submissions.parent_submission_id uuid references submissions(id) on delete set null`, plus a partial index. No data migration, no existing column touched.
- **`submitCalculation`** ([`calculator/actions.ts`](../../src/app/(app)/calculator/actions.ts)) sets `parent_submission_id` on every revise, from an RLS-scoped read of the declared source (the same validated fetch already used to inherit the Pipedrive deal — consolidated into one query instead of two). A guessed/foreign source id silently fails to attach, same trust model as the existing Pipedrive-inherit check.
- **`groupIntoDeals`** ([`lib/pipeline/forecast.ts`](../../src/lib/pipeline/forecast.ts)) now merges buckets connected by `parent_submission_id` (a small union-find over the existing text-match buckets), so a revise that also edits the project name still collapses into one deal instead of reading as two. Representative selection now prefers the lineage leaf (no other row points to it as parent) over a merely-newer-by-clock superseded row; an explicit `is_preferred` pin still overrides both. A new `supersededIds()` helper flags any row another row's `parent_submission_id` points to.
- **UI**: the admin Grouped view's per-deal drill-down now shows a "Superseded" badge next to a stale row's real status, instead of showing two "Open" rows that look equally live. The submission detail page (both `/admin/submissions/[id]` and `/submissions/[id]`) shows "Revision of …" / "Superseded by …" lineage links via a new `loadSubmissionLineage()`.
- 264/264 tests pass (6 new: lineage merge with a changed project name, superseded-never-wins-on-clock, preferred-still-wins-over-leaf, foreign parent id ignored gracefully, plus `supersededIds`), `tsc --noEmit` clean.
- Merged directly to `main` via [PR #8](https://github.com/Arxys-Projects/Portal/pull/8) — no feature branch left dangling this time (the user's explicit direction after step 1 hit exactly that gap on its first attempt).
- **Migration applied to production** the same session, after discovering the pending-migration queue also included 3 already-live, dashboard-applied migrations (`20260720000001`, `20260721000001`, `20260721000002` — each carries a STOP-AND-FLAG "apply via dashboard, not CLI" comment; repaired their tracking via `supabase migration repair --status applied` after independently verifying each was really live) and 2 genuinely-still-pending but *not-yet-approved* datasheet migrations (ADR 0090, paused pending direction), which were deliberately excluded from this push rather than swept in by `db push`'s all-pending-in-one-batch behavior. Confirmed live via `supabase migration list` (Local=Remote) and a read-only REST check of `submissions.parent_submission_id`. Full process note in the JOURNAL entry below — this migration-history desync is a standing risk in this repo (dashboard-applied STOP-AND-FLAG migrations never register in the CLI's tracking table), not specific to this bug.

## Correction 2 (2026-07-24): the actual cause was none of the above — Pipedrive soft-deletes

After steps 1 and 2 were both live, the symptom recurred a 6th time. The cause was finally established from a **production log** rather than from reading source:

```
PipedriveError: Entity is deleted. You must first restore it before you can edit
  status: 400,  code: 'ERR_DEAL_DELETED'
```

**Pipedrive soft-deletes deals.** A deleted deal still returns HTTP 200 on `GET /v1/deals/{id}` (with `deleted: true`), so it never 404s — but any *edit* returns `400 ERR_DEAL_DELETED`. `submitCalculation`'s revision path keyed its create-a-fresh-deal fallback on `err.status === 404` alone, so this shape hit `else { throw err }`, propagated into the outer swallow-and-log `catch`, and left the revision with `pipedrive_deal_id = null` while still reporting success to the user.

The reinforcing loop is the important part: **each duplicate cleanup deleted the redundant Pipedrive deals, which armed the trap for the next revise of that project.** Every previous "fix" was followed by a cleanup, which guaranteed the next recurrence.

What this means for steps 1 and 2: both fixed genuine defects and both stay. Step 2's lineage tracking is confirmed working (submission `dd100b3f`, the first after that deploy, has `parent_submission_id` set correctly). But neither addressed the missing-Pipedrive-link symptom, and the two-"Open"-rows appearance and the missing-deal failure are *different bugs that produced one user complaint*. Diagnosing from source alone conflated them three times running.

### Fixed

- `isDealUneditableError()` ([`lib/pipedrive/deal.ts`](../../src/lib/pipedrive/deal.ts)) treats `404` and `400`/`ERR_DEAL_DELETED` alike. Deliberately narrow — 401/403/429/5xx and unrelated `400` validation errors still propagate, because silently minting a duplicate deal on a transient failure is worse than the bug being fixed.
- Pipedrive sync failure now warns the submitter via the existing `recommendation.warnings` channel instead of being invisible.
- **Step 3's recovery half is built**: `adminRelinkPipedriveDeal` ([`admin/submissions/actions.ts`](../../src/app/(app)/admin/submissions/actions.ts)) plus a "Retry Pipedrive link" control that replaces the bare "No Pipedrive deal linked" text on the admin detail page. `buildRelinkInputs` ([`lib/pipedrive/relink.ts`](../../src/lib/pipedrive/relink.ts)) rebuilds the deal payload from the persisted columns, since the live calculator state is gone by then; it refuses rather than guessing on a legacy/unresolvable SKU, an absent list price, or unusable `groups_payload`. Only ever fills a MISSING link — never overwrites a live one — and when the row is a revision whose parent still holds a usable deal it updates that deal in place rather than minting a duplicate. The real Pipedrive error is shown to the operator.
- **The stored sync-failure column from the original step 3 sketch was deliberately dropped.** `pipedrive_deal_id IS NULL` already identifies every failed row, and the retry action reports the live error at the moment it retries — which is strictly more useful than a stale reason persisted at submit time. Avoiding a second production migration the same day was the tiebreaker.
- Two adjacent defects fixed in passing: the `pipedrive_deal_id` write-back error was unchecked, and `onBehalfNote` was not passed on the main create path (dropping ADR 0048 rep attribution on every fresh on-behalf submission).

### Consequences

**Negative / still open:** 10 submissions carry `pipedrive_deal_id = null` going back to 2026-06-17, including two Dallas LBJ and NTE VMS revisions at $614,388 and $1,126,378 that never reached the CRM. Step 2 also shipped with **no backfill**, so every pre-existing duplicate pair still displays as two equal "Open" rows permanently.

**When to revisit:** step 3's remaining half (stored failure flag + retry action) is now the highest-value item — without it, every future Pipedrive outage silently orphans submissions again, and the only reason this was caught at all is that a user noticed and complained six times.
