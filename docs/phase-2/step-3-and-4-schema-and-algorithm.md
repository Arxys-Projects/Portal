# Phase 2 Steps 3 + 4 — Schema migration (UUID-PK → SKU-PK) + Recommendation algorithm rewrite (family → SKU)

> **Combined brief for two tightly-coupled steps. One execution session, one commit.**
>
> **Model recommendation**: **Opus 4.7** with **extended thinking enabled** ("ultrathink" / highest budget). Reasoning below in "Why combined / why Opus".
>
> **Important: this is the first Phase 2 migration that destructively changes production data.** Read the "Backup before migrating" section before running any `supabase db push`. There is no separate staging environment.

## Why combined / why Opus

The plan doc lists Steps 3 and 4 as separate work units. They're combined here because:

- **Type-level coupling.** The shape of `RecommendationCandidate` (Step 4's output) is determined by the shape of the `products` table (Step 3's domain). Step 3's schema change immediately invalidates `recommend()`, the calculator action that calls it, the PDF that displays its result, the Pipedrive deal builder that consumes it, and 8 recommendation tests. Shipping Step 3 alone leaves the codebase in a broken state until Step 4 lands.
- **Migration FK cascades** affect `submissions.recommended_product_id` and `server_specs.product_id` — both currently UUID FKs. The data-preservation decision (see prereqs Q4 below) is small but high-cost-if-wrong; a mis-step nulls historical submission FKs irrecoverably.
- **Algorithm tie-break logic** has subtle edge cases (MKT/CFQ SKUs with no msrp; SKUs with identical capacity-fit and identical price; workloads exceeding the biggest SKU; over-provisioning preference). Extended thinking helps reason through these before writing code.

Opus 4.7 ext-high is the right model. Sonnet would handle the mechanical parts, but the joint design of migration + algorithm benefits from deeper reasoning.

## What this combined step is

Replace the current 6-row family `products` table with the proposal's SKU-PK schema. Rewrite the recommendation algorithm to pick a specific SKU instead of a family. Update every consumer of the products table and the recommend() function. Ship one coherent commit that leaves `npm run build` + `npm run lint` + `npm test` + `scripts/test-rls.ts` all green.

## What this combined step is NOT

- Not the push script (Step 5). The migration includes a small seed of representative SKUs to keep tests passing; Step 5 truncates and repopulates with the full Sheet contents.
- Not the partner-price display fix (Step 6). After this step, `/submissions` partner view will likely show different placeholder prices (because the recommended SKUs have different MSRPs from the family seed). Step 6 separately makes the display use real numbers consistently.
- Not the XLSX download (Step 7). Not the HTML price book (Step 8).
- Not a calculator UX change. The form inputs stay the same; only the *recommendation output* changes (SKU instead of family).
- Not a Pipedrive option-ID change. The admin-curated calculator fields (VMS/CODEC/Scene Complexity) stay as they are.

## Context to read first

Substantial reading list — this is the most context-heavy Phase 2 step yet:

