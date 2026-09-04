# 0145 — Admin "resend notification email" action for submissions

- **Status**: Accepted
- **Date**: 2026-09-04

## Context

Submission `5a5f15d3-ca75-48de-8d8f-3fbca88dd4e9` (project "Warinanco Park") was
created and successfully synced to Pipedrive (deal #5510), but its sales+partner
notification email never sent (`email_sent_at` stayed null). Per ADR 0027, the
notification send in `calculator/actions.ts` is deliberately fire-and-forget: a
failure is logged with `console.error` and swallowed so it can never regress the
submission itself. That's the right call for the submit path, but it leaves no
recovery affordance — the code comment at the catch site even says "admins can
re-send later," but that mechanism was never built. The only way to recover was
a one-off script reconstructing the email's view model by hand.

Vercel's request-log retention for this project also turned out to be too short
to retrieve the original error after the fact (rolled off within ~20 minutes
under normal traffic), so there wasn't even a way to diagnose *why* a given send
failed after the fact — reinforcing that a resend path, not just better
logging, is the fix that matters operationally.

## Options considered

- **Leave it as a one-off script per incident** — zero product surface area, but
  repeats the same manual reconstruction (partner identity resolution, totals,
  retention label, recommendation shape) every time this happens, and requires
  developer involvement each time instead of an admin self-serving it.
- **Re-run the full calculator submit flow for the existing row** — would also
  re-create a duplicate Pipedrive deal and re-insert a submission row; wrong
  shape entirely for "the data is fine, only the email failed."
- **Add a scoped admin action that reconstructs the notification's view model
  from the persisted submission row and re-sends** — reuses the existing
  `loadSubmissionPdfInput` (already used by the partner PDF download route) for
  totals/recommendation/groups, and the existing on-behalf-of identity
  resolution (already used by the Pipedrive relink action) for the recipient.
  Chosen.

## Decision

Added `adminResendSubmissionNotification` (`src/app/(app)/admin/submissions/[id]/resend-notification-actions.ts`),
gated the same way as the other write actions on this page
(`requireAdminOrInternal`). It:

1. Loads the submission's view model via `loadSubmissionPdfInput` (partner
   names, totals, recommendation, groups, server spec) — the same helper the
   PDF download Route Handler already uses, so the resend and the download see
   identical data.
2. Resolves the real recipient email via `admin.auth.admin.getUserById` on the
   on-behalf-of target (or the creating partner), because
   `loadSubmissionPdfInput`'s own `partner.email` is documented as "the
   authenticated viewer's address" — correct for a partner downloading their
   own PDF, wrong for an admin resending someone else's submission.
3. Re-renders the PDF attachment and calls the existing
   `sendSubmissionNotification`, then stamps `email_sent_at`.

`SubmissionNotificationInput.recommendation` was narrowed from the full
`RecommendationResult` type to just the fields the email bodies read
(`winner.{units,productGroup,coveredCameras,coveredStorageTb}`, `warnings`) —
a persisted row has no live `RecommendationCandidate`, only its banked
equivalents, and the full type was never necessary for this function.

A "Resend notification email" button appears on the admin submission detail
page for internal/admin viewers, always available (not gated on
`email_sent_at` being null) — an admin may also want to re-send a copy that did
go out the first time. The page now also shows a plain-language "Notification
email: sent \<date\> / never sent" line so this state is visible without
having to know to check.

## Consequences

**Positive:** Admins can now recover from this failure mode themselves, in
seconds, without developer involvement or a one-off script. The fix reuses
existing derivation logic (PDF view model, on-behalf identity resolution)
rather than duplicating it.

**Negative:** The resend re-renders the PDF and re-sends fresh, so the
"generated" date on the attachment reflects the resend time, not the original
submission time. Considered acceptable — the alternative (banking the
original PDF) is a much larger change for a rare recovery path.

**When to revisit:** If this needs to happen often enough to want a global
"failed notifications" queue/dashboard, rather than an admin noticing one
submission at a time — Vercel's log retention is too short to alert on this
automatically, so any future automation would need to poll for
`email_sent_at IS NULL AND parent_submission_id IS NULL AND created_at < now() - interval '1 hour'`
or similar.
