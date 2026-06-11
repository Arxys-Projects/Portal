-- Supabase Security Advisor hardening (2026-06-11)
--
-- Findings addressed, all real:
--   1. "Function Search Path Mutable" — public.set_updated_at had no pinned
--      search_path.
--   2/3. "Public/Signed-In Can Execute SECURITY DEFINER Function" — anon (not
--      signed in) AND authenticated could EXECUTE the SECURITY DEFINER helpers
--      is_admin / is_internal / rls_auto_enable. The earlier
--      `revoke ... from public` in prior migrations was INEFFECTIVE: Supabase
--      grants EXECUTE directly to the anon / authenticated / service_role roles
--      via default privileges, not via the PUBLIC pseudo-role, so revoking from
--      PUBLIC never removed those explicit role grants. Revoke them by name.
--
-- This migration also captures rls_auto_enable + its ensure_rls event trigger
-- into version control. They existed ONLY in the live database (hand-created in
-- the SQL editor), so a blank-machine `supabase db reset` would not have
-- recreated them. Bringing them here keeps rebuilds faithful AND lets the
-- REVOKE below succeed on a fresh DB (the function must exist before we revoke).
--
-- What we deliberately do NOT change:
--   - authenticated keeps EXECUTE on is_admin / is_internal. Every RLS policy
--     that calls them is scoped `to authenticated` and evaluates the function
--     as the signed-in user; removing it would break partner RLS (and
--     re-introduce the recursion that 20260605000004 fixed). The advisor's
--     "Signed-In Users Can Execute" flag on these two is by design.
--   - service_role / postgres keep EXECUTE everywhere (trusted backend roles).
-- ---------------------------------------------------------------------------

-- 1. Pin search_path on the updated_at trigger helper. Its body only calls
--    now() (pg_catalog, always in scope), so an empty search_path is safe.
alter function public.set_updated_at() set search_path = '';

-- 2. Capture the rls_auto_enable event-trigger function from production
--    verbatim (auto-enables RLS on newly created public tables).
create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

-- Create the event trigger only if it's missing. On production it already
-- exists, so we skip the DDL entirely (avoids any event-trigger privilege
-- concern during `db push`); on a fresh rebuild this creates it.
do $$
begin
  if not exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') then
    create event trigger ensure_rls on ddl_command_end
      execute function public.rls_auto_enable();
  end if;
end $$;

-- 3. Revoke EXECUTE from the roles that must never call these directly.
--    Supabase's default privileges grant anon/authenticated EXECUTE on
--    creation; strip it. `public` is included defensively (no-op if absent).

-- Trigger helper: fires from the trigger machinery regardless of caller
-- privilege, so no client role needs EXECUTE.
revoke execute on function public.set_updated_at() from anon, authenticated, public;

-- Event-trigger helper: fires on DDL, never invoked directly.
revoke execute on function public.rls_auto_enable() from anon, authenticated, public;

-- Role helpers: keep authenticated (RLS calls them as the signed-in user);
-- drop anon + public.
revoke execute on function public.is_admin(uuid) from anon, public;
revoke execute on function public.is_internal(uuid) from anon, public;