1. **[`AGENTS.md`](../../AGENTS.md)** — Next.js 16 caveat + three-doc discipline.
2. **[`docs/phase-2-plan.md`](../phase-2-plan.md)** — Step 3 + Step 4 rows in the work-unit table.
3. **[`docs/decisions/0030-phase-2-scope-and-locked-decisions.md`](../decisions/0030-phase-2-scope-and-locked-decisions.md)** — locked PQs, especially PQ4 (full SKU-PK migration).
4. **[`docs/JOURNAL.md`](../JOURNAL.md)** — read all Phase 2 entries (setup, lock, Step 1, **Step 2**). Step 2's entry records Andy's decisions on `VX5-PP5-V100`, Partner Discount Price column, SW group collapse rule, and any unexpected SKUs in the Sheet. **You must know Step 2's outcomes before designing the migration seed.**
5. **[`scripts/validate-prices-sheet.ts`](../../scripts/validate-prices-sheet.ts)** — Step 2's validation script. Has the SKU regex + Product Group derivation logic; consider importing rather than re-implementing.
6. **[`docs/proposals/phase-2-pricing-pipeline.md`](../proposals/phase-2-pricing-pipeline.md)** — "Phase 1 — Push Script" section has the Supabase schema spec (`sku TEXT PRIMARY KEY`, `msrp NUMERIC nullable`, `price_type`, `product_group`, `sort_order`, `active`, `updated_at`). That's the target shape; this step builds it.
7. **[`supabase/migrations/20260515193702_initial_schema.sql`](../../supabase/migrations/20260515193702_initial_schema.sql)** — current `products`, `server_specs`, `submissions` schema. Lines for `products` (UUID PK), `server_specs` (per-family capacity), `submissions.recommended_product_id` (UUID FK).
8. **[`src/lib/recommend/types.ts`](../../src/lib/recommend/types.ts)** — current `RecommendationCandidate` shape.
9. **[`src/lib/recommend/algorithm.ts`](../../src/lib/recommend/algorithm.ts)** — current `recommend()`. Family-level. Ranks by `unitPrice` then `model_code` alphabetical.
10. **[`src/lib/recommend/`](../../src/lib/recommend/)** — the 8 tests. They'll need substantial rewrites.
11. **[`src/app/(app)/calculator/actions.ts`](../../src/app/(app)/calculator/actions.ts)** — calls `recommend()`. Lines ~120-172 query products + server_specs and pass to `recommend()`, then persist results.
12. **[`src/lib/pipedrive/deal.ts`](../../src/lib/pipedrive/deal.ts)** — uses `recommendation.winner.modelCode` to build `arxys_recommended_models` and `Recommended Server` strings (lines 108-109, 171). Decide: does this become "3 × VX5-V800-720" (SKU-precise) or stay "3 × V800" (family-friendly)?
13. **[`src/lib/pdf/SubmissionPdf.tsx`](../../src/lib/pdf/SubmissionPdf.tsx) + [`src/lib/pdf/render.ts`](../../src/lib/pdf/render.ts)** — render `data.recommendation.productDescription`. Will need updated text for SKU-level recommendations.
14. **[`src/app/(app)/_components/submission-detail.tsx`](../../src/app/(app)/_components/submission-detail.tsx)** — admin + partner submission detail. Reads `submission.product` (joined from `products`). Type changes.
15. **[`scripts/test-rls.ts`](../../scripts/test-rls.ts)** — has RLS checks on `products`. The select policy `products_select_active_or_admin` carries over but the column shape changes.

## Andy's prereqs / decisions

Five decisions to lock before code. Brief should pause and ask for any not already answered.

### Q1 — Historical submission data preservation

Today's production database has ~14 submissions with `recommended_product_id` pointing at UUIDs of the 6-row family `products` table. After migration, those UUIDs are gone. Three options:

- **(a) Map family UUID → representative SKU.** Each old UUID maps to a mid-tier SKU of the same family (V800 UUID → `VX5-V800-720`). Historical reports show a SKU that's slightly different from what the original recommendation actually meant (because the original picked "V800 family" and the new SKU is one specific V800 tier, chosen by us today not by the original calc). Defensible but inaccurate.
- **(b) Drop the FK; convert column to TEXT.** Historical rows preserve the UUID string as plain text but it points at nothing. Reports show "—" or "(legacy)" for product details. No data lost; semantically clean.
- **(c) Archive table.** Move the 6 old family rows to a `products_archive` table; keep the UUID FK pointing there OR map old FKs to archive-table SKUs prefixed with `LEGACY-`. Reports can still render the old name. More migration code, more durable history.
- **Recommendation: (b).** Historical rows are placeholder-priced (`$1.00 - $57.00`) and have been internal-only testing data anyway. The semantic clean break + minimal migration code is the best trade. Reports show "(legacy data)" for the product cell.
- **Andy decision needed.**

### Q2 — server_specs treatment

Today: `server_specs` has 6 rows, one per product family, with `max_cameras` and `max_storage_tb`. After SKU-PK migration, options:

- **(i) Expand `server_specs` to per-SKU (~35 rows).** Each SKU has its own capacity row. `max_storage_tb` can be derived from the SKU's storage-tier suffix where possible (`VX5-V200-64` → 64 TB, `VX5-V800-864` → 864 TB). `max_cameras` is an engineering value; Andy would need to provide per-SKU or per-family.
- **(ii) Inline capacity into the `products` table.** Drop `server_specs`. Products gets `max_cameras` + `max_storage_tb` columns. Simpler schema; loses the "engineering spec separate from customer-facing data" split (which may have been over-engineering).
- **(iii) Keep `server_specs` at family-level; products has a `product_group` foreign-key relationship to it.** `recommend()` joins products → server_specs via `product_group`. Same 6 server_specs rows; products has 35.
- **Recommendation: (ii) inline.** Simplest. Capacity *is* a property of the product. The architectural separation was hypothetical; in practice nobody querying products needs capacity-without-product-info or vice versa. Drop `server_specs`, move both columns into products. Migration is more involved but the steady state is cleaner.
- **Andy decision needed.**

