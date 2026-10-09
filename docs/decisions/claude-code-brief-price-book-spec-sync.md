# Claude Code brief: Price Book product pages read their facts from product_specs

**Recommended model: Opus 5. Effort: xhigh.**

Why: this change refactors helpers inside a customer-facing datasheet adapter, picks a canonical row across SKUs, and has several judgment calls (hidden SKUs, RAID basis, wording). There are no schema, RLS or live-write steps. If you split the work, Step 3's page swap alone is mechanical enough for Sonnet 5 at high.

Written before the work. The JOURNAL records what actually happened.

---

## 1. The problem in one paragraph

`/admin/specs` edits `product_specs`. The datasheet PDF (`/api/datasheet/{model}`), the calculators and the recommender all read that table, so they stay current. The product pages at `/price-book/{slug}` do not. Their hero stats (Max VSR, Throughput, Warranty), Key Features and Technical Specs are literal strings in `src/lib/price-book/families.ts`, so every spec edit leaves the product page stale. The SKU table on V200 through V800 has the same disease: hardcoded `skuExtraData.netStorage` strings shadow the computed net-usable value.

Evidence Andy saw: the V400 page shows "AMD EPYC 9005 3.3GHz 16/32 Core CPU" and "Max VSR 200 streams". Migration `20260914000001` set the V400 to `AMD EPYC 9015 3.6Ghz 8/16 Core` and 150 cameras. The V700 and V800 pages show 4.3GHz and 325 streams; migrations `20260914000001` and `20260914000002` set them to `AMD EPYC 9005 3.3Ghz 16/32 Core` and 275. The datasheets are right and the pages are wrong, which is the whole bug.

## 2. Decisions Andy already made. Do not reopen them.

1. **Scope is phase 1 only: the seven product_specs families** (V100, V200, V400, V500, V600, V700, V800). V250, V260, V150 ACM and SW10/SW20 read `appliance_specs` and stay authored in this change. Build the derivation layer so those families can plug in later.
2. **`tagline` and `greatFor` stay authored** in `families.ts`. `usage_paragraph` is not used on the page.
3. **Retire the `netStorage` overrides for V200 through V800** (18 entries). V100's three overrides stay, because it publishes two figures (RAID 1 and JBOD) and `usableCapacityTb()` takes one level.
4. **The OS line derives from `os_edition`**, same as the datasheet. The page wording changes from "IoT Standard" to whatever the column says ("Windows Server 2022 or 2025 LTSC" today). Andy approves the before/after table before anything is committed.

Two defaults set by the planner. Andy can veto either at Gate B:

- Throughput unit becomes **Mbit/s** (datasheet, SKU table and commit 66edf22 all use it; the V-series page strings still say "Mbps"). Put it behind one constant so reverting is a one-line change.
- Generated strings contain **no em dashes**. Today's authored strings use one in "Mirrored Enterprise OS SSD — Hot Swap". Use a comma. This is Andy's standing writing rule.

## 3. Read first

1. `AGENTS.md`. It warns that this Next.js (16.2.6) has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before touching any page or route code.
2. `docs/README.md`, then the top of `docs/JOURNAL.md`. JOURNAL lines near 4631 to 4642 record the original intent that families.ts copy and product_specs data would be shared.
3. ADRs: 0069 (SKU table net-usable and bandwidth), 0092 (RAID 60 parity, net-usable definition), 0096 and 0097 (product_specs is canonical and admin-editable; `skuExtraData` retirement path), 0110 and 0116 (live datasheet route), 0127 (VMS-visible "available" capacity), 0133 (VSR rating basis).
4. Code: `src/lib/price-book/families.ts`, `cell-value.ts`, `src/app/(app)/price-book/[slug]/page.tsx`, `src/lib/datasheet/from-product-specs.ts`, `spec-text.ts`, `catalogue.ts`, `load.ts`, `src/lib/capacity-utils.ts`, `src/app/(app)/admin/specs/actions.ts` and `fields.ts`, `scripts/render-datasheet.ts`.

## 4. Gotchas found during orientation. Read before designing.

**G1. Migrations may be stale evidence.** The 20260914 migration comments themselves say seed values "drifted under admin edits". Step 1 reads live rows. Do not derive expectations from migration text.

**G2. The V400 RAID basis conflicts with itself.** The V400 override strings (96, 120, 144 TB for 128, 160, 192 raw) equal raw x 6/8, which is RAID 6 math on 8 drives. The V400 Key Feature on the page says "RAID 5", which would give 112, 140, 168 TB. After the override is retired, the page shows whatever `product_specs.raid_level_display` implies. If that changes any published V400 capacity, it is a STOP-AND-FLAG item. ADR 0092 is the precedent: the V800 moved 6.7% and sales were owed a heads-up. Report the old and new figure per SKU and wait for Andy.

