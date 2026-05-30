-- Phase 5 Step 1b — competitor_products table
--
-- Stores Milestone Husky IVO and Avigilon NVR6 models for competitive comparison.
-- arxys_match_id references product_specs(id) — the Arxys model partners
-- should be comparing against. msrp_current is NULL for Avigilon (competitor
-- pricing not displayed; partners enter their own quoted price).
-- See ADR 0042.

create table public.competitor_products (
  id                 text primary key,
  vendor             text not null check (vendor in ('milestone', 'avigilon')),
  brand_name         text not null,
  product_line       text not null,
  model_name         text not null,
  sku                text not null,
  form_factor        text not null,
  storage_raw_tb     numeric not null check (storage_raw_tb > 0),
  cpu_model          text not null,
  cpu_cores_threads  text not null,
  cpu_base_ghz       numeric not null check (cpu_base_ghz > 0),
  cpu_passmark       int not null check (cpu_passmark > 0),
  ram_gb             int not null check (ram_gb > 0),
  max_cameras        int not null check (max_cameras > 0),
  max_cameras_h265   int not null check (max_cameras_h265 > 0),
  network            text not null,
  raid_support       text not null,
  os                 text not null,
  warranty           text not null,
  vms_certified      text not null,
  arxys_match_id     text not null references public.product_specs(id),
  msrp_current       numeric(12,2)          -- NULL for Avigilon (pricing not published)
);

create index competitor_products_vendor_idx on public.competitor_products(vendor);
create index competitor_products_match_idx on public.competitor_products(arxys_match_id);

-- RLS: read-only reference data, no partner-specific filtering needed.
alter table public.competitor_products enable row level security;
revoke all on public.competitor_products from anon, authenticated;
grant select on public.competitor_products to authenticated;

create policy competitor_products_select_all
on public.competitor_products for select
to authenticated
using (true);

-- ---------------------------------------------------------------------------
-- Seed — 34 competitor models from data/server-specs.json (2026-05-15)
--
-- Column order: id, vendor, brand_name, product_line, model_name, sku,
--   form_factor, storage_raw_tb, cpu_model, cpu_cores_threads, cpu_base_ghz,
--   cpu_passmark, ram_gb, max_cameras, max_cameras_h265, network,
--   raid_support, os, warranty, vms_certified, arxys_match_id, msrp_current
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Milestone Husky IVO — 14 rows
-- All: os='Windows Server 2022 IoT', warranty='5yr NBD',
--      vms_certified='Milestone XProtect only', raid_support='RAID 5/6'
-- HE700R:  Intel Xeon E-series Rev 3, 6C/12T, 2.9 GHz, passmark 21708, 32GB RAM,
--          max_cameras=100, max_cameras_h265=50, 1U, network='2 × 1GbE'
-- HE1000R: Intel Xeon Silver, 12C/24T, 2.1 GHz, passmark 25136, 32GB RAM,
--          max_cameras=150, max_cameras_h265=75, 2U,
--          network='6 × 1GbE + 1 × 1GbE Mgmt'
-- HE1800R: Intel Xeon Silver, 12C/24T, 2.1 GHz, passmark 25136, 32GB RAM,
--          max_cameras=250, max_cameras_h265=125, 2U,
--          network='6 × 1GbE + 1 × 1GbE Mgmt', os='Windows Server 2022'
-- ---------------------------------------------------------------------------

insert into public.competitor_products
  (id,             vendor,      brand_name,  product_line,  model_name,
   sku,            form_factor, storage_raw_tb,
   cpu_model,                  cpu_cores_threads, cpu_base_ghz, cpu_passmark, ram_gb,
   max_cameras, max_cameras_h265, network,
   raid_support,  os,                         warranty,     vms_certified,
   arxys_match_id,    msrp_current)
