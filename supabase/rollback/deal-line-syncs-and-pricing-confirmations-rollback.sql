-- Rollback for 20261016000005_deal_line_syncs_and_pricing_confirmations.sql (ADR 0155).
--
-- Both tables are new; nothing pre-existing references them.
--
-- DATA LOSS, and a safety cost: once Step 5 is live, deal_line_syncs is the only
-- record of which lines the portal already added to which deal, so a retry
-- after this rollback could add a line twice. Roll back only before Step 5 ships,
-- or turn PROJECT_DEAL_PRODUCTS off first. Dump first if rows exist:
--
--   copy (select * from public.deal_line_syncs)             to '/tmp/deal_line_syncs.csv'             with (format csv, header);
--   copy (select * from public.quote_pricing_confirmations) to '/tmp/quote_pricing_confirmations.csv' with (format csv, header);

drop table if exists public.quote_pricing_confirmations;
drop table if exists public.deal_line_syncs;
