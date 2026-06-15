-- Rollback for 20260615000002_phase10_camera_specs.sql
--
-- Drops exactly the camera_specs table, its indexes, its policies, and the
-- pg_trgm extension. pg_trgm is dropped because the paired migration is the
-- first to enable it (only pgcrypto was enabled in the initial schema; no
-- prior migration uses pg_trgm). If a later migration starts depending on
-- pg_trgm, remove the `drop extension` line below so this rollback does not
-- pull a shared extension out from under it.

drop policy if exists camera_specs_select_all   on public.camera_specs;
drop policy if exists camera_specs_insert_admin  on public.camera_specs;
drop policy if exists camera_specs_update_admin  on public.camera_specs;
drop policy if exists camera_specs_delete_admin  on public.camera_specs;

drop index if exists public.camera_specs_model_trgm_idx;
drop index if exists public.camera_specs_aliases_trgm_idx;
drop index if exists public.camera_specs_vendor_idx;

drop table if exists public.camera_specs;

drop extension if exists "pg_trgm";
