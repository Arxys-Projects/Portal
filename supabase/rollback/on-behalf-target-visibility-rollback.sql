-- Rollback for 20260612155238_on_behalf_target_visibility.sql
--
-- Drops exactly the one additive SELECT policy added by that migration and
-- nothing else. submissions_select_own_or_admin and submissions_select_internal
-- are untouched; no columns, no mutating policies.

drop policy if exists submissions_select_on_behalf_target on public.submissions;
