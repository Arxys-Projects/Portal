# 0019 — Defer real pricing to Phase 2 (Pricing Pipeline project)

- **Status**: Accepted
- **Date**: 2026-05-19

## Context

Portal Phase 1 originally included Step 10: "swap placeholder prices for real MSRP values, surface in calculator/PDF/email." After reading the actual VideoX price list (41–43 SKUs across 12 product families, storage-tier-specific SKUs like `VX5-V500-216`) and Andy's separate Pricing Pipeline planning doc (Google Sheet → Pipedrive Products → Supabase, with its own Phase 0/1/2/3), it became clear that real pricing has too many cross-cutting dependencies for a Portal Phase 1 step:

- The current Portal `products` table (6 family rows, UUID PK, `list_price_usd` numeric) is schema-incompatible with the planned price-pipeline `products` table (SKU TEXT PK, `msrp` nullable, `price_type`, `product_group`, `sort_order`).
- Real pricing forces the recommendation algorithm to evolve from picking a family ("V500") to picking a specific SKU ("VX5-V500-216") whose storage tier covers the workload — a meaningful algorithm change.
- The Pricing Pipeline doc introduces price types beyond NUMERIC (MKT = "Market Price", CFQ = "Call for Quote") that the calculator/PDF/email must handle.
- Partner-specific pricing requires a `partners.discount_tier` field that does not yet exist.
- The xlsx file we have is being retired in favor of a Google Sheet that has not been created yet (Pricing Pipeline Phase 0 Step 4).

Pushing real pricing into Portal Phase 1 would either block Phase 1 on Pricing Pipeline Phase 0 (data cleanup that is Andy's manual work) or force a throwaway implementation that gets rewritten when the pipeline lands.

## Options considered

- **Implement real pricing in Portal Step 10 now.** Forces Phase 0 data work to happen first, conflates the two projects, and creates a schema that Phase 2 will rewrite.
- **Block Portal Phase 1 on the Pricing Pipeline.** Holds shipping the rest of the portal (admin, pre-launch) for work that is not on the critical path.
- **Defer real pricing to Phase 2, use placeholders in Phase 1.** Lets Portal Phase 1 finish on its own timeline; Phase 2 fills in real prices when the Google Sheet and push script exist.

## Decision

Defer real pricing to Phase 2 (the Pricing Pipeline project). Portal Phase 1 uses placeholder values throughout:

- `products.list_price_usd` placeholders (1..6) from Step 5 stay as-is.
- Calculator, PDF, and email display "Pricing TBD" or equivalent text in any price field.
- Pipedrive Deal creation (Portal Step 8) sets Deal `value` to 0 or omits it, with a placeholder note that Phase 2 will populate.
- Portal Step 10 as originally scoped is removed. Phase 2 of the Pricing Pipeline project covers everything Step 10 was supposed to do, and more.

The Pricing Pipeline doc is captured verbatim at [`docs/proposals/phase-2-pricing-pipeline.md`](../proposals/phase-2-pricing-pipeline.md). Outstanding reconciliation questions are recorded at the bottom of that file.

## Consequences

**Positive:**
- Portal Phase 1 can finish (Steps 8, 9, pre-launch) without blocking on price-list data cleanup.
- Pipedrive Deal creation (Step 8) lands without the SKU-aware recommendation rewrite real pricing would force.
- The schema change Phase 2 introduces (SKU PK, price types, product groups) happens once, cleanly, instead of twice.
- The partner portal can be demoed end-to-end on placeholders, exposing UI/UX issues independent of pricing.

**Negative:**
- The calculator, PDF, and email show placeholder text in production until Phase 2 ships. Anyone using the portal during the gap sees a not-yet-real recommendation.
- The placeholder text is a small piece of throwaway UI — the real Phase 2 implementation will replace it.

**When to revisit:** When Pricing Pipeline Phase 0 data cleanup is done and the Master Google Sheet exists. At that point, schedule Pricing Pipeline Phase 1 (push script) and Phase 2 (Portal price book page). Real pricing in the calculator/PDF/email lands at the same time the `products` table is repopulated.
