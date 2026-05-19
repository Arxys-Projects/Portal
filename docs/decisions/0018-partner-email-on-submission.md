# 0018 — Partner receives their own copy of the submission report

- **Status**: Accepted
- **Supersedes**: [0014](./0014-submission-email-notification.md)
- **Date**: 2026-05-19

## Context

ADR 0014 deferred partner-facing email — Phase 1 was internal-only because
there was no PDF to attach and no partner-friendly template yet. Step 6 / 7
removes both blockers: the PDF generator is in (ADR 0016), so the partner
can receive the same report sales already gets.

The partner already sees the recommendation inline (ADR 0013), so this is
not about visibility — it is about giving the partner a durable record they
can forward, file with their CRM, or refer back to without the portal.

## Options considered

- **Keep internal-only (ADR 0014 status quo).** Closes the loop only via
  the inline panel. Partner who closes the tab has nothing to refer to.
- **CC partner on the existing sales message.** One sendMail call, two
  recipients. Saves a tiny amount of code. Loses partner-friendly subject
  + body wording, and "this notification is for sales" framing leaks into
  the partner's inbox. Also exposes the sales group's address to every
  partner who looks at the message header.
- **Separate sendMail call to the partner.** Two distinct messages — one
  sales-framed, one partner-framed. Each gets its own subject, body, and
  failure boundary. Slight duplication of the email-building code in one
  file, but the two templates are short and the failure isolation is
  worth more than the deduplication would be.

## Decision

**Two separate sendMail calls in `src/lib/email/submission-notification.ts`.**
Sales gets the existing Step-5 plain-text body with the PDF now attached.
Partner gets a partner-friendly body ("Your Arxys Video Storage Report") to
their auth-session email, with the same PDF attached. Both messages BCC
`SMTP_USER` per ADR 0015 — the loopback workaround applies equally to the
partner-facing send, and BCC also gives the credential owner a durable
audit copy of every partner-facing message.

A partner-email failure is caught inside the notification sender and logged,
not re-thrown — sales has already received the report by that point, and a
broken partner send must not regress the sales-notification path.

## Consequences

**Positive:**
- Partner has a durable record (PDF + plaintext recap) in their inbox the
  moment they hit Save.
- Sales notification's framing, headers, and recipient list stay clean —
  the partner never sees "sales group cc'd" in the message envelope.
- Partner-send failure is isolated from sales-send. Worst case is the
  inline panel + sales email succeed and the partner gets no copy; the
  partner can always re-download via the Download button.

**Negative:**
- Doubles per-submission SMTP usage. Trivial against Gmail Workspace's
  ~2000 msgs/day limit at expected volumes, but worth noting for capacity
  planning.
- Two slightly different message templates now live in the same file. They
  are <30 lines each — readable inline, not worth a templating engine.
- BCC on the partner-facing message means the SMTP credential owner sees
  every outbound partner copy. Acceptable: same person already gets the
  sales copy, and the BCC behaviour is documented under ADR 0015.

**When to revisit:**
- The partner notification grows beyond a short plaintext-with-PDF (rich
  HTML, conditional content, unsubscribe handling) — move to a real email
  service (Resend, Postmark) and a templating system.
- DKIM alignment for `arxys.com` lands and we want to revisit whether the
  BCC is still load-bearing on partner-facing mail.
