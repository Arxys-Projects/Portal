-- Rollback for 20261022000002_submissions_guard_writes.sql (ADR 0167).
--
-- Drops exactly the guard trigger and its function, and nothing else. The
-- submissions policies, grants, is_admin() and is_internal() were never
-- touched by the forward migration.
--
-- ⚠ This RE-OPENS the hole: a signed-in partner can again write
-- pipedrive_deal_id (and so overwrite any Pipedrive deal through a revise),
-- on_behalf_of_partner_id (sharing a row into another partner's pipeline and,
-- under ADR 0152, the Project Portal), parent_submission_id, created_at and the
-- banked figures, and reopen a won or lost row. Run it only if the guard is
-- blocking a legitimate path, and fix forward quickly.
--
-- The app change that shipped with ADR 0167 (service-role stamps, the
-- internal-creator check on "Prepared by Arxys") is safe with or without the
-- guard, so it does not need reverting.

drop trigger if exists trg_submissions_guard_writes on public.submissions;
drop function if exists public.submissions_guard_writes();
