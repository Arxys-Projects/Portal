# 0008 — Defer 30-day session timebox until Supabase Pro upgrade

- **Status**: Accepted
- **Date**: 2026-05-15

## Context

The Phase 1 plan specified three auth session settings:

- Access (JWT) token TTL = 3600 seconds
- Refresh token rotation enabled
- Refresh session timebox = 2592000 seconds (30 days)

The first two are correctly set by default on Supabase Free tier. The third — `sessions_timebox` — is a Pro-tier-only feature. The Management API returns `HTTP 402: User sessions can only be configured on Pro Plans and up` when attempting to PATCH it.

The project is on Free tier for Phase 1 by deliberate choice (see kickoff Q&A: pricing tier = Free).

## Options considered

- **Upgrade to Pro now** ($25/month). Enables the exact spec plus daily backups, point-in-time recovery, and removes the 1-week idle pause.
- **App-level enforcement.** Track session creation time in our own DB, force re-login via middleware after 30 days. Feasible but adds custom code, custom tests, and a divergence from Supabase's first-class behavior. Phase 1 scope creep.
- **Accept the gap.** Document the limitation, move on, revisit when Pro is justified for other reasons.

## Decision

**Accept the gap. Document it.**

- The two security-critical session controls (short access TTL + rotation) are active.
- A 30-day timebox is defense-in-depth: it forces re-login even when no refresh token is compromised. Useful, but not the primary defense.
- The gap is recorded inline in `supabase/config.toml` next to the related settings so the next person to look at session config sees it.

## Consequences

**Positive:**
- Phase 1 stays on Free tier, no premature spend.
- Most session security comes from the access-token TTL and rotation, both of which work.
- The path to closing the gap is one dashboard click after upgrade — no code changes required.

**Negative:**
- Refresh tokens that aren't actively rotated will persist indefinitely until explicitly invalidated. An attacker who exfiltrates a refresh token before rotation has unlimited time to use it. Mitigations: rotation invalidates the old token on first use; Supabase admin can revoke sessions globally.
- We must remember to revisit. Tracked as part of the Pro-upgrade checklist (separate doc when Phase 1 ships).

## When to revisit

Whichever comes first:
1. Upgrading to Pro for any other reason (backups, PITR, avoiding the idle pause).
2. Phase 1 launch — before going live with real partner accounts, revisit whether the Free-tier limit is acceptable for production.
3. A security review explicitly flags it.
