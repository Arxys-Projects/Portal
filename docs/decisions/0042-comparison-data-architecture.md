# 0042 — Comparison data architecture: separate tables, JSON-as-source-of-truth

- **Status**: Accepted
- **Date**: 2026-05-29

## Context

Phase 5 adds a competitive server comparison tool that shows how Arxys VideoX models
stack up against Milestone Husky IVO and Avigilon NVR6 appliances. The tool needs
~15 spec fields per model (CPU, RAM, network, max cameras, Passmark score, etc.) and
MSRP for Arxys models only. Competitor pricing is not displayed; partners enter their
own quoted price.

Two structural questions arose:
1. Should Arxys spec/MSRP data live in the existing `products` table (which the
   Google Sheet pricing pipeline manages) or in a new `product_specs` table?
2. Where does the data come from and how does it stay current?

## Options considered

- **Extend `products` with ~15 new columns** — MSRP stays in sync with the pricing
  pipeline automatically. Couples comparison data to the Sheet pipeline; adds columns
  the pipeline doesn't manage; risks accidental overwrites during price pushes.

- **Separate `product_specs` table with its own source** — decoupled from
  `products`; spec data managed independently via `data/server-specs.json`; no risk
  of pipeline clobbering spec fields. Requires a separate update script.

- **Inline comparison data as TypeScript constants** — zero DB round-trips per page
  load. Only viable if data never changes; impractical for 55 rows with numeric fields
  that need to be queried/sorted.

## Decision

Two new additive tables: `product_specs` (21 Arxys rows) and `competitor_products`
(34 rows — 14 Milestone Husky IVO, 20 Avigilon NVR6). Both seeded inline from
`data/server-specs.json`, which is the WP plugin's authoritative data file.

`product_specs.id` uses the JSON's model IDs (e.g. `VX5-V500-192`) with a nullable
`product_sku` column reserved for future optional joins to `products.sku`. The
`competitor_products.arxys_match_id` column is a FK to `product_specs(id)`.

The JSON field `cpu_architecture` (which stores Passmark scores, not an architecture
enum) is mapped to `cpu_passmark` in both tables for clarity.

`display_specs` and `messages` are TypeScript constants in Step 2 (`types.ts` /
`display-specs.ts`), matching the WP engine's defaults pattern — they change rarely
and avoiding a DB round-trip on every page load is appropriate at this scale.

Future refreshes: `scripts/update-comparison-data.ts` upserts both tables from a
fresh JSON export. Idempotent and CONFIRM-gated, mirroring `push-prices.ts`.

## Consequences

**Positive:**
- Pricing pipeline (`push-prices.ts`, `products` table) is completely unaffected.
- Clear separation of concerns: price data vs. spec/comparison data.
- Update path is simple: re-export JSON → run the update script.

**Negative:**
- Arxys MSRP in `product_specs` is manually maintained; it won't auto-update when
  the Google Sheet changes. The update script must be run explicitly after spec
  changes.
- `product_sku` join to `products` is deferred; if the join is ever needed, a
  migration must add the populated values.

**When to revisit:** If Arxys MSRP in the comparison tool diverges from the pricing
pipeline often enough to cause confusion, consider a scheduled sync or adding a
trigger that copies `products.msrp` to `product_specs.msrp` on pipeline pushes.
