-- Calculator math rework, Phases B + C and the D8 reversal — column COMMENTS only.
-- ADRs 0131, 0132, 0133. See docs/apply-notes/0131-calculator-math-phase-bc.md.
--
-- STOP AND FLAG: apply by hand via the Supabase dashboard SQL editor.
-- NOT `supabase db push` — several migrations on this project were applied by
-- hand and never recorded in remote history, so a push would try to re-run them.
--
-- THERE IS NO STRUCTURAL CHANGE IN THIS FILE. No column is added, dropped,
-- retyped or backfilled; no constraint, index or policy is touched. Both shapes
-- that changed are inside existing `jsonb` columns and need no DDL:
--
--   groups_payload.groups[].retentionDays   ADDED   (ADR 0132) — per-group retention
--   groups_payload.groups[].recordsAudioMetadata
--                                           STOPS BEING WRITTEN (ADR 0131).
--                                           Deliberately NOT stripped from banked
--                                           rows: an old row keeps what it
--                                           recorded, and nothing reads the field
--                                           any more.
--
-- What DOES need recording is that two scalar columns change MEANING at
-- calc_version 3, which is only discoverable from these comments:
--
--   calc_version     gains value 3. storage_tb moves again (the +5% audio/metadata
--                    term removed, the utilization default tightened 90% -> 88%),
--                    so the column is not comparable across the 2->3 boundary any
--                    more than across 1->2.
--
--   retention_days   was THE retention every group was sized at. From version 3 it
--                    is the LONGEST group retention, with the per-group values in
--                    groups_payload. Identical on a uniform project, which is every
--                    row written before this deploy.
--
-- Range guards deliberately NOT tightened. submissions_max_disk_utilization_pct_check
-- still admits 60..90 even though the app now writes at most 88: already-banked
-- version-2 rows hold 90 legitimately, and narrowing the check would make the
-- table's own history invalid. The app is the authority on the writable range.

comment on column public.submissions.calc_version is
  'Sizing model this row was produced by. 1 = pre-2026-08 (raw video x1.2, recommender x1.2, no binary charge, 0.2+0.8m motion blend). 2 = Phase A: re-anchored bitrate, motion as duty cycle, one Max-disk-utilization buffer defaulting to 90%, decimal->binary charged, +5% audio/metadata on the stream rate. 3 = Phases B/C: audio/metadata term REMOVED (ADR 0131), buffer default tightened to 88% to carry a storage-only cushion in its place, retention PER CAMERA GROUP (ADR 0132). storage_tb and retention_days both mean different things across these boundaries. NULL = version 1.';

comment on column public.submissions.retention_days is
  'Retention in days. On calc_version 1/2 rows: the single retention EVERY camera group was sized at. On version 3+: the LONGEST group retention, since retention is per group (ADR 0132) and the per-group values live in groups_payload.groups[].retentionDays. Identical either way on a uniform project. Consumers needing one number (admin list, Pipedrive "Retention Days", a deal relink) use this; consumers that can show a range derive it from the per-group figures instead.';

comment on column public.submissions.max_disk_utilization_pct is
  'Max disk utilization cap the quote was sized at (ADR 0126). required_available = recorded_data / (pct/100). NULL on calc_version 1 rows, which had no user-visible buffer. Written in 60..90 by version-2 code (default 90) and 60..88 by version-3 code (default 88, ADR 0131 — the tighter default carries a storage-only cushion in place of the removed audio/metadata term). The CHECK still admits 90 so banked version-2 rows stay valid.';

comment on column public.submissions.recorded_storage_tb is
  'Recorded footage in decimal TB, before the utilization buffer and the decimal->binary charge. Directly comparable to a Milestone or Genetec proposal storage line. On version 3+ this is modeled video exactly, with no adder of any kind (ADR 0131 removed the +5% audio/metadata term that used to sit on it). NULL on calc_version 1 rows.';
