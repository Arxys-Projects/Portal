# 0151 — Guard partner self-updates with a deny-by-default trigger

- **Status**: Accepted (migration written 2026-10-16; not yet applied — see [apply note](../apply-notes/0151-partners-guard-self-update.md))
- **Date**: 2026-10-16

## Context

`authenticated` holds UPDATE on every column of `public.partners` (initial schema, no column
list), and the only UPDATE policy is `id = auth.uid() or is_admin(auth.uid())`. So any signed-in
partner could PATCH their own row through the REST API and set `role='admin'` or
`is_internal=true`. A suspended user could also set their own `status` back to `active`.
`is_admin()` and `is_internal()` read exactly those columns, and every admin or internal RLS
policy calls them. A read-only catalog query on 2026-10-16 confirmed the live grants, policies
and triggers match the migrations.

The Project Portal backend build gates its new internal-only tables on
`is_internal(...) or is_admin(...)`, so those policies are only as strong as these columns.

No app path needs a partner to update their own row. Every write to `partners` goes through the
service-role client: the `/admin/partners` actions, the invited→active auto-activate in
`(app)/layout.tsx`, and `scripts/bootstrap-admin.ts`.

## Options considered

- **Make the UPDATE policy admin-only.** Simplest. But the first "let partners edit X" feature
  puts `id = auth.uid()` back and reopens every column at once.
- **Column grants** (revoke table UPDATE, `grant update (phone)`). These deny new columns by
  default, but they bind admins too: an admin's own JWT could no longer edit `role` or `status`.
  A later table-wide `grant update` would also reopen the hole without any error.
- **Trigger that blocks a named list** (`role`, `status`, `is_internal`, `pipedrive_user_id`).
  This fixes today's hole, but a privilege column added later stays open until someone
  remembers to add it.
- **Trigger with an allow-list of self-editable columns.** Chosen.

## Decision

`trg_partners_guard_self_update` runs `public.partners_guard_self_update()` BEFORE UPDATE on
each row:

- `service_role` and direct SQL (`postgres` in the dashboard) pass untouched.
- An active admin (`is_admin(auth.uid())`, read before the update applies) may change anything.
- Any other `authenticated` or `anon` caller may change only `phone` (no app code reads it) and
  `updated_at` (which `set_updated_at` overwrites anyway). Any other changed column raises
  `42501`, which PostgREST returns as HTTP 403, and the error names the column(s).

The function is **SECURITY INVOKER**, not DEFINER as the brief suggested. The guard keys on
`current_user`, the role that actually runs the UPDATE. Inside a DEFINER function
`current_user` is the owner (`postgres`), so every caller would pass. The function needs no
elevated rights, because `is_admin()` is already DEFINER. Its `search_path` is pinned to `''`,
and EXECUTE is revoked from the client roles, as with `set_updated_at`.

The policies, table grants, `is_admin()` and `is_internal()` stay as they are.

## Consequences

**Positive:** the self-escalation path is closed, including un-suspending yourself and editing
`company_name`, `contact_name` or `logo_path`, which feed Pipedrive matching and customer
documents. Any column added later is admin-only until someone deliberately allow-lists it.
Admins keep full edit rights through their own JWT.

**Negative:** an UPDATE issued from inside some future SECURITY DEFINER function runs as that
function's owner and bypasses the guard. Such a function has to do its own checks. Making a
column self-editable takes a migration.

**When to revisit:** if partners get a self-service profile page (extend the allow-list in a
migration), or if Supabase changes how API JWT roles map to database roles.
