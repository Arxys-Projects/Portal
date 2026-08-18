# 0138 — Hide "-NCD" SKUs with a new `hidden_from_catalog` flag, not `active = false`

- **Status**: Accepted
- **Date**: 2026-08-18

## Context

The 3 semi-custom `-NCD` SKUs added in [0137](./0137-semi-custom-ncd-skus-as-duplicated-rows.md)
are exclusive to one partner and must never appear on the price list or be
suggested by the calculator's recommendation engine to anyone. They must still
resolve correctly wherever a quote or Pipedrive deal already carries the exact
SKU.

The obvious first move — set `products.active = false` for these 3 rows — was
ruled out on inspection: `active` is enforced by the RLS policy
`products_select_active_or_admin` (`using (active = true or is_admin(auth.uid()))`,
`supabase/migrations/20260521190350_step3_4_products_sku_pk.sql`), and
`current_products` is a `security_invoker` view, so RLS applies as the
querying user. `src/lib/project-quote/assemble.ts`'s showcase/sizing lookups
run as the signed-in partner, not an admin. Setting `active = false` would
make the row invisible to that exact partner's own quote page — the one place
it absolutely needs to render — while remaining visible only to admins.

## Options considered

- **`active = false`** — breaks quote rendering for the very partner the SKU
  exists for (see above). Rejected.
- **New `hidden_from_catalog` boolean column, filtered only by the price-book
  pages/export and the recommender's candidate query** — carries no RLS
  meaning, so it doesn't touch row visibility for anyone. `assemble.ts`
  resolves catalog rows by exact SKU with no such filter, so quotes/deals
  that already reference the SKU are unaffected regardless of the flag.

## Decision

Added `products.hidden_from_catalog boolean not null default false`, set
`true` only for the 3 `-NCD` SKUs, and added `.eq("hidden_from_catalog", false)`
to the 4 general-listing query sites: `src/app/(app)/price-book/page.tsx`,
`src/app/(app)/price-book/[slug]/page.tsx` (3 query sites within), and
`src/app/(app)/api/price-book/xlsx/route.ts`. Also added the same filter to
`src/lib/recommend/candidates.ts`'s candidate-pool query so the calculator
never suggests these SKUs. `current_products` is a view with an explicit
column list (not `select *`), so it had to be recreated
(`create or replace view`) to expose the new column —
`supabase/migrations/20260818000002_hide_ncd_skus_from_catalog.sql`.

## Consequences

**Positive:** The 3 SKUs are fully invisible to general browsing (price list,
export, recommender) while remaining exactly as functional as any other
catalog SKU wherever a quote/deal already names them — no special-casing in
`assemble.ts`/`snapshot.ts` needed.

**Negative:** A 5th query site that lists `current_products` generally in the
future has to remember to add the same filter — there's no single choke point
enforcing it (unlike RLS, which is enforced at the database regardless of
query site).

**When to revisit:** If a 4th or 5th catalog-visibility restriction is ever
needed, consider moving this into a Postgres view/policy (e.g. a
`catalog_products` view that already excludes hidden rows) so new listing
code can't forget the filter.
