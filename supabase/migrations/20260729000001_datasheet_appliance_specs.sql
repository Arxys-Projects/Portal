-- Datasheet automation — appliance_specs companion table, admin-editable
--
-- STOP-AND-FLAG. Creates a table with RLS policies, so it is security-sensitive
-- and applied by hand via the Supabase dashboard SQL editor per the ADR 0083 /
-- 0089 convention (the CLI is unauthenticated in the agent environment).
-- Paired rollback: supabase/rollback/datasheet-appliance-specs-rollback.sql
-- Apply note:      docs/apply-notes/0090-datasheet-schema.md
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
-- WRITE PATH (ADR 0097 — this file was amended before it was ever applied). The
-- drafted version carried NO provenance columns and granted admin DELETE, on the
-- reasoning that "rows are refreshed by a reviewed admin seed load, not edited
-- row-by-row in the app". ADR 0096 reversed exactly that reasoning for
-- product_specs, and it is just as reversed here: the admin form at
-- /admin/appliance-specs is this table's ONLY intended write path, and every row
-- is typed in through it. So the table ships with the full 20260727000001
-- pattern — provenance columns, an insert-only audit table, the BEFORE-stamp /
-- AFTER-audit trigger pair, and NO DELETE grant or policy (see the RLS block).
--
-- Intended population — entered through /admin/appliance-specs (ADR 0097 §8),
-- NEVER seeded by migration. Seeding data inside a migration is the practice
-- ADR 0096 exists to end, and this table is the first one that gets to start
-- clean; each of the seven entries doubles as end-to-end write-path validation:
--   VX5-V150-ACM  family_type acm         sheet_group 'V150'
--   VX5-V250-MGM  family_type management  sheet_group 'V250'  ┐ same physical
--   VX5-V255-MGM  family_type management  sheet_group 'V250'  ┘ datasheet
--   VX5-V260-ACM  family_type acm         sheet_group 'V260'  ┐ same physical
--   VX5-V265-ACM  family_type acm         sheet_group 'V260'  ┘ datasheet
--   VX5-SW10-100  family_type workstation sheet_group 'SW10'
--   VX5-SW20-200  family_type workstation sheet_group 'SW20'
-- (SKU ids taken from src/lib/price-book/families.ts skuExtraData keys.)
-- family_type of V150 ('Value Management Server', but branded "ACM") is an
-- ENTRY-TIME call, made in the form's family_type select by whoever types the
-- row in (ADR 0097 §4a) — not a seed-time judgment, because there is no seed.

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
  raid_support       text,                        -- the sheets' RAID prose block; product_specs' counterpart of the same name (ADR 0097 §1)
  raid_level_display text,                        -- nullable; workstations have no array
  battery_raid       text,                        -- cachevault / battery-backed write cache presence ('YES'/'NO')
  os_redundancy      text,
  hotswap_power      text,

  -- ── Networking / management ───────────────────────────────────────────────
  network           text,                         -- full descriptor (cf. product_specs.network)
  gbe_1_ports       integer,
  gbe_10_ports      integer,
  sfp_addon         text,                         -- matches product_specs.sfp_addon
  -- The SW sheets' "Maximum Bandwidth" block (SW10 125, SW20 225). Same name and
  -- same rendering as product_specs.max_bandwidth_mbps, which cell-value.ts
  -- already formats as `${n} Mbit/s` — so this is the column the `bandwidth`
  -- skuExtraData override retires onto: one substitution surface, both tables.
  max_bandwidth_mbps integer,
  remote_mgmt       text,                         -- e.g. '1× Dedicated IPMI 2.0 out-of-band port'
  display_ports     text,                         -- display outputs description

  -- ── Form factor ───────────────────────────────────────────────────────────
  form_factor       text not null,
  rack_units        text,                         -- nullable — tower workstations have none

  -- ── Power / cooling ───────────────────────────────────────────────────────
  power_wattage         text,                     -- text to allow '2× 800W'
  power_redundancy      text,                     -- e.g. '2× hot-swap redundant' / 'single'
  power_max_consumption text,                     -- the sheets' Max Power Consumption block (ADR 0097 §1)
  power_ac_input        text,                     -- e.g. '100–240V AC, 50/60 Hz'
  power_dc_input        text,                     -- OPTIONAL second input — only the V250 sheet lists DC alongside AC; null elsewhere
  cooling               text,                     -- the sheets' Cooling block (ADR 0097 §1); absent on tower SKUs

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
  -- ADR 0090 logged "the matrix's internal shape is unvalidated JSONB" as a
  -- negative; the form's structured five-key row editor (ADR 0097 §4d) is where
  -- that closes, because the form is the only write path.
  camera_matrix     jsonb,

  -- ── Meta ──────────────────────────────────────────────────────────────────
  revision_date     date,                         -- datasheet revision / as-of date (cf. camera_specs.as_of_date)
  notes             text,

  -- ── Provenance (ADR 0097; mirrors product_specs 20260727000001 part 1b) ────
  -- Maintained by the BEFORE trigger below, never by application code, so a
  -- write that bypasses the form still gets stamped. updated_by is nullable:
  -- migration and service_role writes have no signed-in user.
  updated_at        timestamptz not null default now(),
  updated_by        uuid references public.partners(id)
);

comment on column public.appliance_specs.raid_support is
  'RAID prose block as printed on the datasheet (e.g. ''Hardware RAID 6 Double Fault Tolerance '
  'w/ HW XOR Engine''). Null on tower workstations, which have no array. Same name as '
  'product_specs.raid_support.';
comment on column public.appliance_specs.max_bandwidth_mbps is
  'Maximum ingest bandwidth in Mbit/s, as the SW sheets print it. Rendered by cell-value.ts '
  'as `${n} Mbit/s`; the retirement target for the `bandwidth` skuExtraData override.';