### Q3 — `max_cameras` source

Independent of Q2's outcome, the new schema needs `max_cameras` values per SKU (or per family if (iii)). Today's 6-row server_specs has values for V200/V400/V500/V600/V700/V800. The new schema needs values for ~35 SKUs OR continues to use the 6 family-level values.

- **(a) Andy supplies a per-SKU `max_cameras` table.** 5 minutes of his time if it's easy to derive from the engineering BOM.
- **(b) Per-family fallback.** All `VX5-V200-*` SKUs share the V200 max_cameras value (e.g. 64). Reasonable approximation since the storage tier doesn't change camera count much.
- **(c) Defer to Step 5 or later.** Migration uses placeholder `max_cameras=999` for all SKUs; Step 5 or a follow-up step populates with real values.
- **Recommendation: (b).** Storage-tier variants of a family have the same camera count in practice (the tier affects retention, not concurrent stream count). The values from the current 6 server_specs rows carry forward via family grouping.
- **Andy decision needed.**

### Q4 — MKT / CFQ SKUs in the recommendation pool

Some SKUs in the Sheet have `MKT` (market price) or `Call for Quote` MSRPs. After Step 5 populates these into Supabase, the recommendation algorithm has to decide: are MKT/CFQ SKUs *eligible* to be recommended?

- **(a) Exclude.** `recommend()` only considers SKUs with `price_type='numeric'`. MKT/CFQ SKUs are never picked, even if they're the only fit for a workload.
- **(b) Include but flag.** `recommend()` may pick MKT/CFQ SKUs; if it does, the result includes a `requiresQuote: true` flag and the calculator UI shows "Contact Arxys for pricing on this configuration."
- **(c) Include only when no numeric-priced alternative exists.** Prefer numeric SKUs; fall back to MKT/CFQ only if the numeric pool can't fit the workload.
- **Recommendation: (a) exclude.** Today's Sheet has MKT only on `VX5-RAM-32GB` (an accessory, not a server) and CFQ only on `VX5-SW30-300` + `VX5-SW35-300` (workstations, not NVR servers). None of these belong in a video-storage NVR recommendation anyway — they'd never be picked. Excluding by price_type also excludes by category implicitly. If a future server SKU lands as MKT/CFQ, escalate.
- **Andy decision needed.**

### Q5 — Pipedrive `arxys_recommended_models` + "Recommended Server" precision

The Pipedrive deal builder writes a string like `"3 × V800"` to two fields. After SKU migration, options:

