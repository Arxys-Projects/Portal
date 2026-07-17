# 0086 — MSRP resolves from `current_products`, never `product_specs.msrp`

- **Status**: Accepted
- **Date**: 2026-07-17

## Context

The July 2026 price increase (effective 2026-07-02) landed correctly in the
append-only `products` table and its `current_products` view (ADR 0076), and the
Price Book, XLSX export, calculator recommendation, and Pipedrive push all showed
the new prices. But **generated PDFs kept showing old prices** — a partner-facing
System Estimate PDF dated 2026-07-17 quoted a VX5-V700-480 at $54,512 / unit when
the July MSRP is $75,995 (a ~28% underprice, $42,966 low on a 2-unit deal).

Root cause: `product_specs` (the QuickCompare/hardware reference table) carries its
own `msrp` column, seeded from `data/server-specs.json` via
`scripts/update-comparison-data.ts` and never touched by the price pipeline
(`push-prices.ts` writes only `products`). Four read sites resolved price from that
stale column instead of the versioned view:

1. System Estimate PDF — `render.ts` `mapServerSpec` → `SubmissionPdf` "Unit MSRP" / "Deployment total".
2. Project Quote server-spec block — `snapshot.ts` `mapServerSpec` (frozen into the snapshot; not currently rendered, but a latent leak).
3. Comparison PDF / on-screen compare — `comparison/data.ts` → `comparison-form.tsx` "Arxys VideoX MSRP".
4. Comparison Pipedrive deal — `comparison/actions.ts` wrote the stale MSRP into a live deal.

ADR 0076 declared `current_products` "the single current-as-of-today resolution
point … consumed by every reader." These four reads silently violated that because
`product_specs.msrp` was never counted as a price read site.

## Options considered

- **Repoint every price read at `current_products.msrp` (chosen).** Spec attributes
  still come from `product_specs`; only the *price* moves to the versioned view.
  One source of truth, matching ADR 0076.
- **Teach `push-prices.ts` to also write `product_specs.msrp`.** Keeps two copies in
  sync but keeps two sources of truth — re-opens the same drift risk on the next
  pipeline that forgets one. Rejected.
- **Drop `product_specs.msrp` entirely (schema migration).** Cleanest long-term, but
  a wider change than needed to stop the bleed; deferred (see below).

## Decision

Option A. `msrp` is threaded in from the `current_products` join at every price read;
the `product_specs.msrp` column is no longer read anywhere (the `msrp` selects were
removed from the `product_specs` queries in `render.ts` and `assemble.ts`). Price is
passed into the pure `mapServerSpec` helpers as a parameter rather than read off the
spec row, so the type system now prevents re-coupling price to the reference table.

## Consequences

**Positive:** PDFs, the comparison, and comparison deals all resolve the effective,
versioned price. Single source of truth restored per ADR 0076. `product_specs` is now
purely a spec/attribute table in code.

**Negative:** ~~`product_specs.msrp` still exists in the DB as an unused, stale column~~
**Resolved 2026-07-17:** the column was dropped (migration
`20260717000001_drop_product_specs_msrp.sql`) and `update-comparison-data.ts` no
longer writes it, so the drift trap is closed. `product_specs` is now purely a
spec/attribute table in both code and schema.

**When to revisit:** if a price-as-of-a-past-date requirement appears (e.g. reprinting
a historical quote at its original price), revisit ADR 0076's whole-row versioning
rather than this ADR.
