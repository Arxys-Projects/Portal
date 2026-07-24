-- Datasheet automation — Phase 1 Step 1: appliance_specs companion table
--
-- Hardware specs for the management / ACM / workstation archetypes that
-- product_specs does NOT cover. product_specs is rack-video-only and is left
-- exactly as-is: its storage_raw_tb / max_cameras / max_cameras_h265 columns are
-- NOT NULL CHECK (> 0), which structurally rejects a no-storage/no-camera
-- management or directory server. Rather than relax those constraints (which the
-- calculator + comparison tool depend on), the non-video archetypes get their
-- own table — the same call camera_specs made (new reference table, not a
-- widened existing one). See ADR 0090 and the Phase 0 audit (JOURNAL 2026-07-23).
--
-- Mirrors the camera_specs / product_specs reference-table pattern:
--   * text primary key = the SKU (matches product_specs.id, e.g. 'VX5-V250-MGM')
--   * RLS SELECT open to authenticated; INSERT/UPDATE/DELETE admin-only
--   * NO created_at / updated_at — the sibling reference tables (product_specs,
--     camera_specs) carry neither; rows are refreshed by a reviewed admin seed
--     load, not edited row-by-row in the app.
--
-- Intended population (seeded in a LATER content phase, NOT here — this migration
-- creates the shape only):
--   VX5-V150-ACM  family_type acm         sheet_group 'V150'
--   VX5-V250-MGM  family_type management  sheet_group 'V250'  ┐ same physical
--   VX5-V255-MGM  family_type management  sheet_group 'V250'  ┘ datasheet
--   VX5-V260-ACM  family_type acm         sheet_group 'V260'  ┐ same physical
--   VX5-V265-ACM  family_type acm         sheet_group 'V260'  ┘ datasheet
--   VX5-SW10-100  family_type workstation sheet_group 'SW10'
--   VX5-SW20-200  family_type workstation sheet_group 'SW20'
-- (SKU ids taken from src/lib/price-book/families.ts skuExtraData keys.)
-- family_type of V150 ('Value Management Server', but branded "ACM") is a
-- seed-time judgment — flagged in the JOURNAL; classified acm here on the
-- access-control branding, override at seed time if management fits better.

