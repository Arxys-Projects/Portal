# 0141 — Price staleness means a repricing, not the newest row

- **Status**: Accepted
- **Date**: 2026-08-20
- **Amends**: [0115](./0115-projects-list-button-unification-and-pricing-flag.md) (the `needs_price_update` definition only; the rest of 0115 stands)

## Context

[ADR 0076](./0076-append-only-price-versioning.md) made `products` append-only: one row
per `(sku, effective_date)`, with `current_products` resolving `distinct on (sku) … where
effective_date <= current_date`. [ADR 0115](./0115-projects-list-button-unification-and-pricing-flag.md)
then replaced the fixed 7-day quote expiry with a pricing-staleness flag, defining "when
pricing was last updated" as one global `max(effective_date)` across `current_products`,
compared against each quote's `generated_at`. The reasoning was sound: one
`scripts/push-prices.ts` run stamps every SKU it changes with the same date, so one date
describes the whole run.

That definition conflates two different events. A row is the newest for its SKU either
because the SKU was **repriced**, or because the SKU was **born** — a new product's debut
row is trivially also its newest version. Only the first can make an existing quote stale:
a quote's prices go out of date when something it could already contain changed price, and
a product that did not exist when the quote was written was never in it.

On 2026-08-18 three new `-NCD` SKUs were added to the catalog
([ADR 0137](./0137-semi-custom-ncd-skus-as-duplicated-rows.md)). No existing SKU was
repriced and no July 2nd row was touched, but `max(effective_date)` moved from `2026-07-02`
to `2026-08-18` and **all 34 open-deal quotes** flagged `needs_price_update` — every one of
them a false positive. This was initially read as stray rows left behind by a reverted
push; it was not. The rows are correct, deliberate, and load-bearing. The query was wrong.

A flag that fires on every quote carries no information, and the cost is real: it tells a
salesperson to regenerate a proposal that is already correctly priced, in front of a
customer.

## Options considered

- **Delete the three later-dated rows.** Restores the flag immediately and needs no code
  change — but deletes three live SKUs, one partner's quoted products among them, to work
  around a query bug, and the next legitimate new SKU re-breaks it identically.
- **Edit the rows' `effective_date` back to 2026-07-02.** Violates the append-only model's
  own invariants (a version row's date *is* its identity, per 0076) and would collide with
  `unique (sku, effective_date)` for any SKU that already has a July row. Also a lie: these
  prices did take effect on 2026-08-18.
- **Exclude `hidden_from_catalog` rows from the max.** Fixes this instance only. A
  *visible* new SKU would flag every quote just as wrongly, and it ties the staleness
  signal to an unrelated listing concern.
- **Derive the date from the version history: the newest row that actually changed an
  existing SKU's price.** Needs a real code change and one direct read of `products`
  instead of `current_products`.
- **Compute it in SQL as a view or RPC.** Same semantics, but adds a migration — and this
  repo's migrations against `products` are STOP-AND-FLAG, hand-applied via the dashboard,
  so the fix would not be live until applied by hand.

## Decision

"When pricing was last updated" is **the `effective_date` of the newest version row that
changed an existing SKU's price** — not `max(effective_date)`.

Implemented as a pure function, `lastRepricingDate` in
[`src/lib/projects/price-effectivity.ts`](../../src/lib/projects/price-effectivity.ts):
group the history by SKU, walk each SKU's versions in effective order, and keep the newest
date at which a version's `msrp` differs from the version it supersedes. A debut row has no
predecessor to differ from and contributes nothing. Future-dated rows are excluded on the
same grounds `current_products` excludes them.

Comparison is on `msrp`, so a no-op re-push — a new version row carrying an identical price
— also correctly contributes nothing. `null` and `0` are distinct: several seeded SKUs
carry a null `msrp`, and null → a real price is a genuine repricing.

This is the **one place in `src/` that reads `products` rather than `current_products`**,
and the exception to 0076's read discipline is structural rather than an oversight: the
view is a resolver that collapses history to one row per SKU, so no question about a
version-to-version delta can be answered from its output. No migration; TypeScript only.

## Consequences

**Positive:** adding a SKU to the catalog no longer flags every quote in the system.
Verified against production: the value moves `2026-08-18` → `2026-07-02` and the flag count
goes 34 → 1, the survivor being a genuinely pre-July-2 quote that *should* flag. A no-op
re-push is now also correctly ignored, which the old query could not distinguish either. 14
unit tests pin the behaviour, including the exact 2026-08-18 regression.

**Negative:** the read is the full `products` history (70 rows today) rather than 40
resolved rows, and it re-opens a direct `products` read that 0076 had closed. The staleness
signal is now derived rather than read off a column, so it is less obvious at a glance why
a given date came back. Under RLS (`active = true or is_admin`) a non-admin internal viewer
cannot see inactive rows, so a repricing whose rows are all inactive would be invisible to
them — checked against live data and it changes nothing today (all 5 inactive rows are
2026-05-05 debut rows), but it is a real edge the previous query shared.

**When to revisit:** if the price history outgrows a single unpaginated read, or if a
"reprice" needs to mean more than an `msrp` change (a `price_type` switch, say), move
`lastRepricingDate` into SQL as a view alongside `current_products` and accept the
hand-apply step.
