-- Rollback for 20261019000001_failover_days_default_longest_retention.sql (ADR 0162).
--
-- Puts failover_days_fraction back to the Step 1 seed (0.5, half the longest
-- retention) with its original description. Guarded the same way as the forward
-- migration: the row changes only while it still holds 1, so a value an admin
-- has set since is left alone. The audit trigger records the change.

update public.system_design_rules
set value = '0.5'::jsonb,
    description = 'Default failover days as a fraction of the calc''s longest retention, rounded up. 0.5 means a calc with 30-day retention defaults to 15 failover days.'
where key = 'failover_days_fraction'
  and value = '1'::jsonb;
