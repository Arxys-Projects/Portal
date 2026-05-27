# 0037 — Status-guarded, RLS-enforced, draft-only submission delete (A3 redesign)

- **Status**: Accepted
- **Date**: 2026-05-27

## Context

A3 ("hard-delete a submission with a confirm dialog") originated in Phase 1 and was deferred twice: out of Phase 3 Step 3, then locked in [`phase-3-plan.md`](../phase-3-plan.md) to Step 5 so it could be designed alongside the new `submissions.status` enum. The deferral reason: a blanket hard-delete is incompatible with submissions that carry business state. Once a submission is `sent` / `won` / `lost` / `on-hold`, deleting it destroys pipeline history.

ADR [`0023`](./0023-partner-management-actions.md) took a "no hard delete" stance — but that was about **partners** (audit retention of the user base), not submissions. Submissions are the partner's own working documents; a partner who fat-fingers three draft quotes for the same project has no way to clear the junk, which is the actual user pain A3 was meant to solve.

The design question for Step 5: *when* is deleting a submission safe, and *where* is that rule enforced?

## Options considered

- **Keep "no hard delete" (extend 0023 to submissions).** Preserves all history, but partners accumulate un-clearable draft junk. Doesn't solve A3.
- **App-layer status guard only.** The Server Action checks `status` before issuing the DELETE. Simple, but a bug in the action — or a direct POST to the Server Action endpoint — bypasses it and can destroy a `won` submission.
- **DB-level (RLS) status guard, draft-only.** The DELETE policy embeds `status is null or status = 'draft'`. Even a buggy or hand-crafted request cannot delete a submission that has advanced past draft. The action's job shrinks to surfacing the "can't delete" message.
- **Soft delete (`deleted_at` column).** Most audit-friendly, but adds a nullable column plus a `deleted_at is null` filter to every submission read across the app + PDF + admin. Over-engineered for the goal of clearing draft junk at a 5-partner scale.
- **Retention-window deletion of `lost`.** Allow deleting `lost` submissions after N days. Raised as a Step 5 open question; deferred — no demand yet.

## Decision

**Hard delete is permitted only when `status` is `draft` or `NULL`, enforced at the database via RLS.**

The policy `submissions_delete_own_draft` carries both the ownership check and the status guard:

```sql
create policy submissions_delete_own_draft
on public.submissions for delete
to authenticated
using (partner_id = auth.uid() and (status is null or status = 'draft'));
```

A blocked delete (wrong owner, or non-draft status) matches zero rows and returns no error; the `deleteSubmission` Server Action treats a zero-row result as a failure and returns *"This submission cannot be deleted because it has a status other than draft."* The confirmation dialog is the UI's responsibility (an inline Confirm/Cancel in the pipeline row), not the action's.

`NULL` status is treated as `draft` for delete purposes because pre-Step-5 rows (19 of them) and any future row created before its status is set are semantically un-started drafts.

The companion UPDATE policy `submissions_update_own` is row-level only (`partner_id = auth.uid()`). The "only `status` + `is_preferred` may change" restriction is enforced in the Server Action, not RLS — the standard Supabase split of row-level in the DB, column-level in the app.

## Consequences

**Positive:**
- Partners can self-clear draft junk without admin involvement.
- A submission with business state (`sent`/`won`/`lost`/`on-hold`) cannot be deleted even by an application bug or a direct POST — the guarantee lives in Postgres, not in TypeScript.
- The guard is a single policy clause; no soft-delete plumbing, no read-path filtering.

**Negative:**
- A wrongly-statused submission can't be deleted directly — the partner must first set its status back to draft, then delete. Acceptable and discoverable.
- No audit trail of deletions. Drafts are low-value working documents, so this is tolerable; a future compliance need would push toward soft-delete.
- Reverses ADR 0023's "no hard delete" — but only for **submissions**, not partners. The partner-management surface (0023) is unchanged.

**When to revisit:**
- If partners ask to delete `lost` submissions after a retention window (the deferred Step 5 question).
- If a delete audit trail becomes a compliance requirement — that lands as a soft-delete ADR with the data-lifecycle contract spelled out, superseding this one.
