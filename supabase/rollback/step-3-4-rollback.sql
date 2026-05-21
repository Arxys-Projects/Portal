-- Reverse migration for Phase 2 Steps 3+4.
--
-- DO NOT RUN AUTOMATICALLY. This file lives outside `supabase/migrations/` so
-- the Supabase CLI never picks it up. It's the manual "break glass in case of
-- fire" recipe to roll back the SKU-PK schema migration to the pre-migration
-- shape (initial_schema.sql + step5_submissions_and_seeds.sql).
--
-- Two-step rollback:
--   1. Apply this SQL via `psql` or the Supabase Dashboard SQL editor against
--      the production database.
--   2. Run `node --env-file=.env.local --import tsx scripts/restore-tables.ts
--      backups/pre-step-3-4-sku-pk-migration-<timestamp>.json` to repopulate
--      the rebuilt tables from the JSON dump taken before the forward
--      migration.
--
-- Caveats:
--   - Any submissions created AFTER the forward migration but BEFORE the
--     rollback will be lost: their recommended_product_id will be a SKU
--     string that doesn't cast to UUID, so we NULL them out before the type
--     change so the ALTER succeeds. The restore script then re-inserts the
--     original 12 submissions verbatim, including their UUID FKs.
--   - The forward migration's `set_updated_at()` function is shared with
--     `partners` and is left in place.
--
-- Tested in design only; rehearse against a fresh local Supabase before
-- relying on this in production.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 1. Drop the new products table (SKU PK shape).
-- ---------------------------------------------------------------------------

drop table if exists public.products cascade;

-- ---------------------------------------------------------------------------
-- 2. Null out new-shape SKU values in submissions so the TEXT -> UUID cast
--    can succeed. The restore script overwrites these with the original
--    UUIDs from the JSON dump.
-- ---------------------------------------------------------------------------

update public.submissions
   set recommended_product_id = null
 where recommended_product_id is not null
   and recommended_product_id
       !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

alter table public.submissions
  alter column recommended_product_id type uuid
    using recommended_product_id::uuid;

-- ---------------------------------------------------------------------------
-- 3. Recreate the OLD products table (UUID PK, list_price_usd shape) per
--    supabase/migrations/20260515193702_initial_schema.sql.
-- ---------------------------------------------------------------------------

create table public.products (
  id                 uuid primary key default gen_random_uuid(),
  sku                text unique not null,
  name               text not null,
  description        text,
  category           text not null default 'server'
                     check (category in ('server', 'camera', 'accessory')),
  list_price_usd     numeric(10,2) not null default 0
                     check (list_price_usd >= 0),
  partner_price_usd  numeric(10,2)
                     check (partner_price_usd is null or partner_price_usd >= 0),
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger trg_products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create index products_active_idx on public.products(active);
create index products_category_idx on public.products(category);

-- ---------------------------------------------------------------------------
-- 4. Recreate the OLD server_specs table per initial_schema.sql, with the
--    bandwidth-gate relaxation from step5_submissions_and_seeds.sql baked in
--    (max_bandwidth_mbps nullable; CHECK accepts null OR > 0).
-- ---------------------------------------------------------------------------

create table public.server_specs (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid not null references public.products(id) on delete restrict,
  model_code          text unique not null,
  max_cameras         int not null check (max_cameras > 0),
  max_storage_tb      numeric(10,2) not null check (max_storage_tb > 0),
  max_bandwidth_mbps  numeric(10,2)
                      check (max_bandwidth_mbps is null or max_bandwidth_mbps > 0),
  notes               text,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger trg_server_specs_set_updated_at
before update on public.server_specs
for each row execute function public.set_updated_at();

create index server_specs_active_idx on public.server_specs(active);
create index server_specs_product_idx on public.server_specs(product_id);

-- ---------------------------------------------------------------------------
-- 5. Restore the FK constraint on submissions.recommended_product_id.
-- ---------------------------------------------------------------------------

alter table public.submissions
  add constraint submissions_recommended_product_id_fkey
  foreign key (recommended_product_id)
  references public.products(id)
  on delete set null;

-- ---------------------------------------------------------------------------
-- 6. RLS — restore policies on both tables.
-- ---------------------------------------------------------------------------

alter table public.products     enable row level security;
alter table public.server_specs enable row level security;

revoke all on public.products     from anon, authenticated;
revoke all on public.server_specs from anon, authenticated;

grant select on public.products     to authenticated;
grant select on public.server_specs to authenticated;

create policy products_select_active_or_admin
on public.products for select
to authenticated
using (active = true or public.is_admin(auth.uid()));

create policy server_specs_select_active_or_admin
on public.server_specs for select
to authenticated
using (active = true or public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- 7. At this point the schema matches the pre-step-3+4 shape but tables are
--    empty. Exit psql and run:
--
--      node --env-file=.env.local --import tsx \
--        scripts/restore-tables.ts \
--        backups/pre-step-3-4-sku-pk-migration-<timestamp>.json
--
--    The restore script wipes + re-inserts in FK-safe order:
--      partners -> products -> server_specs -> submissions.
-- ---------------------------------------------------------------------------
