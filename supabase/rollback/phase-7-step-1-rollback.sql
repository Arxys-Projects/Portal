-- Rollback Phase 7 Step 1 — internal "on behalf of" calculations.
-- Lives outside supabase/migrations/ so the CLI never auto-applies it.
-- Reverts the migration 20260604000001_phase7_on_behalf.sql.
-- No data restore needed: all three columns are additive (existing rows had
-- on_behalf_of_* = NULL and is_internal = false), so dropping them loses only
-- Phase 7 Step 1 state.

alter table public.submissions
  drop constraint if exists submissions_on_behalf_one_of;

drop index if exists public.submissions_on_behalf_partner_idx;

alter table public.submissions drop column if exists on_behalf_of_company_name;
alter table public.submissions drop column if exists on_behalf_of_partner_id;

alter table public.partners drop column if exists is_internal;
