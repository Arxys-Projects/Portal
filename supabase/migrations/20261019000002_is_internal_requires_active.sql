-- ADR 0164 (supersedes ADR 0021) — a suspended internal user loses staff reads.
--
-- The hole (baseline audit B1-S-3, confirmed live 2026-10-19 by the catalog
-- snapshot): public.is_internal(uid) checked only `is_internal = true`, never
-- `status`. Every internal RLS policy calls it (partners_select_internal, the
-- submissions/project_quotes internal reads and the Project Portal tables), so
-- a suspended internal user kept cross-partner reads over REST for as long as
-- their session lived. public.is_admin(uid) has required status = 'active'
-- since the initial schema; this brings is_internal() in line.
--
-- Same signature, same SECURITY DEFINER + pinned search_path, so every policy
-- that calls it picks up the change with no policy edit. Nothing negates
-- is_internal() (checked: no `not public.is_internal(...)` in any migration),
-- so adding a condition can only narrow access.
--
-- An invited internal user also reads as not internal until (app)/layout.tsx
-- flips them to active on their first full page load. The page renders in
-- parallel with that layout, so their very first page may show the
-- partner-only view; the next load shows staff data.
--
-- The ADR 0151 guard (public.partners_guard_self_update) calls is_admin(), not
-- is_internal(), so it needs no change here.
--
-- Ships with the app change that bans the Auth user on suspend (ADR 0164).
-- The no-argument is_staff() / is_admin() helpers (B1-A-6) come later.
--
-- ⚠ STOP-AND-FLAG (ADR 0083 / 0089 convention): security-boundary change on
-- a live function. No `supabase db push` by the agent. Andy applies this by
-- hand in the Supabase dashboard SQL editor — see
-- docs/apply-notes/0164-is-internal-requires-active.md. No data is touched.
-- Rollback: supabase/rollback/is-internal-requires-active-rollback.sql.

create or replace function public.is_internal(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.partners
    where id = uid and is_internal = true and status = 'active'
  );
$$;

-- create or replace keeps existing grants; restate them so a fresh rebuild
-- matches production (20260605000004 + 20260611000001).
revoke all on function public.is_internal(uuid) from public;
revoke execute on function public.is_internal(uuid) from anon;
grant execute on function public.is_internal(uuid) to authenticated;