comment on column public.appliance_specs.power_max_consumption is
  'Max Power Consumption block, verbatim from the sheet (e.g. ''1200W'', ''850W Gold''). '
  'Text, not integer: the sheets qualify the number.';
comment on column public.appliance_specs.cooling is
  'Cooling block, verbatim from the sheet (e.g. ''6 x 80x38mm''). Null where the sheet prints '
  'none (tower SKUs).';
comment on column public.appliance_specs.updated_at is
  'Maintained by appliance_specs_stamp_updated; never written by application code.';
comment on column public.appliance_specs.updated_by is
  'Editing partner, from auth.uid(). Null for migration and service_role writes.';

-- Small reference table (~7 rows), read by exact SKU or grouped by sheet_group /
-- family_type. Indexes are cheap and mirror product_specs.form_factor_idx.
create index appliance_specs_family_type_idx on public.appliance_specs(family_type);
create index appliance_specs_sheet_group_idx on public.appliance_specs(sheet_group);

-- ---------------------------------------------------------------------------
-- RLS — SELECT open to authenticated (mirrors product_specs_select_all /
-- camera_specs_select_all); INSERT / UPDATE admin-only. auth.uid() is wrapped as
-- a scalar subquery per the 2026-06-15 InitPlan consolidation (ADR 0055),
-- matching camera_specs.
--
-- DELIBERATELY NO DELETE GRANT AND NO DELETE POLICY. The drafted version of this
-- migration granted delete and created appliance_specs_delete_admin, copied from
-- camera_specs; ADR 0097 removes both, matching product_specs (20260727000001).
-- The rationale transfers: once the skuExtraData overrides retire, these rows are
-- the only source for the management/ACM/workstation Price Book strings
-- (ssdStorage, bandwidth, monitors) and for the datasheet renderer, so deleting a
-- row silently blanks those surfaces with no error anywhere — the same failure
-- shape ADR 0094 documented for the recommender skip. A 7-row hand-entered table
-- has no steady-state use for delete; a mis-created row is corrected via
-- service_role, the documented recovery path. Withholding the grant means the
-- form cannot offer the control even by mistake.
-- ---------------------------------------------------------------------------

alter table public.appliance_specs enable row level security;
revoke all on public.appliance_specs from anon, authenticated;
grant select, insert, update on public.appliance_specs to authenticated;

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

-- ---------------------------------------------------------------------------
-- Audit trail — same shape and same reasoning as product_specs_audit
-- (20260727000001 part 1c). These rows publish the management/ACM/workstation
-- datasheets and, once the overrides retire, the Price Book strings for those
-- SKUs; a form makes an equivalent change two keystrokes with no review step,
-- and stored snapshots protect the sheets already sent, not the next one.
--
-- Insert-only from the client's point of view: SELECT to admins, no INSERT /
-- UPDATE / DELETE grant to authenticated at all. Rows arrive only through the
-- security definer trigger below.
-- ---------------------------------------------------------------------------

create table public.appliance_specs_audit (
  id          bigserial primary key,
  spec_id     text not null,                  -- appliance_specs.id; no FK, audit outlives its subject
  changed_at  timestamptz not null default now(),
  changed_by  uuid references public.partners(id),
  operation   text not null check (operation in ('insert', 'update')),
  before      jsonb,                          -- null on insert
  after       jsonb not null
);

-- History for one SKU, newest first — the only read pattern this table has.
create index appliance_specs_audit_spec_id_changed_at_idx
  on public.appliance_specs_audit (spec_id, changed_at desc);

alter table public.appliance_specs_audit enable row level security;
revoke all on public.appliance_specs_audit from anon, authenticated;
grant select on public.appliance_specs_audit to authenticated;

create policy appliance_specs_audit_select_admin
on public.appliance_specs_audit for select
to authenticated
using (public.is_admin((select auth.uid())));

-- Two triggers, not one: an AFTER trigger's return value is discarded so it
-- cannot stamp the row — BEFORE stamps, AFTER records what was stamped, and the
-- audit row's `after` snapshot therefore includes the provenance columns. Same
-- reasoning the 0096 apply-note records.

-- Stamp. SECURITY INVOKER (the default) is correct: the function only assigns to
-- NEW and calls auth.uid(), which authenticated may already execute. Empty
-- search_path per the 20260611 advisor hardening; now() is pg_catalog and
-- auth.uid() is schema-qualified.
create or replace function public.appliance_specs_stamp_updated()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

-- Audit. SECURITY DEFINER so it can insert into a table no client role holds
-- INSERT on. The trigger, not the server action, is the right home: it cannot be
-- bypassed, it captures service_role writes, and it keeps the action free of
-- bookkeeping it could forget.
create or replace function public.appliance_specs_write_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.appliance_specs_audit (spec_id, changed_by, operation, before, after)
  values (
    new.id,
    auth.uid(),
    lower(tg_op),
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );
  return null;  -- AFTER trigger: return value is ignored
end;
$$;

-- Trigger helpers fire from the trigger machinery regardless of caller
-- privilege, so no client role needs EXECUTE (precedent: set_updated_at in
-- 20260611000001_security_advisor_hardening.sql).
revoke execute on function public.appliance_specs_stamp_updated() from anon, authenticated, public;
revoke execute on function public.appliance_specs_write_audit() from anon, authenticated, public;

create trigger appliance_specs_stamp_updated_trg
  before insert or update on public.appliance_specs
  for each row execute function public.appliance_specs_stamp_updated();

create trigger appliance_specs_write_audit_trg
  after insert or update on public.appliance_specs
  for each row execute function public.appliance_specs_write_audit();
