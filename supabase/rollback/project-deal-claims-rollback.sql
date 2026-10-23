-- Rollback for 20261023000001_project_deal_claims.sql (ADR 0170).
-- Lives outside supabase/migrations/ so the CLI never auto-applies it.
--
-- 1. The ledger's 'sending' status. A row in 'sending' is a line a retry was
--    posting when it stopped; it may or may not be on the deal. The old CHECK
--    cannot hold it, so this refuses while any exist. Run retryMissingLines on
--    those deals first (it reads the deal and marks each one added or failed),
--    or look at each deal in Pipedrive and set the row by hand.
--
--    Internal sessions get INSERT / UPDATE on the ledger back, as Step 1 had it.
--
-- 2. project_deal_claims. DATA LOSS once Step 5 is live: these rows are the
--    only guard against a second deal for a project, and the only record of a
--    create that may have reached Pipedrive with no deal id written back. Dump
--    first if rows exist:
--
--   copy (select * from public.project_deal_claims) to '/tmp/project_deal_claims.csv' with (format csv, header);

do $$
begin
  if exists (select 1 from public.deal_line_syncs where status = 'sending') then
    raise exception 'deal_line_syncs has rows in sending; resolve them before rolling back (see the header)';
  end if;
end;
$$;

alter table public.deal_line_syncs drop constraint deal_line_syncs_status_check;
alter table public.deal_line_syncs add constraint deal_line_syncs_status_check
  check (status in ('pending', 'added', 'failed'));

-- Restore Step 1's internal writes on the ledger (20261016000005, verbatim).
-- This reopens review gate finding S-1.
grant insert, update on public.deal_line_syncs to authenticated;

create policy deal_line_syncs_insert_internal
on public.deal_line_syncs for insert
to authenticated
with check (
  (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())))
  and created_by = (select auth.uid())
);

create policy deal_line_syncs_update_internal
on public.deal_line_syncs for update
to authenticated
using (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())))
with check (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())));

drop table if exists public.project_deal_claims;
drop function if exists public.project_deal_claims_keep_deal();