values
  -- HE700R family (1U, 4-drive, Intel Xeon E-series Rev 3)
  ('HE700R-16TB', 'milestone', 'Milestone', 'Husky IVO', 'Husky IVO 700 1U Rack',
   'HE700R-16TB', '1U Rackmount', 16,
   'Intel Xeon E-series (Rev 3)', '6C/12T',   2.9,          21708,        32,
   100,         50,               '2 × 1GbE',
   'RAID 5/6',   'Windows Server 2022 IoT',  '5yr NBD',    'Milestone XProtect only',
   'VX5-V200-64', 24525.00),

  ('HE700R-32TB', 'milestone', 'Milestone', 'Husky IVO', 'Husky IVO 700 1U Rack',
   'HE700R-32TB', '1U Rackmount', 32,
   'Intel Xeon E-series (Rev 3)', '6C/12T',   2.9,          21708,        32,
   100,         50,               '2 × 1GbE',
   'RAID 5/6',   'Windows Server 2022 IoT',  '5yr NBD',    'Milestone XProtect only',
   'VX5-V200-64', 25650.00),

  ('HE700R-48TB', 'milestone', 'Milestone', 'Husky IVO', 'Husky IVO 700 1U Rack',
   'HE700R-48TB', '1U Rackmount', 48,
   'Intel Xeon E-series (Rev 3)', '6C/12T',   2.9,          21708,        32,
   100,         50,               '2 × 1GbE',
   'RAID 5/6',   'Windows Server 2022 IoT',  '5yr NBD',    'Milestone XProtect only',
   'VX5-V200-64', 27125.00),

  ('HE700R-64TB', 'milestone', 'Milestone', 'Husky IVO', 'Husky IVO 700 1U Rack',
   'HE700R-64TB', '1U Rackmount', 64,
   'Intel Xeon E-series (Rev 3)', '6C/12T',   2.9,          21708,        32,
   100,         50,               '2 × 1GbE',
   'RAID 5/6',   'Windows Server 2022 IoT',  '5yr NBD',    'Milestone XProtect only',
   'VX5-V200-80', 28475.00),

  -- HE1000R family (2U, 8-drive, Intel Xeon Silver)
  ('HE1000R-32TB', 'milestone', 'Milestone', 'Husky IVO', 'Husky IVO 1000 2U Rack',
   'HE1000R-32TB', '2U Rackmount', 32,
   'Intel Xeon Silver',          '12C/24T',   2.1,          25136,        32,
   150,         75,               '6 × 1GbE + 1 × 1GbE Mgmt',
   'RAID 5/6',   'Windows Server 2022 IoT',  '5yr NBD',    'Milestone XProtect only',
   'VX5-V400-128', 33100.00),

  ('HE1000R-64TB', 'milestone', 'Milestone', 'Husky IVO', 'Husky IVO 1000 2U Rack',
   'HE1000R-64TB', '2U Rackmount', 64,
   'Intel Xeon Silver',          '12C/24T',   2.1,          25136,        32,
   150,         75,               '6 × 1GbE + 1 × 1GbE Mgmt',
   'RAID 5/6',   'Windows Server 2022 IoT',  '5yr NBD',    'Milestone XProtect only',
   'VX5-V400-128', 35000.00),

  ('HE1000R-96TB', 'milestone', 'Milestone', 'Husky IVO', 'Husky IVO 1000 2U Rack',
   'HE1000R-96TB', '2U Rackmount', 96,
   'Intel Xeon Silver',          '12C/24T',   2.1,          25136,        32,
   150,         75,               '6 × 1GbE + 1 × 1GbE Mgmt',
   'RAID 5/6',   'Windows Server 2022 IoT',  '5yr NBD',    'Milestone XProtect only',
   'VX5-V400-128', 38125.00),

  ('HE1000R-128TB', 'milestone', 'Milestone', 'Husky IVO', 'Husky IVO 1000 2U Rack',
   'HE1000R-128TB', '2U Rackmount', 128,
   'Intel Xeon Silver',           '12C/24T',  2.1,          25136,        32,
   150,         75,               '6 × 1GbE + 1 × 1GbE Mgmt',
   'RAID 5/6',   'Windows Server 2022 IoT',  '5yr NBD',    'Milestone XProtect only',
   'VX5-V400-160', 40525.00),

  -- HE1800R family (2U, 12/24-drive, Intel Xeon Silver, os='Windows Server 2022')
  ('HE1800R-48TB', 'milestone', 'Milestone', 'Husky IVO', 'Husky IVO 1800 2U Rack',
   'HE1800R-48TB', '2U Rackmount', 48,
   'Intel Xeon Silver',          '12C/24T',   2.1,          25136,        32,
   250,         125,              '6 × 1GbE + 1 × 1GbE Mgmt',
   'RAID 5/6',   'Windows Server 2022',      '5yr NBD',    'Milestone XProtect only',
   'VX5-V500-192', 43150.00),

  ('HE1800R-96TB', 'milestone', 'Milestone', 'Husky IVO', 'Husky IVO 1800 2U Rack',
   'HE1800R-96TB', '2U Rackmount', 96,
   'Intel Xeon Silver',          '12C/24T',   2.1,          25136,        32,
   250,         125,              '6 × 1GbE + 1 × 1GbE Mgmt',
   'RAID 5/6',   'Windows Server 2022',      '5yr NBD',    'Milestone XProtect only',
   'VX5-V500-192', 46025.00),

  ('HE1800R-144TB', 'milestone', 'Milestone', 'Husky IVO', 'Husky IVO 1800 2U Rack',
   'HE1800R-144TB', '2U Rackmount', 144,
   'Intel Xeon Silver',           '12C/24T',  2.1,          25136,        32,
   250,         125,              '6 × 1GbE + 1 × 1GbE Mgmt',
   'RAID 5/6',   'Windows Server 2022',      '5yr NBD',    'Milestone XProtect only',
   'VX5-V500-192', 49825.00),

  ('HE1800R-192TB', 'milestone', 'Milestone', 'Husky IVO', 'Husky IVO 1800 2U Rack',
   'HE1800R-192TB', '2U Rackmount', 192,
   'Intel Xeon Silver',           '12C/24T',  2.1,          25136,        32,
   250,         125,              '6 × 1GbE + 1 × 1GbE Mgmt',
   'RAID 5/6',   'Windows Server 2022',      '5yr NBD',    'Milestone XProtect only',
   'VX5-V500-240', 53275.00),

  ('HE1800R-288TB', 'milestone', 'Milestone', 'Husky IVO', 'Husky IVO 1800 2U Rack',
   'HE1800R-288TB', '2U Rackmount', 288,
   'Intel Xeon Silver',           '12C/24T',  2.1,          25136,        32,
   250,         125,              '6 × 1GbE + 1 × 1GbE Mgmt',
   'RAID 5/6',   'Windows Server 2022',      '5yr NBD',    'Milestone XProtect only',
   'VX5-V600-320', 64700.00),

  ('HE1800R-384TB', 'milestone', 'Milestone', 'Husky IVO', 'Husky IVO 1800 2U Rack',
   'HE1800R-384TB', '2U Rackmount', 384,
   'Intel Xeon Silver',           '12C/24T',  2.1,          25136,        32,
   250,         125,              '6 × 1GbE + 1 × 1GbE Mgmt',
   'RAID 5/6',   'Windows Server 2022',      '5yr NBD',    'Milestone XProtect only',
   'VX5-V600-384', 72925.00);

