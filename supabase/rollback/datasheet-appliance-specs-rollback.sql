-- Rollback for 20260729000001_datasheet_appliance_specs.sql (ADR 0090 + ADR 0097)
--
-- Reverses the forward migration in the opposite order: triggers, then the audit
-- table, then the main table with its policies and indexes. `if exists`
-- throughout so it is idempotent and safe to re-run after a partial apply.
--
-- Nothing here is destructive of pre-existing data — the forward migration
-- creates both tables from nothing, so this returns the database to a state with
-- no appliance_specs at all. If any rows have been entered through
-- /admin/appliance-specs, THIS DISCARDS THEM along with their recorded edit
-- history; export both tables first.
--
-- Drops no extension (unlike the camera_specs rollback) — this migration enables
-- none. is_admin() and partners are shared and are left in place.

-- Triggers first, so nothing tries to write the audit table while it is going
-- away. (Dropping appliance_specs would take its triggers with it; done
-- explicitly so a partial apply also rolls back cleanly.)
drop trigger if exists appliance_specs_write_audit_trg   on public.appliance_specs;
drop trigger if exists appliance_specs_stamp_updated_trg on public.appliance_specs;

drop function if exists public.appliance_specs_write_audit();
drop function if exists public.appliance_specs_stamp_updated();

-- Audit table (index and bigserial sequence go with it).
drop policy if exists appliance_specs_audit_select_admin on public.appliance_specs_audit;
drop index if exists public.appliance_specs_audit_spec_id_changed_at_idx;
drop table if exists public.appliance_specs_audit;

-- Main table: policies, indexes, then the table (which takes the provenance
-- columns, the check constraint and the partners FK with it).
drop policy if exists appliance_specs_select_all    on public.appliance_specs;
drop policy if exists appliance_specs_insert_admin  on public.appliance_specs;
drop policy if exists appliance_specs_update_admin  on public.appliance_specs;

drop index if exists public.appliance_specs_family_type_idx;
drop index if exists public.appliance_specs_sheet_group_idx;

drop table if exists public.appliance_specs;

-- No `revoke ... on public.appliance_specs` line: the grants go with the dropped
-- table. There is no appliance_specs_delete_admin policy to drop — ADR 0097
-- withholds the DELETE grant and the policy (see the forward migration's RLS
-- block). An older draft of this rollback dropped one; it never existed in the
-- applied shape.
