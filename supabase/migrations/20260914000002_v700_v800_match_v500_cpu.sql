-- V700 / V800 — correct the CPU back to the V500/V600 part.
--
-- FIXES A MISTAKE IN 20260914000001. That migration moved V400, V700 and V800
-- all onto the AMD EPYC 9015 (8C/16T). That was right for the V400 and wrong
-- for the V700 and V800: V500 through V800 share ONE CPU tier, and that tier is
-- the 16C/32T part the V500 and V600 already carry — not the V400's 8C/16T
-- part. Only the V400 moves to the 9015.
--
-- The error was visible in the data it produced and should have been caught
-- there: it left the V700 and V800 on an 8C/16T CPU while keeping them at 275
-- cameras, even though that same 8C/16T part caps the V400 at 150. Same
-- silicon, near-double the camera ceiling, is not a coherent spec.
--
-- This migration copies the V500's CPU columns onto V700 and V800 verbatim.
-- Values read live from VX5-V500-192 on 2026-09-14, after confirming all seven
-- V500 and V600 rows agree with each other column for column:
--
--   cpu_model         AMD EPYC 9005 Series
--   cpu_model_full    AMD EPYC 9005 3.3Ghz 16/32 Core
--   cpu_cores_threads 16C/32T          cores_threads  16C/32T
--   cpu_base_ghz      3.3              cpu_turbo_ghz  3.3 Ghz
--   cpu_passmark      48936            cpu_cache      64MB
--
-- NOT A REVERT of 20260914000001's V700/V800 statements. Their pre-9015 values
-- were a different part again (4.3 GHz, 4.25/4.55 Ghz turbo, PassMark 56984),
-- which is what supabase/rollback/v400-v700-v800-9015-cpu-refresh-rollback.sql
-- restores. The correct end state is the V500's part, matching neither the
-- 9015 nor the old V700/V800 figures.
--
-- NOT TOUCHED: max_cameras and max_cameras_h265 stay at 275 on both families —
-- that part of 20260914000001 was correct and matches V500/V600. The V400 rows
-- are not touched at all; their 9015 / 8C/16T / 150 data is correct.
--
-- Same ADR 0096 exception as 20260914000001: applied outside the admin form by
-- product-owner approval, audit rows land with updated_by = null, form
-- cross-field validation skipped, table check constraints still enforced.

-- V700 — 3 rows (384, 480, 576).
update public.product_specs set
  cpu_model         = 'AMD EPYC 9005 Series',
  cpu_model_full    = 'AMD EPYC 9005 3.3Ghz 16/32 Core',
  cpu_cores_threads = '16C/32T',
  cores_threads     = '16C/32T',
  cpu_base_ghz      = 3.3,
  cpu_turbo_ghz     = '3.3 Ghz',
  cpu_passmark      = 48936,
  cpu_cache         = '64MB'
where id like 'VX5-V700-%';

-- V800 — 3 rows (576, 720, 864).
update public.product_specs set
  cpu_model         = 'AMD EPYC 9005 Series',
  cpu_model_full    = 'AMD EPYC 9005 3.3Ghz 16/32 Core',
  cpu_cores_threads = '16C/32T',
  cores_threads     = '16C/32T',
  cpu_base_ghz      = 3.3,
  cpu_turbo_ghz     = '3.3 Ghz',
  cpu_passmark      = 48936,
  cpu_cache         = '64MB'
where id like 'VX5-V800-%';
