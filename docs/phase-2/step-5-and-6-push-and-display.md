# Phase 2 Steps 5 + 6 — Push script (Sheet → Supabase + Pipedrive Products) + Partner-price display fix

> **Combined brief for two tightly-coupled steps. One execution session, one commit.**
>
> **Model recommendation**: **Sonnet 4.6** with extended thinking enabled ("high"). Reasoning below in "Why combined / why Sonnet".
>
> **Prerequisite**: Phase 2 Steps 3+4 landed (commit `b0493f4`). `products` is now SKU-PK with inline capacity; `recommend()` picks specific SKUs; 6 mid-tier VideoX SKUs seeded.

## Why combined / why Sonnet

The plan doc lists Steps 5 and 6 as separate work units. They're combined here because:

- **User-visible coupling.** Step 5 lands real data in Supabase + Pipedrive Products. Step 6 makes the partner UI + PDF + Pipedrive Deal reflect that real data. Shipping Step 5 alone leaves `/submissions` showing the 6-row seed's prices for a few hours/days before Step 6 catches up — pointless intermediate state for internal testers.
- **ADR 0019 closure.** Step 6 supersedes ADR 0019 (deferred pricing). That closure belongs in the same commit that makes pricing real.
- **Step 6 is too small to justify its own session.** Three surgical edits (formatPrice's null-check, Pipedrive Deal `value`, placeholder-note removal). Combined with Step 5, it forms a coherent "pricing real, end-to-end" arc.

Sonnet 4.6 high is appropriate because:
- Schema is locked (ADR 0031), algorithm is locked (ADR 0032), field mappings are documented in the proposal.
- Work is mechanical: Google Sheets API auth, Supabase UPSERT, Pipedrive Products UPSERT, CLI prompt, three small consumer surgeries.
- Reasoning load lower than 3+4 (which needed Opus for the joint design of schema + algorithm).

## What this combined step is

Build `scripts/push-prices.ts` that reads the Master Sheet and UPSERTs to Supabase `products` + Pipedrive Products with a validation + change-preview + CONFIRM-or-CANCEL gate. Run it once against production to land the full ~36-row Sheet over the 6-row seed. Then make the partner UI / PDF / Pipedrive Deal reflect real prices (no more "Pricing TBD", no more `value: 0`, no more pinned placeholder note).

## What this combined step is NOT

- **Not the XLSX download (Step 7).** Step 7 has its own brief — adds an XLSX library, new download route, dashboard button.
- **Not the HTML price book (Step 8).**
- **Not a calculator UX change.**
- **Not a partner discount mechanic** — XLSX (Step 7) is MSRP-only; the per-user `discount_tier` is parked for Step 8 scoping.
- **Not a Google Slides project** — Slides was removed from Phase 2 entirely (ADR 0030).
- **Not adding a real FK on `submissions.recommended_product_id`** — legacy UUID strings still occupy that column. FK constraint comes after the legacy rows age out or are pruned.

## Context to read first

1. **[`AGENTS.md`](../../AGENTS.md)** — Next.js 16 caveat + three-doc discipline.
2. **[`docs/JOURNAL.md`](../JOURNAL.md)** — Phase 2 Steps 1–4 entries. Step 3+4 most recent; carries Q1–Q5 outcomes.
3. **[`docs/decisions/0019-defer-real-pricing-to-phase-2.md`](../decisions/0019-defer-real-pricing-to-phase-2.md)** — the placeholder-pricing ADR this step supersedes.
4. **[`docs/decisions/0030-phase-2-scope-and-locked-decisions.md`](../decisions/0030-phase-2-scope-and-locked-decisions.md)** — PQ2 (Sheet-as-is) + PQ5 (push script in this repo).
5. **[`docs/decisions/0031-step-3-4-schema-migration.md`](../decisions/0031-step-3-4-schema-migration.md)** — new products schema + free-plan backup posture (relevant for Step 5's pre-push backup).
6. **[`docs/proposals/phase-2-pricing-pipeline.md`](../proposals/phase-2-pricing-pipeline.md)** — "Phase 1 — Push Script" section: execution flow, Pipedrive field mapping, Supabase schema. Authoritative spec.
7. **[`scripts/validate-prices-sheet.ts`](../../scripts/validate-prices-sheet.ts)** — Step 2's validator. Exports `validateSheet()`. **Import this; don't re-implement the SKU regex + Product Group derivation.**
8. **[`scripts/backup-tables.ts`](../../scripts/backup-tables.ts)** — Step 3+4's backup tool. Run it again before the first prod push.
9. **[`src/lib/pipedrive/client.ts`](../../src/lib/pipedrive/client.ts)** — existing Pipedrive client. Reuse for Step 5's Products calls.
10. **[`src/lib/pipedrive/deal.ts`](../../src/lib/pipedrive/deal.ts)** — Deal builder. Step 6 changes `value: 0` here.
11. **[`src/app/(app)/_components/submission-detail.tsx`](../../src/app/(app)/_components/submission-detail.tsx)** — `formatPrice` lives here. Step 6 changes its null-handling.

## Andy's prereqs / decisions

Eight decisions to lock before code. The brief recommends defaults; ask if you want to deviate.

### Q1 — Google service account credentials (gating)

The push script needs read access to the Master Sheet via the Google Sheets API.

- **(a)** Andy creates a Google Cloud service account, downloads a JSON key, shares the Sheet with the service account email, and adds `GOOGLE_SHEETS_CREDENTIALS=/path/to/key.json` to `.env.local`. ~10 min of dashboard work.
- **(b)** Use the existing CSV-export URL (no auth — works because the Sheet is "Anyone with link can view"). Same data, no new credentials. **The validate-prices-sheet script already does this** (`https://docs.google.com/spreadsheets/d/<id>/export?format=csv`).
- **Recommendation: (b).** No new auth surface; matches the validator that already passes; the Sheet's public-link share is intentional. Document in JOURNAL that this is the deliberate choice over the proposal's service-account path.
- **Andy decision needed.**

### Q2 — Pipedrive Products fetch + UPSERT (gating)

Does Pipedrive currently have any rows in the Products endpoint?

- **(a)** Empty / unknown. Push script GETs `/v1/products` first, indexes by `code` (SKU), and UPSERTs (PUT if `code` exists, POST otherwise).
- **(b)** Pre-populated by Andy with some entries. Same UPSERT logic by `code`.
- **(c)** Pre-populated but with arbitrary `code` values that don't match the Sheet's SKUs. The script would create duplicates. Resolution: Andy manually deletes the bad ones before first run.
- **Recommendation: (a) or (b).** Either way, the UPSERT logic is the same. The first run prints a preview that surfaces any unexpected duplicates. **Pause the script before push if Andy needs to clean up.**
- **Andy decision needed.** (Quick: "what's currently in Pipedrive Products?")

### Q3 — MKT / CFQ rendering in Pipedrive

Per the proposal, MKT / CFQ rows go to Pipedrive with `prices[0].price = 0` and the product name prefixed with `[MKT]` or `[CFQ]`.

- **(a)** *Recommended:* Follow the proposal. `name` becomes `[MKT] VideoX RAM 32GB ...` etc. Price = 0. Sales sees the prefix and knows to quote manually.
- **(b)** Skip MKT/CFQ entirely — push only numeric. Pipedrive stays cleaner; reduces noise. But sales loses visibility into the existence of those SKUs.
- **Recommendation: (a).** Sales benefits from seeing all current SKUs in Pipedrive even if priced as 0.
- **Andy decision needed.**

### Q4 — Pipedrive product category

The proposal mentions mapping Product Group → Pipedrive `category` "if Pipedrive product categories are configured."

- **(a)** Skip for first push. Don't set `category`. Re-evaluate after seeing how Pipedrive renders without it.
- **(b)** Set `category` to the product_group string ("V200", "V800", etc). Requires Pipedrive product categories to be created first.
- **Recommendation: (a).** Skip the category field on first push. Pipedrive product categories aren't created today; setting an unknown category string fails the API call. Step 5 doesn't need this for correctness.
- **Andy decision needed.**

### Q5 — "Flagged for removal" handling

Per the proposal, products present in Supabase or Pipedrive but absent from the Sheet are listed as "flagged for removal" in the change preview but never deleted automatically.

- **(a)** *Recommended:* Print-only. The script lists flagged-for-removal rows and exits without touching them. Manual deactivation via `active=false` is a separate operation.
- **(b)** Auto-deactivate (`active=false` in Supabase; do-nothing in Pipedrive). Riskier — accidentally removing a sheet row could deactivate a real product.
- **(c)** Prompt per-row whether to deactivate. Slow + interactive; not worth it for current volumes.
- **Recommendation: (a).** Matches the proposal verbatim. Errs on the side of safety.
- **Andy decision needed.**

### Q6 — VX5-PP5-V100 status

Step 2 noted Andy was going to add `VX5-PP5-V100 / 5 Year Protection Plan / $1,995` to the Sheet. Run `node --import tsx scripts/validate-prices-sheet.ts` and check: if the script reports `[INFO] VX5-PP5-V100 (5-year warranty) not present in sheet`, Andy hasn't added it yet.

- **(a)** Andy has added it. Push includes it. Total Sheet rows = 37.
- **(b)** Not added. Push doesn't include it. Total rows = 36. Add it in a follow-up push later.
- **Recommendation:** Whichever reflects current Sheet state. The script runs against the live Sheet either way. **Don't block on this.**

### Q7 — Pipedrive Deal `value`

Step 6 changes the Pipedrive Deal `value` from `0` to a real number.

- **(a)** *Recommended:* `value = winner.units × winner.unitMsrp = winner.totalCostUsd`. The total list price of the recommended NVR configuration. Matches what `/submissions` shows.
- **(b)** `value = 0` still. Defer real-pricing to a later step. Loses the Step 6 goal.
- **(c)** `value = some discount-adjusted number`. Requires the per-user discount_tier mechanic that's parked for Step 8.
- **Recommendation: (a).** Sales sees an actual deal value; pipeline reporting becomes meaningful. The "Phase 1 placeholder" pinned note also goes away (no longer accurate).
- **Andy decision needed.**

### Q8 — ADR 0019 closure form

ADR 0019 ("Defer real pricing to Phase 2") is satisfied by this step.

- **(a)** *Recommended:* Update ADR 0019's Status to `Superseded by #0033` (or whatever the next ADR number is for the Step 6 changes). Add a one-line "Closure note" pointing at the new ADR.
- **(b)** Leave ADR 0019 as Accepted with a "completed" amendment. Less consistent with the ADR template.
- **Recommendation: (a).** Cleaner audit trail. Write ADR 0033 "Real pricing live in Phase 2" to capture the closure.
- **Andy decision needed.**

## Backup before pushing

Step 3+4's destructive migration required a JSON dump + reverse migration. Step 5's UPSERT is non-destructive on the SQL side (no schema change, no data deletion — just INSERTs and UPDATEs). But still:

1. **Re-run `scripts/backup-tables.ts`** before first prod push with tag `pre-step-5-6-real-pricing`. Captures the 6-row seed + current submissions so a rollback to the seed state is possible via `scripts/restore-tables.ts`.
2. **Pipedrive Products backup**: write a one-shot `scripts/backup-pipedrive-products.ts` that fetches `GET /v1/products` and writes the array to `backups/pipedrive-products-pre-step-5-<timestamp>.json`. ~30 lines. Captures any pre-existing Products entries so they can be restored (manually) if the UPSERT does something unexpected.
3. **CONFIRM-or-CANCEL gate is itself a backup mechanism**: the push script must print the full diff (new rows / updated rows / flagged-for-removal rows) and require typing `CONFIRM` before any write. Andy reads the preview before authorizing. **Do not skip this gate even in dev**.

## Code work — file-by-file task list

### 1. New: `scripts/backup-pipedrive-products.ts` (~30 lines)

```ts
// Dump current Pipedrive Products to JSON. Run before scripts/push-prices.ts.
// Pairs with the Supabase backup-tables.ts pattern for free-plan rollback.
//
// Run: node --env-file=.env.local --import tsx scripts/backup-pipedrive-products.ts
```

Uses the existing `pipedriveClient` from `src/lib/pipedrive/client.ts`. Calls `GET /v1/products` (paginate if `more_items_in_collection`). Writes `backups/pipedrive-products-pre-step-5-<timestamp>.json`. Gitignored via the existing `/backups/` entry.

### 2. New: `scripts/push-prices.ts` (~250–300 lines)

Follow the proposal's "Execution Flow" verbatim:

```
1. Import validateSheet() from validate-prices-sheet.ts and run it.
   Halt on any validation error.
2. Fetch Supabase products via service-role admin client.
   Index by sku.
3. Fetch Pipedrive Products via GET /v1/products (paginate).
   Index by code.
4. Compute change set:
     newInSupabase: sheet rows whose SKU isn't in supabase
     updatedInSupabase: sheet rows whose product_name OR msrp OR product_group differ
     flaggedForRemovalSupabase: supabase rows whose SKU isn't in sheet
     newInPipedrive: sheet rows whose SKU isn't in pipedrive (by code)
     updatedInPipedrive: sheet rows whose name OR prices[0].price differ
     flaggedForRemovalPipedrive: pipedrive products whose code isn't in sheet
5. Print full preview with counts + line-by-line.
6. Read 'CONFIRM' or 'CANCEL' from stdin. Halt on anything else.
7. Push to Supabase:
     UPSERT all sheet rows (new + updated) in chunks of 100.
     Use service-role admin client.
     active=true; sort_order=row-number-from-sheet.
8. Push to Pipedrive:
     For each sheet row:
       MKT row: name = '[MKT] ' + productName; prices = [{ price: 0, currency: 'USD' }]
       CFQ row: name = '[CFQ] ' + productName; prices = [{ price: 0, currency: 'USD' }]
       numeric: name = productName; prices = [{ price: msrp, currency: 'USD' }]
     POST if new; PUT /v1/products/{id} if existing.
9. Print completion summary with success counts + any errors.
   Exit 0 on full success; exit 1 if any errors (Supabase OR Pipedrive).
```

CLI args:
- `--dry-run` — skip step 6 prompt; do everything else; useful for previewing.
- (No other flags needed for first version.)

Field mapping into Supabase products:
- `sku`: SKU from sheet (column A)
- `product_name`: product name from sheet (column B)
- `msrp`: numeric value or NULL for MKT/CFQ
- `price_type`: 'numeric' | 'market' | 'call_for_quote' (derived from column C)
- `product_group`: derived from SKU prefix via validateSheet's existing parser
- `sort_order`: row number in sheet (1-indexed; preserved across runs)
- `active`: true
- `max_cameras`, `max_storage_tb`: **leave NULL for Step 5**. Only the 6 V-family server SKUs (V200/V400/V500/V600/V700/V800) need capacity; the rest (GPU/NIC/RAM/SW*/V100/V150/V250/V255/V260/V270/V270/PP5) are accessories or non-NVR servers. The 6 seed rows have correct capacity from Step 3+4; the push script preserves them via UPSERT-with-coalesce on those columns. **Approach: read existing max_cameras + max_storage_tb from Supabase before UPSERT, preserve in the UPSERT payload.** Document in the script header.

Field mapping into Pipedrive Products:
- `name`: per Q3 (with `[MKT]`/`[CFQ]` prefix when applicable)
- `code`: SKU
- `prices`: `[{ price: msrp_or_zero, currency: 'USD' }]`
- `category`: omitted per Q4(a)
- `unit`: omitted

### 3. `src/app/(app)/_components/submission-detail.tsx` — partner-price display fix

Current `formatPrice`:
```ts
function formatPrice(n: number | null | undefined): string {
  if (n === null || n === undefined) return "Pricing TBD";
  return `$${formatNumber(Number(n), 2)}`;
}
```

After Step 5, `total_list_price_usd` will be a real number for every new submission. The function is fine as-is. **However**, the 12 legacy submissions still carry their pre-migration totals ($1.00–$57.00 range). Options:

- **(a)** Leave as-is. Legacy submissions show $1.00–$57.00 (technically real values; the placeholder pricing was applied to them at the time). Consistent with Step 3+4's "(legacy data)" stance.
- **(b)** *Recommended:* In the SubmissionDetail component, detect the legacy condition (UUID-shaped `recommended_product_id` already detected for the product label) and render `formatPrice` as `"(legacy pricing — pre-Phase-2)"` instead of `$57.00`. Single-line change adjacent to the `isLegacyRecommendation` block.
- **Andy decision needed.** Either is defensible.

### 4. `src/lib/pipedrive/deal.ts` — three changes

a. `value: 0` → `value: recommendation.winner.totalCostUsd` (per Q7a).

b. Remove `PHASE_1_PLACEHOLDER_NOTE` constant + the `try { await pipedriveClient.createNote(...) }` block. The pinned-note workaround was for the $0 era; no longer needed.

c. `PORTAL_URL_PLACEHOLDER` → derive `submissions.id` permalink. Use the `getSiteOrigin()` helper if it exists, or hardcode `https://portal-arxys.vercel.app/submissions/${submissionId}`. (The `/submissions/[id]` route exists from Step 9 Phase B.)

### 5. `src/lib/pipedrive/deal.test.ts` — update assertions

- `value` assertion: `0` → `222144` (or whatever the fixture's `winner.totalCostUsd` becomes — match exact value).
- Drop the pinned-note assertion (no longer created).
- Add an assertion that the `arxys_portal_url` custom field receives `https://portal-arxys.vercel.app/submissions/<submissionId>` not the placeholder.

### 6. `docs/decisions/0019-defer-real-pricing-to-phase-2.md` — close out

Add at the top:
```
- **Status**: Superseded by #0033
```
Add a Closure section at the bottom pointing at ADR 0033 + JOURNAL entry.

### 7. New: `docs/decisions/0033-real-pricing-live-in-phase-2.md`

Captures: Q1-Q8 outcomes, Step 5+6 specifics, deal-value mechanic, why MKT/CFQ are surfaced with prefix vs skipped.

## Lessons from Step 3+4 to carry into this step

- **When dropping or replacing a FK, grep BOTH the column name and the PostgREST embed-alias patterns.** Step 3+4's post-deploy regression (hotfix `d02556c`) was caused by missing two list-page queries that used `products:recommended_product_id(name, sku)` — the embed alias was the *column name itself*, so a grep for the obvious symbol-rename targets (`winner.modelCode`, `winner.productId`) didn't catch them. Step 5+6 doesn't drop a FK, but: any time you change a column shape, grep for the column name everywhere — not just the symbol that uses it semantically. Pattern: `grep -rn '<col_name>\\|products:<col_name>\\|<embed_alias>(' src/`.
- **A passing `npm run build` doesn't catch PostgREST embed-via-FK breakage** — the embed string is opaque text to TypeScript. Manual dev-server smoke (or a programmatic query smoke that actually exercises the query) is the only catch. Don't defer the live smoke if any consumer touches PostgREST embeds.
- **Backup posture is now battle-tested.** The JSON dump + reverse-migration SQL pair (ADR 0031) worked cleanly; reuse the same pattern for Step 5's pre-push backup of both Supabase and Pipedrive Products.

## Verification gates

1. **Read the migration impact carefully.** Step 5 has no schema change but does mass-UPSERT. Confirm preview prints what you expect before typing CONFIRM.
2. **Backups taken**: `scripts/backup-tables.ts pre-step-5-6-real-pricing` + `scripts/backup-pipedrive-products.ts`. Both files present under `backups/`. Recorded in JOURNAL.
3. **Dry-run pass**: `node --env-file=.env.local --import tsx scripts/push-prices.ts --dry-run` prints full preview, exits 0 without writing.
4. **First real push**: `node --env-file=.env.local --import tsx scripts/push-prices.ts`. Type CONFIRM. Verify summary shows expected counts (~30 new in Supabase, ~30 new in Pipedrive on first run; the 6 V-family rows are UPDATE not new because Step 3+4 seeded them).
5. **Verify Supabase**: `select sku, msrp, product_group, max_cameras, max_storage_tb from products order by sort_order;` — expect ~36 rows. The 6 V-family seed rows should still have `max_cameras` + `max_storage_tb` (script preserved them). Other SKUs have NULL capacity.
6. **Verify Pipedrive**: open Pipedrive UI, Products tab, confirm ~36 entries. Check one MKT row has `[MKT]` prefix + price 0; one numeric row has correct price.
7. **Calculator smoke**: submit a calc at `/calculator`. Verify the recommendation pool is still the 6 V-family SKUs (push script kept their capacity, others have NULL). Verify the saved submission's `total_list_price_usd` matches the recommendation.
8. **`/submissions/[id]` smoke**: open the new submission's detail page. Verify "Total list price" shows real dollars (not "Pricing TBD"). Open a legacy submission; verify it shows either "$57.00" or "(legacy pricing)" per Q-decision on item 3.
9. **Pipedrive Deal smoke**: open the new Deal in Pipedrive. `value` shows the real dollar amount (not 0). No pinned `Phase 1 placeholder` note. The `arxys_portal_url` field points at `/submissions/[id]`.
10. `npm run lint` — clean.
11. `npm run build` — clean.
12. `npm test` — all pass (existing + updated Pipedrive deal tests).
13. `scripts/test-rls.ts` — all pass (no RLS changes expected).
14. Idempotent re-run: `scripts/push-prices.ts --dry-run` after the first push. Expect 0 new, 0 updated (everything already in sync).

## Definition of done

- [ ] All 8 prereq decisions (Q1-Q8) recorded in JOURNAL entry.
- [ ] Pre-push backups taken (Supabase JSON + Pipedrive Products JSON). Filenames in JOURNAL.
- [ ] `scripts/backup-pipedrive-products.ts` and `scripts/push-prices.ts` written + dry-run passes.
- [ ] First real push completed; Supabase + Pipedrive show ~36 SKUs.
- [ ] `src/app/(app)/_components/submission-detail.tsx` updated for legacy-pricing display (per Q decision).
- [ ] `src/lib/pipedrive/deal.ts` updated: real `value`, no placeholder note, real portal URL.
- [ ] `src/lib/pipedrive/deal.test.ts` updated to assert new shape.
- [ ] ADR 0019 status updated to `Superseded by #0033`.
- [ ] ADR 0033 written.
- [ ] All 14 verification gates green.
- [ ] JOURNAL entry written.
- [ ] RUNBOOK check: §6 already documents the migrations; if push-prices.ts becomes part of the happy-path setup recipe (it should — fresh project needs Step 5 to land real data), add a new §6a or §7a section.
- [ ] Working tree clean; one coherent commit.
- [ ] **Don't push without Andy's nod.**

## Open questions to surface before/during execution

1. **Q1-Q8 above** — confirmed answers before writing the push script.
2. **What if Pipedrive Products already has entries with codes that don't match the Sheet?** The dry-run preview will surface this. Andy decides whether to manually delete + retry, or accept the noise.
3. **What if a sheet row has empty product_name?** validateSheet should catch this — Step 2 already enforces non-empty SKU; extend to product_name in push-prices.ts (single check).
4. **Pipedrive rate limits**: ~10 req/sec sustained. ~36 SKUs is ~3-4 seconds at 1 req per write; well under the limit. No backoff logic needed for first version.

## Docs check (per AGENTS.md three-doc discipline)

- **`docs/JOURNAL.md`** — REQUIRED. Title: "Phase 2 Steps 5+6 — Real pricing pipeline live." Cover Q1-Q8, backups, dry-run + real push outcomes, calculator smoke, Pipedrive Deal smoke, verification gates, any detours.
- **`docs/RUNBOOK.md`** — likely updated. Add a §6a or similar: "Push the Master Sheet to Supabase + Pipedrive (`node --env-file=.env.local --import tsx scripts/push-prices.ts`)". This becomes part of the recreate-from-zero recipe.
- **`docs/decisions/`** — REQUIRED. ADR 0033 (real pricing live; supersedes 0019). Possibly a second ADR if any Q-decision turns out to need its own context (unlikely; Q1-Q8 are mostly small decisions).

## Out of scope reminders

- No XLSX download (Step 7).
- No HTML price book (Step 8).
- No partner-discount mechanic (deferred to Step 8 scoping).
- No Google Slides work — Slides was removed entirely (ADR 0030).
- No new FK on `submissions.recommended_product_id`.
- No new RLS policies.
- No `max_cameras` / `max_storage_tb` data entry for non-V-family SKUs. Leave NULL; the calculator's product query already filters those out via `not('max_cameras', 'is', null)`.

## Effort estimate

**3-4 hours of focused Sonnet 4.6 high session work.**

- Pipedrive Products backup script: 15 min.
- Push script main work: 90–120 min (sheet validation reuse → 5 min; Supabase diff + UPSERT → 30 min; Pipedrive diff + UPSERT → 45 min; CLI prompt + preview formatting → 20 min; --dry-run mode → 10 min).
- First real push + verification: 30 min (read preview carefully, then watch output).
- `submission-detail.tsx` + `deal.ts` + `deal.test.ts` surgical edits: 30 min.
- ADR 0019 closure + ADR 0033 write: 20 min.
- JOURNAL entry + RUNBOOK update + commit: 20 min.
- Buffer (unexpected Pipedrive shape, Sheet anomaly, dry-run reveals something): 30–60 min.

Plan for half a day. The script work is the bulk; the consumer surgeries are minutes each.

## When you finish

1. All 14 verification gates green.
2. JOURNAL entry written + ADRs 0019 (closed) and 0033 (new) committed.
3. RUNBOOK §6a (or equivalent) updated if push-prices is part of recreate-from-zero.
4. One coherent commit with a clear scope-prefixed message:
   - Example: `feat(pricing): Step 5+6 — push script + real pricing live`
5. **Don't push without Andy's nod.**
6. Summary back to Andy: row counts written to Supabase + Pipedrive, anything unexpected in the preview, sample calculator recommendation showing real dollars.
