-- Rollback for 20260723000001_datasheet_appliance_specs.sql
--
-- Drops exactly the appliance_specs table, its indexes, and its policies.
-- Does NOT drop any extension (unlike the camera_specs rollback) — this
-- migration enables none. is_admin() is a shared helper and is left in place.

drop policy if exists appliance_specs_select_all   on public.appliance_specs;
drop policy if exists appliance_specs_insert_admin  on public.appliance_specs;
drop policy if exists appliance_specs_update_admin  on public.appliance_specs;
drop policy if exists appliance_specs_delete_admin  on public.appliance_specs;

drop index if exists public.appliance_specs_family_type_idx;
drop index if exists public.appliance_specs_sheet_group_idx;

drop table if exists public.appliance_specs;
