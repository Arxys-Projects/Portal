-- Phase — Genetec StreamVault + hw_platform column
--
-- 1. Adds the hw_platform column to competitor_products (Dell/HP OEM platform
--    the vendor rebadges — see ADR 0073). Nullable; competitor-only (Arxys
--    product_specs rows do not carry it).
-- 2. Extends the vendor CHECK constraint to allow 'genetec'.
-- 3. Upserts the canonical Milestone (14) and Avigilon (20) values — specs
--    changed: explicit CPU models, corrected base clocks (Milestone 1000/1800
--    2.1->2.0, Avigilon Premium/Premium Plus 2.8->2.0), and hw_platform.
-- 4. Inserts the 17 Genetec StreamVault models.
--
-- All writes use ON CONFLICT (id) DO UPDATE so the migration is idempotent and
-- re-runnable, and so it overwrites any pre-existing/stale Genetec rows
-- (lowercase vendor, integer max_cameras_h265 — never formula strings).
--
-- NOTE: the 3 SV-2041E-R4 rows were specified with arxys_match_id
-- 'VX5-V200-88', which does NOT exist in product_specs (valid neighbours:
-- VX5-V200-80 / VX5-V200-96). To satisfy the FK they are remapped to the
-- nearest existing higher tier, VX5-V200-96. See ADR 0074.

-- ---------------------------------------------------------------------------
-- 1. Schema: hw_platform column
-- ---------------------------------------------------------------------------
alter table public.competitor_products
  add column if not exists hw_platform text;

-- ---------------------------------------------------------------------------
-- 2. Schema: allow vendor = 'genetec'
-- ---------------------------------------------------------------------------
alter table public.competitor_products
  drop constraint if exists competitor_products_vendor_check;
alter table public.competitor_products
  add constraint competitor_products_vendor_check
  check (vendor in ('milestone', 'avigilon', 'genetec'));

-- ---------------------------------------------------------------------------
-- 3 & 4. Canonical data — upsert 14 Milestone + 20 Avigilon + 17 Genetec
--
-- Column order: id, vendor, brand_name, product_line, model_name, sku,
--   form_factor, hw_platform, storage_raw_tb, cpu_model, cpu_cores_threads,
--   cpu_base_ghz, cpu_passmark, ram_gb, max_cameras, max_cameras_h265,
--   network, raid_support, os, warranty, vms_certified, arxys_match_id,
--   msrp_current
-- ---------------------------------------------------------------------------
insert into public.competitor_products
  (id, vendor, brand_name, product_line, model_name, sku,
   form_factor, hw_platform, storage_raw_tb, cpu_model, cpu_cores_threads,
   cpu_base_ghz, cpu_passmark, ram_gb, max_cameras, max_cameras_h265,
   network, raid_support, os, warranty, vms_certified, arxys_match_id,
   msrp_current)
