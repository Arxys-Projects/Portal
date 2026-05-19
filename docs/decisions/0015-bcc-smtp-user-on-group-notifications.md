# 0015 — BCC the SMTP user on internal notifications to work around Google Groups loopback suppression

- **Status**: Accepted
- **Date**: 2026-05-19

## Context

`INTERNAL_NOTIFICATION_EMAIL` is `sales@arxys.com`, a Google Group with four direct members. `SMTP_USER` is `andy.newbom@arxys.com` — one of those four members and the group owner.

When Step 5 was first tested end-to-end on Vercel production, the SMTP send completed cleanly, the message was visible in the Sales group's Conversations view, but the group owner (Andy) reported he had not received it in his inbox. Investigation: this is documented Google Groups behaviour — **when a group member sends a message to the group, Groups deliberately suppresses delivery of the fan-out copy back to the sender**, regardless of whether the sender used a Send-mail-as alias (`noreply@arxys.com`). The underlying authenticated SMTP user is what Groups recognises for the loopback rule.

Andy is the group's owner and the most important recipient of submission notifications. The other three members receive their group fan-out copies normally; Andy never sees them.

## Options considered

- **Add `andy.newbom@arxys.com` to the `To:` field alongside `sales@arxys.com`.** Simple, but the message header then shows two recipients which leaks "this notification is special-cased for Andy" to anyone reading it. Also hardcodes a single person's address in code.
- **Add a new `INTERNAL_NOTIFICATION_BCC` env var (or list).** Most flexible, but adds a config surface that only exists to paper over one Google Groups quirk. Drift risk — easy to forget to set in a new environment.
- **Send two separate emails — one to the group, one to Andy.** Cleanest audit trail (two distinct messages, two distinct send confirmations). Doubles the SMTP cost per submission and adds a code path that does nothing meaningful for the recipient.
- **BCC `SMTP_USER` on the existing notification.** Falls out of the existing config: the SMTP user is, by definition, the account whose loopback rule we need to bypass, so they are the right address to BCC. Works without any new env vars and stays correct if the SMTP credential is later rotated to a different Workspace user (the new user will be the one needing the BCC).

## Decision

**BCC `SMTP_USER` on every internal submission notification, unless `SMTP_USER` equals `INTERNAL_NOTIFICATION_EMAIL` (in which case the BCC would duplicate the To:).** Implemented in `src/lib/email/submission-notification.ts`. No new env var.

## Consequences

**Positive:**
- Andy (and any future SMTP credential owner) reliably receives a personal copy of every submission notification, bypassing the Groups loopback rule.
- Zero new configuration. The fix is self-correcting if the SMTP credential is rotated to a different Workspace user.
- BCC keeps the To: header clean — the message still looks like a notification to sales, not a CC'd personal email.

**Negative:**
- Subtle coupling: the email module now implicitly knows that the SMTP user is also an intended recipient of internal notifications. That coupling is documented in code and here, but a future maintainer who changes one of these env vars without reading the comment could be surprised.
- If `SMTP_USER` is ever set to an address that is *not* an intended recipient (e.g., a dedicated noreply mailbox with its own credential), they will receive every submission as a BCC. The case-insensitive equality check protects against the "they are the To: recipient" duplicate, but nothing else.

**When to revisit:**
- The Gmail SMTP transport is replaced with a dedicated noreply credential that isn't a person → the BCC should be removed, or made conditional on the SMTP user being a group member.
- The notification expands to multiple internal recipients beyond the Sales group → graduate to an `INTERNAL_NOTIFICATION_BCC` env var as listed under "Options considered."
- The DKIM-alignment work (signing as `d=arxys.com` instead of `d=gappssmtp.com`) lands and we want to revisit whether the loopback suppression is the only reason for the BCC. (Alignment doesn't fix loopback — the two issues are independent — but consolidating mail hygiene work into one window makes sense.)
