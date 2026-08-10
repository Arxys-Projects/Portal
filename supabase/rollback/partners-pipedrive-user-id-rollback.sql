-- Rollback for 20260810000001_partners_pipedrive_user_id.sql (ADR 0118).
--
-- Drops partners.pipedrive_user_id. Schema-only; the forward migration
-- touched no rows and nothing else depends on the column — no index, no
-- constraint, no policy, no view. Run in the Supabase dashboard SQL editor
-- (kept out of supabase/migrations/ so the CLI never auto-applies it).
--
-- IT DOES DESTROY DATA: whichever numeric ids were entered on Andy's and
-- Richard's rows are gone with the column. That data is trivial to
-- re-enter (see docs/apply-notes/0118-partners-pipedrive-user-id.md), so no
-- backup step is required before running this.
--
-- After running this, deal creation is unaffected in the sense that it still
-- succeeds — resolveOwnerIdForCreator() falls back to the existing
-- single-owner default for every submitter once the column (and therefore
-- every stored id) is gone. Roll the code back with it if you don't want that
-- fallback behavior either; the code tolerates the column's absence exactly
-- like it tolerates a null value in that column (`callerStatus.pipedrive_user_id`
-- returns undefined, which resolveOwnerIdForCreator's guard treats as unset).

alter table public.partners
  drop column if exists pipedrive_user_id;
