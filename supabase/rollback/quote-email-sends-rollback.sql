-- Rollback for section 1 of 20261023000003_quote_email_sends_and_confirmations_lockdown.sql
-- (ADR 0175). Lives outside supabase/migrations/ so the CLI never auto-applies it.
--
-- DATA LOSS once the email is live: these rows are the only record of which
-- quote went to which address, and the only guard against sending it twice.
-- Dump first if rows exist:
--
--   copy (select * from public.quote_email_sends) to '/tmp/quote_email_sends.csv' with (format csv, header);
--
-- Turn PROJECT_QUOTE_EMAIL off before running this, or a send will fail on the
-- missing table after the SMTP call has been made.

drop table if exists public.quote_email_sends;