-- ---------------------------------------------------------------------------
-- Avigilon NVR6 — 20 rows. msrp_current = NULL (pricing not displayed).
-- All: warranty='5yr NBD', vms_certified='Avigilon only',
--      raid_support='RAID 5/6', form_factor='2U Rackmount'
--
-- Standard (10): Intel Xeon Silver 4410Y, 12C/24T, 2.0GHz, passmark 25136,
--   32GB RAM, max_cameras=120, max_cameras_h265=70, network='6 × 1GbE'
--   5 storage configs × 2 OS variants (S22 / W10)
-- Premium (5): Intel Xeon Silver 4410Y dual, 24C/48T, 2.8GHz, passmark 42443,
--   64GB RAM, max_cameras=200, max_cameras_h265=120, os='Windows Server 2022'
-- Premium Plus (5): same CPU as Premium, 128GB RAM,
--   max_cameras=220, max_cameras_h265=130, network='4 × 10GbE + 4 × 1GbE'
-- ---------------------------------------------------------------------------

insert into public.competitor_products
  (id,             vendor,     brand_name,  product_line, model_name,
   sku,            form_factor, storage_raw_tb,
   cpu_model,                          cpu_cores_threads, cpu_base_ghz, cpu_passmark, ram_gb,
   max_cameras, max_cameras_h265, network,
   raid_support,  os,                      warranty,    vms_certified,
   arxys_match_id,    msrp_current)
