-- Rollback for 20260602000001_quickcompare_columns.sql
--
-- Drops every column added by the QuickCompare migration and nothing else.
-- Column data is discarded (DROP COLUMN); no other columns, rows, indexes, or
-- RLS policies are affected. See ADR 0044.

-- Physical
alter table public.product_specs drop column if exists rack_units;
alter table public.product_specs drop column if exists drive_bays;
alter table public.product_specs drop column if exists max_bandwidth_mbps;

-- System
alter table public.product_specs drop column if exists os_edition;
alter table public.product_specs drop column if exists ram_spec;
alter table public.product_specs drop column if exists cpu_model_full;
alter table public.product_specs drop column if exists cpu_turbo_ghz;
alter table public.product_specs drop column if exists cores_threads;
alter table public.product_specs drop column if exists cpu_cache;
alter table public.product_specs drop column if exists mem_bandwidth;
alter table public.product_specs drop column if exists avx_512;
alter table public.product_specs drop column if exists workload_affinity;
alter table public.product_specs drop column if exists chiplet_arch;
alter table public.product_specs drop column if exists infinity_guard;
alter table public.product_specs drop column if exists hotswap_power;

-- Storage
alter table public.product_specs drop column if exists hdd_count;
alter table public.product_specs drop column if exists hdd_mtbf;
alter table public.product_specs drop column if exists raid_level_display;
alter table public.product_specs drop column if exists battery_raid;
alter table public.product_specs drop column if exists os_ssd_type;
alter table public.product_specs drop column if exists os_redundancy;

-- Networking
alter table public.product_specs drop column if exists gbe_1_ports;
alter table public.product_specs drop column if exists gbe_10_ports;
alter table public.product_specs drop column if exists sfp_addon;
alter table public.product_specs drop column if exists avigilon_gpu;
