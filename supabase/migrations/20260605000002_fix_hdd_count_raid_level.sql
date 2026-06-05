-- Fix hdd_count and raid_level_display for VideoX model families.
-- Previous values set in 20260602000001_quickcompare_columns.sql were incorrect.
-- Corrected per Andy 2026-06-05.

-- hdd_count: V400 4→8, V500 8→12, V600 12→16, V700 16→24 (V100/V200/V800 were correct)
update public.product_specs set hdd_count = 8  where id like 'VX5-V400-%';
update public.product_specs set hdd_count = 12 where id like 'VX5-V500-%';
update public.product_specs set hdd_count = 16 where id like 'VX5-V600-%';
update public.product_specs set hdd_count = 24 where id like 'VX5-V700-%';

-- raid_level_display: V400 '5'→'6'
update public.product_specs set raid_level_display = '6' where id like 'VX5-V400-%';
