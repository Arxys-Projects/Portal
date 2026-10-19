-- Project Portal backend, Step 1 (3 of 4): admin-editable system design rules
-- and BOM rules, with an audit trail. ADR 0154.
--
-- Independent of 000002 / 000003.
--
-- ⚠ STOP-AND-FLAG: new tables with RLS. Applied by hand by Andy; see
-- docs/apply-notes/0153-project-portal-schema.md.
-- Rollback: supabase/rollback/system-design-rules-rollback.sql.
--
-- Every default and BOM mapping is admin-editable, carries a plain-language
-- description, and is snapshotted onto each calc at save (the snapshot is
-- Step 4's job; these tables hold the current values only).
--
-- ACCESS (the ADR 0096 / 0097 pattern):
--   SELECT: internal or admin. Project calcs are run by internal users, whose
--     server client reads the rules. Partners get nothing.
--   INSERT / UPDATE: admin only.
--   DELETE: no grant. A rule is retired, not deleted: bom_rules.active = false,
--     or a new value for a system_design_rules key. A deleted rule would vanish
--     from every future calc with no error and no audit row.
--   Audit: one insert-only table for both, written by a SECURITY DEFINER
--     trigger, readable by admins.
--
-- SERVER ELIGIBILITY IS NOT HERE. Which servers can take SFP+ is read from
-- product_specs.rack_units ('1U' is excluded; Step 0 item 4), not duplicated
-- into a rule.

-- ---------------------------------------------------------------------------
-- system_design_rules: one row per named default.
-- ---------------------------------------------------------------------------

create table public.system_design_rules (
  key         text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  -- jsonb so a later rule can hold a boolean or a SKU; today all three are
  -- numbers. The engine (Step 3) validates the type per key.
  value       jsonb not null,
  description text not null check (length(btrim(description)) > 0),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.partners(id) on delete set null
);

comment on table public.system_design_rules is
  'ADR 0154: admin-editable system design defaults (failover days fraction, '
  'primaries per failover, ...). Snapshotted onto each calc at save. No delete.';

-- ---------------------------------------------------------------------------
-- bom_rules: which SKUs a design choice adds, per server role.
-- ---------------------------------------------------------------------------

create table public.bom_rules (
  id              bigint generated always as identity primary key,
  -- The design choice this row serves, e.g. 'sfp' or 'gpu'.
  design_item     text not null check (design_item ~ '^[a-z][a-z0-9_]*$'),
  applies_to_role text not null check (applies_to_role in ('recorder', 'failover', 'mgmt', 'workstation')),
  sku             text not null check (length(btrim(sku)) > 0),
  qty_per_server  integer not null check (qty_per_server > 0),
  description     text not null check (length(btrim(description)) > 0),
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.partners(id) on delete set null,
  unique (design_item, applies_to_role, sku)
);

comment on table public.bom_rules is
  'ADR 0154: admin-editable BOM mapping (design item + server role -> SKU x qty '
  'per server). No prices. Retire with active=false; no delete.';

-- products.sku is not unique (prices are append-only rows, ADR 0076), so a
-- foreign key is not possible. A trigger refuses a SKU the catalog has never
-- had, which catches an admin typo at save time. It does not require the SKU to
-- be active: Step 5's preview refuses inactive or unpriced lines with a reason.
create or replace function public.bom_rules_check_sku()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.products p where p.sku = new.sku) then
    raise exception 'bom_rules: unknown SKU %', new.sku using errcode = '23503';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Stamp and audit (ADR 0096 shape: BEFORE stamps, AFTER records).
-- ---------------------------------------------------------------------------

-- Shared by both tables. SECURITY INVOKER: it only assigns to NEW.
create or replace function public.design_rules_stamp_updated()
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

create table public.design_rules_audit (
  id          bigserial primary key,
  rule_table  text not null check (rule_table in ('system_design_rules', 'bom_rules')),
  rule_key    text not null,          -- system_design_rules.key, or bom_rules.id as text; no FK
  changed_at  timestamptz not null default now(),
  changed_by  uuid references public.partners(id) on delete set null,
  operation   text not null check (operation in ('insert', 'update')),
  before      jsonb,                  -- null on insert
  after       jsonb not null
);

create index design_rules_audit_rule_idx
  on public.design_rules_audit (rule_table, rule_key, changed_at desc);

comment on table public.design_rules_audit is
  'ADR 0154: insert-only history of system_design_rules and bom_rules, written '
  'by trigger. Admin read; no client write.';

create or replace function public.design_rules_write_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.design_rules_audit (rule_table, rule_key, changed_by, operation, before, after)
  values (
    tg_table_name,
    -- Through jsonb: a direct new.key fails on a bom_rules row (no such field).
    case when tg_table_name = 'system_design_rules' then to_jsonb(new) ->> 'key'
         else to_jsonb(new) ->> 'id' end,
    auth.uid(),
    lower(tg_op),
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );
  return null;  -- AFTER trigger