- **(a) Family-friendly**: keep `"3 × V800"` (derived from SKU's product_group). Reads cleanly in Pipedrive.
- **(b) SKU-precise**: write `"3 × VX5-V800-720"`. More information, less readable.
- **(c) Both**: separate Pipedrive fields. arxys_recommended_models stays family; new arxys_recommended_skus carries the precise SKUs.
- **Recommendation: (a) family-friendly for both existing fields; add an `arxys_recommended_skus` field if Andy wants the precise mapping in Pipedrive.** Sales reading the Deal cares about "what V-family did we pitch," not the storage tier (which is a config detail to confirm during sales conversation).
- **Andy decision needed.**

## Backup before migrating

Production Supabase has ~14 real submissions + 6 placeholder products + 6 server_specs rows. This is the first Phase 2 migration that destructively changes data structure. Before running `supabase db push`:

1. **Take a database snapshot via the Supabase dashboard.** Dashboard → Database → Backups → Create backup. Name it `pre-step-3-4-sku-pk-migration-<date>`.
2. **Alternative or additional**: `supabase db dump --schema public > backups/pre-step-3-4.sql` (requires Supabase CLI + Docker; the JOURNAL notes Andy doesn't have Docker, so dashboard snapshot is the canonical path).
3. **Confirm rollback procedure.** If migration fails or produces wrong results, restore the dashboard snapshot is the rollback. Time to restore: ~5 min. Practice it mentally before running.

If you don't have dashboard snapshot access, stop and tell Andy. Don't run the migration without a recoverable backup.

## Code work — file-by-file task list

### 1. New migration: `supabase/migrations/<timestamp>_step3_4_products_sku_pk.sql`

Generate the timestamp with `supabase migration new step3_4_products_sku_pk`. The file lands at `supabase/migrations/<yyyymmddHHMMSS>_step3_4_products_sku_pk.sql`.

DDL outline (concrete final shape depends on Q1/Q2/Q3 answers):

```sql
-- 1. Drop FK constraints from consumers
alter table submissions drop constraint submissions_recommended_product_id_fkey;
-- (server_specs FK handled per Q2 outcome)

-- 2. Drop / rename products table per Q1 outcome
-- Q1(b) recommended: drop products entirely; convert recommended_product_id to TEXT.
drop table if exists products cascade;

-- 3. Create new products table
create table products (
  sku text primary key,
  product_name text not null,
  msrp numeric,                                    -- nullable for MKT/CFQ
  price_type text not null check (price_type in ('numeric', 'market', 'call_for_quote')),
  product_group text not null,
  sort_order integer not null,
  active boolean not null default true,
  max_cameras integer,                             -- Q2(ii) inline; Q2(iii) drop
  max_storage_tb integer,                          -- Q2(ii) inline; Q2(iii) drop
  updated_at timestamptz not null default now()
);

-- 4. RLS: re-create select policy
alter table products enable row level security;
create policy products_select_active_or_admin on products
  for select using (active or is_admin(auth.uid()));
-- (admin write policy if needed; service-role bypasses RLS anyway, used by push script)

-- 5. submissions: replace UUID FK with TEXT
alter table submissions
  alter column recommended_product_id type text using recommended_product_id::text;
-- Per Q1(b): no FK constraint reinstated; historical rows preserve UUID strings as opaque.

-- 6. server_specs: drop per Q2(ii). Otherwise per Q2(i) or (iii).
drop table if exists server_specs cascade;

-- 7. Seed: insert representative SKUs to keep tests + manual smoke working until Step 5 push.
--    Aim for ~6 SKUs (one per major family at a mid-tier) so the calculator can still recommend.
insert into products (sku, product_name, msrp, price_type, product_group, sort_order, max_cameras, max_storage_tb) values
  ('VX5-V200-80',  'VideoX V200 80TB 1U 4Bay Rack',     16640, 'numeric', 'V200', 1, 64,  80),
  ('VX5-V400-160', 'VideoX V400 160TB 2U 8Bay Rack',    26910, 'numeric', 'V400', 2, 128, 160),
  ('VX5-V500-240', 'VideoX V500 240TB 2U 12Bay Rack',   35926, 'numeric', 'V500', 3, 192, 240),
  ('VX5-V600-320', 'VideoX V600 320TB 3U 16Bay Rack',   41659, 'numeric', 'V600', 4, 256, 320),
  ('VX5-V700-480', 'VideoX V700 480TB 4U 24Bay Rack',   54512, 'numeric', 'V700', 5, 384, 480),
  ('VX5-V800-720', 'VideoX V800 720TB 4U 36Bay Rack',   74048, 'numeric', 'V800', 6, 576, 720)
on conflict (sku) do nothing;
```

Treat this as a sketch. Final shape depends on Q1-Q3 outcomes. **Read the migration carefully before pushing — destructive operations have no undo button.**

### 2. `src/lib/recommend/types.ts` — update types

- Rename `RecommendationCandidate.modelCode` → `sku` (or keep `modelCode` as an alias; the executor decides).
- Add `productGroup: string` to candidate.
- Add `productName: string`.
- `unitPrice` stays but is now `number | null` (null for MKT/CFQ — though per Q4(a) these wouldn't appear in the candidate pool anyway).
- `RecommendationResult.winner` keeps shape but with the renamed fields.

### 3. `src/lib/recommend/algorithm.ts` — rewrite

New logic:

1. Filter input pool to `price_type='numeric'` SKUs only (per Q4(a)).
2. For each SKU, compute units needed: `ceil(workload.cameras / sku.max_cameras)` and `ceil(workload.storageTb / sku.max_storage_tb)`. Take the max.
3. For each SKU, compute total cost: `units × msrp`. Skip if msrp null.
4. Rank candidates:
   - Primary: total cost ascending (cheapest fit wins).
   - Secondary: units ascending (fewer units preferred on cost tie).
   - Tertiary: capacity utilization ascending (less over-provisioning preferred on units tie).
5. Return winner + alternatives + warnings (e.g. "Workload exceeds biggest SKU's single-unit capacity; recommendation is N units").

The current algorithm picks a family and counts units; the new one picks a specific SKU. The arithmetic shape is similar but the input space is ~35 SKUs not 6 families.

### 4. `src/lib/recommend/*.test.ts` — update 8 tests

Each test sets up products + server_specs + workload, calls recommend(), asserts shape of result. After the rewrite:

- products fixtures use new schema (sku, msrp, max_cameras, max_storage_tb inline).
- Assertions reference specific SKUs (e.g. `expect(result.winner.sku).toBe('VX5-V200-80')`) instead of family model codes.
- New test case: MKT/CFQ SKUs are filtered out of candidate pool (per Q4).
- New test case: tie-break on "less over-provisioning" when prices match.

Run `npm test` until 19/19 (or more, if new cases added) green.

### 5. `src/app/(app)/calculator/actions.ts` — update queries

- Drop the join through `server_specs`. Query just products (which now has max_cameras + max_storage_tb inline per Q2(ii)).
- Filter `active=true AND price_type='numeric'`.
- Pass the typed result to `recommend()`.
- After recommendation, update `submissions` insert: `recommended_sku` (or whatever the new column is named).

### 6. `src/lib/pipedrive/deal.ts` — update recommended-models string

Per Q5(a): `arxys_recommended_models` stays as `"N × V800"` (family-friendly). Derive family from `winner.productGroup`. The `Recommended Server` admin-curated field gets the same string.

If Q5(c) — add `arxys_recommended_skus` (or similarly named) — the deal builder writes a new custom field with the precise SKU. Treat as additive; existing field semantics unchanged.

### 7. `src/lib/pdf/SubmissionPdf.tsx` + `src/lib/pdf/render.ts` — update display

The PDF's "Recommended Hardware" line currently reads `{winner.units} × {productDescription}`. After the rewrite, productDescription is the SKU's product_name from the new schema. Code should mostly Just Work after the type update — verify the display.

If Q1(b) is chosen and a historical submission's PDF is requested, the productDescription will be missing. Handle gracefully — render "(legacy data — product details unavailable)" or similar.

### 8. `src/app/(app)/_components/submission-detail.tsx` — update display

`submission.product` shape changes (joined `products` row is now SKU-shaped). Update the type + the rendering. Same legacy-data handling as the PDF.

### 9. `scripts/test-rls.ts` — update products checks

- Remove `model_code` references (column dropped).
- The `products_select_active_or_admin` policy carries over; test cases stay similar but assertions reference the new shape.
- Verify a partner can SELECT products with `active=true`; suspended/inactive can't.

### 10. `package.json` — likely no new deps

Step 3+4 doesn't add new libraries. Step 5 (push script) adds `googleapis`.

## Verification gates

In order, *after* the migration is staged + before push:

1. **Read the migration carefully.** Confirm DROP statements only hit the intended tables. Confirm the seed data is reasonable.
2. **Backup taken** (dashboard snapshot per "Backup before migrating" above). Recorded in JOURNAL entry.
3. `SUPABASE_DB_PASSWORD='...' supabase db push` — apply migration.
4. **Verify schema** via `psql` or the dashboard: `\d products`, `\d submissions`. Confirm columns + types.
5. **Verify seed**: `select sku, product_name, msrp from products order by sort_order;` — expect 6 rows.
6. **Verify historical data**: `select id, recommended_product_id from submissions limit 5;` — expect TEXT values (UUIDs as strings) per Q1(b).
7. `npm run lint` — clean.
8. `npm run build` — clean.
9. `npm test` — 19+/19+ passing (count may rise if new tests added).
10. `node --env-file=.env.local --import tsx scripts/test-rls.ts` — 8/8 (or more if new cases added) passing.
11. **Manual smoke** via `npm run dev`:
    - `/calculator` — submit a calculation; confirm a specific SKU is recommended.
    - `/submissions` — view the new submission; product info shows the recommended SKU's product_name.
    - `/admin/submissions/[id]` — same.
    - PDF download from the new submission — confirm SKU and price are shown.
    - For historical submissions (pre-migration ones): confirm "(legacy data)" or equivalent renders.

## Definition of done

- [ ] All five prereq decisions (Q1-Q5) recorded in the JOURNAL entry.
- [ ] Database backup taken and noted in JOURNAL.
- [ ] Migration file at `supabase/migrations/<timestamp>_step3_4_products_sku_pk.sql`.
- [ ] Migration applied cleanly to production Supabase (no errors).
- [ ] New `products` table populated with seed (~6 representative SKUs).
- [ ] `server_specs` dropped (Q2(ii) recommended) or restructured per chosen option.
- [ ] `submissions.recommended_product_id` migrated to TEXT (Q1(b) recommended) or per chosen option.
- [ ] `recommend()` rewritten and tested.
- [ ] All consumers updated: calculator actions, PDF, Pipedrive deal builder, submission-detail component, test-rls.
- [ ] 11 verification gates above all green.
- [ ] JOURNAL entry written with all five Q decisions, backup record, migration outcome, test results, manual smoke results, any Detours & fixes.
- [ ] 1-2 new ADRs in `docs/decisions/`:
  - **ADR 0031** likely needed: "Step 3+4 schema migration — server_specs inlined, historical FK preserved as TEXT" (or equivalent depending on Q outcomes).
  - **ADR 0032** likely needed: "SKU-level recommendation algorithm" — tie-break logic, MKT/CFQ exclusion rule. Could be combined with 0031 into a single ADR if the executor judges the decisions tightly coupled.
- [ ] Working tree clean; commit message scope `feat(products):` or `feat(schema+recommend):`.
- [ ] **Don't push without Andy's nod.**

## Open questions to surface before/during execution

1. **Q1-Q5 above** — confirmed answers (or your recommendations accepted) before writing migration SQL.
2. **Migration RLS** — current schema's admin/partner read policies on products carry forward; double-check no policy references `products.id UUID` directly (which would break on the PK type change).
3. **Pipedrive deal `arxys_storage_gb` field** — currently passes total workload storage in GB. Doesn't reference the recommended product. Unchanged. Sanity-check.
4. **Test-rls fixtures** — `scripts/test-rls.ts` may seed test products or expect specific rows. Adjust to match new shape.
5. **What if migration partially applies?** Postgres DDL in a single migration file is one transaction (BEGIN/COMMIT bracket the whole file). If one statement fails, the whole migration rolls back. Confirm this is the case before relying on it.

## Docs check (per AGENTS.md three-doc discipline)

- **`docs/JOURNAL.md`** — REQUIRED. Long entry (likely the longest Phase 2 entry yet) covering: Q1-Q5 outcomes, backup record, migration applied, algorithm rewrite summary, edge cases handled, test outcomes, manual smoke outcomes. Detours & fixes subsection for any production surprises (likely: at least one). Title: **"Phase 2 Steps 3+4 — Schema migration + recommendation algorithm rewrite"**.
- **`docs/RUNBOOK.md`** — possibly updated. If the migration changes the §6 "apply the schema" step in a way that affects recreating from zero (e.g. new migration timestamps are mentioned, or seed data is required for a working calculator), update. Likely a small change.
- **`docs/decisions/`** — REQUIRED. At minimum ADR 0031 covering the schema migration decisions. Possibly ADR 0032 covering the algorithm rewrite. Two ADRs is fine; one consolidated ADR (like 0030) is also fine if the executor judges decisions tightly enough coupled.

## Out of scope reminders

- No push script (Step 5).
- No partner XLSX download (Step 7).
- No HTML price book (Step 8).
- No partner-price display fix (Step 6) — though after this step, partner submissions will show different numbers (the SKU MSRPs from seed). That's Phase 2 evolution, not regression. Step 6 makes it intentional.
- No Pipedrive Products endpoint work — Pipedrive Products table (separate from Deals + dealFields) is Step 5's domain.
- No Sheet edits.
- No custom domain.

## Effort estimate

**4-8 hours of focused Opus 4.7 ext-high session work.** Variable because:

- Migration SQL writing + careful review: 30-60 min.
- Algorithm rewrite: 60-90 min.
- Test rewrites: 60-90 min (8 tests; some may need significant rework).
- Consumer updates (calculator action, PDF, Pipedrive, submission-detail, test-rls): 60-90 min.
- Verification gates: 30-45 min.
- JOURNAL entry + ADR(s): 30-45 min.
- Buffer for surprises (FK constraint complications, test failures requiring algorithm tweaks, manual-smoke issues): 60-120 min.

Plan for ~half a day. Don't rush; this is the schema change Phase 2 was built around.

## When you finish

1. All 11 verification gates passed.
2. JOURNAL entry written + ADR(s) committed.
3. Commit with a clear scope-prefixed message capturing both steps:
   - Example: `feat(products): SKU-PK migration + recommendation algorithm rewrite`
   - Or split body: subject covers Step 3+4 combined; body bullets list the major changes.
4. **Don't push without Andy's nod.** Same cadence as Steps 1 and 2.
5. Surface a brief summary back to Andy noting: migration applied, backup taken, recommendation outcomes for the manual smoke submissions, anything unexpected.
