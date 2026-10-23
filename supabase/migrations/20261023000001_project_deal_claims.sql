-- Project Portal backend, Step 5: the claim that stops a project calc from
-- creating two Pipedrive deals, and the ledger's in-flight status. ADRs 0170, 0171.
--
-- ⚠ STOP-AND-FLAG: new table with RLS, a CHECK change on deal_line_syncs, and
-- deal_line_syncs loses its authenticated INSERT / UPDATE (section 2).
-- Applied by hand by Andy. Rollback: supabase/rollback/project-deal-claims-rollback.sql.
--
-- 1. project_deal_claims. createProjectDeal (src/lib/projects/project-deal.ts)
--    inserts the claim BEFORE POST /api/v2/deals and records the deal id after.
--    A claim with no deal id means a create may have reached Pipedrive, so the
--    portal refuses and never retries the create on its own.
--
--    Two unique keys:
--      * lineage_root_submission_id: a double click, or a create from any
--        revision of the same calc (parent_submission_id, ADR 0093), hits it.
--      * project_id: one portal-built deal per project in Step 5 (Andy,
--        2026-10-23). parent_submission_id is `on delete set null`, so deleting
--        a middle revision would make its child a new root with a new key; the
--        project key still refuses it. Revisit when options and phases land.
--
--    The root submission is referenced `on delete restrict`, so the calc a
--    claim hangs off cannot be deleted from under it.
--
--    Once a claim holds a deal id, neither the id nor the row can change or go
--    (trigger below). A claim with no deal id can be deleted: the portal does
--    that when Pipedrive answers a create with a definite refusal, and Andy's
--    script (scripts/resolve-project-deal-claim.mts) does it on a stuck claim.
--
-- 2. deal_line_syncs.status gains 'sending'. retryMissingLines claims each row
--    with a conditional update from pending / failed to sending and posts only
--    the rows it claimed, so two retries at once cannot both post one line.
--    The ledger becomes server-written only: internal sessions keep SELECT.

-- ---------------------------------------------------------------------------
-- 1. project_deal_claims
-- ---------------------------------------------------------------------------

create table public.project_deal_claims (
  id                         bigint generated always as identity primary key,
  project_id                 uuid not null unique references public.projects(id) on delete restrict,
  lineage_root_submission_id uuid not null unique references public.submissions(id) on delete restrict,
  -- The calc the deal was built from (the lineage leaf at create time).
  submission_id              uuid not null references public.submissions(id) on delete restrict,
  pipedrive_deal_id          bigint unique check (pipedrive_deal_id is null or pipedrive_deal_id > 0),
  -- The preview fingerprint the rep confirmed (DealLineFingerprint[]). A retry
  -- that has to seed missing ledger rows refuses unless a fresh preview matches it.
  confirmed_fingerprint      jsonb not null check (jsonb_typeof(confirmed_fingerprint) = 'array'),
  claimed_by                 uuid not null references public.partners(id) on delete restrict,
  claimed_at                 timestamptz not null default now(),
  deal_linked_at             timestamptz,
  check ((pipedrive_deal_id is null) = (deal_linked_at is null))
);

create index project_deal_claims_submission_id_idx on public.project_deal_claims (submission_id);
create index project_deal_claims_claimed_by_idx on public.project_deal_claims (claimed_by);

comment on table public.project_deal_claims is
  'ADR 0170: one row per portal-built Pipedrive deal, inserted before the create. '
  'Unique per project and per revision lineage. A row with no deal id means the '
  'create may have reached Pipedrive. Written by server code as service_role.';

-- A recorded deal id is permanent: no change, no clearing, no delete.
create or replace function public.project_deal_claims_keep_deal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.pipedrive_deal_id is not null then
      raise exception 'project_deal_claims: a claim that holds a deal id cannot be deleted'
        using errcode = '42501';
    end if;
    return old;
  end if;
  if old.pipedrive_deal_id is not null
     and (new.pipedrive_deal_id is distinct from old.pipedrive_deal_id
          or new.deal_linked_at is distinct from old.deal_linked_at) then
    raise exception 'project_deal_claims: the deal id of a claim cannot change once set'
      using errcode = '42501';
  end if;
  if new.project_id is distinct from old.project_id
     or new.claimed_at is distinct from old.claimed_at
     or new.lineage_root_submission_id is distinct from old.lineage_root_submission_id
     or new.submission_id is distinct from old.submission_id
     or new.claimed_by is distinct from old.claimed_by
     or new.confirmed_fingerprint is distinct from old.confirmed_fingerprint then
    raise exception 'project_deal_claims: only the deal id and its link time can be set'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.project_deal_claims_keep_deal() from public, anon, authenticated;

create trigger trg_project_deal_claims_keep_deal
  before update or delete on public.project_deal_claims
  for each row execute function public.project_deal_claims_keep_deal();

alter table public.project_deal_claims enable row level security;

-- Clear every default grant first, then add back only what each role needs.
revoke all on public.project_deal_claims from anon, authenticated, service_role;

grant select on public.project_deal_claims to authenticated;
grant select, insert, update, delete on public.project_deal_claims to service_role;

create policy project_deal_claims_select_internal
on public.project_deal_claims for select
to authenticated
using (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())));

-- ---------------------------------------------------------------------------
-- 2. deal_line_syncs: add 'sending', and writes go through the server only
-- ---------------------------------------------------------------------------

alter table public.deal_line_syncs drop constraint deal_line_syncs_status_check;
alter table public.deal_line_syncs add constraint deal_line_syncs_status_check
  check (status in ('pending', 'sending', 'added', 'failed'));

-- Step 1 (ADR 0155) let an internal session insert and update ledger rows.
-- Step 5 writes the ledger only as service_role, and a retry posts each row's
-- product and quantity, so a row edited over REST would put a product or a
-- quantity on a deal outside the preview and confirm flow (review gate S-1).
-- Internal and admin keep SELECT.
drop policy if exists deal_line_syncs_insert_internal on public.deal_line_syncs;
drop policy if exists deal_line_syncs_update_internal on public.deal_line_syncs;
revoke insert, update on public.deal_line_syncs from authenticated;
