# 0023 — Minimal partner-management action surface

- **Status**: Accepted
- **Date**: 2026-05-20

## Context

Step 9 Phase B adds the admin partner-management UI. The portal is invite-only (ADR [0010](./0010-invite-only-signup.md)) and the bootstrap script (`scripts/bootstrap-admin.ts`) is the single path to admin. We need to decide which CRUD-shaped actions the admin partner table exposes, because the action surface is what we then have to guard, test, and document.

The full universe of conceivable actions is: invite, edit profile (company/contact), edit email, suspend, reactivate, resend invite, change role (promote partner → admin / demote admin → partner), hard-delete partner, soft-delete partner, bulk export, bulk import.

Every action we add multiplies the guard surface (self-action blocks, last-active-admin blocks, TOCTOU re-reads, audit-log expectations, etc.). For a portal whose admin user base is currently *one human*, we want the smallest surface that still lets that human onboard, retire, and re-onboard partners.

## Options considered

- **Full CRUD with role-flip.** Maps cleanly onto the database (`partners` + `auth.users`), but every additional verb is a new guard set. Demote-self, last-active-admin, delete-with-active-submissions all become live concerns. Overkill for one admin.
- **Minimal action surface.** Invite + Suspend/Reactivate + Resend Invite. No edit-profile, no email change, no delete, no role-flip. Bootstrap script remains the only path to admin.
- **Read-only admin UI, all mutations via SQL.** Honest about the project's scale, but defeats the purpose of building the panel at all — operations the admin needs daily (invite, suspend) shouldn't require a Postgres console.

## Decision

**Minimal action surface: Invite, Suspend / Reactivate, Resend Invite. No others.**

Concretely, `src/app/(app)/admin/partners/actions.ts` exports exactly four Server Actions:

- `invitePartner({ email, contactName, companyName })` — `auth.admin.inviteUserByEmail` + `partners` row INSERT (`role='partner' status='invited'`) via service-role. Rolls the auth user back if the partners INSERT fails.
- `suspendPartner(id)` — service-role UPDATE to `status='suspended'`. Refuses when `id === auth.uid()` (self-suspend) or when the target is the only `role='admin' AND status='active'` row (last-active-admin).
- `reactivatePartner(id)` — service-role UPDATE to `status='active'`.
- `resendInvite(id)` — re-reads `partners.status`, refuses if no longer `'invited'` (TOCTOU), then `auth.admin.inviteUserByEmail` again.

All four actions begin by re-verifying the caller is `role='admin' AND status='active'` via `createSupabaseServerClient()` before touching the service-role client. Defense-in-depth: the layout `notFound()` already blocks non-admins, but a Server Action is callable directly with a valid session cookie regardless of which route the user actually visited.

## Consequences

**Positive:**
- Smaller surface = fewer guards to maintain and test.
- Role-flip stays in the bootstrap script — promoting/demoting is a sufficiently dangerous operation that "open a terminal and run the script" is appropriately high friction.
- No accidental data loss: there is no UI button anywhere in the portal that deletes a partner. Audit retention is preserved by default.

**Negative:**
- Editing a partner's company name or contact name requires a SQL update or a script. Acceptable today; revisit when partner count grows past ~20 or when partners change names often.
- A partner whose email changes has no admin-facing remediation path — they must contact us and we'll fix it in Supabase directly. Tolerable for a partner base that's onboarded through Pipedrive.
- Bulk import isn't available; each partner is invited one at a time. Manageable at the current onboarding cadence.

**When to revisit:**
- When the admin user base grows past one human and last-active-admin blocks start to feel restrictive.
- When partner self-service (edit own company name, change own email) becomes a feature request.
- When the org wants soft-delete (e.g. retention compliance) — that should land as its own ADR with the data-lifecycle contract spelled out.
