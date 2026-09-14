-- Rollback for 20260914000001_v400_v700_v800_9015_cpu_refresh.sql
--
-- Restores the ten CPU/capacity columns that migration writes, and nothing
-- else. Every value below was captured by SELECT against production on
-- 2026-09-14, immediately before the migration was written — it is an exact
-- inverse of live data, NOT a reconstruction from the 20260529000001 seed or
-- the 20260818000001 NCD migration. Those files no longer describe these rows:
-- product_specs has been admin-edited since (ADR 0096).
--
-- Four statements rather than three, because the pre-change data is not
-- uniform inside a family:
--
--   1. VX5-V400-128 alone. It was already hand-edited to most of the 9015
--      numbers through the admin form on 2026-09-14 21:13 UTC
--      (product_specs_audit #97) before this migration was written, so its
--      pre-change state differs from its four V400 siblings. Restoring it to
--      the sibling values would silently discard that admin's edit.
--      Note its cpu_model_full reads 9005, not 9015 — that is the value that
--      was live, reproduced verbatim.
--   2. The other four V400 rows, which were untouched and still matched.
--   3. V700 — turbo 4.25 Ghz.
--   4. V800 — turbo 4.55 Ghz.  V700 and V800 shared a cpu_model_full string
--      but NOT a turbo figure, so they cannot be collapsed into one statement.
--
-- Non-destructive: no columns are dropped, no rows added or removed. Safe to
-- re-run (the values are absolute, not relative). Running it will append
-- further rows to product_specs_audit, also with updated_by = null.

-- 1. VX5-V400-128 — partially hand-migrated before the forward migration ran.
update public.product_specs set
  cpu_model         = 'AMD EPYC 9005 Series',
  cpu_model_full    = 'AMD EPYC 9005 3.6Ghz 8/16 Core',
  cpu_cores_threads = '8C/16T',
  cores_threads     = '8C/16T',
  cpu_base_ghz      = 3.6,
  cpu_turbo_ghz     = '4.1 Ghz',
  cpu_passmark      = 30689,
  cpu_cache         = '64MB',
  max_cameras       = 150,
  max_cameras_h265  = 150
where id = 'VX5-V400-128';

-- 2. The remaining V400 rows — base SKUs 160 and 192 plus both NCD variants.
update public.product_specs set
  cpu_model         = 'AMD EPYC 9005 Series',
  cpu_model_full    = 'AMD EPYC 9005 3.3Ghz 16/32 Core',
  cpu_cores_threads = '16C/32T',
  cores_threads     = '16C/32T',
  cpu_base_ghz      = 3.3,
  cpu_turbo_ghz     = '3.3 Ghz',
  cpu_passmark      = 48936,
  cpu_cache         = '64MB',
  max_cameras       = 200,
  max_cameras_h265  = 200
where id in ('VX5-V400-160', 'VX5-V400-192', 'VX5-V400-128-NCD', 'VX5-V400-192-NCD');

-- 3. V700 — 384, 480, 576.
update public.product_specs set
  cpu_model         = 'AMD EPYC 9005 Series',
  cpu_model_full    = 'AMD EPYC 9005 4.3Ghz 16/32 Core',
  cpu_cores_threads = '16C/32T',
  cores_threads     = '16C/32T',
  cpu_base_ghz      = 4.3,
  cpu_turbo_ghz     = '4.25 Ghz',
  cpu_passmark      = 56984,
  cpu_cache         = '64MB',
  max_cameras       = 325,
  max_cameras_h265  = 325
where id like 'VX5-V700-%';

-- 4. V800 — 576, 720, 864. Same CPU string as the V700, different turbo.
update public.product_specs set
  cpu_model         = 'AMD EPYC 9005 Series',
  cpu_model_full    = 'AMD EPYC 9005 4.3Ghz 16/32 Core',
  cpu_cores_threads = '16C/32T',
  cores_threads     = '16C/32T',
  cpu_base_ghz      = 4.3,
  cpu_turbo_ghz     = '4.55 Ghz',
  cpu_passmark      = 56984,
  cpu_cache         = '64MB',
  max_cameras       = 325,
  max_cameras_h265  = 325
where id like 'VX5-V800-%';
