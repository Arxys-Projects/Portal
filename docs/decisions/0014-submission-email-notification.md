# 0014 — Step 5 ships with sales-only email notification, no partner-facing email

- **Status**: Superseded by [0018](./0018-partner-email-on-submission.md) on 2026-05-19
- **Date**: 2026-05-18

## Context

The original PHP calculator sent two emails per submission: a partner-facing email with a PDF quote attached, plus an internal copy to `sales@arxys.com`. The portal will eventually do the same — ADR 0002 (Gmail SMTP) was scoped to support both — but the PDF rendering, the partner-facing template, and the deliverability hardening for partner-facing mail (DKIM/SPF audit, bounce handling, opt-out language) are non-trivial.

Step 5's goal is "save a submission and put the recommendation in front of sales so they can follow up." The partner already sees the recommendation inline (ADR 0013), so a partner-facing email is not blocking that outcome.

## Options considered

- **Both emails (partner + internal).** Closest parity with the PHP calculator. Requires the PDF generator wired in (`@react-pdf/renderer` is in `package.json` but unused), a partner-facing template, and a deliverability pass.
- **Internal only for Phase 1; partner-facing email deferred.** Sales gets every submission; partner gets the inline result panel and a confirmation message.
- **No email; rely on a dashboard list for sales.** Cheap, but sales would have to poll the portal to see new submissions. Not realistic for the team's workflow.

## Decision

**Internal-only email for Phase 1.** A single plain-text message goes to `INTERNAL_NOTIFICATION_EMAIL` (= `sales@arxys.com` in production) via Gmail SMTP per ADR 0002. The template includes partner identity, project name, workload totals, recommended model + units, any algorithm warnings, and the submission ID. No PDF attachment; no partner-facing email.

## Consequences

**Positive:**
- Sales is in the loop on every submission from day one.
- No deliverability risk on partner-facing mail (Phase 1 only sends to a single internal mailbox the team owns).
- Falls back gracefully — if the SMTP send fails the submission still persists; admin can re-send later.

**Negative:**
- Partners don't get a confirmation email after submitting. The inline panel is the only record they see until sales follows up. If a partner closes the tab they have nothing in their inbox to refer to.
- The PDF quote (`@react-pdf/renderer`) and the partner-facing email both remain unbuilt. The packaging step that turns "we have a recommendation" into "here's a quote document" is still pending work.

**When to revisit:**
- A partner asks "where's my quote?" — sign that the partner-facing email matters operationally, or
- Sales asks for partners to be CC'd on the internal notification, or
- The PDF generator lands as part of a separate task.
