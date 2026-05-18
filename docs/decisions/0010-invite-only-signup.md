# 0010 — Invite-only partner signup, no public registration

- **Status**: Accepted
- **Date**: 2026-05-15

## Context

The portal serves Arxys partners — companies vetted offline through the Pipedrive sales process. They are not the general public. Letting anyone register at `/signup` would create a triage problem (who are these accounts? are they real partners?) and increase the spam-and-abuse surface for nothing in return.

## Options considered

- **Open signup with email verification.** Lowest friction for partners. But also lets anyone create an account. We'd manually deactivate non-partners — operationally expensive.
- **Open signup, admin approves.** Self-onboarding for partners (status='invited' on create, admin flips to 'active' from the admin panel). Cleaner than no gate, but still surfaces a public `/signup` form that scrapers will find.
- **Invite-only via admin action.** Admin invites a partner email; partner receives a magic-link / set-password email; on confirm, partner lands in dashboard. No public signup form.
- **Google OAuth only.** Wrong fit — Arxys partners use various business email domains, not a single Google Workspace.

## Decision

**Invite-only.** No `/signup` page. The bootstrap admin runs `scripts/bootstrap-admin.ts` once to create the very first admin. Subsequent partners are created via the admin panel (Step 9) which calls `supabase.auth.admin.inviteUserByEmail()` and inserts a `partners` row via service-role.

## Consequences

**Positive:**
- Only known partners can have accounts. No abuse surface.
- Onboarding doubles as a vetting checkpoint — admins create the row deliberately.
- Pipedrive-driven workflow stays the source of truth for "who is a partner."

**Negative:**
- Admin must do something every time a new partner needs access. Mitigated by making it one click from the admin panel.
- No self-serve recovery if a partner asks "where's my account?" before being invited. The portal landing for unauthenticated visitors should explain how to request access (point at sales contact). We'll add this copy when the marketing site links to the portal.

## Implementation note

The bootstrap script (`scripts/bootstrap-admin.ts`) creates the *first* admin only. It's a one-shot, runnable from any machine with the service-role key. Idempotent: re-running for the same email upserts the partner row to role=admin without breaking the existing user.
