# 0051 — Click-through interstitial + recovery-based resend for partner onboarding

- **Status**: Accepted
- **Date**: 2026-06-08

## Context

Partners invited to the portal were getting stuck. Production data (17 partners)
showed every external partner stranded at `status='invited'`: several had
confirmed their email and even recorded a sign-in, yet never reached
`/dashboard` (where the existing auto-activate flips them to `active`), and a
cluster on corporate domains (long.com, jctnj.com, intelli-tec.net, …) never
confirmed at all.

Three distinct failures combined:

1. **Onboarding confusion.** The invite link logs the user in via `verifyOtp`
   and drops them on a "Set a new password" screen. Many didn't realise they
   were being asked to *create* a first password, abandoned the screen, then
   tried to "sign in" on the login page with a password that never existed.
2. **Single-use tokens consumed by email scanners.** `/auth/confirm` ran
   `verifyOtp` on the GET request. Corporate mail security (Microsoft Safe
   Links, Mimecast, Proofpoint) pre-fetches links with GET, burning the
   single-use invite/recovery token before the human clicked — so links arrived
   already "expired or invalid."
3. **Resend was broken.** `resendInvite` re-called `inviteUserByEmail`, which
   Supabase rejects for any existing user with *"a user with this email address
   has already been registered"* — the exact error admins saw in the partners
   list. There was no working way to re-send onboarding.

## Options considered

- **Split login into /join and /login pages** — explicit, but login is login;
  the real distinction is *set-password vs sign-in*, which the auth token
  already determines. More routes/state for no real gain.
- **Switch to OTP-code entry instead of magic links** — robust against
  scanners, but a bigger UX change and re-templating effort.
- **Click-through interstitial at `/auth/confirm`** — keep the link flow, but
  only consume the token on an explicit POST (button click). GET-prefetching
  scanners can't burn it. Minimal change, reuses existing templates and routes.
- **Resend via `resetPasswordForEmail` (recovery)** — works for any existing
  user, confirmed or not, and lands on the same create-password screen.

## Decision

Keep a single login page with clearer copy. Convert `/auth/confirm` from an
auto-consuming route handler into a page + server action: GET renders a branded
"Continue" button; the token is verified only on POST. `type=invite` redirects
to `/reset-password?new=1` ("Create your password") to distinguish first-timers
from returners. Replace `inviteUserByEmail` in `resendInvite` with
`resetPasswordForEmail`, and add `scripts/resend-onboarding.ts` to re-send
working links to the already-stuck partners. Invite and recovery email copy now
state plainly that the user has no password yet and is creating one.

## Consequences

**Positive:** Invite/recovery links survive corporate link scanners. Resend
works. First-time users are told they're creating a password, not entering one.
No new routes or auth modes.

**Negative:** One extra click for every email confirmation. The interstitial
can't recover a token a scanner already consumed *before* this change shipped —
hence the one-time remediation script.

**When to revisit:** If scanners begin issuing POSTs (some advanced sandboxes
do), move to OTP-code entry. If the extra click measurably hurts conversion,
reconsider.
