# 0033 — Real pricing live in Phase 2 (Steps 5+6)

- **Status**: Accepted
- **Date**: 2026-05-21

## Context

ADR 0019 deferred real pricing to Phase 2. That prerequisite is now met: the Master Google Sheet exists and is validated (Step 2), the SKU-PK `products` schema is live (ADR 0031), and the recommendation algorithm picks specific SKUs (ADR 0032). Steps 5+6 close the loop: a push script lands real MSRPs in Supabase and Pipedrive, and the partner UI + Pipedrive Deal are updated to reflect them.

Eight decisions were locked before writing any code (Q1–Q8). This ADR records them as a single closure record so the reasoning doesn't scatter across JOURNAL and code comments.

## Options considered (Q1–Q8 outcomes)

**Q1 — Google Sheets auth**: (b) CSV export URL — same as `validate-prices-sheet.ts`. No new service account, no new credentials surface. Acceptable because the Sheet is intentionally public-link-viewable.

**Q2 — Pipedrive Products current state**: Existing entries with some codes matching Sheet SKUs. UPSERT-by-code handles both existing and new rows correctly; dry-run preview showed expected results before CONFIRM.

**Q3 — MKT/CFQ in Pipedrive**: (a) Prefix product name with `[MKT]` / `[CFQ]`; `prices[0].price = 0`. Sales sees all current SKUs in Pipedrive; prefix signals manual quoting required.

**Q4 — Pipedrive product category**: (a) Skip. Pipedrive product categories are not configured; setting an unknown string would fail the API call. Re-evaluate if categories are added in a future quarter.

**Q5 — Flagged-for-removal handling**: (a) Print-only. Products in Supabase or Pipedrive absent from the Sheet are listed in the change preview but never auto-deactivated. Deactivation is always a manual action.

**Q6 — VX5-PP5-V100 status**: Not yet added to the Sheet. The push script skipped it; total push = 36 rows (not 37). Add in a follow-up push when Andy updates the Sheet.

**Q7 — Pipedrive Deal value**: (a) `value = winner.totalCostUsd`. Sales sees the total list price of the recommended NVR configuration; pipeline reporting becomes meaningful.

**Q8 — ADR 0019 closure**: (a) Update ADR 0019 status to `Superseded by #0033`; this file is the closure record.

**Legacy pricing display**: New submissions show real dollars. The 12 pre-migration submissions (UUID-shaped `recommended_product_id`) show `"(legacy pricing — pre-Phase-2)"` instead of the $1–$57 placeholder totals that would otherwise mislead.

## Decision

Land real pricing end-to-end in a single coherent Steps 5+6 commit:

1. `scripts/backup-pipedrive-products.ts` — pre-push backup of Pipedrive Products state.
2. `scripts/push-prices.ts` — validates the Sheet, diffs against Supabase + Pipedrive, shows a full preview, requires `CONFIRM`, UPSERTs both targets. Capacity columns (`max_cameras`, `max_storage_tb`) preserved from existing Supabase rows so the 6 V-family seed rows keep their calculator capacity.
3. `src/lib/pipedrive/deal.ts` — `value: winner.totalCostUsd`; portal URL is `/submissions/${submissionId}` permalink; Phase 1 placeholder note creation removed.
4. `src/app/(app)/_components/submission-detail.tsx` — legacy rows show `"(legacy pricing — pre-Phase-2)"`.

## Consequences

**Positive:**
- Supabase `products` carries the full ~36-row Sheet. New submissions get real MSRPs and `total_list_price_usd`.
- Pipedrive Products catalog is now in sync with the Master Sheet; deals carry real `value`.
- The Phase 1 placeholder note noise is gone from every new Pipedrive deal.
- The portal URL in each deal links directly to the submission detail page.
- Push script is idempotent: re-running after a Sheet update produces 0 diff if nothing changed.

**Negative:**
- The 12 legacy submissions display `"(legacy pricing — pre-Phase-2)"` rather than their stored totals. This is intentional — the stored totals were placeholder values, not real pricing.
- VX5-PP5-V100 (5-year protection plan) is absent from this push. The sheet row hasn't been added yet; it's a follow-up item.
- Per-partner discount pricing (partner price column, `partners.discount_tier`) is still deferred to Step 8 scoping.

**When to revisit:**
- Add VX5-PP5-V100 to the Sheet and re-run `push-prices.ts`. No code change needed.
- Partner discount mechanic: Step 8 scoping will introduce `partners.discount_tier` and a computed partner price.
- If Pipedrive product categories are configured in the admin UI, revisit Q4 and add the `category` field mapping to `push-prices.ts`.
