-- Step 5 — submissions wiring + VideoX seed data
--
-- Schema changes:
--   1. Drop the bandwidth-gate constraint on server_specs.max_bandwidth_mbps
--      so we can seed VideoX rows without a per-model Mbps cap.
--      Recommendation algorithm now uses cameras + storage only.
--      See docs/decisions/0012-bandwidth-gate-resolution.md, which supersedes 0006.
--   2. Add submissions.groups_payload (jsonb) so a per-group form snapshot is
--      preserved alongside the single-row recommendation. See ADR 0011 resolution.
--   3. Make submissions.cameras_count CHECK >= 0 (was > 0) — the partner can save
--      a zero-camera draft if the form happened to compute that way; the algorithm
--      will still warn. Actually keep > 0; reject zero-camera submissions in zod.
--
-- Seed data:
--   - 6 products rows (VideoX V200/V400/V500/V600/V700/V800) with placeholder
--     list_price_usd = 1..6 (order-proxy pricing per the Step 5 decision).
--   - 6 server_specs rows referencing those products. max_storage_tb takes the
--     configurator MAX value; the configurator MIN is recorded in notes.

-- ---------------------------------------------------------------------------
-- 1. Drop bandwidth gate
-- ---------------------------------------------------------------------------

alter table public.server_specs
  alter column max_bandwidth_mbps drop not null;

alter table public.server_specs
  drop constraint server_specs_max_bandwidth_mbps_check;

-- Permit either null or > 0; rules out zero/negative if someone later seeds it.
alter table public.server_specs
  add constraint server_specs_max_bandwidth_mbps_check
  check (max_bandwidth_mbps is null or max_bandwidth_mbps > 0);

-- ---------------------------------------------------------------------------
-- 2. submissions.groups_payload
-- ---------------------------------------------------------------------------

alter table public.submissions
  add column groups_payload jsonb;

-- ---------------------------------------------------------------------------
-- 3. Seed products (service_role writes; bypasses RLS)
-- ---------------------------------------------------------------------------

-- Stable UUIDs so re-running locally keeps server_specs.product_id aligned.
-- (gen_random_uuid is fine but the explicit ids let us reference them below.)
insert into public.products (id, sku, name, description, category, list_price_usd, active)
values
  ('11111111-1111-1111-1111-000000000200', 'VIDEOX-V200',
   'VideoX V200 1U 4Bay Rack',
   'V5 NVR Server — 1U chassis, 4 drive bays. Storage 10–64 TB, up to 100 cameras. NVR-only (no analytics).',
   'server', 1, true),
  ('11111111-1111-1111-1111-000000000400', 'VIDEOX-V400',
   'VideoX V400 2U 8Bay Rack',
   'V5 Video & Analytics Server — 2U chassis, 8 drive bays. Storage 65–118 TB, up to 200 cameras.',
   'server', 2, true),
  ('11111111-1111-1111-1111-000000000500', 'VIDEOX-V500',
   'VideoX V500 2U 12Bay Rack',
   'V5 Video & Analytics Server — 2U chassis, 12 drive bays. Storage 119–210 TB, up to 275 cameras.',
   'server', 3, true),
  ('11111111-1111-1111-1111-000000000600', 'VIDEOX-V600',
   'VideoX V600 3U 16Bay Rack',
   'V5 Video & Analytics Server — 3U chassis, 16 drive bays. Storage 211–300 TB, up to 275 cameras.',
   'server', 4, true),
  ('11111111-1111-1111-1111-000000000700', 'VIDEOX-V700',
   'VideoX V700 4U 24Bay Rack',
   'V5 Video & Analytics Server — 4U chassis, 24 drive bays. Storage 301–430 TB, up to 325 cameras.',
   'server', 5, true),
  ('11111111-1111-1111-1111-000000000800', 'VIDEOX-V800',
   'VideoX V800 4U 36Bay Rack',
   'V5 Video & Analytics Server — 4U chassis, 36 drive bays. Storage 431–640 TB, up to 325 cameras.',
   'server', 6, true)
on conflict (sku) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Seed server_specs
-- ---------------------------------------------------------------------------
-- max_storage_tb = configurator MAX; notes records the MIN (build floor).
-- max_bandwidth_mbps left null per ADR 0012.

insert into public.server_specs
  (product_id, model_code, max_cameras, max_storage_tb, max_bandwidth_mbps, notes, active)
values
  ('11111111-1111-1111-1111-000000000200', 'V200', 100,  64, null, 'min 10 TB; NVR-only',     true),
  ('11111111-1111-1111-1111-000000000400', 'V400', 200, 118, null, 'min 65 TB',                true),
  ('11111111-1111-1111-1111-000000000500', 'V500', 275, 210, null, 'min 119 TB',               true),
  ('11111111-1111-1111-1111-000000000600', 'V600', 275, 300, null, 'min 211 TB',               true),
  ('11111111-1111-1111-1111-000000000700', 'V700', 325, 430, null, 'min 301 TB',               true),
  ('11111111-1111-1111-1111-000000000800', 'V800', 325, 640, null, 'min 431 TB',               true)
on conflict (model_code) do nothing;
