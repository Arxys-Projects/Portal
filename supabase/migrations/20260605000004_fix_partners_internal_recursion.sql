-- Fix infinite recursion introduced by 20260605000003_partners_select_internal.sql.
--
-- Root cause: the policy queried public.partners from inside a public.partners
-- SELECT policy. Postgres evaluates all permissive policies on every SELECT,
-- so the self-referencing subquery caused infinite recursion for every user.
--
-- Fix: drop the broken policy, create a security-definer helper function
-- (mirrors the existing is_admin() pattern — security definer bypasses RLS),
-- then recreate the policy using the helper.

drop policy if exists partners_select_internal on public.partners;

create or replace function public.is_internal(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.partners
    where id = uid and is_internal = true
  );
$$;

revoke all on function public.is_internal(uuid) from public;
grant execute on function public.is_internal(uuid) to authenticated;

create policy partners_select_internal
on public.partners for select
to authenticated
using (public.is_internal(auth.uid()));
