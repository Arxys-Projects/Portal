-- Rollback Phase 8 Step C — internal user submissions SELECT policy.
-- Lives outside supabase/migrations/ so the CLI never auto-applies it.
-- Reverts the migration 20260604000002_internal_user_read_submissions.sql.

drop policy if exists submissions_select_internal on public.submissions;
