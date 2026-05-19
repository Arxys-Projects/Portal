# 0020 — Pipedrive Deal creation on submission (synchronous, defensive)

- **Status**: Accepted
- **Date**: 2026-05-19

## Context

Every successful calculator submission needs to land in Pipedrive as a Deal in the "Project Pipeline → New Lead" stage owned by Andy Newbom, so Sales can follow up without checking the portal directly. The submission already triggers a sales email (ADR 0015) and a partner email (ADR 0018); the Deal is a third side-effect of the same Server Action.

Phase 1 doesn't have real pricing (ADR 0019) — Deal value will be $0 with an explanatory note. The pricing column gets repopulated in Phase 2 (the Pricing Pipeline project) along with a SKU-aware recommendation rewrite.

Pipedrive is an external dependency. An outage or a transient 5xx must not regress submission persistence, PDF render, or email delivery.

## Options considered

- **(a) Polling job: read `submissions` periodically, push the missing ones to Pipedrive.** Lossy (rows in flight when the job dies are at risk), introduces lag between save and Sales' notification, and forces a new piece of infra (a cron worker on Vercel or elsewhere). Wins on isolation but adds operational surface.
- **(b) Write to Pipedrive synchronously in the Server Action, after the email send, wrapped in a `try`/`catch` that logs but never re-throws.** Submission, PDF, and email paths are unaffected by Pipedrive availability. On the happy path the Deal exists by the time the partner sees the inline result.
- **(c) Queue table + worker.** A `pending_pipedrive_pushes` table plus a worker that drains it. Best for retries and at-least-once delivery, but at current submission volume (single-digit per day) this is over-engineered. Two new moving parts to debug.

## Decision

**Option (b).** Inside `submitCalculation` in `src/app/(app)/calculator/actions.ts`, after `sendSubmissionNotification(...)` returns (success or caught failure), call `createDealFromSubmission(...)` inside a separate `try`/`catch`. On success, `UPDATE submissions SET pipedrive_deal_id = ?`. On failure, `console.error("pipedrive deal creation failed", { submissionId, error })` and continue — submission success is already returned to the partner.

The new module tree is `src/lib/pipedrive/`:
- `client.ts` — fetch wrapper with `api_token` query param, typed methods, `PipedriveError` carrying status + `error_info`.
- `lookups.ts` — `resolvePipelineId`, `resolveStageId`, `resolveOwnerId`, `ensureCustomFields`. Module-level cache keyed by promise so each lookup runs once per process lifetime.
- `contacts.ts` — `upsertPerson` (search by email, create if missing) and `upsertOrganization` (search by name, create if missing). Idempotent.
- `deal.ts` — `createDealFromSubmission(submission, recommendation, partner)`: orchestrates the lookups, upserts the contacts, builds the payload, posts the deal, pins a placeholder note.

All four pipeline / stage / owner / custom-field IDs are resolved at runtime by name. Hardcoded IDs would break the moment somebody renamed or recreated the entity in Pipedrive; runtime resolution + cache is the durable shape.

The placeholder note ("Phase 1 placeholder — real pricing in Phase 2 (see ADR 0019). Deal value = 0 by design.") is posted as a pinned Pipedrive Note attached to the Deal, not stuffed into the title. Pipedrive Deals have no top-level description field; Notes are the canonical free-text surface on a deal.

`PIPEDRIVE_DEAL_OWNER_ID` is honored as an optional env override on the owner lookup — surfaces a clear path forward if Andy is ever renamed/deactivated in Pipedrive.

No retry logic, no queue. Phase 1 is one shot; on failure the Deal is simply missed and the `pipedrive_deal_id` column stays `NULL`. A "manual re-sync missed deals" feature is a future step if volume ever justifies it.

`submissions.pipedrive_deal_id bigint` was already declared in `supabase/migrations/20260515193702_initial_schema.sql` (line 119) from the very first migration — no Step 8 schema change required. The brief called for a new migration; discovered the duplication during `supabase db push` and deleted the redundant file. See JOURNAL detour 2026-05-19.

## Consequences

**Positive:**
- Submission, PDF, email, and Deal creation all observable in a single Server Action; one log timeline per submission.
- Pipedrive outage doesn't block submissions or emails — partner always succeeds; Sales still gets the email; the Deal is simply missing in Pipedrive.
- Runtime name → ID resolution means the next administrator can rename "Project Pipeline" or "New Lead" without a code deploy as long as the new names are reflected in `PIPELINE_NAME`/`STAGE_NAME` constants.
- Tests cover the deal builder end-to-end with mocked fetch: cache hits, person/org upsert (both branches), payload shape, custom-field-key creation when missing.

**Negative:**
- Tight coupling between the submission flow and Pipedrive availability. Mitigated by the catch, but a slow Pipedrive (e.g. response taking 30s) still slows the Server Action's end-of-response, even though it can't break it.
- No automatic retry. A transient 5xx loses the Deal until someone adds a re-sync feature.
- Phase 1 Deal value is $0. Anyone reading Pipedrive without ADR context will see a fleet of $0 Deals; the pinned Note + the JOURNAL/ADR are the only counter-signal.
- `import "server-only"` was deliberately omitted from the pipedrive modules so the deal builder can be unit-tested under plain Node (`server-only` is not installed as a top-level dependency in this repo — Next.js carries it internally). Server-side enforcement comes indirectly via `env.PIPEDRIVE_API_TOKEN`, which is non-`NEXT_PUBLIC` and so unreachable from a client component.

**When to revisit:**
- Submission volume grows enough that synchronous Pipedrive calls slow the Server Action perceptibly → move to option (c), a queue + worker.
- A Pipedrive outage causes a meaningful number of missed Deals → add a re-sync feature (query `submissions WHERE pipedrive_deal_id IS NULL`, retry).
- Pricing Pipeline Phase 2 lands → revisit the placeholder note and the $0 Deal value; also revisit the relationship between Step 8 (Deals) and Phase 2's Products push (they use different endpoints today, but the SKU-aware recommendation rewrite may want to attach line items to Deals via `/v1/deals/{id}/products`).
- `arxys_portal_url` placeholder URL (`https://portal-arxys.vercel.app/dashboard`) becomes a real submission-detail permalink → swap the constant in `deal.ts` in a single ADR-tracked change.