values
  -- NVR6 Standard — Windows Server 2022 variants
  ('NVR6-STD-FORM-D-16TB-S22', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Standard 16TB (Server 2022)',
   'NVR6-STD-FORM-D-16TB-S22', '2U Rackmount', 16,
   'Intel Xeon Silver 4410Y',          '12C/24T',   2.0,          25136,        32,
   120,         70,               '6 × 1GbE',
   'RAID 5/6',   'Windows Server 2022',   '5yr NBD',   'Avigilon only',
   'VX5-V500-192', null),

  ('NVR6-STD-FORM-D-24TB-S22', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Standard 24TB (Server 2022)',
   'NVR6-STD-FORM-D-24TB-S22', '2U Rackmount', 24,
   'Intel Xeon Silver 4410Y',          '12C/24T',   2.0,          25136,        32,
   120,         70,               '6 × 1GbE',
   'RAID 5/6',   'Windows Server 2022',   '5yr NBD',   'Avigilon only',
   'VX5-V500-192', null),

  ('NVR6-STD-FORM-D-32TB-S22', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Standard 32TB (Server 2022)',
   'NVR6-STD-FORM-D-32TB-S22', '2U Rackmount', 32,
   'Intel Xeon Silver 4410Y',          '12C/24T',   2.0,          25136,        32,
   120,         70,               '6 × 1GbE',
   'RAID 5/6',   'Windows Server 2022',   '5yr NBD',   'Avigilon only',
   'VX5-V500-192', null),

  ('NVR6-STD-FORM-D-48TB-S22', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Standard 48TB (Server 2022)',
   'NVR6-STD-FORM-D-48TB-S22', '2U Rackmount', 48,
   'Intel Xeon Silver 4410Y',          '12C/24T',   2.0,          25136,        32,
   120,         70,               '6 × 1GbE',
   'RAID 5/6',   'Windows Server 2022',   '5yr NBD',   'Avigilon only',
   'VX5-V500-192', null),

  ('NVR6-STD-FORM-D-64TB-S22', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Standard 64TB (Server 2022)',
   'NVR6-STD-FORM-D-64TB-S22', '2U Rackmount', 64,
   'Intel Xeon Silver 4410Y',          '12C/24T',   2.0,          25136,        32,
   120,         70,               '6 × 1GbE',
   'RAID 5/6',   'Windows Server 2022',   '5yr NBD',   'Avigilon only',
   'VX5-V500-192', null),

  -- NVR6 Standard — Windows 11 Desktop (IoT) variants
  ('NVR6-STD-FORM-D-16TB-W10', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Standard 16TB (Win IoT)',
   'NVR6-STD-FORM-D-16TB-W10', '2U Rackmount', 16,
   'Intel Xeon Silver 4410Y',          '12C/24T',   2.0,          25136,        32,
   120,         70,               '6 × 1GbE',
   'RAID 5/6',   'Windows 11 Desktop',    '5yr NBD',   'Avigilon only',
   'VX5-V500-192', null),

  ('NVR6-STD-FORM-D-24TB-W10', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Standard 24TB (Win IoT)',
   'NVR6-STD-FORM-D-24TB-W10', '2U Rackmount', 24,
   'Intel Xeon Silver 4410Y',          '12C/24T',   2.0,          25136,        32,
   120,         70,               '6 × 1GbE',
   'RAID 5/6',   'Windows 11 Desktop',    '5yr NBD',   'Avigilon only',
   'VX5-V500-192', null),

  ('NVR6-STD-FORM-D-32TB-W10', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Standard 32TB (Win IoT)',
   'NVR6-STD-FORM-D-32TB-W10', '2U Rackmount', 32,
   'Intel Xeon Silver 4410Y',          '12C/24T',   2.0,          25136,        32,
   120,         70,               '6 × 1GbE',
   'RAID 5/6',   'Windows 11 Desktop',    '5yr NBD',   'Avigilon only',
   'VX5-V500-192', null),

  ('NVR6-STD-FORM-D-48TB-W10', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Standard 48TB (Win IoT)',
   'NVR6-STD-FORM-D-48TB-W10', '2U Rackmount', 48,
   'Intel Xeon Silver 4410Y',          '12C/24T',   2.0,          25136,        32,
   120,         70,               '6 × 1GbE',
   'RAID 5/6',   'Windows 11 Desktop',    '5yr NBD',   'Avigilon only',
   'VX5-V500-192', null),

  ('NVR6-STD-FORM-D-64TB-W10', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Standard 64TB (Win IoT)',
   'NVR6-STD-FORM-D-64TB-W10', '2U Rackmount', 64,
   'Intel Xeon Silver 4410Y',          '12C/24T',   2.0,          25136,        32,
   120,         70,               '6 × 1GbE',
   'RAID 5/6',   'Windows 11 Desktop',    '5yr NBD',   'Avigilon only',
   'VX5-V500-192', null),

  -- NVR6 Premium — dual-CPU, 64GB RAM, os='Windows Server 2022'
  ('NVR6-PRM-FORM-D-72TB-S22', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Premium 72TB',
   'NVR6-PRM-FORM-D-72TB-S22', '2U Rackmount', 72,
   'Intel Xeon Silver 4410Y (dual)',    '24C/48T',   2.8,          42443,        64,
   200,         120,              '4 × 10GbE + 4 × 1GbE',
   'RAID 5/6',   'Windows Server 2022',   '5yr NBD',   'Avigilon only',
   'VX5-V500-192', null),

  ('NVR6-PRM-FORM-D-96TB-S22', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Premium 96TB',
   'NVR6-PRM-FORM-D-96TB-S22', '2U Rackmount', 96,
   'Intel Xeon Silver 4410Y (dual)',    '24C/48T',   2.8,          42443,        64,
   200,         120,              '4 × 10GbE + 6 × 1GbE',
   'RAID 5/6',   'Windows Server 2022',   '5yr NBD',   'Avigilon only',
   'VX5-V500-192', null),

  ('NVR6-PRM-FORM-D-120TB-S22', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Premium 120TB',
   'NVR6-PRM-FORM-D-120TB-S22', '2U Rackmount', 120,
   'Intel Xeon Silver 4410Y (dual)',    '24C/48T',   2.8,          42443,        64,
   200,         120,              '4 × 10GbE + 6 × 1GbE',
   'RAID 5/6',   'Windows Server 2022',   '5yr NBD',   'Avigilon only',
   'VX5-V500-192', null),

  ('NVR6-PRM-FORM-D-160TB-S22', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Premium 160TB',
   'NVR6-PRM-FORM-D-160TB-S22', '2U Rackmount', 160,
   'Intel Xeon Silver 4410Y (dual)',    '24C/48T',   2.8,          42443,        64,
   200,         120,              '4 × 10GbE + 6 × 1GbE',
   'RAID 5/6',   'Windows Server 2022',   '5yr NBD',   'Avigilon only',
   'VX5-V500-288', null),

  ('NVR6-PRM-FORM-D-200TB-S22', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Premium 200TB',
   'NVR6-PRM-FORM-D-200TB-S22', '2U Rackmount', 200,
   'Intel Xeon Silver 4410Y (dual)',    '24C/48T',   2.8,          42443,        64,
   200,         120,              '4 × 10GbE + 6 × 1GbE',
   'RAID 5/6',   'Windows Server 2022',   '5yr NBD',   'Avigilon only',
   'VX5-V500-288', null),

  -- NVR6 Premium Plus — dual-CPU, 128GB RAM, network='4 × 10GbE + 4 × 1GbE'
  ('NVR6-PRM-PLUS-FORM-H-200TB-S22', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Premium Plus 200TB',
   'NVR6-PRM-PLUS-FORM-H-200TB-S22', '2U Rackmount', 200,
   'Intel Xeon Silver 4410Y (dual)',    '24C/48T',   2.8,          42443,        128,
   220,         130,              '4 × 10GbE + 4 × 1GbE',
   'RAID 5/6',   'Windows Server 2022',   '5yr NBD',   'Avigilon only',
   'VX5-V700-384', null),

  ('NVR6-PRM-PLUS-FORM-H-240TB-S22', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Premium Plus 240TB',
   'NVR6-PRM-PLUS-FORM-H-240TB-S22', '2U Rackmount', 240,
   'Intel Xeon Silver 4410Y (dual)',    '24C/48T',   2.8,          42443,        128,
   220,         130,              '4 × 10GbE + 4 × 1GbE',
   'RAID 5/6',   'Windows Server 2022',   '5yr NBD',   'Avigilon only',
   'VX5-V700-384', null),

  ('NVR6-PRM-PLUS-FORM-H-280TB-S22', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Premium Plus 280TB',
   'NVR6-PRM-PLUS-FORM-H-280TB-S22', '2U Rackmount', 280,
   'Intel Xeon Silver 4410Y (dual)',    '24C/48T',   2.8,          42443,        128,
   220,         130,              '4 × 10GbE + 4 × 1GbE',
   'RAID 5/6',   'Windows Server 2022',   '5yr NBD',   'Avigilon only',
   'VX5-V700-384', null),

  ('NVR6-PRM-PLUS-FORM-H-360TB-S22', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Premium Plus 360TB',
   'NVR6-PRM-PLUS-FORM-H-360TB-S22', '2U Rackmount', 360,
   'Intel Xeon Silver 4410Y (dual)',    '24C/48T',   2.8,          42443,        128,
   220,         130,              '4 × 10GbE + 4 × 1GbE',
   'RAID 5/6',   'Windows Server 2022',   '5yr NBD',   'Avigilon only',
   'VX5-V700-480', null),

  ('NVR6-PRM-PLUS-FORM-H-440TB-S22', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Premium Plus 440TB',
   'NVR6-PRM-PLUS-FORM-H-440TB-S22', '2U Rackmount', 440,
   'Intel Xeon Silver 4410Y (dual)',    '24C/48T',   2.8,          42443,        128,
   220,         130,              '4 × 10GbE + 4 × 1GbE',
   'RAID 5/6',   'Windows Server 2022',   '5yr NBD',   'Avigilon only',
   'VX5-V700-576', null);
