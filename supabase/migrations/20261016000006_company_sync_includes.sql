-- Project Portal backend, Step 1 addendum: a portal-side list of Pipedrive orgs
-- the company sync includes without the partner label. ADR 0156.
--
-- Why: the sync takes orgs labeled "Arxys Security Partner" (ADR 0153), but the
-- label also drives partner emails. Relativity Space is wanted as a company and
-- is not a partner, so labeling it is not an option, and Andy chose not to add
-- a second label in Pipedrive (2026-10-16). The sync (Step 2) treats an org as a
-- company when it carries the label OR its id is in this table.
--
-- Independent of 000002 to 000005 (references partners only), so it can be
-- applied on its own.
--
-- ⚠ STOP-AND-FLAG: new table with RLS. Applied by hand by Andy; see
-- docs/apply-notes/0153-project-portal-schema.md.
-- Rollback: supabase/rollback/company-sync-includes-rollback.sql.
--
-- No row is seeded. Relativity Space has three org versions in Pipedrive; Andy
-- picks one and adds its id (insert statement in the apply note).
--
-- ACCESS: internal and admin SELECT (to see why a company is on the list);
-- admin INSERT / UPDATE / DELETE. Removing a row is allowed: the next sync marks
-- that company inactive, it does not delete it. Partners get nothing.

create table public.company_sync_includes (
  pipedrive_org_id bigint primary key check (pipedrive_org_id > 0),
  -- Plain-language reason, shown wherever the list is reviewed.
  reason           text not null check (length(btrim(reason)) > 0),
  added_by         uuid references public.partners(id) on delete set null,
  added_at         timestamptz not null default now()
);

comment on table public.company_sync_includes is
  'ADR 0156: Pipedrive org ids the company sync includes without the "Arxys '
  'Security Partner" label (that label drives partner emails). Admin-write, '
  'internal read.';

alter table public.company_sync_includes enable row level security;
revoke all on public.company_sync_includes from anon, authenticated;
grant select, insert, update, delete on public.company_sync_includes to authenticated;

create policy company_sync_includes_select_internal
on public.company_sync_includes for select
to authenticated
using (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())));

-- added_by, when set, must be the acting admin.
create policy company_sync_includes_insert_admin
on public.company_sync_includes for insert
to authenticated
with check (
  public.is_admin((select auth.uid()))
  and (added_by is null or added_by = (select auth.uid()))
);

create policy company_sync_includes_update_admin
on public.company_sync_includes for update
to authenticated
using (public.is_admin((select auth.uid())))
with check (
  public.is_admin((select auth.uid()))
  and (added_by is null or added_by = (select auth.uid()))
);

create policy company_sync_includes_delete_admin
on public.company_sync_includes for delete
to authenticated
using (public.is_admin((select auth.uid())));
