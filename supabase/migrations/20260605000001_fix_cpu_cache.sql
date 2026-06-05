-- Fix cpu_cache values for all VideoX model families.
-- Previous values (set in 20260602000001_quickcompare_columns.sql) were incorrect.
-- Corrected per Andy 2026-06-05.

update public.product_specs set cpu_cache = '32MB' where id like 'VX5-V100-%';
update public.product_specs set cpu_cache = '32MB' where id like 'VX5-V200-%';
update public.product_specs set cpu_cache = '64MB' where id like 'VX5-V400-%';
update public.product_specs set cpu_cache = '64MB' where id like 'VX5-V500-%';
update public.product_specs set cpu_cache = '64MB' where id like 'VX5-V600-%';
update public.product_specs set cpu_cache = '64MB' where id like 'VX5-V700-%';
update public.product_specs set cpu_cache = '64MB' where id like 'VX5-V800-%';