**G3. Hidden `-NCD` rows pool into model groups in the datasheet adapter (verify, do not fix).** `modelOf()` takes `id.split("-")[1]`, so `VX5-V400-128-NCD` and `VX5-V400-192-NCD` land in the V400 group. `loadDatasheetSpecData()` selects every row, and `hidden_from_catalog` only filters the price list and recommender (migration 20260818000002). With the stable ascending sort by `storage_raw_tb`, an NCD row sorts after its twin, so `canonicalRow()` can pick an NCD row and `orderableRows()` can list NCD part numbers on the V400 ordering table. The datasheet is now open to every active partner (ADR 0116), so this would be customer-visible. In Step 1, run `render-datasheet.ts` for V400 and look. Report the result. Do not change the datasheet adapter in this task.
For the Price Book derivation, build the row set from `product_specs` rows whose id is one of the family's visible SKUs (the page already queries `current_products` with `hidden_from_catalog = false`).

**G4. `raidLabel("NA")` returns "NA".** The V100 rows historically carry `raid_level_display = 'NA'` (deprecated value), and V100 publishes "RAID 1 or JBOD" through `raid_level_alt_display`. Treat `NA` as "no level", never print it, and compose the V100 phrase from the primary and alternate levels.

**G5. Shared phrase helpers are private today.** `raidLabel`, `osText`, `isNegative`, `hasTpm` and `PORT_WORD` live unexported in `from-product-specs.ts`. Move the ones you need into `src/lib/datasheet/spec-text.ts` (already "shared by both adapters") and import them back. Pure move, no behavior change. `from-product-specs.test.ts` (656 lines) must pass untouched.

**G6. CPU string.** The DB stores "3.3Ghz", the page shows "3.3GHz". Derive the CPU bullet from `cpu_model_full` alone (the core/thread count is inside the string) and normalize `Ghz` to `GHz`. Two twin columns exist, `cpu_cores_threads` (used by /comparison) and `cores_threads` (datasheet, QuickCompare). Neither is needed for the bullet, and nothing warns when they disagree with `cpu_model_full`. Report that as a follow-up, do not fix it.

**G7. Keep the override mechanism.** `cellValue()` stays as is. V100, V150, V250, V260 and SW still use `skuExtraData`. Only delete the 18 `netStorage` entries on V200, V400, V500, V600, V700, V800, and update the comments in `families.ts` that describe them.

**G8. Keep the new module pure.** `load.ts` imports `server-only`. Do not import it from `family-specs.ts` or from tests.

**G9. Caching is already fine.** The page builds its Supabase client from cookies, so it renders dynamically, and `revalidateSpecPaths()` in `admin/specs/actions.ts` already revalidates `/price-book` and the family page. Confirm no `use cache` or `revalidate` export exists on the page and leave the actions alone.

**G10. Adjacent drift. Report only, do not fix.**
- The compliance strip on the detail page is a literal array, and the index page repeats the VMS list in its "Enterprise Grade" box. The datasheet takes the list from `copy.VMS_VALIDATED`, and `product_specs.vms_certified` holds a third copy. Check whether the three agree.
- `FAMILY_CATEGORIES` hardcodes "5-year warranty" and "3-year warranty" section labels on the index page.
- "Next Business Day Parts" (warranty KPI unit) is authored text. Check what `warranty_terms` actually holds in live rows. If it is clean and short, use it. If it is not, keep one authored constant and say so in the report.

## 5. Design

### 5.1 New module `src/lib/price-book/family-specs.ts` (pure)

```ts
deriveFamilyDisplay(rows: ProductSpecRow[], model: string): {
  kpis: FamilyKpi[];            // always 3: Max VSR, Throughput, Warranty Support
  keyFeatures: string[];
  technicalSpecs: string[];
}
resolveFamilyDisplay(family: Family, specRows: ProductSpecRow[]): same shape
```

- Uses `groupByModel()` and `canonicalRow()` from `from-product-specs.ts` on the visible rows, so the page and the datasheet pick the same row by the same rule. One canonical-row rule, one place.
- `resolveFamilyDisplay` returns authored arrays for authored families and derived arrays for product_specs families.
- A bullet whose required columns are blank is dropped, the way `specRow()` drops rows on the datasheet. Never substitute old authored text. If a family has no usable rows at all, render the page's existing empty-value placeholder in the stats and log a server-side error naming the model.

### 5.2 Make the old bug unrepresentable

Turn `Family` into a union on `specSource`:

- `specSource: "product_specs"`: carries no `keyFeatures`, `technicalSpecs` or `kpis` field. Adding one is a compile error.
- `specSource: "authored"`: carries the three arrays, as today.

