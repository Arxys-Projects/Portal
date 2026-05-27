-- Rollback Phase 3 Step 5 — submission lifecycle + preferred + status-guarded delete.
-- Lives outside supabase/migrations/ so the CLI never auto-applies it.
-- Reverts the migration 20260527182010_step5_submission_lifecycle.sql.
-- No data restore needed: both columns are additive (existing rows had
-- status=NULL, is_preferred=false), so dropping them loses only Step 5 state.

drop policy if exists submissions_delete_own_draft on public.submissions;
drop policy if exists submissions_update_own on public.submissions;

revoke update, delete on public.submissions from authenticated;

alter table public.submissions drop column if exists is_preferred;
alter table public.submissions drop column if exists status;
