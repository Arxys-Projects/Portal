-- Rollback — pipeline status model reduction (migration 20260717000002).
-- Lives outside supabase/migrations/ so the CLI never auto-applies it.
-- Reverts 20260717000002_pipeline_status_model_reduction.sql.
--
-- IMPORTANT — schema vs data:
--   This script restores the SCHEMA (constraint, default, nullability, delete
--   guard, comment) to its pre-0081 shape. It does NOT restore the original
--   per-row status values: the forward migration folded 60 draft + 8 sent into
--   'open', and that mapping is not reconstructable from the migrated column.
--   To recover the original values, replay the pre-migration backup with
--   scripts/restore-tables.ts against the JSON dumped by scripts/backup-tables.ts
--   (backups/manual-2026-07-17T19-18-12-701Z.json). Run the data restore FIRST
--   (while the column still permits 'open' — i.e. before re-adding the old
--   CHECK), or restore data after this script with the old values, which the
--   restored constraint permits.

-- 1. Drop the reduced CHECK so the column can hold the old values again.
alter table public.submissions
  drop constraint if exists submissions_status_check;

-- 2. Restore the original nullability + default (was: nullable, default NULL).
alter table public.submissions alter column status drop not null;
alter table public.submissions alter column status set default null;

-- 3. Restore the original six-value CHECK (nullable).
alter table public.submissions
  add constraint submissions_status_check
  check (status is null or status in ('draft', 'sent', 'won', 'lost', 'on-hold'));

-- 4. Restore the original delete-guard (draft/NULL + admin).
drop policy if exists submissions_delete_authorized on public.submissions;
create policy submissions_delete_authorized
on public.submissions for delete
to authenticated
using (
  (partner_id = (select auth.uid()) and (status is null or status = 'draft'))
  or public.is_admin((select auth.uid()))
);

-- 5. Restore the original column comment.
comment on column public.submissions.status is
  'Lifecycle status. NULL = no status set (treated as draft for delete purposes). Managed by the partner.';
