# 0044 — QuickCompare extends product_specs

- **Status**: Accepted
- **Date**: 2026-06-02

## Context

The VideoX QuickCompare tool (`/videox-compare`) shows every V5 NVR model side
by side across ~26 spec rows (CPU detail, RAM, RAID, networking, etc.). Most of
those fields did not exist anywhere in the database — they came from
`VideoX-QuickCompare-V5.xlsx`.

QuickCompare data is model-FAMILY-level (one set of values per V100, V200, …),
but the existing `product_specs` table is SKU-TIER-level (e.g. VX5-V500-192,
-240, -288 are three rows). The QuickCompare values are identical across all
SKU tiers within a family.

We needed somewhere to store the new fields. The brief also forbade adding
pricing, creating download/export features, or changing the existing
`/comparison` and `/calculator` tools (which also read `product_specs`).

## Options considered

- **New columns on `product_specs`** — single source of truth for hardware
  specs; reuses the existing migration/update pattern; no joins. Cost: spec
  values are duplicated across the 2–3 SKU tiers of each family.
- **Separate family-level table** (e.g. `videox_quickcompare`, 1 row/family) —
  no duplication and a natural home for families that lack `product_specs`
  rows. Cost: a second specs table to keep in sync, plus a join, for no real
  benefit at this scale.
- **Static JSON file** — simplest to author, but splits hardware specs across
  two sources of truth and breaks the established "specs live in the DB"
  pattern.

## Decision

Add nullable columns to `product_specs` and seed them per family via an additive
migration. Two naming adjustments were required: the detailed CPU string is
stored as `cpu_model_full` (the table already has a NOT NULL `cpu_model` used by
the comparison tool), and `max_bandwidth_mbps` was added to back the Overview
"Max Bandwidth" row.

V900 is **excluded**: it has no `product_specs` rows and no pricing/storage
data, and fabricating the NOT NULL base columns to insert it would both break
the "no pricing" rule and leak a fake model into `/comparison` and
`/calculator`. QuickCompare ships the seven existing families (V100–V800).

## Consequences

**Positive:** one source of truth for hardware specs; the QuickCompare columns
are reusable by future tools; the migration/rollback follows the existing
pattern; the comparison/calculator tools are untouched (their `DISPLAY_SPECS`
reference only `SharedSpecKey` fields, and the new columns are optional on the
`ProductSpec` type).

**Negative:** QuickCompare field values are duplicated across the SKU tiers of
each family (8 families × ~2–3 tiers × ~25 columns). The redundancy is small and
static. A future QuickCompare update script would need to write all tiers of a
family consistently.

**When to revisit:** if QuickCompare grows many more family-level-only fields,
or if SKU-tier rows within a family ever need *different* QuickCompare values,
move to a dedicated family-level table.
