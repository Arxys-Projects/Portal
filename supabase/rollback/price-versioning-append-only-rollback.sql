-- Rollback for 20260702000001_price_versioning_append_only.sql
--
-- SAFE ONLY while each SKU still has exactly one row — i.e. before the pipeline
-- has inserted any second versioned row. If multiple versions per SKU exist,
-- restoring the sku primary key will fail on the duplicate; first collapse to
-- one row per SKU (keep the current-as-of-today row) before running this.

set check_function_bodies = off;

drop view if exists public.current_products;

drop index if exists public.products_sku_effective_idx;
alter table public.products drop constraint if exists products_sku_effective_date_key;

alter table public.products drop column if exists pushed_to_pipedrive_at;
alter table public.products drop column if exists effective_date;

alter table public.products drop constraint if exists products_pkey;   -- was primary key (id)
alter table public.products drop column if exists id;
alter table public.products add constraint products_pkey primary key (sku);
