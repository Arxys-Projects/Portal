# 0053 — Lock down EXECUTE on SECURITY DEFINER helpers; capture rls_auto_enable drift

- **Status**: Accepted
- **Date**: 2026-06-11

## Context

Supabase's Security Advisor flagged four issues on the production database:

1. **Function Search Path Mutable** — `public.set_updated_at` (the `updated_at`
   trigger helper) had no pinned `search_path`.
2. **Public Can Execute SECURITY DEFINER Function** — `anon` (not signed in)
   could `EXECUTE` `is_admin`, `is_internal`, and `rls_auto_enable`.
3. **Signed-In Users Can Execute SECURITY DEFINER Function** — `authenticated`
   could `EXECUTE` the same three.
4. **Leaked Password Protection Disabled** — an Auth setting.

Two non-obvious findings drove the work. First, prior migrations *did*
`revoke all ... from public` on `is_admin`/`is_internal`, yet the live grants
showed `{anon, authenticated, postgres, service_role}` still held `EXECUTE`.
Root cause: **Supabase grants `EXECUTE` directly to the `anon`/`authenticated`/
`service_role` roles via default privileges, not through the `PUBLIC`
pseudo-role** — so revoking from `PUBLIC` never removed those explicit grants.
Second, `rls_auto_enable` (an event-trigger function backing `ensure_rls` on
`ddl_command_end`, which auto-enables RLS on new `public` tables) existed
**only in the live database** — hand-created in the SQL editor, never in a
migration. It was drift: a blank-machine `supabase db reset` would not recreate
it.

## Options considered

- **Switch the helpers to SECURITY INVOKER** (the advisor's generic hint).
  Rejected — `is_admin`/`is_internal` are SECURITY DEFINER *on purpose* to
  bypass RLS on `public.partners` and avoid the recursion that
  [`0004`](./0004-supabase-cli-migrations.md)-era fix 20260605000004 resolved.
- **Revoke `EXECUTE` from `anon`/`authenticated` on all three; re-`revoke` by
  explicit role name (not PUBLIC); keep `authenticated` on the two role
  helpers.** Chosen.
- **Leave `rls_auto_enable` as live-only drift.** Rejected — breaks rebuild
  fidelity and a migration that revokes on it would fail on a fresh DB.

## Decision

Migration `20260611000001_security_advisor_hardening.sql`:

- `set_updated_at`: pin `search_path = ''`; revoke `EXECUTE` from
  `anon, authenticated, public` (trigger fires regardless of caller privilege).
- `rls_auto_enable`: `create or replace` it verbatim from prod + recreate the
  `ensure_rls` event trigger behind an `if not exists` guard (so the push skips
  event-trigger DDL on prod and only creates it on a fresh rebuild); revoke
  `EXECUTE` from `anon, authenticated, public`.
- `is_admin` / `is_internal`: revoke `EXECUTE` from `anon, public`; **keep
  `authenticated`** — every RLS policy that calls them is scoped
  `to authenticated` and evaluates them as the signed-in user.
- `service_role` / `postgres` retain `EXECUTE` everywhere (trusted roles).

Leaked-password protection is a dashboard-only Auth toggle — recorded as a
manual step in the RUNBOOK, not code.

## Consequences

**Positive:** anon can no longer execute any of the helpers; the advisor's
public/search-path findings clear; `rls_auto_enable` + `ensure_rls` are now in
version control so rebuilds are faithful.

**Negative:** the "Signed-In Users Can Execute" flag on `is_admin`/`is_internal`
remains — accepted as a false positive (RLS requires it). The `ensure_rls`
event trigger on a fresh rebuild assumes the migration role (`postgres`) may
create event triggers, as it did when the trigger was first hand-created.

**When to revisit:** if Supabase changes its default-privilege grants, or if a
future helper needs anon access, revisit the per-role revokes.
