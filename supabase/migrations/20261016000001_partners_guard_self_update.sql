-- ADR 0151 — stop partners from editing privilege-bearing columns on their own row.
--
-- The hole (confirmed live 2026-10-16 with a read-only catalog query):
--   * the initial schema grants `select, update on public.partners to
--     authenticated` with no column list, so every column is updatable;
--   * the only UPDATE policy, partners_update_self_or_admin, is
--     `id = auth.uid() or is_admin(auth.uid())`;
--   * the only trigger was trg_partners_set_updated_at.
-- So any signed-in partner could PATCH /rest/v1/partners?id=eq.<self> with their
-- own JWT and set role='admin' or is_internal=true. is_admin() and is_internal()
-- read exactly those columns, and every admin/internal RLS policy in the schema
-- calls them, so that was full privilege escalation. A suspended user could also
-- set their own status back to 'active'.
--
-- No app path relies on a partner updating their own row: every write to
-- partners (/admin/partners actions, the invited→active auto-activate in
-- (app)/layout.tsx, scripts/bootstrap-admin.ts) uses the service-role client.
--
-- The fix is a BEFORE UPDATE guard trigger, deny-by-default:
--   * service_role and the dashboard / migration roles pass untouched;
--   * an active admin (is_admin(auth.uid())) may change anything;
--   * any other `authenticated` (or `anon`) caller may change only the columns
--     on the self-editable list below — today just `phone`, which no app code
--     reads. Any other changed column raises 42501 (PostgREST → HTTP 403).
-- A column added to partners later is protected automatically; making one
-- self-editable is a deliberate edit to this list.
--
-- SECURITY INVOKER on purpose, not DEFINER: the guard keys on current_user, the
-- role actually running the UPDATE. In a SECURITY DEFINER function current_user
-- is the function owner (postgres), which would wave every caller through. The
-- function needs no elevated rights of its own — is_admin() is already
-- SECURITY DEFINER and authenticated holds EXECUTE on it. search_path is pinned
-- empty and every reference is schema-qualified.
--
-- Unchanged: the partners policies, the table grants, is_admin() / is_internal(),
-- and trg_partners_set_updated_at. BEFORE triggers fire in name order, so this
-- guard runs before set_updated_at; updated_at is on the allowed list because
-- that trigger overwrites it anyway.
--
-- ⚠ STOP-AND-FLAG (standing rule, ADR 0083 / 0089 convention): security-boundary
-- change on a live table. No `supabase db push` by the agent. Andy applies this
-- by hand in the Supabase dashboard SQL editor — see
-- docs/apply-notes/0151-partners-guard-self-update.md for the steps and the
-- post-apply checks. No data is touched, so no backup is required.
-- Rollback: supabase/rollback/partners-guard-self-update-rollback.sql.

create or replace function public.partners_guard_self_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  changed text[];
begin
  -- Only the roles PostgREST hands to end users are guarded. A signed JWT can
  -- only select anon, authenticated or service_role, so this covers every
  -- client path; service_role (the app's admin client, every script) and
  -- direct SQL (postgres in the dashboard) are trusted.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- is_admin() reads the row as it stands BEFORE this update, so a partner
  -- cannot set role='admin' and pass this check in the same statement.
  -- (anon holds no EXECUTE on is_admin, so an anon update fails closed here.)
  if public.is_admin(auth.uid()) then
    return new;
  end if;

  -- Self-editable columns: phone (unread by the app) and updated_at (rewritten
  -- by trg_partners_set_updated_at). Everything else is admin-only.
  select coalesce(array_agg(n.key order by n.key), '{}')
    into changed
    from jsonb_each(to_jsonb(new)) as n
    join jsonb_each(to_jsonb(old)) as o using (key)
   where n.value is distinct from o.value
     and n.key not in ('phone', 'updated_at');

  if cardinality(changed) > 0 then
    raise exception 'only an admin can change % on a partner record',
      array_to_string(changed, ', ')
      using errcode = '42501',
            hint = 'Partner records are edited from /admin/partners.';
  end if;

  return new;
end;
$$;

comment on function public.partners_guard_self_update() is
  'ADR 0151: BEFORE UPDATE guard on public.partners. A non-admin authenticated caller may change only phone on their own row; role, status, is_internal, pipedrive_user_id, names, logo_path and any future column are admin-only. service_role and direct SQL pass.';

drop trigger if exists trg_partners_guard_self_update on public.partners;

create trigger trg_partners_guard_self_update
before update on public.partners
for each row execute function public.partners_guard_self_update();

-- Trigger helper: fires from the trigger machinery regardless of the caller's
-- EXECUTE privilege (same as set_updated_at in 20260611000001), so no client
-- role needs it.
revoke execute on function public.partners_guard_self_update() from anon, authenticated, public;