create table public.appliance_specs (
  -- ── Identity & discriminator ──────────────────────────────────────────────
  id                text primary key,            -- = SKU, matches product_specs.id shape
  model_name        text not null,               -- e.g. 'VideoX V250 Management Server'
  product_group     text not null,               -- e.g. 'V250' — joins to families.ts productGroups
  family_type       text not null
                      check (family_type in ('management', 'acm', 'workstation')),

  -- sheet_group groups the SKUs that render on ONE physical two-page datasheet.
  -- TWO-CPU-VARIANT DECISION (ADR 0090): V250/V255 differ only in CPU + RAM and
  -- share one factsheet; V260/V265 likewise. Represented as TWO ROWS (one per
  -- SKU) sharing a sheet_group, NOT one row with paired cpu_a_* / cpu_b_* columns.
  -- Rationale:
  --   * one-row-per-SKU matches product_specs (each tier is its own row) and
  --     keeps the SKU→price join to current_products identical for both tables;
  --   * paired-column would strand nullable cpu_b_* on every single-variant
  --     sheet (V150, SW10, SW20 — and pricing needs a row per SKU regardless);
  --   * the template renders one datasheet per distinct sheet_group and lays the
  --     grouped rows out as CPU/RAM variant columns.
  -- Single-SKU sheets set sheet_group to their own group (e.g. 'V150', 'SW10').
  sheet_group       text not null,

  -- ── Compute ───────────────────────────────────────────────────────────────
  cpu_model         text not null,               -- detailed string, cf. product_specs.cpu_model_full
  cores_threads     text,                        -- e.g. '8C/16T' — name matches product_specs.cores_threads
  cpu_cache         text,
  cpu_base_ghz      text,                         -- text (vs product_specs numeric) to allow ranges
  cpu_turbo_ghz     text,
  ram_spec          text not null,               -- e.g. '16–32GB DDR5 ECC'

  -- ── OS / storage ──────────────────────────────────────────────────────────
  os_edition        text not null,
  -- Storage is NULLABLE and NA-capable by design: the V250 management server has
  -- no HDD array. There is deliberately NO numeric storage_raw_tb here (that is
  -- exactly the product_specs column that blocks these SKUs). Storage on these
  -- archetypes is described qualitatively (SSD config), so it lives in text:
  storage_summary   text,                         -- nullable; may literally hold 'NA'
  os_drive_desc     text,                         -- VMS/OS drive description
  db_drive_desc     text,                         -- DB drive (management/ACM); null on workstations
  drive_bays        integer,                      -- nullable; matches product_specs.drive_bays

  -- ── High-availability feature-block substitution surface ──────────────────
  -- (Task 3) Same column NAMES as product_specs' QuickCompare columns so the
  -- shared "High Data Availability" / "Flexible Storage" feature blocks read one
  -- substitution surface across both tables. Drive-failure tolerance is NOT a
  -- column: it is a pure function of raid_level_display + drive count, so it is
  -- derived in the template rather than stored (avoids drift).
  raid_level_display text,                        -- nullable; workstations have no array
  battery_raid       text,                        -- cachevault / battery-backed write cache presence ('YES'/'NO')
  os_redundancy      text,
  hotswap_power      text,

  -- ── Networking / management ───────────────────────────────────────────────
  network           text,                         -- full descriptor (cf. product_specs.network)
  gbe_1_ports       integer,
  gbe_10_ports      integer,
  sfp_addon         text,                         -- matches product_specs.sfp_addon
  remote_mgmt       text,                         -- e.g. '1× Dedicated IPMI 2.0 out-of-band port'
  display_ports     text,                         -- display outputs description

  -- ── Form factor ───────────────────────────────────────────────────────────
  form_factor       text not null,
  rack_units        text,                         -- nullable — tower workstations have none

  -- ── Power ─────────────────────────────────────────────────────────────────
  power_wattage     text,                         -- text to allow '2× 800W'
  power_redundancy  text,                         -- e.g. '2× hot-swap redundant' / 'single'
  power_ac_input    text,                         -- e.g. '100–240V AC, 50/60 Hz'
  power_dc_input    text,                         -- OPTIONAL second input — only the V250 sheet lists DC alongside AC; null elsewhere

  -- ── Physical ──────────────────────────────────────────────────────────────
  -- Stored as two display strings, one per unit system, NOT six per-axis
  -- numerics (ADR 0090): the only consumer is the datasheet renderer, which
  -- prints both unit systems verbatim; nothing sorts/filters on dimensions, and
  -- two strings can't drift out of unit-agreement the way paired numerics can.
  dimensions_mm     text,                         -- e.g. '437 W × 647 D × 44 H mm'
  dimensions_in     text,                         -- e.g. '17.2 W × 25.5 D × 1.7 H in'
  shipping_weight   text,                         -- e.g. '18 kg (39.7 lb)'

  -- ── Warranty / support ────────────────────────────────────────────────────
  warranty_years    integer,                      -- servers 5, workstations 3
  warranty_terms    text,                         -- e.g. 'NBD advanced parts replacement, self-repair'

  -- ── Environmental (varies per SKU — never hardcoded in the template) ───────
  operating_temp    text,
  storage_temp      text,
  humidity          text,

  -- ── Regulatory / compliance (varies per SKU) ──────────────────────────────
  regulatory_safety    text,                      -- e.g. 'UL 62368-1, CE, UKCA'
  regulatory_emissions text,                      -- EMC/emissions e.g. 'FCC Part 15 Class A/B, RCM, BSMI, Energy Star'
  ndaa_text            text,                      -- NDAA disclosure prose
  security_features    text[] not null default '{}',  -- SEV / SME / Secure Boot / signed firmware … (text[] cf. camera_specs.model_aliases)

  -- ── Workstation-only (all nullable; family_type='workstation' template block)
  gpu_model         text,
  gpu_count         integer,                      -- 1 or 2 GPUs on one sheet
  gpu_vram          text,                         -- e.g. '16GB GDDR6'
  gpu_cuda_cores    integer,
  gpu_tensor_cores  integer,
  gpu_rt_cores      integer,
  gpu_encoders      integer,                      -- NVENC count
  gpu_decoders      integer,                      -- NVDEC count
  monitor_support   text,                         -- e.g. 'Up to 8× via 2× GPU'
  front_io          text,
  rear_io           text,
  -- camera_matrix: the 4-row resolution/codec/FPS/camera-count/bandwidth table
  -- on the workstation sheets. JSONB, NOT a child table (ADR 0090): 4 rows × 2
  -- workstation SKUs = 8 rows total, always read as a whole with the parent row,
  -- never queried across sheets — a child table would add a second RLS surface
  -- and a join for no gain. Same call as camera_specs.sensor_detail (jsonb).
  -- Expected shape (array, in display order):
  --   [ { "resolution": "1080p", "codec": "H.265", "fps": 30,
  --       "cameras": 64, "bandwidth_mbps": 256 }, … 4 rows … ]
  camera_matrix     jsonb,

  -- ── Meta ──────────────────────────────────────────────────────────────────
  revision_date     date,                         -- datasheet revision / as-of date (cf. camera_specs.as_of_date)
  notes             text
);

-- Small reference table (~7 rows), read by exact SKU or grouped by sheet_group /
-- family_type. Indexes are cheap and mirror product_specs.form_factor_idx.
create index appliance_specs_family_type_idx on public.appliance_specs(family_type);
create index appliance_specs_sheet_group_idx on public.appliance_specs(sheet_group);

-- ---------------------------------------------------------------------------
-- RLS — SELECT open to authenticated (mirrors product_specs_select_all /
-- camera_specs_select_all); INSERT / UPDATE / DELETE admin-only. auth.uid() is
-- wrapped as a scalar subquery per the 2026-06-15 InitPlan consolidation
-- (ADR 0055), matching camera_specs.
-- ---------------------------------------------------------------------------

alter table public.appliance_specs enable row level security;
revoke all on public.appliance_specs from anon, authenticated;
grant select, insert, update, delete on public.appliance_specs to authenticated;

create policy appliance_specs_select_all
on public.appliance_specs for select
to authenticated
using (true);

create policy appliance_specs_insert_admin
on public.appliance_specs for insert
to authenticated
with check (public.is_admin((select auth.uid())));

create policy appliance_specs_update_admin
on public.appliance_specs for update
to authenticated
using (public.is_admin((select auth.uid())))
with check (public.is_admin((select auth.uid())));

create policy appliance_specs_delete_admin
on public.appliance_specs for delete
to authenticated
using (public.is_admin((select auth.uid())));
