-- Phase 6 Step 1 — VideoX QuickCompare columns on product_specs
--
-- Purely ADDITIVE: adds nullable columns used only by the /videox-compare
-- QuickCompare tool. Does NOT touch existing columns, existing rows' existing
-- values, indexes, or RLS policies. See ADR 0044.
--
-- QuickCompare operates at the model-FAMILY level (V100, V200, …) while
-- product_specs rows are at the SKU-TIER level (VX5-V100-32/-40/-48). The
-- QuickCompare spec values are identical across all SKU tiers within a family,
-- so each UPDATE below sets the same values for every tier in that family.
--
-- Data source: VideoX-QuickCompare-V5.xlsx, "Arxys V5" sheet. V900 is omitted
-- by decision (no V900 rows exist in product_specs and no pricing/storage data
-- is available — see JOURNAL Phase 6 Step 1). The QuickCompare new columns hold
-- the marketing-canonical specs from the spreadsheet, which intentionally
-- differ from the comparison-tool columns for some families (e.g. cpu cores).
--
-- Two naming notes:
--   * `cpu_model_full` (not `cpu_model`) — product_specs already has a
--     NOT NULL `cpu_model`; this is the detailed QuickCompare string, kept
--     distinct (same pattern as `raid_level_display` vs `raid_support`).
--   * `max_bandwidth_mbps` is added here (not in the original column list) to
--     back the Overview "Max Bandwidth" row.

-- ---------------------------------------------------------------------------
-- 1. Add columns (all nullable)
-- ---------------------------------------------------------------------------

-- Physical
alter table public.product_specs add column rack_units         text;
alter table public.product_specs add column drive_bays         integer;
alter table public.product_specs add column max_bandwidth_mbps  integer;

-- System
alter table public.product_specs add column os_edition         text;
alter table public.product_specs add column ram_spec           text;
alter table public.product_specs add column cpu_model_full      text;
alter table public.product_specs add column cpu_turbo_ghz       text;
alter table public.product_specs add column cores_threads       text;
alter table public.product_specs add column cpu_cache           text;
alter table public.product_specs add column mem_bandwidth       text;
alter table public.product_specs add column avx_512             text;
alter table public.product_specs add column workload_affinity   text;
alter table public.product_specs add column chiplet_arch        text;
alter table public.product_specs add column infinity_guard      text;
alter table public.product_specs add column hotswap_power       text;

-- Storage
alter table public.product_specs add column hdd_count           integer;
alter table public.product_specs add column hdd_mtbf            text;
alter table public.product_specs add column raid_level_display  text;
alter table public.product_specs add column battery_raid        text;
alter table public.product_specs add column os_ssd_type         text;
alter table public.product_specs add column os_redundancy       text;

-- Networking
alter table public.product_specs add column gbe_1_ports         integer;
alter table public.product_specs add column gbe_10_ports        integer;
alter table public.product_specs add column sfp_addon           text;
alter table public.product_specs add column avigilon_gpu        text;

-- ---------------------------------------------------------------------------
-- 2. Seed values per model family (identical across SKU tiers in a family)
-- ---------------------------------------------------------------------------

-- V100 — 1U, 2 bays, AMD EPYC 4005 6C/12T
update public.product_specs set
  rack_units = '1U', drive_bays = 2, max_bandwidth_mbps = 500,
  os_edition = 'Windows Server 2022 OR 2025 WKGP LTSC',
  ram_spec = '16GB ECC DDR5',
  cpu_model_full = 'AMD EPYC 4005 4.0Ghz 6/12 Core',
  cpu_turbo_ghz = '5.4 Ghz', cores_threads = '6C/12T', cpu_cache = '8MB',
  mem_bandwidth = '89.6 GB/s', avx_512 = 'Yes', workload_affinity = 'NO',
  chiplet_arch = 'Yes', infinity_guard = 'Yes', hotswap_power = 'NO',
  hdd_count = 2, hdd_mtbf = '2.5 Million', raid_level_display = 'NA',
  battery_raid = 'NO', os_ssd_type = '1x NVMe', os_redundancy = 'NO',
  gbe_1_ports = 2, gbe_10_ports = 0, sfp_addon = 'No', avigilon_gpu = 'NO'
where id like 'VX5-V100-%';

-- V200 — 1U, 4 bays, AMD EPYC 4005 6C/12T
update public.product_specs set
  rack_units = '1U', drive_bays = 4, max_bandwidth_mbps = 1000,
  os_edition = 'Windows Server 2022 OR 2025 WKGP LTSC',
  ram_spec = '16GB ECC DDR5',
  cpu_model_full = 'AMD EPYC 4005 4.0Ghz 6/12 Core',
  cpu_turbo_ghz = '5.4 Ghz', cores_threads = '6C/12T', cpu_cache = '16MB',
  mem_bandwidth = '89.6 GB/s', avx_512 = 'Yes', workload_affinity = 'NO',
  chiplet_arch = 'Yes', infinity_guard = 'Yes', hotswap_power = 'Yes',
  hdd_count = 4, hdd_mtbf = '2.5 Million', raid_level_display = '5',
  battery_raid = 'YES', os_ssd_type = '2x Enterprise SSD', os_redundancy = 'Mirrored, hot-swap',
  gbe_1_ports = 2, gbe_10_ports = 2, sfp_addon = 'No', avigilon_gpu = 'Optional'
where id like 'VX5-V200-%';

