# 0137 — Semi-custom "-NCD" SKUs modeled as duplicated product + spec rows

- **Status**: Accepted
- **Date**: 2026-08-18

## Context

Three semi-custom SKUs exist live in Pipedrive (first flagged as a gap in the
2026-06-12 JOURNAL entry, never resolved) that are the same physical build as
an existing core VideoX product, plus an upgraded NIC and GPU baked into one
bundled MSRP instead of line-itemed separately:

- `VX5-V500-288-NCD` → same base build as `VX5-V500-288`
- `VX5-V400-192-NCD` → same base build as `VX5-V400-192`
- `VX5-V400-128-NCD` → same base build as `VX5-V400-128`

`current_products` (a view over the append-only `products` table) and
`product_specs` are joined in application code by literal string equality —
`product_specs.id = products.sku` — at every call site (`src/lib/recommend/candidates.ts`,
`src/lib/project-quote/assemble.ts`). No FK exists between the two tables and
no "this SKU's spec lives under a different SKU" mapping mechanism exists
anywhere in the schema or code. The one existing alias concept
(`camera_specs.model_aliases`) is unrelated and its own ADR
(0122) explicitly forbids using an alias to point one live SKU at a
different live SKU's data.

For the 3 new SKUs to show up in the recommendation engine and render specs
on a quote, a `product_specs` row must exist whose `id` literally equals the
new SKU string — there's no way around that with the current join.

## Options considered

- **Add a `spec_source_sku` column + update both join sites** — true
  single-source-of-truth; editing the base SKU's spec would auto-propagate.
  Touches shared query code used by every product in the catalog, for the
  benefit of 3 rows.
- **Duplicate the spec row under the new SKU's id** — zero code changes,
  matches the existing pattern where every `product_specs` row is already a
  standalone, independently-editable snapshot (there's no cross-SKU
  inheritance anywhere else in the table either). Costs: if `V500-288`'s or
  `V400-192`'s or `V400-128`'s spec is edited later, the `-NCD` copy doesn't
  auto-update — it has to be edited too.

## Decision

Duplicate the row. Each `-NCD` SKU gets its own `products` row (new
price-version, own bundled `msrp`, `product_name` with an appended
` - w/ Upgraded NIC & GPU` suffix) and its own `product_specs` row that is a
byte-for-byte copy of the base SKU's row under the new `id`. See
`supabase/migrations/20260818000001_semi_custom_ncd_upgraded_nic_gpu_skus.sql`.

Bundled MSRPs (base MSRP + NIC/GPU upgrade, ~$2,761–$2,781 across all three):

| SKU | base | base MSRP | bundled MSRP |
|---|---|---|---|
| `VX5-V500-288-NCD` | `VX5-V500-288` | $52,220 | $54,981 |
| `VX5-V400-192-NCD` | `VX5-V400-192` | $37,463 | $40,244 |
| `VX5-V400-128-NCD` | `VX5-V400-128` | $31,034 | $33,796 |

## Consequences

**Positive:** No shared join/query code touched, so zero regression risk to
every other product's recommendation/quote path. The 3 SKUs behave exactly
like any other catalog product everywhere (recommender, quote rendering,
Pipedrive push, family display via `product_group`).

**Negative:** Spec drift risk — if `V500-288`, `V400-192`, or `V400-128`'s
`product_specs` row is edited (e.g. a CPU or warranty term correction), the
matching `-NCD` row will silently go stale unless someone remembers to edit
both. No enforcement mechanism catches this.

**When to revisit:** If a 4th semi-custom SKU is added, or the base
SKUs' specs need to change more than rarely, switch to the
`spec_source_sku` mapping-column approach instead of continuing to hand-sync
duplicated rows.
