-- Rollback for 20260723000002_datasheet_product_specs_additive.sql
--
-- Drops exactly the columns that migration added. Additive-only forward
-- migration → column drops reverse it cleanly. `if exists` keeps this
-- idempotent / safe to re-run. No data other than these new (mostly null)
-- columns is affected; the original product_specs shape is restored.

alter table public.product_specs drop column if exists power_wattage;
alter table public.product_specs drop column if exists power_redundancy;
alter table public.product_specs drop column if exists power_ac_input;

alter table public.product_specs drop column if exists dimensions_mm;
alter table public.product_specs drop column if exists dimensions_in;
alter table public.product_specs drop column if exists shipping_weight;

alter table public.product_specs drop column if exists warranty_years;
alter table public.product_specs drop column if exists warranty_terms;

alter table public.product_specs drop column if exists operating_temp;
alter table public.product_specs drop column if exists storage_temp;
alter table public.product_specs drop column if exists humidity;

alter table public.product_specs drop column if exists regulatory_safety;
alter table public.product_specs drop column if exists regulatory_emissions;
alter table public.product_specs drop column if exists ndaa_text;

alter table public.product_specs drop column if exists security_features;

alter table public.product_specs drop column if exists remote_mgmt;
alter table public.product_specs drop column if exists os_drive_desc;

alter table public.product_specs drop column if exists revision_date;
