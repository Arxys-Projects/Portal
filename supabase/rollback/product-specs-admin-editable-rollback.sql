-- Rollback for 20260727000001_product_specs_admin_editable.sql (ADR 0096)
--
-- Reverses the forward migration in the opposite order: triggers, then the
-- audit table, then the columns, then the write path. `if exists` throughout so
-- it is idempotent and safe to re-run after a partial apply.
--
-- DESTRUCTIVE ON ONE THING ONLY: dropping product_specs_audit discards the
-- recorded edit history. Everything else is additive-in-reverse — the 21
-- product_specs rows and all their pre-existing column values are untouched.
-- If any admin edits have been made through the form, export
-- product_specs_audit before running this.
--
-- After this runs, product_specs is back to SELECT-only for authenticated with
-- service_role as its only writer, which is the state before ADR 0096.

-- Triggers first, so nothing tries to write the audit table while it is going
-- away.
drop trigger if exists product_specs_write_audit_trg   on public.product_specs;
drop trigger if exists product_specs_stamp_updated_trg on public.product_specs;

drop function if exists public.product_specs_write_audit();
drop function if exists public.product_specs_stamp_updated();

-- Audit table (index and bigserial sequence go with it).
drop policy if exists product_specs_audit_select_admin on public.product_specs_audit;
drop index if exists public.product_specs_audit_spec_id_changed_at_idx;
drop table if exists public.product_specs_audit;

-- Additive columns.
alter table public.product_specs drop column if exists raid_level_alt_display;
alter table public.product_specs drop column if exists updated_by;
alter table public.product_specs drop column if exists updated_at;

-- Write path. Leaves product_specs_select_all in place — that policy predates
-- this migration (20260529000001) and is not ours to drop.
drop policy if exists product_specs_update_admin on public.product_specs;
drop policy if exists product_specs_insert_admin on public.product_specs;

revoke insert, update on public.product_specs from authenticated;
