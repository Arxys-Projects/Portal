-- Project Portal backend, Step 6: the "Quote ready" email send log, and pricing
-- confirmations become server-written only. ADR 0175 (amends ADR 0155).
--
-- ⚠ STOP-AND-FLAG: a new table with RLS, and quote_pricing_confirmations loses
-- its authenticated INSERT. Applied by hand by Andy. Rollbacks:
--   supabase/rollback/quote-email-sends-rollback.sql (section 1)
--   supabase/rollback/pricing-confirmations-lockdown-rollback.sql (section 2)
--
-- 1. quote_email_sends. sendQuoteReadyEmail (Step 6 Phase B) inserts the row
--    as 'sending' BEFORE the SMTP call, then marks it 'sent' or 'failed'. The
--    unique key on (project_quote_id, to_email) makes a double click find the
--    first row and stop, so one quote goes to one address once. A 'failed' row,
--    or a 'sending' row a crash left behind, blocks that address until Andy
--    clears it with scripts/resolve-quote-email-send.mts (written in Phase B,
--    modeled on scripts/resolve-project-deal-claim.mts, ADR 0170). There is no
--    automatic retry and no resend in Step 6.
--
--    Written by server code as service_role only, as the ledger and the deal
--    claim are (ADR 0171). Internal and admin sessions read it.
--
-- 2. quote_pricing_confirmations. ADR 0155 let an internal session INSERT a
--    confirmation as itself, so any rep could post one with an arbitrary
--    fingerprint over REST and pass the Step 6 pricing gate without the deal's
--    lines ever being read. confirmDealPricing (Phase B) writes the row as
--    service_role after it checks the actor and reads the deal. Internal and
--    admin keep SELECT. The row also gains deal_lines: the deal's lines exactly
--    as read when the fingerprint was computed.

-- ---------------------------------------------------------------------------
-- 1. quote_email_sends
-- ---------------------------------------------------------------------------

create table public.quote_email_sends (
  id               bigint generated always as identity primary key,
  -- restrict: a quote that was emailed keeps its send record.
  project_quote_id uuid not null references public.project_quotes(id) on delete restrict,
  -- The address actually used, lowercased by the server before the insert.
  to_email         text not null check (to_email = lower(to_email) and position('@' in to_email) > 1),
  sent_by          uuid not null references public.partners(id) on delete restrict,
  status           text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  error            text,
  created_at       timestamptz not null default now(),
  unique (project_quote_id, to_email)
);

create index quote_email_sends_sent_by_idx on public.quote_email_sends (sent_by);

comment on table public.quote_email_sends is
  'ADR 0175: one row per Quote ready email, inserted as sending before the SMTP '
  'call. Unique per quote and address, so a quote reaches an address once. '
  'Written by server code as service_role; internal sessions read it.';

alter table public.quote_email_sends enable row level security;

-- Clear every default grant first, then add back only what each role needs.
revoke all on public.quote_email_sends from anon, authenticated, service_role;

grant select on public.quote_email_sends to authenticated;
-- delete: only Andy's clear script uses it, on a failed or stuck row.
grant select, insert, update, delete on public.quote_email_sends to service_role;

create policy quote_email_sends_select_internal
on public.quote_email_sends for select
to authenticated
using (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())));

-- ---------------------------------------------------------------------------
-- 2. quote_pricing_confirmations: server-written only, and the lines it read
-- ---------------------------------------------------------------------------

drop policy if exists quote_pricing_confirmations_insert_internal on public.quote_pricing_confirmations;
revoke insert on public.quote_pricing_confirmations from authenticated;

-- Nullable: rows written before Step 6 have none. confirmDealPricing always
-- writes it.
alter table public.quote_pricing_confirmations
  add column deal_lines jsonb check (deal_lines is null or jsonb_typeof(deal_lines) = 'array');

comment on column public.quote_pricing_confirmations.deal_lines is
  'ADR 0175: the deal''s lines as read from Pipedrive when deal_lines_fingerprint was computed.';