This is the same technique `cell-value.ts` uses for `ProductRow`. The seven families become `"product_specs"`. V250, V260 and SW stay `"authored"`.

### 5.3 Page changes (`[slug]/page.tsx`)

- Broaden the existing `product_specs` query from five columns to `select("*")` for the family's visible SKUs. Keep building `specsBySku` for the SKU table.
- Replace the three `family.kpis / keyFeatures / technicalSpecs` reads with `resolveFamilyDisplay(...)`.
- Leave the VSR tooltip (ADR 0133), the fine print and the layout untouched.

### 5.4 Bullet rules (draft; finalize in Step 2)

Hero stats:

| Stat | Source | Notes |
|---|---|---|
| Max VSR | `max_cameras_h265` | Same column as the datasheet's "Max Camera Streams". Unit "streams", keep `vsrTooltip`. |
| Throughput | `max_bandwidth_mbps`, thousands separator | Unit "Mbit/s" via one constant. |
| Warranty Support | `warranty_years` + " Years" | Unit text per G10. |

Key Features (five bullets, in this order):

| # | Fact | Columns | Today (V400) |
|---|---|---|---|
| 1 | OS | `os_edition` via `osText()`, "Microsoft " prefix stripped | Windows Server 2022/2025 IoT Standard |
| 2 | Drives and RAID | `hdd_count`, `raid_level_display`, `raid_level_alt_display`, `battery_raid` | 8x Enterprise HDD's, RAID 5 & Cachevault |
| 3 | Throughput | `max_bandwidth_mbps` | 2,000 Mbps max possible throughput |
| 4 | Chassis | `rack_units` | 2U Rack mount w/ rails |
| 5 | VSR | `max_cameras_h265` | Max VSR = 200 streams h.265 or h.264 |

Keep today's house phrasing wherever the data does not force a change ("Enterprise HDD's" included), so the before/after diff shows only real data changes plus the decided wording changes. V100 composes "RAID 1 or JBOD" from the primary and alternate levels (G4).

Technical Specs (five or six bullets):

