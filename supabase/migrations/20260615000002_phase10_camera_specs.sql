-- Phase 10 Step 1 — camera_specs table
--
-- Stores camera vendor/model/sensor specs for the calculator's camera-model
-- lookup (Phase 10). Selecting a camera auto-fills the resolution bucket and
-- sensor count in a calculator group card. Mirrors the product_specs pattern:
-- read-open reference data for authenticated users, writes restricted to
-- admins. Seeded later, per vendor, via a reviewed admin-only load that the
-- scripts/validate-camera-specs.ts checker gates first. See ADR 0057 and 0058.
--
-- No created_at / updated_at: the sibling reference table product_specs carries
-- neither, and rows here are refreshed by a reviewed seed load, not edited
-- row-by-row in the app.

create table public.camera_specs (
  id                 uuid primary key default gen_random_uuid(),
  vendor             text not null check (vendor in ('Axis', 'Hanwha', 'Avigilon')),
  model              text not null,
  model_aliases      text[] not null default '{}',
  sensor_count       integer not null check (sensor_count >= 1),
  max_width          integer not null check (max_width > 0),
  max_height         integer not null check (max_height > 0),
  sensor_detail      jsonb,                       -- nullable; per-sensor breakdown, unused by phase-1 math
  currently_shipping boolean not null default true,
  source_url         text,
  as_of_date         date,
  constraint camera_specs_vendor_model_key unique (vendor, model)
);

-- ---------------------------------------------------------------------------
-- Search indexing — trigram on model + joined aliases (ADR 0057).
-- The Step-3 picker searches model and aliases with ILIKE / similarity scoped
-- by vendor. pg_trgm is first enabled here (only pgcrypto was enabled before),
-- so the paired rollback drops it.
-- ---------------------------------------------------------------------------

create extension if not exists "pg_trgm";

create index camera_specs_model_trgm_idx
  on public.camera_specs using gin (model gin_trgm_ops);

-- model_aliases is text[]; index the space-joined alias text so trigram search
-- covers aliases the same way it covers model. array_to_string(text[], text)
-- is immutable, which an expression index requires.
create index camera_specs_aliases_trgm_idx
  on public.camera_specs using gin (array_to_string(model_aliases, ' ') gin_trgm_ops);

-- vendor gates and filters every model lookup; back the filter with a btree.
create index camera_specs_vendor_idx
  on public.camera_specs(vendor);

-- ---------------------------------------------------------------------------
-- RLS — SELECT open to authenticated (mirrors product_specs_select_all);
-- INSERT / UPDATE / DELETE admin-only. auth.uid() is wrapped as a scalar
-- subquery per the 2026-06-15 InitPlan consolidation (ADR 0055).
-- ---------------------------------------------------------------------------

alter table public.camera_specs enable row level security;
revoke all on public.camera_specs from anon, authenticated;
grant select, insert, update, delete on public.camera_specs to authenticated;

create policy camera_specs_select_all
on public.camera_specs for select
to authenticated
using (true);

create policy camera_specs_insert_admin
on public.camera_specs for insert
to authenticated
with check (public.is_admin((select auth.uid())));

create policy camera_specs_update_admin
on public.camera_specs for update
to authenticated
using (public.is_admin((select auth.uid())))
with check (public.is_admin((select auth.uid())));

create policy camera_specs_delete_admin
on public.camera_specs for delete
to authenticated
using (public.is_admin((select auth.uid())));
