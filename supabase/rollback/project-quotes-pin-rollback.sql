-- Rollback for 20261023000002_project_quotes_pin.sql (ADR 0174).
-- Lives outside supabase/migrations/ so the CLI never auto-applies it.
--
-- Reopens baseline row B1-S-4: an internal session can again insert a Project
-- Quote with any deal id or version. No data changes; rows inserted while the
-- trigger was on stay as they are.

drop trigger if exists trg_project_quotes_pin on public.project_quotes;
drop function if exists public.project_quotes_pin();
