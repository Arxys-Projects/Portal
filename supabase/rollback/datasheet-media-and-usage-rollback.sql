-- Rollback for 20260730000001_datasheet_media_and_usage.sql (ADR 0107)
--
-- Drops exactly the six columns that migration added, three per table.
-- Additive-only forward migration → column drops reverse it cleanly, and
-- `if exists` keeps this idempotent / safe to re-run.
--
-- WHAT THIS DESTROYS: any photo paths and usage paragraphs typed through the
-- admin forms since the forward migration was applied. Those are entered by
-- hand, not derivable from anything else, and are NOT recoverable from
-- families.ts — `greatFor` is per-family copy, while usage_paragraph is
-- per-SKU. Read the audit tables (product_specs_audit / appliance_specs_audit)
-- before running this if any row has been edited: the snapshots hold the
-- values, keyed by column name.
--
-- Column comments go with the columns. This does NOT touch the write policies,
-- provenance columns, triggers or audit tables from 20260727000001 / 20260729000001
-- (ADR 0096, 0097) — those are row-level and cover whatever columns exist.

alter table public.product_specs   drop column if exists product_photo_path;
alter table public.product_specs   drop column if exists rear_io_photo_path;
alter table public.product_specs   drop column if exists usage_paragraph;

alter table public.appliance_specs drop column if exists product_photo_path;
alter table public.appliance_specs drop column if exists rear_io_photo_path;
alter table public.appliance_specs drop column if exists usage_paragraph;