| # | Fact | Columns |
|---|---|---|
| 1 | CPU | `cpu_model_full`, "Ghz" to "GHz", plus " CPU" |
| 2 | RAM | `ram_spec` (check whether the column already contains "ECC DDR5"; compose to match today's meaning) |
| 3 | OS drive | `os_drive_desc`, else `os_ssd_type` + `os_redundancy` |
| 4 | Network | `gbe_10_ports`, `gbe_1_ports`, `network` |
| 5 | Remote management | `remote_mgmt` |
| 6 | Power supply | `hotswap_power`, `power_redundancy`, `power_wattage` |

Today the V100 lists network and remote management as two bullets while the V400 merges them. Pick one structure for all seven models and show it in the diff. Where a column cannot reproduce today's meaning (OS drive and power are the likely ones), do not guess. Put the proposed rule in the audit and stop at Gate A.

## 6. Steps and gates

**Step 0. Orientation.** Read section 3. No output beyond a three-line note of anything that contradicts this brief. If the code contradicts a claim above, say so before continuing.

**Step 1. Read-only audit. No code changes to `src/`.**
Write `scripts/audit-price-book-specs.ts`, reusing the client setup in `scripts/render-datasheet.ts`, run as `node --env-file=.env.local --import tsx scripts/audit-price-book-specs.ts`. SELECT only. For each of the seven models print: the authored family values, the live canonical-row values, and the drift. Then verify and record G2 (V400 RAID basis and per-SKU capacity under both readings), G3 (render the V400 datasheet and inspect the ordering table), the live values of `os_edition`, `ram_spec`, `rack_units`, `warranty_terms`, `raid_level_display` and `raid_level_alt_display` per model, and the G10 comparisons.
Write the results to `docs/audits/price-book-spec-drift-audit.md`.

**GATE A. Stop.** Present the audit, the finalized bullet mapping (section 5.4) and every proposed deviation. Wait for Andy.

**Step 2. Finalize the mapping** inside the audit document, incorporating Andy's answers from Gate A.

**Step 3. Implement.**
1. Move the shared helpers (G5). Run `from-product-specs.test.ts` and `from-management-specs.test.ts` and confirm they pass unchanged.
2. Add `family-specs.ts` and its tests (section 7).
3. Change the `Family` type and mark the seven families `"product_specs"`. Delete their `keyFeatures`, `technicalSpecs`, `kpis`, and the 18 `netStorage` overrides.
4. Update `[slug]/page.tsx` (section 5.3).
5. Update `families.test.ts`: the "every family has 3 kpis / 3 keyFeatures / 3 technicalSpecs" tests now run against `resolveFamilyDisplay` output, and a new test asserts no product_specs family carries authored spec arrays or `netStorage` overrides.
6. Keep `scripts/audit-price-book-specs.ts` as a standing drift check. After this change it compares the page-derived values with the datasheet adapter's values from live rows and exits non-zero on any mismatch.

**Step 4. Verify.**
- `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, all green.
- Run the audit script again; it must report zero page-versus-datasheet mismatches.
- Start the dev server and load all seven `/price-book/{slug}` pages. Compare each against `/api/datasheet/{model}` for the same model.
- `git diff --stat` must show nothing under `supabase/` and no new migration files.

**GATE B. Stop.** Produce a before/after table for all seven pages from live rows, covering hero stats, every bullet, and the SKU table net-usable column. Call out: the OS wording change, the Mbit/s unit change, the em dash removal, any V400 capacity change (G2), and every bullet that was dropped for a blank column. Wait for Andy's approval.

**Step 5. Docs and local commit.**
- Prepend a `docs/JOURNAL.md` entry with a "Detours & fixes" section covering the V400 RAID finding, the NCD finding and anything that surprised you.
- Write ADR **0146**, "Price Book product pages derive spec facts from product_specs". Options considered: (a) hand-sync families.ts, (b) derive, (c) generate families.ts from the DB at build time. Decision: (b). Consequences: authored copy shrinks to tagline and greatFor for these seven families; a wording change to a bullet now happens in code, and a fact change happens in `/admin/specs`.
- Add a row for this brief to the "Handoff briefs" table in `docs/README.md`.
- `docs/RUNBOOK.md` needs no change unless the happy path changed. Say so in the JOURNAL entry.
- Commit locally. **Do not push.**

## 7. Tests

Unit tests for `deriveFamilyDisplay`, using fixture rows shaped like the ones in `from-product-specs.test.ts`:

1. One fixture per model (V100, V200, V400, V500, V600, V700, V800) built from the live values captured in Step 1.
2. V400 after the 9015 refresh (8C/16T, 150 streams) and V700/V800 after the correction (3.3GHz 16/32, 275).
3. A blank column drops its bullet and nothing stale replaces it.
4. `raid_level_display = 'NA'` never prints, and the V100 composes "RAID 1 or JBOD".
5. A hidden `-NCD` row in the input does not change the derived output when it is excluded by the visible-SKU filter, and the test shows what happens if it is not.
6. **Parity test, the regression guard:** build the datasheet content and the page display from the same fixture rows and assert equality for the shared facts: Max VSR equals the datasheet's "Max Camera Streams", throughput equals the datasheet headline, the CPU string, RAM, OS and rack units agree, and warranty years match. Then mutate one fixture value (for example `max_cameras_h265` from 150 to 151) and assert both outputs change together.
7. Structure test: no `specSource: "product_specs"` family has authored spec arrays or `netStorage` overrides.

## 8. Definition of done

- Every shared fact on a product page equals the datasheet's value for the same model, proven by test and by the live audit script.
- An edit in `/admin/specs` reaches the product page and the datasheet identically.
- The SKU tables on V200 through V800 compute net usable from `product_specs`.
- No migration, no RLS change, no write to the live database, no push.
- Gate A and Gate B approvals are recorded in the JOURNAL entry.

## 9. Hard do-not list

- Do not add a migration, touch `supabase/`, or write to the live database. All live access is SELECT only.
- Do not `git push`. Do not run `supabase db push`.
- Do not change `usableCapacityTb()`, `availableCapacityTb()`, any calculator, or any price logic. No price math in the portal UI.
- Do not edit `copy.ts` or the datasheet adapters beyond the pure helper move in G5.
- Do not fix the NCD pooling, the CPU twin columns, the compliance strip or the category warranty labels in this change. Report them.
- Do not touch V250, V260, V150 or SW content, or `appliance_specs` code, beyond the type plumbing.
- Do not add a fallback to the old authored strings for the seven families.
- Do not write em dashes, or "not X, but Y" constructions, in any new prose, comment, ADR, JOURNAL entry or UI string.

## 10. Final report format

Keep it short: what changed, where the before/after table lives, the list of findings (G2, G3 and G10 outcomes), and anything left open for Andy. No recap of the steps.

## 11. Optional manual acceptance for Andy, after deploy

On `/admin/specs/VX5-V400-192`, change Max cameras (H.265) from 150 to 151 and save. Check the V400 hero stat at `/price-book/v400` and the Max Camera Streams figure in `/api/datasheet/V400`. Both should read 151. Change it back to 150. The audit trail records both edits in `product_specs_audit`, and partners see the live value in between, so pick a quiet moment.
