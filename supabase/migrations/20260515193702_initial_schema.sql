-- Arxys Partner Portal — initial schema
-- Tables: partners, products, server_specs, submissions
-- All policies inline; anon role gets nothing.

set check_function_bodies = off;

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- partners
-- ---------------------------------------------------------------------------

create table public.partners (
  id            uuid primary key references auth.users(id) on delete cascade,
  company_name  text not null,
  contact_name  text not null,
  phone         text,
  role          text not null default 'partner'
                check (role in ('partner', 'admin')),
  status        text not null default 'active'
                check (status in ('active', 'invited', 'suspended')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger trg_partners_set_updated_at
before update on public.partners
for each row execute function public.set_updated_at();

create index partners_role_idx on public.partners(role);
create index partners_status_idx on public.partners(status);

-- ---------------------------------------------------------------------------
-- products
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
-- server_specs
-- ---------------------------------------------------------------------------

create table public.server_specs (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid not null references public.products(id) on delete restrict,
  model_code          text unique not null,
  max_cameras         int not null check (max_cameras > 0),
  max_storage_tb      numeric(10,2) not null check (max_storage_tb > 0),
  max_bandwidth_mbps  numeric(10,2) not null check (max_bandwidth_mbps > 0),
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
-- submissions
-- ---------------------------------------------------------------------------

create table public.submissions (
  id                         uuid primary key default gen_random_uuid(),
  partner_id                 uuid not null references public.partners(id) on delete restrict,
  project_name               text,
  cameras_count              int not null check (cameras_count > 0),
  resolution_code            text not null,
  codec                      text not null,
  complexity                 text not null,
  vms                        text,
  retention_days             int not null check (retention_days > 0),
  bandwidth_mbps             numeric(10,2) not null check (bandwidth_mbps >= 0),
  storage_tb                 numeric(10,2) not null check (storage_tb >= 0),
  recommended_product_id     uuid references public.products(id) on delete set null,
  recommended_units          int not null default 1 check (recommended_units >= 1),
  total_list_price_usd       numeric(12,2) check (total_list_price_usd is null or total_list_price_usd >= 0),
  total_partner_price_usd    numeric(12,2) check (total_partner_price_usd is null or total_partner_price_usd >= 0),
  pdf_url                    text,
  pipedrive_deal_id          bigint,
  email_sent_at              timestamptz,
  created_at                 timestamptz not null default now()
);

create index submissions_partner_idx on public.submissions(partner_id);
create index submissions_created_idx on public.submissions(created_at desc);

-- ---------------------------------------------------------------------------
-- helper: is_admin(uid)
-- ---------------------------------------------------------------------------

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.partners
    where id = uid and role = 'admin' and status = 'active'
  );
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS — enable on all tables
-- ---------------------------------------------------------------------------

alter table public.partners     enable row level security;
alter table public.products     enable row level security;
alter table public.server_specs enable row level security;
alter table public.submissions  enable row level security;

-- Revoke broad grants; rely on policies for authenticated.
-- Anon role gets nothing on any of these tables.
revoke all on public.partners     from anon, authenticated;
revoke all on public.products     from anon, authenticated;
revoke all on public.server_specs from anon, authenticated;
revoke all on public.submissions  from anon, authenticated;

grant select, update on public.partners     to authenticated;
grant select          on public.products     to authenticated;
grant select          on public.server_specs to authenticated;
grant select, insert  on public.submissions  to authenticated;

-- ---------------------------------------------------------------------------
-- partners policies
-- ---------------------------------------------------------------------------

create policy partners_select_self_or_admin
on public.partners for select
to authenticated
using (id = auth.uid() or public.is_admin(auth.uid()));

create policy partners_update_self_or_admin
on public.partners for update
to authenticated
using (id = auth.uid() or public.is_admin(auth.uid()))
with check (id = auth.uid() or public.is_admin(auth.uid()));

-- INSERT and DELETE intentionally not exposed to authenticated.
-- Provisioning happens via service_role (signup webhook / admin tool).

-- ---------------------------------------------------------------------------
-- products policies
-- ---------------------------------------------------------------------------

create policy products_select_active_or_admin
on public.products for select
to authenticated
using (active = true or public.is_admin(auth.uid()));

-- INSERT/UPDATE/DELETE: service_role only.

-- ---------------------------------------------------------------------------
-- server_specs policies
-- ---------------------------------------------------------------------------

create policy server_specs_select_active_or_admin
on public.server_specs for select
to authenticated
using (active = true or public.is_admin(auth.uid()));

-- INSERT/UPDATE/DELETE: service_role only.

-- ---------------------------------------------------------------------------
-- submissions policies
-- ---------------------------------------------------------------------------

create policy submissions_select_own_or_admin
on public.submissions for select
to authenticated
using (partner_id = auth.uid() or public.is_admin(auth.uid()));

create policy submissions_insert_self
on public.submissions for insert
to authenticated
with check (partner_id = auth.uid());

-- UPDATE not exposed: submissions are immutable from the partner side.
-- DELETE not exposed: admin-only via service_role for audit retention.
