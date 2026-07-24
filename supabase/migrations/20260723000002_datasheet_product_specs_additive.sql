-- Datasheet automation — Phase 1 Step 2: product_specs additive columns
--
-- Purely ADDITIVE, same pattern as 20260602000001_quickcompare_columns.sql:
-- adds nullable columns only. Does NOT touch existing columns, existing rows'
-- values, indexes, RLS policies, or constraints. Rack-video archetype only
-- (the 21 V100–V800 rows) — the management/ACM/workstation archetypes live in
-- appliance_specs (20260723000001), which carries the equivalent columns. See
-- ADR 0090.
--
-- Fields the datasheet needs that product_specs lacked, per the Phase 0 audit
-- (JOURNAL 2026-07-23): power (wattage/redundancy/AC input), dimensions +
-- shipping weight, structured warranty (years + terms), environmental
-- (temp/humidity — varies per SKU), regulatory (safety/emissions standards +
-- NDAA disclosure), the security-feature list, remote-management description,
-- VMS/OS drive description, and a revision date.
--
-- NO VALUES ARE SEEDED HERE — the source-of-truth spec numbers are entered in a
-- later content phase (same as the QuickCompare migration seeded separately from
-- new tables). Every column is nullable so the 21 existing rows stay valid.
--
-- FEATURE-BLOCK SUBSTITUTION (Task 3) — nothing added, already covered.
-- The page-1 feature blocks (Flexible Storage, High Data Availability, …) need
-- RAID level, drive-failure tolerance, and cachevault presence. product_specs
-- already carries these: raid_level_display, hdd_count, drive_bays, battery_raid
-- (= cachevault / battery-backed write cache), os_redundancy, hotswap_power, and
-- max_cameras_h265 for the H.265 block. Drive-failure tolerance is derivable from
-- raid_level_display + drive count, so it is computed in the template, not stored.
-- Adding any of these would be redundant; none are added.
--
-- NOTE: legacy freeform `warranty` (NOT NULL) is left in place; warranty_years +
-- warranty_terms are the new structured fields the datasheet reads.

-- Power
alter table public.product_specs add column power_wattage        text;
alter table public.product_specs add column power_redundancy     text;
alter table public.product_specs add column power_ac_input       text;

-- Physical — two display strings per unit system (see appliance_specs / ADR 0090
-- for why dimensions are text, not per-axis numerics)
alter table public.product_specs add column dimensions_mm        text;
alter table public.product_specs add column dimensions_in        text;
alter table public.product_specs add column shipping_weight      text;

-- Warranty (structured; legacy `warranty` text untouched)
alter table public.product_specs add column warranty_years       integer;
alter table public.product_specs add column warranty_terms       text;

-- Environmental (varies per SKU — not hardcoded in the template)
alter table public.product_specs add column operating_temp       text;
alter table public.product_specs add column storage_temp         text;
alter table public.product_specs add column humidity             text;

-- Regulatory / compliance
alter table public.product_specs add column regulatory_safety    text;
alter table public.product_specs add column regulatory_emissions  text;
alter table public.product_specs add column ndaa_text            text;

-- Security feature list (SEV / SME / Secure Boot / signed firmware …). text[]
-- with a default so the existing 21 rows are valid and non-null. Matches the
-- appliance_specs.security_features shape (cf. camera_specs.model_aliases text[]).
alter table public.product_specs add column security_features    text[] not null default '{}';

-- Remote management + VMS/OS drive description
alter table public.product_specs add column remote_mgmt          text;
alter table public.product_specs add column os_drive_desc        text;

-- Datasheet revision / as-of date
alter table public.product_specs add column revision_date        date;
