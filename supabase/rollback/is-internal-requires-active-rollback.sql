-- Rollback for 20261019000002_is_internal_requires_active.sql (ADR 0164).
-- Restores the 20260605000004 body, which ignores status. This RE-OPENS
-- B1-S-3: a suspended internal user regains cross-partner reads. Use only if
-- the status check blocks a legitimate path.

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
revoke execute on function public.is_internal(uuid) from anon;
grant execute on function public.is_internal(uuid) to authenticated;
