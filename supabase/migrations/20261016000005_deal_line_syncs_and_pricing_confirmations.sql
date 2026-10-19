-- Project Portal backend, Step 1 (4 of 4): the deal-line write ledger and the
-- pricing confirmation that gates Project Quote generation. ADR 0155.
--
-- Independent of 000002 to 000004 (references submissions and partners only).
--
-- ⚠ STOP-AND-FLAG: new tables with RLS. Applied by hand by Andy; see
-- docs/apply-notes/0153-project-portal-schema.md.
-- Rollback: supabase/rollback/deal-line-syncs-and-pricing-confirmations-rollback.sql.
--
-- ACCESS. Internal-only (is_internal OR is_admin), ADR 0055 wrapping. Neither
-- table has a DELETE grant: both record what was sent to, or agreed about, a
-- Pipedrive deal, and Step 5's "never add a line twice" and Step 6's gate both
-- depend on rows not disappearing.

-- ---------------------------------------------------------------------------
-- deal_line_syncs: one row per BOM line the portal adds to a Pipedrive deal.
--
-- Step 5 writes the row as 'pending' before the POST, then marks it 'added'
-- (with the attachment id the POST returns) or 'failed' (with the error).
-- retryMissingLines() re-sends only pending / failed rows. The unique key on
-- (deal, sku, role) is what makes a retry unable to add a line twice.
-- ---------------------------------------------------------------------------

create table public.deal_line_syncs (
  id                        bigint generated always as identity primary key,
  pipedrive_deal_id         bigint not null check (pipedrive_deal_id > 0),
  -- restrict, like project_quotes: this records a write to an external system.
  submission_id             uuid not null references public.submissions(id) on delete restrict,
  sku                       text not null check (length(btrim(sku)) > 0),
  role                      text not null check (role in ('recorder', 'failover', 'mgmt', 'workstation')),
  qty                       integer not null check (qty > 0),
  pipedrive_product_id      bigint not null check (pipedrive_product_id > 0),
  -- The deal-product attachment id from POST /api/v2/deals/{id}/products.
  pipedrive_deal_product_id bigint check (pipedrive_deal_product_id is null or pipedrive_deal_product_id > 0),
  -- The Pipedrive product's own price, read at preview and sent verbatim
  -- (the API requires item_price). $0 lines are refused before this point.
  item_price_sent           numeric(12,2) not null check (item_price_sent > 0),
  status                    text not null default 'pending' check (status in ('pending', 'added', 'failed')),
  error                     text,
  created_by                uuid not null references public.partners(id) on delete restrict,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (pipedrive_deal_id, sku, role),
  check (status <> 'added' or pipedrive_deal_product_id is not null)
);

create index deal_line_syncs_submission_id_idx on public.deal_line_syncs (submission_id);
create index deal_line_syncs_open_idx
  on public.deal_line_syncs (pipedrive_deal_id) where status <> 'added';

comment on table public.deal_line_syncs is
  'ADR 0155: ledger of BOM lines the portal adds to a Pipedrive deal. Unique on '
  '(deal, sku, role) so a retry never adds a line twice. Internal-only; no delete.';

create trigger trg_deal_line_syncs_set_updated_at
  before update on public.deal_line_syncs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- quote_pricing_confirmations: the rep's "pricing is set" sign-off for a deal.
--
-- Insert-only history. The gate (Step 6) reads the latest row for the deal and
-- compares deal_lines_fingerprint with the deal's current lines; a mismatch
-- means someone edited the deal in Pipedrive after confirming, and the rep
-- confirms again (a new row). No UPDATE, so a confirmation cannot be rewritten.
-- ---------------------------------------------------------------------------

create table public.quote_pricing_confirmations (
  id                     bigint generated always as identity primary key,
  pipedrive_deal_id      bigint not null check (pipedrive_deal_id > 0),
  -- The submission the rep confirmed from. Informational: the gate keys on the
  -- deal, because revisions of one deal share it (ADR 0093).
  submission_id          uuid references public.submissions(id) on delete restrict,
  confirmed_by           uuid not null references public.partners(id) on delete restrict,
  confirmed_at           timestamptz not null default now(),
  -- The deal's lines at confirmation, in the normalized shape of
  -- src/lib/projects/line-items.ts.
  deal_lines_fingerprint jsonb not null check (jsonb_typeof(deal_lines_fingerprint) = 'array')
);

create index quote_pricing_confirmations_deal_idx
  on public.quote_pricing_confirmations (pipedrive_deal_id, confirmed_at desc);
create index quote_pricing_confirmations_submission_id_idx
  on public.quote_pricing_confirmations (submission_id) where submission_id is not null;

comment on table public.quote_pricing_confirmations is
  'ADR 0155: insert-only record that a rep confirmed a deal''s pricing, with a '
  'fingerprint of its lines. Gates Project Quote generation for portal-built '
  'deals. Internal-only.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.deal_line_syncs             enable row level security;
alter table public.quote_pricing_confirmations enable row level security;

revoke all on public.deal_line_syncs             from anon, authenticated;
revoke all on public.quote_pricing_confirmations from anon, authenticated;

grant select, insert, update on public.deal_line_syncs             to authenticated;
grant select, insert         on public.quote_pricing_confirmations to authenticated;

create policy deal_line_syncs_select_internal
on public.deal_line_syncs for select
to authenticated
using (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())));

create policy deal_line_syncs_insert_internal
on public.deal_line_syncs for insert
to authenticated
with check (
  (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())))
  and created_by = (select auth.uid())
);

-- Status transitions on retry. created_by is not re-checked: a second rep may
-- retry a line the first one started.
create policy deal_line_syncs_update_internal
on public.deal_line_syncs for update
to authenticated
using (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())))
with check (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())));

create policy quote_pricing_confirmations_select_internal
on public.quote_pricing_confirmations for select
to authenticated
using (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())));

create policy quote_pricing_confirmations_insert_internal
on public.quote_pricing_confirmations for insert
to authenticated
with check (
  (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())))
  and confirmed_by = (select auth.uid())
);
