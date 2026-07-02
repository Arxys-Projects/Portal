# 0076 — Append-only price versioning + `current_products` view

- **Status**: Accepted
- **Date**: 2026-07-02

## Context

Until now the price pipeline (`scripts/push-prices.ts`) treated a monthly price
update as one atomic action: it UPSERT-ed the Master Sheet into `public.products`
(update-in-place, keyed on the `sku` primary key) **and** pushed every product to
Pipedrive in the same run. There was no way to (a) stage a price so the portal +
Excel adopt it on a future date with no further action, or (b) push Pipedrive as a
separate, deliberate, human-triggered step.

We needed to decouple "a portal/Excel price becomes effective" from "Pipedrive is
updated", with a hard rule: **Pipedrive is never pushed automatically** — only an
explicit script run pushes it. The read side must resolve the effective price at
query time (no cron, no flag flip, no background job).

Verified before choosing: **no foreign key references `products(sku)`** —
`product_specs.id` is joined to `products.sku` only in application code, and
`competitor_products.arxys_match_id → product_specs(id)`. So the `sku` primary key
can be dropped safely.

## Options considered

- **Append-only `products` + a `current_products` view (chosen).** Drop the `sku`
  PK for a surrogate `id`; add `effective_date` + `pushed_to_pipedrive_at`; keep
  every historical row. A view resolves the latest row per SKU with
  `effective_date <= current_date`. Readers swap the table name for the view.
- **Separate `product_prices` history table.** Keep `products` as a one-row-per-SKU
  attribute table; move `msrp`/`price_type` into an append-only child table; join
  via a view. Cleaner domain split but requires migrating the seed, the write path,
  and change-detection, and price-displaying readers still move to a view — more
  surgery for the same read-side result.
- **Cron/flag flip on the effective date.** Rejected outright: the brief forbids any
  scheduled/background adoption of a future price.

## Decision

Option A. `public.products` becomes append-only: each price change is a **new row**
for the SKU with its own `effective_date`; prior rows are retained as history and
never overwritten. `unique (sku, effective_date)` — same-day corrections overwrite
that day's row; different dates append. `public.current_products`
(`security_invoker = on`, so base-table RLS still governs) is the **single**
current-as-of-today resolution point, consumed by the portal price book, the Excel
export, and every other reader — plus the pipeline's `--target=pipedrive` step.

`push-prices.ts` gains `--target=portal|pipedrive|all` (default `all`):
- `portal` — insert versioned rows only (`--effective-date`, past or future); never
  touches Pipedrive or `pushed_to_pipedrive_at`.
- `pipedrive` — push current-as-of-today prices, stamp `pushed_to_pipedrive_at` on
  the rows pushed; idempotent (diff-based, so a re-run pushes nothing).
- `all` — portal insert then Pipedrive push, matching today's monthly cycle.

## Consequences

**Positive:** Future prices can be staged and adopted automatically at read time.
Pipedrive is decoupled and manual-only. Full price history is retained. Read logic
lives once, in SQL (the view), so portal and Excel resolve identically.

**Negative:** All 12 `products` read sites now go through the view (mechanical, but a
wider surface than the two the brief named). `products` mixes price + attributes, so
an attribute-only edit still creates a new version. The rollback is only clean while
each SKU has a single row. RLS edge: if a SKU's latest-effective row is `active =
false`, a non-admin sees the newest *active* row as current (acceptable — deactivation
is out of scope and the pipeline always writes `active = true`).

**When to revisit:** if attribute churn makes whole-row versioning noisy, or a
price-as-of-quote-date requirement appears, split price into its own table (Option B).
