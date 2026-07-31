-- Rollback for 20260731000001_management_cameras_managed.sql.
--
-- Drops the two cameras-managed columns. Safe in the sense that nothing else
-- depends on them: no index, no constraint, no policy, no view, and both are
-- nullable additions to a 7-row table.
--
-- IT DOES DESTROY DATA. Any figure entered through /admin/appliance-specs is
-- gone with the column, and it is not recoverable from the audit table's
-- before/after JSON in any convenient form. Back the rows up first:
--
--   node --env-file=.env.local --import tsx scripts/backup-tables.ts pre-0111-rollback
--
-- After running this, the V250 / V255 datasheet still renders — the adapter
-- treats a missing column exactly as it treats a null one and prints an em
-- dash — but the admin form will fail EVERY save on appliance_specs until the
-- two fields are also removed from
-- src/app/(app)/admin/appliance-specs/fields.ts, because the action writes the
-- full parsed field set. Roll the code back with it.

alter table public.appliance_specs
  drop column if exists cameras_managed_min,
  drop column if exists cameras_managed_max;
