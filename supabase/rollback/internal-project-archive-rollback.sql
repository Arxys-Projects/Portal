-- Rollback for 20260803000001_internal_project_archive.sql (ADR 0112).
--
-- The table is new and nothing else references it, so `drop table cascade`
-- removes the table, its index and all four policies in one step and touches no
-- pre-existing object. No column on `submissions` was added or altered by the
-- forward migration, which is the whole point of ADR 0112, so there is nothing
-- to restore there.
--
-- DATA LOSS: dropping this discards which projects were archived. Nothing else
-- is affected — no submission, quote, version or Pipedrive link ever depended on
-- an archive entry, and every archived project simply reappears in the /projects
-- queue. If the entries are worth keeping, dump them first:
--
--   copy (select * from public.submission_internal_archives)
--     to '/tmp/submission_internal_archives.csv' with (format csv, header);

drop table if exists public.submission_internal_archives cascade;
