# 0040 — Non-destructive Pipedrive deal update on quote revision

- **Status**: Accepted
- **Date**: 2026-05-28

## Context

When a partner saves a revision (ADR [`0039`](./0039-quote-revision-rehydration.md)), the source quote may already have a Pipedrive deal — created at original submit time by `createDealFromSubmission`. Sales works that deal: they move it through pipeline stages, reassign its owner, link contacts, maybe move it to a different pipeline entirely. A revision should refresh the *calculator-derived* facts on that deal (new pricing, new camera count, new portal link) **without** clobbering anything sales has touched.

The create path writes a full payload: deal `value`, the six `arxys_*` custom fields, the admin-curated calculator fields, **and** routing/ownership/contact fields — `title`, `currency`, `user_id`, `person_id`, `org_id`, `pipeline_id`, `stage_id`. Re-sending that full payload on a revision would reset the deal's stage to "New Lead" and its owner back to the default — destroying sales' work. That is the exact failure mode this ADR exists to prevent.

A secondary question: what if the source quote has no deal, or the deal was deleted in Pipedrive since it was created?

## Options considered

- **Re-run `createDealFromSubmission` on every revision.** Always creates a *new* deal, leaving the original orphaned, and emails sales again. Duplicates pipeline entries. Rejected.
- **Update the deal with the full create payload.** Refreshes the data but resets stage/owner/pipeline — the destructive outcome we must avoid. Rejected.
- **Update with a hand-picked subset, enforced by a shared field-builder.** Extract the calculator-derived portion of the payload into `buildDealFields()`; the update path sends *only* that, the create path spreads it and adds the routing fields. Prohibited fields become architecturally impossible to send on update. Chosen.
- **Guard prohibited fields with a runtime denylist before PUT.** Belt-and-suspenders, but if the denylist and the builder drift, the builder is the source of truth anyway. The structural guarantee (the update path never *constructs* routing fields) is stronger than a filter. Chosen the structural approach instead.

## Decision

**A revision updates the existing deal in place via `PUT /v1/deals/{id}`, sending only calculator-derived fields.**

`buildDealFields(submission, recommendation, keys)` in [`deal.ts`](../../src/lib/pipedrive/deal.ts) builds the shared portion: deal `value` + the six `arxys_*` fields (including `arxys_portal_url`, which points at the *new* revision row) + the admin calculator fields. It emits **no** `title`, `currency`, `user_id`, `person_id`, `org_id`, `pipeline_id`, or `stage_id`. `createDealFromSubmission` spreads `buildDealFields(...)` and *then* adds the routing/ownership/contact fields; `updateDealFromRevision` sends `buildDealFields(...)` verbatim and never resolves pipeline/stage/owner or upserts person/org. Because the update path never constructs the prohibited fields, it cannot send them — verified by a unit test that asserts `stage_id`/`user_id`/`pipeline_id` (and `title`/`currency`/`person_id`/`org_id`) are absent from the PUT body.

**The source deal is found RLS-scoped.** `actions.ts` reads `submissions.pipedrive_deal_id` for `sourceSubmissionId` through the user-scoped client, so a partner can only inherit a deal from a quote they own (covered by RLS Test 18). The new revision row is then linked to that same deal id.

**Fallback to create** when the source has no `pipedrive_deal_id`, or when the `PUT` returns 404 (the deal was deleted in Pipedrive since the source quote was filed). Any other Pipedrive error is logged and does not regress the already-committed submission (ADR [`0020`](./0020-pipedrive-deal-creation-on-submission.md)).

**A revision posts one note** — `"Revised from portal on {date}"` with the current add-on toggle status — and **sends no new sales-notification email** (the deal-note pattern reuses Phase 4 Step 2's pinned-note approach). The note is wrapped in try/catch so a note failure never fails the revision.

## Consequences

**Positive:**
- Sales' stage, owner, pipeline, and linked contacts survive a revision untouched — the guarantee is structural, not a denylist that can rot.
- One deal per quote lineage instead of a new orphaned deal per edit; the revision row points at the same deal.
- No duplicate sales email on every edit; sales see the change via the deal note and refreshed fields.

**Negative:**
- The 404-fallback can misfire if a non-deal Pipedrive call inside the update path happens to 404 (e.g. a dealFields fetch), creating a fresh deal when an update was intended. Extremely unlikely and the fallback is still non-destructive (a new deal, not a corrupted one). Accepted.
- `arxys_submission_id` and `arxys_portal_url` on the deal now point at the *latest* revision, not the original. Intended — the deal should reflect the current quote — but it means the deal no longer references the row that created it.

**When to revisit:**
- If sales want a per-revision history on the deal rather than a single rolling note, switch the note to an append-only timeline.
- If revision lineage (ADR 0039's deferred `parent_submission_id`) is added, the deal could link to the lineage root instead of the latest row.
