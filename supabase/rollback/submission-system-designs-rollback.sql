-- Rollback for 20261022000001_submission_system_designs.sql (ADR 0165).
--
-- The table is new; nothing pre-existing references it.
--
-- DATA LOSS once Phase B is live: these rows are the only record of the system
-- design, rules snapshot and BOM each project calc was saved with. Resolving
-- again uses today's rules and catalog, so a reopened calc could differ from
-- the quote that was issued. Dump first if rows exist:
--
--   copy (select * from public.submission_system_designs) to '/tmp/submission_system_designs.csv' with (format csv, header);

drop table if exists public.submission_system_designs;
drop function if exists public.submission_system_designs_check_owner();
