-- Rollback for 20260812000001_calculator_math_phase_a.sql (ADRs 0123–0128).
--
-- Drops the three additive columns and their range guards. Safe to run: nothing
-- else reads them, and every pre-Phase-A row already carried NULL in all three.
--
-- WHAT THIS DOES NOT UNDO: the coefficient and formula changes live in code, not
-- in the schema. Rolling this back while Phase A code is deployed would leave
-- calculator writes failing on the missing columns. Roll the code back first.
--
-- Rows written under Phase A keep their storage_tb values, which were produced
-- by the new model. After this runs there is no stamp left to distinguish them
-- from version-1 rows — that is the cost of the rollback and the reason to
-- prefer rolling code forward over dropping these columns.

alter table public.submissions
  drop constraint if exists submissions_calc_version_check,
  drop constraint if exists submissions_max_disk_utilization_pct_check,
  drop constraint if exists submissions_recorded_storage_tb_check;

alter table public.submissions
  drop column if exists calc_version,
  drop column if exists max_disk_utilization_pct,
  drop column if exists recorded_storage_tb;