values
  -- =========================================================================
  -- Milestone Husky IVO — 14 rows
  -- vendor='milestone', brand='Milestone', line='Husky IVO',
  -- warranty='5yr NBD', vms_certified='Milestone XProtect only'
  -- =========================================================================

  -- Husky IVO 700 — Dell PowerEdge R360, 1U, Xeon E-2436 6C/12T 2.9GHz pm21708
  ('HE700R-16TB', 'milestone', 'Milestone', 'Husky IVO', 'Husky IVO 700 1U Rack', 'HE700R-16TB',
   '1U Rackmount', 'Dell PowerEdge R360', 16, 'Intel Xeon E-2436', '6C/12T',
   2.9, 21708, 32, 100, 50,
   '2 × 1GbE', 'RAID 5/6', 'Windows Server 2022 IoT', '5yr NBD', 'Milestone XProtect only', 'VX5-V200-64',
   24525.00),
  ('HE700R-32TB', 'milestone', 'Milestone', 'Husky IVO', 'Husky IVO 700 1U Rack', 'HE700R-32TB',
   '1U Rackmount', 'Dell PowerEdge R360', 32, 'Intel Xeon E-2436', '6C/12T',
   2.9, 21708, 32, 100, 50,
   '2 × 1GbE', 'RAID 5/6', 'Windows Server 2022 IoT', '5yr NBD', 'Milestone XProtect only', 'VX5-V200-64',
   25650.00),
  ('HE700R-48TB', 'milestone', 'Milestone', 'Husky IVO', 'Husky IVO 700 1U Rack', 'HE700R-48TB',
   '1U Rackmount', 'Dell PowerEdge R360', 48, 'Intel Xeon E-2436', '6C/12T',
   2.9, 21708, 32, 100, 50,
   '2 × 1GbE', 'RAID 5/6', 'Windows Server 2022 IoT', '5yr NBD', 'Milestone XProtect only', 'VX5-V200-64',
   27125.00),
  ('HE700R-64TB', 'milestone', 'Milestone', 'Husky IVO', 'Husky IVO 700 1U Rack', 'HE700R-64TB',
   '1U Rackmount', 'Dell PowerEdge R360', 64, 'Intel Xeon E-2436', '6C/12T',
   2.9, 21708, 32, 100, 50,
   '2 × 1GbE', 'RAID 5/6', 'Windows Server 2022 IoT', '5yr NBD', 'Milestone XProtect only', 'VX5-V200-80',
   28475.00),

  -- Husky IVO 1000 — Dell PowerEdge R760xs, 2U, Xeon Silver 4410Y 12C/24T 2.0GHz pm25136
  ('HE1000R-32TB', 'milestone', 'Milestone', 'Husky IVO', 'Husky IVO 1000 2U Rack', 'HE1000R-32TB',
   '2U Rackmount', 'Dell PowerEdge R760xs', 32, 'Intel Xeon Silver 4410Y', '12C/24T',
   2.0, 25136, 32, 150, 75,
   '6 × 1GbE + 1 × 1GbE Mgmt', 'RAID 5/6', 'Windows Server 2022 IoT', '5yr NBD', 'Milestone XProtect only', 'VX5-V400-128',
   33100.00),
  ('HE1000R-64TB', 'milestone', 'Milestone', 'Husky IVO', 'Husky IVO 1000 2U Rack', 'HE1000R-64TB',
   '2U Rackmount', 'Dell PowerEdge R760xs', 64, 'Intel Xeon Silver 4410Y', '12C/24T',
   2.0, 25136, 32, 150, 75,
   '6 × 1GbE + 1 × 1GbE Mgmt', 'RAID 5/6', 'Windows Server 2022 IoT', '5yr NBD', 'Milestone XProtect only', 'VX5-V400-128',
   35000.00),
  ('HE1000R-96TB', 'milestone', 'Milestone', 'Husky IVO', 'Husky IVO 1000 2U Rack', 'HE1000R-96TB',
   '2U Rackmount', 'Dell PowerEdge R760xs', 96, 'Intel Xeon Silver 4410Y', '12C/24T',
   2.0, 25136, 32, 150, 75,
   '6 × 1GbE + 1 × 1GbE Mgmt', 'RAID 5/6', 'Windows Server 2022 IoT', '5yr NBD', 'Milestone XProtect only', 'VX5-V400-128',
   38125.00),
  ('HE1000R-128TB', 'milestone', 'Milestone', 'Husky IVO', 'Husky IVO 1000 2U Rack', 'HE1000R-128TB',
   '2U Rackmount', 'Dell PowerEdge R760xs', 128, 'Intel Xeon Silver 4410Y', '12C/24T',
   2.0, 25136, 32, 150, 75,
   '6 × 1GbE + 1 × 1GbE Mgmt', 'RAID 5/6', 'Windows Server 2022 IoT', '5yr NBD', 'Milestone XProtect only', 'VX5-V400-160',
   40525.00),

  -- Husky IVO 1800 — Dell PowerEdge R760xd2, 2U, Xeon Silver 4410Y 12C/24T 2.0GHz pm25136
  ('HE1800R-48TB', 'milestone', 'Milestone', 'Husky IVO', 'Husky IVO 1800 2U Rack', 'HE1800R-48TB',
   '2U Rackmount', 'Dell PowerEdge R760xd2', 48, 'Intel Xeon Silver 4410Y', '12C/24T',
   2.0, 25136, 32, 250, 125,
   '6 × 1GbE + 1 × 1GbE Mgmt', 'RAID 5/6', 'Windows Server 2022', '5yr NBD', 'Milestone XProtect only', 'VX5-V500-192',
   43150.00),
  ('HE1800R-96TB', 'milestone', 'Milestone', 'Husky IVO', 'Husky IVO 1800 2U Rack', 'HE1800R-96TB',
   '2U Rackmount', 'Dell PowerEdge R760xd2', 96, 'Intel Xeon Silver 4410Y', '12C/24T',
   2.0, 25136, 32, 250, 125,
   '6 × 1GbE + 1 × 1GbE Mgmt', 'RAID 5/6', 'Windows Server 2022', '5yr NBD', 'Milestone XProtect only', 'VX5-V500-192',
   46025.00),
  ('HE1800R-144TB', 'milestone', 'Milestone', 'Husky IVO', 'Husky IVO 1800 2U Rack', 'HE1800R-144TB',
   '2U Rackmount', 'Dell PowerEdge R760xd2', 144, 'Intel Xeon Silver 4410Y', '12C/24T',
   2.0, 25136, 32, 250, 125,
   '6 × 1GbE + 1 × 1GbE Mgmt', 'RAID 5/6', 'Windows Server 2022', '5yr NBD', 'Milestone XProtect only', 'VX5-V500-192',
   49825.00),
  ('HE1800R-192TB', 'milestone', 'Milestone', 'Husky IVO', 'Husky IVO 1800 2U Rack', 'HE1800R-192TB',
   '2U Rackmount', 'Dell PowerEdge R760xd2', 192, 'Intel Xeon Silver 4410Y', '12C/24T',
   2.0, 25136, 32, 250, 125,
   '6 × 1GbE + 1 × 1GbE Mgmt', 'RAID 5/6', 'Windows Server 2022', '5yr NBD', 'Milestone XProtect only', 'VX5-V500-240',
   53275.00),
  ('HE1800R-288TB', 'milestone', 'Milestone', 'Husky IVO', 'Husky IVO 1800 2U Rack', 'HE1800R-288TB',
   '2U Rackmount', 'Dell PowerEdge R760xd2', 288, 'Intel Xeon Silver 4410Y', '12C/24T',
   2.0, 25136, 32, 250, 125,
   '6 × 1GbE + 1 × 1GbE Mgmt', 'RAID 5/6', 'Windows Server 2022', '5yr NBD', 'Milestone XProtect only', 'VX5-V600-320',
   64700.00),
  ('HE1800R-384TB', 'milestone', 'Milestone', 'Husky IVO', 'Husky IVO 1800 2U Rack', 'HE1800R-384TB',
   '2U Rackmount', 'Dell PowerEdge R760xd2', 384, 'Intel Xeon Silver 4410Y', '12C/24T',
   2.0, 25136, 32, 250, 125,
   '6 × 1GbE + 1 × 1GbE Mgmt', 'RAID 5/6', 'Windows Server 2022', '5yr NBD', 'Milestone XProtect only', 'VX5-V600-384',
   72925.00),

  -- =========================================================================
  -- Avigilon NVR6 — 20 rows. msrp_current = NULL (pricing not published).
  -- vendor='avigilon', brand='Avigilon', line='NVR6',
  -- warranty='5yr NBD', vms_certified='Avigilon only', raid='RAID 5/6'
  -- =========================================================================

  -- NVR6 Standard — Dell PowerEdge R760, Xeon Silver 4410Y 12C/24T 2.0GHz pm25136
  -- Windows Server 2022 variants
  ('NVR6-STD-FORM-D-16TB-S22', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Standard 16TB (Server 2022)', 'NVR6-STD-FORM-D-16TB-S22',
   '2U Rackmount', 'Dell PowerEdge R760', 16, 'Intel Xeon Silver 4410Y', '12C/24T',
   2.0, 25136, 32, 120, 70,
   '6 × 1GbE', 'RAID 5/6', 'Windows Server 2022', '5yr NBD', 'Avigilon only', 'VX5-V500-192',
   null),
  ('NVR6-STD-FORM-D-24TB-S22', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Standard 24TB (Server 2022)', 'NVR6-STD-FORM-D-24TB-S22',
   '2U Rackmount', 'Dell PowerEdge R760', 24, 'Intel Xeon Silver 4410Y', '12C/24T',
   2.0, 25136, 32, 120, 70,
   '6 × 1GbE', 'RAID 5/6', 'Windows Server 2022', '5yr NBD', 'Avigilon only', 'VX5-V500-192',
   null),
  ('NVR6-STD-FORM-D-32TB-S22', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Standard 32TB (Server 2022)', 'NVR6-STD-FORM-D-32TB-S22',
   '2U Rackmount', 'Dell PowerEdge R760', 32, 'Intel Xeon Silver 4410Y', '12C/24T',
   2.0, 25136, 32, 120, 70,
   '6 × 1GbE', 'RAID 5/6', 'Windows Server 2022', '5yr NBD', 'Avigilon only', 'VX5-V500-192',
   null),
  ('NVR6-STD-FORM-D-48TB-S22', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Standard 48TB (Server 2022)', 'NVR6-STD-FORM-D-48TB-S22',
   '2U Rackmount', 'Dell PowerEdge R760', 48, 'Intel Xeon Silver 4410Y', '12C/24T',
   2.0, 25136, 32, 120, 70,
   '6 × 1GbE', 'RAID 5/6', 'Windows Server 2022', '5yr NBD', 'Avigilon only', 'VX5-V500-192',
   null),
  ('NVR6-STD-FORM-D-64TB-S22', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Standard 64TB (Server 2022)', 'NVR6-STD-FORM-D-64TB-S22',
   '2U Rackmount', 'Dell PowerEdge R760', 64, 'Intel Xeon Silver 4410Y', '12C/24T',
   2.0, 25136, 32, 120, 70,
   '6 × 1GbE', 'RAID 5/6', 'Windows Server 2022', '5yr NBD', 'Avigilon only', 'VX5-V500-192',
   null),
  -- Windows 11 Desktop (IoT) variants
  ('NVR6-STD-FORM-D-16TB-W10', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Standard 16TB (Win IoT)', 'NVR6-STD-FORM-D-16TB-W10',
   '2U Rackmount', 'Dell PowerEdge R760', 16, 'Intel Xeon Silver 4410Y', '12C/24T',
   2.0, 25136, 32, 120, 70,
   '6 × 1GbE', 'RAID 5/6', 'Windows 11 Desktop', '5yr NBD', 'Avigilon only', 'VX5-V500-192',
   null),
  ('NVR6-STD-FORM-D-24TB-W10', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Standard 24TB (Win IoT)', 'NVR6-STD-FORM-D-24TB-W10',
   '2U Rackmount', 'Dell PowerEdge R760', 24, 'Intel Xeon Silver 4410Y', '12C/24T',
   2.0, 25136, 32, 120, 70,
   '6 × 1GbE', 'RAID 5/6', 'Windows 11 Desktop', '5yr NBD', 'Avigilon only', 'VX5-V500-192',
   null),
  ('NVR6-STD-FORM-D-32TB-W10', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Standard 32TB (Win IoT)', 'NVR6-STD-FORM-D-32TB-W10',
   '2U Rackmount', 'Dell PowerEdge R760', 32, 'Intel Xeon Silver 4410Y', '12C/24T',
   2.0, 25136, 32, 120, 70,
   '6 × 1GbE', 'RAID 5/6', 'Windows 11 Desktop', '5yr NBD', 'Avigilon only', 'VX5-V500-192',
   null),
  ('NVR6-STD-FORM-D-48TB-W10', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Standard 48TB (Win IoT)', 'NVR6-STD-FORM-D-48TB-W10',
   '2U Rackmount', 'Dell PowerEdge R760', 48, 'Intel Xeon Silver 4410Y', '12C/24T',
   2.0, 25136, 32, 120, 70,
   '6 × 1GbE', 'RAID 5/6', 'Windows 11 Desktop', '5yr NBD', 'Avigilon only', 'VX5-V500-192',
   null),
  ('NVR6-STD-FORM-D-64TB-W10', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Standard 64TB (Win IoT)', 'NVR6-STD-FORM-D-64TB-W10',
   '2U Rackmount', 'Dell PowerEdge R760', 64, 'Intel Xeon Silver 4410Y', '12C/24T',
   2.0, 25136, 32, 120, 70,
   '6 × 1GbE', 'RAID 5/6', 'Windows 11 Desktop', '5yr NBD', 'Avigilon only', 'VX5-V500-192',
   null),

  -- NVR6 Premium — Dell PowerEdge R760, dual Xeon Silver 4410Y 24C/48T 2.0GHz pm42443, 64GB
  ('NVR6-PRM-FORM-D-72TB-S22', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Premium 72TB', 'NVR6-PRM-FORM-D-72TB-S22',
   '2U Rackmount', 'Dell PowerEdge R760', 72, 'Intel Xeon Silver 4410Y (dual)', '24C/48T',
   2.0, 42443, 64, 200, 120,
   '4 × 10GbE + 4 × 1GbE', 'RAID 5/6', 'Windows Server 2022', '5yr NBD', 'Avigilon only', 'VX5-V500-192',
   null),
  ('NVR6-PRM-FORM-D-96TB-S22', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Premium 96TB', 'NVR6-PRM-FORM-D-96TB-S22',
   '2U Rackmount', 'Dell PowerEdge R760', 96, 'Intel Xeon Silver 4410Y (dual)', '24C/48T',
   2.0, 42443, 64, 200, 120,
   '4 × 10GbE + 6 × 1GbE', 'RAID 5/6', 'Windows Server 2022', '5yr NBD', 'Avigilon only', 'VX5-V500-192',
   null),
  ('NVR6-PRM-FORM-D-120TB-S22', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Premium 120TB', 'NVR6-PRM-FORM-D-120TB-S22',
   '2U Rackmount', 'Dell PowerEdge R760', 120, 'Intel Xeon Silver 4410Y (dual)', '24C/48T',
   2.0, 42443, 64, 200, 120,
   '4 × 10GbE + 6 × 1GbE', 'RAID 5/6', 'Windows Server 2022', '5yr NBD', 'Avigilon only', 'VX5-V500-192',
   null),
  ('NVR6-PRM-FORM-D-160TB-S22', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Premium 160TB', 'NVR6-PRM-FORM-D-160TB-S22',
   '2U Rackmount', 'Dell PowerEdge R760', 160, 'Intel Xeon Silver 4410Y (dual)', '24C/48T',
   2.0, 42443, 64, 200, 120,
   '4 × 10GbE + 6 × 1GbE', 'RAID 5/6', 'Windows Server 2022', '5yr NBD', 'Avigilon only', 'VX5-V500-288',
   null),
  ('NVR6-PRM-FORM-D-200TB-S22', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Premium 200TB', 'NVR6-PRM-FORM-D-200TB-S22',
   '2U Rackmount', 'Dell PowerEdge R760', 200, 'Intel Xeon Silver 4410Y (dual)', '24C/48T',
   2.0, 42443, 64, 200, 120,
   '4 × 10GbE + 6 × 1GbE', 'RAID 5/6', 'Windows Server 2022', '5yr NBD', 'Avigilon only', 'VX5-V500-288',
   null),

  -- NVR6 Premium Plus — HPE Apollo 4200 Gen10 Plus, dual Xeon Silver 4410Y 24C/48T 2.0GHz pm42443, 128GB
  ('NVR6-PRM-PLUS-FORM-H-200TB-S22', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Premium Plus 200TB', 'NVR6-PRM-PLUS-FORM-H-200TB-S22',
   '2U Rackmount', 'HPE Apollo 4200 Gen10 Plus', 200, 'Intel Xeon Silver 4410Y (dual)', '24C/48T',
   2.0, 42443, 128, 220, 130,
   '4 × 10GbE + 4 × 1GbE', 'RAID 5/6', 'Windows Server 2022', '5yr NBD', 'Avigilon only', 'VX5-V700-384',
   null),
  ('NVR6-PRM-PLUS-FORM-H-240TB-S22', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Premium Plus 240TB', 'NVR6-PRM-PLUS-FORM-H-240TB-S22',
   '2U Rackmount', 'HPE Apollo 4200 Gen10 Plus', 240, 'Intel Xeon Silver 4410Y (dual)', '24C/48T',
   2.0, 42443, 128, 220, 130,
   '4 × 10GbE + 4 × 1GbE', 'RAID 5/6', 'Windows Server 2022', '5yr NBD', 'Avigilon only', 'VX5-V700-384',
   null),
  ('NVR6-PRM-PLUS-FORM-H-280TB-S22', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Premium Plus 280TB', 'NVR6-PRM-PLUS-FORM-H-280TB-S22',
   '2U Rackmount', 'HPE Apollo 4200 Gen10 Plus', 280, 'Intel Xeon Silver 4410Y (dual)', '24C/48T',
   2.0, 42443, 128, 220, 130,
   '4 × 10GbE + 4 × 1GbE', 'RAID 5/6', 'Windows Server 2022', '5yr NBD', 'Avigilon only', 'VX5-V700-384',
   null),
  ('NVR6-PRM-PLUS-FORM-H-360TB-S22', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Premium Plus 360TB', 'NVR6-PRM-PLUS-FORM-H-360TB-S22',
   '2U Rackmount', 'HPE Apollo 4200 Gen10 Plus', 360, 'Intel Xeon Silver 4410Y (dual)', '24C/48T',
   2.0, 42443, 128, 220, 130,
   '4 × 10GbE + 4 × 1GbE', 'RAID 5/6', 'Windows Server 2022', '5yr NBD', 'Avigilon only', 'VX5-V700-480',
   null),
  ('NVR6-PRM-PLUS-FORM-H-440TB-S22', 'avigilon', 'Avigilon', 'NVR6', 'NVR6 Premium Plus 440TB', 'NVR6-PRM-PLUS-FORM-H-440TB-S22',
   '2U Rackmount', 'HPE Apollo 4200 Gen10 Plus', 440, 'Intel Xeon Silver 4410Y (dual)', '24C/48T',
   2.0, 42443, 128, 220, 130,
   '4 × 10GbE + 4 × 1GbE', 'RAID 5/6', 'Windows Server 2022', '5yr NBD', 'Avigilon only', 'VX5-V700-576',
   null),

  -- =========================================================================
  -- Genetec StreamVault — 17 rows. msrp_current = NULL.
  -- vendor='genetec' (lowercase), brand='Genetec', line='StreamVault',
  -- warranty='5yr NBD', vms_certified='Genetec Only'
  -- max_cameras_h265 are resolved integers (never formula strings).
  -- =========================================================================

  -- SV-1041E-RS2 — Dell PowerEdge R260 OEMR, 1U, Xeon E-2434 4C/8T 3.4GHz pm15228, 16GB
  ('SV-1041E-RS2-8TB', 'genetec', 'Genetec', 'StreamVault', 'StreamVault SV-1041E-RS2', 'SV-1041E-RS2-8TB',
   '1U Rackmount', 'Dell PowerEdge R260 OEMR', 8, 'Intel Xeon E-2434', '4C/8T',
   3.4, 15228, 16, 200, 160,
   '2x 1GbE RJ45', 'JBOD (No RAID)', 'Windows Server 2025 Standard IoT', '5yr NBD', 'Genetec Only', 'VX5-V200-64',
   null),
  ('SV-1041E-RS2-16TB', 'genetec', 'Genetec', 'StreamVault', 'StreamVault SV-1041E-RS2', 'SV-1041E-RS2-16TB',
   '1U Rackmount', 'Dell PowerEdge R260 OEMR', 16, 'Intel Xeon E-2434', '4C/8T',
   3.4, 15228, 16, 200, 160,
   '2x 1GbE RJ45', 'JBOD (No RAID)', 'Windows Server 2025 Standard IoT', '5yr NBD', 'Genetec Only', 'VX5-V200-64',
   null),
  ('SV-1041E-RS2-32TB', 'genetec', 'Genetec', 'StreamVault', 'StreamVault SV-1041E-RS2', 'SV-1041E-RS2-32TB',
   '1U Rackmount', 'Dell PowerEdge R260 OEMR', 32, 'Intel Xeon E-2434', '4C/8T',
   3.4, 15228, 16, 200, 160,
   '2x 1GbE RJ45', 'JBOD (No RAID)', 'Windows Server 2025 Standard IoT', '5yr NBD', 'Genetec Only', 'VX5-V200-64',
   null),

  -- SV-2041E-R4 — Dell PowerEdge R360, 1U, Xeon E-2436 6C/12T 2.9GHz pm21635, 32GB
  -- arxys_match_id remapped VX5-V200-88 -> VX5-V200-96 (see ADR 0074)
  ('SV-2041E-R4-36TB', 'genetec', 'Genetec', 'StreamVault', 'StreamVault SV-2041E-R4', 'SV-2041E-R4-36TB',
   '1U Rackmount', 'Dell PowerEdge R360', 36, 'Intel Xeon E-2436', '6C/12T',
   2.9, 21635, 32, 300, 240,
   '2x 1GbE RJ45', 'RAID 5', 'Windows Server 2025 Standard IoT', '5yr NBD', 'Genetec Only', 'VX5-V200-96',
   null),
  ('SV-2041E-R4-48TB', 'genetec', 'Genetec', 'StreamVault', 'StreamVault SV-2041E-R4', 'SV-2041E-R4-48TB',
   '1U Rackmount', 'Dell PowerEdge R360', 48, 'Intel Xeon E-2436', '6C/12T',
   2.9, 21635, 32, 300, 240,
   '2x 1GbE RJ45', 'RAID 5', 'Windows Server 2025 Standard IoT', '5yr NBD', 'Genetec Only', 'VX5-V200-96',
   null),
  ('SV-2041E-R4-64TB', 'genetec', 'Genetec', 'StreamVault', 'StreamVault SV-2041E-R4', 'SV-2041E-R4-64TB',
   '1U Rackmount', 'Dell PowerEdge R360', 64, 'Intel Xeon E-2436', '6C/12T',
   2.9, 21635, 32, 300, 240,
   '2x 1GbE RJ45', 'RAID 5', 'Windows Server 2025 Standard IoT', '5yr NBD', 'Genetec Only', 'VX5-V200-96',
   null),

  -- SV-2041E-R15 — Dell PowerEdge R760xs XL, 2U, Xeon Silver 4416+ 20C/40T 2.0GHz pm43659, 32GB
  ('SV-2041E-R15-72TB', 'genetec', 'Genetec', 'StreamVault', 'StreamVault SV-2041E-R15', 'SV-2041E-R15-72TB',
   '2U Rackmount', 'Dell PowerEdge R760xs XL', 72, 'Intel Xeon Silver 4416+', '20C/40T',
   2.0, 43659, 32, 800, 640,
   '2x 1GbE RJ45, 2x 10/25GbE SFP28', 'RAID 5/6', 'Windows Server 2025 Standard IoT', '5yr NBD', 'Genetec Only', 'VX5-V400-128',
   null),
  ('SV-2041E-R15-144TB', 'genetec', 'Genetec', 'StreamVault', 'StreamVault SV-2041E-R15', 'SV-2041E-R15-144TB',
   '2U Rackmount', 'Dell PowerEdge R760xs XL', 144, 'Intel Xeon Silver 4416+', '20C/40T',
   2.0, 43659, 32, 800, 640,
   '2x 1GbE RJ45, 2x 10/25GbE SFP28', 'RAID 5/6', 'Windows Server 2025 Standard IoT', '5yr NBD', 'Genetec Only', 'VX5-V500-240',
   null),
  ('SV-2041E-R15-216TB', 'genetec', 'Genetec', 'StreamVault', 'StreamVault SV-2041E-R15', 'SV-2041E-R15-216TB',
   '2U Rackmount', 'Dell PowerEdge R760xs XL', 216, 'Intel Xeon Silver 4416+', '20C/40T',
   2.0, 43659, 32, 800, 640,
   '2x 1GbE RJ45, 2x 10/25GbE SFP28', 'RAID 5/6', 'Windows Server 2025 Standard IoT', '5yr NBD', 'Genetec Only', 'VX5-V500-288',
   null),
  ('SV-2041E-R15-288TB', 'genetec', 'Genetec', 'StreamVault', 'StreamVault SV-2041E-R15', 'SV-2041E-R15-288TB',
   '2U Rackmount', 'Dell PowerEdge R760xs XL', 288, 'Intel Xeon Silver 4416+', '20C/40T',
   2.0, 43659, 32, 800, 640,
   '2x 1GbE RJ45, 2x 10/25GbE SFP28', 'RAID 5/6', 'Windows Server 2025 Standard IoT', '5yr NBD', 'Genetec Only', 'VX5-V700-384',
   null),
  ('SV-2041E-R15-360TB', 'genetec', 'Genetec', 'StreamVault', 'StreamVault SV-2041E-R15', 'SV-2041E-R15-360TB',
   '2U Rackmount', 'Dell PowerEdge R760xs XL', 360, 'Intel Xeon Silver 4416+', '20C/40T',
   2.0, 43659, 32, 800, 640,
   '2x 1GbE RJ45, 2x 10/25GbE SFP28', 'RAID 5/6', 'Windows Server 2025 Standard IoT', '5yr NBD', 'Genetec Only', 'VX5-V700-384',
   null),

  -- SV-4041EX-R28 — Dell PowerEdge R760xd2 OEMR, 2U, 2x Xeon Gold 5416S 16C/32T per CPU 2.0GHz pm53750, 64GB
  ('SV-4041EX-R28-320TB', 'genetec', 'Genetec', 'StreamVault', 'StreamVault SV-4041EX-R28', 'SV-4041EX-R28-320TB',
   '2U Rackmount', 'Dell PowerEdge R760xd2 OEMR', 320, '2× Intel Xeon Gold 5416S', '16C/32T per CPU',
   2.0, 53750, 64, 1050, 840,
   '2x 1GbE RJ45, 2x 10/25GbE SFP28', 'RAID 6/60', 'Windows Server 2025 Standard IoT', '5yr NBD', 'Genetec Only', 'VX5-V700-480',
   null),
  ('SV-4041EX-R28-368TB', 'genetec', 'Genetec', 'StreamVault', 'StreamVault SV-4041EX-R28', 'SV-4041EX-R28-368TB',
   '2U Rackmount', 'Dell PowerEdge R760xd2 OEMR', 368, '2× Intel Xeon Gold 5416S', '16C/32T per CPU',
   2.0, 53750, 64, 1050, 840,
   '2x 1GbE RJ45, 2x 10/25GbE SFP28', 'RAID 6/60', 'Windows Server 2025 Standard IoT', '5yr NBD', 'Genetec Only', 'VX5-V700-480',
   null),
  ('SV-4041EX-R28-416TB', 'genetec', 'Genetec', 'StreamVault', 'StreamVault SV-4041EX-R28', 'SV-4041EX-R28-416TB',
   '2U Rackmount', 'Dell PowerEdge R760xd2 OEMR', 416, '2× Intel Xeon Gold 5416S', '16C/32T per CPU',
   2.0, 53750, 64, 1050, 840,
   '2x 1GbE RJ45, 2x 10/25GbE SFP28', 'RAID 6/60', 'Windows Server 2025 Standard IoT', '5yr NBD', 'Genetec Only', 'VX5-V800-576',
   null),
  ('SV-4041EX-R28-480TB', 'genetec', 'Genetec', 'StreamVault', 'StreamVault SV-4041EX-R28', 'SV-4041EX-R28-480TB',
   '2U Rackmount', 'Dell PowerEdge R760xd2 OEMR', 480, '2× Intel Xeon Gold 5416S', '16C/32T per CPU',
   2.0, 53750, 64, 1050, 840,
   '2x 1GbE RJ45, 2x 10/25GbE SFP28', 'RAID 6/60', 'Windows Server 2025 Standard IoT', '5yr NBD', 'Genetec Only', 'VX5-V800-576',
   null),
  ('SV-4041EX-R28-560TB', 'genetec', 'Genetec', 'StreamVault', 'StreamVault SV-4041EX-R28', 'SV-4041EX-R28-560TB',
   '2U Rackmount', 'Dell PowerEdge R760xd2 OEMR', 560, '2× Intel Xeon Gold 5416S', '16C/32T per CPU',
   2.0, 53750, 64, 1050, 840,
   '2x 1GbE RJ45, 2x 10/25GbE SFP28', 'RAID 6/60', 'Windows Server 2025 Standard IoT', '5yr NBD', 'Genetec Only', 'VX5-V800-720',
   null),
  ('SV-4041EX-R28-672TB', 'genetec', 'Genetec', 'StreamVault', 'StreamVault SV-4041EX-R28', 'SV-4041EX-R28-672TB',
   '2U Rackmount', 'Dell PowerEdge R760xd2 OEMR', 672, '2× Intel Xeon Gold 5416S', '16C/32T per CPU',
   2.0, 53750, 64, 1050, 840,
   '2x 1GbE RJ45, 2x 10/25GbE SFP28', 'RAID 6/60', 'Windows Server 2025 Standard IoT', '5yr NBD', 'Genetec Only', 'VX5-V800-720',
   null)

on conflict (id) do update set
  vendor            = excluded.vendor,
  brand_name        = excluded.brand_name,
  product_line      = excluded.product_line,
  model_name        = excluded.model_name,
  sku               = excluded.sku,
  form_factor       = excluded.form_factor,
  hw_platform       = excluded.hw_platform,
  storage_raw_tb    = excluded.storage_raw_tb,
  cpu_model         = excluded.cpu_model,
  cpu_cores_threads = excluded.cpu_cores_threads,
  cpu_base_ghz      = excluded.cpu_base_ghz,
  cpu_passmark      = excluded.cpu_passmark,
  ram_gb            = excluded.ram_gb,
  max_cameras       = excluded.max_cameras,
  max_cameras_h265  = excluded.max_cameras_h265,
  network           = excluded.network,
  raid_support      = excluded.raid_support,
  os                = excluded.os,
  warranty          = excluded.warranty,
  vms_certified     = excluded.vms_certified,
  arxys_match_id    = excluded.arxys_match_id,
  msrp_current      = excluded.msrp_current;
