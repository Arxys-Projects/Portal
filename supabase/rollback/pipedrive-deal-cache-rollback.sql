-- Rollback for 20260803000002_pipedrive_deal_cache.sql (ADR 0113).
--
-- The table is new and nothing else references it, so `drop table cascade`
-- removes the table, its partial index and all three policies in one step and
-- touches no pre-existing object. No column on `submissions` was added or
-- altered by the forward migration.
--
-- CONSEQUENCE: dropping this removes every last-known Pipedrive value, so the
-- /projects rows lose their fallback and a failed read has nothing to fall back
-- to. The cache rebuilds itself on the next Refresh, so the loss is temporary
-- and self-healing rather than permanent — but until that refresh runs, rows for
-- unreachable deals render with no value, which is precisely the state
-- acceptance check 9 forbids. Roll this back with the /projects page disabled,
-- not under it.
--
-- Nothing here is a source of truth: every value is a copy of something
-- Pipedrive still holds.

drop table if exists public.pipedrive_deal_cache cascade;
