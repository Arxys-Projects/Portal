-- Rollback for 20260914000002_v700_v800_match_v500_cpu.sql
--
-- READ THIS BEFORE RUNNING IT. This restores the state 20260914000002 corrected
-- — the V700 and V800 on the V400's AMD EPYC 9015 8C/16T part while still rated
-- at 275 cameras. That state is known to be WRONG. This file exists for
-- convention and completeness, not because rolling back to it is a sensible
-- destination.
--
-- If the intent is to undo the whole 2026-09-14 CPU refresh rather than just
-- this correction, run
-- supabase/rollback/v400-v700-v800-9015-cpu-refresh-rollback.sql instead. That
-- returns all three families to their genuine pre-refresh values, including the
-- V700/V800's original 4.3 GHz / PassMark 56984 part.
--
-- Values below captured live on 2026-09-14 immediately before 20260914000002.
-- max_cameras and max_cameras_h265 are not restored because 20260914000002
-- never changed them; they are 275 on both families either way.

update public.product_specs set
  cpu_model         = 'AMD EPYC 9005 Series',
  cpu_model_full    = 'AMD EPYC 9015 3.6Ghz 8/16 Core',
  cpu_cores_threads = '8C/16T',
  cores_threads     = '8C/16T',
  cpu_base_ghz      = 3.6,
  cpu_turbo_ghz     = '4.1 Ghz',
  cpu_passmark      = 30689,
  cpu_cache         = '64MB'
where id like 'VX5-V700-%' or id like 'VX5-V800-%';
