-- Rollback for 20261016000004_system_design_rules.sql (ADR 0154).
--
-- All three tables and four functions are new; nothing pre-existing references
-- them. Dropping the tables removes their triggers and policies.
--
-- DATA LOSS: any admin edits to the rules and their audit history. The seeds
-- come back by re-running the forward migration. Dump first if rules were
-- edited:
--
--   copy (select * from public.design_rules_audit) to '/tmp/design_rules_audit.csv' with (format csv, header);

drop table if exists public.bom_rules;
drop table if exists public.system_design_rules;
drop table if exists public.design_rules_audit;
drop function if exists public.design_rules_write_audit();
drop function if exists public.design_rules_stamp_updated();
drop function if exists public.bom_rules_check_sku();
