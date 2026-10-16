-- Rollback for 20261016000001_partners_guard_self_update.sql (ADR 0151).
--
-- Drops exactly the guard trigger and its function, and nothing else. The
-- partners policies, grants and trg_partners_set_updated_at were never touched
-- by the forward migration.
--
-- ⚠ This RE-OPENS the self-escalation hole: a signed-in partner can again set
-- role / is_internal / status / pipedrive_user_id on their own row. Run it only
-- if the guard is blocking a legitimate path, and fix forward quickly.

drop trigger if exists trg_partners_guard_self_update on public.partners;
drop function if exists public.partners_guard_self_update();
