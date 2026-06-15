# 0057 — camera_specs table design

- **Status**: Accepted
- **Date**: 2026-06-15

## Context

Phase 10 introduces camera-model lookup in the calculator. The feature needs a central store of camera vendor, model, and sensor specifications so that selecting a camera auto-fills the resolution bucket and sensor count in a group card. The store must be readable by every authenticated partner, writable only by admins, and seeded later per vendor (Axis, then Hanwha, then Avigilon) via a reviewed admin load. The picker searches by model and by alias, scoped to the selected vendor, so the store also has to support fast typeahead matching. The portal already has an established reference-table pattern in `product_specs` and a just-consolidated RLS idiom (ADR 0055), so the new table should replicate those rather than invent its own.

## Options considered

- **Reuse `product_specs`.** Wrong grain: that table is keyed by Arxys SKU and refreshed wholesale by the comparison-data script. Camera specs are third-party, vendor-keyed, and seeded per vendor.
- **No DB table; ship a static JSON the client reads.** Simple, but loses RLS, admin-gated writes, and server-side trigram search, and would not scale to a large multi-vendor library.
- **New `camera_specs` table mirroring `product_specs` (chosen).** Reuses the proven reference-table shape and RLS idiom; adds trigram indexing for the typeahead.

## Decision

A new table `camera_specs` with: `id` (uuid PK, `gen_random_uuid()` — the uuid idiom used by `products` / `submissions`), `vendor` (text, CHECK in Axis | Hanwha | Avigilon), `model` (text), `model_aliases` (text[] default `'{}'`, for typeahead matching), `sensor_count` (integer, CHECK >= 1), `max_width` and `max_height` (integers, CHECK > 0; native pixels of the model's highest-MP sensor), `sensor_detail` (jsonb, nullable; per-sensor breakdown stored for completeness but unused by phase-1 math), `currently_shipping` (boolean default true, seed-filter only), `source_url` (text, nullable), `as_of_date` (date, nullable). The natural key is `(vendor, model)`, enforced by a UNIQUE constraint, because a model code is unique within a vendor and the loader keys rows that way. No `created_at` / `updated_at`: the sibling reference table `product_specs` carries neither, and rows are refreshed by a reviewed seed load rather than edited per-row.

RLS mirrors `product_specs`: SELECT open to `authenticated` (`using (true)`); INSERT, UPDATE, DELETE restricted to `public.is_admin(...)`. The `auth.uid()` argument is wrapped as `(select auth.uid())` per the InitPlan consolidation (ADR 0055). Table privileges are granted to `authenticated` and gated by the policies, matching how `submissions` exposes admin writes.

Search indexing lands in this same migration (it keeps Step 3 pure UI): enable `pg_trgm`, a GIN trigram index on `model`, a GIN trigram expression index on `array_to_string(model_aliases, ' ')`, and a btree index on `vendor` for the vendor-scoped filter. `pg_trgm` is first enabled here, so the paired rollback drops it. A `scripts/validate-camera-specs.ts` checker gates every seed row before the admin load.

## Consequences

**Positive:** consistent with the existing reference-table and RLS patterns; admin-gated writes with open authenticated reads; trigram search ready before any UI work; one natural key the loader can upsert against.

**Negative:** introduces a `pg_trgm` dependency the project did not previously carry; the alias trigram index relies on `array_to_string` being immutable (it is) and on aliases being maintained in the seed data. The vendor CHECK hard-codes the Phase 1 vendor set, so a new vendor is a follow-up migration, not a data edit.

**When to revisit:** if configurable-multisensor models (e.g. Avigilon H5A, excluded from phase 1) enter scope and need per-sensor rows, or if the vendor set grows often enough that a CHECK constraint becomes friction and a lookup table is warranted.
