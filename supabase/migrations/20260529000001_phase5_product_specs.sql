-- Phase 5 Step 1a — product_specs table
--
-- Stores Arxys VideoX server specs for the competitive comparison tool.
-- Separate from `products` (which the pricing pipeline manages) because
-- spec data is sourced from data/server-specs.json, not the Google Sheet.
-- See ADR 0042.
--
-- No `active` column — all rows are always visible. The update script
-- (scripts/update-comparison-data.ts) refreshes rows via service_role.

create table public.product_specs (
  id                 text primary key,              -- JSON id e.g. VX5-V500-192
  model_name         text not null,
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
  msrp               numeric(12,2) not null check (msrp > 0),
  notes              text,
  product_sku        text              -- nullable; reserved for future join to products.sku
);

create index product_specs_form_factor_idx on public.product_specs(form_factor);

-- RLS: read-only reference data, no partner-specific filtering needed.
alter table public.product_specs enable row level security;
revoke all on public.product_specs from anon, authenticated;
grant select on public.product_specs to authenticated;

create policy product_specs_select_all
on public.product_specs for select
to authenticated
using (true);

-- ---------------------------------------------------------------------------
-- Seed — 21 Arxys VideoX models from data/server-specs.json (2026-05-15)
-- Column order: id, model_name, form_factor, storage_raw_tb,
--   cpu_model, cpu_cores_threads, cpu_base_ghz, cpu_passmark, ram_gb,
--   max_cameras, max_cameras_h265, network, raid_support, os, warranty,
--   vms_certified, msrp, notes, product_sku
-- ---------------------------------------------------------------------------

insert into public.product_specs
  (id,               model_name,                        form_factor,    storage_raw_tb,
   cpu_model,              cpu_cores_threads, cpu_base_ghz, cpu_passmark, ram_gb,
   max_cameras, max_cameras_h265,
   network,                    raid_support,          os,                                warranty,                     vms_certified,                              msrp,     notes,       product_sku)
