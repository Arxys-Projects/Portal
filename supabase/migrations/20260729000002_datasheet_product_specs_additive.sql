-- Datasheet automation — product_specs additive columns (22)
--
-- STOP-AND-FLAG. Applied by hand via the Supabase dashboard SQL editor with its
-- sibling 20260729000001, per the ADR 0083 / 0089 convention (the CLI is
-- unauthenticated in the agent environment). Additive-only, so it is the benign
-- half of the pair — but it ships in the same review.
-- Paired rollback: supabase/rollback/datasheet-product-specs-additive-rollback.sql
-- Apply note:      docs/apply-notes/0090-datasheet-schema.md
--
-- Purely ADDITIVE, same pattern as 20260602000001_quickcompare_columns.sql:
-- adds nullable columns only. Does NOT touch existing columns, existing rows'
-- values, indexes, RLS policies, or constraints. Rack-video archetype only
-- (the 21 V100–V800 rows) — the management/ACM/workstation archetypes live in
-- appliance_specs (20260729000001), which carries the equivalent columns. See
-- ADR 0090.
--
-- Fields the datasheet needs that product_specs lacked, per the Phase 0 audit
-- (JOURNAL 2026-07-23): power (wattage/redundancy/AC input), dimensions +
-- shipping weight, structured warranty (years + terms), environmental
-- (temp/humidity — varies per SKU), regulatory (safety/emissions standards +
-- NDAA disclosure), the security-feature list, remote-management description,
-- VMS/OS drive description, and a revision date.
--
-- AMENDED BEFORE APPLY (ADR 0097 §2b): 18 → 22 columns. The four additions —
-- power_dc_input, power_max_consumption, cooling, display_ports — are each a
-- block that renders on a live factsheet with no column anywhere, verified to
-- vary across SKUs so none can be a template constant (ADR 0097 §1).
-- No structural change was needed: the admin write policies, both triggers and
-- the audit table from 20260727000001 are row-level and to_jsonb-based, so new
-- columns are covered automatically the moment they exist (the 0096 apply-note
-- verified that explicitly).
--
-- NO VALUES ARE SEEDED HERE. Values are entered through /admin/specs once the
-- form learns these fields (ADR 0097 §7 steps 4 and 6) — never by migration,
-- which is the practice ADR 0096 exists to end. Every column is nullable so the
-- 21 existing rows stay valid.
--
-- FEATURE-BLOCK SUBSTITUTION (Task 3) — nothing added, already covered.
-- The page-1 feature blocks (Flexible Storage, High Data Availability, …) need
-- RAID level, drive-failure tolerance, and cachevault presence. product_specs
-- already carries these: raid_level_display, hdd_count, drive_bays, battery_raid
-- (= cachevault / battery-backed write cache), os_redundancy, hotswap_power, and
-- max_cameras_h265 for the H.265 block. Drive-failure tolerance is derivable from
-- raid_level_display + drive count, so it is computed in the template, not stored.
-- Adding any of these would be redundant; none are added. Same for raid_support
-- and max_bandwidth_mbps, which this table already has (appliance_specs gains
-- them in the sibling migration to match).
--
-- NOTE: legacy freeform `warranty` (NOT NULL) is left in place; warranty_years +
-- warranty_terms are the new structured fields the datasheet reads.

-- Power / cooling
alter table public.product_specs add column power_wattage        text;
alter table public.product_specs add column power_redundancy     text;
alter table public.product_specs add column power_ac_input       text;
alter table public.product_specs add column power_dc_input       text;
alter table public.product_specs add column power_max_consumption text;
alter table public.product_specs add column cooling              text;

comment on column public.product_specs.power_dc_input is
  'Optional second power input — the V100/V200 sheets list a DC input line alongside AC; '
  'null on SKUs whose sheet prints none. Matches appliance_specs.power_dc_input.';
comment on column public.product_specs.power_max_consumption is
  'Max Power Consumption block, verbatim from the sheet (e.g. ''1200W''). Text, not integer: '
  'the sheets qualify the number.';
comment on column public.product_specs.cooling is
  'Cooling block, verbatim from the sheet (e.g. ''6 x 80x38mm''). Varies per chassis, so it is '
  'stored per SKU rather than hardcoded in the template.';

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
-- NOT NULL means the form must submit [] — never null — for a blank list; that is
-- a form-kind concern (ADR 0097 §5 `string-list`), not a migration change.
alter table public.product_specs add column security_features    text[] not null default '{}';

-- Remote management, VMS/OS drive description, display outputs
alter table public.product_specs add column remote_mgmt          text;
alter table public.product_specs add column os_drive_desc        text;
alter table public.product_specs add column display_ports        text;

comment on column public.product_specs.display_ports is
  'Display outputs description, verbatim from the sheet (rack sheets print a VGA line). '
  'Matches appliance_specs.display_ports.';

-- Datasheet revision / as-of date
alter table public.product_specs add column revision_date        date;
