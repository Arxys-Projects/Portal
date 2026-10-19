-- Rollback for 20261016000006_company_sync_includes.sql (ADR 0156).
--
-- The table is new and nothing references it. Dropping it removes its policies.
-- Companies the sync already imported through the list stay; the next sync run
-- marks them inactive, because without the list only labeled orgs qualify.
--
-- DATA LOSS: the list itself (a handful of org ids and reasons). Dump first:
--
--   copy (select * from public.company_sync_includes) to '/tmp/company_sync_includes.csv' with (format csv, header);

drop table if exists public.company_sync_includes;
