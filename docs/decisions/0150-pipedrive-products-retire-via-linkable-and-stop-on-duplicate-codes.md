# 0150 — Pipedrive products: retire with is_linkable, stop on duplicate codes

- **Status**: Accepted. Supersedes the mechanism of [0079](./0079-fold-pipedrive-archive-into-price-push.md) (and the premise of [0078](./0078-pipedrive-eol-archive-not-delete.md)); 0079's "one price run keeps Pipedrive in sync with portal `active`" stands.
- **Date**: 2026-10-16

## Context

ADR 0078/0079 retire a portal-inactive SKU in Pipedrive by sending v1 `PUT /products/{id}`
with `active_flag: false`, on the belief that this archives the product: off the deal picker,
kept on existing deals. It does not. In Pipedrive's model v1 `active_flag: false` is a delete
(v2 exposes it as `is_deleted`, its negation). The switch that keeps a product but stops it
being added to deals is v1 `selectable` / v2 `is_linkable`. Read-only checks on 2026-10-16:
the four products "archived" on 2026-07-06 (VX5-SW25-200 #1463, SW30 #1461, SW35 #1462,
V270-ACM #1490) return 404 by id on v1 and v2 and are absent from list and search. The next
run would have deleted VX5-RAM-32GB #1483 the same way.

Separately, `computePipedriveChanges` matched products to SKUs through a `Map` keyed by
code, so two products sharing a code collapsed to whichever came last. VX5-V600-320 has two:
#1443 on the deal picker at the pre-July $41,659 and on five deals (one open), and #1485 not
linkable at the current $56,461. The July run priced #1485 and left the picker product stale.
100 more codes are duplicated, all legacy (V2/V3/V4, DataX, ArcGIS), none a portal SKU.

The v1 product endpoints this script used have also been out of support since 2026-08-01
(Pipedrive changelog, 2026-07-29). They still answer, with no guarantee.

## Options considered

- **Keep `active_flag: false`, document it as a delete.** Honest, but deleting a product
  that sits on deal lines is the opposite of what 0078 wanted, and it cannot be undone.
- **Retire with `is_linkable: false` (chosen).** Off the picker, product and deal lines
  kept, reversible by the same field.
- **Duplicates: pick one by rule** (linkable first, or lowest id). Silent again, and on
  VX5-V600-320 either rule picks a product someone would call wrong.
- **Duplicates: skip that SKU and push the rest.** The run "succeeds" with a SKU left stale,
  which is how the V600-320 gap went unnoticed.
- **Duplicates: stop the run before any write (chosen).** Loud; a person decides which
  product keeps the code.
- **Stay on v1 for the price push.** Smallest diff; rides endpoints with no support.

## Decision

- The diff rules move to `src/lib/pipedrive/product-sync.ts` (pure, unit-tested), and the
  script's Pipedrive I/O to `src/lib/pipedrive/product-api.ts` on the v2 endpoints
  (`GET /api/v2/products`, `POST /api/v2/products`, `PATCH /api/v2/products/{id}`).
- A portal-inactive SKU whose product is linkable is **retired**: `is_linkable: false`, with
  its existing prices sent back unchanged (the v2 docs say an omitted `prices` assigns a
  default of 0). Never `active_flag`. Already-retired or absent products are skipped.
- A portal-active SKU whose product is not linkable is put back on the picker (`relink`),
  the inverse of retiring, alongside the existing name and price updates. Prices compare on
  the USD entry; other currencies and the cost fields are carried over.
- A portal SKU whose code two or more products share is **refused**: listed in the preview,
  nothing written for it, and the run exits before any write (portal step included) until
  the duplicate is resolved by hand. Duplicated codes that are not portal SKUs are reported
  and left alone.
- `scripts/audit-pipedrive-products.ts` reports all of this read-only, with the deals each
  duplicate sits on. `backup-pipedrive-products.ts` now saves the v2 shape, which includes
  `is_linkable`.

## Consequences

**Positive:** retiring a SKU no longer destroys the Pipedrive product. A duplicated code
can't leave a stale price on the picker without someone seeing it. The price pipeline is off
out-of-support endpoints. The rules are unit-tested for the first time.

**Negative:** the four products deleted in July are gone; nothing here brings them back,
and what Pipedrive did to deal lines that used them is unknown. Today the Pipedrive step is
blocked until VX5-V600-320 is resolved (`scripts/fix-pipedrive-v600-320-duplicate.ts` holds
the proposed fix, not yet applied). A `--target=all` run is blocked whole, so the portal half
waits too; `--target=portal` remains available. The first unblocked run will also rename the
three `-NCD` products from their hand-written Pipedrive names to the portal names (existing
behaviour, surfaced by the preview, not introduced here).

**When to revisit:** if Pipedrive changes what `is_linkable` means, or if duplicate codes turn
out to be common enough that a recorded "this product owns the code" mapping beats fixing
them by hand.
