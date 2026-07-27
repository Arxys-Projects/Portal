# 0095 — Retain `products.max_cameras` / `max_storage_tb`; remove the readers, defer the drop

- **Status**: Accepted
- **Date**: 2026-07-24

## Context

Arxys capacity data lives in two places. `current_products.max_cameras` /
`max_storage_tb` are inline columns populated for **6** SKUs; `product_specs` carries
complete capacity for all **21** rack SKUs. The Phase 0 audit named this duplication
as a root cause, and [ADR 0092](./0092-net-usable-capacity-definition.md) /
[ADR 0094](./0094-recommender-pool-from-product-specs.md) moved every capacity
*computation* onto `product_specs`.

Expanding the recommender pool from 6 to 18 SKUs then broke the covered-capacity
lines on three customer-facing documents, because two call sites still read the
sparse columns — fixed via `coveredCapacity()` in `capacity-utils.ts`. The
[hand-off brief](../../datasheets/spec-unification-next-session-brief.md) §2 called
for sweeping the remaining readers before considering a drop, and warned explicitly
that treating the drop as cheap cleanup "was wrong once already in this initiative."

That sweep is now done. Every remaining reader was traced to its render output
against live production data: the Price Book selects both columns but `cell-value.ts`
renders neither (net-usable and bandwidth both come from the joined `product_specs`
row); `project-quote/assemble.ts` selects both but `snapshot.ts` consumes only
group/name/msrp; `pdf/render.ts` — a site the brief did not list — selects and
returns both, and its consumers use only name/group/msrp. **No second instance of the
§1 bug exists.** So the columns have no reader, and the question is what to do with
them.

Two constraints shape the answer. `products` is **append-only** (migration
`20260702000001`): each price change inserts a new row and `current_products`
resolves the latest. And `push-prices.ts` is now their only writer, carrying values
forward from the SKU's current row into each new versioned row.

## Options considered

- **Drop the columns now, in a migration.** Removes the duplication outright — but
  requires retiring the carry-forward and updating `scripts/test-rls.ts` in the same
  change, and the Supabase CLI is unauthenticated in this environment so it lands by
  dashboard, out of band from the code.
- **Stop writing them, keep the columns.** Superficially the safe middle. It is not:
  because `products` is append-only, the very next `push-prices.ts` run would insert
  current rows with `NULL` capacity and **silently strip the 6 SKUs that still hold
  real values.** No error, no diff in the preview, data gone from `current_products`.
- **Remove the dead reads; keep the columns and the carry-forward.** Makes the sparse
  columns unreachable from application code without touching the write path or the
  schema.

## Decision

Take the third option. Remove `max_cameras` / `max_storage_tb` from all four reading
sites **and from the row types** (`ProductRow`, `SizingProductRow`, and
`loadProductBySku`'s return shape), so re-introducing the old bug is a compile error
rather than a runtime possibility. Keep the columns in the database and keep
`push-prices.ts` carrying them forward, with a comment at the write sites explaining
that the retention is deliberate.

Retiring the columns properly is a drop migration, sequenced deliberately — not a
quiet stop to the carry-forward.

## Consequences

**Positive:** the duplication is unreachable from app code, and type-level removal
makes the ADR 0092/0094 regression class unrepresentable rather than merely absent.
No schema change, no migration to apply, no production risk — verified with `tsc`,
278 tests, and a live-data trace confirming all 18 pool SKUs render correct
net-usable storage and bandwidth. If a reader was missed, it still finds data rather
than a `NULL`.

**Negative:** the duplicated columns persist in the schema, and `push-prices.ts`
keeps writing values nothing consumes — a reader of that script has to be told why.
The 6 populated / 31 empty split stays visible to anyone querying the table directly.

**When to revisit:** when the canonical-source work (brief §5.1, the admin form)
settles where Arxys capacity is authored. Drop the columns as part of that change,
where the carry-forward removal and the migration can land together — and note that
`scripts/test-rls.ts` writes both columns and will need updating.
