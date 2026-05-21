# 0031 — Phase 2 Step 3+4 schema migration: SKU-PK products, server_specs inlined, FK preserved as TEXT

- **Status**: Accepted
- **Date**: 2026-05-21

## Context

ADR [0030](./0030-phase-2-scope-and-locked-decisions.md) locked Phase 2 PQ4 to a "full SKU-PK migration." The brief at [`docs/phase-2/step-3-and-4-schema-and-algorithm.md`](../phase-2/step-3-and-4-schema-and-algorithm.md) surfaced five concrete sub-decisions (Q1–Q5) that needed Andy's input before any migration SQL was written. This ADR records the locked choices.

The migration is the first Phase 2 commit that destructively reshapes production data: the old `products` (UUID PK, 6 family rows) and `server_specs` (per-family capacity, 6 rows) tables are replaced by a single SKU-PK `products` table with inline capacity. The `submissions.recommended_product_id` UUID FK loses its referent and is migrated to TEXT.

Free-plan Supabase does not include dashboard snapshots, so the recoverable-backup posture for this destructive migration is a pair of locally-produced artifacts: a service-role JSON dump (`scripts/backup-tables.ts`) and a hand-written reverse migration (`supabase/rollback/step-3-4-rollback.sql`).

## Options considered

The five Q decisions, brief defaults underlined, alternatives in plain text.

### Q1 — Historical submission FK preservation

- **(a)** Map each family UUID → mid-tier SKU. Defensible but lies about precision the original algorithm didn't have.
- **(b)** *(Chosen)* Drop FK; convert `recommended_product_id` to TEXT. Old UUIDs preserved as opaque strings; submission-detail + PDF render "(legacy data)". Minimal migration code, semantically clean break.
- **(c)** Move old rows to `products_archive`; keep an FK there. More durable history but heavy migration code.

### Q2 — server_specs treatment

- **(i)** Expand to per-SKU (~35 rows). More work in Step 5 (push script must populate it too).
- **(ii)** *(Chosen)* Inline `max_cameras` + `max_storage_tb` on products. Drop server_specs. Simplest steady state; the architectural separation was over-engineering.
- **(iii)** Keep server_specs at family level with `product_group` reference. Hybrid; two-table join stays.

### Q3 — max_cameras source

- **(a)** Per-SKU table from Andy. Bottlenecked on his time; ~5 min.
- **(b)** *(Chosen)* Per-family fallback — storage-tier variants of a family share the family's camera count. Carries the old server_specs values forward (V200→100, V400→200, V500/V600→275, V700/V800→325).
- **(c)** Placeholder `max_cameras=999` for all SKUs. Defers correctness to a follow-up step.

### Q4 — MKT / CFQ in recommendation pool

- **(a)** *(Chosen)* Exclude. `recommend()` only considers `price_type='numeric'` SKUs. Today's MKT row is an accessory (`VX5-RAM-32GB`); CFQ rows are workstations (`VX5-SW30-300`, `VX5-SW35-300`) — none are NVR servers. Exclusion by price_type maps cleanly to exclusion by relevance.
- **(b)** Include but flag. Allows future MKT/CFQ NVR servers to surface with a "requires quote" hint.
- **(c)** Include only as fallback when no numeric alternative fits. Hybrid.

### Q5 — Pipedrive recommended-models precision

- **(a)** *(Chosen)* Family-friendly. `arxys_recommended_models` + admin `Recommended Server` stay `"N × V800"`, derived from `winner.productGroup`. Persisted SKU lives on `submissions.recommended_product_id` for downstream tooling.
- **(b)** SKU-precise. `"3 × VX5-V800-720"` — more info, less readable.
- **(c)** Both. New `arxys_recommended_skus` field alongside the family one.

## Decision

Migration applied as `supabase/migrations/20260521190350_step3_4_products_sku_pk.sql`:

1. Drop `submissions_recommended_product_id_fkey`.
2. `drop table server_specs cascade; drop table products cascade;`
3. `alter table submissions alter column recommended_product_id type text using recommended_product_id::text;` (Q1b).
4. Create new `products`: `sku TEXT PK`, `product_name`, `msrp NUMERIC nullable`, `price_type CHECK in ('numeric','market','call_for_quote')`, `product_group`, `sort_order`, `active`, `max_cameras INT nullable`, `max_storage_tb NUMERIC nullable`, `updated_at` (Q2ii + Q3b inline). Plus `CHECK (price_type='numeric' implies msrp not null)`.
5. RLS: `products_select_active_or_admin` carries the same shape as the pre-migration policy.
6. Seed 6 mid-tier VideoX SKUs verbatim from the live Master Sheet, with family-level `max_cameras` (Q3b) and per-SKU `max_storage_tb` (the SKU's own tier capacity).

Application-layer filter to `price_type='numeric'` (Q4a) lives in `src/app/(app)/calculator/actions.ts` and is enforced defensively in `src/lib/recommend/algorithm.ts`.

Pipedrive deal builder derives `"N × {productGroup}"` from `winner.productGroup` (Q5a) — see `src/lib/pipedrive/deal.ts`.

## Backup posture (free-plan substitute)

Dashboard snapshots are unavailable on the free plan. The substitute is two artifacts together:

1. **Service-role JSON dump** at `backups/pre-step-3-4-sku-pk-migration-2026-05-21T19-01-41-093Z.json` (6 products + 6 server_specs + 12 submissions + 4 partners). Produced by `scripts/backup-tables.ts`.
2. **Reverse-migration SQL** at `supabase/rollback/step-3-4-rollback.sql`. Lives outside `supabase/migrations/` so the CLI never auto-applies it. Reverts the schema; then `scripts/restore-tables.ts` reloads the JSON.

This substitute is documented as the recoverable-backup gate for every future destructive Phase 2 migration. The pair fully closes the rollback story without requiring Supabase Pro.

## Consequences

**Positive:**

- One source of truth for product data: `products` table (SKU PK) reflects the Master Sheet shape from ADR 0030 PQ2.
- Calculator queries reduce from a 2-table join to a single SELECT.
- Schema is ready for Step 5's push script — Step 5 just UPSERTs over the seed.
- Reverse-migration SQL + JSON dump is a reusable pattern for future destructive migrations on the free plan.

**Negative:**

- 12 historical submissions render `(legacy data)` for product details. Acceptable per ADR 0030's internal-only-during-Phase-2 stance: these are testing rows from before Phase 2 began.
- No real FK on `submissions.recommended_product_id` after this migration. PostgREST embed-via-FK no longer works; consumers split into a SELECT-by-SKU follow-up query. See `src/app/(app)/_components/load-submission.ts` and `src/lib/pdf/render.ts`.
- The seed has only 6 SKUs (one mid-tier per V-family). The calculator will only recommend from those 6 until Step 5 lands the full ~36-row Sheet population.

**When to revisit:**

- If a future MKT or CFQ SKU is genuinely an NVR server (not an accessory / workstation), Q4(a) needs revisiting. Today's MKT/CFQ rows are not. Either the algorithm filter rule changes (`(b)` or `(c)`) or those products get re-priced.
- If Pipedrive sales workflow needs the specific SKU (not just the V-family), Q5(c) ships an `arxys_recommended_skus` field as an additive change.
- A real FK to `products.sku` is not added now because the value space includes legacy UUID strings. After the next housekeeping pass (e.g. when partners are invited and legacy rows are pruned), a FK constraint can be added.
