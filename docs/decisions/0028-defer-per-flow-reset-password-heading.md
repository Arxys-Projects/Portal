# 0028 — Defer per-flow reset-password page heading to Phase 2

- **Status**: Accepted
- **Date**: 2026-05-20

## Context

`/reset-password` is shared between two flows:

1. **Invite flow** — a new partner accepts an invite, lands here via `/auth/confirm?type=invite&next=/reset-password`, and sets their *initial* password.
2. **Forgot-password flow** — an existing partner lands here via `/auth/confirm?type=recovery&next=/reset-password` and sets a *new* password.

The page heading reads "Reset your password" in both. Slightly awkward for a brand-new invitee who has no existing password — they're not "resetting" anything, they're choosing one for the first time. Surfaced in the Step 9 follow-up smoke test (JOURNAL 2026-05-20) and called out in the Step 11 brief as a "known UX nit" pending a decision.

## Options considered

- **Fix in Step 11.** Branch the heading on a query param (e.g. `?flow=invite` → "Set your password"; default → "Reset your password"). One-line change in `src/app/(auth)/reset-password/page.tsx` plus a small adjustment to the invite template's `next=` URL or to the Server Action that handles the form. Cosmetic, no schema or routing change.
- **Defer to Phase 2.** Accept the slight semantic mismatch. The flow works end-to-end (Step 9 invite smoke test confirmed); a Phase 2 partner-portal copy pass will revisit auth-page chrome alongside other UX work.
- **Replace with a generic heading** ("Choose your password") that works for both flows without branching. Avoids the per-flow conditional but loses the recovery-flow's clearer signal that something happened *because the user asked for it*.

## Decision

**Defer to Phase 2.** Phase 2 (Pricing Pipeline project + portal price-book page) will include a broader partner-facing copy pass; the heading is folded into that work rather than fixed standalone. No Step 11 code change.

## Consequences

**Positive:**

- Zero Step 11 code change. Step 11 stays focused on structural verification.
- The fix doesn't fight any Phase 2 partner-portal redesign that may want to refactor auth-page chrome differently.
- Step 9's smoke test already proves the underlying flow works; we're optimizing copy, not behavior.

**Negative:**

- New invitees see "Reset your password" on a page where they have no existing password to reset. Likely confusing for ~1 second; the form below is unambiguous (one password input, one confirm input, one submit button).
- The mismatch is invisible in normal usage — an invitee sees the page once, sets a password, never returns. Only repeat partners (invite → later forgot-password) see the same heading twice and may not register the contextual shift.

## When to revisit

- A real partner from the launch cohort comments on the heading.
- Phase 2 partner-portal copy pass takes it as a tracked item; the fix lands there alongside any other auth-page copy adjustments.
- Supersedes this ADR with the implementation pattern chosen at that time (query-param branch, generic heading, or other).
