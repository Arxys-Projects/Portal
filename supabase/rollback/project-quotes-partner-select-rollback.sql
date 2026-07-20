-- Rollback for 20260720000001_project_quotes_partner_select.sql (ADR 0083).
--
-- Schema-only revert: restores the ADR 0059 internal-only SELECT policy on
-- public.project_quotes. No data restore is needed — the forward migration
-- touched no rows.
--
-- Run in the Supabase dashboard SQL editor (kept out of supabase/migrations/
-- so the CLI never auto-applies it).

drop policy if exists project_quotes_select_internal_or_owner on public.project_quotes;

create policy project_quotes_select_internal
on public.project_quotes for select
to authenticated
using (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())));
