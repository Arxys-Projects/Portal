# 0002 — Gmail SMTP for transactional mail, not SiteGround

- **Status**: Accepted
- **Date**: 2026-05-14

## Context

The portal needs to send two transactional emails per calculation submission: one to the partner (with the PDF quote attached), one internal notification to `sales@arxys.com`. The legacy PHP calculator used SiteGround SMTP because it ran on a SiteGround-hosted WordPress instance. The portal will run on Vercel, where SiteGround SMTP is not the natural choice.

The Arxys team already runs Google Workspace. Both options were technically viable.

## Options considered

- **SiteGround SMTP**: continuity with the old calculator's mail path; SiteGround's SMTP credentials already exist.
- **Gmail SMTP via App Password on `andy.newbom@arxys.com`**, with `noreply@arxys.com` configured as a "Send mail as" alias on Andy's mailbox.
- **A transactional mail provider** (Resend, Postmark, SES). Better deliverability and webhooks, but adds an account and a recurring cost.

## Decision

**Gmail SMTP only. SiteGround is never used.**

Configuration:
- `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465` (SSL)
- `SMTP_USER=andy.newbom@arxys.com` (the user that owns the App Password)
- `SMTP_PASS=` the 16-character Google App Password (2FA required to generate)
- `SMTP_FROM=noreply@arxys.com` — works because `noreply@arxys.com` is set as a "Send mail as" alias under Andy's Gmail account

## Consequences

**Positive:**
- One credential surface — Google Workspace, which the team already manages.
- No extra vendor, no recurring cost.
- Mail sent under the org's authenticated DKIM/SPF for `arxys.com`, so deliverability is good.

**Negative:**
- App Passwords are bound to a single Google account. If Andy leaves the company or his account is disabled, the portal stops sending mail until someone else generates a new App Password and the alias is re-configured under their account. This is a deliberate tradeoff for Phase 1; Phase 2 can move to a provider like Resend if the operational risk gets too high.
- Gmail's SMTP relay enforces a daily send limit (~2000 messages/day for Workspace accounts). The portal will not approach this in Phase 1.
- "Send mail as" alias must be confirmed via a verification email when first set up. One-time chore.
