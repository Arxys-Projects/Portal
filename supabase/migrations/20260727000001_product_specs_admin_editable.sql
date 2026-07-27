-- product_specs becomes the canonical, admin-editable Arxys spec source.
-- ADR 0096; design: datasheets/spec-admin-form-design.md §1.
--
-- STOP-AND-FLAG. New RLS policies make this security-sensitive, so it is
-- applied by hand via the Supabase dashboard SQL editor per the ADR 0083 /
-- 0089 convention (the CLI is unauthenticated in the agent environment).
-- Paired rollback: supabase/rollback/product-specs-admin-editable-rollback.sql
-- Apply note:      docs/apply-notes/0096-product-specs-admin-editable.md
--
-- Four additive parts. No existing column is changed and NO VALUE IS SEEDED —
-- the three V100 rows are corrected through the form as its first real use,
-- because seeding data inside a migration is the practice ADR 0096 exists to
-- end.
--
--   1a. Admin INSERT / UPDATE policies (no DELETE — see below)
--   1b. updated_at / updated_by provenance columns
--   1c. Insert-only product_specs_audit table + triggers
--   1d. Nullable raid_level_alt_display (the V100's second configuration)

-- ---------------------------------------------------------------------------
-- 1a. Admin write policies
--
-- Mirrors camera_specs (20260615000002), the one sibling reference table that
-- already has an admin write path. product_specs had no write policy at all:
-- RLS granted SELECT to authenticated and nothing else, so only service_role
-- could write it. The (select auth.uid()) wrapper is this repo's RLS-performance
-- idiom from 20260615000001_rls_perf_consolidation.sql.
--
-- DELIBERATELY NO DELETE GRANT AND NO DELETE POLICY. Per ADR 0094 a SKU with no
-- product_specs row is *skipped* by loadCandidateSpecs rather than falling back
-- to its raw nameplate, so deleting a spec row silently removes a SKU from the
-- recommender pool with no error anywhere. Availability is products.active's
-- job. Withholding the grant means the form cannot offer the control even by
-- mistake. This is the one intentional divergence from the camera_specs
-- template, which does grant delete.
-- ---------------------------------------------------------------------------

grant insert, update on public.product_specs to authenticated;

create policy product_specs_insert_admin
on public.product_specs for insert
to authenticated
with check (public.is_admin((select auth.uid())));

create policy product_specs_update_admin
on public.product_specs for update
to authenticated
using (public.is_admin((select auth.uid())))
with check (public.is_admin((select auth.uid())));

-- ---------------------------------------------------------------------------
-- 1b. Provenance columns
--
-- updated_by is nullable: migration and service_role writes have no signed-in
-- user. Both columns are maintained by the trigger in 1c, not by the server
-- action, so a write that bypasses the form still gets stamped. The 21 existing
-- rows take now() / null.
--
-- This departs from ADR 0090's reading of the reference-table pattern ("no
-- created_at / updated_at — rows are refreshed by a reviewed admin seed load,
-- not edited row-by-row in the app"). That was right for a seed-loaded table
-- and stops being right the moment the table is edited row-by-row, which is the
-- entire point of this change.
-- ---------------------------------------------------------------------------

alter table public.product_specs
  add column updated_at timestamptz not null default now(),
  add column updated_by uuid references public.partners(id);

comment on column public.product_specs.updated_at is
  'Maintained by product_specs_stamp_updated; never written by application code.';
comment on column public.product_specs.updated_by is
  'Editing partner, from auth.uid(). Null for migration and service_role writes.';

-- ---------------------------------------------------------------------------
-- 1c. Audit trail
--
-- Why an audit table is worth its cost on this table specifically: editing
-- hdd_count or raid_level_display changes usableCapacityTb(), which changes
-- net-usable storage on the Price Book, the System Estimate PDF, the Project
-- Quote and the Customer Proposal — and changes which SKU the recommender
-- picks. ADR 0092's parity fix moved the V800 by 6.7% and that was visible
-- enough to owe sales a heads-up. A form makes an equivalent change two
-- keystrokes with no review step. Stored snapshots protect existing
-- submissions and quotes; nothing protects the next one.
--
-- Insert-only from the client's point of view: SELECT to admins, no INSERT /
-- UPDATE / DELETE grant to authenticated at all. Rows arrive only through the
-- security definer trigger below.
-- ---------------------------------------------------------------------------

create table public.product_specs_audit (
  id          bigserial primary key,
  spec_id     text not null,                  -- product_specs.id; no FK, audit outlives its subject
  changed_at  timestamptz not null default now(),
  changed_by  uuid references public.partners(id),
  operation   text not null check (operation in ('insert', 'update')),
  before      jsonb,                          -- null on insert
  after       jsonb not null
);

-- History for one SKU, newest first — the only read pattern this table has.
create index product_specs_audit_spec_id_changed_at_idx
  on public.product_specs_audit (spec_id, changed_at desc);

alter table public.product_specs_audit enable row level security;
revoke all on public.product_specs_audit from anon, authenticated;
grant select on public.product_specs_audit to authenticated;

create policy product_specs_audit_select_admin
on public.product_specs_audit for select
to authenticated
using (public.is_admin((select auth.uid())));

-- The design (§1c) describes one AFTER trigger that both writes the audit row
-- and maintains updated_at / updated_by. An AFTER trigger's return value is
-- discarded, so it cannot stamp the row; the intent is implemented as two
-- triggers — BEFORE to stamp, AFTER to record what was stamped. The audit row's
-- `after` snapshot therefore includes the provenance columns.

-- Stamp. SECURITY INVOKER (the default) is correct: the function only assigns
-- to NEW and calls auth.uid(), which authenticated may already execute. Empty
-- search_path per the 20260611 advisor hardening; now() is pg_catalog and
-- auth.uid() is schema-qualified.
create or replace function public.product_specs_stamp_updated()
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
-- INSERT on. The trigger, not the server action, is the right home: it cannot
-- be bypassed, it captures service_role writes (so the last
-- update-competitor-data-era refresh is recorded), and it keeps the action free
-- of bookkeeping it could forget.
create or replace function public.product_specs_write_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.product_specs_audit (spec_id, changed_by, operation, before, after)
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
revoke execute on function public.product_specs_stamp_updated() from anon, authenticated, public;
revoke execute on function public.product_specs_write_audit() from anon, authenticated, public;

create trigger product_specs_stamp_updated_trg
  before insert or update on public.product_specs
  for each row execute function public.product_specs_stamp_updated();

create trigger product_specs_write_audit_trg
  after insert or update on public.product_specs
  for each row execute function public.product_specs_write_audit();

-- ---------------------------------------------------------------------------
-- 1d. V100 alternate configuration
--
-- ADR 0092 left this open: the V100 ships configurable as RAID 1 or JBOD, and
-- when the skuExtraData override path retires the V100 "needs a modelled answer
-- — two columns, or a nullable 'alternate configuration' field — not a
-- deletion." This is that field. One nullable level column beats two capacity
-- columns because the capacity is derivable: usableCapacityTb(storage_raw_tb,
-- hdd_count, level) needs only the level to vary, and storage_raw_tb /
-- hdd_count are identical across both configurations of the same box.
--
-- NO VALUE IS SET HERE. The three V100 rows still carry
-- raid_level_display = 'NA' and are corrected to '1' / 'JBOD' through the form.
--
-- The latent fragility this closes: 'NA' is not handled by usableCapacityTb();
-- it falls through to the documented RAID-5 branch (parity = 1), giving
-- raw × (2−1)/2 = raw/2 — which equals the RAID 1 mirror figure ONLY because
-- the V100 has exactly 2 drives. The published 16 / 20 / 24 TB figures are
-- right for the wrong reason, and an edit to hdd_count would silently break
-- them with no test failure.
-- ---------------------------------------------------------------------------

alter table public.product_specs add column raid_level_alt_display text;

comment on column public.product_specs.raid_level_alt_display is
  'Optional second supported RAID level for configurable units (V100: 1 or JBOD). '
  'Same value domain as raid_level_display; null when the box ships one way.';
