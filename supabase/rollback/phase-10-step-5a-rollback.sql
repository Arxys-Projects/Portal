-- Rollback for 20260616000002_phase10_project_quotes.sql
--
-- Drops the Project Quote snapshot table introduced in Phase 10 Step 5a: its
-- two RLS policies, the deal index, and the table itself (dropping the table
-- also removes the unique (submission_id, version) constraint / index and the
-- two foreign keys). No helper function or view was created for the
-- derived-"current" read (it is a documented query, not a view), so there is
-- nothing else to drop. The shared is_internal / is_admin helpers are
-- pre-existing and left untouched.

drop policy if exists project_quotes_insert_internal on public.project_quotes;
drop policy if exists project_quotes_select_internal on public.project_quotes;
drop index if exists public.project_quotes_deal_idx;
drop table if exists public.project_quotes;
