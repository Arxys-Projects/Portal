-- ADR 0113 — cached Pipedrive deal reads with a last-known-value fallback.
--
-- `/projects` renders, per row, the deal's status, value and line-item count, and
-- it must satisfy two requirements that pull in opposite directions:
--
--   * "Pipedrive read failure shows last known values plus the stale marker,
--     never blanks or zeros" (acceptance check 9). A point-in-time read cannot
--     do that — when it fails there is nothing to fall back TO. Something has to
--     have been written down earlier.
--   * The queue is one screen of N projects. Reading N deals live on every page
--     load is two HTTP round-trips per row against a rate-limited API, on a page
--     whose own design already says reads are on-demand: the mockup shows
--     "Read today at 9:42 AM" beside a "↻ Refresh" control, which is only
--     meaningful if the number on screen came from a cache.
--
-- So: one row per Pipedrive deal holding the last SUCCESSFUL read, plus the last
-- FAILED attempt recorded alongside it rather than overwriting it. A plain queue
-- load performs zero Pipedrive calls and reads only this table; the Refresh
-- control (and the first load for a deal never read before) does the live reads
-- and upserts here. See src/lib/projects/pipedrive-cache.ts.
--
-- Keyed by pipedrive_deal_id, NOT by submission_id: a revision reuses its
-- source's deal (ADR 0098), so several submissions can point at one deal and
-- keying by submission would read and store the same deal repeatedly. bigint
-- matches submissions.pipedrive_deal_id and project_quotes.pipedrive_deal_id.
--
-- WHY NOT columns on `submissions`: same two reasons as ADR 0112's archive
-- table, plus a third. (1) A partner can SELECT and (2) UPDATE arbitrary columns
-- of their own submission rows through PostgREST, and this table carries deal
-- pricing. (3) The natural key is the deal, not the submission, so columns on
-- submissions would duplicate one deal's values across every revision of it and
-- let them drift apart.
--
-- LINE-ITEM DRIFT. The spec wants "a timestamp of the deal's last line-item
-- change". Pipedrive's v1 deal-products payload has no dependable per-line
-- change timestamp — an added line carries add_time, but a DELETED line leaves
-- nothing behind at all, so the one signal that matters most is unobservable
-- from the API. This table therefore records an OBSERVED change instead:
-- `line_items` holds a normalised fingerprint of the lines as last read, and
-- when a refresh sees a different fingerprint, `line_items_changed_at` is set to
-- that read's timestamp. It is honest about what it is (when WE first saw the
-- change, not when Pipedrive changed it) and it is monotonic.
--
-- The authoritative "v2 no longer matches the deal" signal is separate and needs
-- no storage: the count of differing lines is a diff of this fingerprint against
-- the frozen line items already inside project_quotes.snapshot.commercial. Both
-- are computed in code (src/lib/projects/pipedrive-cache.ts), not in SQL.

