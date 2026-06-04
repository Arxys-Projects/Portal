-- Phase 7 Step 1 — internal "on behalf of" calculations.
--
-- An internal Arxys rep can run a sizing calc *for* a security partner. The
-- submission still belongs to its creator (partner_id = auth.uid()), but it
-- rolls up to a TARGET partner for grouping + the Pipedrive deal.
--
-- This migration is RLS-neutral: no policy changes. The existing creator-based
-- submissions_insert_self / submissions_select_own_or_admin policies already
-- cover on-behalf rows (the creator owns them; admins read across partners).

-- Authorization flag. company_name is not a trustworthy gate for "internal"
-- (it varies — "Arxys", "Arxys Tech"), so internal status is an explicit
-- boolean set at invite time and retrofittable by an admin.
alter table public.partners
  add column if not exists is_internal boolean not null default false;

-- Target-partner identity for an on-behalf submission. At most one is set:
--   * matched partner    → on_behalf_of_partner_id (FK to an existing partner)
--   * free-typed company → on_behalf_of_company_name (no partner row yet)
--   * normal self-serve  → both NULL
-- See ADR 0045.
alter table public.submissions
  add column if not exists on_behalf_of_partner_id uuid references public.partners(id),
  add column if not exists on_behalf_of_company_name text;

-- Enforce the "at most one set" invariant at the database level.
alter table public.submissions
  drop constraint if exists submissions_on_behalf_one_of;
alter table public.submissions
  add constraint submissions_on_behalf_one_of
  check (on_behalf_of_partner_id is null or on_behalf_of_company_name is null);

create index if not exists submissions_on_behalf_partner_idx
  on public.submissions(on_behalf_of_partner_id);
