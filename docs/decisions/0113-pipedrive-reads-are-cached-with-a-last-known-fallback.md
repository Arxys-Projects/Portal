# 0113 — Pipedrive deal reads are cached, and line-item drift is observed rather than reported

- **Status**: Accepted
- **Date**: 2026-08-03
- **Related**: second half of the `/projects` schema work with [0112](./0112-internal-project-archive-is-a-side-table.md);
  extends 0059 / 0060 (Pipedrive owns pricing; a proposal freezes what it presented) and 0061
  (derived, never stored — the same discipline applied to read freshness); reads on 0098
  (a revision updates a deal whose products may already be attached), 0093 step 3 (a relink can
  repoint a submission at a different deal), 0081 (Band C's Pipedrive figure is not the
  By-partner view's list-price sum)

## Context

Every `/projects` row shows the deal's status, value and line-item count, and the page must
satisfy two requirements that pull against each other.

Acceptance check 9: *"Pipedrive read failure shows last known values plus the stale marker,
never blanks or zeros."* A point-in-time read cannot do this. When it fails there is nothing to
fall back **to** — something has to have been written down earlier.

And the queue is one screen of N projects. Reading N deals live per page load is two HTTP
round-trips per row against a rate-limited API. The design already says reads are not live: the
mockup shows *"Read today at 9:42 AM"* beside a `↻ Refresh` control, which is only meaningful
if the number on screen came from a cache.

Nothing in this codebase caches a Pipedrive read. `getDeal()` and `getDealForQuote()` are
point-in-time, used inline during proposal generation, and simply fail if Pipedrive is down.

A third requirement rides along: *"a timestamp of the deal's last line-item change, compared
against `current_quote_generated_at`, plus a count of differing lines."*

## Options considered

**Where last-known lives.** Columns on `submissions` · a cache table keyed by
`pipedrive_deal_id` · no storage, and accept a blank row on failure (rejected by acceptance
check 9).

**When reads happen.** Live on every request · on demand only · on demand plus a TTL that
auto-refreshes a stale row mid-load · on demand plus a one-time read for a deal never seen.

**The drift timestamp.** Read a per-line change time out of Pipedrive's API · use the deal's
`update_time` · diff a stored fingerprint and stamp when it moves.

**The drift count.** Diff the live deal against the frozen `project_quotes.snapshot` · store a
running count · derive it from the timestamp comparison alone.

## Decision

**A cache table keyed by the deal, `pipedrive_deal_cache`.** Keyed by
`pipedrive_deal_id` and not by submission, because a revision reuses its source's deal (0098):
several submissions point at one deal, so keying by submission would read the same deal
repeatedly and let copies of one truth drift apart. Columns on `submissions` lose for 0112's
two reasons (a partner can SELECT and UPDATE arbitrary columns of their own rows, and this
table holds deal pricing) plus that third one.

**A failed read never overwrites a good value, and that rule lives in code because SQL cannot
express it.** Success writes the value columns and `read_at`; failure writes **only**
`last_failed_at` and `last_error` and leaves everything else exactly as it was. The two upserts
in `pipedrive-cache.ts` are deliberately separate statements with different column sets — an
upsert builds its SET list from the payload's columns, so merging them for convenience would
either null a good value on a failure row or write a stale `read_at` on a success row,
depending on which object PostgREST derived the column list from. That single decision is the
whole of acceptance check 9, and it has its own test asserting the failure payload's exact key
set.

**`read_ok` is derived, never stored:** `last_failed_at is null or read_at >= last_failed_at`.
Same reasoning as 0061's derived version currency and derived expiry — a stored boolean needs a
demote step and can disagree with the timestamps beside it.

**Reads are on demand, plus a one-time read for a deal never seen before.** A plain page
navigation makes **zero** Pipedrive calls. The refresh mode is an explicit argument
(`"none" | "missing" | "all"`): `Refresh` passes `"all"`, and `"missing"` covers the one case
where the cache is genuinely useless — a project that has just acquired a deal, which would
otherwise show an unreachable marker on first sight for no reason. A TTL was rejected because
an implicit refresh makes page-load latency depend on how long ago he last looked, and the
`Refresh` control exists precisely so that cost is something he chooses to pay.

**The drift timestamp is observed, not reported, and the spec's phrasing cannot be satisfied
literally.** Pipedrive's v1 deal-product carries `add_time`, so an **added** line is datable —
but a **deleted** line leaves nothing behind at all, and a deleted line is the change that most
badly invalidates a proposal already in front of a customer. The deal's own `update_time` moves
for edits that have nothing to do with products, so it is not a substitute. So the cache stores
a normalised fingerprint of the lines as last read and stamps `line_items_changed_at` when a
refresh sees a different one. It is honest about being *when we first saw this*, and it is
monotonic. A first sighting is explicitly not a change, or every deal would look like it
changed the day the cache was introduced and the amber strip would fire across the whole queue.

**The count carries the real weight and needs no storage at all.** The lines a proposal was
built from are already frozen in `project_quotes.snapshot.commercial.lineItems` (0060), so
diffing the deal as last read against that snapshot answers *"does v2 still match the deal"*
directly. That comparison — not the timestamp — is what `row_state` branches on.

Two fields are excluded from the comparison, and both exclusions are load-bearing. **`code`**
lives on the product record rather than the deal line, so recovering it costs one extra read
per distinct product; the refresh does not pay that, so codes arrive null from the deal side
and non-null from the snapshot side, and comparing them would report drift on every line of
every project forever. **`name`** is excluded because a re-labelled line is not a change to
what the customer is being quoted, and the PDF prints the label frozen in its own snapshot
regardless. What remains is the commercial substance: which product, how many, at what unit
price, for what line amount.

The diff pairs lines by `product_id` as a multiset before comparing numbers, so one quantity
edit counts as **one** differing line rather than as a removal plus an addition. The number
lands in user-facing copy, so it has to read the way a human means it.

## Consequences

**Positive:** a queue load is one table read and no Pipedrive traffic, so the page's cost does
not scale with the number of projects. A Pipedrive outage degrades to "yesterday's numbers,
marked stale" instead of an empty page — including Band C's open-pipeline figure, which keeps
summing last-known values rather than collapsing toward zero one failed deal at a time.
Refresh reads at a bounded concurrency of four, so a full-queue refresh cannot trip a 429.

**Negative:** every displayed number is now as old as its last refresh, and the page has to say
so — which is why `pipedrive_status_as_of` is in the data contract and why Band C dates its sum
to the **oldest** contributing read rather than the newest. A deal that is never refreshed
keeps stale values indefinitely; there is no expiry on a cache entry, because expiring one
would produce exactly the blank acceptance check 9 forbids. `getDealForQuote()` is deliberately
**not** reused for the refresh: it resolves a product code per distinct product (extra
round-trips the cache does not need) and it returns a `DealQuote` that is frozen verbatim
inside `project_quotes.snapshot`, so widening that type to carry the deal status this needs
would quietly change the frozen snapshot shape as a side effect of an unrelated feature. The
refresh calls the shared client directly instead. One additive change was made to the client: a
`status` field on `PdDealDetail`, which the API already returned and nothing was reading.

**The known wrinkle, stated so the next session does not discover it the hard way.**
`assemble.ts` numbers proposal versions **per submission** (`max(version)+1` for that
`submission_id`), while `/projects` presents one row per **project**. On a project whose newest
revision carries no proposals yet, the current proposal can be v3 (on an older submission)
while the next one generated will be v1. The query layer reports **what the system will
actually do**: `current_quote_version` is the current quote row's own version, so it always
matches the number printed inside the PDF, and the generate button's label names the version
generation will really create rather than `current + 1`. Truthful and odd beats a button that
names a version the system will not produce. The fix is to make `loadMaxVersion()`
project-scoped, which is a small query widening but a behaviour change to a shipped generate
flow, so it is a decision of its own rather than a side effect of this one.

**When to revisit:** when a second internal user is refreshing concurrently (two refreshes
racing will both write, last-write-wins, which is fine for a cache and would not be fine if
anything derived a decision from `read_at` ordering), or when the queue grows past the point
where a full refresh's bounded-concurrency read is comfortable. Sooner if Pipedrive ships a
dependable per-line change timestamp, which would let the observed stamp become a reported one
without touching anything else.