create table public.pipedrive_deal_cache (
  pipedrive_deal_id     bigint primary key,

  -- ------------------------------------------------------------------------
  -- Last known values. Every one is nullable, and they are nullable together:
  -- a row created by a FAILED first read has no last-known anything, which is
  -- the only case where the UI may legitimately show no value at all. Once a
  -- successful read has landed these are never nulled back out — a later
  -- failure updates the failure columns and leaves these alone. That
  -- write-only-on-success rule is the entire "never blank, never zero"
  -- guarantee, and it lives in the upsert (pipedrive-cache.ts), because SQL
  -- cannot express "unless this write is a failure".
  -- ------------------------------------------------------------------------

  -- Pipedrive's own deal status, distinct from submissions.status (the
  -- portal-only open/won/lost of ADR 0081, which is never synced to Pipedrive).
  -- The two are modelled separately on purpose and can legitimately disagree.
  -- 'deleted' is included because Pipedrive returns it for a deal in the bin.
  deal_status           text check (deal_status is null or deal_status in ('open', 'won', 'lost', 'deleted')),
  -- The deal `value`, verbatim. numeric(14,2) rather than submissions'
  -- numeric(12,2): this is a whole-deal figure that has already been seen above
  -- $6.5M in the design mockup, and headroom is free. Display only — never
  -- recomputed, in line with the Pipedrive-owns-pricing rule (ADR 0059).
  deal_value            numeric(14,2),
  currency              text,
  -- Gates the primary action: 0 line items means generation is refused, because
  -- generating early burns a version number and produces a wrong PDF.
  line_item_count       integer check (line_item_count is null or line_item_count >= 0),
  -- Normalised fingerprint of the lines as last read: a jsonb array of
  -- { productId, code, name, quantity, unitPrice, lineAmount }, sorted by
  -- orderNr then productId so the comparison is order-stable. Deliberately not
  -- the raw Pipedrive payload — this is a comparison basis, and the frozen
  -- record of what a quote contained is already project_quotes.snapshot.
  line_items            jsonb,
  -- Pipedrive's deal update_time, verbatim. Captured for diagnostics; it moves
  -- for edits that have nothing to do with line items, so it is NOT the drift
  -- signal.
  deal_update_time      timestamptz,
  -- The read at which `line_items` was first observed to differ from the
  -- previously stored fingerprint. Null while only one fingerprint has ever
  -- been seen (including the very first read — a first sighting is not a
  -- change).
  line_items_changed_at timestamptz,
  -- Timestamp of the last SUCCESSFUL read: the "as of" the UI renders and the
  -- basis for "Read today at 9:42 AM". Null until one succeeds.
  read_at               timestamptz,

  -- ------------------------------------------------------------------------
  -- Failure state, kept ALONGSIDE the last known values rather than replacing
  -- them. read_ok is derived, not stored (the same derived-not-stored discipline
  -- as ADR 0061's version currency and quote expiry):
  --   read_ok = last_failed_at is null or (read_at is not null and read_at >= last_failed_at)
  -- ------------------------------------------------------------------------

  last_failed_at        timestamptz,
  -- The classified QuoteError kind plus message from the failed attempt, for the
  -- operator. Not rendered on the row — the row shows only the stale marker.
  last_error            text,

  created_at            timestamptz not null default now()
);

comment on table public.pipedrive_deal_cache is
  'ADR 0113 — last known Pipedrive deal read, one row per deal. A /projects '
  'queue load reads this table and makes no Pipedrive calls; the Refresh control '
  'performs the live reads and upserts here. Last-known columns are written only '
  'on a successful read, so a failure updates last_failed_at / last_error and '
  'leaves the values intact — that is what makes "never blank, never zero" hold. '
  'read_ok is derived, never stored.';

-- Band C sums the cached value across open deals and renders the OLDEST
-- contributing read as its "as of", so the sum is never presented as fresher
-- than its stalest input. Partial index: won / lost / deleted deals contribute
-- to neither the sum nor its timestamp.
create index pipedrive_deal_cache_open_read_at_idx
  on public.pipedrive_deal_cache(read_at)
  where deal_status = 'open';

-- ---------------------------------------------------------------------------
-- RLS — INTERNAL-ONLY, modelled on project_quotes (20260616000002).
--
-- The row holds deal pricing and product names, so it is gated the same way the
-- quote snapshots are: is_internal OR is_admin, never opened to authenticated
-- partners like the read-open reference tables. No customer PII is stored here
-- (no org, no person) — that stays in project_quotes.snapshot.
--
-- SELECT / INSERT / UPDATE are granted because the refresh is an upsert. There
-- is no DELETE policy and no DELETE grant: a cache entry is the last-known
-- fallback, and deleting one is exactly the "value goes blank" outcome the
-- feature exists to prevent. Stale entries for dead deals are harmless.
--
-- auth.uid() is wrapped as a scalar subquery per the InitPlan consolidation
-- (ADR 0055).
-- ---------------------------------------------------------------------------

alter table public.pipedrive_deal_cache enable row level security;
revoke all on public.pipedrive_deal_cache from anon, authenticated;
grant select, insert, update on public.pipedrive_deal_cache to authenticated;

create policy pipedrive_deal_cache_select_internal
on public.pipedrive_deal_cache for select
to authenticated
using (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())));

create policy pipedrive_deal_cache_insert_internal
on public.pipedrive_deal_cache for insert
to authenticated
with check (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())));

create policy pipedrive_deal_cache_update_internal
on public.pipedrive_deal_cache for update
to authenticated
using (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())))
with check (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())));