values
  -- V100 family — AMD EPYC 4005 Series, 8C/16T, 3.8 GHz, Passmark 36144, 1U
  ('VX5-V100-32', 'VideoX V100 32TB 1U 2Bay',  '1U Rackmount', 32,
   'AMD EPYC 4005 Series', '8C/16T',           3.8,           36144,        16,
   25,          25,
   '2 × 10GbE + 1 IPMI', 'Software RAID 0/1', 'Windows Server 2022 / 2025 IoT', '5yr NBD, Advanced Replacement', 'Milestone XProtect, Avigilon ACC',         8317.00,  'Entry rack', null),

  ('VX5-V100-40', 'VideoX V100 40TB 1U 2Bay',  '1U Rackmount', 40,
   'AMD EPYC 4005 Series', '8C/16T',           3.8,           36144,        16,
   25,          25,
   '2 × 10GbE + 1 IPMI', 'Software RAID 0/1', 'Windows Server 2022 / 2025 IoT', '5yr NBD, Advanced Replacement', 'Milestone XProtect, Avigilon ACC, Genetec', 8745.00,  null,        null),

  ('VX5-V100-48', 'VideoX V100 48TB 1U 2Bay',  '1U Rackmount', 48,
   'AMD EPYC 4005 Series', '8C/16T',           3.8,           36144,        16,
   25,          25,
   '2 × 10GbE + 1 IPMI', 'Software RAID 0/1', 'Windows Server 2022 / 2025 IoT', '5yr NBD, Advanced Replacement', 'Milestone XProtect, Avigilon ACC, Genetec', 9558.00,  null,        null),

  -- V200 family — AMD EPYC 4005 Series, 8C/16T, 3.8 GHz, Passmark 36144, 1U
  ('VX5-V200-64', 'VideoX V200 64TB 1U 4Bay',  '1U Rackmount', 64,
   'AMD EPYC 4005 Series', '8C/16T',           3.8,           36144,        16,
   100,         100,
   '2 × 10GbE + 1 IPMI', 'RAID 0/1/5/6/10',   'Windows Server 2022 / 2025 IoT', '5yr NBD, Advanced Replacement', 'Milestone XProtect, Avigilon ACC, Genetec', 15657.00, null,        null),

  ('VX5-V200-80', 'VideoX V200 80TB 1U 4Bay',  '1U Rackmount', 80,
   'AMD EPYC 4005 Series', '8C/16T',           3.8,           36144,        16,
   100,         100,
   '2 × 10GbE + 1 IPMI', 'RAID 0/1/5/6/10',   'Windows Server 2022 / 2025 IoT', '5yr NBD, Advanced Replacement', 'Milestone XProtect, Avigilon ACC, Genetec', 16640.00, null,        null),

  ('VX5-V200-96', 'VideoX V200 96TB 1U 4Bay',  '1U Rackmount', 96,
   'AMD EPYC 4005 Series', '8C/16T',           3.8,           36144,        16,
   100,         100,
   '2 × 10GbE + 1 IPMI', 'RAID 0/1/5/6/10',   'Windows Server 2022 / 2025 IoT', '5yr NBD, Advanced Replacement', 'Milestone XProtect, Avigilon ACC, Genetec', 18139.00, null,        null),

  -- V400 family — AMD EPYC 9005 Series, 16C/32T, 3.3 GHz, Passmark 48936, 2U
  ('VX5-V400-128', 'VideoX V400 128TB 2U 8Bay', '2U Rackmount', 128,
   'AMD EPYC 9005 Series', '16C/32T',          3.3,           48936,        16,
   200,         200,
   '4 × 10GbE + 1 IPMI', 'RAID 0/1/5/6/10',   'Windows Server 2022 / 2025 IoT', '5yr NBD, Advanced Replacement', 'Milestone XProtect, Avigilon ACC, Genetec', 24975.00, null,        null),

  ('VX5-V400-160', 'VideoX V400 160TB 2U 8Bay', '2U Rackmount', 160,
   'AMD EPYC 9005 Series', '16C/32T',          3.3,           48936,        16,
   200,         200,
   '4 × 10GbE + 1 IPMI', 'RAID 0/1/5/6/10',   'Windows Server 2022 / 2025 IoT', '5yr NBD, Advanced Replacement', 'Milestone XProtect, Avigilon ACC, Genetec', 26910.00, null,        null),

  ('VX5-V400-192', 'VideoX V400 192TB 2U 8Bay', '2U Rackmount', 192,
   'AMD EPYC 9005 Series', '16C/32T',          3.3,           48936,        16,
   200,         200,
   '4 × 10GbE + 1 IPMI', 'RAID 0/1/5/6/10',   'Windows Server 2022 / 2025 IoT', '5yr NBD, Advanced Replacement', 'Milestone XProtect, Avigilon ACC, Genetec', 29861.00, null,        null),

  -- V500 family — AMD EPYC 9005 Series, 16C/32T, 3.3 GHz, Passmark 48936, 2U, 32GB RAM
  ('VX5-V500-192', 'VideoX V500 192TB 2U 12Bay', '2U Rackmount', 192,
   'AMD EPYC 9005 Series', '16C/32T',          3.3,           48936,        32,
   275,         275,
   '4 × 10GbE + 1 IPMI', 'RAID 0/1/5/6/10',   'Windows Server 2022 / 2025 IoT', '5yr NBD, Advanced Replacement', 'Milestone XProtect, Avigilon ACC, Genetec', 32978.00, null,        null),

  ('VX5-V500-240', 'VideoX V500 240TB 2U 12Bay', '2U Rackmount', 240,
   'AMD EPYC 9005 Series', '16C/32T',          3.3,           48936,        32,
   275,         275,
   '4 × 10GbE + 1 IPMI', 'RAID 0/1/5/6/10',   'Windows Server 2022 / 2025 IoT', '5yr NBD, Advanced Replacement', 'Milestone XProtect, Avigilon ACC, Genetec', 35926.00, null,        null),

  ('VX5-V500-288', 'VideoX V500 288TB 2U 12Bay', '2U Rackmount', 288,
   'AMD EPYC 9005 Series', '16C/32T',          3.3,           48936,        32,
   275,         275,
   '4 × 10GbE + 1 IPMI', 'RAID 0/1/5/6/10',   'Windows Server 2022 / 2025 IoT', '5yr NBD, Advanced Replacement', 'Milestone XProtect, Avigilon ACC, Genetec', 40425.00, null,        null),

  -- V600 family — AMD EPYC 9005 Series, 16C/32T, 3.3 GHz, Passmark 48936, 3U, 32GB RAM
  ('VX5-V600-256', 'VideoX V600 256TB 3U 16Bay', '3U Rackmount', 256,
   'AMD EPYC 9005 Series', '16C/32T',          3.3,           48936,        32,
   275,         275,
   '4 × 10GbE + 1 IPMI', 'RAID 0/1/5/6/10',   'Windows Server 2022 / 2025 IoT', '5yr NBD, Advanced Replacement', 'Milestone XProtect, Avigilon ACC, Genetec', 37728.00, null,        null),

  ('VX5-V600-320', 'VideoX V600 320TB 3U 16Bay', '3U Rackmount', 320,
   'AMD EPYC 9005 Series', '16C/32T',          3.3,           48936,        32,
   275,         275,
   '4 × 10GbE + 1 IPMI', 'RAID 0/1/5/6/10',   'Windows Server 2022 / 2025 IoT', '5yr NBD, Advanced Replacement', 'Milestone XProtect, Avigilon ACC, Genetec', 41659.00, null,        null),

  ('VX5-V600-384', 'VideoX V600 384TB 3U 16Bay', '3U Rackmount', 384,
   'AMD EPYC 9005 Series', '16C/32T',          3.3,           48936,        32,
   275,         275,
   '4 × 10GbE + 1 IPMI', 'RAID 0/1/5/6/10',   'Windows Server 2022 / 2025 IoT', '5yr NBD, Advanced Replacement', 'Milestone XProtect, Avigilon ACC, Genetec', 47657.00, null,        null),

  -- V700 family — AMD EPYC 9005 Series, 16C/32T, 4.3 GHz, Passmark 56984, 4U, 32GB RAM
  ('VX5-V700-384', 'VideoX V700 384TB 4U 24Bay', '4U Rackmount', 384,
   'AMD EPYC 9005 Series', '16C/32T',          4.3,           56984,        32,
   325,         325,
   '4 × 10GbE + 1 IPMI', 'RAID 0/1/5/6/10',   'Windows Server 2022 / 2025 IoT', '5yr NBD, Advanced Replacement', 'Milestone XProtect, Avigilon ACC, Genetec', 48615.00, null,        null),

  ('VX5-V700-480', 'VideoX V700 480TB 4U 24Bay', '4U Rackmount', 480,
   'AMD EPYC 9005 Series', '16C/32T',          4.3,           56984,        32,
   325,         325,
   '4 × 10GbE + 1 IPMI', 'RAID 0/1/5/6/10',   'Windows Server 2022 / 2025 IoT', '5yr NBD, Advanced Replacement', 'Milestone XProtect, Avigilon ACC, Genetec', 54512.00, null,        null),

  ('VX5-V700-576', 'VideoX V700 576TB 4U 24Bay', '4U Rackmount', 576,
   'AMD EPYC 9005 Series', '16C/32T',          4.3,           56984,        32,
   325,         325,
   '4 × 10GbE + 1 IPMI', 'RAID 0/1/5/6/10',   'Windows Server 2022 / 2025 IoT', '5yr NBD, Advanced Replacement', 'Milestone XProtect, Avigilon ACC, Genetec', 63509.00, null,        null),

  -- V800 family — AMD EPYC 9005 Series, 16C/32T, 4.3 GHz, Passmark 56984, 4U, 32GB RAM
  ('VX5-V800-576', 'VideoX V800 576TB 4U 36Bay', '4U Rackmount', 576,
   'AMD EPYC 9005 Series', '16C/32T',          4.3,           56984,        32,
   325,         325,
   '4 × 10GbE + 1 IPMI', 'RAID 0/1/5/6/10',   'Windows Server 2022 / 2025 IoT', '5yr NBD, Advanced Replacement', 'Milestone XProtect, Avigilon ACC, Genetec', 64922.00, null,        null),

  ('VX5-V800-720', 'VideoX V800 720TB 4U 36Bay', '4U Rackmount', 720,
   'AMD EPYC 9005 Series', '16C/32T',          4.3,           56984,        32,
   325,         325,
   '4 × 10GbE + 1 IPMI', 'RAID 0/1/5/6/10',   'Windows Server 2022 / 2025 IoT', '5yr NBD, Advanced Replacement', 'Milestone XProtect, Avigilon ACC, Genetec', 74048.00, null,        null),

  ('VX5-V800-864', 'VideoX V800 864TB 4U 36Bay', '4U Rackmount', 864,
   'AMD EPYC 9005 Series', '16C/32T',          4.3,           56984,        32,
   325,         325,
   '4 × 10GbE + 1 IPMI', 'RAID 0/1/5/6/10',   'Windows Server 2022 / 2025 IoT', '5yr NBD, Advanced Replacement', 'Milestone XProtect, Avigilon ACC, Genetec', 87971.00, null,        null);
