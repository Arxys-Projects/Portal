-- Calculator math rework, Phase A — submissions sizing-model columns.
-- ADRs 0123–0128. See docs/apply-notes/0123-calculator-math-phase-a.md.
--
-- STOP AND FLAG: apply by hand via the Supabase dashboard SQL editor.
-- NOT `supabase db push` — several migrations on this project were applied by
-- hand and never recorded in remote history, so a push would try to re-run them.
--
-- Purely additive. Three nullable columns; no existing column, value, index,
-- policy or constraint is touched, and every existing row stays valid untouched.
--
-- Why these exist:
--
--   calc_version              submissions.storage_tb CHANGES MEANING at Phase A.
--                             It used to bank raw video × 1.2, with a second
--                             ×1.2 applied later in the recommender and the
--                             decimal→binary conversion never charged at all.
--                             It now banks required decimal RAID-net capacity —
--                             recorded data with the buffer and the binary
--                             charge already in it. Nothing downstream
--                             recomputes (audit §Q7), so already-issued
--                             documents are safe, but the column is not
--                             comparable across the boundary without this stamp.
--                             Existing rows are version 1. Deliberately NOT
--                             backfilled with a buffer value: no single
--                             utilization setting reproduces the old ×1.44 under
--                             the new semantics.
--
--   max_disk_utilization_pct  The project's ONE buffer (ADR 0126), 60–90, so a
--                             document rendered from this row can state the
--                             margin it was sized at instead of implying one.
--                             NULL on pre-Phase-A rows, which had no equivalent
--                             setting — render those as "not recorded", never as
--                             the current default.
--
--   recorded_storage_tb       The Milestone-comparable figure: footage only, no
--                             buffer, no binary charge. Banked so a partner can
--                             set it beside a Milestone or Genetec proposal's
--                             storage line without re-deriving it. NULL on
--                             pre-Phase-A rows.

alter table public.submissions
  add column if not exists calc_version integer,
  add column if not exists max_disk_utilization_pct integer,
  add column if not exists recorded_storage_tb numeric(10,2);

-- Range guards only. Both are NOT VALID so the statement never scans the
-- existing table, and NULL passes either way — pre-Phase-A rows are untouched
-- and stay valid. New writes are checked from the moment this lands.
alter table public.submissions
  add constraint submissions_calc_version_check
  check (calc_version is null or calc_version >= 1) not valid;

alter table public.submissions
  add constraint submissions_max_disk_utilization_pct_check
  check (
    max_disk_utilization_pct is null
    or (max_disk_utilization_pct between 60 and 90)
  ) not valid;

alter table public.submissions
  add constraint submissions_recorded_storage_tb_check
  check (recorded_storage_tb is null or recorded_storage_tb >= 0) not valid;

comment on column public.submissions.calc_version is
  'Sizing model this row was produced by. 1 = pre-2026-08 (raw video x1.2, recommender x1.2, no binary charge, 0.2+0.8m motion blend). 2 = Phase A: re-anchored bitrate, motion as duty cycle, one Max-disk-utilization buffer, decimal->binary charged. storage_tb means different things either side. NULL = version 1.';

comment on column public.submissions.max_disk_utilization_pct is
  'Max disk utilization cap the quote was sized at, 60-90 (ADR 0126). required_available = recorded_data / (pct/100). NULL on calc_version 1 rows, which had no user-visible buffer.';

comment on column public.submissions.recorded_storage_tb is
  'Recorded footage in decimal TB, before the utilization buffer and the decimal->binary charge. Directly comparable to a Milestone or Genetec proposal storage line. NULL on calc_version 1 rows.';
