-- Rollback for 20261016000002_project_companies_contacts.sql (ADR 0153).
--
-- Roll back 20261016000003 (projects) FIRST: projects and project_contacts
-- reference companies and contacts, and `drop ... cascade` here would silently
-- drop their foreign keys instead of failing.
--
-- All four tables are new; nothing pre-existing references them. Dropping them
-- removes their indexes, triggers and policies. No pre-existing object changes.
--
-- DATA LOSS: the synced companies / contacts (re-creatable by re-running the
-- Step 2 sync), the aliases and the login-to-contact links (re-creatable only
-- from the approved mapping). Dump the last two first if they matter:
--
--   copy (select * from public.company_name_aliases)  to '/tmp/company_name_aliases.csv'  with (format csv, header);
--   copy (select * from public.partner_contact_links) to '/tmp/partner_contact_links.csv' with (format csv, header);

drop table if exists public.partner_contact_links;
drop table if exists public.contacts;
drop table if exists public.company_name_aliases;
drop table if exists public.companies;
