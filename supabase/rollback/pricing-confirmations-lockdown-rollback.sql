-- Rollback for section 2 of 20261023000003_quote_email_sends_and_confirmations_lockdown.sql
-- (ADRs 0175, 0155). Lives outside supabase/migrations/ so the CLI never auto-applies it.
--
-- Reopens the hole: an internal session can again insert a confirmation with
-- any fingerprint over REST and pass the pricing gate. Turn PROJECT_QUOTE_GATE
-- off first.
--
-- Drops deal_lines (DATA LOSS: the lines each Step 6 confirmation was made
-- from). Dump first if rows carry it:
--
--   copy (select id, deal_lines from public.quote_pricing_confirmations where deal_lines is not null) to '/tmp/confirmation_deal_lines.csv' with (format csv, header);

alter table public.quote_pricing_confirmations drop column if exists deal_lines;

-- Restore Step 1's internal insert (20261016000005, verbatim).
grant insert on public.quote_pricing_confirmations to authenticated;

create policy quote_pricing_confirmations_insert_internal
on public.quote_pricing_confirmations for insert
to authenticated
with check (
  (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())))
  and confirmed_by = (select auth.uid())
);