end;
$$;

revoke execute on function public.bom_rules_check_sku() from anon, authenticated, public;
revoke execute on function public.design_rules_stamp_updated() from anon, authenticated, public;
revoke execute on function public.design_rules_write_audit() from anon, authenticated, public;

create trigger trg_system_design_rules_stamp
  before insert or update on public.system_design_rules
  for each row execute function public.design_rules_stamp_updated();
create trigger trg_system_design_rules_audit
  after insert or update on public.system_design_rules
  for each row execute function public.design_rules_write_audit();

create trigger trg_bom_rules_check_sku
  before insert or update of sku on public.bom_rules
  for each row execute function public.bom_rules_check_sku();
create trigger trg_bom_rules_stamp
  before insert or update on public.bom_rules
  for each row execute function public.design_rules_stamp_updated();
create trigger trg_bom_rules_audit
  after insert or update on public.bom_rules
  for each row execute function public.design_rules_write_audit();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.system_design_rules enable row level security;
alter table public.bom_rules           enable row level security;
alter table public.design_rules_audit  enable row level security;

revoke all on public.system_design_rules from anon, authenticated;
revoke all on public.bom_rules           from anon, authenticated;
revoke all on public.design_rules_audit  from anon, authenticated;

grant select, insert, update on public.system_design_rules to authenticated;
grant select, insert, update on public.bom_rules           to authenticated;
grant select                 on public.design_rules_audit  to authenticated;

create policy system_design_rules_select_internal
on public.system_design_rules for select
to authenticated
using (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())));

create policy system_design_rules_insert_admin
on public.system_design_rules for insert
to authenticated
with check (public.is_admin((select auth.uid())));

create policy system_design_rules_update_admin
on public.system_design_rules for update
to authenticated
using (public.is_admin((select auth.uid())))
with check (public.is_admin((select auth.uid())));

create policy bom_rules_select_internal
on public.bom_rules for select
to authenticated
using (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())));

create policy bom_rules_insert_admin
on public.bom_rules for insert
to authenticated
with check (public.is_admin((select auth.uid())));

create policy bom_rules_update_admin
on public.bom_rules for update
to authenticated
using (public.is_admin((select auth.uid())))
with check (public.is_admin((select auth.uid())));

create policy design_rules_audit_select_admin
on public.design_rules_audit for select
to authenticated
using (public.is_admin((select auth.uid())));

-- ---------------------------------------------------------------------------
-- Seeds (the brief's Step 1 values; Step 0 items 3 and 4). These populate new
-- tables; they correct no existing data. Each lands in design_rules_audit with
-- changed_by null.
-- ---------------------------------------------------------------------------

insert into public.system_design_rules (key, value, description) values
  ('failover_days_fraction', '0.5'::jsonb,
   'Default failover days as a fraction of the calc''s longest retention, rounded up. 0.5 means a calc with 30-day retention defaults to 15 failover days.'),
  ('default_primaries_per_failover', '2'::jsonb,
   'Default number of primary recorders one failover unit covers. Failover count is the number of primaries divided by this, rounded up.'),
  ('suggest_dedicated_mgmt_above_servers', '3'::jsonb,
   'Suggest a dedicated management server when a calc has more recording servers than this.')
on conflict (key) do nothing;

insert into public.bom_rules (design_item, applies_to_role, sku, qty_per_server, description) values
  ('sfp', 'recorder', 'VX5-NIC-SFP28',    1, 'SFP+ on: one per recording server, always with VX5-NIC-SFP28x10 (the 10Gb pair). Not offered on 1U servers.'),
  ('sfp', 'recorder', 'VX5-NIC-SFP28x10', 1, 'SFP+ on: one per recording server, always with VX5-NIC-SFP28 (the 10Gb pair). Not offered on 1U servers.'),
  ('sfp', 'failover', 'VX5-NIC-SFP28',    1, 'SFP+ on: one per failover server, always with VX5-NIC-SFP28x10 (the 10Gb pair). Not offered on 1U servers.'),
  ('sfp', 'failover', 'VX5-NIC-SFP28x10', 1, 'SFP+ on: one per failover server, always with VX5-NIC-SFP28 (the 10Gb pair). Not offered on 1U servers.'),
  ('gpu', 'recorder', 'VX5-GPU-A1000',    1, 'GPU on: one per recording server. For Avigilon and Hanwha WAVE / Nx Witness recorders; workstations already include GPUs.'),
  ('gpu', 'failover', 'VX5-GPU-A1000',    1, 'GPU on: one per failover server. For Avigilon and Hanwha WAVE / Nx Witness recorders; workstations already include GPUs.')
on conflict (design_item, applies_to_role, sku) do nothing;
