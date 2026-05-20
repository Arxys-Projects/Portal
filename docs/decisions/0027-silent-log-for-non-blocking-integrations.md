# 0027 — Silent `console.error` for non-blocking integration failures

- **Status**: Accepted
- **Date**: 2026-05-20

## Context

A successful calculator submission triggers three best-effort side-effects after the submission row is persisted and the partner has been told it succeeded:

1. PDF render (ADR [0017](./0017-pdf-no-storage.md)).
2. Sales email + partner-copy email (ADRs [0015](./0015-bcc-smtp-user-on-group-notifications.md), [0018](./0018-partner-email-on-submission.md)).
3. Pipedrive Deal creation (ADR [0020](./0020-pipedrive-deal-creation-on-submission.md)).

Each is wrapped in `try`/`catch` so a downstream outage cannot regress the submission persist or the partner's success response. Today, failures in the partner-copy email and Pipedrive paths emit a `console.error(...)` only — they do not page anyone, write to an alerts table, or fan out to a second email. Step 11 §B4 raised the question: should they?

## Options considered

- **(a) Silent `console.error` only (current behavior).** Operator notices a missed deal by browsing `/admin/submissions` and seeing `pipedrive_deal_id` null, or by scanning Vercel function logs. No additional moving parts.
- **(b) Internal-email alert on each failure path.** Second `nodemailer.sendMail` after a caught failure, addressed to `INTERNAL_NOTIFICATION_EMAIL`. Adds a second SMTP send per failure and a second failure mode (the alert send itself can fail and re-enter the same catch).
- **(c) Lightweight `/admin` widget.** "Submissions missing Pipedrive deal" panel that queries `submissions WHERE pipedrive_deal_id IS NULL AND created_at > now() - interval '7 days'`. Visible during normal admin browsing; no extra send paths.

## Decision

**(a) Silent `console.error` only for Phase 1.** The two affected paths log:

- Pipedrive: `console.error("pipedrive deal creation failed", { submissionId, error })` in `src/app/(app)/calculator/actions.ts`.
- Partner-copy email: `console.error("partner submission notification failed", err)` in `src/lib/email/submission-notification.ts`.

Sales-side SMTP failure stays as a thrown error to the partner — the submission already persisted, but the sales notification is the *primary* operator signal and its failure must be visible. Unchanged from ADR 0015.

No alerts wiring is added. No retry queue. No `/admin` widget. Phase 1 ships as-is.

## Consequences

**Positive:**

- No new failure modes from the alert path itself. Adding a second SMTP send to communicate that the first one failed is a classic compound-failure trap.
- Submission volume in Phase 1 is single-digit/day. Manual eyeball of `pipedrive_deal_id` nullness on `/admin/submissions` is adequate.
- The `pipedrive_deal_id` column already exists and is already read by the admin submission detail page, so operator visibility is free.

**Negative:**

- A transient Pipedrive 5xx silently loses the Deal until someone notices the null and re-submits or hand-creates it. No automatic retry.
- A partner whose copy of the report bounces or is rejected by their mail server gets nothing — they assume the report arrived. Sales received it (and the BCC to `SMTP_USER` per ADR 0015), so the operational signal is intact, but the partner UX is silently degraded.

## When to revisit

- Submission volume crosses ~10/day. Manual review of `pipedrive_deal_id IS NULL` becomes impractical; build option (c).
- A real partner complaint traces back to a silent failure (missing PDF, missing deal, missing partner email). One real incident is enough to justify option (b) or (c).
- Phase 2 introduces a re-sync feature for missed Pipedrive deals. At that point silent-log + manual re-sync becomes silent-log + automatic retry, which is the better long-run shape than silent-log + alert.
