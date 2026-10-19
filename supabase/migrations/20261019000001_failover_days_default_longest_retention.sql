-- Project Portal: failover days default to the calc's LONGEST retention, not
-- half of it (Andy, 2026-10-19). ADR 0162.
--
-- The default is the admin-edited rule `failover_days_fraction` (ADR 0154),
-- which resolveSystemDesign reads as ceil(longest retention x fraction). A value
-- of 1 makes the default the longest retention itself. No code change: the
-- engine already accepts any fraction above 0 and up to 1.
--
-- Data only: one row of system_design_rules. No schema and no RLS change.
-- Applied by hand by Andy in the SQL editor. The row's stamp trigger sets
-- updated_at (updated_by stays null from the SQL editor), and the audit trigger
-- records the before and after in design_rules_audit.
--
-- Guarded: the row changes only while it still holds the seeded 0.5, so this
-- never overwrites a value an admin set on purpose. Expect "UPDATE 1" the first
-- time and "UPDATE 0" on any re-run. Check afterwards:
--
--   select key, value, description, updated_at
--   from public.system_design_rules where key = 'failover_days_fraction';
--
-- Rollback: supabase/rollback/failover-days-default-longest-retention-rollback.sql.

update public.system_design_rules
set value = '1'::jsonb,
    description = 'Default failover days as a fraction of the calc''s longest retention, rounded up. 1 means the failover days default to the longest retention itself: a calc with 30-day retention defaults to 30 failover days.'
where key = 'failover_days_fraction'
  and value = '0.5'::jsonb;
