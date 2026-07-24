# 0094 — Recommender candidate pool: capacity from `product_specs`, V200–V800 allowlist

- **Status**: Accepted
- **Date**: 2026-07-24

## Context

The Phase 0 spec audit ([`datasheets/spec-source-audit-phase0.md`](../../datasheets/spec-source-audit-phase0.md) §4.1)
found the Calculator was recommending from 6 of 21 rack SKUs. `loadCandidateSpecs` gated the pool on
`current_products.max_cameras` and `max_storage_tb` being non-null, and those columns are populated
for only six SKUs — the original Step 3/4 seed of "6 representative SKUs (one mid-tier per V-family)".
The Master Sheet has no capacity columns, and `push-prices.ts` only carries existing capacity forward
(`existing?.max_cameras ?? null`), so the ~30 SKUs that arrived with the full sheet push got `null`
and stayed `null`.

Two consequences. The V100 family was unreachable — which turns out to be *intended*, as the
recommender sizes video surveillance only and the V100 is quoted directly rather than sized. And only
one capacity tier per family was reachable — which is *not* intended, and directly undercuts the
stated goal of making the recommender more accurate and more specific. With only `VX5-V500-240` in
the pool, a job needing 250 TB usable could not be offered `VX5-V500-288` or `VX5-V600-384`; it had
to reach for a larger mid-tier or stack units.

`product_specs` already holds complete, correct capacity for all 21 rack SKUs. The data existed; the
loader was reading the wrong source.

## Options considered

- **Capacity from `product_specs`, join `current_products` for price** — uses the complete source,
  and makes the sparse inline columns vestigial so the duplication can be removed rather than synced.
- **Backfill `current_products.max_cameras` / `max_storage_tb` for the missing 15** — smallest
  change, but keeps two copies of capacity and needs a new write path to stay correct, which is the
  exact problem the unification initiative exists to end.
- **Teach `push-prices.ts` to derive capacity** — puts spec logic in the pricing pipeline, coupling
  two things ADR 0086 deliberately separated.
- **Add the capacity columns to the Master Sheet** — makes capacity a manually-maintained
  spreadsheet field, moving it further from a canonical source.

For which families are recommendable:
- **Allowlist of V200–V800** — explicit; a newly-seeded family cannot enter the pool unreviewed.
- **Blocklist of V100** — shorter, but a new family would be silently recommendable on day one.
- **Derive from the presence of a `product_specs` row** — no extra config, but couples "has specs"
  to "should be recommended", and the datasheet project is about to add spec rows for management,
  ACM, and workstation SKUs that must never be recommended as video recorders.

## Decision

`loadCandidateSpecs` takes camera and storage capacity from `product_specs`, and `current_products`
supplies only price, naming, `active`, and `price_type` (price stays there per ADR 0086). A SKU joins
the pool when it is active, numeric-priced, in `RECOMMENDABLE_PRODUCT_GROUPS`, and has a
`product_specs` row. A SKU with no spec row is skipped rather than falling back to its raw nameplate —
the old fallback would overstate usable storage and could under-spec a recommendation.

`RECOMMENDABLE_PRODUCT_GROUPS` is an allowlist: `V200`, `V400`, `V500`, `V600`, `V700`, `V800`. The
V100 is excluded deliberately (small-site value box, quoted directly); access control, management,
and workstation SKUs are excluded because they are not video recorders.

The pool-assembly logic is extracted as a pure `selectCandidates(productRows, specRows)` so it is
unit-testable without a Supabase client — the same split
[`cell-value.ts`](../../src/lib/price-book/cell-value.ts) uses.

**Not changed:** the algorithm, its floors (`STORAGE_FLOOR = 1.2`, `VSR_FLOOR = 1.1`), the
bitrate-per-resolution tables, and the RAID math beyond ADR 0092. This ADR changes only which SKUs
are offered to `recommend()`.

## Consequences

**Positive:** the pool goes from 6 SKUs to 18 — three capacity tiers per family instead of one — so
the recommender can right-size. Over a 32-scenario grid (24–1200 cameras × 14–90 day retention),
21 scenarios changed and **all 21 got cheaper**, by $722 to $48,197; none under-specced the storage
requirement. `products.max_cameras` and `max_storage_tb` become unread by the recommender, so the
duplicated capacity columns can be dropped during unification instead of needing a write path.

**Negative:** partner-facing recommendations change for roughly two thirds of workloads. Cheaper is
usually welcome, but a partner who quoted a job last week gets a different answer this week, and
anyone with a saved comparison will notice. Existing submissions keep their stored snapshot, so only
new calculations shift. The allowlist is a hardcoded constant, so adding a family means a code
change and a deploy — accepted deliberately, since the alternative is a new family becoming
recommendable before anyone has reviewed whether it should be.

**Observation surfaced, not addressed:** with the full pool visible and ADR 0092's corrected parity,
`VX5-V800-576` is strictly dominated — it delivers the same 480 TB usable and the same 325 VSR as
`VX5-V700-576` for $2,360 more, so it can never win a recommendation. Before the parity fix it
computed 512 TB and did win some workloads. Either it is mispriced, or it exists for reasons the
recommender cannot see (drive-bay expansion headroom for later growth), or it should be retired.
Worth a product decision.

**When to revisit:** if a family outside V200–V800 should become recommendable (an access-control
calculator is the obvious candidate and would want its own pool, not this one); if `product_specs`
stops being the canonical capacity source; or if the inline `current_products` capacity columns are
dropped, at which point this ADR's join is the only path and the fallback branches can go.