-- V400 — 2U, 8 bays, AMD EPYC 9005 16C/32T 3.3Ghz, 16GB RAM (NOT 32GB)
update public.product_specs set
  rack_units = '2U', drive_bays = 8, max_bandwidth_mbps = 2000,
  os_edition = 'Windows Server 2022 OR 2025 LTSC',
  ram_spec = '16GB ECC DDR5',
  cpu_model_full = 'AMD EPYC 9005 3.3Ghz 16/32 Core',
  cpu_turbo_ghz = '3.3 Ghz', cores_threads = '16C/32T', cpu_cache = '16MB',
  mem_bandwidth = '614 GB/s', avx_512 = 'Yes', workload_affinity = 'Yes',
  chiplet_arch = 'Yes', infinity_guard = 'Yes', hotswap_power = 'Yes',
  hdd_count = 4, hdd_mtbf = '2.5 Million', raid_level_display = '5',
  battery_raid = 'YES', os_ssd_type = '2x Enterprise SSD', os_redundancy = 'Mirrored, hot-swap',
  gbe_1_ports = 0, gbe_10_ports = 4, sfp_addon = 'Optional', avigilon_gpu = 'Optional'
where id like 'VX5-V400-%';

-- V500 — 2U, 12 bays, AMD EPYC 9005 16C/32T 3.3Ghz, 32GB RAM
update public.product_specs set
  rack_units = '2U', drive_bays = 12, max_bandwidth_mbps = 3000,
  os_edition = 'Windows Server 2022 OR 2025 LTSC',
  ram_spec = '32GB ECC DDR5',
  cpu_model_full = 'AMD EPYC 9005 3.3Ghz 16/32 Core',
  cpu_turbo_ghz = '3.3 Ghz', cores_threads = '16C/32T', cpu_cache = '32MB',
  mem_bandwidth = '614 GB/s', avx_512 = 'Yes', workload_affinity = 'Yes',
  chiplet_arch = 'Yes', infinity_guard = 'Yes', hotswap_power = 'Yes',
  hdd_count = 8, hdd_mtbf = '2.5 Million', raid_level_display = '6',
  battery_raid = 'YES', os_ssd_type = '2x Enterprise SSD', os_redundancy = 'Mirrored, hot-swap',
  gbe_1_ports = 0, gbe_10_ports = 4, sfp_addon = 'Optional', avigilon_gpu = 'Optional'
where id like 'VX5-V500-%';

-- V600 — 3U, 16 bays, 32GB RAM. (The QuickCompare spreadsheet listed 2U, but
--        that was a typo; price-book + form_factor agree on 3U — confirmed by
--        Andy 2026-06-02.)
update public.product_specs set
  rack_units = '3U', drive_bays = 16, max_bandwidth_mbps = 3000,
  os_edition = 'Windows Server 2022 OR 2025 LTSC',
  ram_spec = '32GB ECC DDR5',
  cpu_model_full = 'AMD EPYC 9005 3.3Ghz 16/32 Core',
  cpu_turbo_ghz = '3.3 Ghz', cores_threads = '16C/32T', cpu_cache = '32MB',
  mem_bandwidth = '614 GB/s', avx_512 = 'Yes', workload_affinity = 'Yes',
  chiplet_arch = 'Yes', infinity_guard = 'Yes', hotswap_power = 'Yes',
  hdd_count = 12, hdd_mtbf = '2.5 Million', raid_level_display = '6',
  battery_raid = 'YES', os_ssd_type = '2x Enterprise SSD', os_redundancy = 'Mirrored, hot-swap',
  gbe_1_ports = 0, gbe_10_ports = 4, sfp_addon = 'Optional', avigilon_gpu = 'Optional'
where id like 'VX5-V600-%';

-- V700 — 4U, 24 bays, AMD EPYC 9005 16C/32T 4.3Ghz, 32GB RAM
update public.product_specs set
  rack_units = '4U', drive_bays = 24, max_bandwidth_mbps = 4000,
  os_edition = 'Windows Server 2022 OR 2025 LTSC',
  ram_spec = '32GB ECC DDR5',
  cpu_model_full = 'AMD EPYC 9005 4.3Ghz 16/32 Core',
  cpu_turbo_ghz = '4.25 Ghz', cores_threads = '16C/32T', cpu_cache = '32MB',
  mem_bandwidth = '614 GB/s', avx_512 = 'Yes', workload_affinity = 'Yes',
  chiplet_arch = 'Yes', infinity_guard = 'Yes', hotswap_power = 'Yes',
  hdd_count = 16, hdd_mtbf = '2.5 Million', raid_level_display = '60',
  battery_raid = 'YES', os_ssd_type = '2x Enterprise SSD', os_redundancy = 'Mirrored, hot-swap',
  gbe_1_ports = 0, gbe_10_ports = 4, sfp_addon = 'Optional', avigilon_gpu = 'Optional'
where id like 'VX5-V700-%';

-- V800 — 4U, 36 bays, AMD EPYC 9005 16C/32T 4.3Ghz, 32GB RAM
update public.product_specs set
  rack_units = '4U', drive_bays = 36, max_bandwidth_mbps = 4000,
  os_edition = 'Windows Server 2022 OR 2025 LTSC',
  ram_spec = '32GB ECC DDR5',
  cpu_model_full = 'AMD EPYC 9005 4.3Ghz 16/32 Core',
  cpu_turbo_ghz = '4.25 Ghz', cores_threads = '16C/32T', cpu_cache = '32MB',
  mem_bandwidth = '614 GB/s', avx_512 = 'Yes', workload_affinity = 'Yes',
  chiplet_arch = 'Yes', infinity_guard = 'Yes', hotswap_power = 'Yes',
  hdd_count = 36, hdd_mtbf = '2.5 Million', raid_level_display = '60',
  battery_raid = 'YES', os_ssd_type = '2x Enterprise SSD', os_redundancy = 'Mirrored, hot-swap',
  gbe_1_ports = 0, gbe_10_ports = 4, sfp_addon = 'Optional', avigilon_gpu = 'Optional'
where id like 'VX5-V800-%';
