-- Phase 2 Steps 3+4 — SKU-PK products migration
--
-- See docs/phase-2/step-3-and-4-schema-and-algorithm.md and
-- docs/decisions/0031-step-3-4-schema-migration.md.
--
-- Five locked decisions (Andy 2026-05-21):
--   Q1(b)  Historical submissions.recommended_product_id keeps the legacy UUID
--          as TEXT; FK is dropped. Submission-detail + PDF render "(legacy
--          data)" for pre-migration rows.
--   Q2(ii) server_specs is dropped; max_cameras + max_storage_tb are inlined
--          on products.
--   Q3(b)  max_cameras per SKU = family-level value from the old server_specs
--          (V200 -> 100, V400 -> 200, V500/V600 -> 275, V700/V800 -> 325).
--   Q4(a)  recommend() filters to price_type='numeric' -- MKT/CFQ excluded.
--          Enforced at the application layer; the schema permits all three.
--   Q5(a)  Pipedrive deal-builder derives "N x {product_group}" from the SKU's
--          product_group; schema carries product_group on every row.
--
-- DDL ordering matters because of FK + RLS dependencies. The whole file is
-- a single Postgres transaction -- if any statement fails the migration rolls
-- back, leaving the prior schema intact.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 1. Drop dependent FK constraints so the products + server_specs tables
--    can be dropped cleanly.
-- ---------------------------------------------------------------------------

alter table public.submissions
  drop constraint if exists submissions_recommended_product_id_fkey;

-- ---------------------------------------------------------------------------
-- 2. Drop the old tables. `cascade` cleans up indexes + triggers + policies.
--    server_specs first (FK on products); then products.
-- ---------------------------------------------------------------------------

drop table if exists public.server_specs cascade;
drop table if exists public.products cascade;

-- ---------------------------------------------------------------------------
-- 3. Migrate submissions.recommended_product_id UUID -> TEXT.
--    Per Q1(b): preserve old UUIDs as opaque strings. No new FK constraint.
-- ---------------------------------------------------------------------------

alter table public.submissions
  alter column recommended_product_id type text
    using recommended_product_id::text;

-- Tag historical rows so detail views can render "(legacy data)" without
-- needing to know specific UUIDs. A UUID-shaped string is the only legacy
-- signal; new submissions will write SKUs (which never look like UUIDs).
-- We leave the values as-is; the application layer detects "(legacy)" by
-- pattern (uuid-shaped vs SKU-shaped).

-- ---------------------------------------------------------------------------
-- 4. Create the new products table per the proposal at
--    docs/proposals/phase-2-pricing-pipeline.md Phase 1 spec, with
--    max_cameras + max_storage_tb inlined per Q2(ii).
-- ---------------------------------------------------------------------------

create table public.products (
  sku            text primary key,
  product_name   text not null,
  msrp           numeric(10,2)
                 check (msrp is null or msrp >= 0),
  price_type     text not null
                 check (price_type in ('numeric', 'market', 'call_for_quote')),
  product_group  text not null,
  sort_order     integer not null default 0,
  active         boolean not null default true,
  max_cameras    integer
                 check (max_cameras is null or max_cameras > 0),
  max_storage_tb numeric(10,2)
                 check (max_storage_tb is null or max_storage_tb > 0),
  updated_at     timestamptz not null default now()
);

-- numeric rows must have an MSRP; market / call_for_quote may omit it.
alter table public.products
  add constraint products_msrp_required_for_numeric
  check (
    (price_type = 'numeric' and msrp is not null)
    or price_type in ('market', 'call_for_quote')
  );

create trigger trg_products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create index products_active_idx on public.products(active);
create index products_group_idx on public.products(product_group);
create index products_price_type_idx on public.products(price_type);
create index products_sort_idx on public.products(sort_order);

-- ---------------------------------------------------------------------------
-- 5. RLS -- same shape as the old products policy.
-- ---------------------------------------------------------------------------

alter table public.products enable row level security;

revoke all on public.products from anon, authenticated;
grant select on public.products to authenticated;

create policy products_select_active_or_admin
on public.products for select
to authenticated
using (active = true or public.is_admin(auth.uid()));

-- INSERT/UPDATE/DELETE: service_role only (Step 5 push script).

-- ---------------------------------------------------------------------------
-- 6. Seed 6 representative SKUs (one mid-tier per VideoX V-family). Step 5's
--    push script UPSERTs the full ~36-row Sheet over this seed.
--
--    SKU names + product names + MSRPs are taken verbatim from the live
--    Master Sheet (validated 2026-05-21, Step 2). max_cameras carries forward
--    from the old server_specs family value (Q3(b)). max_storage_tb is the
--    tier's own capacity (the suffix in the SKU name), which is more accurate
--    than the family-max the old server_specs used.
-- ---------------------------------------------------------------------------

insert into public.products
  (sku,            product_name,                                                       msrp,     price_type, product_group, sort_order, max_cameras, max_storage_tb)
values
  ('VX5-V200-80',  'VideoX V200 80TB 1U 4Bay Rack - V5 NVR Server',                    16640.00, 'numeric',  'V200',         1,         100,          80),
  ('VX5-V400-160', 'VideoX V400 160TB 2U 8Bay Rack - V5 Video & Analytics Server',     26910.00, 'numeric',  'V400',         2,         200,         160),
  ('VX5-V500-240', 'VideoX V500 240TB 2U 12Bay Rack - V5 Video & Analytics Server',    35926.00, 'numeric',  'V500',         3,         275,         240),
  ('VX5-V600-320', 'VideoX V600 320TB 3U 16Bay Rack - V5 Video & Analytics Server',    41659.00, 'numeric',  'V600',         4,         275,         320),
  ('VX5-V700-480', 'VideoX V700 480TB 4U 24Bay Rack - V5 Video & Analytics Server',    54512.00, 'numeric',  'V700',         5,         325,         480),
  ('VX5-V800-720', 'VideoX V800 720TB 4U 36Bay Rack - V5 Video & Analytics Server',    74048.00, 'numeric',  'V800',         6,         325,         720);
