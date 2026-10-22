-- Project Portal backend, Step 4 (Phase A): the banked system design of a
-- project calc. ADR 0165.
--
-- ⚠ STOP-AND-FLAG: new table with RLS. Applied by hand by Andy; see
-- docs/apply-notes/0165-submission-system-designs.md.
-- Rollback: supabase/rollback/submission-system-designs-rollback.sql.
--
-- WHAT. One row per project calc: the resolved system design, the rules
-- snapshot it was resolved with, and the BOM, as the Step 3 engines returned
-- them at save (ADR 0158). A saved calc is displayed and reopened from this row;
-- the engines run again only on a new save.
--
-- WHY A SIDE TABLE (ADR 0158, security finding S-1). The engines trust a
-- well-typed design and snapshot, so whoever can write them controls the
-- add-ons and quantities on a quote. `authenticated` has table-wide INSERT and
-- UPDATE on `submissions` (baseline audit B1-S-2), so none of this is banked
-- there.
--
-- WRITE RULE: INSERT ONCE PER SUBMISSION, NEVER UPDATE. An edited calc is saved
-- as a new `submissions` row with parent_submission_id set (ADR 0093), and the
-- source row is not changed, so each banked design belongs to exactly one stored
-- calc. The primary key on submission_id allows one row; no role the API uses
-- holds UPDATE or DELETE. A row leaves only with its submission (cascade, which
-- runs with the table owner's rights).
--
-- WHO WRITES. Server code only, with the service role, after checking the
-- caller owns the submission. `authenticated` gets SELECT and nothing else. The
-- insert trigger repeats the ownership check in the database: created_by must be
-- the submission's partner_id and an active internal user or an admin, since
-- only internal callers make project calcs.

create table public.submission_system_designs (
  submission_id   uuid primary key references public.submissions(id) on delete cascade,
  -- ResolvedSystemDesign (src/lib/system-design/resolve.ts).
  resolved_design jsonb not null check (jsonb_typeof(resolved_design) = 'object'),
  -- DesignRulesSnapshot (src/lib/system-design/rules.ts).
  rules_snapshot  jsonb not null check (jsonb_typeof(rules_snapshot) = 'object'),
  -- BomLine[] (src/lib/system-design/bom.ts). No prices (ADR 0161).
  bom             jsonb not null check (jsonb_typeof(bom) = 'array'),
  -- The engine build that produced the three columns above.
  engine_version  text not null check (length(btrim(engine_version)) between 1 and 40),
  -- restrict, like submissions.partner_id: the creator's row outlives their calcs.
  created_by      uuid not null references public.partners(id) on delete restrict,
  created_at      timestamptz not null default now()
);

create index submission_system_designs_created_by_idx
  on public.submission_system_designs (created_by);

comment on table public.submission_system_designs is
  'ADR 0165: the resolved system design, rules snapshot and BOM banked for one '
  'project calc. Insert once per submission, never updated. Written by server '
  'code as service_role after an ownership check; internal and admin read.';

-- ---------------------------------------------------------------------------
-- Ownership check on insert. Runs for every role, the service role included,
-- because triggers are not bypassed the way RLS is.
--
-- SECURITY DEFINER because is_internal() and is_admin() grant EXECUTE to
-- `authenticated` only (20260515193702, 20261019000002), and the writer here is
-- service_role. Running as the owner keeps the check from depending on how
-- service_role's function grants happen to stand. A trigger function cannot be
-- called on its own, and EXECUTE is revoked below in any case.
-- ---------------------------------------------------------------------------

create or replace function public.submission_system_designs_check_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
begin
  select s.partner_id into owner_id
  from public.submissions s
  where s.id = new.submission_id;

  if owner_id is null or owner_id <> new.created_by then
    raise exception 'submission_system_designs: created_by must own the submission'
      using errcode = '42501';
  end if;

  if not (public.is_internal(new.created_by) or public.is_admin(new.created_by)) then
    raise exception 'submission_system_designs: only an active internal user or an admin can bank a system design'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.submission_system_designs_check_owner() from public, anon, authenticated;

create trigger trg_submission_system_designs_check_owner
  before insert on public.submission_system_designs
  for each row execute function public.submission_system_designs_check_owner();

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------

alter table public.submission_system_designs enable row level security;

-- Clear every default grant first (Supabase grants all three API roles full
-- table privileges on create), then add back only what each role needs.
revoke all on public.submission_system_designs from anon, authenticated, service_role;

grant select on public.submission_system_designs to authenticated;
grant select, insert on public.submission_system_designs to service_role;

create policy submission_system_designs_select_internal
on public.submission_system_designs for select
to authenticated
using (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())));
