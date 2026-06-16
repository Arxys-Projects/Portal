-- Rollback for 20260616000001_phase10_camera_search_rpc.sql
--
-- Drops only the search RPC added in Step 3. The camera_specs table, its
-- indexes, the camera_aliases_text helper, and pg_trgm all belong to Step 1 and
-- are left untouched (use phase-10-step-1-rollback.sql to remove those).

drop function if exists public.search_camera_specs(text, text, integer);
