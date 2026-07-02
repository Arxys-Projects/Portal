-- Rollback — access_requests table + policies (migration 20260702000002).
-- Lives outside supabase/migrations/ so the CLI never auto-applies it.
-- Reverts 20260702000002_access_requests.sql.

drop policy if exists access_requests_update_admin_internal on public.access_requests;
drop policy if exists access_requests_select_admin_internal on public.access_requests;
drop table if exists public.access_requests;
