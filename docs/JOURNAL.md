# Project Journal

Chronological narrative of work on the Arxys Partner Portal. Newest entry at top. Each step gets a *Work done* subsection and (where applicable) a *Detours & fixes* subsection.

---

## 2026-06-23 — Phase 10 Step 6 extension: multisensor camera seed (Hanwha, Axis, Avigilon)

### Work done

Extended the single-sensor `camera_specs` seed (68 rows) with multisensor, multidirectional, PTRZ-combo, and stitched-panoramic models, following the existing Step 6 pattern exactly: per-vendor JSON seed file, shared validator gate, pre-load backup, dry-run, idempotent upsert. No schema change, no migration. New ADR [`0071`](./decisions/0071-multisensor-camera-seed-representation.md) records the representation decisions.

**Step 0 verification (calculator math).** Confirmed `vsrLoad` and the storage and bandwidth paths all read `cameras`, which the model picker sets to `units x sensor_count` via `derivedCameras`, while resolution maps to one bucket through `mapPixelsToBucket` with ADR 0058 round-up. So the math is round each sensor up to its bucket, then multiply by `sensor_count`, which is the intended behavior. Also corrected a premise: the existing Axis seed already carried five multisensor rows (M5000-G, P3737-PLE, P3738-PLE, P4705-PLVE, P4707-PLVE), so the N greater than 1 path was already represented in seed data.

**Rows loaded: 39 new (final count 107).**

- Hanwha: 19 new (42 total). Tier 1 (12): PNM-C16083RVQ, C16013RVQ, C32083RVQ, 9084QZ1, 9084RQZ1, 9085RQZ1, C12083RVD, 12082RVD, C7083RVD, 7082RVD, 8082VT, 9000QB. Tier 2 (7): PNM-9002VQ, C20000QB, C19183RVTP, C34404RQPZ, C16083RQZ, C32083RQZ, C32084RQZ.
- Axis: 9 new (35 total, 14 multisensor). Tier 1 new (4): P3747-PLVE, P3748-PLVE, P3735-PLE, P3727-PLE. Tier 2 (5): P3818-PVE, P3827-PVE, Q3839-PVE, Q3839-SPVE, Q6300-E. The five pre-existing Axis multisensors matched their datasheets exactly and were left untouched per the update-only-if-differs decision.
- Avigilon: 11 new (30 total). H5A Multisensor 9/12/15/20/24/32MP, H5A Dual Head 6/10MP (seeded `currently_shipping=false`, EOL), H6A Dual Head 6/10/16MP. Alta SKUs excluded as cloud-only.

**Pipeline gates.** Pre-load backup confirmed 68 rows (`backups/manual-2026-06-23T17-32-13-181Z.json`). All three files passed the validator (vendor, model, aliases, sensor_count, pixel-bucket round-up, currently_shipping, as_of_date, source_url, sensor_detail JSON, uniqueness). Dry-run reported 19/9/11 new, 0 update. Load upserted 39 rows. Idempotency re-dry-run reported 0 new, 19/9/11 update, as expected. Generous `model_aliases` were added on every row (bare number, spacing and case variants, and self-describing Avigilon part numbers) for the planned VMS-report import feature.

### Detours & fixes

- **Roster errors caught by datasheet, before they reached a row.** Every sensor_count and per-sensor resolution was confirmed against a manufacturer datasheet or official product page using research sub-agents. The generated rosters carried known errors that the datasheet pass corrected:
  - **Axis P3727-PLE**: roster conflict 2MP vs 4MP per sensor. Datasheet resolved it to 2MP (1920x1080) per sensor across 4 sensors. The 4MP reading would have double-sized this model. Also confirmed EOL, replaced by P3735-PLE, so seeded `currently_shipping=false`.
  - **Axis P3827-PVE**: roster claimed 4x7MP (28MP). Datasheet resolved it to 4 sensors of roughly 1.75MP each, stitched to 7MP. Seeded as 4 sensors at the per-sensor figure.
  - **Avigilon roster typos**: 12MP multisensor is the 4MH (4x3MP) config, the roster wrote 3MH. 24MP is the 3MH (3x8MP) config, the roster wrote 4MH. Both corrected against the H5A Multisensor datasheet.
  - **Avigilon W vs C part numbers**: the roster's `6.0W-H5A-D1-B` and `10.0W-H5A-D1` do not appear in any current Avigilon datasheet. The authoritative SKUs are the EOL `6.0C-H5DH-DO1-IR` and `10.0C-H5DH-DO1-IR`. Both roster forms were kept as aliases on the corresponding rows.
  - **Hanwha pixel-dimension corrections**: 4MP heads are 2592x1520 (not 2592x1944), 5MP heads are 2560x1920, 6MP RVD heads are 3328x1872. Applied to the affected rows.
  - **Hanwha PNM-C20000QB**: roster and naming implied 20MP, an earlier pass reported a 2MP base. Datasheet showed a modular remote-head body, base 2MP (SLA-T) and max 5MP (SLA-F, 5MP x 4 = 20MP). Seeded at the conservative max, 4x5MP (2592x1944).
- **Hanwha PNM-9000QB and PNM-C20000QB are modular** (body ships sensorless). Seeded at the conservative fully-populated max config with the modular nature noted in `sensor_detail`.
- **No models were dropped for lack of datasheet confirmation.** Every roster model in Tier 1 and Tier 2 was confirmed. The C32084RQZ SolidEDGE suffix variants (-8XE256G, -8XE256G-LU, -8XE4T-W) share identical optics with the base and were aliased to the single PNM-C32084RQZ row rather than seeded separately.

### Decisions captured

- [`0071-multisensor-camera-seed-representation.md`](./decisions/0071-multisensor-camera-seed-representation.md)

---

## 2026-06-22 — Git audit: deploy state correction for Steps 5b, 6, and 2026-06-19/22 entries

### Work done

Git inspection confirmed the following. All findings are read-only; nothing was pushed.

**Branch state.** `main` is in sync with `origin/main`, neither ahead nor behind. The working tree has two unstaged edits to `docs/JOURNAL.md` and `docs/RUNBOOK.md` (from a doc-correction pass in the same session); no application code, migration, or config is modified.

**Project Quote Steps 5b and 6.** Both committed and deployed. Step 5b landed as `b374ec0` (2026-06-17, "Phase 10 / Project Quote Step 5b: unified four-page Project Quote PDF renderer"). Step 6 landed as `26f5de7` (2026-06-18, "Phase 10 / Project Quote Step 6: generate, persist, deliver"). Both are on `origin/main` and were promoted to production via Vercel auto-deploy from main. Migration `20260616000002` (`project_quotes` table) is applied on both local and remote with no drift, confirmed by `supabase migration list`. This supersedes the "authored, verified, NOT deployed" title and "nothing pushed, migrated, or committed" wording in the 2026-06-18 Step 6 entry. That entry's deploy state was written before the session ended and the commit happened; the git record is the authority.

**2026-06-19 entries confirmed on origin/main:**

- Bandwidth unit labels corrected site-wide (Mb/s to Mbit/s, 11 files): `66edf22`
- Storage-first sizing and VSR camera check (ADR 0068): `4d7318a`
- Price Book SKU table net-usable storage and real camera bandwidth (ADR 0069): `6f0de2c`
- Portal UI comparison and videox-compare action gold to navy: `807a5f9`

**2026-06-22 entries confirmed on origin/main:**

- Internal nav and admin landing consolidation (ADR 0070): `28b98a0`
- Project Quote PDF Layout B column widths and System Utilization bar removed: `eb69b1a`

All six are reachable from `origin/main` HEAD (`aebbb8c`). No journal entry from 2026-06-19 or 2026-06-22 is uncommitted or local-only.

**Vercel production deployment.** The active production deployment (`dpl_2JPoC71cGvNx692x6aY1r3SaCKiA`, created Mon Jun 22 2026 at 14:04 PDT, status Ready, aliased to `portal.arxys.com` and `portal-git-main-arxys.vercel.app`) was triggered by the push that landed `aebbb8c`. The Vercel CLI does not surface the git SHA in `inspect` output and the API token was unavailable for a direct lookup, so the match is confirmed by timing and branch alias rather than SHA comparison. The `portal-git-main-arxys.vercel.app` alias is Vercel's auto-generated name for the production branch and is authoritative that main is what is deployed.

---

## 2026-06-22 — Phase 10 Step 6: Hanwha and Avigilon camera seeds

### Work done

- Added `data/hanwha-camera-specs.json` (23 entries: Q series QNV/QNO, Q-C series, X series XNV/XNO/XNV-C/XNO-C Wisenet 7, and A-series XNV-A/XNO-A Wisenet 9 gen-2; 2MP–8MP).
- Added `data/avigilon-camera-specs.json` (19 entries: H6SL Dome/Bullet, H6A Dome/Bullet, H6X aliases folded into H6A entries, H6M Mini Dome; 2MP–8MP).
- Pre-load backup confirmed 26 rows in `camera_specs` (Axis load from prior step).
- Both files passed all validator checks (vendor, model, aliases, sensor_count, pixel bucket round-up, currently_shipping, as_of_date, source_url, uniqueness).
- Pixel bucket note: Hanwha X-series 4MP (XNV-C7083R, XNO-C7083R) uses native 2592×1520; validator correctly round-ups to the 4MP bucket per ADR 0058 Option C. Avigilon H6SL/H6M 3MP uses 2048×1536 — validator maps to a 3MP bucket (exact match, no round-up needed).
- Hanwha loaded: 23 new rows. Idempotency re-dry-run: 0 new / 23 updates.
- Avigilon loaded: 19 new rows. Idempotency re-dry-run: 0 new / 19 updates.
- Final `camera_specs` count: 68 rows (26 Axis + 23 Hanwha + 19 Avigilon).

---

## 2026-06-22 — Project Quote PDF: Layout B camera schedule column widths

### Work done

- Redistributed Layout B (9-column, with Vendor/Model) column widths to fix two visual defects:
  - "STORAGE (TB)" header was wrapping to two lines because `CAMB_STORE = "9.5%"` gave only ~42pt of usable width; the uppercase header text requires ~49pt. Widened to 12%.
  - "OPERATION HRS" column had excessive whitespace around short data values ("24", "22") while being 68pt wide. Reduced to 12% (longest value "18 (motion 40%)" needs ~52pt; 12% gives ~55pt usable — fits).
- Columns adjusted (Layout B only — Layout A unchanged): FPS 7%→6.5%, Complexity 19%→17%, OpHrs 13%→12%, Bw 9.5%→10.5%, Storage 9.5%→12%. `CAMB_TOTALS_LABEL` updated from 81% to 77.5% (100 − BW − Store).
- Column header names not changed (locked by `deepEqual` assertions in `render.test.ts`).
- All 219 tests pass; `sumWidths` confirms both layouts still total exactly 100%.

- **System utilization bar removed:** The gold "System utilization" bar (the `max(storage%, bandwidth%)` figure) was removed from the System capacity section. The two factual bars (Total storage and Bandwidth) remain. Rationale: the utilization bar implies the quoted products have the shown capacity, but the calculator recommendation and Pipedrive quote are independent data sources and may not be in sync. Removed `utilizationNote` import and `utilizationPct` variable. Deferred to a future pass when the two data sources can be properly correlated.

---

## 2026-06-22 — Internal navigation + admin landing consolidation (ADR 0070)

### Work done

- **Task 1 — Header nav:** Removed Submissions and Partners links for all roles. Survivors: Dashboard, Calculator, Pipeline, QuickCompare, Price Book. Admin button now visible to `isAdminOrInternal` (previously admin-only), so internal non-admins can reach `/admin` after the nav links are gone.
- **Task 2 — Partner Pipeline page:** Retitled `/admin/submissions` heading from "Submissions" to "Partner Pipeline". Partner-grouped is now the default view (no param = grouped; `?groupBy=flat` = flat list). Toggle labels changed to "Flat list" / "Grouped". Filter hidden inputs, clear-filter links, and pagination links updated to carry `groupBy=flat` when in flat view. Back-link on detail page updated to "Partner Pipeline". Admin sidebar label updated.
- **Task 3 — /admin landing:** Added NavCards for Partner Pipeline and Partners (visible to all `isAdminOrInternal`); XLSX Export Forecast card gated to admins only. Rewrote all stat card and page copy to remove "Submissions" references. Added `requireAdminOrInternal()` call to the page for role-aware rendering.
- **Task 4 — Generate Project Quote in top action row:** Extracted `GenerateQuoteTopButton` client component from `project-quote-panel.tsx`. Simplified `ProjectQuotePanel` to display-only (no embedded generate button). Added `generateQuoteButton?: ReactNode` prop to shared `SubmissionDetail`; when provided, the button renders first with a vertical separator before the utility cluster, and Download PDF demotes to secondary. Admin detail page passes the top button when `isInternal`; partner view unchanged.
- **Task 5 — Dashboard pipeline card:** Renamed "My Pipeline Summary" to "Pipeline Summary". Computation and data source unchanged.

### Decisions captured

- ADR 0070 naming choice for dashboard card: "Pipeline Summary" (not "Partner Pipeline Summary") to avoid redundancy on a card that already lives in the partner context.
- Accepted ADR 0070 status flipped to Accepted below.

### Verification gates

- `npm run build`: clean, 0 errors, 0 new warnings.
- `npm test`: 219/219 pass.
- `npx eslint` on all changed files: 0 errors (1 pre-existing `<img>` warning in layout.tsx, untouched).
- `no-ai-slop` audit: 1 em dash found and fixed in submissions page subtext.

---

## 2026-06-19 — Price Book SKU table: true net-usable storage + real camera bandwidth

### Work done

- **Two display bugs in the Price Book per-SKU table** ([`src/app/(app)/price-book/[slug]/page.tsx`](../src/app/(app)/price-book/[slug]/page.tsx) cell renderer). The display-side twin of the ADR 0068 root cause:
  - **"Net Usable Storage"** rendered `products.max_storage_tb` — the RAW HDD nameplate (V700 = 480 TB) — under a net-usable label. Now computes RAID net-usable via `usableCapacityTb(storage_raw_tb, hdd_count, raid_level_display)` from `product_specs` (V700 → 400 TB).
  - **"Max Camera Bandwidth"** rendered `products.max_cameras` (a stream count) with a `Mbit/s` suffix — the camera count mislabeled as bandwidth (V700: "325 Mbit/s"). Now renders `product_specs.max_bandwidth_mbps` (V700 → 4000 Mbit/s), "—" when absent.
  - **"SSD Storage"** had the same `max_storage_tb` fallback. Now "—" when no `skuExtraData` override — never the HDD nameplate (these are SSD-based mgmt/ACM servers with no `product_specs` row).
- **Join**: `products.sku → product_specs.id` (id IS the SKU). The page fetches the needed spec columns for all rendered SKUs (primary + tiers + upgrades) in one `.in("id", …)` query and threads a `specsBySku` map through `SkuTable` into the cell renderer. `skuExtraData` overrides remain authoritative.
- **Refactor**: extracted `cellValue` / `formatMsrp` / `ProductRow` / `ProductSpecLite` into a pure, server-free module ([`src/lib/price-book/cell-value.ts`](../src/lib/price-book/cell-value.ts)) so the renderer is unit-testable (page.tsx imports `server-only` Supabase).
- **Tests**: new [`src/lib/price-book/cell-value.test.ts`](../src/lib/price-book/cell-value.test.ts) — 12 cases covering net-usable math (V700 480→400, V200 80→60, fractional rounding), bandwidth (4000 not 325), `ssdStorage`="—", override precedence, and the passthrough columns.
- **Gates**: `npm test` 219/219 pass. `npx eslint` 0 errors on changed files. `npx tsc --noEmit` 0 errors in changed files (the pre-existing react-pdf `DocumentProps` / `Buffer` errors in `*/render.test.ts` and `xlsx.test.ts` are untouched and unrelated).

### Decisions captured

- [`0069-price-book-sku-table-true-net-usable-and-bandwidth.md`](./decisions/0069-price-book-sku-table-true-net-usable-and-bandwidth.md)

## 2026-06-19 — Storage-first sizing on net-usable + VSR camera check + honest capacity line

### Work done

- **Root cause (real deal).** A deal needing 1,764.3 TB net-usable + 332 cameras was recommended 4 × VX5-V700-480 and printed "1,764.3 TB of 1,600.0 TB usable · 110% · 20% headroom built in" — over-capacity, shown as valid, with a false headroom claim. The engine sized storage against **raw nameplate** `products.max_storage_tb` (480/unit → `ceil(1764.3/480)=4`) while every capacity bar divides by **RAID net-usable** (`usableCapacityTb`, ADR 0047 — V700 is RAID 60/24-drive → 400 usable/unit → 4×400 = 1,600 < 1,764.3). Raw said "fits"; usable said "doesn't." The "20% headroom built in" string was a hardcoded literal, never computed or enforced.
- **Storage-first, two-floor sizing** ([`src/lib/recommend/algorithm.ts`](../src/lib/recommend/algorithm.ts)). Step 1 (HARD ×1.2, net-usable): `units ≥ ceil(neededUsableTb × 1.2 / usableStorageTb)`. Step 2 (SOFT ×1.1, VSR): bump until `totalVsr ≤ maxCameras × N / 1.1`. `units = max(1, storageUnits, vsrUnits)`; cheapest `(model × N)` across the whole catalog wins — no compute-tier lock, so a larger-storage SKU is chosen when it clears both floors more cheaply. `coveredStorageTb` is now net-usable, matching the bar denominators.
- **VSR camera load** ([`src/lib/calculator/compute.ts`](../src/lib/calculator/compute.ts) `vsrLoad`): resolution-normalized `Σ cameras × (w×h/1e6 / 4)` — a 4MP stream ≈ 1.0 VSR. No fps/codec/motion/retention. `max_cameras` is treated as the per-unit VSR cap (it is VSR-referenced). 1.1 is the only camera margin (no separate VSR safety multiplier).
- **Plumbing** ([`actions.ts`](../src/app/(app)/calculator/actions.ts)): the candidate query now joins `product_specs` (`storage_raw_tb`, `hdd_count`, `raid_level_display`) and computes `usableStorageTb` per SKU via `usableCapacityTb()`; `totalVsr` is summed from group resolutions. No schema/seed/migration — both inputs already existed.
- **Honest capacity line** ([`capacity-utils.ts`](../src/lib/capacity-utils.ts) `utilizationNote`): actual headroom at ≤100% ("18% headroom"), "OVER CAPACITY" above 100%. Wired into both PDFs ([`SubmissionPdf.tsx`](../src/lib/pdf/SubmissionPdf.tsx), [`ProjectQuotePdf.tsx`](../src/lib/project-quote/ProjectQuotePdf.tsx)).
- **Disclaimer header** added to the calculator recommendation panel ([`calculator-form.tsx`](../src/app/(app)/calculator/calculator-form.tsx)) and the System Estimate recommended-system block: "Possible system based on parameters. Arxys engineering will send a detailed quote with the final product recommendation."
- **Result on the failing deal:** sizes 4 × VX5-V800-720 (2,560 TB usable, 68.9% utilization, "31% headroom").
- **Gates:** `npm test` 207/207 pass (new: VSR computation, `utilizationNote`/`usableCapacityTb`, failing-deal regression + PDF render smoke; existing `algorithm.test.ts` expectations updated where the new algorithm legitimately changes the answer). `npm run build` clean. `npx eslint` 0 errors on changed files.

### Detours & fixes

- **ADR-number collision.** A bulk `ADR 0061 → 0068` rename clobbered three pre-existing references to the real ADR 0061 (project-quote versioning) in `config.ts`/`expiry.ts`/`generate.ts`; reverted those back. The new ADR is 0068 (0061–0067 were already taken).

### Decisions captured

- [`0068-storage-first-sizing-and-vsr-camera-check.md`](./decisions/0068-storage-first-sizing-and-vsr-camera-check.md) (Proposed). ADR 0032's sizing rule is marked superseded by it (its MKT/CFQ filter + tie-break still stand).

### Notes / scope

- Engine change affects NEW submissions only; old project-quote snapshots render their frozen recommendation (ADR 0061), as expected.
- Out-of-scope latent display bugs flagged, not fixed: [`price-book/[slug]/page.tsx`](../src/app/(app)/price-book/[slug]/page.tsx) renders raw `max_storage_tb` under a "Net Usable Storage" label, and `max_cameras` with a `Mbit/s` suffix (camera count mislabeled as bandwidth).

---

## 2026-06-19 — Bandwidth unit labels corrected site-wide (Mb/s → Mbit/s)

### Work done

- Audited all bandwidth unit label strings across the portal. Found 22 label sites using ambiguous or megabytes forms (`MB/s`, `Mb/s`, `Mbps`, `Gbps`, `Kbps`) across 11 source files.
- Corrected every bandwidth unit label to the unambiguous megabits form: `Mbit/s` (mixed-case context) or `Gbit/s` / `Kbit/s` where appropriate. Casing follows the source string convention — CSS `text-transform: uppercase` on PDF column headers will render `Mbit/s` as `MBIT/S` in the output.
- **Project Quote PDF** (`ProjectQuotePdf.tsx`): `fmtMbps` return value, `showcaseSpecPairs` max-bandwidth value, both Layout A and Layout B camera-schedule column headers (`"Bw (Mb/s)"` → `"Bw (Mbit/s)"`). Capacity bar strings cascade from `fmtMbps`.
- **System Estimate PDF** (`SubmissionPdf.tsx`): `SCHEDULE_COLUMNS` bandwidth label (`"Bandwidth (Mb/s)"` → `"Bandwidth (Mbit/s)"`), spec-pairs max-bandwidth value, both capacity bar strings (`"… Mb/s"` suffix).
- **Calculator** (`compute.ts` `formatBandwidthMbps`): `Mbps` → `Mbit/s`, `Gbps` → `Gbit/s`. Calculator form bitrate inline (`Mbps` → `Mbit/s`, `Kbps` → `Kbit/s`).
- **Submission detail UI** (`submission-detail.tsx`): totals inline label and per-group table column header.
- **Price book / workstation family** (`families.ts`): key-feature bullet, KPI unit, and three SKU extra-data bandwidth strings.
- **VideoX compare** (`videox-compare/specs.ts`): spec row label.
- **Email notifications** (`submission-notification.ts`): both partner and admin body bandwidth lines.
- **Price book SKU table** (`price-book/[slug]/page.tsx`): bandwidth cell display.
- Exported `SCHEDULE_COLUMNS` from `SubmissionPdf.tsx` and added a structural assertion to `render.test.ts` confirming the bandwidth column header reads the megabits form.
- Updated four existing test assertions (`compute.test.ts` × 2, `render.test.ts` × 2) that were asserting the old strings.
- **No numeric values, no computations, no storage labels (TB), no variable/field names changed.**
- Verification: 195/195 tests pass, `npm run build` clean, `npx eslint` 0 errors on all changed files.

---

## 2026-06-19 — Portal UI: comparison + videox-compare (gold actions → navy); price-book left as brand

### Work done

Brought the two comparison tools in line with ADR 0067, distinguishing **action gold**
(retire → navy) from **decorative/brand gold** (keep).

- **VMS Server Comparison** (`/comparison`): back-link blue → navy; the gold
  "request quote" action button (`.ac-btn-quote`) → navy primary. Kept the gold page
  header title + underline (decorative — matches the Calculator header left intact).
- **VideoX Quick Compare** (`/videox-compare`): back-link blue → navy; the interactive
  VMS pill toggles (`.vxc-vms-pill`) and the validation-sheet link button → navy
  (border, active fill, hover); the VMS banner left-accent → navy. Kept the gold header,
  selected-model labels, and the diff-row highlight (decorative / data-viz).

### Decisions captured (judgment, no new ADR)

- **Distinguished action-gold from brand-gold.** ADR 0067 retires gold from *buttons and
  actions* — not from deliberate brand decoration. The tool-page gold headers
  (calculator/comparison/videox) are a consistent brand treatment and stay; only the
  interactive controls flipped to navy.
- **Price Book deliberately left on gold.** Its gold (stars, accents, Montserrat) is a
  scoped brand treatment matching the sales PPTX (ADR 0032/0035), not portal action
  chrome. Flipping it would regress an intentional decision, so it was **not** touched.
  Revisit only if the brand direction itself changes.

### Verification gates

- `npx eslint` on the two changed pages — **0 errors**.
- `npm test` — **194/194**. `npm run build` — ✓ clean (compiles both bespoke CSS files).

---

## 2026-06-19 — Portal UI migration: admin/partners + Calculator reconciliation

### Work done

Final planned UI items, both under ADR 0067. Presentational only.

- **admin/partners**: Invite button → primary; tables tokenized (navy-soft header, 2px
  border, line-soft rows); blue links → navy; invite form gold submit → primary `Button`,
  inputs on tokens; admin landing stat cards + recent table tokenized; partner-row-actions
  blue toggle → navy, rename input on tokens (red destructive kept).
- **Calculator reconciliation** (CSS-led, not a rebuild): "Save & request quote" gold →
  **navy primary** (hover navy-deep; saving state navy); the three result-card top accents
  **calmed from blue/green/cyan gradients to solid navy** and their values recoloured navy;
  results "Download PDF" blue → navy. Reset stays secondary; form-control vocabulary
  unchanged (it was already the good baseline).

### Verification gates

- `npx eslint` on the five changed admin files — **0 errors**.
- `npm test` — **194/194**. `npm run build` — ✓ clean (compiles calculator.css too).

### Notes

- Legacy unused `.ax-cta`/`.ax-cta-b` rules left untouched (not rendered). Functional
  bandwidth/storage bar fills kept their distinct colours (data-viz, not chrome).
- **Portal UI overhaul now complete** across dashboard, submission detail, My Pipeline,
  Admin Submissions, admin/partners, and the Calculator. Remaining un-audited inheritor
  pages (VMS Comparison, VideoX Quick Compare, Price Book) can adopt the component set
  when captured. No new ADR; RUNBOOK unaffected.

---

## 2026-06-19 — Portal UI migration: My Pipeline + Admin Submissions (all three views)

### Work done

Migrated two more pages onto the ADR 0067 components in one pass. Presentational only.

- **My Pipeline** (`submissions/pipeline.tsx`): row actions are now real controls —
  View = primary, Revise/PDF = secondary, delete = the consistent danger `IconButton`
  rendered **disabled when not deletable** (no more row jump). Native status `<select>` →
  styled `Select`; group "On behalf of" (amber) and "Prepared by Arxys" (blue) chips →
  `StatusBadge` on-behalf/source; filter pills, New-calculation button, links, table
  chrome all on tokens (navy active state, navy-soft thead, firmed border). Preferred
  star recoloured gold → navy.
- **Admin Submissions table view** (`admin/submissions/page.tsx`): table chrome tokenized
  (navy-soft header, 2px border, line-soft rows); View → primary button; non-admin status
  → `StatusBadge`; group-by **Partner view** toggle → filled primary/secondary (was a thin
  outline); Export + pagination → secondary buttons; the two filter `<select>`s → styled
  `Select`, date inputs + Apply + Clear filters on tokens. PreferredStar gold → navy.
- **Admin Submissions partner + expanded views** (`_components/partner-group-view.tsx`):
  dropped the local StatusBadge for the shared one (status + Pipedrive→source); summary
  cards → `MetricTile`; nested revision "View" → primary button; expand chevrons navy;
  cards/text/dividers on tokens.
- **Admin row controls** (`_components/row-controls.tsx`): native status `<select>` →
  styled `Select`; loud red "Delete" text → danger `IconButton` (confirm → destructive
  `Button`).

### Verification gates

- `npx eslint` on the four changed files — **0 errors**.
- `npm test` — **194/194**. `npm run build` — ✓ clean (23 routes).

### Notes

- Body-cell text in the admin table left at `neutral-700/900` (already AA, not the
  grey-on-grey trap) to keep the diff focused.
- **Still pending** (deferred for budget): the Calculator reconciliation (primary-button
  fix + calmer result-card accent + token alignment) and admin/partners — both for a
  fresh session. No new ADR (migrations under 0067); RUNBOOK unaffected.

---

## 2026-06-19 — Portal UI migration: submission detail (+ Project Quote panel)

### Work done

Migrated the submission-detail view onto the ADR 0067 component set. Presentational
only — no data/query logic touched. Not committed; awaiting review.

- **Actions moved under the header** (`_components/submission-detail.tsx`): Download PDF
  is now the navy **primary** (`buttonClasses("primary")` on the `<a download>`); Edit /
  revise and Open Pipedrive are **secondary**. They previously sat at the bottom of the
  page below all the tables.
- **Tables share tokens.** The two left-label key/value tables (Calculator inputs,
  Recommendation) keep their label/value shape via new local `KvTable`/`KvRow` helpers
  (firmed 2px border, navy-soft label column, ink text, line-soft dividers). The
  column-header Per-group breakdown now uses the shared `Table`/`THead/TBody/TR/TH/TD`
  (right-aligned numeric columns via `numeric`).
- **Project Quote panel** (`admin/submissions/[id]/_components/project-quote-panel.tsx`):
  adopted the same scale — Generate = `Button` primary (sm), the existing-quote Download
  PDF = secondary button, container/text on the design tokens, error box on danger tokens.
  (Client component, so it uses `Button` + the pure `buttonClasses`, not the server `Card`.)
- **Blue → navy** on the two "← Back" links and the admin partner link.

### Verification gates

- `npx eslint` on the four changed files — **0 errors**.
- `npm test` — **194/194**. `npm run build` — ✓ clean (23 routes).
- Runtime smoke — `/submissions/[id]` and `/admin/submissions/[id]` both 307 → login
  (auth gate, no 500).

### Notes

- Page background left as the layout's `bg-neutral-50` (a portal-wide tint change is out
  of scope for this page; the dashboard owns its own `bg-page`).
- No new ADR — this is a migration under [`0067`](./decisions/0067-portal-ui-design-system.md). RUNBOOK unaffected.

---

## 2026-06-19 — Portal UI design system: token layer + shared components + dashboard migration

### Work done

Established the portal-wide UI design system (ADR 0067) and migrated the **dashboard**
onto it. Other pages untouched — they migrate in later steps. Not committed; awaiting
review. Throwaway mockup left in place at repo root for the review comparison (deleted at
commit).

- **Step 0 investigation (reported before any code).** Found **two** navy hexes:
  `#054A91` (web `@theme` token + Price Book/Comparison) vs `#1a365d` (PDF-only). Andy
  confirmed **`#054A91`**. Calculator form controls are CSS-class based (`.ax-f select`
  under `#arxys-calc-root`), not componentized — their *geometry/contrast* is the good
  vocabulary, recoloured to navy. Tailwind v4 via `@tailwindcss/postcss`, no config file;
  tokens are CSS vars in `globals.css @theme inline`. Next ADR number = **0067**.
- **Mockup checkpoint.** Built `design-system-mockup.html` (button scale, contrast NavCard
  vs old card, full dashboard grid, Select/Table/StatusBadge). Andy approved the look +
  navy, requested **firmer borders** (cards 2px, NavCards 3px + slightly darker, darker
  shadow) — folded into the tokens.
- **Token layer** (`globals.css`): added `--color-page #f3f5f9`, `--color-surface`,
  `--color-line #cdd5e0`, `--color-line-strong #c4cdda`, `--color-line-soft`,
  `--color-ink #14181f`, `--color-ink-soft #5a6573`, `--color-secondary(-hover)`,
  `--color-danger(-deep/-soft)`. Reuses existing `--color-arxys-navy*`. Verified all
  utilities (incl. `hover:` variants) emit into the built CSS.
- **Shared components** in `src/app/(app)/_components/ui/`: `Button`/`IconButton`,
  `Select`, `Card`/`NavCard` (arrow + download glyph + full-width variants),
  `Table` (+ `THead/TBody/TR/TH/TD`), `StatusBadge` (source/status/on-behalf;
  status reuses `STATUS_META`), `MetricTile`, a pure `styles.ts` class-builder layer,
  and an `index.ts` barrel.
- **Dashboard migrated**: uniform NavCard grid; Pipeline Summary as `MetricTile`s (no
  arrow); Support collapsed to ONE external card; Price List uses the download glyph;
  Admin full-width footer; gold buttons removed (Register-a-Deal form + help-modal
  accents recoloured navy). Page background switched to the tint token.

### Detours & fixes

- **No render-test harness in the repo** (test glob is `*.test.ts`, no jsdom/RTL). Rather
  than add one, the style contract lives in a pure `styles.ts` and is unit-tested by
  `styles.test.ts` (7 tests) under the existing `tsx --test` runner. Component visuals
  rely on the approved mockup + build + the authenticated manual check.
- **Dashboard is auth-gated**, so a headless live screenshot only hits `/login`. The
  approved static mockup stands as the visual proof; Andy does the authenticated check.

### Verification gates

- `npx eslint` on `ui/` + `dashboard/` — **0 errors**.
- `npm test` — **194/194** (+7 new style tests over the prior 187).
- `npm run build` — ✓ compiled successfully; all 23 routes built.
- Built-CSS check — every new token utility (incl. `hover:bg-secondary-hover #dbe0e8`,
  `hover:bg-arxys-navy-deep #03396f`, `border-width:3px`) present.

### Decisions captured

- [`0067-portal-ui-design-system.md`](./decisions/0067-portal-ui-design-system.md) → **Proposed** (Andy flips to Accepted on review).

## 2026-06-19 — Project Quote PDF: delete the redundant standalone server-spec page; finalize ADR 0066

### Work done

One structural fix to the Project Quote PDF renderer (`ProjectQuotePdf.tsx`) plus the ADR 0065/0066 status finalization. No snapshot shape change, no migration. Not committed; awaiting review.

- **Step 0 investigation first (reported before any edit).** The "standalone VideoX V600 server-spec page" in the V4 render is **not a separate `<Page>`** — it is the page-1 "Recommended server hero" block (model · SKU · MAX CAMERAS / BANDWIDTH / USABLE STORAGE / DRIVE BAYS / CPU / RAM / OS / WARRANTY). It lived *inside* page 1's `<Page>` with `wrap={false}`, so on a tall page 1 it overflowed onto its own heading-less physical page. This is exactly the recommended-system block the prompt said to remove if found on page 1. Confirmed the page-1 **capacity bars consume `sizing.serverSpec` independently** of the hero JSX (the `availableStorageTb` / `availableBandwidthMbps` derivations), so deleting the display block does not orphan the capacity section.
- **Deleted the recommended-server hero block** and everything only it consumed: the JSX block on page 1; the `modelName` / `skuLine` / `specPairs` render-time derivations; the `recRow…specVal` styles; and the render-input field `primaryHeroDataUri` (the type field, its load in `render.ts`, and the `makeInput` fixture field). Kept `sizing.serverSpec` (capacity bars need it) and `recommendation` / `recUnits` (capacity ceilings).
- **`primaryServerHeroImagePath` retained as an orphaned snapshot field.** With the hero gone, nothing renders this image. Per the scope rule (removing a snapshot field is a shape change needing separate review) the field stays frozen; `snapshot.ts` still populates it and `snapshot.test.ts` still asserts it. Flagged in a `types.ts` comment and in ADR 0066's amendment as a candidate for a future shape-change cleanup — **not bundled here.**
- **Confirmed 4-page structure: Sizing (parameters · camera schedule · capacity bars, no recommended-system block) → Products in this quote → Commercial → Terms.** The capacity bars still derive their ceilings from `serverSpec` (smoke render showed 280.0 TB usable and 3,000 Mb/s exactly).
- **Tests** (`render.test.ts`): added a faithful page-count assertion — `countPages()` walks the `<Document>` children and asserts **4 `<Page>` elements** (the "`<Page>` count in the input model" check, not a grep of the subsetted PDF text), plus an empty-showcase 4-page case. Removed `primaryHeroDataUri` from the `makeInput` fixture. Kept the null-`serverSpec` no-crash test, the capacity-bar behavior, the showcase suite (incl. 5-products-on-one-page), and commercial/terms tests green.
- **ADR finalization.** Flipped **ADR 0066 → Accepted** (with a 2026-06-19 amendment recording the hero deletion — a refinement of the same showcase decision, so no new ADR number) and **ADR 0065 → Superseded by #0066** (it previously carried only a forward-reference note).

### Detours & fixes

- **The prompt assumed a separate `<Page>`; reality was an overflowing inline block.** Step 0 caught this before any edit. The `<Page>`-element count was already 4 before the fix (4 `<Page>` elements rendering as 5 physical pages because the `wrap={false}` hero spilled). The structural `<Page>`-count test therefore documents the intended model but does **not** by itself catch the overflow regression — the **`pdfinfo` smoke gate** is what asserts 4 *physical* pages, consistent with this repo's established split (unit tests assert structure; the smoke gate asserts pagination, because react-pdf subsets glyphs and the byte stream can't be grepped).
- **Smoke-gate false alarm at 7 camera groups.** A stress fixture with 7 schedule groups rendered 5 physical pages — but that is the *camera schedule* legitimately overflowing the Sizing page (always possible, pre-existing), not the hero. The realistic 2-group fixture (matching the real snapshot) renders exactly 4 pages with all five showcase rows on page 2.

### Verification gates

- `npm test` **187/187** (+2 over the prior 185: the two new page-count assertions). `npm run build` ✓ compiled successfully. `npx eslint` 0 errors on the four changed files.
- Smoke render (5 spec-rich showcase products, real hero PNGs, 2 camera groups): `%PDF-`, **4 pages** via `pdfinfo`; page 1 = Project parameters · Camera schedule · System capacity (185.5 TB of 280.0 TB usable · 1,011.5 Mb/s of 3,000 Mb/s · System utilization) with **no** server-spec/hero block; page 2 = "Products in this quote" (five rows); page 3 = "Quote line items"; page 4 = "Terms and Conditions".

### Decisions captured

- [`0066-reinstate-project-quote-showcase-page.md`](./decisions/0066-reinstate-project-quote-showcase-page.md) → **Accepted** (+ 2026-06-19 amendment: standalone hero removed).
- [`0065-drop-project-quote-showcase-page.md`](./decisions/0065-drop-project-quote-showcase-page.md) → **Superseded by #0066**.

---

## 2026-06-18 — Project Quote PDF: reinstate the products showcase page (reverses ADR 0065)

### Work done

Restored the marketing "Products in this quote" showcase that ADR 0065 had fully removed earlier today, on Andy's go-ahead (sales asked for it back). This reverses 0065, so it is both a data-layer restoration and a render change, captured in **ADR 0066 (Proposed)**. Not committed; awaiting review of 0066 before the change lands.

- **Step 0 investigation first (reported before any edit).** Confirmed STATE B: the page-2 position rendered the *commercial line-items table* (ADR 0065 had renamed that page "Products"), and **all** showcase data — the `showcase` snapshot field, the builders, the catalog resolution, the hero loading — was gone. The rich per-product hero/spec-highlight data could not be rebuilt from what remained (`sizing.serverSpec` is a single server; `commercial.lineItems` carry no specs), so re-adding the showcase required restoring snapshot plumbing. Presented the scope and waited for go-ahead.
- **Restored the data layer verbatim from commit `97239ec`** (the data-layer files were untouched since the removal, so the deletions reverse-applied cleanly): `ProjectQuoteShowcaseItem` / `ProjectQuoteShowcaseSpecHighlights` + the `showcase` envelope field (`types.ts`); `buildShowcase`, `buildShowcaseSpecHighlights`, `isShowcaseProductGroup`, `ShowcaseCatalogRecord` + the `catalogBySku` build input (`snapshot.ts`); `loadShowcaseCatalog` + the `dealSkus`/`catalogBySku` plumbing (`assemble.ts`); per-item `showcaseHeroDataUris` loading (`render.ts`). Eligibility is the widened family predicate (`productGroupToFamilySlug(productGroup) !== null` — all V-series incl. V150/V250/V255/V260/V270 and SW10–SW35; add-ons/NICs/transceivers/warranty/[MKT] excluded).
- **New render layout (not the old 2-column card grid).** Page 2 is now one **compact, thin-bordered, full-width row per product**: hero image left (neutral placeholder box when no image), then product name + "SKU · family", then a four-column spec-highlight grid. Null highlights are omitted (no "not available" note), so a sparse add-on row is short; a spec-rich server's grid is capped at eight pairs (two rows). The document returns to four pages: Sizing → Products showcase → Commercial → Terms.
- **No snapshot version bump, no migration.** The renderer reads `snapshot.showcase ?? []`, so a row frozen during the 0065→0066 window (the table held 0 rows) renders an empty showcase rather than crashing; the version envelope never branches on this field. The snapshot is a `jsonb` column, so adding a shape field needs no DDL migration. Catalog is read at generation and frozen; render loads only frozen paths (ADR 0060 unchanged).
- **Tests restored + extended.** Re-added the `isShowcaseProductGroup` (eligibility true/false set) and `buildShowcase` (sort, dedup, [MKT]/NIC/transceiver/no-catalog exclusion, null-highlights freeze) suites and threaded `catalogBySku` through the `buildProjectQuoteSnapshot` fixtures (`snapshot.test.ts`); re-added the empty-/multi-showcase render cases (incl. a null-`specHighlights` card), a five-product single-page fixture, the placeholder-on-null-image case, and `showcaseSpecPairs` unit tests for the omit-nulls rule and the eight-pair cap (`render.test.ts`); restored `showcase: []` to the `generate.test.ts` snapshot fixture.

### Detours & fixes

- **Five products would not fit on one page (rendered as 5 pages, not 4).** First cut spilled the showcase to a second page: the spec grid ran three lines (a long CPU value wrapped), and — the real culprit — the square hero PNGs (V100 and V600 are 1080×1080) rendered ~86pt tall at full width, blowing up each row. Fixes: capped the highlight grid to eight pairs (two rows) via `SHOWCASE_MAX_PAIRS`; bounded the hero box to a fixed `height: 46` with `objectFit: "contain"` so a square image can't dominate; and tightened row padding / spec line-heights. Smoke render then produced exactly four pages with all five products on page 2. (Caught only because the smoke gate counts pages with `pdfinfo` rather than just checking `%PDF-`.)

### Verification gates

- `npm test` **185/185** (+13 over the prior 172: the restored showcase data-layer suites and the new showcase render/spec-pair tests). `npm run build` ✓ Compiled successfully. `npx eslint` 0 errors on all changed files.
- Smoke render (5-product spec-rich fixture, real hero PNGs): `%PDF-`, **4 pages** via `pdfinfo`; page 2 shows the "Products in this quote" heading and all five bordered rows (`pdftotext`); page 3 the commercial table, page 4 the terms.

### Decisions captured

- [`0066-reinstate-project-quote-showcase-page.md`](./decisions/0066-reinstate-project-quote-showcase-page.md) (Proposed — reverses ADR 0065). ADR 0065 flagged with a forward note; flip it to `Superseded by #0066` when 0066 is accepted.

---

## 2026-06-18 — Project Quote PDF commercial page: derived partner-price columns, static FOB block, footer resize

### Work done

Render-layer-only changes to the Project Quote PDF commercial page (the "Quote line items" page) and the shared footer (`ProjectQuotePdf.tsx`). No snapshot shape, data layer, migration, or binding rule changed.

- **Confirmed the raw field names** before editing (`QuoteLineItem` / `DealQuote` in `src/lib/pipedrive/quote.ts`): `productCode`, `productName`, `unitPrice` (MSRP each), `discountPercent`, `quantity`, `lineAmount` (line total), and the deal-level `productTotal`. `discountedUnitPrice` is null by design (ADR 0059) — partner price is derived at render, never stored.
- **Replaced the 6-column commercial table** (CODE / PRODUCT / QTY / UNIT PRICE / DISC / LINE TOTAL) with the canonical Arxys 7-column price flow: **CODE · PRODUCT · MSRP EACH · DISC % · PARTNER EACH · QTY · PARTNER TOTAL.** Header/data rows are driven by an exported `COMMERCIAL_COLUMNS` descriptor (header, width, align), mirroring the page-1 `buildCameraColumns` pattern.
- **Partner prices are DERIVED at render**, not read from the snapshot. New exported pure helpers: `derivePartnerEach(line)` = `Math.round(unitPrice × (1 − discountPercent/100))` (null MSRP → null; null pct → 0%), and `derivePartnerTotal(line)` = partner-each × quantity. MSRP EACH and DISC % stay raw. Info-only ($0) lines blank the four money cells but keep QTY.
- **Verbatim-total guard preserved.** The grand-total row still renders the verbatim `commercial.productTotal` (never a re-sum). The brief's column spec said "Total row = sum of PARTNER TOTAL across lines," which directly conflicts with the IMPORTANT verbatim guard and the existing `productTotal=99999`≠line-sum test fixture; resolved in favour of the guard (the explicit override, test-enforced). The derived PARTNER TOTAL is a per-line display value only. In honest data the derived per-line total equals the stored `lineAmount`, so they agree except in the pathological test case.
- **Column widths** rebalanced as module `COM_*` constants: CODE 11 / MSRP 13 / DISC 8 / PARTNER EACH 13 / QTY 6 / PARTNER TOTAL 14 = 65% fixed, PRODUCT absorbs the remaining 35% via `flex: 1` (row totals 100%). All numeric/currency columns right-aligned. The total-row and additional-discounts cells were repointed from the old `COM_LINE_TOTAL` to `COM_PARTNER_TOTAL` so they sit under PARTNER TOTAL.
- **Static Terms / Shipping / FOB block** added near the bottom of the commercial page (above the fixed footer, via `marginTop: auto`), after the "All amounts in USD…" note. Compact label/value rows (bold right-aligned labels, plain values), exported as the `QUOTE_FOB_BLOCK` constant: `Terms → Net 30`, `Shipping Method → TBD - NOT included in price`, `FOB → El Cajon, CA` (verbatim).
- **Footer resized (shared, all pages).** Address line: **6.5pt → 8pt** and now **bold** (was normal-weight muted) so it is the dominant footer element. Quote-ref / Valid-through row: **7pt → 7.7pt** (~10%), normal weight, kept visibly smaller than the bold 8pt address line. Footer content unchanged.
- **Tests** (`render.test.ts`): added `COMMERCIAL_COLUMNS` order/width-sum/alignment assertions, `derivePartnerEach`/`derivePartnerTotal` unit tests (incl. the brief's 41659 @ 40% × 1 → 24995 each / 24995 total, and ×3 → 74985), a null-MSRP / null-pct case, a "does not read discountedUnitPrice" case, and the `QUOTE_FOB_BLOCK` verbatim-text presence assertion. The null-`discountedUnitPrice`, null-`additionalDiscounts`, info-only, and verbatim-total tests stay green.

### Verification gates

- `npm test` **172/172** (+10 over the prior 162). `npm run build` ✓ Compiled successfully. `npx eslint` 0 errors on `ProjectQuotePdf.tsx` + `render.test.ts`.
- Smoke-rendered a realistic snapshot via `pdftotext -layout`: valid PDF (`%PDF-`), commercial page shows the 7 columns in order, derived prices ($41,659 @ 40% → $24,995 each × 2 = $49,990; $8,500 @ 45% → $4,675), info-only warranty line blanks money cells / keeps QTY, verbatim Total $54,665, the Terms/Shipping/FOB block immediately above the footer, and the resized (bold, larger) footer.

### Decisions captured

- **No ADR.** Presentation-layer change within the locked Project Quote architecture (ADR 0059–0061), same rationale as the page-1 camera-schedule entry below. No snapshot/data/migration/binding-rule change; nothing rotates out of head that an ADR would need to preserve. The one judgement call (verbatim total vs. summed partner total) is recorded above.

---

## 2026-06-18 — Project Quote PDF page 1: graceful camera-schedule columns for hand-entered deals

### Work done

Render-layer-only change to the Project Quote PDF page-1 camera schedule (`ProjectQuotePdf.tsx`). The previous layout always showed VENDOR / MODEL / UNITS / SENSORS / RESOLUTION / BW / STORAGE; on hand-entered deals (no camera model chosen) the first four columns were all em-dashes — broken-looking — and the schedule dropped the richer sizing columns the submission-detail view shows. The schedule now selects its columns per snapshot.

- **Verified the snapshot already carries the sizing fields** before writing any render code (`types.ts` + `snapshot.ts`). Each `ProjectQuoteCameraRow` (= `SubmissionPdfGroup` + Phase 10 fields), frozen by `buildCameraSchedule`, carries: `name`, `cameras`, `resolutionLabel`, `codec`, `fps`, `complexityLabel`, `recordingMode` (`constant`|`motion`), `hoursPerDay` (= round(recordingPercent/100 · 24)), `motionPercent`, `bandwidthMbps`, `storageGb`, plus the Phase 10 `cameraVendor`/`cameraModel` (null = manual-entry marker), `units`, `sensorsPerCamera`, `cameraModelModified`. So every field page 1 needs (codec / fps / complexity label / recording hrs / motion %) was already present — no snapshot-shape gap, no migration.
- **Graceful per-snapshot column selection.** New pure helper `cameraScheduleHasVendorOrModel(rows)` returns true iff ANY group carries a non-empty vendor OR model (empty string treated as absent). When false, the schedule renders the 7 submission-detail sizing columns — RESOLUTION / CODEC / FPS / SCENE COMPLEXITY / OPERATION HRS / BW (Mb/s) / STORAGE (TB) — and omits Vendor/Model entirely. When true, Vendor and Model are prepended to that same set (9 columns); a group lacking vendor/model dashes just those two cells while its sizing cells render fully. UNITS / SENSORS columns were dropped from both layouts.
- **OPERATION HRS** matches the submission-detail presentation: the frozen recording hours, with the motion percent in parentheses for motion-mode groups (e.g. `18 (motion 40%)`); constant-mode groups show just the hours. New exported helper `formatOperationHrs`. No sizing is recomputed — every value is read verbatim from the frozen snapshot.
- **Column geometry as two named width sets** (`CAMA_*` 7-column, `CAMB_*` 9-column), each summing to 100% at US-Letter portrait width; totals-label widths derived as `100 − BW − STORE`. The header / data / totals rows are now driven by a single `buildCameraColumns(showVendorModel)` descriptor array (header, width, align, cell), so there is one authoritative column definition per layout. Numeric columns (FPS, Bw, Storage) right-aligned; text columns left-aligned.
- **Kept unchanged:** the per-group "{name} · {M} camera streams" sub-header (with the "· modified" suffix when a model-loaded group was modified), the Totals row reading the frozen `sizing.totals` aggregates (never re-summed from rows), and the retention footnote.
- **Tests** (`render.test.ts`): added the no-model and mixed-model snapshot cases (layout decision + manual-group dashes with populated sizing cells), exact header-sequence assertions for both layouts, width-sum = 100% and alignment checks, and unit tests for `formatOperationHrs` (constant vs motion). The existing multi-group / manual-entry test stays green.

### Detours & fixes

- **Smoke-render text extraction failed, then was replaced with a faithful check.** First cut inflated the PDF's FlateDecode content streams and grepped for the column headers as ASCII — found nothing (every token, present and absent, came back false). react-pdf embeds and *subsets* even standard Helvetica, so glyphs are stored by subset id, not readable text; a raw grep can never confirm columns. Switched the smoke check to assert the renderer's own `buildCameraColumns(cameraScheduleHasVendorOrModel(schedule))` output (the exact code path the component runs) alongside the `%PDF-`/byte-size render check, and exported `buildCameraColumns` + `CameraColumn` so the test suite asserts the same thing.

### Verification gates

- `npm test` 162/162 (+4 over the prior 158: the buildCameraColumns header/width/alignment block; no deletions).
- `npm run build` clean (TypeScript + Compiled); `npx eslint` 0 errors on `ProjectQuotePdf.tsx` and `render.test.ts`.
- Smoke-rendered a realistic hand-entered (no-model) snapshot: valid PDF (`%PDF-`, 12,287 bytes), `showVendorModel=false`, page-1 columns = the 7 sizing columns with no Vendor/Model, Operation-hrs cell = `18 (motion 40%)`.

### Decisions captured

- **No ADR.** This is a render-layer presentation choice within the locked Project Quote architecture (ADR 0059–0061) — like the line-item `orderNr` sort and the `usableCapacityTb`/`mapServerSpec` helper convergence, which were captured in the journal without their own ADRs. No snapshot shape, data layer, migration, or binding rule changed; nothing here rotates out of head in a way an ADR would need to preserve.

---

## 2026-06-18 — Project Quote PDF revisions: drop showcase, partner on page 1, header/footer, one-page terms

### Work done

A round of layout/content fixes to the Project Quote PDF. The document is now three pages (Sizing, Products, Terms) instead of four. All local gates green; not yet committed (awaiting go-ahead).

- **Removed the showcase page entirely** (ADR 0065). Full removal, not render-only: dropped the `showcase` field from the snapshot shape (`types.ts`), the showcase builders (`buildShowcase`, `buildShowcaseSpecHighlights`, `isShowcaseProductGroup`, `ShowcaseCatalogRecord`) from `snapshot.ts`, the catalog resolution (`loadShowcaseCatalog` + the `dealSkus`/`catalogBySku` plumbing) from `assemble.ts`, the showcase hero loading from `render.ts`, and the page-2 JSX + styles + `showcaseSpecPairs` + `showcaseHeroDataUris` input field from `ProjectQuotePdf.tsx`. The commercial line-item table is the sole product record. No quotes were issued (0 rows), so no historical snapshot loses content and the snapshot version is unchanged.
- **Page 1 — partner company on the heading line.** The "Project parameters" title is now a row with the reseller/partner company right-aligned as "Prepared for {Company}" (company in bold navy). Zero extra vertical space; the params grid is untouched.
- **Header disclaimer on every page.** A muted italic line under the rule: "Quote valid for a maximum of {N} days from date of quote and subject to change without notice." The day count is templated from the quote's frozen `validityDays` (renders 7 today) so it can never drift from the "Valid through" date computed from the same value.
- **Footer contact line on every page.** The footer is now two lines: a centered Arxys contact line ("Arxys · 1810 Gillespie Way, Suite 108, El Cajon, CA 92020 · 619.258.7800 · arxys.com", a module constant) above the existing quote-ref | "Valid through" row. Address supplied by Andy 2026-06-18; capitalization standardized (Gillespie Way / El Cajon) and a comma added after the suite.
- **Terms identity block → 3 columns × 2 rows.** Replaced the 5-row stacked label/value block with a compact flex-wrap grid: row 1 = Quote reference / Generated / Valid through; row 2 = Terms version / Prepared for (wide). Frees vertical space.
- **Terms fit one page.** Tightened the terms body (fontSize 7→6.5, lineHeight 1.65→1.32, paragraph spacing 5→3) so the full multi-clause T&Cs render on a single page. Verified by a render that produced exactly 3 pages (terms did not spill to a 4th).

### Verification gates

- `npm test` 150/150 (−8: removed the `isShowcaseProductGroup`, `buildShowcase`, and two showcase-render tests; updated `buildProjectQuoteSnapshot` / fixtures to drop `catalogBySku` and the `showcase` assertion).
- `npm run build` clean (TypeScript + Compiled); `npx eslint` 0 errors on all changed files.
- Full-quote render with the real in-force terms: `%PDF-`, **3 pages** (Sizing, Products, Terms-on-one-page).

### Decisions captured

- [`0065-drop-project-quote-showcase-page.md`](./decisions/0065-drop-project-quote-showcase-page.md) — drop the showcase; commercial line items are the sole product record. Amends the page-2 / showcase portions of ADR 0059 and 0060.

---

## 2026-06-18 — Project Quote: approved Terms & Conditions replace the placeholder

### Work done

Swapped the placeholder T&C (the 5a/5b go-live flag) for the approved Arxys quote terms supplied by Andy on 2026-06-18.

- **`src/lib/project-quote/terms.ts`** — replaced the 4-line Price Book placeholder with the approved terms verbatim: the header, the starred 30-day pricing line, the 9 numbered clauses, the `ALL TARIFFS ARE PASSED THROUGH` caps line, the Microsoft Windows / VMS / SQL-Standard addendum, the AI-volatility caps line, and the purchase-terms/payment paragraph (`www.arxys.com/purchaseterms` as plain text, 3% credit-card fee, US$, F.O.B, Freight). Each paragraph is a separate array entry joined by a blank line.
- **Version bumped `1.0` → `2.0`.** Different text must not reuse a version string (the drift/dedup premise). The old `1.0` was never issued — `project_quotes` had 0 rows when the swap landed — so there is no audit collision.
- **`ProjectQuotePdf.tsx`** — the terms now render one `<Text>` per paragraph (split on the blank-line join) instead of one giant `<Text>`, giving react-pdf natural break points so the longer multi-clause terms paginate cleanly. The full terms now flow from page 4 onto page 5 (the quote is ~5 pages); smoke-rendered to a valid PDF.
- **Whitespace** normalized (a few accidental double-spaces collapsed to single); wording otherwise verbatim, apostrophes preserved as supplied.
- **`snapshot.test.ts`** — the version test now asserts the exported constant (not a literal), and a new test anchors the approved copy (header, a clause, the Windows addendum, the purchase-terms URL) so any regression back to placeholder copy fails the suite.

### Decisions captured

- **Quote "Valid through" stays 7 days, intentionally distinct from the 30-day pricing clause in the T&C** (confirmed with Andy 2026-06-18). The terms state pricing is valid 30 days; the quote's own expiry window (`PROJECT_QUOTE_VALIDITY_DAYS`, ADR 0061) is 7 days and represents quote expiry, a different thing from the pricing-validity statement. Do NOT "reconcile" the 7 to 30 — the difference is by design.
- The **placeholder-T&C go-live flag** carried since Step 5a/5b is now **CLOSED**.

### Verification gates

- `npm test` 158/158 (+1 approved-terms content assertion); `npm run build` clean; `npx eslint` 0 errors on `terms.ts`, `ProjectQuotePdf.tsx`, `snapshot.test.ts`. Real in-force terms smoke-rendered to a valid ~5-page PDF (`%PDF-` header, paginates without clipping).

---

## 2026-06-18 — Phase 10 / Project Quote Step 6: generate, persist, deliver

### Work done

Wired the four pieces Steps 4 / 5a / 5b built into the internal-only Generate flow: the server action, the snapshot INSERT with version-conflict handling, the Pipedrive Files API delivery (net-new write surface), and the detail-page UI. **Committed as `26f5de7` and deployed to production via `origin/main` on 2026-06-18.**

- **`addDealFile` on the shared `pipedriveClient`** (`src/lib/pipedrive/client.ts`). The portal previously only wrote deals / fields / notes; this is the first file-attach path. `POST /v1/files` takes a multipart form, not JSON, so it cannot go through `request()` (which always JSON-encodes). Added a `requestUpload` helper — a multipart sibling of `requestSearch` — that reuses the same `withToken()` auth path and the same `PipedriveError` surface, with a `FormData` body. No second HTTP client, no second auth path. New `PdFile` read type. Defensive copy into a fresh `ArrayBuffer`-backed `Uint8Array` before `Blob` construction (a Node `Buffer` is `Uint8Array<ArrayBufferLike>`, which the lib's `BlobPart` type rejects — see Detours).
- **Generate orchestrator** (`src/lib/project-quote/generate.ts`, dependency-injected, Node-testable). `generateProjectQuoteCore(submissionId, deps)` owns the branch handling, the version-conflict retry, and the resilience ordering. The server-only deps (assembly, render, Pipedrive) are INJECTED, so the core carries no `server-only` import and is unit-tested with plain fakes — the same render → data dependency discipline the rest of the module follows. Branches every `AssembleSnapshotResult` case to its own user-facing message (`empty_deal` refusal, `no_deal_link`, `submission_not_found`, retryable `deal_read_error`); only `ok` proceeds.
- **Version-conflict retry.** Persist is first. The unique `(submission_id, version)` constraint is the concurrency guard (ADR 0061): on a `23505` violation, the core re-runs assembly once (which recomputes `max(version)+1`) and retries the INSERT; a second consecutive conflict, or any non-`23505` error, returns a saved-failed message. No `is_current` column, no demote step — the new version row is the new current by derivation.
- **Resilience ordering** (ADR 0020): persist → render → deliver. The row is persisted before any render/deliver, so a Pipedrive (or render) failure is logged, surfaced as a non-blocking notice, and leaves a stored, re-deliverable quote. Mirrors how `submitCalculation` treats deal-sync failure as non-fatal.
- **Server action** (`src/app/(app)/admin/submissions/[id]/project-quote-actions.ts`, `"use server"`). Thin wrapper: enforces the internal-caller gate server-side (active AND `is_internal` OR `role=admin`, mirroring the `project_quotes` RLS and the `submitCalculation` caller-status check), supplies the real deps, and `revalidatePath`s the detail page on success. Defense-in-depth: the button also never renders for non-internal users, and RLS re-checks on the INSERT.
- **Internal-only download Route Handler** (`src/app/(app)/api/admin/submissions/[id]/project-quote/pdf/route.ts`, `runtime = "nodejs"`). Loads the derived-current quote and re-renders from the stored snapshot (never a live pull, ADR 0060). Gated twice: its own active-internal/admin check, plus `project_quotes` RLS returning null for anyone else.
- **UI** (`_components/project-quote-panel.tsx` + wired into the admin `[id]/page.tsx`). Internal-only panel: "Generate Project Quote" (or "Make New Project Quote" when one exists, producing the next version), the current `DealID-V#-date` identifier + version + generated/expiry dates + terms version, a Download PDF link, loading/error/empty-deal states, and a non-blocking delivery notice. Visibility gated on `is_internal` (consistent with the 2026-06-17 Edit-button gate). The partner `/submissions` view does NOT get this.
- **Expiry helper** (`src/lib/project-quote/expiry.ts`). `projectQuoteExpiryIso(generatedAt, validityDays)` returns the UTC `YYYY-MM-DD` the quote is valid through, computed from the same `generatedAt + validityDays * 86400 * 1000` instant the PDF footer uses, so the panel and the document never disagree. Derived, never stored (ADR 0061).
- **RLS test suite expansion** (`scripts/test-rls.ts`). Added the Phase 10 Step 6 `project_quotes` block (tests 19a–19h): partner SELECT/INSERT blocked, internal + admin SELECT allowed, internal INSERT-for-self allowed, INSERT with a spoofed `generated_by` blocked, UPDATE and DELETE blocked for everyone (immutability). Cleans up quote rows before persona teardown (the `submission_id` FK is `on delete restrict`). **These run POST-DEPLOY** — the table does not exist until the migration is pushed.

### Detours & fixes

- **`BlobPart` rejected the Node `Buffer`.** First build failed type-check: `Uint8Array<ArrayBufferLike>` is not assignable to `BlobPart` because the lib type requires an `ArrayBuffer`-backed view (a `SharedArrayBuffer` lacks `resizable`/`transfer`/etc). Fixed by copying into a fresh `new Uint8Array(buffer)` (a plain `ArrayBuffer`-backed view) before `Blob` construction — a one-time cost on a PDF-sized payload. Caught by the local `npm run build`, not CI.
- **Testing the action without a Next runtime.** The `"use server"` action depends on `createSupabaseServerClient`, `revalidatePath`, and the `server-only` assembly/render modules, none of which run under plain `tsx --test`. Rather than mock the Next runtime, the decision logic was extracted to `generateProjectQuoteCore(submissionId, deps)` with injected assemble/render/deliver, leaving the wrapper as thin glue. The core is fully unit-tested; the wrapper is exercised end-to-end only via the live path. Same split as `assemble.ts` (pure builders vs I/O orchestrator).
- **The migration was already applied on cloud — the 5a/Step-3 "not deployed" notes were stale.** At the stop-and-flag, before any push, `supabase migration list` showed `20260616000001` (camera search RPC) and `20260616000002` (`project_quotes`) with populated Remote columns, contradicting the journal. Rather than push blindly, verified ground truth against the remote DB: `project_quotes` EXISTS (0 rows) and `search_camera_specs` EXISTS. So both had been pushed in a prior session that never recorded the deploy in the journal. `supabase db push` then confirmed "Remote database is up to date" (no-op). No re-apply, no data risk. The pre-push backup still ran as the safety gate. Lesson: the journal's deploy state can drift from cloud reality; `migration list` + a direct existence check is the authoritative check before a push.

### Flags

- **Placeholder T&C text (carried forward from 5b/5a).** `getProjectQuoteTerms()` is still seeded from placeholder copy. Replace with approved legal text and set the real in-force version before go-live.
- **PDF `partner.email` is the viewer (carried from 2026-06-17).** Not touched here; the Project Quote partner block freezes company + contact only (no email, 5a resolver decision), so this step does not regress it.
- **Open decisions for Andy:** (1) download is currently **internal-only**; partner-facing download would need an RLS/route change. (2) **All versions are retained** (immutable, no pruning); confirm that is the intended retention policy.

### Verification gates

- `npm test` 157/157 (was 144). New: `pipedrive/client.test.ts` (3 — multipart shape + two error paths), `project-quote/generate.test.ts` (10 — four assemble-failure branches, happy path, conflict-retry success, double-conflict give-up, non-conflict error, delivery-throws-non-fatal, render-throws-non-fatal). The `console.error` lines in the run are the logging path under test, not failures.
- `npm run build` clean (19 routes — the new `/api/admin/submissions/[id]/project-quote/pdf` Route Handler registered; TypeScript + Compiled pass).
- `npx eslint` 0 errors on all changed/new files.
- **Cloud RLS verified.** Pre-push backup `backups/manual-2026-06-18T18-04-13-027Z.json`. `supabase db push` → "Remote database is up to date" (already applied, see Detours). `test-rls.ts` against cloud: ALL pass, including the 8 new `project_quotes` checks (19a partner SELECT blocked, 19b internal SELECT, 19c admin SELECT, 19d partner INSERT blocked, 19e internal INSERT-for-self, 19f spoofed-`generated_by` INSERT blocked, 19g UPDATE blocked, 19h DELETE blocked). 19g/19h manifest as `permission denied for table project_quotes` (UPDATE/DELETE ungranted), confirming immutability at the privilege layer.
- **Live `addDealFile` probe** against deal 4822 (the Step-4 example): uploaded one throwaway PDF (file id 285645), Pipedrive echoed `deal_id: 4822` (multipart link confirmed), then deleted it (`success: true`, HTTP 200). Throwaway probe script removed after the run; output PII-free.
- **Committed and deployed.** Commit `26f5de7` landed on `origin/main` 2026-06-18; Vercel auto-promoted to production.

### Decisions captured

- [`0064-project-quote-delivery-via-deal-file-attachment.md`](./decisions/0064-project-quote-delivery-via-deal-file-attachment.md) — delivery via Pipedrive deal file attachment (not email), best-effort and non-fatal.
- ADRs [`0059`](./decisions/0059-project-quote-architecture.md) / [`0060`](./decisions/0060-snapshot-storage-for-project-quotes.md) / [`0061`](./decisions/0061-project-quote-versioning-and-derived-current.md) were already promoted Proposed → Accepted in the 5a entry; no status change needed here. The version-conflict retry and the dependency-injected generate core are implementation choices within that locked architecture (no separate ADR, same call as 5b's helper-convergence note).

---

## 2026-06-17 — Bug fixes: Pipedrive storage units + submission-history column labels/values

The System Estimate PDF already rendered all three of these correctly (storage in TB, recording in hours, six-level complexity labels). These fixes bring the Pipedrive deal payload and the submission-history view into alignment with it.

### Work done

**Fix 1 — Pipedrive `arxys_storage_gb` field now sends rounded whole TB (was raw GB)**

- `src/lib/pipedrive/deal.ts`: imported `GB_PER_TB` from `@/lib/recommend/types`. Changed `[customFieldKeys["arxys_storage_gb"]]` from `Number(storageGb.toFixed(2))` (e.g. `1500000.79`) to `Math.round(storageGb / GB_PER_TB)` (e.g. `1500`). Added an inline comment documenting the intentional discrepancy — see decision note below.
- `src/lib/pipedrive/deal.test.ts`: updated two assertions from `1500000.79` → `1500`.
- The `Total Storage` calc field (text string "1500.00 TB") was **not** changed — it is a separate Pipedrive field and already correct.

**Fix 2 — Submission-history per-group table: "Rec %" column renamed to "Rec Hrs", showing hours not percent**

- `src/app/(app)/_components/submission-detail.tsx`: renamed column header `Rec %` → `Rec Hrs`. Changed cell value from `formatNumber(g.recordingPercent)` to `Math.round(((g.recordingPercent ?? 0) / 100) * 24)` — the same `hoursPerDay` derivation the PDF uses in `render.ts`.
- This is display-only; `recordingPercent` remains the banked field in `groups_payload`.

**Fix 3 — Submission-history per-group table: Complexity column now shows six-level label**

- Same file: added `complexityLabel?: string` to the local `GroupRow` type. Added a local `fallbackComplexityLabel(tier)` mirror of the `render.ts` helper (low → "Low detail", med → "Medium detail", high → "High detail", default → "Standard"). Changed the Complexity cell from `{g.complexity ?? "—"}` to `{g.complexityLabel ?? fallbackComplexityLabel(g.complexity)}`.
- Fixed the **"Primary codec / complexity" summary row** (was showing e.g. "h264 · med") to use `groups[0]?.complexityLabel ?? fallbackComplexityLabel(groups[0]?.complexity ?? submission.complexity)`. Legacy rows with no groups fall back cleanly.

**Third-reader audit**

Checked `src/lib/project-quote/snapshot.ts` — already applies `complexityLabel ?? fallbackComplexityLabel(g.complexity)` and `Math.round(((g.recordingPercent ?? 0) / 100) * 24)` on lines 216–218. No other broken reader found. No export or API route reads the per-group table with the old values.

### Decisions captured

**Intentional rounded-TB-vs-precise-TB discrepancy in Pipedrive**

The `arxys_storage_gb` Pipedrive field (production key `d7e154e3d50d006cf337262c4d70864728302009`) now sends a rounded whole-TB integer for sales readability. This will NOT exactly equal `storage_tb` on the submissions row (two decimal places) or the PDF figure. This is deliberate — do not "reconcile" by switching Pipedrive to the precise value. Documented with an inline comment in `deal.ts`.

### Verification

- `npm test`: 144/144 pass (updated `arxys_storage_gb` assertions in `deal.test.ts`)
- `npm run build`: clean
- `npx eslint` on all three changed files: 0 errors
- Display fixes verified by reading rendered paths end-to-end; live browser verification of auth-gated views deferred to an authenticated session per standing practice.

---

## 2026-06-17 — Bug fix: Pipedrive deal fields showing raw option IDs instead of human-readable labels

### Work done

Three Pipedrive deal fields were displaying raw numbers instead of descriptive text because the code was sending Pipedrive enum/set option IDs to fields configured as plain text in Pipedrive. VMS was unaffected (it IS a proper enum field and renders option IDs as labels); CODEC New, Complexity Scene-Motion, and Recording hours are text fields and stored whatever was sent verbatim.

- **CODEC New** (was: `139`, `138`, `286` — Pipedrive option IDs) → now sends `"H.265"`, `"H.264"`, `"Smart"`. Removed `CODEC_OPTION_IDS` map, added `CODEC_LABELS`.
- **Complexity Scene-Motion** (was: `"288"`, `"287,289"` — comma-joined option IDs) → now sends `"Medium"`, `"Low, High"` etc. in severity order. Removed `COMPLEXITY_OPTION_IDS` map, added `COMPLEXITY_LABELS` + `COMPLEXITY_ORDER`.
- **Recording hours** (was: computed hours per day as a bare number, e.g. `"23"`) → now sends the recording mode label `"24 Hour Continuous"` or `"Record Only On Motion"`, mirroring the Recording New field in human-readable form.

Updated all affected test assertions in `src/lib/pipedrive/deal.test.ts`.

### Verification

- `npm test`: 144/144 pass
- `npm run build`: clean
- `npx eslint` on changed files: 0 errors

---

## 2026-06-17 — Bug fix: on-behalf-of fields not rehydrating in calculator revision flow

### Work done

When an internal user clicks "Edit / revise quote" on a submission that had an on-behalf-of target set, the ON BEHALF OF section in the calculator was showing blank dropdowns instead of pre-filling the original company and partner user.

**Root cause**: `calculator/page.tsx` only selected `id, input_state, groups_payload` in the revise query — the `on_behalf_of_partner_id` and `on_behalf_of_company_name` columns were never fetched. `CalculatorForm` had no way to receive them, and `useState` for all three on-behalf fields hard-coded `""` as the initial value.

**Fix:**
- `src/app/(app)/calculator/page.tsx`: added `on_behalf_of_partner_id` and `on_behalf_of_company_name` to the revise SELECT; extracts them into `initialOnBehalfPartnerId` / `initialOnBehalfCompanyName` and passes them as new props to `CalculatorForm`.
- `src/app/(app)/calculator/calculator-form.tsx`: added `initialOnBehalfPartnerId?: string | null` and `initialOnBehalfCompanyName?: string | null` props; FK case (`on_behalf_of_partner_id` set) looks up the matching partner in `onBehalfPartners` to derive the company-dropdown value and pre-selects the user ID; free-text case (`on_behalf_of_company_name` set) populates `onBehalfNewCompany` and auto-opens the "not onboarded" text field (`showNewCompany = true`).

### Verification

- `npm test`: 144/144 pass
- `npm run build`: clean
- `npx eslint` on changed files: 0 errors

---

## 2026-06-17 — Regression fixes: on-behalf-of read attribution + Edit button for internal users

### Work done

**Bug 1 — On-behalf-of partner attribution lost on read side (regressing commit: `79de8f8` Phase 7 Step 1)**

Phase 7 correctly wrote `on_behalf_of_partner_id` and `on_behalf_of_company_name` to submission rows. The read path was never updated to consume them.

- Created `src/lib/pdf/partner-resolution.ts`: pure `resolveSubmissionPartner(submission, onBehalfRow, creatingRow)` with three-tier precedence: (1) `on_behalf_of_partner_id` FK target via admin client, (2) `on_behalf_of_company_name` free-text name, (3) creating partner as fallback.
- `src/lib/pdf/render.ts` (`loadSubmissionPdfInput`): added `on_behalf_of_partner_id` and `on_behalf_of_company_name` to the SELECT; added admin-client lookup for the FK-linked on-behalf target; applied `resolveSubmissionPartner`. `partner.email` still comes from `auth.getUser()` (the authenticated viewer) — fixing this requires auth/identity plumbing that is out of scope.
- `src/app/(app)/admin/submissions/page.tsx` flat list: added `on_behalf_of_partner_id` and `on_behalf_of_company_name` to the SELECT; batch-fetched on-behalf partner names via admin client; PARTNER column now shows the effective target name.
- `src/app/(app)/admin/submissions/[id]/page.tsx`: added `on_behalf_of_partner_id` and `on_behalf_of_company_name` to the submission fetch; applied `resolveSubmissionPartner` so the "Partner:" header in the admin detail view shows the target, not the rep.

Three regression tests added to `src/lib/pdf/render.test.ts` for all three precedence tiers.

**Bug 2 — Edit / revise button absent for internal users in admin view (regressing commit: `a982384` Phase 8 Step C)**

Phase 8 Step C gave internal users (`is_internal = true`) access to `/admin/submissions` and `/admin/submissions/[id]`. These views render `SubmissionDetail` with `mode="admin"`, which never showed the Edit/revise button. Before Phase 8 Step C, internal users only accessed their own submissions through `/submissions` (the partner pipeline), which has the Revise link. After Phase 8 Step C, they could navigate to the admin view but found no way to revise from there.

- `src/app/(app)/_components/submission-detail.tsx`: added `canRevise?: boolean` prop; gate changed from `mode === "partner"` to `mode === "partner" || canRevise`.
- `src/app/(app)/admin/submissions/[id]/page.tsx`: detects `is_internal` for the authenticated viewer; passes `canRevise={isInternal}` to `SubmissionDetail`. The Revise link in `/submissions` (pipeline.tsx) was never removed and remains correct for all users.

### Verification

- `npm test`: 144/144 pass (5 new regression tests for `resolveSubmissionPartner`)
- `npm run build`: clean
- `npx eslint` on all changed files: 0 errors

---

## 2026-06-17 — Phase 10 / Project Quote Step 5b: unified Project Quote PDF renderer

### Work done

Built the four-page portrait Project Quote PDF renderer from the frozen snapshot shape established in Step 5a. Renders nothing automatically; the Generate button, snapshot INSERT, and email-back are Step 6. All verification gates green; nothing pushed, migrated, or committed.

- **`src/lib/capacity-utils.ts`** (new). Extracted `usableCapacityTb` from the two places it was duplicated (flagged in the Step 5a journal): a pure, server-only-free module importable by any layer. The function body is identical to both originals; no logic change.
- **`src/lib/pdf/render.ts`** (modified). Removed the local `usableCapacityTb` definition; imports from `../capacity-utils` and re-exports it under the same name so any external caller (there are none today, but the export was public) continues to work without changes.
- **`src/lib/project-quote/snapshot.ts`** (modified). Removed the local `usableCapacityTb` definition; imports from `../capacity-utils` for internal use in `mapServerSpec` and re-exports it so `snapshot.test.ts` continues to import from `./snapshot` without change. The `mapServerSpec` function still uses it via the local import.
- **`src/lib/pdf/assets.ts`** (modified). Added `loadPngDataUriByPath(publicPath)` export — a thin wrapper over the private `loadPngDataUri` function. The Project Quote renderer calls it to load frozen image paths from the snapshot at render time (paths frozen per ADR 0060; bytes are not frozen in the row).
- **`src/lib/project-quote/ProjectQuotePdf.tsx`** (new). The `@react-pdf/renderer` Document with four portrait US Letter pages. No `server-only` marker so tests can import it directly (matching the `SubmissionPdf.tsx` pattern). Exports `ProjectQuotePdfInput`, `sortLineItemsByOrderNr`, and `ProjectQuotePdf`. Zero Supabase / Pipedrive / data-layer imports — the renderer is pure given its input.
  - **Page 1 — Sizing.** Project parameters block (name / VMS / retention / identifier); camera schedule table with the Phase 10 vendor / model / units / sensors columns converging here (the current System Estimate does not carry these); capacity bars (storage / bandwidth / utilization) using the same nested-`<View>` fill technique; primary server hero (image + model + SKU + spec grid including usable storage, CPU, RAM, OS, warranty). VMS is rendered as the single frozen label; no edition field exists on the submission (5a confirmed; no change needed).
  - **Page 2 — Showcase.** Product cards for items the assembly layer froze in `snapshot.showcase`. No re-filtering at render time — eligibility ran at assembly. Each card: hero image (null falls back to a product-group text placeholder) + product name + SKU + spec highlights grid (null fields omitted; no spec row renders a "Specifications not available" note). Cards rendered in a 49%-wide two-column flex grid; empty showcase renders a single informational line.
  - **Page 3 — Commercial.** Deal / customer info block (organization name + contact name + deal title); line-item table sorted by `orderNr` ascending (see decision below); info-only lines (`isInfoOnly === true`) render code / name / qty only with unit-price / discount / line-total cells blank; `productTotal` rendered verbatim as the table total; `additionalDiscounts` row appears only when non-null (always null today); `discountedUnitPrice` is never shown (always null, Pipedrive does not expose it).
  - **Page 4 — Terms.** Identity block (identifier / generated date / expiry / terms version / "Prepared for" partner company and contact, no email per 5a resolver decision); full verbatim T&C text from `snapshot.terms.text`.
  - **Fixed footer.** Renders on every page: `Arxys · arxys.com` | identifier | `Valid through {expiryDate}`. Expiry computed at render from `generation.generatedAt + generation.validityDays × 86400 s`; never a stored flag.
- **`src/lib/project-quote/render.ts`** (new, `server-only`). `renderProjectQuotePdfBuffer(snapshot)` — loads logo and hero images from `/public` via `loadPngDataUriByPath`, assembles `ProjectQuotePdfInput`, and calls `renderToBuffer`. `projectQuotePdfFilename(snapshot)` — `Arxys Project Quote - {company} - {identifier}.pdf` (company from reseller, falling back to organization name).
- **`src/lib/project-quote/render.test.ts`** (new). 13 tests following the `render.test.ts` idiom (imports `ProjectQuotePdf` + `renderToBuffer` directly, bypassing the `server-only` render module): golden render (buffer + `%PDF-` header); null serverSpec; empty showcase; multi-item showcase (including a card with null specHighlights); null `additionalDiscounts` / null `discountedUnitPrice`; non-null `additionalDiscounts`; info-only lines; multi-group camera schedule with manual-entry groups; `sortLineItemsByOrderNr` (ascending, nulls last, non-mutating); verbatim-total assertion (fixture with `productTotal` deliberately differing from line sum, confirms no re-sum crash); null `productTotal`.

### Detours & fixes

- **`mapServerSpec` duplication stays.** The `mapServerSpec` functions in `pdf/render.ts` and `project-quote/snapshot.ts` have different input shapes (`ProductSpecRow` vs `SizingProductSpecRow`, where the latter adds `rack_units`). Converging them would require a union input type with no net simplification benefit, and the output type (`SubmissionPdfServerSpec` = `ProjectQuoteServerSpec`) is already shared through the type alias in `types.ts`. The Step 5b convergence mandate is satisfied by `usableCapacityTb`; `mapServerSpec` stays duplicated and is noted in the code comments on both copies.
- **`width` percentage strings in StyleSheet.** `@react-pdf/renderer` accepts `"17%"` strings as `DimensionValue`; TypeScript's `StyleSheet.create` enforces this correctly. Column widths declared as module-level constants (`COM_LINE_TOTAL`, `CAM_VENDOR`, etc.) rather than inlined, so the commercial and camera-schedule tables have a single authoritative source for their geometry.

### Flags for Step 6

- **Generate button + UI guard.** Step 6 wires the "Generate Project Quote" button on the submission detail page, the empty-deal guard (refuses generation on `empty_deal`), and the loading/error states.
- **Snapshot INSERT.** Step 6 calls `assembleProjectQuoteSnapshot` and persists the returned row via the `project_quotes` table (migration `20260616000002`, STOP-AND-FLAG'd in Step 5a, not yet deployed).
- **Email-back to Pipedrive.** Step 6 attaches the rendered PDF to the deal as a Pipedrive file attachment.
- **Version/expiry display.** Step 6 shows the current quote version and expiry date on the submission detail page, reading from `loadCurrentProjectQuote`.
- **Terms text.** The T&C text in `getProjectQuoteTerms()` is seeded from placeholder copy. Replace with approved legal text and set the real in-force version before go-live.

### Verification gates

- `npm test` 141/141 (13 new in `project-quote/render.test.ts`); 0 failures.
- `npm run build` clean (18 routes, TypeScript + Compiled pass).
- `npx eslint` 0 errors on the 7 changed / new files: `capacity-utils.ts`, `pdf/render.ts`, `pdf/assets.ts`, `project-quote/ProjectQuotePdf.tsx`, `project-quote/render.ts`, `project-quote/render.test.ts`, `project-quote/snapshot.ts`.
- No push, no migrate, no commit, no cloud-DB touch.

### Decisions captured

- **Line-item sort order (Step 4 open flag resolved).** Lines are sorted by `orderNr` ascending at render time, nulls last. This matches the rep's Pipedrive display order. The alternative (preserving the API's returned array order) would produce an unpredictable display when Pipedrive's array order diverges from `orderNr` — as it did on the live deal 4822 probe (array order 6,2,3,4,5,7,8,1,… vs. `orderNr` 1–8). Sorting by `orderNr` is the correct customer-facing choice; the raw array order is still available via `snapshot.commercial.lineItems` without the sort if needed.
- **Helper convergence path chosen (Step 5a open flag resolved).** `usableCapacityTb` extracted to `src/lib/capacity-utils.ts` (neutral, no server-only), imported by both `pdf/render.ts` and `project-quote/snapshot.ts`. `mapServerSpec` stays duplicated — different input types, no net gain from merging (rationale above). This satisfies the Step 5a mandate without inverting the dependency direction.
- **No new ADR.** The line-sort and helper-convergence decisions are implementation choices within the locked Project Quote architecture (ADR 0059/0060/0061); they do not represent a new non-obvious architectural choice warranting a separate ADR.

---

## 2026-06-16 — Phase 10 / Project Quote Step 5a AMENDMENT: showcase predicate widened + VMS-edition audit

### Work done

Targeted amendment to two decisions from Step 5a; no migration, no table, no commit, no push.

- **Showcase predicate widened** (`src/lib/project-quote/snapshot.ts`). Replaced the hardcoded `^V[1-8]00$` regex + `{SW10, SW20}` set with a single family-lookup check: `productGroupToFamilySlug(productGroup) !== null`. A product group is showcase-eligible if and only if it resolves to a price-book family (all V-series servers including V150 / V250 / V255 / V260 / V270, and all SW workstations SW10-SW35). Add-on cards, NICs, transceivers, and warranty SKUs have no price-book family and return null, keeping them off the showcase. The `productGroupToFamilySlug` helper was already imported; no new dependency. Adding a future model to the price-book `FAMILIES` array automatically includes it — no code change required.
- **VMS-edition audit** (`types.ts`, `snapshot.ts`, `assemble.ts`, `terms.ts`, tests). Searched the full project-quote module for any "edition" reference implying a separate VMS edition field. No such field exists. The only "edition" hits are `os_edition` (the server hardware's OS edition — Windows Server LTSC — a spec field, not a VMS field) and the comment in `types.ts` already documenting the absence of a VMS edition. No change made to the VMS shape.
- **Tests updated** (`snapshot.test.ts`). Rewrote the `isShowcaseProductGroup` suite: V150 / V250 / V255 / V260 / V270 and SW10-SW35 now assert true; NIC / RAM / GPU / WTY / SFP assert false. Rewrote the `buildShowcase` suite with a new fixture (V150, V255, V600, SW20, [MKT] custom, NIC card, transceiver, uncatalogued V700 SKU, duplicate V600): asserts the showcase contains exactly VX5-SW20-200, VX5-V150-ACM, VX5-V255-MGM, VX5-V600-320 and excludes the [MKT], NIC, transceiver, and uncatalogued V700. Hero path and spec highlights coverage retained.

### Verification gates

- `npm test` 128/128; `npm run build` clean; `npx eslint` 0 errors on changed files. No push, no migrate, no commit, no cloud-DB touch.

---

## 2026-06-16 — Phase 10 / Project Quote Step 5a: project_quotes snapshot schema + assembly (authored, verified, not deployed)

### Work done

Built the DATA-LAYER FOUNDATION for the Project Quote: the stored snapshot schema, the snapshot shape, and the assembly logic that 5b will render from. Renders nothing, adds no UI, no Generate button, no PDF, no email-back (those are 5b / Step 6). Authored and verified locally (build / lint / 20 new tests); nothing pushed, migrated, or committed. STOP-AND-FLAG: schema-touching, held for review.

- **Migration `20260616000002_phase10_project_quotes.sql`** (next timestamp after `20260616000001`). Table `project_quotes`: `id` uuid PK, `submission_id` uuid FK -> submissions (on delete restrict, protects the issued-quote audit trail), `pipedrive_deal_id` bigint (matches submissions' column type), `version` integer (CHECK >= 1), `snapshot` jsonb, `terms_version` text, `generated_at` timestamptz, `validity_days` integer (CHECK > 0), `generated_by` uuid FK -> partners (on delete restrict), `created_at` timestamptz, and `unique (submission_id, version)`. Index on `pipedrive_deal_id`; the unique `(submission_id, version)` index backs both the derived-current read and version history, so no extra index. Paired rollback `supabase/rollback/phase-10-step-5a-rollback.sql`.
- **RLS is INTERNAL-ONLY, not partner-readable.** A row holds pricing and customer PII, so SELECT is gated on `public.is_internal((select auth.uid())) or public.is_admin((select auth.uid()))` (admins covered explicitly per ADR 0059), distinct from the read-open `camera_specs` / `product_specs` reference tables. INSERT uses the same gate plus `generated_by = (select auth.uid())` (mirrors `submissions_insert_self`). `auth.uid()` wrapped as a scalar subquery per the ADR-0055 InitPlan idiom. Quotes are immutable: only SELECT and INSERT are granted, so UPDATE / DELETE are denied by default (a revision is a new version row, not an edit). No explicit restrictive deny policy, matching the repo's grant-plus-permissive idiom.
- **Snapshot shape** (`src/lib/project-quote/types.ts`), five frozen parts: (1) COMMERCIAL = the verbatim successful `DealQuote` from Step 4's `getDealForQuote`, stored RAW (imported, not redefined); line items keep Pipedrive's returned order with `orderNr` preserved for render-time sorting. (2) SIZING = resolved values page 1 needs, frozen as resolved labels (mirrors `groups_payload`, never indices): parameters, the camera schedule extended with the Phase 10 camera fields (vendor / model / units / sensors) the current System Estimate view model lacks, capacity figures, and the resolved primary-server spec + hero path. (3) SHOWCASE = page-2 cards for V100-V800 servers and SW10 / SW20 workstations that are on the deal AND have a catalog record, with frozen image path + spec highlights. (4) TERMS = version + full text + sha256, frozen self-contained. (5) GENERATION META = version, generatedAt, validity_days in force, generatedBy, and the composed `DealID-V#-date` identifier. A `snapshotVersion` envelope field guards future shape changes.
- **Terms frozen in full, not version-only** (`src/lib/project-quote/terms.ts`). Per the deterministic-reproduction requirement and that terms are legal text, the snapshot stores version + full text + sha256, and `terms_version` is also a queryable column for audit. Version-only would couple an old quote to an external versioned-terms archive still holding that version at re-render, which breaks the self-contained premise. Text seeded from the Arxys disclaimer already in the repo (price-book page + `docs/old-phase-3-plan.md`); flagged to replace with approved legal copy and set the real in-force version before go-live.
- **Assembly logic** (`src/lib/project-quote/snapshot.ts` pure builders; `src/lib/project-quote/assemble.ts` orchestrator). `assembleProjectQuoteSnapshot(submissionId, supabase)` loads the submission, reads the deal via `getDealForQuote`, resolves the sizing joins and the showcase catalog, computes `version = max(version)+1`, stamps terms + meta, and returns the row READY to insert. It does NOT insert. Empty-deal (`deal.isEmpty`) and deal-read-error surface as typed `AssembleSnapshotResult` cases (`empty_deal` / `deal_read_error`), plus `submission_not_found` and `no_deal_link`, so Step 6 guards cleanly. The pure builders carry no Supabase / Pipedrive / react-pdf / server-only import (dependency direction stays render -> data), so the unit tests run with plain fixtures and no mocks.
- **"Current" is derived, never stored.** `loadCurrentProjectQuote` reads `order by version desc limit 1`; there is no `is_current` column, no demote step, no race.
- **No derived prices stored.** The snapshot copies the raw `DealQuote` verbatim; partner-price-each and any discounted-unit-price are derived at render by 5b. A test asserts the stored commercial line has exactly the raw `QuoteLineItem` keys (no `partnerPriceEach`) and that `discountedUnitPrice` stays null.

### Detours & fixes

- **Did not reuse `loadSubmissionPdfInput` for the sizing half.** It sources `partner.email` from the live `auth.getUser()` session (which for an internal-generated quote is the GENERATOR, not the partner) and stamps a volatile `generatedAt`, both wrong to freeze. Authored a dedicated sizing resolver instead, freezing partner company + contact (no email) and the snapshot's own generation meta. The contactable address is `commercial.person.email` on the deal half.
- **Duplicated two small pure helpers** (`usableCapacityTb`, the server-spec mapping) from `src/lib/pdf/render.ts` into the data layer rather than importing them, because `render.ts` is `server-only` and pulls in `@react-pdf/renderer`. Importing it would invert the dependency direction and drag the renderer into a data-layer module. Frozen output means drift cannot corrupt old snapshots; flagged for 5b to converge during the PDF rework.

### Flags for 5b review

- **No VMS "edition" on the submission.** The submission stores a single `vms` name (`Milestone` etc.), no separate edition; the snapshot freezes `vms` only. If page 1 needs an edition, it must come from the server spec's VMS-validation field or a new submission field.
- **Showcase group set is `^V[1-8]00$` + SW10 / SW20.** Excludes V150 and the management / ACM tiers (V250 / V255 / V260 / V270) and SW25 / SW30 / SW35 by design; widen the predicate in `snapshot.ts` if more tiers should appear on page 2.
- **`additionalDiscounts` is null** (carried from Step 4: no such Pipedrive field configured) and **`discountedUnitPrice` is always null** (Pipedrive exposes no discounted unit price). 5b renders unit price, discount, and line amount.

### Verification gates

- `npm test` 128/128 (20 new in `project-quote/snapshot.test.ts`); `npm run build` clean (18 routes, TypeScript pass); `npx eslint` on the six new files 0 errors. No push, no migrate, no commit, no cloud-DB touch.

### Decisions captured

- [`0059-project-quote-architecture.md`](./decisions/0059-project-quote-architecture.md), [`0060-snapshot-storage-for-project-quotes.md`](./decisions/0060-snapshot-storage-for-project-quotes.md), [`0061-project-quote-versioning-and-derived-current.md`](./decisions/0061-project-quote-versioning-and-derived-current.md) promoted Proposed -> Accepted as the implementing change.

---

## 2026-06-16 — Phase 10 / Project Quote Step 4: Pipedrive READ integration (authored, verified, not deployed)

### Work done

Built the headless read layer for the future Project Quote. It pulls one deal's commercial surface from Pipedrive and returns a validated, typed structure. It renders nothing, stores nothing, writes nothing, and adds no UI; Steps 5 and 6 own those. Authored and verified locally (tests / build / lint / one read-only live call); nothing pushed, migrated, or committed.

- **New entry point `getDealForQuote(dealId)`** ([`src/lib/pipedrive/quote.ts`](../src/lib/pipedrive/quote.ts)). Takes a deal id and reads exactly that deal — no search, no guess. Returns a discriminated `GetDealForQuoteResult` (`{ ok: true; deal: DealQuote } | { ok: false; error: QuoteError }`). `DealQuote` is `{ dealId, dealTitle, updatedAt, owner, organization, person, lineItems[], productTotal, additionalDiscounts, currency, isEmpty }`.
- **Reuses the existing client/auth pattern verbatim.** Added three read-only GETs (`getDeal`, `getDealProducts`, `getProduct`) to the shared [`pipedriveClient`](../src/lib/pipedrive/client.ts) — same token-appending `request()` wrapper, same `PipedriveError` surface the write path uses. No new HTTP client, no new auth path. Added the read-shape types (`PdDealDetail`, `PdDealProduct`, `PdProduct`, plus the inlined `PdDealOwnerRef`/`PdDealPersonRef`/`PdDealOrgRef`).
- **Three surfaces read.** (1) Deal products → per line `productCode` (from the product record, see below), `productName`, `unitPrice` (item_price), `discount`/`discountType`/`discountPercent`, `quantity`, `lineAmount` (sum), `currency`, `orderNr`, `isInfoOnly`. (2) Linked org + person + owner, all taken from the deal detail which INLINES them (`user_id`/`person_id`/`org_id` arrive expanded — no extra traversal). (3) Metadata: `dealId`, `dealTitle`, `updatedAt` (update_time, captured for later staleness logic, not acted on).
- **Prices are passed through verbatim (binding rule).** Every money value is returned exactly as Pipedrive gives it. The layer never sums lines, derives a total, or computes a discounted unit price. `productTotal` is the deal `value` (the deal-level total Pipedrive holds), NOT the line sum — a unit test asserts this with a fixture whose value deliberately differs from the line sum.
- **Line order preserved exactly as the API returns it** (deliberate, per the locked decision). The layer does NOT re-sort; `order_nr` is exposed as a passthrough field for the renderer.
- **Graceful empty / missing cases, never throws.** Empty deal → `ok` with `lineItems: []` and `isEmpty: true` (the empty-deal *guard* is Step 6; this layer only reports the state). No linked org / no person / missing person phone / missing org address → the relevant field or sub-field is `null`. API errors map to typed `QuoteError` kinds (`not_found` 404, `auth` 401/403, `rate_limit` 429, `network`, `api`).
- **`pipedrive_deal_id` IS already persisted** — confirmed, no gap. It is a `bigint` on `submissions` ([`20260515193702_initial_schema.sql`](../supabase/migrations/20260515193702_initial_schema.sql):119), written immediately after deal create/update in [`calculator/actions.ts`](../src/app/(app)/calculator/actions.ts):542. This read layer's authoritative key is therefore already in place.
- **Tests** ([`quote.test.ts`](../src/lib/pipedrive/quote.test.ts), 17 cases, fetch-mock idiom from `deal.test.ts`, fully fake PII): multi-line deal with order + code resolution; verbatim total (value != line sum); no tariff field; $0 info-only line; priced `[MKT]` custom line; empty deal; missing org / missing person / missing phone / missing org address; per-product code-read failure degrades to `null` without failing the quote; 404/401/429 typed errors; invalid id rejected with zero network calls.

### Detours & fixes

- **The "additional discounts / tariff" deal field does not exist as structured Pipedrive data.** The planning entry lists a deal-level additional-discounts/tariff value. Verification (live, read-only) found no matching entry in `/v1/dealFields`, an empty `/api/v2/deals/{id}/discounts`, and a real 10-line deal whose `value` equals the exact sum of its line amounts. The account models discounts per-line (`discount` + `discount_type: "percentage"`), not deal-level. So `additionalDiscounts` resolves to `null` via a pinned `ADDITIONAL_DISCOUNTS_DEAL_FIELD_KEY = null` constant (documented in place): when Arxys adds the field, pin its hashed key there. **Flag for Step 5 review.**
- **Product code is not on the line attachment.** `GET /deals/{id}/products` carries `name`/`item_price`/`discount`/`sum`/`quantity`/`order_nr` but no `code`; the SKU code lives on the product record. The layer fetches `GET /products/{id}` once per DISTINCT `product_id` (concurrent, `Promise.all`), and a per-product failure degrades that code to `null` rather than failing the whole read.
- **No discounted-unit-price field exists.** Pipedrive exposes the unit price (`item_price`), the discount, and the discounted line total (`sum`) — not a discounted unit price. Deriving one would recompute a price, which is forbidden, so `discountedUnitPrice` is always `null`; the renderer shows unit price, discount, and line amount instead. **Flag for Step 5 review.**
- **API array order differs from `order_nr`.** The live v1 products endpoint returned deal 4822's lines in array order 6,2,3,4,5,7,8,1,… (not `order_nr` order). The layer preserves the API's returned array order literally per "as Pipedrive returns it" and exposes `orderNr` so Step 5 can re-sort to the rep's Pipedrive display order if that is what the quote should show. **Flag for Step 5 review.**

### Verification gates

- `npm test` 108/108 (17 new in `quote.test.ts`); `npm run build` clean (18 routes, Compiled + TypeScript pass); `npx eslint` on the three changed/new files 0 errors.
- One read-only live call against the real deal 4822 (the Kean example named in the Step-4 brief; note it is referenced in the brief, not in this journal). The full `getDealForQuote` pipeline resolved end-to-end: 10 lines in the API's returned order, codes resolved (`VX5-V800-720`, `VX5-V255-MGM`, `VX5-NIC-SFP28`, …), the two $0 warranty lines flagged `isInfoOnly`, all 45% discounts passed through, `productTotal` 347699.2 verbatim, `additionalDiscounts` null, org/person/owner resolved. PII scrubbed from the probe output; the throwaway probe script was deleted after the run. No write, no deploy.

### Decisions captured

The reserved Project Quote ADRs ([`0059`](./decisions/0059-project-quote-architecture.md)/[`0060`](./decisions/0060-snapshot-storage-for-project-quotes.md)/[`0061`](./decisions/0061-project-quote-versioning-and-derived-current.md)) stay Proposed; they are finalized at the Step 5/6 build where the schema, render, and generate paths land. This step's read-layer design notes are captured above.

---

## 2026-06-16 — Phase 10 Step 5: calculator camera-model picker tooltips + FAQ entry (authored, build-verified)

### Work done

Copy-only additions to `calculator-form.tsx`. No logic, state, schema, or behavior changed.

- **Vendor select tooltip** — added to `CameraModelPicker`, immediately after the `</select>` tag: explains that picking the vendor gates the model search and that leaving it blank keeps the manual path.
- **Camera model search tooltip** — added inside the `ax-cmp-search` div, after the combobox `<input>`, before the listbox: explains that the search is optional and the manual path is unchanged.
- **Units tooltip** — added to the model-loaded `ax-units-row` in `CamerasField`, between the units input and the "units ×" text.
- **Sensors per camera tooltip** — added in the same row, between the sensors button/input and the "= N" derived display.
- **Video Streams (model-loaded) tooltip updated** — the existing placeholder text ("Units of this camera model…") was replaced with the Step-5 copy: "Total camera feeds for this group, calculated as units times sensors per camera. This is what bandwidth and storage multiply by." The no-model-path Video Streams tooltip is unchanged.
- **FAQ item added** — "Camera Model Lookup" inserted before the existing "Video Streams" item in the "What you enter" column. Covers: optional lookup, units vs. sensors distinction, concrete 10-unit × 4-sensor = 40-stream example, resolution auto-fill with editability, and "model not found" graceful fallback.
- **House rules** — no em dashes; no "not X but Y" constructions; "validated" not used (not applicable here). All copy peer-checked against the house rules in the brief.

### Verification gates

- `npm run build` clean (18 routes, TypeScript + Compiled pass).
- `npx eslint src/app/(app)/calculator/calculator-form.tsx` 0 errors.
- No browser verification performed: the calculator is auth-gated and the live model-picker path requires the not-yet-deployed search RPC (matching the standing practice from Step 3).

---

## 2026-06-16 — Phase 10 Step 3: calculator camera-model picker + units/sensors + round-trip (authored, build-verified)

### Work done

Added the per-group camera-model picker, the units/sensors decomposition, and full round-trip persistence to the calculator. Authored and verified locally (build / lint / tests); nothing pushed, migrated, or committed.

- **State model (`calculator-form.tsx`).** Extended the `Group` type and `newGroup()` with five fields: `cameraVendor`, `cameraModel` (null = no model loaded), `units` (default 1), `sensorsPerCamera` (default 1), `cameraModelModified` (default false). `cameras` stays the engine input and payload field; on the model-loaded path it is kept equal to `units × sensorsPerCamera` by the load/units/sensors handlers, so the compute map and submit payload need no change. No-model path is byte-identical to before (the original direct-cameras input).
- **Picker UI, inline in the group header.** New `CameraModelPicker` component: a vendor select (Axis | Hanwha | Avigilon, none hidden) gating a minimal accessible combobox (role=combobox / listbox / option, arrow + enter + escape keys, debounced 200ms, stale-response guard). Result rows show model + resolution bucket + sensor count. On select it fills `resolutionIdx` (via `mapPixelsToBucket`, reused not reimplemented), sets `sensorsPerCamera = sensor_count`, resets `cameraModelModified=false`, recomputes `cameras`, and prefills the group name only when it is still the default `Camera Group N`. A provenance chip ("from {vendor} {model}", with a subtle "· modified" state and a detach control) replaces the search box once a model is loaded. CODEC is never auto-filled. A null pixel→bucket map (impossible with the Axis seed; defensive) leaves resolution unchanged and shows a non-blocking notice.
- **Units/sensors cell (`CamerasField`).** On the model-loaded path the Video Streams cell renders "{units} units × {sensors} sensors = {cameras}"; units is a free numeric input (same `numericDrafts` in-progress-typing pattern as cameras/fps, key `${id}.units`), sensors is read-only with an explicit edit affordance. Overriding the auto-filled resolution OR sensors after a model is loaded sets `cameraModelModified=true`. Detaching the model unlocks the fields, clears vendor/model, resets sensors→1 and modified→false, and is non-destructive (name and current resolution kept).
- **Data access (constraint #1).** Alias search runs through the IMMUTABLE helper `public.camera_aliases_text(model_aliases)` inside a new `SECURITY INVOKER` RPC `public.search_camera_specs(p_vendor, p_query, p_limit)` (migration `20260616000001`, paired rollback `phase-10-step-3-rollback.sql`), so both Step-1 trigram indexes are used. The form calls it via a `searchCameraModels` server action (the app's authenticated-read path), debounced. RLS still applies. The RPC is **authored, not deployed** — it must land via the gated `db push` before the picker returns results.
- **Persistence round-trip.** Submit payload (`calculator-form.tsx`) sends the five fields per group plus the derived `cameras`. `actions.ts` `groupSchema` parses them (all default cleanly on absent); they bank into `input_state` (raw, via `groups: input.groups`) and `groups_payload` (resolved, for Step-4 display). `rehydrate.ts` gained the coerced readers: `InitialGroup` + `GROUP_DEFAULTS` + `normalizeGroup` (vendor to the fixed three or null, model to non-empty string or null, units/sensors finite ints ≥1, modified strict boolean) and `extractBankedGroups`/`fromStoredSubmission` prefer the banked copy over raw (same pattern as resolution/codec/complexity). `cameras` rehydrates from its banked value and is never recomputed from units × sensors. Pre-feature rows default to no-model with cameras preserved.
- **No `INPUT_STATE_VERSION` bump.** The five fields default cleanly on absent (null/null/1/1/false), the same default-on-absent approach used for `recordingMode`, so the version stays 1. Confirmed: no bump.

### Verification gates

- `npm test` 91/91 (5 new camera-field cases in `rehydrate.test.ts`: pre-feature defaults with cameras preserved, full five-field round-trip preferring banked, raw fallback, bad-value coercion, sensor-ceiling clamp; plus the existing default-group `deepEqual` updated for the five new fields).
- `npm run build` clean (Compiled + TypeScript pass, 18 routes); `npx eslint` on the four changed TS/TSX files 0 errors.
- Browser verification deferred: the calculator is auth-gated and the live typeahead depends on the not-yet-deployed search RPC against the cloud DB (which this task must not touch), matching the journal's standing practice of leaving auth-gated / live-side-effect UI checks for an authenticated session.

### Decisions captured

- [`0063-camera-picker-data-access-and-state-model.md`](./decisions/0063-camera-picker-data-access-and-state-model.md)

---

## 2026-06-15 — Phase 10 Step 2: Axis camera seed (loaded)

### Work done

Loaded the first vendor camera library into `camera_specs`: 26 currently-shipping fixed Axis cameras, datasheet-verified.

- **Loader `scripts/load-camera-specs.ts`.** Validates the seed with the shared `validate-camera-specs.ts` rules as a hard gate, prints a new/update preview, requires a typed CONFIRM, and upserts idempotently on the `(vendor, model)` natural key. Modeled on `update-comparison-data.ts` / `push-prices.ts`.
- **Backup coverage.** Added `camera_specs` to `scripts/backup-tables.ts` so the standard pre-load backup gate covers the camera library.
- **Data sourcing.** Used an LLM-generated Axis catalog as a candidate inventory only, then verified every model against its axis.com datasheet/product page for native pixel resolution, shipping status, and sensor count (fanned out across the M / P-box / P-multisensor / Q-V lines). Native `max_width x max_height` is read from the datasheet, never converted from marketing MP. `source_url` + `as_of_date` recorded per row. Seed file: `data/axis-camera-specs.json`.
- **Curation.** Dropped EOL models (P3265/P3267/P3268-LVE, P1465/P1467/P1468-LE, P3727-PLE, M1075-L, M2026-LE Mk II), dropped P3827-PVE (only a stitched panorama resolution published, no per-sensor pixels), and — by review decision — excluded thermal (Q1961-TE) and PTZ/broadcast (Q6088-E, Q6135/Q6325/Q6225-LE, V5925, V5938) from the phase-1 fixed-camera library. Criteria captured in ADR 0062.
- **Gated load.** Pre-load backup `backups/pre-axis-camera-seed-*.json` (camera_specs 0 rows before load); dry-run clean (26 new); CONFIRM load via stdin upserted 26 rows; verified by re-running the dry-run (0 new / 26 update, idempotent).

### Detours & fixes

- **Marketing MP is not native pixels.** The candidate catalog quoted MP tiers (4MP, 5MP, ...); since one MP tier maps to multiple RESOLUTIONS buckets (the round-up case from ADR 0058), each model's native pixel dimensions were re-read from the datasheet rather than derived. Several differed from the catalog's implied resolution.

### Decisions captured

- [`0062-camera-seed-curation-criteria.md`](./decisions/0062-camera-seed-curation-criteria.md)

---

## 2026-06-15 — Phase 10 Step 1: camera_specs migration + validator (deployed)

### Work done

Authored the Phase 10 Step 1 build item as a stop-and-flag, then deployed it to cloud after review. The RLS policy (read-open / admin-write) and the newly-enabled `pg_trgm` extension were reviewed and approved before the push.

- **Migration `20260615000002_phase10_camera_specs.sql`.** New table `camera_specs` mirroring the `product_specs` reference-table pattern. Columns: `id` (uuid PK `gen_random_uuid()`), `vendor` (text, CHECK in Axis | Hanwha | Avigilon), `model` (text), `model_aliases` (text[] default `'{}'`), `sensor_count` (int CHECK >= 1), `max_width` / `max_height` (int CHECK > 0), `sensor_detail` (jsonb null), `currently_shipping` (bool default true), `source_url` (text null), `as_of_date` (date null). Natural key `unique (vendor, model)`. No `created_at` / `updated_at` — the sibling `product_specs` carries neither.
- **RLS.** SELECT open to `authenticated` (`using (true)`, mirroring `product_specs_select_all`); INSERT / UPDATE / DELETE admin-only via `public.is_admin((select auth.uid()))`, wrapped per the 2026-06-15 InitPlan consolidation (ADR 0055). Privileges granted to `authenticated` and gated by the policies, matching how `submissions` exposes admin writes. `anon` gets nothing.
- **Search indexing in the same migration** (keeps Step 3 pure UI): enabled `pg_trgm` (first use in the project — only `pgcrypto` was enabled before), GIN trigram on `model`, GIN trigram expression index on `array_to_string(model_aliases, ' ')`, and a btree on `vendor`.
- **Paired rollback `supabase/rollback/phase-10-step-1-rollback.sql`** drops the policies, indexes, table, and `pg_trgm` (which this migration created). Carries a note to remove the `drop extension` line if any later migration starts depending on `pg_trgm`.
- **Shared mapping `src/lib/calculator/camera-resolution.ts`.** `mapPixelsToBucket(width, height)` resolves native pixels to a RESOLUTIONS bucket under the Option C round-up rule (ADR 0058), returning null when pixels exceed the largest bucket (29MP). Single source of truth: both the validator and the Step-3 loader import it. Reads `tables.ts` read-only.
- **Validator `scripts/validate-camera-specs.ts`.** Gates a JSON seed file before any admin load (JSON, not CSV, because `model_aliases` and `sensor_detail` are nested — matches `data/server-specs.json`). Checks vendor set, non-empty model, alias array shape, `sensor_count >= 1`, positive integer dimensions, pixel-to-bucket mapping via the shared function, boolean/date/URL/JSON shape of optional fields, and `(vendor, model)` uniqueness across the file. Exit 0 clean / 1 violations / 2 crash, in the `[PASS]`/`[FAIL]` style of `validate-prices-sheet.ts`.
- **ADRs 0057 and 0058** promoted from Proposed stubs to full Accepted ADRs (Context / Options considered / Decision / Consequences).

### Detours & fixes

- **`array_to_string` is not immutable; the alias trigram index was rejected on push.** The first migration draft built the alias GIN index directly over `array_to_string(model_aliases, ' ')`. `supabase db push` failed at that statement with `ERROR: functions in index expression must be marked IMMUTABLE (SQLSTATE 42P17)` — `array_to_string` is only catalog-marked STABLE because its general form can depend on element output functions, even though for a `text[]` with a constant separator the result is genuinely immutable. The migration runs in a transaction, so it rolled back atomically (no table, no `pg_trgm`, no partial index); the earlier `20260615000001` consolidation had already committed in its own transaction. Fixed by wrapping the join in an `IMMUTABLE` SQL helper `public.camera_aliases_text(text[])` and indexing over that; the rollback now also drops the helper. Step-3 alias search must query through the same helper for the planner to use the index.
- **Type guard did not narrow through a boolean variable.** First draft assigned `const widthOk = isPosInt(r.max_width)` then branched on it; TypeScript does not narrow an object property through a separate boolean, so `mapPixelsToBucket(r.max_width, ...)` failed the build type-check (`unknown` not assignable to `number`). Inlining the guard into the `if` condition restored narrowing. Lint and build clean after the fix.
- **Cached Supabase CLI creds were stale at deploy time.** `supabase link` failed with `{"message":"Unauthorized"}` (expired Personal Access Token) and `supabase db push` failed SASL auth (stale DB password) — the cached credentials that worked for the Phase 8 push had been invalidated by account churn. Fixed per RUNBOOK step 5: `supabase login --token sbp_...` with a fresh PAT, then `SUPABASE_DB_PASSWORD='...' supabase link --project-ref ...`. Neither the Vercel/GitHub user change nor the Pro upgrade touches these; they are independent credentials.
- **`test-rls.ts` 12g failed on first run from leftover persona state.** The new admin-write assertion ran after test 8c, which suspends `adminPersona` and never restores it, so `is_admin` (which requires `status = 'active'`) correctly returned false and the admin INSERT was blocked. Policy was right; the test reactivates the admin before 12g.

### Verification gates

- `npm run build` clean (type-check passes); `npx eslint` on the new TS files 0 errors.
- Validator run against hand-made samples: clean 2-row file exits 0; a 4-row file with a bad vendor, empty model, malformed aliases, `sensor_count` 0, negative dimension, oversized pixels, bad URL, bad date, and a duplicate key exits 1 reporting all 9 violations. The 4MP-overlap dimension 2688x1520 maps to its exact bucket and passes. Samples not committed.
- Deployed against cloud (the cloud-only workflow): pre-push backup `backups/phase-10-step-1-*.json` (products / submissions / partners); `supabase db push` applied `20260615000001` (the RLS consolidation, also previously deploy-pending) then `20260615000002` (camera_specs). `scripts/test-rls.ts` all green — the existing assertion set unchanged (confirms the consolidation is authorization-neutral) plus new `camera_specs` assertions 12a-12g: partner and internal users read OK; partner, internal, and suspended-admin writes blocked; active-admin write OK.

### Decisions captured

- [`0057-camera-specs-table-design.md`](./decisions/0057-camera-specs-table-design.md); [`0058-option-c-sizing-and-pixel-bucket-round-up.md`](./decisions/0058-option-c-sizing-and-pixel-bucket-round-up.md)

---

## 2026-06-15 — Phase 10 planned: camera-model calculator lookup (scope locked)

### Work done

Locked the scope for Phase 10. No code yet; details recorded here to survive session-compaction and context switches.

- **Goal:** let a partner or internal user load a camera by vendor and model in each calculator group, auto-filling resolution and sensor count. Users work the way they think, by camera model, and the calculator responds with a large camera library behind it. Optional everywhere; the existing free-text camera-group-name path is preserved without change.

- **Data model:** a new Supabase table `camera_specs` (planned) mirrors the `product_specs` pattern. RLS: read-open to authenticated, admin-only write. Columns: `id`, `vendor` (Axis | Hanwha | Avigilon), `model`, `model_aliases` (text[], for search), `sensor_count`, `max_width`, `max_height` (native pixels of the highest-MP sensor), `sensor_detail` (jsonb, nullable; per-sensor breakdown stored but unused by phase-1 math), `currently_shipping` (bool, seed filter only), `source_url`, `as_of_date`.

- **Sizing rule (Option C):** every sensor on a model is sized at that model's highest-MP sensor. Conservative by design. Resolution maps by native pixel count (width x height) rather than marketing MP, because several MP tiers correspond to two distinct RESOLUTIONS buckets at different pixel counts; when a model's pixels fall in the overlap range, the higher-pixel bucket is chosen (round up).

- **Engine impact:** none. The calculator engine consumes a single `cameras` integer, confirmed in `compute.ts` via `GroupInput.cameras`. Units x sensorsPerCamera resolves to `cameras` before the engine sees it. No change to `compute.ts` math.

- **UI, inline per group card:** Camera Group name (free text, unchanged), vendor select, model search. The vendor select gates and filters the model typeahead, preventing brand mistypes. On model select: resolution bucket set but editable with a provenance chip; sensors-per-camera set from `sensor_count`, editable on demand, defaulting to 1 on the no-model path; camera total shown as "units x sensors = total". CODEC is not auto-filled; a camera's supported codecs do not determine the recording codec. "Model not found" is the graceful no-match; nothing is wiped on clear.

- **Persistence:** four nullable per-group fields (`cameraVendor`, `cameraModel`, `units`, `sensorsPerCamera`) round-trip through `input_state` (raw, for rehydration) and `groups_payload` (resolved, for display). No `INPUT_STATE_VERSION` bump, using the default-on-absent approach matching `recordingMode`. No migration to the calc path; both are existing JSON columns. `normalizeGroup()` and `extractBankedGroups()` gain coerced readers.

- **Everywhere it shows:** camera vendor and model always render on the System Estimate PDF camera schedule and on the submission detail view; FAQ and tooltips updated for the new fields. Not sent to Pipedrive (the deal already receives computed values).

- **Acquisition (seed pipeline):** vendor-primary sources only; fixed-sensor cameras only (configurable-multisensor models such as Avigilon H5A are excluded from phase 1); currently-shipping models only as a seed filter. Per-model extract: vendor, model, `model_aliases`, `sensor_count`, `max_width` x `max_height`, `sensor_detail` (jsonb), `source_url`, `as_of_date`. A planned `validate-camera-specs.ts` checker gates every row before any admin-only load, verifying: vendor in the allowed three, `sensor_count` >= 1, plausible pixel ranges, pixels map to a real RESOLUTIONS bucket, no duplicate model codes. Vendor order: Axis, then Hanwha (via Hanwha's own price-list spreadsheet with datasheet backfill for pixel dimensions and multisensor exclusion), then Avigilon. Each vendor is a separately reviewed seed file.

- **Build order (planned):** Step 1: `camera_specs` migration and validator (RLS-touching, stop-and-flag). Step 2: Axis seed (reviewed, admin-load). Step 3: calculator picker UI, units and sensors inputs, round-trip. Step 4: camera column folded into the unified PDF rework alongside the Project Quote work (see entry below). Step 5: FAQ and tooltips. Step 6: Hanwha then Avigilon seeds. The camera feature is usable on Axis data after Step 3.

### Decisions captured

ADRs to be authored at build time (stubs created now, status Proposed):

- [`0057-camera-specs-table-design.md`](./decisions/0057-camera-specs-table-design.md)
- [`0058-option-c-sizing-and-pixel-bucket-round-up.md`](./decisions/0058-option-c-sizing-and-pixel-bucket-round-up.md)

---

## 2026-06-15 — Project Quote planned: portal-rendered unified proposal + quote (scope locked)

### Work done

Locked the scope for the Project Quote feature. No code yet; details recorded here to survive session-compaction and context switches.

- **What it is:** a single internal-only document that unifies the portal's sizing half (parameters block, camera schedule with Phase 10 models, capacity bars, primary-server hero) with the commercial half (line-item products, prices, discounts, totals, terms) read live from the linked Pipedrive deal. Replaces the current manual Google-Docs-template-plus-merge-fields quote flow, which requires per-user template installation, manual field sync, and manual sharing. Name: "Project Quote".

- **Pricing direction:** prices flow Pipedrive to portal only. The portal reads the deal's already-computed line-item values and totals and displays them verbatim. Line-item order is preserved as Pipedrive holds it (deliberate). No-price/no-discount info lines (for example, legacy $0.00 warranty rows on old deals) render with product code, name, and qty only; price, %-off, discounted-price, and subtotal cells are blank. New deals no longer use such lines.

- **Sizing source:** the sizing half comes from the portal submission only. The deal's custom sizing fields are not read by the Project Quote. This keeps sizing edits in the portal calculator and is consistent with making the portal the single authoring path for all quotes.

- **New integration:** the portal currently only writes to Pipedrive. The Project Quote adds a net-new read path: the deal's product line items and the linked organization and person fields. This is the one genuinely new external-API surface; built and tested in isolation against a real deal before any UI wiring (stop-and-flag).

- **Authoritative linkage:** the stored `pipedrive_deal_id` on the submission (captured from the API at deal creation) is the decider. Deal-ID-in-deal-name is a rep-facing convenience and is never parsed by the portal. One submission maps to one deal; a separate deal for the same project is a separate submission, matching current observed behavior.

- **Enforcement by construction:** a Project Quote can only be generated for a submission the portal created and whose deal id it stored. Manually-created Pipedrive deals have no portal submission to generate from, which routes internal users through the portal without requiring an explicit guard. Generation refuses cleanly when the deal has zero product line items (empty-deal guard).

- **Versioning and snapshot:** on generate, the portal pulls the deal live, snapshots the full pulled commercial data plus the in-force T&Cs version into a new `project_quotes` row (planned table), and assigns the next version number. "Current" is derived as the latest version (no mutable flag stored), so there is no demote step and no concurrency race. Viewing or downloading any existing quote re-renders deterministically from its stored snapshot and never from a live pull. "Make New Project Quote" is the only action that pulls live. Identifier format: DealID-V#-date. Validity is 7 days computed from generation date via a single configurable value (may shorten); validity renders on every PDF and is never stored as a flag.

- **Storage decision:** store the snapshot data (JSON) and re-render on demand. This is a scoped supersession of ADR 0017's no-storage stance. System Estimates remain render-on-read from the local submission row. Project Quotes require a stored snapshot because they capture external, mutating Pipedrive state at a point in time and must reproduce the exact numbers and terms that were presented. A later PDF-template change would re-render an old snapshot with the new layout but identical numbers and terms, which is acceptable for a quote; the numbers and terms are what bind. Storing rendered bytes is held in reserve if exact visual fidelity of historical quotes is later required; Supabase Storage is available on the upgraded Pro tier.

- **Shared PDF rework:** the PDF template is reworked exactly once. Phase 10's camera-schedule column and the Project Quote's new sections (line-item table, totals, partner block, verbatim version-stamped T&Cs) land together in that single rework.

- **Build order (planned; steps continue the Phase 10 sequence):** Step 4: Pipedrive read integration (stop-and-flag). Step 5: `project_quotes` snapshot schema and unified PDF rework, where Phase 10's camera column converges. Step 6: internal-only Generate button, empty-deal guard, version and expiry and snapshot wiring, and email-back to the deal.

### Decisions captured

ADRs to be authored at build time (stubs created now, status Proposed):

- [`0059-project-quote-architecture.md`](./decisions/0059-project-quote-architecture.md)
- [`0060-snapshot-storage-for-project-quotes.md`](./decisions/0060-snapshot-storage-for-project-quotes.md)
- [`0061-project-quote-versioning-and-derived-current.md`](./decisions/0061-project-quote-versioning-and-derived-current.md)

---

## 2026-06-15 — Price Book above-the-fold layout compression

### Work done

Layout-only refactor of the Price Book page. No logic, API, or Supabase changes.

- Hero band padding reduced from ~40px to 20px top and bottom.
- Hero description trimmed from a 5-sentence paragraph to 2 lines, preserving the four core differentiators (purpose-built, H.265, camera count, margin).
- "Effective From" date moved inline with the "View all" link in the hero meta row.
- Enterprise Grade bullets changed from 3-column to `grid-cols-2` with 8 items. "NDAA Compliant" and "American Made" combined into a single bullet to hit the 2x4 grid.
- H.265 feature block moved from a full-width band below Enterprise Grade to the left 38% column of a new two-column row (`grid [grid-template-columns:38%_62%]` or flex equivalent). Enterprise Grade occupies the right 62%. H.265 column background set to `#1E4E8C`.
- Net result: intro section height reduced from approximately 650px to approximately 380px; products visible approximately 280px sooner on a standard desktop viewport.

### Decisions captured

- [`0056-price-book-above-fold-layout-compression.md`](./decisions/0056-price-book-above-fold-layout-compression.md)

---

## 2026-06-15 — RLS performance-advisor consolidation (authored, deploy pending)

### Work done

- Authored migration `20260615000001_rls_perf_consolidation.sql` to clear the Supabase Performance Advisor WARNs on `partners` / `products` / `submissions`. Two lints, both PERFORMANCE-only, no authorization change:
  - **`auth_rls_initplan` (11 WARNs)** — wrapped every bare `auth.uid()` as `(select auth.uid())`, including the argument to the `is_admin`/`is_internal` helpers, so the planner hoists it to a once-per-statement InitPlan instead of per-row.
  - **`multiple_permissive_policies` (8 WARNs)** — collapsed each over-subscribed role+action into one OR'd PERMISSIVE policy: `partners` SELECT (2→1, `partners_select_self_admin_internal`), `submissions` SELECT (3→1, `submissions_select_authorized`), `submissions` UPDATE (2→1, `submissions_update_authorized`), `submissions` DELETE (2→1, `submissions_delete_authorized`). Permissive policies OR together, so the merge is byte-equivalent in authorization. The DELETE draft gate (ADR 0037) is preserved on the self branch only: `(own AND draft) OR admin`.
- Re-scoped the two Phase 8 SELECT policies (`submissions_select_internal`, `submissions_select_on_behalf_target`) to `to authenticated` while merging — they had been created without a `to` clause, applying to PUBLIC, which is what produced the extra per-role lint rows (`anon`, `authenticator`, `dashboard_user`, …). Behaviour-neutral: `anon` holds no table grant on `submissions` and `auth.uid()` is null for it.
- Paired rollback `supabase/rollback/rls-perf-consolidation-rollback.sql` restores the exact pre-consolidation policy set.
- Triaged the rest of the advisor output and deliberately took **no** action: the 5 `unused_index` INFOs are the known small/young-DB false signal (seq scans on tiny tables) — the indexes back real filter columns and stay; `auth_db_connections_absolute` is a dashboard toggle that only matters on instance upsize; the two `is_admin`/`is_internal` SECURITY DEFINER WARNs are minor info-disclosure, not escalation, and revoking EXECUTE from `authenticated` would break the policies that call them.

### Detours & fixes

- **`server_specs` not touched.** It carries an identical bare-`auth.uid()` policy in the initial schema and looked like a fix candidate, but it was dropped in `20260521190350` (`drop table ... cascade`) during the SKU-PK redesign, so no policy exists and the advisor never flagged it.

### Verification gates (PENDING — for the next work pass)

- Not yet deployed. Per the cloud-only workflow, the next pass runs: `backup-tables.ts` → `supabase db push` (this one migration) → `scripts/test-rls.ts` against cloud. Authorization is unchanged, so the existing 8x assertion set (own/admin/internal/on-behalf SELECT, draft-gated DELETE, no cross-partner leak) should stay green with no test edits; confirm before reporting done.

### Decisions captured

- [`0055-rls-policy-consolidation-and-initplan-wrapping.md`](./decisions/0055-rls-policy-consolidation-and-initplan-wrapping.md)

---

## 2026-06-12 — Calculator project panel: layout, pending state, save confirmation

### Work done

Three UI/client-state fixes to the calculator project panel (`calculator-form.tsx`, `calculator.css`, `icons.tsx`). No engine, RLS, migration, or action-logic change.

- **Fix 1 — three-band layout.** Re-laid the bordered `.ax-gl` panel from a single five-across flex row (which left vertical dead space) into three stacked bands. Band 1 (internal only): an `On behalf of` header with an `internal only` tag, then two equal-width selects (Company / Partner user) in a grid, with the not-onboarded fallback now behind a subtle `+ Company not onboarded? Add a new name` text link that reveals the New company name input inline in its place. Band 2: one row of Project name (widest) / Which VMS? / Retention (narrow, `days` suffix), with the Add-ons checkboxes on a slim line below. Band 3: a divider, a muted hint on the left, Reset + primary button on the right. Non-internal users never render Band 1, so the panel opens at Project name.
- **Fix 2 — pending state repair.** Root cause: the Phase 8 commit (`7cc0eb3`) swapped the working `flushSync`-painted `isSaving` for `useActionState`'s `isPending` to clear the lint, but per the 2026-06-05 fix (`756ba50`) a transition's pending flag never paints before the server action's synchronous payload serialization, so the spinner stopped appearing. Restored the immediate paint via `flushSync(() => setIsSaving(true))` and switched to a local `useState` submit state driven through `useTransition`, clearing `isSaving` from the transition callback — never a `useEffect` — so `react-hooks/set-state-in-effect` stays clean (same pattern as the admin `EditableName` rework).
- **Fix 3 — above-the-fold confirmation.** On success the action band shows a green `Estimate saved and sent to Arxys` bar with a `View report PDF` link (opens `/api/submissions/[id]/pdf` in a new tab), locks the primary button into a disabled `Saved` state, and offers `Start new project` (full reset). Errors render in the same band. Built from `submitState.submissionId`, which the action already returned — no `actions.ts` change. Added a `CheckIcon`.

### Detours & fixes

- **Removed the auto-scroll-to-results effect.** The old `useEffect` smooth-scrolled to the recommendation box on success. That fights Fix 3's goal (keep the success signal next to the button without scrolling), so it was dropped along with its `resultRef`. The full recommendation panel still renders below for detail; the action-band bar is the primary signal.
- **Em-dash note for the audit gate.** The only em dashes in changed strings are the decorative `— Select … —` empty-option placeholders, matching the three existing sibling selects (house style, not prose). The new `— Select a company first —` follows that convention; all newly authored prose is em-dash-free.

### Verification gates

- `npm run build` clean; `npm test` 86/86; `npx eslint` (changed TSX files) 0 errors incl. no `set-state-in-effect`; changed-string em-dash + no-ai-slop audits clean (see note above).
- In-browser layout/save verification is auth-gated and the save path fires live Pipedrive + email side effects, so the manual checklist (internal three-band render, partner panel without Band 1, full pending state, success bar + working PDF link, Start new project reset, `/calculator?revise={id}` rehydration) is left for an authenticated session rather than triggering real submissions from a dev login.

---

## 2026-06-12 — Phase 8: per-user on-behalf target visibility

### Work done

- Closed the gap from ADR 0045: a partner the work is prepared *for* can now view and revise it from their own account. Per-user, read-only.
- **RLS** — one additive SELECT policy `submissions_select_on_behalf_target`: `using (on_behalf_of_partner_id = auth.uid())`, mirroring `submissions_select_own_or_admin`'s caller mapping (`partners.id IS auth.uid()`). Permissive, OR's with the two existing SELECT policies; no insert/update/delete change, no new column. Migration `20260612155238_on_behalf_target_visibility.sql` + a paired rollback that drops exactly this policy.
- **Picker** — replaced the free-text "On behalf of" datalist with a company → user selector (active, non-internal partners only, emails joined from `auth.users` via the admin client). Submit sends `on_behalf_of_partner_id` directly; the action re-verifies the id is active + non-internal before binding the FK, dropping the old company-name `ilike` match. Free-text entry retained as a clearly-separate "company not onboarded yet" fallback (sets `on_behalf_of_company_name` only — org-only, no FK, no visibility).
- **Partner-side marker** — on-behalf rows surface in the target's `/submissions` pipeline with a "Prepared by Arxys · {rep}" badge. The page distinguishes incoming (FK = viewer, creator ≠ viewer) from outgoing on-behalf rows and suppresses the self-company "on behalf of" label on incoming ones.
- **test-rls.ts** — added 8h–8k: target A can SELECT the row, B cannot (no leak), A can read it for the revise path, A cannot UPDATE the source in place. Seeded with `partner_id = internalPersona` so existing teardown cleans it.

### Detours & fixes

- **No local Supabase (Docker down) + cloud-only env** meant `test-rls.ts` could not go green without applying the policy, which is the gated `db push` itself. Resolved by approval: ran the pre-push `backup-tables.ts` (products 36 / submissions 13 / partners 35), `supabase db push` (only this one migration pending; CLI used cached credentials), then `test-rls.ts` against cloud — all assertions PASS, including the unchanged 8d–8g internal-read set.

### Verification gates

- `npm run build` clean (18 routes); `npm test` 86/86; `npx eslint` (6 changed files) 0 errors; `test-rls.ts` all PASS (8h–8k new + 8d–8g unchanged + 8g no self-serve leak).
- Scope guard held: no mutating-policy change, `submissions_select_internal`/`_own_or_admin` byte-for-byte unchanged, no new column, no self-serve visibility change, calc engine / PDF / Pipedrive deal-field writes untouched.
- Embed audit: all three `partners!` embeds were already pinned to `submissions_partner_id_fkey`; the two partner-facing read paths use no embed. No new pinning required.

### Decisions captured

- [`0054-on-behalf-target-visibility.md`](./decisions/0054-on-behalf-target-visibility.md); [`0045`](./decisions/0045-on-behalf-of-calculations.md) amended with a forward pointer.

---

## 2026-06-12 — Price/product update run (gated pipeline)

### Work done

- Ran the standing price-push pipeline end-to-end against the canonical Master Sheet (edited beforehand by Andy). Followed the gated procedure: validate → backup → dry-run review → live push.
- **Validation** (`validate-prices-sheet.ts`): exit 0, zero violations. 36 data rows, all SKUs match `VX5-<GROUP>-<TIER>`, no duplicates, all MSRPs valid (numeric / MKT / Call for Quote / empty).
- **Backups** written to `backups/`:
  - Supabase → `manual-2026-06-12T18-56-33-148Z.json` (products 36, submissions 6, partners 34)
  - Pipedrive → `pipedrive-products-pre-step-5-2026-06-12T18-56-39-858Z.json` (1021 products)
- **Dry-run preview**: Supabase 0 new / 32 updated / 4 no-op / 0 removal; Pipedrive 0 new / 32 updated / 942 flagged-for-removal (flag-only, never auto-touched). **New=0 on both targets confirmed no SKU code changed** — all changes were price/description updates to existing SKUs, so nothing was orphaned.
- **Live push** (after explicit go; instruction "ignore all removals" — already the script's default): CONFIRM gate cleared via stdin. Result: Supabase 36 ok / 0 errors, Pipedrive 36 ok / 0 errors. Script upserts the full 36-row sheet idempotently (32 changed + 4 no-op).

### Detours & fixes

- **Backups first failed with `Missing required environment variable`**: the literal commands in the request omitted `--env-file=.env.local`. The validator passed regardless because it only fetches a public CSV. Re-ran the backup + push commands with `--env-file=.env.local` per the RUNBOOK — no script or sheet changes needed.

### Observed (not acted on)

- Several **current-generation `VX5-*` SKUs** sit in the 942 Pipedrive flagged-for-removal list (e.g. `VX5-GPU-2000Ada`, `VX5-V100-28/-36/-44`, `VX5-V200-56/-72/-88`, `VX5-V400-96/-112/-144/-176`, `VX5-V252-DBA`, `VX5-RAM-16GB`, `VX5-V*-NCD` customs) — they exist in Pipedrive but are absent from the 36-row Master Sheet. Flagged only; surfaced to Andy as a possible sheet-coverage gap, not resolved here.

---

## 2026-06-11 — AUDIT-01 L-1 + L-2 + L-6: hardening batch

### Work done

Closed [AUDIT-01](../AUDIT-01-security.md) findings **L-1**, **L-2**, and **L-6**.

**L-1 — raw DB/Supabase error messages replaced with generic client-facing string:**

- New helper [`src/lib/errors/safe-message.ts`](../src/lib/errors/safe-message.ts):
  `dbError(err, context)` — `console.error`s the full error server-side with a
  context label, returns `"Something went wrong — please try again."`.
- Applied to 23 raw `error.message` / `.message` returns across 9 files:
  `admin/partners/actions.ts` (11 sites), `admin/submissions/actions.ts` (2),
  `submissions/actions.ts` (5), `calculator/actions.ts` (2),
  `reset-password/actions.ts` (1), `api/admin/forecast/xlsx/route.ts` (1),
  `api/price-book/xlsx/route.ts` (1).
- Three server-component pages (`admin/partners/page.tsx`,
  `submissions/page.tsx`, `admin/submissions/page.tsx` ×2) use inline
  `console.error` + static string instead of the helper (JSX context; no
  function call needed).
- Left alone: zod `issue.message` field-validation feedback (safe and useful),
  `PipedriveError.message` (application-level controlled error), and any
  `.message` already only going to `console.error`.
- The `invitePartner` fallback branch (`Invite failed: ${msg}`) was replaced
  with `dbError()`; the regex branch that detects "already exists" and shows a
  crafted user-friendly message was preserved unchanged.

**L-2 — `api/comparison/pdf` now validates its body and wraps the render:**

- [`api/comparison/pdf/route.ts`](../src/app/(app)/api/comparison/pdf/route.ts):
  replaced the compile-time `PdfRequestBody` cast with a `pdfBodySchema` (zod)
  matching all `ComparisonPdfInput` fields with tight bounds (strings max'd,
  `specs` array capped at 50, numeric fields bounded). Returns 400 on validation
  failure. `renderComparisonPdfBuffer` wrapped in `try/catch` → clean 500.

**L-6 — `requireAdmin` in admin/submissions now checks `status === 'active'`:**

- [`admin/submissions/actions.ts`](../src/app/(app)/admin/submissions/actions.ts):
  select widened to `"role, status"`, type annotation updated, `isAdmin`
  condition now `partner?.role === "admin" && partner?.status === "active"` —
  identical to `admin/partners/actions.ts:42` and the other reference gates.

Scope held to L-1/L-2/L-6. `tsc --noEmit` clean (zero new errors).

---

## 2026-06-11 — AUDIT-01 L-3 + L-4: CRM deal-value integrity

### Work done

Closed [AUDIT-01](../AUDIT-01-security.md) findings **L-3** and **L-4**.

**L-3 — comparison deal value now derived from catalog, not client:**

- Reconnaissance confirmed `arxysModelId` is `product_specs.id` (the same table
  the comparison page loads server-side). `arxysMsrp` was `product_specs.msrp`
  passed back through the client — now ignored.
- In [`comparison/actions.ts`](<../src/app/(app)/comparison/actions.ts>): removed
  `arxysMsrp` from `quoteSchema`; added a `product_specs` lookup by
  `.eq("id", input.arxysModelId)` using the existing user-scoped `supabase`
  client (same client already used for partner identity). Returns
  `"Arxys model not found in catalog."` if the ID is absent. `catalogMsrp`
  (from the DB) replaces `input.arxysMsrp` in the `createComparisonDeal` call
  and in both MSRP/deal-value lines of the notification email body.
- In [`comparison-form.tsx`](<../src/app/(app)/comparison/comparison-form.tsx>):
  removed `arxysMsrp` from the `requestComparisonQuote` payload — it is no longer
  part of the server action's contract.

**L-4 — on-behalf ilike wildcard eliminated:**

- In [`calculator/actions.ts`](<../src/app/(app)/calculator/actions.ts>): escaped
  `%` → `\%` and `_` → `\_` in `onBehalfRaw` before passing to `.ilike()`.
  Case-insensitive matching is fully preserved; only LIKE metacharacters in a
  company name are now treated as literals rather than wildcards.

Scope held to L-3 and L-4 only. `tsc --noEmit` clean.

---

## 2026-06-11 — AUDIT-01 M-2: open redirect via protocol-relative `next`

### Work done

Closed [AUDIT-01](../AUDIT-01-security.md) finding **M-2** — the post-auth
redirect target was validated with `next.startsWith("/")`, which admits
protocol-relative URLs (`//evil.com`) that browsers resolve off-site, giving a
crafted `?next=//attacker.tld` link a redirect/phishing primitive on the trusted
domain.

- **New shared helper** [`src/lib/auth/safe-next.ts`](../src/lib/auth/safe-next.ts)
  — `isSafeNext(next)` admits a value only if it starts with a single `/`, does
  **not** start with `//`, and does **not** contain `://`. Centralised so the two
  security-critical call sites can't drift.
- **[`login/actions.ts`](<../src/app/(auth)/login/actions.ts>)** and
  **[`auth/confirm/actions.ts`](<../src/app/(auth)/auth/confirm/actions.ts>)** now
  gate the supplied `next` through `isSafeNext(...)`, falling back to the existing
  `/dashboard` default when it fails. Behaviour for valid relative paths is
  unchanged; only `//host` and `scheme://host` values are now rejected. The
  `invite` → `/reset-password?new=1` special-case in `confirm` is downstream of
  `next` and untouched.

Scope held to M-2 only. `tsc --noEmit` clean for the changed files (pre-existing
test-file type errors unrelated).

---

## 2026-06-11 — AUDIT-01 M-1: registerDealAction auth + identity trust

### Work done

Closed [AUDIT-01](../AUDIT-01-security.md) finding **M-1** — `registerDealAction`
authenticated nothing and trusted client-supplied partner identity, so any
authenticated user could POST forged `companyName`/`partnerEmail`/`partnerId`
and attribute a deal registration to any company in the internal sales
notification. Fixed by mirroring `requestComparisonQuote`'s identity pattern:

- **Auth check added** in [`dashboard/actions.ts`](<../src/app/(app)/dashboard/actions.ts>):
  `getUser()` at the top, returns the action's `{ status: "error" }` shape if
  there's no session ("Not authenticated.").
- **Identity re-derived server-side:** `company_name`/`contact_name` loaded from
  `partners` by `user.id` (`.maybeSingle()`, rejects if missing), email taken
  from `user.email`, partner id from `user.id`. The email builder
  ([`deal-registration.ts`](../src/lib/email/deal-registration.ts)) is unchanged —
  only the *source* of its fields moved from client FormData to the session.
- **Client identity removed entirely:** dropped `partnerId`/`companyName`/
  `contactName`/`partnerEmail` from the FormData reads and from `DealRegSchema`;
  removed the four hidden inputs and the component props from
  [`register-deal-form.tsx`](<../src/app/(app)/dashboard/register-deal-form.tsx>);
  the call site in [`dashboard/page.tsx`](<../src/app/(app)/dashboard/page.tsx>)
  is now `<RegisterDealForm />`. `partner`/`user` are still used elsewhere on the
  page, so nothing was orphaned and the server-rendered page is unaffected.
- **Schema tightened:** `partnerEmail` was `z.string()`; rather than upgrade it to
  `z.email()`, it (and the other identity fields) was removed since email is now
  session-derived. The remaining free-text fields that flow into the email
  subject/body — `projectName` (≤200) and `notes` (≤1000) — already carry length
  caps.

Scope held to M-1 only; no other audit finding touched. `tsc --noEmit` clean for
the changed files (pre-existing test-file type errors unrelated).

---

## 2026-06-11 — Supabase Security Advisor hardening

### Work done

Cleared the function-related Security Advisor findings and captured a piece of
live-DB drift, via migration
[`20260611000001_security_advisor_hardening.sql`](../supabase/migrations/20260611000001_security_advisor_hardening.sql)
(written + `supabase db push`ed to prod):

- **Search path:** pinned `search_path = ''` on `public.set_updated_at`.
- **EXECUTE grants:** revoked `EXECUTE` from `anon` (and defensively `public`)
  on `is_admin`, `is_internal`, `rls_auto_enable`, and `set_updated_at`; also
  revoked `authenticated` on the two trigger/event-trigger helpers. **Kept
  `authenticated` on `is_admin`/`is_internal`** — verified every RLS policy
  using them is scoped `to authenticated`, so they must stay callable.
- **Drift captured:** `rls_auto_enable` (event-trigger fn behind `ensure_rls`,
  auto-enables RLS on new `public` tables) lived only in the live DB. Pulled its
  exact definition into the migration + an `if not exists`-guarded event-trigger
  create, so blank-machine rebuilds are faithful and the revoke can't fail on a
  fresh DB.
- **Leaked Password Protection:** dashboard-only Auth toggle — added to the
  RUNBOOK as a manual step (not code).

### Detours & fixes

- **The old `revoke ... from public` was a no-op.** Prior migrations revoked
  `is_admin`/`is_internal` from `PUBLIC`, yet live grants still showed
  `{anon, authenticated, ...}`. Root cause: Supabase grants `EXECUTE` directly
  to the `anon`/`authenticated`/`service_role` roles via default privileges, not
  through the `PUBLIC` pseudo-role — so revoking `PUBLIC` never touched them.
  Fix: revoke the explicit role names.
- **Event-trigger privilege risk on push.** A naive `drop/create event trigger`
  could fail if the migration role can't manage event triggers. Sidestepped with
  an `if not exists` guard so prod (where `ensure_rls` already exists) runs no
  event-trigger DDL at all; only a fresh rebuild creates it.

### Decisions captured

- [`0053-security-advisor-function-grants.md`](./decisions/0053-security-advisor-function-grants.md)

## 2026-06-11 — Remove SFP28 NIC upgrades from V200 / V250 / V260

### Work done

Dropped the two SFP28 NIC upgrade lines — `VX5-NIC-SFP28` (SFP28 optical NIC
card, $670) and `VX5-NIC-SFP28x10` (2× 10Gb SFP28 transceivers, $300) — from
three families' `upgradeSkus` in [`families.ts`](../src/lib/price-book/families.ts):

- **V200** (`v200`): `["VX5-GPU-A1000", "VX5-NIC-SFP28", "VX5-NIC-SFP28x10"]` → `["VX5-GPU-A1000"]` (GPU upgrade retained).
- **V250** (`v250`): `["VX5-NIC-SFP28", "VX5-NIC-SFP28x10"]` → `[]`.
- **V260** (`v260`): `["VX5-NIC-SFP28", "VX5-NIC-SFP28x10"]` → `[]`.

The family-page Upgrade section is already guarded by `upgradeSkus.length > 0`
([`page.tsx`](<../src/app/(app)/price-book/[slug]/page.tsx>) lines 160 and 336),
so V250/V260 now render with no Upgrades section rather than an empty heading.
The SKU/price rows themselves live in the products table and are untouched —
this only removes the upgrade options surfaced on these three product pages;
V400–V800 keep their SFP28 options. `npm run build`, `npm test` (86 pass),
`eslint` all clean.

## 2026-06-11 — Pipedrive custom field rename (Recording / CODEC / Scene Complexity)

### Work done

Three admin-curated Pipedrive deal fields were renamed in the Pipedrive UI. The
integration matches these fields **by display-name string** (not by hashed API
key): [`CALCULATOR_FIELD_NAMES`](../src/lib/pipedrive/lookups.ts) is matched
against the live `/v1/dealFields` `name` to discover each field's hashed key at
runtime, and the `set("Display Name", …)` call-sites in
[`deal.ts`](../src/lib/pipedrive/deal.ts) look the key up by that same string. A
label rename therefore breaks the name match — the field would be logged as
missing and silently skipped, saving the deal without it. So the rename did
require a code change.

- **Display-name strings updated** in both source files, in lockstep with the
  derived `CalculatorFieldName` union:
  - `Recording` → `Recording New`
  - `CODEC` → `CODEC New`
  - `Scene Complexity` → `Complexity Scene-Motion`
- **Untouched on purpose:** the separate `Recording hours` field (partial-match
  hazard — a naive `Recording` → `Recording New` replace would have corrupted
  it); all numeric **option IDs** (CODEC 138/139/286, Recording 118/119,
  Complexity 287/288/289) — those are keyed by ID and a label rename doesn't
  touch them; the calculator UI's own "Recording" mode selector and the
  codec/complexity *concepts* in the form (not Pipedrive fields).
- **Tests** ([`deal.test.ts`](../src/lib/pipedrive/deal.test.ts)): the
  `CALC_FIELD_KEYS` fixture keys and all assertions updated to the new names,
  including switching `CALC_FIELD_KEYS.Recording` / `.CODEC` dot-access to
  bracket notation (the new names contain spaces).
- **ADR [0041](./decisions/0041-multi-group-pipedrive-field-aggregation.md)**
  amended: an `Amended: 2026-06-11` note added and the three field-name tokens
  in the body rewritten. Older dated JOURNAL entries and the phase-2 planning
  snapshot were **left as historical record** — they describe what was true at
  the time; this entry supersedes them.
- `npm run build`, `npm test` (86 pass), `eslint` on the pipedrive module all
  clean. (Pre-existing unrelated `tsc` noise in `pdf/render.test.ts` and
  `price-book/xlsx.test.ts` is untouched and excluded from the production build.)

### Detours & fixes

- **Old-name strings from the brief didn't exist in the repo.** The rename
  brief listed the old names as `Recording old` / `CODEC old` / `Scene old`, but
  grep (case-sensitive and insensitive, whole repo) found zero matches — the
  code referenced `Recording` / `CODEC` / `Scene Complexity`. Confirmed with Andy
  that these were the real current Pipedrive labels and mapped accordingly,
  rather than assuming a latent skip bug.
- **Test failures after the first pass.** The fixture-key rename broke
  `CALC_FIELD_KEYS.Recording` / `.CODEC` dot-access (the new keys have spaces),
  so those lookups returned `undefined` and four assertions failed. Root cause:
  the initial grep only caught the quoted `"Scene Complexity"` form, missing the
  dot-notation. Fixed by switching to bracket notation.

---

## 2026-06-09 — Human-readable PDF filename + Pipedrive deal title

### Work done

The downloaded estimate's filename ended in the submission UUID and the
Pipedrive deal title was just the project name — neither was scannable.

- **PDF filename** ([`pdfFilename` in render.ts](../src/lib/pdf/render.ts)):
  `Arxys-Report-YYYY-MM-DD-<UUID>.pdf` → `Company - Project - YYYY-MM-DD.pdf`
  (dashes, UUID dropped). Company/project run through `sanitizeFilenamePart`
  (strips `\ / : * ? " < > |` and collapses whitespace) so a name can't break
  the filename. Blank project → "Untitled Project". Both the download route and
  the email attachment pick up the new name (they already pass the full
  `SubmissionPdfInput`).
- **Pipedrive deal title** ([`deal.ts`](../src/lib/pipedrive/deal.ts)):
  `Company Name | Project Name | YYYY-MM-DD` (pipes), "Untitled Project" when
  blank. Added a `submissionDate` field to `DealSubmissionInput`, supplied by
  [`actions.ts`](../src/app/(app)/calculator/actions.ts) from the same
  `generatedAt` the PDF filename uses, so the file and the deal always show one
  date.
- Updated the two title assertions + fixture in `deal.test.ts`. `npm run build`,
  `npm test` (86 pass), `eslint` all clean.

---

## 2026-06-09 — System Estimate PDF: surface new calculator labels + restructure camera schedule

### Work done

The customer-facing System Estimate PDF still spoke the pre-rework calculator
language (tier words "high"/"low", "REC HRS") and its camera-schedule table was
too narrow for the new long descriptive complexity labels. Fixed both —
**labels, copy and layout only; no calculation touched.**

- **Verification gate first.** Traced `groups_payload` → `render.ts` → PDF.
  Found `complexityLabel` and `recordingMode` were already banked at write time
  ([actions.ts](../src/app/(app)/calculator/actions.ts)) but dropped by
  `mapGroups` — the PDF's `GroupsPayload` / `SubmissionPdfGroup` types simply
  omitted them, so it fell back to the legacy `complexity` tier. No upstream
  plumbing needed; the gap was the mapping layer only.
- **Surfaced the banked fields.** Added `complexityLabel` + `recordingMode` to
  [`types.ts`](../src/lib/pdf/types.ts) and the `render.ts` `GroupsPayload` type,
  and mapped them in `mapGroups` with a coarse fallback for legacy rows
  (`fallbackComplexityLabel`, `recordingMode ?? "constant"`). The second PDF
  builder in `actions.ts` (email-attachment path) was updated to pass the full
  label + mode from `r.input` directly.
- **Restructured the camera schedule** ([`SubmissionPdf.tsx`](../src/lib/pdf/SubmissionPdf.tsx))
  from wide per-group rows into two-tier blocks: one column-header row at the
  top; per group a full-width header line (`Group name · N camera streams`,
  count lifted out of its own column); then a full-width 7-column specs row with
  room for the long scene label and the operation-hours text. Totals row stays
  as the bottom summary, now reading "N camera streams" and aligned under the
  Bandwidth/Storage columns.
- **Copy fixes:** scene cell shows the full descriptive label; recording mode is
  folded into the operation-hours cell (`18 (motion 40%)` / `24 (constant)`);
  column header "REC HRS" → "Operation hrs"; footer disclaimer reworded
  "industry-standard compression ratios" → "validated compression modeling"
  (no vendor name, no "certified").
- **Verified** by rendering a 7-group new submission (motion group + six-level
  label) and a legacy submission (null serverSpec, coarse fallback label) to
  PDF — both render correctly, blocks don't split across the page break.
  `npm run build`, `npm test` (86 pass), `eslint` all clean.

### Decisions captured

- [`0052-pdf-reads-banked-complexity-recording-fields.md`](./decisions/0052-pdf-reads-banked-complexity-recording-fields.md)

---

## 2026-06-08 — Calculator field explainers (inline tooltips + FAQ panel)

### Work done

Partners had no in-page guidance for the calculator's many fields after the
recent bitrate/complexity/recording rework — they'd have to ask or guess. Added
plain-speak help everywhere, reusing the existing `Tooltip` (ⓘ) component so
nothing new had to be learned.

- **Filled every tooltip gap** in [`calculator-form.tsx`](../src/app/(app)/calculator/calculator-form.tsx):
  inputs that previously had none (Project Name, Which VMS?, Add-ons + each
  checkbox, Video Streams, Resolution, FPS) and **all** calculated outputs that
  had none (the three summary cards — Total Cameras/Bandwidth/Storage — and the
  four per-group results — Bitrate/Bandwidth/Storage/Daily). The 7 pre-existing
  tooltips were left as-is (already good voice).
- **Output copy is plain-speak + "why it matters"**, deliberately no formulas
  (e.g. Bitrate: "how much data one camera produces per second… resolution, FPS,
  and how busy the scene is all push it up or down").
- **New collapsible FAQ panel** (`<details className="ax-faq">`) at the bottom:
  a two-column "What you enter / What we calculate" bullet reference covering
  every field, ending with a "rough estimate for planning, your Arxys team
  confirms the final sizing" disclaimer. Native `<details>` — no JS, keyboard-
  accessible. Styling added to [`calculator.css`](../src/app/(app)/calculator/calculator.css)
  to match the existing card/tooltip look; collapses to one column ≤1024px.

Verified: ESLint clean on the route; `tsc` shows only pre-existing errors in
unrelated test files. Andy eyeballed tooltips + FAQ in the local preview.

### Decisions captured

No ADR — additive UX using the established tooltip pattern; the "tooltips +
FAQ panel both" and "no formulas in output copy" choices were Andy's calls
captured here rather than as a standalone decision.

---

## 2026-06-08 — Partner onboarding/login fixes

### Work done

Partners reported they couldn't log in, and the admin partners list showed
*"A user with this email address has already been registered"* on Resend. A
read-only diagnostic (`scripts/diagnose-partners.ts`, cross-referencing
`partners` against `auth.users`) confirmed it was **not** DB corruption — 17
partners, 17 auth users, no orphans. Every *external* partner was stranded at
`status='invited'`: six had confirmed + signed in but never reached
`/dashboard`; five never confirmed at all (corporate domains). Internal/admin
accounts had all auto-activated fine.

Root causes and fixes:

- **Onboarding confusion** — invite link logs the user in and drops them on a
  "set password" screen they didn't understand; they abandoned it and then tried
  to "sign in" with a password that never existed. *Fix:* one-page approach with
  clearer copy. Login page gained a "First time here? You don't have a password
  yet" panel and a friendly expired-link banner; `/reset-password?new=1` now
  reads "Create your password" for invitees vs "Set a new password" for
  returners; forgot-password reframed as "Get a sign-in link" that works for
  first-timers too.
- **Single-use tokens burned by email scanners** — `/auth/confirm` ran
  `verifyOtp` on GET, so Safe Links / Mimecast / Proofpoint pre-fetches consumed
  the token before the human clicked. *Fix:* converted `/auth/confirm` to a
  click-through interstitial (page + server action under the `(auth)` group, URL
  unchanged); the token is only verified on the explicit POST. `type=invite`
  routes to `/reset-password?new=1`.
- **Resend was structurally broken** — `resendInvite` re-called
  `inviteUserByEmail`, which Supabase always rejects for an existing user. *Fix:*
  switched to `resetPasswordForEmail` (recovery), which works for any existing
  user; button relabelled "Resend sign-in link."
- **Email copy** — invite + recovery templates (`docs/email-templates/`) now
  state plainly that the user has no password yet and is creating one. These are
  the canonical source and must be re-pasted into the Supabase dashboard.
- **Remediation** — `scripts/resend-onboarding.ts` re-sends working set-password
  links to all 11 stuck partners (dry-run by default, `--send` to fire; `--test
  <email>` previews the flow against one address).

Verified the four auth states render correctly in the dev preview (login panel,
expired banner, interstitial without token consumption, create-password screen)
and that a bad-token POST fails gracefully to `/login?error=expired_or_invalid`.

**Rollout (same day):** confirmed the Supabase dashboard Site URL =
`https://portal.arxys.com` (canonical since the 2026-05-26 cutover) and that the
updated templates were pasted in; sent a `--test` recovery email to
`andy.newbom@arxys.com` and clicked the full chain (branded email → interstitial
→ set-password) successfully; then ran `--send` to all 11 stuck partners — every
address returned ✓, no failures. Also aligned all email-link/logo references in
the repo from the `portal-arxys.vercel.app` fallback to the canonical
`portal.arxys.com` (templates, README, RUNBOOK).

### Detours & fixes

- **"DB issue" was a misdiagnosis** — the `invited` status is a *symptom* of
  never completing set-password, not corruption. The auto-activate (invited →
  active on first app-page load, shipped 2026-05-20) works; the stuck partners
  simply never reached an app page.
- **Dashboard config lives outside this repo** — the token-scanner and
  link-validity fixes depend on Supabase dashboard settings. Verified at
  rollout: Authentication → URL Configuration → **Site URL** =
  `https://portal.arxys.com`; **custom email templates** pasted in with the
  updated copy; redirect allow-list covers `/auth/confirm`. Remaining drift: the
  repo templates' logo URL was changed to `portal.arxys.com` *after* the
  dashboard paste, so a fresh re-paste is needed to make the live email logo
  match (cosmetic — the vercel.app logo still resolves).

### Decisions captured

- [`0051-auth-onboarding-interstitial.md`](./decisions/0051-auth-onboarding-interstitial.md)

## 2026-06-05 — Calculator: control-row layout + UX fixes (post-review)

### Work done

Follow-up polish on the camera-group control row after a UI review of the
recording/complexity rework (entry below).

- **Save hint reworded** — "Configure a camera group below, then save to notify
  Arxys sales." → "Configure all cameras, then save to send the project to
  Arxys for review and a quote." (reflects the actual save-and-quote flow).
- **Complexity column widened** (`wx` 170→212px) so its longest label,
  "Medium detail, high motion", reads in full instead of truncating.
- **Motion/Event % is now a number box, not a slider** — simpler and less
  confusing per the review. Number input (20–100, step 5), disabled and greyed
  under Constant recording (shows 100). Removed the now-dead range-slider
  disabled CSS.
- **Tooltips no longer clip at the card edge** — root cause was
  `overflow: hidden` on `.ax-cam`, which clipped the column-header tooltips
  (the reason their copy had been forced to one line). Removed it and rounded
  the header (`.ax-ch`) top corners and results row (`.ax-cr`) bottom corners
  instead, so the card still reads as a rounded panel while tooltips escape its
  bounds. Verified all three right-edge tooltips render fully within the
  viewport with no clipping ancestor.
- **Control row stays on ONE line** — switched `.ax-cb` to `flex-wrap: nowrap`
  at desktop with shrinkable cells (`flex: 0 1 <basis>`); the ≤1024px breakpoint
  still uses `flex-wrap: wrap` + `flex: 1` for tablet/mobile. Also tightened
  padding (40→20) / gap (16→10) and dropped control font 14→13, and aligned the
  example line + results row padding to the control row.

### Detours & fixes

- **`flex-shrink` doesn't prevent wrapping under `flex-wrap: wrap`** — first
  attempt kept `wrap` and made cells shrinkable, expecting them to compress onto
  one line. They didn't: flexbox wraps overflowing items first and only shrinks
  *within* each resulting line, so Motion/Event % still dangled. The real fix is
  `flex-wrap: nowrap` (shrink-to-fit on one line) for the desktop range, letting
  the existing ≤1024px media query take over below that.
- **Fixed-width fitting was flaky** — the panel's content width fluctuates a few
  dozen px between measurements, so a "just-fits" no-shrink row wrapped
  unpredictably ("regardless of window size"). `nowrap` + shrinkable bases makes
  it width-robust: full size when there's room, graceful compression when tight.

### Verification gates

| Gate | Result |
|---|---|
| Single-line @1440px (panel 1234) | ✅ 8 cells one row, 86px headroom, full Complexity label |
| Single-line @1080px (just above breakpoint) | ✅ one row, Complexity shrinks 212→177, no overflow / no page scroll |
| ≤1024px | ✅ falls back to balanced wrap (tablet layout) |
| Motion number box | ✅ greyed/disabled under Constant; enabled under Motion-only, 40% → storage 2.68→1.40 TB |
| Tooltip clipping | ✅ right-edge tooltips fully within viewport, no clipping ancestor |
| `npm run build` / `npm test` / `npx eslint` | ✅ clean / 86 pass / 0 errors |

---

## 2026-06-05 — Calculator: fix two pre-existing ESLint errors in `calculator-form.tsx`

### Work done

- Drove the Save button's saving state off `useActionState`'s own pending flag (renamed the unused third binding `isSubmitting` → `isSaving`), deleting the redundant `isSaving` `useState`, the status-watching `useEffect` (`react-hooks/set-state-in-effect`), and the now-orphaned `flushSync` import/call — same pattern as `partner-row-actions.tsx`. UX unchanged: the pending flag flips true on dispatch, so the spinner still paints immediately. Verified `eslint` clean, `npm run build` + `npm test` (86/86) green.

## 2026-06-05 — Calculator: re-anchor bitrate engine, six-level complexity, motion/recording rework

### Work done

Re-derived the calculator's math against Milestone's XProtect calculator (the
agnostic-bridge conservative bound) and reworked the recording/motion UX. Did
the math behind a hard verification gate first, then the UI. Files live under
`src/lib/calculator/` and `src/app/(app)/calculator/` (the brief referenced
`src/lib/calc/` — corrected to the real path).

- **Six-level complexity** (`tables.ts`) — replaced the 3 vague levels with six
  descriptive Avigilon-style scene labels (multipliers 1.0 / 1.5 / 2.25 / 3.375
  / 5.0 / 7.0), each carrying an `example` field on the `Complexity` type for
  tooltips/helper text. New default is index 2, "Medium detail, low motion".
- **Codec re-anchor** (`compute.ts`) — `CODEC_BITRATE.h265` 0.07 → **0.037**
  (h264 0.0634, smart 0.0444, derived from H.265 by the prior ratios). The old
  factors ran ~2× hot vs Milestone. Anchored so 4MP (2560×1440)/15fps/H.265/Low
  lands ~1966 Kbit/s.
- **Motion idle floor** (`compute.ts`) — `applyMotionAdjustment` 30% → **20%**
  (`0.2 + 0.8·P`). Documented as a weighted-average bitrate model and that it is
  bitrate-weighting only — it never touches recorded hours (those are
  `recordingPercent` / Operation Hours, left unchanged).
- **Verification gate** (`compute.test.ts`) — new `describe` asserting all six
  levels' per-camera bitrate within ±2% of the audited Milestone numbers (sixth
  = 1966×7.0 = 13762 by construction) plus the 20% floor (motion 20% ⇒ ~708).
  Computed values land at a uniform +1.63% (the conservative bias from rounding
  the factor up to 0.037).
- **UI** (`calculator-form.tsx`, `calculator.css`) — complexity dropdown now has
  an info tooltip and a per-card example line that updates on selection. Added a
  **Recording** mode selector (Constant | Motion-only; no Speedup — out of
  scope). Relabeled Hrs/Day → **Operation** hours (1–24, always active). The
  **Motion/Event %** slider is now 20–100 and is disabled+greyed under Constant
  (which pins motion to 100%), mirroring the Milestone UI.
- **Persistence / round-trip** (`actions.ts`, `rehydrate.ts`) — added
  `recordingMode` to the group schema (defaults `"constant"` for old rows) and
  banked `complexityLabel` in `groups_payload`. Rehydration now resolves
  complexity by unique label first (tier alone is ambiguous across six levels →
  it would collapse the two med/low levels to one), then tier, then raw index.
  Operation Hours and Motion% round-trip via the existing `recordingPercent` /
  `motionPercent` fields, so the PDF, Pipedrive sync, and submission-detail view
  needed **no changes** (they still read those two fields). Server-side, Constant
  pins `motionPercent` to 100 as defense-in-depth against a hand-crafted POST.

### Detours & fixes

- **"One combined hours field" in the brief didn't match the live UI** — the
  form already had separate Hrs/Day and Motion controls. Followed the real
  structure: added the Recording selector and rewired motion gating rather than
  splitting a field that wasn't combined.
- **Complexity round-trip would have silently collapsed** — the existing
  rehydrate resolves complexity by `tier`, but six levels map to three tiers, so
  a re-opened "Medium detail, high motion" quote would have come back as
  "Medium detail, low motion". Fixed by banking and resolving on the unique
  `complexityLabel`; added a regression test proving the disambiguation.
- **No version bump needed** — rehydration *defaults* the absent `recordingMode`
  rather than branching on a version, so `INPUT_STATE_VERSION` stayed 1.
- **Two pre-existing ESLint errors in `calculator-form.tsx`** (unused
  `isSubmitting`; `react-hooks/set-state-in-effect` in the save-spinner effect)
  — confirmed present on `HEAD` via a one-file stash, unrelated to this change.
  Left untouched: the set-state-in-effect fix is a behavioral refactor of the
  save spinner, outside this task's scope. Flagged for a separate cleanup.
- **Browser verification of `/calculator` was initially blocked by the auth
  gate** — the preview session started unauthenticated and there is no static
  dev account. First verified the UI's *data path* via `computeGroup` directly
  (per-level bitrate matches the gate; Motion-only @50%/@20% drops storage to
  60%/36% of Constant; Operation hours scales linearly). Once a session was
  available, completed the live in-browser check: complexity dropdown renders
  all six levels with the example line updating on selection; Low/low shows 1.95
  Mbps and Med/low 4.39 Mbps; switching to Motion-only enables the slider and
  drops storage to 60% at 50% motion; switching back to Constant re-greys it at
  100% and restores storage; zero console errors.

### Decisions captured

- [`0049-milestone-complexity-curve.md`](./decisions/0049-milestone-complexity-curve.md)
  — Milestone curve + codec damping over a vendor blend; six descriptive levels.
- [`0050-codec-bitrate-reanchor.md`](./decisions/0050-codec-bitrate-reanchor.md)
  — re-anchor to the live Milestone audit; 20% motion floor; motion = bitrate
  weighting, hours = Operation Hours.

### Verification gates

| Gate | Result |
|---|---|
| Bitrate verification gate (6 levels + motion floor, ±2%) | ✅ All land +1.63%, within ±2% |
| `npm test` | ✅ 86/86 (was 77; +7 gate, +2 rehydrate round-trip) |
| `npm run build` | ✅ Clean (TypeScript passed) |
| `npx eslint` (changed files) | ✅ 0 new errors; 2 pre-existing in `calculator-form.tsx` (confirmed on HEAD, unrelated, left per scope) |
| UI data-path check (`computeGroup`) | ✅ Bitrate/storage/hours behavior correct |
| In-browser `/calculator` visual + interaction check | ✅ 6 levels, example updates, bitrate matches, motion gating + storage drop, no console errors |

---

## 2026-06-05 — Fix: dashboard deal registration + header nav labels

### Work done

- **Register a Deal was broken** — submitting failed with the raw Zod message "Too small: expected string to have >=1 characters". Root cause: `dashboard/page.tsx` selected a non-existent `email` column from `partners` (emails live on `auth.users`, not `partners`). Supabase returned an error, but only `data` was destructured so the error was swallowed and `partner` came back `null`. That made the hidden `partnerId` field empty, so the action's `partnerId: z.string().min(1)` check failed with its default message. Fixed by dropping `email` from the select and sourcing the partner email from `user?.email` (the form's existing fallback). The form's other partner fields now populate correctly too.
- **Header nav wrapped to two lines** — renamed "My Pipeline" → "Pipeline" and "All Submissions" → "Submissions" in `layout.tsx` so the admin/internal nav fits on one line.

### Detours & fixes

- The swallowed-error pattern (`const { data } = await supabase...`, no `error`) is what hid this for so long — the page rendered fine apart from the empty partner context, so it only surfaced when the deal form tried to use `partnerId`. Worth watching for elsewhere, but not refactored here.

### Verification gates

| Gate | Result |
|---|---|
| `npx eslint` (2 changed files) | ✅ 0 errors (pre-existing `<img>` warning in layout.tsx unchanged) |
| `npm run build` | ✅ Clean |
| Confirmed `partners` has no `email` column (initial schema migration) | ✅ |

---

## 2026-06-05 — Admin-editable partner company + contact name

### Work done

Admins can now edit a partner's (or internal user's) display **company name and contact name** from the partners list, to fix test records and align names with the matching Pipedrive organization/contact.

- **`src/app/(app)/admin/partners/actions.ts`** — `updatePartnerCompanyName` and `updatePartnerContactName` server actions, both thin wrappers over a shared `updatePartnerNameField(formData, column, formField, label)` helper. Gated by the local admin-only `requireAdmin()` (not `requireAdminOrInternal`, matching suspend/reactivate/internal-toggle). Validates with `nameFieldSchema` (`z.string().trim().min(1).max(120)`, same bounds as the invite form), writes the target column via the service-role admin client, then `revalidatePath("/admin/partners")`.
- **`src/app/(app)/admin/partners/partner-row-actions.tsx`** — `EditableName` client component, generic over the field: takes `value`, `fieldName`, `label`, and the server `action` as props so one component serves both columns. Display mode shows the value plus an "Edit" button; edit mode swaps in a text input with Save / Cancel.
- **`src/app/(app)/admin/partners/page.tsx`** — the Company and Contact cells each render `EditableName` (with the matching action) when `isAdmin`, otherwise plain text (internal users keep read-only access, same gating as the other row controls).

No migration and no RLS change: both columns already exist, and every admin mutation on this page already goes through the service-role client (which bypasses RLS). Admin-only is enforced server-side in the action, not just in the UI. The names copied into auth `user_metadata` at invite time are intentionally left untouched — they are never read after the invite; the `partners` table is the source of truth everywhere the portal reads it (calculator, submissions, PDF).

**Manual verification:** as an admin, open `/admin/partners`, click **Edit** on a row's Company or Contact cell, change the value, and **Save** — the row refreshes with the new value and it flows through to that partner's submissions/PDF. Confirm an internal (non-admin) user sees both names as plain text with no Edit control.

### Detours & fixes

- **`setState` in `useEffect` rejected by lint.** First pass closed the editor from a `useEffect` watching the action result; the React 19 `react-hooks/set-state-in-effect` rule errors on that, and it also mishandled re-editing after a save (stale "ok" state). Reworked to call the action inside `useTransition` and collapse the editor (or set the error) from the transition callback — no effect, and the state resets cleanly per edit.

### Verification gates

| Gate | Result |
|---|---|
| `npx eslint` (3 changed files) | ✅ 0 errors |
| `npm run build` | ✅ Clean |
| `npm test` | ✅ 77/77 (no test-covered logic changed) |

---

## 2026-06-05 — Phase 9 Step 1: System estimate PDF

### Work done

Replaced the basic calculator PDF (`src/lib/pdf/SubmissionPdf.tsx`) with a polished, customer-ready "System Estimate" document. The download route (`/api/submissions/[id]/pdf`) and render entry points are unchanged; the template and its view model grew.

- **`src/lib/pdf/SubmissionPdf.tsx` rebuilt** with seven sections top to bottom: (1) header — Arxys logo image, "Purpose-built video surveillance infrastructure" tagline, and a right-aligned block with a navy "SYSTEM ESTIMATE" pill, date, project, and "Prepared for" company, separated by a navy rule; (2) camera schedule table (group, cameras, resolution, codec, FPS, scene complexity, recording hours, bandwidth, storage) with a highlighted Totals row and an italic retention + even-distribution note; (3) three capacity bars (Total storage, Bandwidth, System utilization) rendered as nested `<View>` rectangles with percentage-width fills — navy for storage/bandwidth, gold for utilization, plus a "20% headroom built in" note; (4) recommended-server block — product hero image (left) and model name + SKU line + 2-column spec grid (right); (5) navy pricing row (Unit MSRP / Quantity / Deployment total, total in gold); (6) five value-prop badges (navy circle + letter abbreviation, since `@react-pdf/renderer` has no icon-font support); (7) footer with the standard planning-estimate disclaimer and company line.
- **`src/lib/pdf/assets.ts` (new)** — loads the logo (`public/email/arxys-logo.png`) and the recommended product's hero (`public/price-book/*.png`) off disk into cached base64 data URIs. Hero selection reuses the canonical `productGroupToFamilySlug` → `families.ts heroImage` mapping. Returns `null` on a missing file so the template degrades to text rather than crashing.
- **`next.config.ts`** — added `outputFileTracingIncludes` for `/api/submissions/*/pdf` so the logo and price-book PNGs ship with the serverless function (the hero path is dynamic and can't be statically traced). See ADR 0046.
- **`src/lib/pdf/render.ts`** — `loadSubmissionPdfInput` now also joins `product_specs` on `id = recommended_product_id` (the migration made `product_specs.id` the SKU, so this is a direct key match — no `product_sku` indirection needed). New exported helpers: `buildServerSpec()` (fetch + map a SKU's spec, shared with the calculator action) and `usableCapacityTb()` (RAID-net capacity from `storage_raw_tb` + `hdd_count` + `raid_level_display`). The view model carries the resolved `serverSpec`, the logo/hero data URIs, and the submission's `storageTb`/`bandwidthMbps` for the capacity bars.
- **`src/lib/pdf/types.ts`** — added `SubmissionPdfServerSpec` plus the new top-level fields. QuickCompare columns are nullable; the template renders "—" for any null (per brief).
- **`src/app/(app)/calculator/actions.ts`** — the in-memory view model built for the emailed PDF now calls `buildServerSpec()` and the asset loaders too, so the attachment matches the downloadable PDF.
- **`src/lib/pdf/colors.ts`** — added `ARXYS_NAVY` (#1a365d) and `TRACK_GRAY`.
- **`src/lib/pdf/render.test.ts`** — fixture updated for the new required fields; added a second case that renders with `serverSpec: null` (legacy submission) to lock in the no-crash-on-null contract. 77/77 green.

**Manual verification:** navigate to `/submissions`, click **PDF** on any submission, and confirm the downloaded file shows all seven sections with real data — logo and product image render, the camera schedule totals reconcile with the rows, the capacity bars fill proportionally, and the pricing row multiplies MSRP by unit count. Multi-server (`recommended_units > 1`) shows "N × SKU" in the SKU line and per-deployment totals in the bars. During development the layout was rasterized with `pdftoppm` and inspected page-by-page for a single-group (one page) and a three-group (two pages, clean section break) calc.

### Detours & fixes

- **One-page fit fought the fixed footer.** The brief wants a single-group / single-server calc on one page. With everything in, the five value badges (a `wrap={false}` block) kept jumping to page 2 even with visible whitespace above the footer, because the footer is `position: absolute` + `fixed` and `paddingBottom` governs where content stops flowing. Tightening `paddingBottom` to 50 pulled the badges back onto page 1, but then the badge subtitles painted *under* the fixed footer. The fix was a second pass trimming ~15pt of inter-section margins (capacity bars, recommended block, pricing) so the badges end above the footer band. Single-group now fits one page cleanly; three-group breaks between the recommended-server block and the pricing row (a whole-section boundary, never mid-section).
- **`product_specs` vs `products`.** The brief refers to `product_specs` and its QuickCompare columns. The recommendation engine and the old PDF used the separate `products` table (SKU-PK). The Phase 6 migration set `product_specs.id` to the SKU string, so joining the spec is a direct `id = recommended_product_id` match — confirmed by reading the migration's `where id like 'VX5-V%-%'` clauses. Both tables are now queried: `products` for covered cameras/storage (existing behavior preserved as a fallback), `product_specs` for the spec grid + RAID inputs.
- **No usable-capacity utility existed.** Implemented `usableCapacityTb()` as a RAID-level approximation (ADR 0047) rather than reaching for the Price Book's per-SKU net-usable strings.
- **Dropped the warnings note box.** The old template rendered `recommendation.warnings` (e.g. "verify rack space and power before quoting") in a yellow note box. Those are integrator/sales-facing, not end-customer-facing, so they are intentionally omitted from this customer-ready document. The multi-unit signal they carried is now conveyed structurally by the "N × SKU" line and the capacity bars. No data or algorithm changed — only what the customer PDF surfaces.

### Decisions captured

- [`0046-pdf-image-assets-via-file-tracing.md`](./decisions/0046-pdf-image-assets-via-file-tracing.md)
- [`0047-raid-usable-capacity-approximation.md`](./decisions/0047-raid-usable-capacity-approximation.md)

### Verification gates

| Gate | Result |
|---|---|
| `npm test` | ✅ 77/77 (added one PDF null-spec render test) |
| `npm run build` | ✅ Clean — 18 routes, 0 errors |
| `npx eslint` (8 changed files) | ✅ 0 errors (two react-pdf `<Image>` a11y warnings suppressed inline — not HTML img, no alt concept) |
| `no-ai-slop` audit on template strings | ✅ No banned phrases; no em dashes in prose. The only "—" are the brief-mandated null placeholders and the middot "·" separators match the comparison-PDF footer. |
| Manual PDF inspection (single- and three-group) | ✅ All 7 sections render with images; single-group fits one page; multi-group breaks on a section boundary. |

---

## 2026-06-04 — Phase 8 Step C: internal user role escalation

### Work done

- **Migration `20260604000002_internal_user_read_submissions.sql`** — additive. One `submissions_select_internal` policy that grants SELECT to any partner with `is_internal = true`. Postgres OR's permissive SELECT policies, so `submissions_select_own_or_admin` keeps covering regular partners and admins unchanged. Mutating policies (`submissions_update_own`, `submissions_delete_own_draft`) are untouched, so internal users get read-only cross-partner access. Paired rollback at `supabase/rollback/phase-8-step-c-rollback.sql` drops exactly the new policy.
- **`src/lib/auth/require-admin-or-internal.ts`** — new shared helper. Returns `{ ok: true, userId, isAdmin, isInternal }` on pass, `{ ok: false, error }` otherwise. Status must be `active`; admin OR internal qualifies. Used by the admin layout, the partners list/invite pages, and the admin submissions page.
- **`src/app/(app)/admin/layout.tsx`** — gate switched from inline `role === "admin"` check to `requireAdminOrInternal()`. Same `notFound()` failure mode, so non-admin-non-internal partners get a 404, not a 403. Internal users now reach `/admin/partners`, `/admin/submissions`, and `/admin` (the overview is read-only RLS-scoped, so it shows the same partner + submission counts admins see).
- **Invite flow** — `invitePartner` action now calls `requireAdminOrInternal()`. The `isInternal` form input is honoured only when `gate.isAdmin` is true; non-admin callers get `is_internal = false` written regardless of what they submit (server-side enforcement, defence-in-depth on top of the now-conditional UI). The "Internal user" checkbox in `invite-form.tsx` is gated behind a new `showInternalToggle` prop; the new-partner page passes `gate.isAdmin` into it. Other partner actions (`suspendPartner`, `reactivatePartner`, `resendInvite`, `setPartnerInternal`) keep the local admin-only `requireAdmin()` helper.
- **`admin/partners/page.tsx`** — page-level `requireAdminOrInternal()` to compute `isAdmin`. Internal users see the table but the `InternalToggle` is replaced with a static "Internal ✓" / "—" label, and `PartnerRowActions` is replaced with "—". The "Invite partner" link stays for both.
- **`admin/submissions/page.tsx`** — page-level `requireAdminOrInternal()` to compute `isAdmin`. The XLSX export button (`showExport`) is gated on `isAdmin`. In the flat project view, the per-row `RowControls` (status select + Delete) is replaced for non-admins by a plain `STATUS_META[...].label` span. The partner-grouped view has no edit controls of its own, so internal users see the full accordion + drill-down read-only. The XLSX route (`/api/admin/forecast/xlsx`) already gates on `role = admin` → 403 for internal users; no change needed there. Action handlers (`adminUpdateStatus`, `adminDeleteSubmission`) keep their `role = admin` re-check.
- **`src/app/(app)/layout.tsx`** — `partner` SELECT now pulls `is_internal`. New `isAdminOrInternal` flag exposes nav links to `/admin/submissions?groupBy=partner` ("All Submissions") and `/admin/partners` ("Partners") whenever the flag is true. The orange "Admin" pill remains admin-only.
- **`scripts/test-rls.ts`** — `provisionPersona()` gains an `isInternal` option; a new `internalPersona` is provisioned alongside A, B, and the admin persona. Four new assertions: 8d (internal SELECTs B's submissions), 8e (internal UPDATE on B's row → 0 affected), 8f (internal DELETE on B's row → 0 affected), 8g (regular partner A still cannot SELECT B's submissions — confirms the policy doesn't leak). Cleanup tears down the internal persona too.

### Detours & fixes

- **Where the gate lives.** The brief reads as "change `requireAdmin()` to `requireAdminOrInternal()` at the page level," but the admin pages don't have page-level `requireAdmin()` calls in the first place — gating is done by `admin/layout.tsx` for the whole subtree, plus per-action checks. Moved the layout gate to the new helper (which fail-closes the same way for non-admin-non-internal) and added per-page `requireAdminOrInternal()` calls only where the page needs `isAdmin` as data to gate sub-controls (partners list, submissions list). The new-partner page gets a defence-in-depth re-call so the `isAdmin` it passes to `InviteForm` can't be spoofed by editing the URL.
- **Suspended-internal-user case.** The helper requires `status = "active"` for both paths. A suspended internal user falls through to "Not authorized." → layout `notFound()` → same behaviour as a suspended admin. The RLS policy itself is unguarded by status (it only checks `is_internal = true`), but the layout closes the door before the page can issue any queries. If we ever needed to enforce this purely at the policy level, the policy would also need `and partners.status = 'active'` — flagged here, not changed today.
- **Internal user reaching `/admin` overview.** Brief is silent on this. The overview is read-only and shows the same data internal users will see via the explicit nav links anyway; gating it separately would add a special-case rendering path for no obvious benefit. Left it accessible.
- **RLS tests not run in this session.** `scripts/test-rls.ts` needs service-role creds (same constraint flagged in the Phase 7 Step 1 journal entry). The test additions are reviewed visually and the policy is constructively safe (no `for all`, only `for select`; admin/own-row policies are unchanged). Andy will run the script after `supabase db push` per the verification recipe.

### Verification gates

| Gate | Result |
|---|---|
| `npm test` | ✅ 76/76 green (no test changes; covers existing forecast/recommend suites) |
| `npm run build` | ✅ Clean — 22 routes, 0 errors |
| `npx eslint` (8 changed files + the RLS script) | ✅ 0 errors (1 pre-existing `<img>` warning in `app/(app)/layout.tsx` unchanged) |
| Migration review | ✅ One additive `create policy`; no table changes, no policy drops. Paired rollback drops exactly that policy. |
| `scripts/test-rls.ts` | ⏭ Not run (no service-role creds in this session). 4 new assertions added; runs as part of Andy's pre-push checklist. |
| `no-ai-slop` audit on new user-facing strings (`All Submissions`, `Partners` nav labels, `Internal ✓` / `—` cell placeholders) | ✅ No banned phrases. |

### Decisions captured

- No new ADR. The choice is mechanically additive (one RLS policy, layout gate widening, per-control admin gates) and follows the precedent set by ADR 0045 / Phase 7 Step 1 — `is_internal` already exists as the authorization flag. No alternative was seriously considered.

---

## 2026-06-04 — Phase 8 Steps A + B: CSS/copy fixes + submissions dollar totals

### Work done

**Step A — CSS and copy fixes**

- **A1 (`videox-compare.css`)**: diff-row highlight changed from left-border-only to a full-row gold background wash (`rgba(251,176,64,0.08) !important`). Left border kept as secondary signal. The `!important` matches the existing pattern used by `.vxc-td-below`; since the below-requirement rule appears later in the file its `!important` still wins when both classes are present (red > gold for cells that are below the camera threshold AND in a diff row).
- **A2 (`videox-compare-form.tsx`, `videox-compare.css`)**: Subtitle rewritten to two clean sentences — no em dash. Element changed from `<div>` to `<p>`. CSS `.vxc-st` max-width tightened from `620px` to `480px`; `text-align: center` added explicitly so the constrained block centers its text symmetrically within the gold-underlined header.
- **A3 (`dashboard/page.tsx`)**: All three em dashes removed (Server Comparison description, VideoX QuickCompare description, Register a Deal description). QuickCompare description text updated to match A2 wording. All five text-link-with-arrow actions converted to filled gold `bg-[#fbb040]` buttons matching the existing "Open a Support Ticket" treatment: Compare servers, Compare models, Open price book, Support Documentation, Download XLSX. Arrows dropped. For cards where the whole card is a `<Link>`, the button is a `<span>` (valid — no nested interactive element). For the Support Documentation link (a real `<a>` inside a non-Link card) the class was applied directly to the `<a>` tag.

**Step B — Submissions page dollar totals**

- **`submissions/page.tsx`**: Added `partner_id` to the Supabase SELECT (already a NOT NULL column; no migration). Added `import { groupIntoDeals, computeWeightedForecast, type SubmissionRow }` from the forecast library. After loading rows, maps them to `SubmissionRow[]` and calls `groupIntoDeals(forecastRows, [])` — empty partners array is intentional: display names aren't needed for dollar summation, and on-behalf grouping still works correctly because the FK and free-typed company fields are in each row. Pre-filters out `lost` deals before `computeWeightedForecast` (see Detours). Passes `totalOpenPipeline` and `weightedForecast` as new optional props to `<Pipeline>`.
- **`submissions/pipeline.tsx`**: Added `totalOpenPipeline?: number` and `weightedForecast?: number` props (optional so the admin view's absence of these props is a no-op). Added `fmtAmount()` helper: `$0` for zero, no decimals for round integers, two decimals otherwise. Summary bar renders between the status filter pills and the error/content block; subdued `bg-neutral-100` background with `text-sm text-neutral-600` body text — smaller than the project group headers. Bar shows even when totals are zero. Bar is hidden if props are undefined (admin context).
- **`forecast.test.ts`**: Added one test (`computeWeightedForecast — lost excluded from open pipeline (pre-filter pattern)`) demonstrating the `deals.filter(d => d.status !== "lost")` pattern used in the page. 76/76 green.

### Detours & fixes

- **`computeWeightedForecast` includes `lost` in `totalOpenPipeline`.** The existing function skips `draft` and `null` but keeps `lost` (it just weights it at 0 for `weightedForecast`). For the dashboard funnel card this behaviour was intentional (it reports all-time pipeline volume). For the submissions bar the requirement explicitly excludes lost from the open-pipeline total. Rather than change the shared function (which would break the existing dashboard test and funnel card semantics), I pre-filter at the call site: `const openDeals = deals.filter(d => d.status !== "lost")`. When the user is on the "Lost" status filter, the bar correctly shows `$0 · $0`.
- **"at a glance" in A2/A3 copy.** The general rule bans it, but the brief provides it verbatim as the required replacement text. Kept per explicit instruction. Flagged here.

### Verification gates

| Gate | Result |
|---|---|
| `npm test` | ✅ 76/76 green (75 prior + 1 new lost-exclusion test) |
| `npm run build` | ✅ Clean — 22 routes, 0 errors |
| `npx eslint` (5 changed files) | ✅ 0 errors |
| Em-dash audit (`dashboard/page.tsx`) | ✅ 0 em dashes remain |
| Em-dash audit (`videox-compare-form.tsx`) | ✅ 0 em dashes remain |
| Scope guard: no migration, no admin view changes, no RLS changes | ✅ Confirmed |

---

## 2026-06-04 — Phase 7 Step 1: internal "on behalf of" calculations

### Work done

- **Migration `20260604000001_phase7_on_behalf.sql`** — additive, RLS-neutral. `partners.is_internal boolean not null default false`; `submissions.on_behalf_of_partner_id` (FK → partners) + `submissions.on_behalf_of_company_name` (text) + an index on the FK. No policy changes — the creator-based insert/select policies already cover on-behalf rows (`partner_id` stays = creator), and admins already read across partners.
- **`src/lib/pipeline/forecast.ts`** — new `effectivePartner()` helper computes the bucket as `COALESCE(on_behalf_of_partner_id, lower(trim(company_name)), partner_id)` and resolves the display label. `groupIntoDeals` now groups by the effective partner, so every consumer follows automatically. Added the two columns to `SubmissionRow` (optional, so existing fixtures/callers compile unchanged).
- **`SubmissionRow` queries** updated to select the new columns: admin submissions (partner-grouped view), dashboard, and the forecast XLSX route. The dashboard also resolves on-behalf FK targets' names via the admin client (the rep can't read other partners under their own RLS scope), so its grouped view shows a company name rather than a UUID.
- **`src/app/(app)/calculator/actions.ts`** — `onBehalfOf` added to the submission schema; caller `is_internal` loaded alongside status; server-side authorization (a target is honoured only for internal callers). A typed value that exactly (case-insensitively) matches an existing partner's company binds the FK (and resolves the target's email for the Pipedrive person); otherwise it banks as free text (org-only deal). At most one of the two columns is set. The deal is billed against the target; the rep is credited via a pinned note.
- **`src/lib/pipedrive/deal.ts`** — `DealPartnerInput.contactName/email` made optional; `createDealFromSubmission` skips the person upsert when no email is supplied (free-typed org-only) and accepts an optional pinned `onBehalfNote`. Same person guard applied to `createComparisonDeal` for type-safety.
- **Calculator UI** — `page.tsx` loads `is_internal` and (for internal users only, via the admin client since RLS blocks listing partners) the partner company-name suggestions. `calculator-form.tsx` renders an "On behalf of" free-text + datalist field, gated on `isInternal`, mirroring the Project Name pattern.
- **Admin surface** — invite form gains an "Internal user" checkbox (`invitePartner` writes `is_internal`); partners table gains an "Internal" column with a per-row `InternalToggle` (new `setPartnerInternal` action, `requireAdmin`-gated) to retrofit existing staff.
- **Tests** — 4 new `groupIntoDeals` cases (FK roll-up, grouping with the target's own submissions, free-typed normalisation + label, self-serve unchanged). Full suite green (75 tests).

### Detours & fixes

- **Considered denormalising the company name into both columns** to give every grouped view an inline display label. Backed out to honour the brief's locked "at most one set" invariant (DB CHECK enforces it). The one place this bites — the RLS-scoped rep dashboard, which can't read other partners' names from a bare FK — is handled with a scoped service-role name lookup in the dashboard loader instead. Rationale in ADR 0045.
- **Narrow `deal.ts` touch for the free-typed case.** `upsertPerson` has no graceful empty-email path — a free-typed target would have created a junk person. The brief sanctioned a minimal branch; `createDealFromSubmission` now skips the person upsert when no email is supplied (same guard applied to `createComparisonDeal` for type-safety). The 13 `deal.test.ts` cases stay byte-for-byte green.
- **Post-deploy bug: ambiguous PostgREST embed (PR #3).** Adding `on_behalf_of_partner_id` gave `submissions` a *second* FK to `partners`, so every `partners!inner(...)` embed broke with "more than one relationship was found" — taking out `/admin`, `/admin/submissions`, and `/admin/submissions/[id]` once the migration went live. Root cause: I added the FK without auditing existing embeds. Fix: pin each of the three embeds to the creator relationship via the constraint hint `partners!submissions_partner_id_fkey!inner(...)`. Verified against the live DB. Lesson: a new FK to an already-embedded table is a breaking change for PostgREST resource embedding — grep for `<table>!inner` before adding one.
- **Follow-up: surface the target company on `/submissions` "My Pipeline" (PR #4).** On-behalf submissions recorded the target correctly but the pipeline view grouped by project name only, so a rep couldn't tell which partner a project was for. Added an "On behalf of {company}" badge on the project-group header, resolving FK targets' names via the admin client (same RLS-scoped pattern as the dashboard).

### Verification gates

- `npm run build` — clean, all 18 routes in the manifest (`/calculator`, `/dashboard`, `/admin/partners` included).
- `npx eslint` on all 13 changed files — 0 errors.
- `npm test` — 75/75 green, including 4 new `groupIntoDeals` on-behalf cases and the unchanged 13 `deal.test.ts` cases.
- `scripts/test-rls.ts` — not run (no service-role creds in this session). The change is RLS-neutral by construction: no policies added or altered, `partner_id` stays = creator, so `submissions_insert_self` / `submissions_select_own_or_admin` already cover on-behalf rows.
- Migration reviewed: additive ALTERs + a CHECK constraint, valid syntax; paired rollback at `supabase/rollback/phase-7-step-1-rollback.sql` drops exactly the three columns (+ constraint + index). `scripts/backup-tables.ts` is a pre-push step — due before `supabase db push`, not run yet (nothing pushed).
- `no-ai-slop` audit over user-facing strings + this entry — 0 AI-isms.

### Decisions captured

- [`0045-on-behalf-of-calculations.md`](./decisions/0045-on-behalf-of-calculations.md)

## 2026-06-02 — Phase 6 Step 2: VMS Selector + Validation Sheets

### Work done

- **`src/lib/videox-compare/vms.ts`** — new constants file. `VMS_OPTIONS` (three entries: Avigilon/ACC7, Milestone/Xprotect, Genetec/Omnicast), each with `id`, `name`, `vmsProduct`, `sheetUrl`, and `sheetLabel`. Exports `VmsId` union type derived from the `as const` array. No external deps.
- **`src/app/(app)/videox-compare/videox-compare-form.tsx`** — added `selectedVms: VmsId | null` state (default `null`). VMS toggle row: three pill buttons (`Avigilon | Milestone | Genetec`) rendered below the camera filter, above the table. Click selects; click again deselects (returns to `null`). VMS banner: shown when `selectedVms !== null`; text "VideoX V5 is validated for [name] [vmsProduct]"; download link styled as secondary button opens PDF in new tab; defensive `sheetUrl` null-check renders muted "coming soon" text (not currently reachable). Controls are fully independent — VMS selection does not affect compare mode, camera filter, or table data.
- **`src/app/(app)/videox-compare/videox-compare.css`** — added `.vxc-vms-toggle`, `.vxc-vms-pill`, `.vxc-vms-pill--active`, `.vxc-vms-banner`, `.vxc-vms-banner-text`, `.vxc-vms-sheet-link`, `.vxc-vms-sheet-pending` all scoped under `#arxys-vxc-root`. Responsive: pills wrap on narrow screens; banner stacks vertically below 640 px.

### Verification gates

| Gate | Result |
|---|---|
| `npm run build` | ✅ Clean — `/videox-compare` in manifest |
| `npx eslint` (changed files) | ✅ 0 errors |
| `npm test` | ✅ 71/71 pass |
| Language audit | ✅ "certified" appears nowhere in changed files |

---

## 2026-06-02 — Phase 6 Step 1: VideoX QuickCompare

### Work done

- **`supabase/migrations/20260602000001_quickcompare_columns.sql`** — additive migration adding 25 nullable columns to `product_specs` (rack_units, drive_bays, max_bandwidth_mbps, os_edition, ram_spec, cpu_model_full, cpu_turbo_ghz, cores_threads, cpu_cache, mem_bandwidth, avx_512, workload_affinity, chiplet_arch, infinity_guard, hotswap_power, hdd_count, hdd_mtbf, raid_level_display, battery_raid, os_ssd_type, os_redundancy, gbe_1_ports, gbe_10_ports, sfp_addon, avigilon_gpu). One `UPDATE … WHERE id LIKE 'VX5-Vnnn-%'` per family seeds identical values across each family's SKU tiers. No existing columns, rows, indexes, or RLS policies touched. Source: `VideoX-QuickCompare-V5.xlsx`, "Arxys V5" sheet. Matching rollback at **`supabase/rollback/quickcompare-columns-rollback.sql`** (drops exactly the 25 columns).
- **`src/lib/comparison/types.ts`** — extended `ProductSpec` with the 25 new fields as optional/nullable. The comparison & calculator tools are unaffected: their `DISPLAY_SPECS` reference only `SharedSpecKey` fields.
- **`src/lib/videox-compare/{types,data,specs}.ts`** — `QuickCompareModel` type (camelCase, family-level); `getQuickCompareModels()` queries `product_specs` (`id LIKE 'VX5-V%'`), dedupes to the first row per family, and returns the 7 families ordered V100→V800; `QUICK_COMPARE_SPECS` (26 rows across Overview/System/Storage/Networking), `SECTIONS`, verbatim `TOOLTIPS`, and `FOOTNOTE`.
- **`src/app/(app)/videox-compare/page.tsx`** — Server Component, calls `getQuickCompareModels()`, mirrors `/comparison`'s back-link layout.
- **`src/app/(app)/videox-compare/videox-compare-form.tsx`** — Client Component. Full sticky-label/sticky-header table; compare mode (checkbox per model header → 2+ checked collapses to selected columns, "Show all models" reset); diff highlighting (gold left-border on rows whose displayed values differ across selected models); "Minimum cameras needed" filter (below-requirement header badge + red-tinted Max Cameras cell, works in both views); CSS tooltips on technical rows (hover + keyboard focus); verbatim footnote.
- **`src/app/(app)/videox-compare/videox-compare.css`** — scoped to `#arxys-vxc-root` (prefix `vxc-`), mirroring the comparison tool's scoping; uses global Arxys brand tokens, no new fonts.
- **`src/app/(app)/dashboard/page.tsx`** — "VideoX QuickCompare" card added after Server Comparison.
- **`src/app/(app)/layout.tsx`** — "QuickCompare" nav link added before Price Book.

### Detours & fixes

- **No V900, and it can't go in `product_specs`.** The brief assumed all 8 V5 families were in `product_specs`, but the table holds only 7 (V100–V800, 21 rows); there is no V900 anywhere in the repo. Adding V900 would require fabricating the NOT NULL base columns (`msrp`, `storage_raw_tb`, `cpu_passmark`, …), which breaks the "no pricing" rule and would leak a fake V900 into `/comparison` and `/calculator`. Per decision, V900 is **ignored** — QuickCompare ships 7 families. Revisit when V900 has real `product_specs` rows.
- **Column-name collision.** The brief's new `cpu_model` column collides with the existing NOT NULL `product_specs.cpu_model`. Renamed the QuickCompare column to `cpu_model_full` (same pattern the brief used for `raid_level_display` vs `raid_support`).
- **Missing `max_bandwidth` column.** The Overview "Max Bandwidth" row had no backing column in the brief's list nor in `product_specs`. Added `max_bandwidth_mbps`.
- **V600 rack-unit typo in source spreadsheet — resolved.** The QuickCompare spreadsheet listed **V600 = 2U**, but `product_specs.form_factor` *and* the in-repo price-book both say **3U** ("3U 16Bay"), and 16 bays in 2U is physically implausible. Flagged it; Andy confirmed **3U** (2026-06-02), so the migration seeds `rack_units = '3U'` for V600. The spreadsheet value was a typo.
- **Note — QuickCompare CPU specs differ from comparison-tool columns by design.** For V100/V200 the sheet says 6C/12T (matches the price-book), while the existing `cpu_cores_threads` says 8C/16T. The new columns hold QuickCompare's marketing-canonical values; the old columns stay untouched for the comparison tool. Not a bug.
- **Migration not yet pushed to cloud.** The new columns don't exist on the cloud DB yet, so `getQuickCompareModels()` returns rows with the new fields null and the page renders em-dashes until `supabase db push` runs. Graceful by design (all new fields are nullable / `?? null`).

### Verification gates

| Gate | Result |
|---|---|
| `npm run build` | ✅ Clean — `/videox-compare` route in manifest |
| `npx eslint` (new/changed files) | ✅ 0 errors (lone pre-existing `<img>` warning in layout.tsx) |
| `npm test` | ✅ 71/71 pass — no regressions |
| `scripts/test-rls.ts` | ✅ All pass — no RLS regressions (no policy changes) |
| Migration SQL review | ✅ Additive ALTER + per-family UPDATE; valid syntax |
| Rollback SQL review | ✅ Drops exactly the 25 added columns, nothing else |

### Decisions captured

- [`0044-quickcompare-extends-product-specs.md`](./decisions/0044-quickcompare-extends-product-specs.md)

---

## 2026-05-29 — Phase 5 Step 3: PDF + quote action

### Work done

- **`src/lib/pdf/comparison-template.tsx`** — `@react-pdf/renderer` Document with header (ARXYS logo, date, partner name), competitor→Arxys match row, 3-column spec table (Specification | Competitor | Arxys VideoX), pricing section (competitor quote, Arxys MSRP, savings per server, deployment total), fixed footer. Exports `ComparisonPdfInput`, `renderComparisonPdfBuffer()`, `comparisonPdfFilename()`.
- **`src/app/(app)/api/comparison/pdf/route.ts`** — POST route (nodejs runtime, force-dynamic). Auth-gated (returns 401 for unauthenticated). Accepts `Omit<ComparisonPdfInput, 'generatedAt'>` JSON body, generates PDF, streams with `application/pdf` Content-Disposition header.
- **`src/app/(app)/comparison/actions.ts`** — `requestComparisonQuote()` Server Action. Validates with zod, looks up partner record RLS-scoped, calls `createComparisonDeal()`, sends internal notification email (no PDF attachment, no partner email). Email failure is non-blocking.
- **`src/lib/pipedrive/deal.ts`** — added `createComparisonDeal()`. Title prefix `"Comparison:"` + pinned note with `lead_source: comparison_tool`, competitor model, Arxys match ID, server count. Same pipeline/stage as sizing deals. See ADR 0043.
- **`src/app/(app)/comparison/comparison-form.tsx`** — buttons wired: `handleDownloadPdf()` (POST fetch → blob → anchor download), `handleRequestQuote()` (Server Action call). Quote button disabled after success (idempotency). Success/error feedback inline. PDF and quote status tracked independently.
- **`src/app/(app)/comparison/comparison.css`** — active button styles, `.ac-cta-success`, `.ac-cta-error`.

### Verification gates

| Gate | Result |
|---|---|
| `npm run build` | ✅ Clean — `/api/comparison/pdf` route compiled |
| `npx eslint` (new/changed files) | ✅ 0 errors |
| `npm test` | ✅ 71/71 pass |
| `scripts/test-rls.ts` | ✅ 18/18 pass |

### Decisions captured

- [`0043-comparison-pipedrive-deal.md`](./decisions/0043-comparison-pipedrive-deal.md)

---

## 2026-05-29 — Phase 5 Step 2: Comparison UI

### Work done

- **`src/lib/comparison/display-specs.ts`** — `DISPLAY_SPECS: DisplaySpec[]` (13 rows, `os` excluded per `show_in_calculator=NO`, `cpu_architecture` renamed to `cpu_passmark`) and `MESSAGES: Record<string, string>` from the JSON messages array.
- **`src/lib/comparison/data.ts`** — `getComparisonData()` server function; fetches both tables, returns `productSpecs` (Record indexed by id) and `competitorsByVendor` (grouped with brandName/productLine metadata).
- **`src/app/(app)/comparison/page.tsx`** — Server Component; calls `getComparisonData()`, passes typed props + constants to `ComparisonForm`.
- **`src/app/(app)/comparison/comparison-form.tsx`** — client component. State: `selectedVendor`, `selectedModelId`, `userPrice`, `serverCount (1–25)`. Renders vendor select → model select → results panel (spec table, pricing section, deployment multiplier slider, three callouts, CTA buttons). Results panel hidden until model is selected. Advantage column: numeric delta/percentage for numeric fields; fixed "Arxys advantage" badge for string fields with `highlight_if_better=true`. CTA buttons present but disabled (wired in Step 3).
- **`src/app/(app)/comparison/comparison.css`** — scoped to `#arxys-cmp-root`; mirrors calculator CSS approach. Advantage badges: gold for string fields, green for numeric wins, red for numeric losses. Mobile: advantage column hidden below 600px.
- **`src/app/(app)/dashboard/page.tsx`** — added "Server Comparison" card above Price Book.

### Verification gates

| Gate | Result |
|---|---|
| `npm run build` | ✅ Clean — `/comparison` route compiled |
| `npx eslint` (new/changed files) | ✅ 0 errors |
| `npm test` | ✅ 71/71 pass — no regressions |
| `scripts/test-rls.ts` | ✅ 18/18 pass |

---

## 2026-05-29 — Phase 5 Step 1: Comparison schema + seed

### Work done

- **`data/server-specs.json`** committed to repo (copied from `~/Downloads/arxys-compare/data/`). This is the WP plugin's authoritative data file and the single source of truth for both new tables.
- **Migration `20260529000001_phase5_product_specs.sql`** — creates `product_specs` table (text PK matching JSON IDs, 19 columns including `cpu_passmark` mapped from JSON's `cpu_architecture`). RLS: enabled, authenticated SELECT always permitted. Seeded 21 Arxys VideoX rows inline (V100×3, V200×3, V400×3, V500×3, V600×3, V700×3, V800×3).
- **Migration `20260529000002_phase5_competitor_products.sql`** — creates `competitor_products` table with FK `arxys_match_id → product_specs(id)`. RLS: same pattern. Seeded 14 Milestone Husky IVO + 20 Avigilon NVR6 rows (34 total). Avigilon `msrp_current` rows seed as NULL (competitor pricing not displayed).
- **`scripts/update-comparison-data.ts`** — idempotent upsert script for future JSON refreshes. Accepts `--path` override; requires CONFIRM before writing. Mirrors `push-prices.ts` structure.
- **`src/lib/comparison/types.ts`** — `ProductSpec`, `CompetitorProduct`, `SharedSpecKey`, `NumericSpecKey`, `DisplaySpec`, `ComparisonMessage` types derived from the JSON/DB schema.
- **Open questions OQ-1 through OQ-3 confirmed**: separate table (not extending products), inline seed, numeric delta + badge for string fields.
- One naming decision: `cpu_architecture` in the JSON stores Passmark scores; mapped to `cpu_passmark` in both DB tables and the TypeScript types for clarity.

### Verification gates

| Gate | Result |
|---|---|
| `npm run build` | ✅ Clean — no new routes yet |
| `npx eslint` (new files) | ✅ 0 errors |
| `supabase db push` | ✅ Both migrations applied cleanly |
| `scripts/test-rls.ts` | ✅ 18/18 pass — no regressions |
| Manual: row counts | ✅ 21 + 34 rows; 0 broken FK refs; 0 null MSRPs |
| Manual: update script dry-run | ✅ Parses JSON correctly, reports correct counts |

### Decisions captured

- [`0042-comparison-data-architecture.md`](./decisions/0042-comparison-data-architecture.md)

---

## 2026-05-28 — Multi-group aggregation of Pipedrive per-stream deal fields

### Work done

- **Problem**: deals with multiple camera groups only showed the *primary* group's per-stream values (resolution, FPS, codec, complexity, recording, motion) — sales perceived this as "averaging" / hidden data. Applies to every deal write, not just revisions.
- **`buildDealFields` now aggregates across `submission.groups`** ([`deal.ts`](../src/lib/pipedrive/deal.ts)), per Pipedrive field type:
  - Free-text (Frame Rate, Motion Activity %, Recording hours): distinct values, sorted ascending, comma-separated via `distinctSortedNumberList` (e.g. `"10, 15, 20"`).
  - Resolution: forced to uniform megapixels via `resolutionLabelToMp` (parse the `(W×H)` suffix → `round(W·H/1e6)`, floor 1MP), distinct + sorted → `"2MP, 4MP, 8MP"`. Pixel dimensions and marketing labels dropped.
  - Scene Complexity (multi-select set): all distinct tier option IDs comma-joined (`"287,289"`).
  - Recording (single-select enum): any group < 100% duty cycle ⇒ "On Motion" (119), else "Continuous" (118).
  - CODEC (single-select enum, can't list multiple): dominant codec by total cameras across groups; ties first-seen.
- **`DealSubmissionInput.primaryGroup` replaced by `groups: DealGroup[]`** (each carries `cameras`). [`actions.ts`](../src/app/(app)/calculator/actions.ts) now maps the full `computed` array into `groups` for both the create and revision paths, so aggregation is identical for new submissions and revisions.
- **Tests** ([`deal.test.ts`](../src/lib/pipedrive/deal.test.ts)): fixture switched to a `groups` array; single-group assertions updated (Resolution `"4MP (2560×1440)"`→`"4MP"`, Scene Complexity `288`→`"288"` string set); new multi-group test asserting all five aggregation rules at once (FPS `"10, 15, 20"`, MP `"2MP, 4MP, 8MP"`, recording hours `"12, 24"`, complexity set `"287,289"`, Recording 119, dominant CODEC 139).

### Decisions captured

- [`0041-multi-group-pipedrive-field-aggregation.md`](./decisions/0041-multi-group-pipedrive-field-aggregation.md)

### Verification gates

| Gate | Result |
|---|---|
| `npm test` | ✅ **71/71 pass** (+1 multi-group aggregation test) |
| `npm run build` | ✅ Clean — same route manifest |
| `npx eslint` (touched files) | ✅ 0 errors |
| `npx tsc --noEmit` | ✅ Only the 2 pre-existing errors in untouched test files (`pdf/render.test.ts`, `price-book/xlsx.test.ts`) |

### Smoke test (manual, deferred to Andy)

Create/revise a quote with **three groups** at distinct FPS / resolutions / codecs / complexities, then open the Pipedrive deal and confirm:

- **Frame Rate** lists every distinct FPS, ascending (e.g. `10, 15, 20`).
- **Resolution** shows MP only, distinct + ascending (e.g. `2MP, 4MP, 8MP`) — no pixel dimensions.
- **Motion Activity %** and **Recording hours** list all distinct values ascending.
- **Scene Complexity** shows every tier used (e.g. `Low, High`).
- **Recording** = "On Motion" if any group is < 100%, else "Continuous".
- **CODEC** = the codec used by the most cameras.

---

## 2026-05-28 — Phase 4 Step 3: Quote revision + non-destructive Pipedrive deal update

### Work done

- **Rehydration module** — new [`src/lib/calculator/rehydrate.ts`](../src/lib/calculator/rehydrate.ts). `normalizeInputState(raw)` coerces a raw `input_state` blob into a fully-defaulted, range-clamped shape (tolerates null/partial/old rows). `fromStoredSubmission(row)` builds the form's initial state, resolving each group's resolution/codec/complexity index by the banked `groups_payload` *value* (label / codec value / tier) first — order-independent — and falling back to the raw stored index, then clamping. Add-on booleans are gated on a new additive `version` stamp (`INPUT_STATE_VERSION = 1`); pre-stamp rows default add-ons to false. New [`rehydrate.test.ts`](../src/lib/calculator/rehydrate.test.ts) (10 tests) including an index-shift resilience case proving stale raw indices are corrected via banked labels. **No migration** — the version stamp is just another key in the existing `input_state` JSON.
- **Version stamp in [`actions.ts`](../src/app/(app)/calculator/actions.ts)** — `input_state` is now written as an explicit object `{ version: INPUT_STATE_VERSION, ...calculator inputs }` rather than the raw parsed payload, so the revision flags never leak into the banked state.
- **Form rehydration** — [`calculator-form.tsx`](../src/app/(app)/calculator/calculator-form.tsx) accepts optional `initialState` + `sourceSubmissionId` props seeding all `useState` initializers. A rehydrated form starts `hasInteracted = true` (immediately re-submittable). New `revisionSourceId` state is tracked so `reset()` clears the revision link (a reset-then-submit saves a fresh quote, not a blank-data mutation of the old deal). Submit payload gains `isRevision` + `sourceSubmissionId`.
- **Entry points** — `/calculator?revise={id}` loader in [`page.tsx`](../src/app/(app)/calculator/page.tsx) reads the source row RLS-scoped (`select id, input_state, groups_payload`) and passes rehydrated `initialState`; a forbidden/missing row silently yields a fresh calculator. "Edit / revise quote" link added to the partner submission-detail action bar and a "Revise" link to each pipeline row.
- **Pipedrive PUT support** — [`client.ts`](../src/lib/pipedrive/client.ts) `request()` now allows `"PUT"`; added `updateDeal(id, payload)` → `PUT /v1/deals/{id}` and an `UpdateDealPayload` type that has no routing fields.
- **Shared `buildDealFields()`** — [`deal.ts`](../src/lib/pipedrive/deal.ts) extracts the calculator-derived payload portion (value + six `arxys_*` + admin calculator fields, **no** title/currency/user_id/person_id/org_id/pipeline_id/stage_id). `createDealFromSubmission` spreads it and adds the routing fields; new `updateDealFromRevision(dealId, submission, recommendation)` sends it verbatim, resolves only field keys (never pipeline/stage/owner, no person/org upsert), and posts a single "Revised from portal {date}" note (try/catch, non-blocking). The create path's payload is byte-for-byte unchanged — verified by the existing 9 deal tests.
- **Revision branch in `actions.ts`** — accepts `isRevision`/`sourceSubmissionId` in the schema; on a revision it reads the source `pipedrive_deal_id` RLS-scoped → if present, `updateDealFromRevision` + links the new row to the same deal id; if absent or the PUT 404s, falls back to `createDealFromSubmission`. **No new sales-notification email on a revision** (both PDF render and email send are skipped).

### Verification gates

| Gate | Result |
|---|---|
| `npm test` | ✅ **70/70 pass** (13 new: 10 rehydrate incl. index-shift + 3 deal-update) |
| `npm run build` | ✅ Clean — TypeScript passes, same route manifest |
| `npm run lint` | ✅ 0 errors — same 2 pre-existing `<img>` warnings |
| `scripts/test-rls.ts` | ✅ **18/18 pass** — new Test 18: partner A cannot SELECT B's submission to revise it |
| Manual smoke | ⏳ Deferred to Andy — calculator needs an authed session; see checklist below |

The deal-update test explicitly asserts `stage_id` / `user_id` / `pipeline_id` (and `title`/`currency`/`person_id`/`org_id`) are **absent** from the PUT body, and that no pipeline/stage/owner/contact lookups fire on a revision.

### Manual smoke checklist (for Andy)

1. **Revise entry point**: open a past submission → click "Edit / revise quote" (detail page) or "Revise" (pipeline row) → calculator opens pre-filled with that quote's groups, retention, VMS, project name, add-ons.
2. **Rehydrated form is submittable**: the Save button is enabled immediately (no need to touch a field first).
3. **Save a revision**: change a camera count → Save → a *new* draft submission appears in the pipeline (the original is untouched).
4. **Deal updated in place**: open the source quote's Pipedrive deal → confirm `value`, camera count, and portal URL refreshed; **stage, owner, and pipeline unchanged**; a pinned "Revised from portal {date}" note added.
5. **No new email**: confirm sales did *not* receive a new submission-notification email for the revision.
6. **Reset clears revision link**: on a rehydrated form, click Reset → Save → confirm this creates a brand-new deal (not an update of the old one).
7. **Fallback to create**: revise a quote whose source has no Pipedrive deal (or whose deal was deleted) → confirm a new deal is created instead of erroring.
8. **RLS**: confirm you cannot reach another partner's quote via `/calculator?revise={their-id}` (form loads empty/fresh).

### Decisions captured

- [`0039-quote-revision-rehydration.md`](./decisions/0039-quote-revision-rehydration.md) — new-row-not-mutate, value-first index resolution, additive version stamp, no migration.
- [`0040-pipedrive-deal-update-on-revision.md`](./decisions/0040-pipedrive-deal-update-on-revision.md) — non-destructive field subset via shared builder, RLS-scoped deal lookup, fallback-to-create, single revision note, no revision email.

---

## 2026-05-28 — Phase 4 Step 2: Calculator improvements

### Work done

- **Bug fix — reset leaves stale result.** Added `resultDismissed` boolean state to `calculator-form.tsx`. `reset()` sets it to `true`; `touch()` sets it to `true` when `submitState.status === "ok"` (dismisses panel on first input change after a successful submit); the submit button click sets it to `false` so the new result always shows. The `RecommendationPanel` and error div are both gated on `!resultDismissed`.
- **`formatNumber` fix** (`src/lib/calculator/compute.ts`): the `>=1000` branch was calling `.replace(/\.\d+$/, s => s.slice(0, 2))` which truncated to one decimal. Removed the replace; `withThousands()` already uses `.toFixed(2)` so the output is now `"1,234.57"` rather than `"1,234.5"`. New `src/lib/calculator/compute.test.ts` covers the fix plus `formatStorageGb` and `formatBandwidthMbps`.
- **Results-table "Rec" column** now shows hours (`Math.round((recordingPercent / 100) * 24) hrs`) instead of a raw percent, matching the Hrs/Day input. No PDF change needed — the PDF already used hours.
- **Transient empty numeric inputs.** Added `numericDrafts` Map state. While typing, the raw string is stored as a draft (so the field can be visually empty); on `onBlur`, the draft is cleared and the clamped integer value is committed to state. Applies to: cameras, FPS, Hrs/Day (per group) and Retention days (global).
- **A11y.** `aria-label` added to the motion `<input type="range">` per group (`"Scene motion level for {name}, {pct}%"`). `Tooltip` trigger gains `tabIndex={0}` so it's keyboard-focusable; the existing CSS `.ax-tip:focus-within .ax-tt` reveals the tooltip on focus (verified the CSS rule was already present via `:focus-within`).
- **Add-on toggles → Pipedrive note.** Two checkboxes ("Failover Recorder", "Management Server") in the global-settings block of `calculator-form.tsx`. Both booleans flow into the submit payload → `submissionSchema` (optional, default false) → `input_state` automatically → `createDealFromSubmission`. In `deal.ts`, after `createDeal` succeeds, if either add-on is checked, a pinned note is posted via `pipedriveClient.createNote`; the note call is wrapped in its own try/catch so a note failure never blocks the deal. Both toggles reset on `reset()`.
- **Min/max options display.** New `src/lib/recommend/headroom.ts`: `pickHeadroomOption(winner, alternatives)` — returns the cheapest alternative whose `coveredCameras` and `coveredStorageTb` both strictly exceed the winner's (fewer units on cost tie), or `null` if none exists. `RecommendationPanel` now renders: winner (recommended), up to 2 cheapest runner-ups (alternatives), and the headroom pick (room to grow) with capacity details. No change to the recommendation algorithm.

### Verification gates

| Gate | Result |
|---|---|
| `npm test` | ✅ **57/57 pass** (14 new: 8 compute + 6 headroom) |
| `npm run build` | ✅ Clean — same route manifest as Step 1 |
| `npm run lint` | ✅ 0 errors — same 2 pre-existing `<img>` warnings |
| `scripts/test-rls.ts` | ✅ **17/17 pass** — no RLS changes; Step 2 is calculator-only |
| Manual smoke | ⏳ Deferred to Andy — see click-through checklist below |

### Manual smoke checklist (for Andy)

1. **Reset clears panel**: submit a quote → see the recommendation panel → click Reset → panel disappears.
2. **Input change clears panel**: submit a quote → see the panel → change any camera count or FPS → panel disappears.
3. **New submit shows new result**: after dismissal, click "Save & request quote" again → new recommendation panel appears.
4. **Transient empty field**: click into the "Video Streams" field, select-all and delete → field shows blank (no snap to 1) → blur → field snaps to 1.
5. **Rec column shows hours**: check the results table → the Rec column shows e.g. "24 hrs" not "100%".
6. **`formatNumber` ≥1000**: submit a configuration that produces storage in the thousands of TB; confirm the displayed number uses two decimal places and a thousands separator.
7. **Keyboard tooltip**: Tab to the Codec info icon → tooltip text appears.
8. **Keyboard slider**: Tab to the Motion range slider for a group → left/right arrow keys change the value.
9. **Add-on toggles**: check "Failover Recorder" and "Management Server" → submit → open the resulting Pipedrive deal → confirm a pinned note shows "Add-ons requested — Failover recorder: Yes · Management server: Yes". Also confirm submitting with both unchecked produces no note.
10. **Min/max display**: submit any quote that has alternatives → confirm the recommendation panel shows "Recommended", "Alternatives" (1–2 rows), and (if a headroom candidate exists) "Room to grow" with coverage details.

---

## 2026-05-28 — Phase 4 Step 1: Partner pipeline forecast

### Work done

- **`src/lib/pipeline/forecast.ts`** — Pure forecast library (no Supabase import). `STAGE_PROBABILITY` constant (on-hold 20%, sent 40%, won 100%, lost 0%); `groupIntoDeals(submissions, partners)` collapses rows to one deal per (partner_id, trimmed-lower project_name) using the preferred submission if starred, else most-recent by `created_at`; `computeWeightedForecast(deals)` filters draft/NULL before weighting and returns `{ totalOpenPipeline, weightedForecast }`.
- **`src/lib/pipeline/forecast.test.ts`** — 12 tests covering: dedup to one deal, case-insensitive/whitespace normalisation, cross-partner isolation, preferred-over-latest representative selection, weighted-sum arithmetic, draft exclusion from pipeline dollars, null-status exclusion, and null `project_name` handling.
- **`src/app/(app)/admin/submissions/page.tsx`** — Added `?groupBy=partner` toggle. Partner mode: summary cards (active partners, open-pipeline total, weighted forecast, per-status counts + separate draft count), per-partner expandable accordion → deals → submissions drill-down. Added `?status=` and `?from=` / `?to=` date-range filters across both views. Refactored the page header into a shared `PageHeader` component. Kept the existing flat project view intact; pagination, partner filter, and View links unchanged.
- **`src/app/(app)/admin/submissions/_components/partner-group-view.tsx`** — Client component for the expandable partner/deal accordion. Two-level expand: partner card → deal row → individual submissions table. Displays Pipedrive badge where `pipedrive_deal_id` is set. Weighted forecast note labels the data as pre-CRM partner activity.
- **`src/app/(app)/api/admin/forecast/xlsx/route.ts`** — Admin-only XLSX export mirroring the price-book pattern (Node.js runtime, force-dynamic, admin role+status gate). Exports the per-deal table with partner, project, status, list price, weighted value, Pipedrive deal ID, and quote date columns. Header row in Arxys Gold (#FBB040). Summary line embeds totals.
- **`src/app/(app)/dashboard/page.tsx`** — Partner-facing funnel card (hidden when the partner has no deals). Shows open pipeline, weighted forecast, per-status badge counts, and a separate draft count labelled "excluded from $". RLS-scoped automatically via the `submissions` policy — no partner_id filter needed in the query.

### Verification gates

| Gate | Result |
|---|---|
| `npm test` | ✅ **43/43 pass** (12 new forecast tests) |
| `npm run build` | ✅ Clean — new route `/api/admin/forecast/xlsx` appears in the route manifest |
| `npm run lint` | ✅ 0 errors — 2 pre-existing `<img>` warnings unchanged |
| `scripts/test-rls.ts` | ✅ **17/17 pass** — existing `submissions_select_own` policy confirms partner A cannot read partner B's submission rows, so the funnel card is isolated by RLS without any application-layer filter |
| Manual smoke | ⏳ Deferred to Andy — see click-through checklist below |

### Manual smoke checklist (for Andy)

1. **Admin — Partner view**: navigate to `/admin/submissions?groupBy=partner`. Confirm summary cards show totals; expand a partner row; expand a deal row; expand the submissions sub-table. Confirm a deal with a `pipedrive_deal_id` shows the blue badge.
2. **Admin — Filters**: apply a status filter (e.g. "Sent") and date range in partner view; confirm counts change. Switch to project view; apply partner + status filters; confirm table filters correctly.
3. **Admin — Project view intact**: navigate to `/admin/submissions` (no groupBy). Confirm the existing table, pagination, and View links are unchanged.
4. **XLSX export**: in partner view, click "Export XLSX". Confirm download opens in Excel/Numbers; check the on-screen weighted forecast total matches column E in the spreadsheet.
5. **Dashboard funnel card**: sign in as a non-admin partner with at least one non-draft submission. Confirm the "My Pipeline Summary" card appears with correct status counts and dollar totals. Confirm draft submissions appear as a count only, never as a dollar value. Sign in as a second partner and confirm you see only your own data.
6. **Draft exclusion**: in partner view, confirm a deal with `status=draft` or `status=null` does not contribute to the open-pipeline or weighted-forecast totals, but does appear in the draft count.

### Decisions captured

- [`0038-partner-pipeline-forecast.md`](./decisions/0038-partner-pipeline-forecast.md)

---

## 2026-05-28 — Phase 4 scoped: quote revision, partner forecast & calculator improvements

### Work done

Reviewed the live portal calculator (`src/lib/calculator/{tables,compute}.ts`,
`src/app/(app)/calculator/{calculator-form,actions,page}.tsx`) plus the recommend and pipedrive
modules against two partner-portal ideas — reopen/revise a past quote, and a partner-grouped pipeline
forecast — and folded both plus a calculator audit into `docs/phase-4-plan.md` (3 steps, no migrations).
Phase 4 Steps 1–2 are independent of the still-pending Phase 3 domain/cohort work.

Findings from the read-through:
- `input_state` banks the form payload **index-based** (`resolutionIdx`/`codecIdx`/`complexityIdx`) —
  brittle if the lookup tables ever reorder. Mitigated: `groups_payload` already stores the resolved
  `resolutionLabel`/`codec`/`complexity` per group, so rehydration can resolve label→index rather than
  trust the raw index. No historical backfill needed.
- `total_list_price_usd` (+ `recommended_units`, `cameras_count`, `bandwidth_mbps`, `storage_tb`, `vms`,
  `retention_days`, `status`, `is_preferred`, `pipedrive_deal_id`) are all denormalized on `submissions`
  since the initial schema, so the partner forecast is queries-only — no new columns.
- `createDealFromSubmission` is POST-only (`client.ts` `request` supports GET|POST), and no note is
  created on deals today (the Phase-1 placeholder note was removed in Phase 2). Revision-time deal
  update needs PUT + an `updateDeal` method; the add-on note introduces the first `createNote`.
- Calculator audit: `reset()` doesn't clear `submitState`, so a stale recommendation panel persists —
  the one real bug. Minor cluster: `formatNumber` truncates ≥1000 to one decimal; results "Rec" shows
  percent while the input shows hours; numeric inputs snap to 1 on clear; slider/tooltip aren't
  keyboard-accessible. `RecommendationPanel` ignores the `alternatives` `recommend()` already returns.

### Decisions locked (Andy, 2026-05-28)

- Revision **updates the existing Pipedrive deal non-destructively** (calc fields + value + portal URL +
  note only; never `stage_id`/`user_id`/`pipeline_id`), falling back to create if there's no linked deal;
  no new sales email on a revision.
- Revision creates a **new** submission (status `draft`), grouped by (partner, project); no parent column.
- Forecast weights: on-hold 20% / sent 40% / won 100% / lost 0%; **drafts excluded from dollar totals**
  (count only). Constant in `src/lib/pipeline/forecast.ts`.
- Two add-on checkboxes (failover recorder, management server) → **Pipedrive note only**, no sizing impact.
- Surface runner-up + next-size-up SKUs (min/max bracket); fix all cosmetic issues.
- **No database migration** anywhere in Phase 4.

### Artifacts

- `docs/phase-4-plan.md` — executable plan: 3 steps, verification gates, ADR pointers 0038–0040, and a
  Claude Code kickoff prompt.

### Pending

- Execution handed to Claude Code per the plan's kickoff prompt. ADRs 0038 (forecast), 0039 (rehydration),
  0040 (deal-update-on-revision) to be written during execution. RUNBOOK unchanged.

## 2026-05-27 — Phase 3 Step 5: Submission lifecycle + Pipeline view + A3 hard-delete + Preferred flag

### Work done

- **Pre-migration backup** — `scripts/backup-tables.ts` → `backups/pre-step-5-pipeline-2026-05-27T18-20-09-217Z.json` (36 products, 19 submissions, 5 partners). Gitignored.
- **Schema migration (Migration #2)** — `supabase/migrations/20260527182010_step5_submission_lifecycle.sql`: two additive columns — `status TEXT` (nullable, `CHECK` ∈ draft/sent/won/lost/on-hold) and `is_preferred BOOLEAN NOT NULL DEFAULT false`. Existing 19 rows → `status=NULL`, `is_preferred=false`. Plus `GRANT UPDATE, DELETE ON submissions TO authenticated` — **required**, since the initial schema granted only SELECT+INSERT and a policy without the matching table grant has no privilege to act on. Two new RLS policies: `submissions_update_own` (own rows) and `submissions_delete_own_draft` (own rows **and** status draft/NULL — the DB-level A3 delete guard). Paired rollback at `supabase/rollback/step-5-rollback.sql`. Applied via `supabase db push`.
- **Server Actions** — `src/app/(app)/submissions/actions.ts`: `updateSubmissionStatus`, `togglePreferred`, `deleteSubmission`. RLS does the row-level work (and the delete status guard); the actions confirm a live session and treat a zero-row result as "not yours / can't delete". `togglePreferred` sets the target preferred **first**, then clears any other preferred in the same project (case-insensitive) — so a mid-operation failure leaves two preferred (self-correcting on next toggle) rather than zero (Q5: sequential, accept edge case). Shared `submissions/status.ts` is the single source for the enum + badge metadata + `isActiveStatus`/`isDeletable` helpers (no framework imports → safe in server + client bundles).
- **New-submission default** — `calculator/actions.ts` now sets `status: 'draft'` on insert (Q6); pre-Step-5 rows stay NULL.
- **Pipeline view** — `submissions/page.tsx` rewritten as **"My Pipeline"** (Q2): a Server Component that groups submissions by project name (case-insensitive), filters by status via `?status=` query (All / each status / No Status), and sorts active-status groups above draft/NULL-only groups with Ungrouped last. Client component `submissions/pipeline.tsx` renders per row: a preferred star (gold `#FBB040` when set), a colored status dropdown (Q1), View + PDF links, the product → price-book link (Step 3 B3/B4), and a draft/NULL-only inline Delete with Confirm/Cancel. Refresh model = Option A (`revalidatePath` in the action + `router.refresh()` in a transition). Pagination dropped (grouping + MVP scale).
- **Admin view** — `admin/submissions/page.tsx` gains read-only **Status** badge + **Preferred** star columns (no edit, no delete — partners own their pipeline).
- **RLS tests** — `scripts/test-rls.ts` +7 cases (11–17): partner UPDATE own status/is_preferred (pass), UPDATE another's (blocked, 0 rows), DELETE own NULL/draft (pass), DELETE own `sent` (blocked by guard, row retained), DELETE another's (blocked, row retained).

### Verification gates

| Gate | Result |
|---|---|
| Pre-migration backup | ✅ JSON dump (36 products, 19 submissions, 5 partners) |
| `supabase db push` | ✅ migration applied (1 pending) |
| Schema + RLS policies + grants | ✅ verified functionally by the 17/17 RLS suite |
| `npm run build` | ✅ clean — same route set, no new warnings |
| `npm run lint` | ✅ 0 errors — 2 pre-existing `<img>` warnings unchanged |
| `npm test` | ✅ 32/32 pass |
| `scripts/test-rls.ts` | ✅ **17/17 pass** (7 new) |
| Browser smoke (authed pipeline) | ⏳ deferred to Andy — see Detours |

### Detours & fixes

- **In-browser smoke not self-driveable this session.** The preview dev-server tool launched `npm` from the session's primary working directory (`~/`) and ignored `launch.json`'s `cwd`, so the server failed to boot; and the pipeline is auth-gated, which would need a synthetic Supabase login to exercise anyway. Rather than rabbit-hole on the launch config, compilation was taken as covered by `next build` (all routes generated) and the data layer by the 17/17 RLS suite; the authed click-through (status change, star toggle + cross-project clear, status filter, draft-only delete) was handed to Andy with a checklist. Not claimed as self-verified.

### Decisions captured

- [`0037-status-guarded-submission-delete.md`](./decisions/0037-status-guarded-submission-delete.md)

---

## 2026-05-27 — Phase 3 Step 4: Project name autocomplete + Input state persistence

### Work done

- **Pre-migration backup** — `scripts/backup-tables.ts` dumped to `backups/pre-step-4-input-persistence-2026-05-27T00-06-31-837Z.json` (36 products, 18 submissions, 5 partners). Gitignored.
- **Schema migration** — `supabase/migrations/20260527000700_step4_submissions_input_state.sql`: additive `ALTER TABLE submissions ADD COLUMN input_state JSONB DEFAULT NULL`. No constraints, no index, no new RLS policies needed (column inherits existing partner-scoped policies). Paired rollback at `supabase/rollback/step-4-rollback.sql`.
- **Input state persistence** — `actions.ts` now includes `input_state: parsed.data` in the Supabase INSERT. The schema-validated `parsed.data` is the exact structured state (projectName, vms, retentionDays, groups[] with all indices). Atomic with the existing submission creation. Pre-Step-4 submissions have `NULL`.
- **Project name autocomplete** — `calculator/page.tsx` converted to `async` Server Component; queries the partner's distinct project names from prior submissions (case-insensitive dedup, most-recent-first). Passed as `previousProjectNames: string[]` prop to `CalculatorForm`. The project name `<input>` gains a `list="ax-project-names"` attribute and a native `<datalist>` element — zero dependencies, accessible, native substring matching.

**Explicitly cut (per brief):** "Update Calculations" form rehydration from `input_state`. Data is banked; feature deferred until cohort feedback warrants it.

**Verification gates**

| Gate | Result |
|---|---|
| Pre-migration backup | ✅ JSON dump confirmed |
| `supabase db push` | ✅ migration applied cleanly |
| `npm run build` | ✅ clean — same 19 routes |
| `npm run lint` | ✅ 0 errors — 2 pre-existing `<img>` warnings unchanged |
| `npm test` | ✅ 32/32 pass |
| `scripts/test-rls.ts` | ✅ 10/10 pass |
| Manual smoke | ✅ input_state populated; autocomplete working |

---

## 2026-05-26 — Phase 3 Step 3: Calculator UX upgrade

### Work done

All 4 items shipped in one commit. No schema changes, no RLS changes, no migrations.

- **B1** — Submit button moved above the Camera Groups section (after the global settings block). Button starts disabled (`hasInteracted = false`) on fresh page load; a `touch()` latch fires on the first user interaction (any field change, group add/remove/duplicate, retention/VMS/project-name edit). Reset restores the disabled state. Hint text updated to match the new position ("Configure a camera group below, then save…"). The existing `isSubmitting` guard is preserved alongside the new `hasInteracted` check.
- **B2** — `@keyframes ax-rec-fadein` added to `calculator.css` (`opacity 0→1`, `translateY -10px→0`, 300ms ease-out) and applied to `.ax-rec`. Since `RecommendationPanel` is conditionally mounted (`status === "ok" && …`), the animation fires automatically on mount — no React state needed. Re-submissions update in place without re-animating (component stays mounted while `status` stays `ok`).
- **B3** — `productGroupToFamilySlug(productGroup: string): string | null` exported from `families.ts`. Iterates all families checking `productGroups` and `tierSections[].productGroups` case-insensitively; returns `null` for groups that don't map to a price book page (GPU, RAM, NIC, etc.). `RecommendationPanel` wraps `winner.productGroup` in `<Link href="/price-book/{slug}">` when a slug is found; falls back to plain `<span>` otherwise. Link styled via new `.ax-rec-model-link` CSS class (inherits monospace/color, adds hover underline).
- **B4** — Submission History page imports `productGroupToFamilySlug`. The Recommendation column wraps `product_group` in `<Link>` when slug resolves; legacy UUID rows and unmapped groups remain plain text.

**Verification gates**

| Gate | Result |
|---|---|
| `npm run build` | ✅ clean — same 19 routes |
| `npm run lint` | ✅ 0 errors — 2 pre-existing warnings unchanged |
| `npm test` | ✅ 32/32 pass |
| `scripts/test-rls.ts` | ✅ 10/10 pass |

---

## 2026-05-26 — Phase 3 Step 2: Portal polish + Support + Docs scaffold + Deal-Reg email

### Work done

All 10 items shipped across 2 commits. No schema changes, no RLS changes, no migrations.

**Commit 1 — Dashboard chrome + shared footer + Support card + Deal-Reg email**

- **A1** — Page title → "Arxys Partner Dashboard"; card headers `text-xl`; `border-2` card borders; `bg-neutral-50` page background; `shadow-sm` + `hover:shadow-md` card depth.
- **A2** — Extracted shared `Footer` Server Component to `src/app/(app)/_components/footer.tsx`. Rendered on both the dashboard and price book index pages. B6 footer links (About Arxys, Support & Resources, Contact Sales, www.arxys.com) live here.
- **F** — Support card on dashboard: "Support Documentation" text link → `arxys.com/company/support/`; "Open a Support Ticket" gold button → `arxys.supportsystem.com`. Both `target="_blank"`.
- **Deal-reg** — `RegisterDealForm` Client Component (`useActionState`); `registerDealAction` Server Action with zod validation (min 3 / max 200 projectName; max 1000 notes); `sendDealRegistrationEmail` mirroring `submission-notification.ts` pattern; fires to `INTERNAL_NOTIFICATION_EMAIL` with subject `Deal Registration: {projectName} — {company_name}`; no DB write; error state surfaced to form.

**Commit 2 — Price book content + docs scaffold**

- **A4** — "VIDEOX V5" and "MSRP Price Book" rendered as co-equal header elements; verbatim subtitle copy ("VideoX Enterprise IP video servers give security professionals…"); verbatim disclaimer copy ("Prices and specs subject to change…Thanks for your understanding.") replaces old short disclaimer.
- **A5** — Next.js `<Image>` for `Windows_Server_2022.png` (120×100) and `5_year_warranty-circle-2.png` (100×100) in the blue hero right column. Explicit dimensions prevent CLS. Assets placed in `public/price-book/` per manual prereq.
- **A6** — Enterprise Grade highlighted box below hero: `bg-neutral-500` (~50% black, per Andy), `text-white`, `border-l-4 border-[#fbb040]`; two-column bullet grid at `md:` breakpoint. Six standard-equipment bullets verbatim.
- **B5** — H.265 HEVC performance banner: full-width bleed (`-mx-4`, matching top hero width) with `bg-[#03396f]`; small "H.265 HEVC" badge; verbatim heading and body copy; "Learn More →" CTA → `arxys.com/videox-v5-launch-deliver-on-the-promise-of-h-265-today/`.
- **B6** — "View all VideoX Appliances" link in price book hero; four footer links in `Footer` component (About Arxys, Support & Resources, Contact Sales for Custom Configurations, www.arxys.com). All `target="_blank" rel="noopener noreferrer"`.
- **G** — Documentation section on every family detail page (below the fine-print block): if `datasheetUrl` non-null, renders a doc card with download icon; if null, renders "Documentation coming soon." Standalone hero-area datasheet buttons removed — consolidated into this section. (Q4 default was "omit when null" but Andy overrode to "coming soon" before execution.)

**Verification gates**

| Gate | Result |
|---|---|
| `npm run build` | ✅ clean — same 19 routes, no new warnings |
| `npm run lint` | ✅ 0 errors — 2 pre-existing `<img>` warnings unchanged |
| `npm test` | ✅ 32/32 pass — no new tests required (no business logic) |
| `scripts/test-rls.ts` | ✅ 10/10 pass — no RLS changes |

### Detours & fixes

- **Zod 4.x API change:** `parsed.error.errors` no longer exists; the array is `parsed.error.issues` in Zod v4. Build caught this on first compile; one-line fix.

---

## 2026-05-22 — Portal Phase 2 closure

### Work done

Portal Phase 2 closed. Decision recorded in ADR [`0036-phase-2-closure-and-phase-3-scope.md`](./decisions/0036-phase-2-closure-and-phase-3-scope.md).

**Phase 2 deliverables (Steps 1–9):**

| Step | Outcome |
|---|---|
| 1 — Minimal portal branding | Arxys Gold + logo live; portal reads as Arxys |
| 2 — Master Sheet validation | 36 SKUs validated; SKU naming convention locked (`VX5-<GROUP>-<TIER>`) |
| 3+4 — Schema migration + algorithm rewrite | `products` SKU-PK; recommend() picks specific SKUs from real MSRPs |
| 5+6 — Push script + real pricing live | Sheet → Supabase + Pipedrive; ADR 0019 closed |
| 7 — Partner XLSX download | Dashboard widget; 36 rows; MSRP-only |
| 8 — HTML price book live | `/price-book` index + 10 family pages; arxys.com-branded |
| 9 — Internal verification | Folded into Step 8 polish commits; surfaced + fixed: compliance badges, V600–V800 net storage, warranty KPIs, SW section, V700/V800 hero, dual datasheet buttons |

**Deferred to Phase 3 (per ADR 0036):**

- Step 10 — 2-3 partner cohort invite. Better sequenced *after* custom domain to avoid mid-onboarding domain switch.
- Step X — Custom domain `portal.arxys.com`. CNAME + Vercel + Supabase auth URL update + email template SiteURL.

**Numbering housekeeping done in same commit:** ADR `0032-price-book-brand-scope.md` renumbered to `0035-price-book-brand-scope.md` to resolve a double-assignment with `0032-sku-level-recommendation-algorithm.md` (Step 3+4 — kept its number, ADR rule "numbers never reused even if superseded"). One JOURNAL cross-reference updated.

**Plan + index housekeeping:**

- `docs/phase-2-plan.md` — Status header → Complete. Document stays as historical record.
- `docs/README.md` — Forward-looking-plans table updated to show Phase 2 Complete + placeholder for Phase 3 plan (to be created when scoped).

### Phase 2 retrospective

**What went well:**

- Three-doc discipline held throughout. Every step has a JOURNAL entry + ADR(s) where decisions were non-obvious. Future reader can reconstruct *why* from the docs alone.
- Step scoping briefs at `docs/phase-2/step-N-*.md` worked. Each brief was self-contained enough that a fresh session (Opus for 3+4; Sonnet for everything else) could pick it up cold.
- Backup posture innovation (Step 3+4 JSON dump + reverse-migration SQL pair) replaced the missing Supabase-Pro snapshot feature cleanly. Reusable for future destructive migrations.
- Manual smoke testing folded into the implementation step (Step 8) rather than a separate step caught real issues fast (the post-deploy `/submissions` embed-via-FK regression on Step 3+4 + the V700/V800 hero swap + the SW workstations table-column-shape requirement).

**What to carry into Phase 3:**

- ADR discipline includes uniqueness-check of next number before writing. Step 8b's session didn't realize 0032 was taken (the SKU one was committed days earlier in a different session). A fresh `ls docs/decisions/` is a 2-second pre-flight.
- When dropping or replacing FKs, grep BOTH the column name AND the PostgREST embed-alias patterns (`<col>(...)`). Step 3+4's post-deploy regression was caused by exactly this gap.
- Step briefs that pre-seed substantial content (Step 8b's families.ts seed, Step 5+6's push script field map) saved hours of Sonnet's clerical work and produced cleaner code on first pass.
- The `arxys-company` skill correctly identifies brand tokens (Gold + Grey + Montserrat) but the live arxys.com CSS adds two more: navy `#054A91` primary and Poppins headings. These are now in `globals.css` scoped to /price-book/* — Phase 3 may want to extend portal-wide.

### Decisions captured

- [`0036-phase-2-closure-and-phase-3-scope.md`](./decisions/0036-phase-2-closure-and-phase-3-scope.md)

### Pending / Phase 3 inputs

- Custom domain `portal.arxys.com` — CNAME + Vercel + Supabase auth URL + email template SiteURL. ADR [0025](./decisions/0025-supabase-custom-smtp-and-branded-templates.md) "when to revisit" is now the trigger.
- 2-3 partner cohort selection (who, in what order, canary-first cadence).
- Phase 3 plan doc (`docs/phase-3-plan.md`) when scoped.

---

## 2026-05-22 — Price book polish: compliance badges, storage data, warranty KPIs, SW section

### Work done

- Fixed upgrade options MSRP color from blue (`text-[#054A91]`) to black (`text-neutral-900`) — blue made them look like links.
- Updated compliance badges on both index and detail pages: removed "PSA Security Partner", changed "TAA & NDAA Compliant" → "NDAA Compliant", expanded "Multi-VMS Validated" to include full partner list (Milestone, Avigilon, Genetec, NXWitness, Hanwha, Exacq, Axxonsoft), increased badge text from `text-xs` to `text-sm` for readability.
- Added `skuExtraData` for V600 (224/280/336 TB), V700 (316/400/480 TB), V800 (480/600/720 TB) — fixes Net Usable Storage column showing "—" for first and third SKUs of each family. Values sourced from PPTX (not DB; `max_storage_tb` only stores raw capacity for the middle SKU).
- Updated warranty KPI to consistent format `{ label: "Warranty Support", value: "X Years", unit: "Next Business Day Parts" }` for V700, V800 (were "Warranty / 5 / years NBD") and SW (was "Warranty / 3 / years").
- Moved SW workstations from `category: "high-density"` to `category: "workstations"` and added `"workstations"` to `categoryOrder` in the index page, so SW now renders in its own "Security Workstations" section at the bottom.
- Deleted `scripts/check-storage.ts` (temp debug artifact).

---

## 2026-05-22 — Phase 2 Step 8: HTML price book live

### Work done

- Built `/price-book` index and `/price-book/[slug]` family detail routes (Next.js Server Components).
- Created `src/lib/price-book/families.ts` with all 10 family-page concepts: V100 (+ V150 tier), V250 (V255 tier skipped — single table), V260 (V270 tier skipped — single table), V200, V400, V500, V600, V700, V800, SW workstations. Content lifted verbatim from `/tmp/arxys-pricebook.txt` (pdftotext of the V5 MSRP PPTX).
- Added `cardEyebrow`, `upgradeSkus`, `skuExtraData`, and `category` fields to the Family type beyond the brief's base schema. These were necessary to: match index card copy from the mockup, encode per-family upgrade lists from the PPTX, provide static cell overrides for SSD/monitor columns not in the DB schema, and drive the 3-section index grouping.
- Parameterized SKU table column set via `SkuColumn[]` — SW workstations use `bandwidth + monitors` columns instead of `netStorage`; V250/V260 use `ssdStorage`. `skuExtraData` per-SKU overrides handle display values not stored in the DB (SSD configs as text, monitor counts for SW).
- Upgrade SKU lists are per-family (not universal) — direct reading from PPTX pages. V700/V800 include `VX5-RAM-32GB`; V100 only `VX5-GPU-A1000`; SW includes `VX5-PP5-V100`.
- Added `--color-arxys-navy`, `--color-arxys-navy-deep`, `--color-arxys-navy-soft`, `--font-poppins` to `globals.css` `@theme inline` block. Scoped Poppins headings + Montserrat body behind `.price-book-route` class on the price book layout wrapper. Print styles scoped using `body:has(.price-book-route)`.
- Google Fonts loaded via `<link>` in the price book `layout.tsx` (not CSS `@import`): PostCSS/Tailwind 4 expands `@import "tailwindcss"` inline, leaving any subsequent `@import url()` after generated rules — invalid CSS. Route-level `<link>` tags are the correct Next.js App Router pattern.
- Migrated 5 hero images from `docs/phase-2/mockups/step-8a/assets/` to `public/price-book/`. SW workstation hero is `null` — no workstation image was extracted from the PPTX at mockup time; SW index card and detail page use a gold "SW" text placeholder. Replace when asset is available.
- Added "VideoX V5 Price Book" card to dashboard page and "Price Book" nav link to the app layout (alongside Dashboard / Calculator / Submissions / Admin / Sign out).
- Wrote `src/lib/price-book/families.test.ts` (8 assertions); all pass. Also removed `import "server-only"` from families.ts — the `server-only` package throws when imported outside the Next.js runtime (the tsx test runner has no Next.js shim). The existing `xlsx.ts` in the same dir follows the same pattern of no guard; the Server Component pages are the actual gate.
- Installed `server-only` package as a dep so the import resolves during build even if not used.
- **Datasheet URL liveness probe (2026-05-22):** 6 of 10 families have published datasheets. Four return 404 and have `datasheetUrl: null` (button hidden): V250, V260, V500, SW. Six are live: V100, V200, V400, V600, V700, V800.

### Detours & fixes

- **`@import url()` in globals.css fails with PostCSS/Tailwind 4:** The brief specified adding a Google Fonts `@import url()` to `globals.css`. After `@import "tailwindcss"`, the PostCSS plugin inlines all Tailwind utilities, making any following `@import url()` invalid CSS (must precede all rules). Moving the import before `@import "tailwindcss"` is also wrong — PostCSS re-orders the output. **Fix:** moved Google Fonts to route-scoped `<link>` tags in the price book `layout.tsx`. This is the idiomatic Next.js App Router approach anyway.
- **`import "server-only"` breaks tsx test runner:** The package throws with "This module cannot be imported from a Client Component module" when called outside the Next.js runtime. Removed the guard from `families.ts`; families.ts is pure data (no server APIs) so the guard added no real protection. Tests now pass cleanly.

### Decisions captured

- [`0035-price-book-brand-scope.md`](./decisions/0035-price-book-brand-scope.md) (originally numbered 0032; renumbered at Phase 2 close to resolve a collision with `0032-sku-level-recommendation-algorithm.md` — see Phase 2 close-out entry)

---

## 2026-05-21 — Phase 2 Step 7: Partner XLSX download

### Work done

- Installed `exceljs` (90 packages, pure JavaScript, no native bindings) as a runtime dependency.
- Created `src/lib/price-book/xlsx.ts`: pure generator — `generatePriceBookXlsx(rows, generatedAt)` returns a `Buffer`; `priceBookFilename(date)` returns `Arxys-Price-List-YYYY-MM-DD.xlsx`. Arxys Gold (`#FBB040`) header row at row 4; title + generated-at stamp in rows 1–2; numeric MSRPs use `numFmt '"$"#,##0.00'`; MKT rows emit `"Market Price"`, CFQ rows emit `"Call for Quote"`.
- Created `src/lib/price-book/xlsx.test.ts`: 2 new tests (workbook shape + filename format). All 23 tests pass.
- Created `src/app/(app)/api/price-book/xlsx/route.ts`: GET handler under the `(app)` layout group. `runtime = "nodejs"` (exceljs uses Node streams); `dynamic = "force-dynamic"` (always freshly queries `products`). Unauthenticated requests are caught by the `(app)` layout first (307 → `/login`) and by an explicit `!user` 401 guard inside the handler.
- Added "VideoX price list" download card to `src/app/(app)/dashboard/page.tsx` (third card slot, before the admin card).
- `npm run build`: clean, `/api/price-book/xlsx` appears in route table as `ƒ` (dynamic).
- `npm run lint`: 0 errors, 2 pre-existing `<img>` warnings.
- `scripts/test-rls.ts`: 10/10 pass (no RLS changes in this step).

**Decisions (all recommended defaults from the step brief):**

| Q | Decision |
|---|---|
| Q1 | `exceljs` — mature, full styling, currency `numFmt`, Node-only (no client-bundle impact) |
| Q2 | Dashboard only — XLSX is reference data, not submission-related |
| Q3 | Four columns: SKU, Product Name, Product Group, MSRP |
| Q4 | `"Market Price"` / `"Call for Quote"` strings — matches future Step 8 HTML price book |
| Q5 | `Arxys-Price-List-YYYY-MM-DD.xlsx` — date-stamped, dashes-only |
| Q6 | Title + generated-at header rows (rows 1–2), column headers at row 4, data from row 5 |
| Q7 | `numFmt '"$"#,##0.00'` on the numeric cell — raw number stored, currency displayed |
| Q8 | `force-dynamic` — always fresh from Supabase |

### Decisions captured

- [`0034-xlsx-library-choice.md`](./decisions/0034-xlsx-library-choice.md)

---

## 2026-05-21 — Phase 2 Steps 5+6: Real pricing pipeline live

### Work done

Built and ran the Master Sheet → Supabase + Pipedrive push pipeline. Supabase `products` now carries all 36 Sheet rows; Pipedrive Products are in sync. `deal.ts` emits real deal values; the partner UI shows real prices. Brief: [`docs/phase-2/step-5-and-6-push-and-display.md`](./phase-2/step-5-and-6-push-and-display.md).

**Eight locked decisions (Andy, 2026-05-21):**

| Q | Choice | Implication |
|---|---|---|
| **Q1** | (b) CSV export URL, no service account | Same auth path as `validate-prices-sheet.ts`; Sheet is intentionally public-link-viewable |
| **Q2** | Existing Pipedrive entries with some matching SKUs | All 36 Sheet SKUs were already in Pipedrive (0 new, 10 updated, 940 legacy SK-* flagged print-only) |
| **Q3** | (a) MKT/CFQ prefix in Pipedrive name | `[MKT] …` / `[CFQ] …` prefix; price = 0; sales sees all SKUs |
| **Q4** | (a) Skip Pipedrive category | Categories not configured; setting unknown string would fail API |
| **Q5** | (a) Print-only removal | Flagged-for-removal rows listed in preview, never auto-deleted |
| **Q6** | VX5-PP5-V100 not in Sheet | Push = 36 rows; add in a follow-up push when Andy updates the Sheet |
| **Q7** | (a) `value = winner.totalCostUsd` | Pipedrive deal `value` now shows the real total list price |
| **Q8** | (a) ADR 0019 → Superseded by #0033 | ADR 0033 written; ADR 0019 closure note added |
| **Legacy display** | (b) Show `"(legacy pricing — pre-Phase-2)"` | 12 pre-migration submissions no longer show misleading $1–$57 placeholder totals |

**New scripts:**
- `scripts/backup-pipedrive-products.ts` — dumps `GET /v1/products` (paginated) to `backups/pipedrive-products-pre-step-5-<timestamp>.json`.
- `scripts/push-prices.ts` — full pipeline: `validateSheet()` → CSV fetch → Supabase + Pipedrive diff → CONFIRM gate → UPSERT. `--dry-run` flag prints preview without writing. Capacity columns (`max_cameras`, `max_storage_tb`) preserved from existing Supabase rows so the 6 V-family seed rows keep their calculator capacity.

**Backups taken (pre-push):**
- Supabase JSON: `backups/pre-step-5-6-real-pricing-2026-05-21T23-29-23-087Z.json` (6 products, 13 submissions, 4 partners)
- Pipedrive Products JSON: `backups/pipedrive-products-pre-step-5-2026-05-21T23-29-26-179Z.json` (1019 products — includes legacy SK-* / SC-* lines)

**Push results (first real run):**
- Supabase: 36 upserted (30 new + 6 updated seed rows), 0 errors
- Pipedrive: 36 upserted (10 updated + 26 no-ops matched by code), 0 errors
- Idempotent re-run: 0 new, 0 updated in both targets — fully in sync

**Surgical consumer fixes (Step 6):**
- `src/lib/pipedrive/deal.ts`: `value: 0` → `value: winner.totalCostUsd`; portal URL → `/submissions/${submissionId}` permalink; Phase 1 placeholder note creation removed.
- `src/app/(app)/_components/submission-detail.tsx`: legacy submissions (UUID-shaped `recommended_product_id`) show `"(legacy pricing — pre-Phase-2)"` instead of the stored $1–$57 placeholder totals.
- `src/lib/pipedrive/deal.test.ts`: updated `value` assertion (0 → 222144), portal URL assertion, removed "pins a Phase 1 placeholder note" test.

**ADRs:**
- [`0019`](./decisions/0019-defer-real-pricing-to-phase-2.md) — status updated to Superseded by #0033
- [`0033`](./decisions/0033-real-pricing-live-in-phase-2.md) — new; captures Q1–Q8 outcomes

### Detours & fixes

- **`backup-tables.ts` referenced dropped `server_specs`**: The script still listed `server_specs` in `TABLES` after Step 3+4 dropped the table. Fix: removed `server_specs` from the `TABLES` const.
- **Validator `main()` ran twice on import**: `validate-prices-sheet.ts` calls `main()` unconditionally at module level. When `push-prices.ts` imports `validateSheet`, the `main()` ran as a side effect, producing duplicate validation output. Fix: guarded with `if (process.argv[1]?.includes("validate-prices-sheet"))`.
- **Supabase untyped client + upsert literal table name**: `admin.from("products").upsert(chunk)` fails type check because Supabase resolves the insert row type to `never` when no `Database` generic is provided and the table name is a string literal. Used `chunk as unknown as never[]` double assertion (same escape as `deal.ts` uses for `payload as Parameters<...>[0]`).

### Decisions captured

- [`0033-real-pricing-live-in-phase-2.md`](./decisions/0033-real-pricing-live-in-phase-2.md)

---

## 2026-05-21 — Phase 2 Steps 3+4: Schema migration + recommendation algorithm rewrite

### Work done

Replaced the 6-row family `products` table with the proposal's SKU-PK schema and rewrote the recommendation algorithm to pick a specific SKU instead of a V-family. One coherent commit; brief at [`docs/phase-2/step-3-and-4-schema-and-algorithm.md`](./phase-2/step-3-and-4-schema-and-algorithm.md).

**Five locked decisions (Andy, 2026-05-21):**

| Q | Choice | Implication |
|---|---|---|
| **Q1** | (b) Drop FK; `submissions.recommended_product_id` UUID → TEXT | 12 historical UUIDs preserved as opaque strings; submission-detail + PDF render "(legacy data)" |
| **Q2** | (ii) Inline `max_cameras` + `max_storage_tb` on products; drop `server_specs` | Calculator action queries products only |
| **Q3** | (b) Per-family `max_cameras` from old server_specs | V200→100, V400→200, V500/V600→275, V700/V800→325 |
| **Q4** | (a) Filter `recommend()` to `price_type='numeric'` | MKT (`VX5-RAM-32GB`) + CFQ (`VX5-SW30-300`, `VX5-SW35-300`) never recommended |
| **Q5** | (a) Family-friendly Pipedrive string | `arxys_recommended_models` + admin `Recommended Server` stay `"N × V800"` via `winner.productGroup` |

ADR [`0031`](./decisions/0031-step-3-4-schema-migration.md) records Q1–Q5 + the backup posture; ADR [`0032`](./decisions/0032-sku-level-recommendation-algorithm.md) records the algorithm-rewrite decisions (numeric-only filter, tighter-fit tie-break, warning shape).

**Backup posture (free-plan substitute, see Detours).** Free-plan Supabase has no dashboard snapshots, so the recoverable-backup gate for this destructive migration is a pair of locally-produced artifacts:

1. Service-role JSON dump → `backups/pre-step-3-4-sku-pk-migration-2026-05-21T19-01-41-093Z.json` (30 KB; 6 products + 6 server_specs + 12 submissions + 4 partners). Produced by the new `scripts/backup-tables.ts`. Gitignored (`/backups/` added to `.gitignore` — real partner data never enters git).
2. Reverse-migration SQL → `supabase/rollback/step-3-4-rollback.sql` (lives outside `supabase/migrations/` so the CLI never auto-applies it). Reverts the schema; pairs with `scripts/restore-tables.ts` to fully restore.

This pair is documented in ADR 0031 as the recoverable-backup pattern for every future destructive Phase 2 migration on the free plan.

**Migration** — `supabase/migrations/20260521190350_step3_4_products_sku_pk.sql`:

1. Drop `submissions_recommended_product_id_fkey`.
2. `drop table server_specs cascade; drop table products cascade;`.
3. `alter table submissions alter column recommended_product_id type text using recommended_product_id::text;`
4. Create new `products`: `sku TEXT PK`, `product_name`, `msrp NUMERIC nullable`, `price_type CHECK in ('numeric','market','call_for_quote')`, `product_group`, `sort_order`, `active`, `max_cameras`, `max_storage_tb`, `updated_at`. Plus `CHECK (price_type='numeric' implies msrp not null)` and four indexes.
5. RLS: `products_select_active_or_admin` (same shape as before).
6. Seed 6 mid-tier VideoX SKUs verbatim from the live Master Sheet validated in Step 2:

   | SKU | product_group | MSRP | max_cameras | max_storage_tb |
   |---|---|---|---|---|
   | VX5-V200-80 | V200 | $16,640 | 100 | 80 |
   | VX5-V400-160 | V400 | $26,910 | 200 | 160 |
   | VX5-V500-240 | V500 | $35,926 | 275 | 240 |
   | VX5-V600-320 | V600 | $41,659 | 275 | 320 |
   | VX5-V700-480 | V700 | $54,512 | 325 | 480 |
   | VX5-V800-720 | V800 | $74,048 | 325 | 720 |

   Step 5's push script UPSERTs the full ~36-row Sheet over this seed.

**Algorithm rewrite** — `src/lib/recommend/algorithm.ts`:

1. Filter the pool to `priceType === 'numeric'` (defensive; calculator action also filters at the query layer).
2. Evaluate each SKU: `units = max(1, ceil(cams/maxCams), ceil(storage/maxStorageTb))`; `totalCost = units × msrp`; `driverDimension = storage > cameras ? 'storage' : 'cameras'`.
3. Rank by `(totalCost ASC, units ASC, excess-in-driver-dimension ASC, sku ASC)`.
4. Warnings: `units > 1` → "Workload exceeds a single {productGroup}; recommendation stacks {units} units of {sku}." + "exceeds the largest single VideoX SKU" when either dimension overflows.

Candidate shape now carries `sku`, `productGroup`, `productName`, `unitMsrp` directly — no second lookup needed by Pipedrive deal builder or PDF render.

**Consumer updates:**

- `src/lib/recommend/types.ts` — new candidate shape (sku, productGroup, productName, unitMsrp). `ServerSpec` mirrors the new products columns.
- `src/lib/recommend/algorithm.test.ts` — 8 original tests rewritten with SKU-level fixtures + real MSRPs; +2 new tests (MKT/CFQ exclusion, tighter-fit tie-break); +1 throw-when-pool-empty. 11 cases total.
- `src/app/(app)/calculator/actions.ts` — dropped server_specs join; query `products` with `active=true AND price_type='numeric'`; persists `winner.sku` as TEXT into `submissions.recommended_product_id`.
- `src/lib/pipedrive/deal.ts` — derives `"N × {productGroup}"` from `winner.productGroup` (Q5a).
- `src/lib/pipedrive/deal.test.ts` — fixture updated to new candidate shape.
- `src/lib/email/submission-notification.ts` — sales + partner notification emails reference `winner.productGroup` (family-friendly).
- `src/app/(app)/calculator/calculator-form.tsx` — post-submit "Recommended configuration" panel shows `winner.productGroup`.
- `src/lib/pdf/render.ts` — `loadProductBySku()` replaces `loadProductAndSpec()`; renders `"(legacy data — product details unavailable)"` when `recommended_product_id` is UUID-shaped (pre-migration). Uses `productGroup` for the displayed model code.
- `src/app/(app)/_components/load-submission.ts` — splits into two queries (submission, then product-by-SKU) since PostgREST embed-via-FK no longer works (the FK was dropped).
- `src/app/(app)/_components/submission-detail.tsx` — new product shape (sku, product_name, product_group); "Product notes" row → "Product family"; legacy-data rendering matches PDF.
- `scripts/test-rls.ts` — +9a (partner SELECT new products shape) + 9b (inactive products invisible to partner). 10 cases total.

**Verification gates** (11 from the brief):

1. ✅ Read migration carefully before push.
2. ✅ Backup taken (JSON dump + reverse migration; recorded above).
3. ✅ `supabase db push` — applied cleanly (Andy ran).
4. ✅ Schema verified via service-role: 6 products in SKU-PK shape; `server_specs` absent (`PGRST205: Could not find the table 'public.server_specs'`).
5. ✅ Seed verified: 6 rows, all numeric, sort_order 1–6.
6. ✅ Historical data: 12 submissions all carry UUID-shaped TEXT in `recommended_product_id`.
7. ✅ `npm run lint` — 0 errors, 2 pre-existing `<img>` warnings from Step 1.
8. ✅ `npm run build` — clean, 15 routes (Turbopack, 2.7s).
9. ✅ `npm test` — 22/22 pass (was 19; +3 from new MKT/CFQ + tighter-fit + Pipedrive fixture-shape coverage).
10. ✅ `scripts/test-rls.ts` — 10/10 pass (was 8; +9a + 9b).
11. ⚠️ Manual dev-server smoke — **deferred** with documented residual risk. The risk surface is bounded: build type-check passes; unit + Pipedrive tests cover logic; RLS tests cover policies; SubmissionPdf component didn't change shape; only the SKU-by-product loader changed in render.ts (mirror of the same pattern that already passed type-check). A live UI smoke remains the canonical confirmation, deferred to the next session when Andy is at the keyboard.

**Recommendation outcomes vs Phase 1 (sanity check):**

With real MSRPs from the seed, the algorithm now picks differently for the same workload. Example: workload (150 cameras, 100 TB):

- **Phase 1 (placeholder $1–$6)**: 2× V200 ties 1× V400 at totalCost=$2; V200 wins on unit-price tiebreak.
- **Phase 2 (real MSRPs)**: 2× V200 = $33,280 vs 1× V400 = $26,910 → **1× VX5-V400-160 wins** on primary cost. Materially different from Phase 1 and matches sales intuition (one bigger box vs two smaller ones at a real price gap).

### Detours & fixes

- **Free Supabase plan has no dashboard snapshots.** The brief's "Backup before migrating" §1 recommends "Database → Backups → Create backup" but that feature is Pro-only ($25/mo). Andy surfaced this when the question was raised. Resolved by writing `scripts/backup-tables.ts` (service-role SELECT * → JSON file; 60 lines) and pairing it with `supabase/rollback/step-3-4-rollback.sql` (hand-written reverse migration that recreates the pre-migration shape so the JSON can be restored). The pair lives in repo as the new free-plan-compatible backup pattern for any future destructive migration. Documented in ADR 0031.

- **Brief's tertiary tie-break wording was self-contradictory.** "Capacity utilization ascending (less over-provisioning preferred)" — ASC utilization = LOW utilization = MORE over-provisioning, which contradicts the second clause. Resolved silently in code by treating "less over-provisioning" as authoritative: tertiary = excess capacity in driver dimension ASC. Explicitly documented in ADR 0032 + the algorithm-module header comment so future readers don't re-litigate. Test case "tighter-fit tie-break: same cost + same units -> smaller excess wins" pins the chosen semantics.

- **Forgot to update three consumer call sites referencing `winner.modelCode` before running build.** The first `npm run build` failed type-check at `src/app/(app)/calculator/calculator-form.tsx:586` (post-submit recommendation panel). Grep then surfaced two more in `src/lib/email/submission-notification.ts:54` + `:83` (sales + partner notification email bodies). All three changed to `winner.productGroup` (family-friendly, matching Q5a) in one batch. The Pipedrive deal test fixture also needed updating from the old candidate shape — caught by `npm test` after the calculator-form fix.

- **`server_specs` absence probe used a stale regex.** A late verification ran `await admin.from('server_specs').select('*').limit(1)` and expected `/does not exist/i` in the error message. PostgREST actually returns code `PGRST205` + message `"Could not find the table 'public.server_specs' in the schema cache"` — the words "does not exist" never appear. The first probe printed `FAIL`; the corrected probe `/(does not exist|Could not find the table|PGRST205|42P01)/i` returned `CONFIRMED MISSING`. Not a real failure, just a regex bug in the verification one-liner.

- **One algorithm test miscounted warnings.** "Large workload — VX5-V500-240 cheapest at 2 units" asserted `warnings.length === 1` but 500 cameras > 325 (the largest single SKU's max_cameras) so the "exceeds the largest single VideoX SKU" warning also fires. Bumped to `length === 2` and added a positive match for the second warning string. Caught on first test run.

- **PostgREST embed-via-FK stops working when the FK is dropped.** `load-submission.ts` used `products:recommended_product_id(name, description, sku)` to fetch the joined product row in a single query. After Q1(b) drops the FK, that embed silently returns null even when the target SKU exists. Rewrote into two sequential queries (submission, then products by SKU, skipping if the value is UUID-shaped) — a few extra ms but explicit and resilient to legacy strings.

- **`server-only` import blocks tsx scripts.** A planned smoke test (`node --import tsx` calling `loadSubmissionPdfInput` directly) failed with `Cannot find module 'server-only'`. That module is a Next.js convention to prevent server-side modules from being bundled into client code; it's a no-op at runtime under Next but resolves to an empty package under plain tsx via Node's resolution. Couldn't fix in-session without restructuring the PDF module, and the smoke value vs. the build's full type-check is marginal. Documented as a known limitation in the verification gates above — the live UI smoke remains the canonical confirmation if the algorithm or PDF renderer ever needs deeper scrutiny.

- **Post-deploy regression on `/submissions` + `/admin/submissions` list pages — PostgREST embed-via-FK to a dropped FK.** Within ~10 minutes of `b0493f4` landing on Vercel, Andy hit `Failed to load submissions: Could not find a relationship between 'submissions' and 'recommended_product_id' in the schema cache` on the partner-facing `/submissions` page. Same error on `/admin/submissions`. Both list pages had their own inline Supabase query using the embed-alias syntax `products:recommended_product_id(name, sku)`, which PostgREST resolves by walking the FK metadata — gone after Step 3+4 dropped `submissions_recommended_product_id_fkey`. The detail-page loader (`_components/load-submission.ts`) was correctly rewritten to the two-query pattern in the original commit; the list pages were missed because the pre-commit grep ran on `winner.modelCode | winner.productId` — those terms catch the algorithm-output rename — but the embed syntax uses the *column name* as an alias, so a grep on `recommended_product_id` (or `products:`) would have surfaced both list pages. Hotfix `d02556c` mirrors the load-submission.ts pattern on both list pages: drop the embed, batch-fetch products with `WHERE sku IN (...)` for the rows on the current page, render `N × {product_group}` (family-friendly per Q5a) for SKU-shaped values and `N × (legacy)` for UUID-shaped historical FKs. Build + test suite still green. Lesson: when dropping a FK, grep both the column name and the embed-alias patterns (`<column>(...)`) — they're the two places PostgREST relies on schema-cache FK metadata. Folded into the Step 5+6 brief's verification section.

### Decisions captured

- [`0031-step-3-4-schema-migration.md`](./decisions/0031-step-3-4-schema-migration.md)
- [`0032-sku-level-recommendation-algorithm.md`](./decisions/0032-sku-level-recommendation-algorithm.md)

### Pending / follow-ups

- **Manual dev-server smoke** — deferred (gate 11). Recommended at the start of the next session: `npm run dev`, submit a calculation at `/calculator`, confirm a specific SKU is recommended; view at `/submissions` + `/admin/submissions/[id]`; download the PDF and check the SKU + price; pull up one of the 12 pre-migration submissions and confirm "(legacy data — product details unavailable)" renders.
- **Real FK on `submissions.recommended_product_id`** is not added now because the value space still includes legacy UUID strings. After the legacy rows age out (or are pruned) and Step 5 lands the full SKU population, a `references public.products(sku)` constraint can be added in a follow-up migration.
- **`unitMsrp` field on `RecommendationCandidate`** is currently not displayed anywhere. Retained as an audit field (sales can reconcile `units × unitMsrp = totalCostUsd`); drop if it stays unused after Step 6 / 7.
- `docs/phase-2/step-3-4-pause-handoff.md` — written mid-session as a resume recipe when the session was almost out of budget. Now superseded by this JOURNAL entry; deleted as part of the same commit.

---

## 2026-05-21 — Phase 2 Step 2: Master Sheet validation

### Work done

- Installed `csv-parse` as a devDependency (standards-compliant CSV parser; handles quoted fields and ragged trailing columns the sheet has in its header row).
- Created `scripts/validate-prices-sheet.ts` — standalone CLI that fetches the master sheet as CSV, validates all rows, and prints a structured report. Exports `validateSheet()` so Step 5's push script can import the validation function without duplication. Run via: `node --import tsx scripts/validate-prices-sheet.ts`
- Ran validation against the live sheet. **36 data rows, all pass.** Zero violations.

**Validation report (2026-05-21):**

| Check | Result |
|---|---|
| Fetch CSV | HTTP 200, 36 data rows + 1 header |
| All SKUs non-empty | ✓ |
| All SKUs match `VX5-<GROUP>-<TIER>` | ✓ |
| No duplicate SKUs | ✓ |
| All MSRPs are NUMERIC / MKT / "Call for Quote" | ✓ |

Derived Product Groups (20): `GPU, NIC, RAM, SW10, SW20, SW25, SW30, SW35, V100, V150, V200, V250, V255, V260, V270, V400, V500, V600, V700, V800`

MSRP ranges per group:
- GPU: $1,575 | NIC: $300–$1,024 | RAM: MKT (no numeric)
- SW10: $6,085 | SW20: $7,532 | SW25: $8,359 | SW30: CFQ | SW35: CFQ
- V100: $8,317–$9,558 | V150: $7,030 | V200: $15,657–$18,139
- V250: $13,748 | V255: $16,175 | V260: $14,029 | V270: $17,890
- V400: $24,975–$29,861 | V500: $32,978–$40,425 | V600: $37,728–$47,657
- V700: $48,615–$63,509 | V800: $64,922–$87,971

MKT rows: `VX5-RAM-32GB` | CFQ rows: `VX5-SW30-300`, `VX5-SW35-300`

**VX5-PP5-V100 not present** (see Decision 3 below).

### Andy's five decisions (locked)

1. **Sheet is canonical.** The Sheet at `12zwFhDynV6T4ehxui7y-i6F-8XjEYFRBPgsAicpksmk` is the single master. No rival copy.
2. **SKU naming convention confirmed.** All future products follow `VX5-<GROUP>-<TIER>` (GROUP: uppercase/digit; TIER: starts uppercase/digit, allows mixed case). Push script will reject rows that break this.
3. **VX5-PP5-V100 — add to sheet (option a).** Andy will add `VX5-PP5-V100 / 5 Year Protection Plan / $1,995` to the sheet. Validation script will pick it up on next run. Step 5 will push it to Supabase/Pipedrive.
4. **Partner Discount Price column — leave in sheet, ignore in scripts (option a).** Column D stays informational; push script and all downstream tooling ignore it. Step 8 HTML price book will also ignore it (MSRP-only per PQ3).
5. **SW group taxonomy — keep granular.** SW10, SW20, SW25, SW30, SW35 stay as separate product groups in Supabase and Pipedrive. No collapse rule in the push script.

### Verification gates passed

- `npm run lint` — 0 errors (2 warnings from Step 1's `<img>` tags, pre-existing).
- `npm test` — 19/19 pass.
- `npm run build` — clean.
- `node --import tsx scripts/validate-prices-sheet.ts` — exits 0, all checks pass.

---

## 2026-05-21 — Phase 2 Step 1: Minimal portal branding

### Work done

- Added Arxys brand tokens to `src/app/globals.css` `@theme inline` block: `--color-arxys-gold: #fbb040`, `--color-arxys-gold-hover: #e69e2c`, `--color-arxys-text-on-gold: #1a1a1a`, `--color-arxys-grey: #d1d2d4`. Source: ADR 0025. This makes Tailwind classes `bg-arxys-gold`, `hover:bg-arxys-gold-hover`, `text-arxys-text-on-gold`, `border-arxys-grey` available app-wide.
- **Logo (Q1 — reused email asset)**: No new asset supplied. `public/email/arxys-logo.png` (250×43, transparent, Arxys Gold wordmark) used directly at its existing path. Email templates are unaffected.
- Replaced the text title "Arxys Partner Portal" in `src/app/(app)/layout.tsx` header with a plain `<img>` tag referencing the logo at 140px wide. Partner name / contact info line retained below.
- Replaced the `<h1>` title in `src/app/(auth)/layout.tsx` auth card with the same logo `<img>` (centered, `inline-block`). Text sub-title dropped as it was redundant with page context.
- Swapped primary button colors from `bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400` to `bg-arxys-gold text-arxys-text-on-gold hover:bg-arxys-gold-hover disabled:opacity-50` in four files:
  - `src/app/(auth)/login/login-form.tsx` — "Sign in" submit
  - `src/app/(auth)/forgot-password/forgot-form.tsx` — "Send reset link" submit
  - `src/app/(auth)/reset-password/reset-form.tsx` — "Update password" submit
  - `src/app/(app)/admin/partners/new/invite-form.tsx` — "Send invite" submit
- Updated `src/app/(app)/calculator/calculator.css` `.ax-save-btn` rule: background changed from `var(--ac)` (#2563eb blue) to `#fbb040`; text color from `#fff` to `#1a1a1a`; hover from `#1d4ed8` to `#e69e2c`. The broader `--ac` blue variable was left intact so focus rings, range sliders, and chart elements inside the calculator are unchanged.
- `Suspend` button on `/admin/partners` left on its existing `danger` variant (red border/text). Row actions Reactivate/Resend Invite left on `primary`/`neutral` as-is — these are not CTA-level primary actions.

**Verification gates passed:**
- `npm run lint` — 0 errors, 2 warnings (both expected: ESLint flags plain `<img>` vs `next/image`; brief explicitly chose `<img>`).
- `npm test` — 19/19 pass.
- `npm run build` — Turbopack, clean, 15 routes.
- Dev server started, `/login` returned HTTP 200. Visual browser verification skipped (Chrome extension not connected); code changes are mechanically correct.

### Logo Q1 decision

Reused `public/email/arxys-logo.png` (default fallback). At 140px render width the 250px source will be crisp on 1× screens and acceptable on 2× retina. A higher-res asset can be dropped at `public/arxys-logo.png` later — the `src` attribute in both layout files is the single change needed.

---

## 2026-05-20 — Portal Phase 2 plan locked + scope cuts

### Work done

Scoped Portal Phase 2 in a single session immediately after the Step 11 close-out. Andy supplied five concrete partner-facing goals (minimal portal branding, real MSRP pricing on calculations, automatable Sheet → Supabase + Pipedrive sync with **no** Slides, partner XLSX download, HTML price book in the portal). The five goals plus the six "PQ" questions left open at Step 11 closure all locked in this session.

Artifacts created or revised:

- [`docs/phase-2-plan.md`](./phase-2-plan.md) — operational plan for Portal Phase 2. **10 Phase 2 Steps + 1 optional**, each with explicit blockers. Locked PQ resolutions, scope cuts, and internal-only-testing stance recorded at the top. Open scoping question for Step 8 (Slides content audit) parked at the bottom.
- ADR [`0029-phase-2-step-naming-convention.md`](./decisions/0029-phase-2-step-naming-convention.md) — **"Phase 2 Step N"** naming for new entries; existing Phase 1 entries keep their bare "Step N" form (no retroactive renames). Pipeline-proposal sub-phases referenced in writing as "Pipeline Phase X" for disambiguation.
- ADR [`0030-phase-2-scope-and-locked-decisions.md`](./decisions/0030-phase-2-scope-and-locked-decisions.md) — single consolidated record of every Phase 2 scope decision: the two scope cuts (Slides removed, internal-only-during-Phase-2) and the six PQ resolutions, each with options considered and rationale.
- [`docs/README.md`](./README.md) — appended a "Forward-looking plans" section indexing `phase-2-plan.md` and the proposal. Doesn't change the three-doc discipline; just makes Phase 2 discoverable.
- [`docs/proposals/phase-2-pricing-pipeline.md`](./proposals/phase-2-pricing-pipeline.md) — banner added at top documenting scope cuts (Slides out, Sheet stays as-is, script in this repo, internal-only testing, full SKU-PK migration). Body below the banner unchanged — it remains the verbatim reference copy of Andy's Google Doc.

No code changes. Phase 2 Step 1's scoping brief is the next session's deliverable.

### Scope cuts vs the original proposal

- **Google Slides removed entirely.** No automation, no retirement step, no comms work. The HTML price book inside the portal (Phase 2 Step 8) replaces Slides functionally. Andy: *"remove from project entirely."*
- **Internal testing only during Phase 2.** No external partners until end of Phase 2 (= "MVP final" = Phase 2 Step 10).

### Decisions locked (six PQs)

- **PQ1** launch-blocker treatment: moot. Internal-only-during-Phase-2 means the `/submissions` placeholder-price view is invisible to anyone outside Arxys; Step 6 unblocks with real numbers before external partners arrive.
- **PQ2** Sheet reconciliation: **(ii)** — work with Sheet as-is. Push script derives Product Group from SKU prefix and parses inline MKT/CFQ. Zero data-entry burden on the Sheet maintainer.
- **PQ3** discount mechanic: partial. XLSX download is MSRP-only. HTML price book defers per-user discount to its own scoping.
- **PQ4** schema appetite: full SKU-PK migration. Forced by Goal 4 (partner XLSX of the full ~35-SKU price list).
- **PQ5** push script location: **(a)** — `scripts/push-prices.ts` in this repo.
- **PQ6** sub-phase sequencing: per-step scoping briefs in the Step 11 shape, at `docs/phase-2/step-N-<title>.md`.

### Decisions captured

- [`0029-phase-2-step-naming-convention.md`](./decisions/0029-phase-2-step-naming-convention.md)
- [`0030-phase-2-scope-and-locked-decisions.md`](./decisions/0030-phase-2-scope-and-locked-decisions.md)

---

## 2026-05-20 — Step 11: pre-launch verification (Phase 1 closed, partner-launch reframed to Phase 2)

### Work done

Structural pre-launch verification of Portal Phase 1 per the Step 11 brief. Phase 1 is **feature-complete and structurally verified**; partner-facing launch is **blocked on Phase 2** (Pricing Pipeline project per ADR [0019](./decisions/0019-defer-real-pricing-to-phase-2.md)) for one specific reason captured under Detours & fixes. That blocker is treated as the trigger event for Phase 2 — not a Step 11 bug to fix in place. Step 11 closes here, not partial-incomplete.

**§A1 Vercel — verified clean:**

- All 10 required Production env vars present. Orphan `PIPEDRIVE_API_KEY` (from the Step 8 follow-up detour 2026-05-19) removed.
- Deployment Protection Production = Disabled (incognito `https://portal-arxys.vercel.app/` returns 307 → `/login`, not Vercel SSO).
- `.vercel/project.json` pins working copy to the `portal` project (`prj_tu3RWtzjhh7ao4mAELuJVaFWgkJV` in org `arxys`).
- Production deployment `dpl_CDefAByY...` Ready, aliased to `portal-arxys.vercel.app`, `portal-git-main-arxys.vercel.app`, `portal-flame-eta.vercel.app`. The `-git-main-` alias plus a 2h-old auto-deploy from `main` HEAD `9514b62` together evidence Production Branch = `main`.
- Framework Preset = Next.js (Andy eyeball-confirmed; corroborated by Next.js routes + `/_next/static/...` URLs being served).
- Sibling Vercel project `forecast` exists (RUNBOOK §10 step 9 partially satisfied — `arxys-com` placeholder optional, not created).

**§A2 Supabase — verified clean:**

- Supabase CLI linked to cloud project `ddqnpwpouvkgivvbjpju` (matches `NEXT_PUBLIC_SUPABASE_URL`).
- All four canonical templates at [`docs/email-templates/*.html`](./email-templates/) use `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=…&amp;next=…` — zero references to `{{ .ConfirmationURL }}` (the Step 9 follow-up detour bug). Per-template `<type>` + `<next>` correct.
- `scripts/test-rls.ts` end-to-end run against the production database: **8/8 PASS**, including 8c (suspended admin loses cross-partner SELECT). This is the long-standing "pending" item from Step 9 Phase B closed out. Side-observation from 8b: the production DB already has ~14 submissions across 4 owner UUIDs (real partner activity beyond the ephemeral test personas).
- Site URL / Redirect URLs / SMTP credentials / template paste / Auth logs eyeball: Andy confirmed via dashboard.

**§A3 Gmail deliverability — verified via DNS:**

- SPF includes `_spf.google.com` (`v=spf1 ip4:173.236.43.242 include:_spf.google.com include:arxys.com.spf.auto.dnssmarthost.net ~all`).
- DKIM at `google._domainkey.arxys.com` actively signing (RSA key published).
- DMARC `v=DMARC1; p=none; rua=mailto:info@arxys.com` — meets the brief's "p=none minimum"; aggregate reports flow to `info@arxys.com`.
- MX routes to `aspmx.l.google.com` cluster.
- Two non-blocking observations: SPF is `~all` (soft fail; tightening to `-all` is a future hardening step) and DMARC `p=none` (monitor-only; tightening to `p=quarantine` is a future step). App Password + `sales@arxys.com` alias + mailbox monitoring: Andy confirmed.

**§A4 Pipedrive — verified clean against live tenant:**

- Pipeline `"Project Pipeline"` exists (id=1, active). Stage `"New Lead"` exists in pipeline 1 (id=1, order 2).
- User `"Andy Newbom"` resolves (id=6039322, active).
- All 6 `arxys_*` custom fields exist with correct `field_type` (auto-created on prior submissions; no first-run risk for the launch cohort).
- All 13 admin-curated calculator fields exist by exact name (`Project Name`, `VMS`, `Camera Streams`, `Recording`, `Motion Activity Est. %`, `Frame Rate`, `Resolution`, `Retention Days`, `CODEC`, `Total Storage`, `Scene Complexity`, `Recording hours`, `Recommended Server`).
- All VMS / CODEC / Scene Complexity / Recording option IDs in [`src/lib/pipedrive/deal.ts`](../src/lib/pipedrive/deal.ts) match the live tenant exactly. Zero drift from the Step 8 follow-up baseline.

**RLS regression — closed (see §A2 above).** Ephemeral users teardown clean; no residual state in cloud DB after the run.

**Step 11 close-out doc work — landed in this commit:**

- ADR [`0027-silent-log-for-non-blocking-integrations.md`](./decisions/0027-silent-log-for-non-blocking-integrations.md) — accepts the current silent-`console.error` behavior on Pipedrive deal-create + partner-copy email failures as a deliberate Phase 1 choice (not an oversight). Revisit on volume or real-incident trigger.
- ADR [`0028-defer-per-flow-reset-password-heading.md`](./decisions/0028-defer-per-flow-reset-password-heading.md) — accepts the shared "Reset your password" heading as a known limitation; Phase 2's partner-portal copy pass takes it as tracked work.

### Detours & fixes

- **Partner-visible nonsense prices — the launch blocker that reframes Phase 2.** ADR [0019](./decisions/0019-defer-real-pricing-to-phase-2.md) instructed "Calculator, PDF, and email show 'Pricing TBD' or equivalent text in any price field." Implementation got three of four surfaces right (calculator UI, PDF, partner email — none of these render pricing). Step 9 Phase B introduced two routes that ADR 0019 was written before and therefore didn't enumerate: `/submissions` (partner-facing list) and `/submissions/[id]` (partner-facing detail). Both render `formatPrice(submission.total_list_price_usd)`, and `formatPrice()` at [`src/app/(app)/_components/submission-detail.tsx:67`](../src/app/(app)/_components/submission-detail.tsx) returns `"Pricing TBD"` only for **null** values — not for the placeholder `products.list_price_usd` rows (1.00..6.00 dollars). A real partner submitting today sees totals like `$57.00` for "19 units × V500 placeholder $3" on their submission detail. Confirmed by reading the production `submissions` table: 10 most recent rows show values from `$1.00` to `$57.00`. Not fixed in Step 11 by deliberate choice — fixing it cleanly belongs to Phase 2 (Pricing Pipeline), which can either ship real prices from the now-existing Master Sheet or short-circuit with a "partner price suppression" precursor commit before any real partner is invited. Step 11 surfaces the blocker; Phase 2 owns the resolution. The 2–3-partner launch cohort from Step 11 §D5 does not get invited until that resolution lands.

- **Pricing master Google Sheet now exists.** The Phase 2 proposal at [`docs/proposals/phase-2-pricing-pipeline.md`](./proposals/phase-2-pricing-pipeline.md) anticipated this Sheet but treated it as future Phase 0 work. As of Step 11 the Sheet is live at `https://docs.google.com/spreadsheets/d/12zwFhDynV6T4ehxui7y-i6F-8XjEYFRBPgsAicpksmk/` with 35 data rows (header + 34 product rows, "Valid as of 5/5/2026"). Mismatches against the proposal's Phase 0 spec, captured for Phase 2 reconciliation rather than fixed in Step 11: (a) no `Product Group` column; (b) `Price Type` not a separate column — MKT/CFQ values are inline strings in the MSRP cell; (c) row count is 35, doc expected 41 after 4 named additions; (d) one named addition `VX5-PP5-V100` is still absent; (e) extra `Partner Discount Price` column derived from a sheet-level discount % rather than the doc's per-user `partners.discount_tier`. These are Pipeline Phase 0 cleanup items, not Step 11 work.

- **Step 11 scope reframe (mid-pass).** Started executing the brief's §A → §B sequence, completed §A1–§A4 + RLS clean, then surfaced the partner-visible-prices issue during §A5 (branding/copy review). The remaining §A5 (price-display review), §A6 (cohort timing), §B1 partial (Pipedrive smoke), and §B3 (page-by-page production pass) all overlap Phase 2 work and would be redone there. Closing Step 11 now with the structural verification green is the cheaper move than pretending to complete a checklist whose remaining items belong to a different scoping cycle. The pre-launch verification function the brief was written to serve has been served; the partner-shipping function is Phase 2's job.

### Decisions captured

- [`0027-silent-log-for-non-blocking-integrations.md`](./decisions/0027-silent-log-for-non-blocking-integrations.md)
- [`0028-defer-per-flow-reset-password-heading.md`](./decisions/0028-defer-per-flow-reset-password-heading.md)

### Handed off to Phase 2 (Pricing Pipeline)

These were on the original Step 11 brief but defer rather than complete:

- **Partner-visible price display on `/submissions` + `/submissions/[id]`** (the launch blocker). Resolution path: either Pipeline Phase 2 (Portal Price Book Page) ships real partner pricing, or a precursor "Path B" suppression commit lands first and a no-pricing Phase 1 ships to a canary partner.
- **Auth-flow smoke tests in production** (forgot-password recovery, suspend → `/login?error=suspended` banner, Resend Invite). Step 9 transitivity argues these work; defer to Phase 2 pre-launch where the page-by-page pass touches them anyway.
- **Page-by-page production pass** (Step 11 §B3). Folded into Phase 2 pre-launch — pages will change in Phase 2 so doing this now would be wasteful.
- **Custom domain `portal.arxys.com`** (Step 11 §D1 deferred per ADR [0025](./decisions/0025-supabase-custom-smtp-and-branded-templates.md) "when to revisit").
- **2–3 partner launch cohort invite** (Step 11 §D5). Now a Phase 2 decision: shape of "what does launch look like" depends on Phase 2's pricing-display resolution.

---

## 2026-05-20 — Step 9 follow-up: branded auth emails + Vercel production protection

### Work done

- **Logo asset** at [`public/email/arxys-logo.png`](../public/email/arxys-logo.png). Pulled the canonical Arxys gold wordmark from `https://www.arxys.com/wp-content/uploads/Arxys-logo-gold-e1503013560806.png` (the header logo on the marketing homepage). 250×43 RGBA PNG, transparent background, 6.5 KB. Smaller than the brief's recommended 400×120 source but renders at `width="140"` in the templates — slight downscale on retina, no upscaling, stays crisp.
- **Four canonical email templates** in [`docs/email-templates/`](./email-templates/) — `invite.html`, `magic-link.html`, `reset-password.html`, `confirm-signup.html`, plus a [`README.md`](./email-templates/README.md) calling out the source-of-truth rule and the per-template subject lines. One Montserrat-based skeleton (700 heading / 400 body, with the `-apple-system, BlinkMacSystemFont, ...` fallback stack for clients that strip `<link>` to Google Fonts). Brand Gold `#fbb040` CTA with dark `#1a1a1a` text (WCAG AAA 9.5:1; white-on-Gold would fail AA at 2.0:1). Brand Grey `#d1d2d4` used only for the card border and the divider above the footer — too light for text per the `arxys-company` skill's usage notes.
- **ADR** [`0025-supabase-custom-smtp-and-branded-templates.md`](./decisions/0025-supabase-custom-smtp-and-branded-templates.md) — custom SMTP + all four templates, with the reasoning for choosing this over template-only or generateLink+nodemailer.
- **RUNBOOK** — added two new sections after §8: §8a (Supabase custom SMTP recipe) and §8b (Vercel production deployment protection). Both are now part of recreating the project from zero.
- **WCAG fix on form inputs** — `src/app/globals.css` had `create-next-app`'s default `prefers-color-scheme: dark` block flipping `--foreground` to `#ededed` (near-white). Native form elements (`<input>`, `<textarea>`, `<select>`) inherited that color and rendered near-white on white cards for any user with OS dark mode enabled. Surfaced on the invite form at `/admin/partners/new` during smoke-test prep. Removed the dark-mode auto-switch (portal is light-mode only in Phase 1 — see ADR 0026), and added explicit form-element CSS in the same file: `color: #171717` / `background-color: #ffffff` on inputs, `::placeholder` set to `#6b7280` (gray-500, ~4.7:1 on white, passes WCAG AA) with `opacity: 1` to override Firefox's 0.54 default, and a `-webkit-autofill` override so Chrome's pale autofill paint doesn't recreate the same bug.

### Verification & dashboard configuration

All five dashboard steps completed, in this order:

1. **Vercel** → Portal → Settings → Deployment Protection — Production set to **Disabled**, Preview kept as "Only Vercel Team". Verified incognito `https://portal-arxys.vercel.app` lands on `/login`, not Vercel SSO. Logo URL `https://portal-arxys.vercel.app/email/arxys-logo.png` returned 200 + `image/png` immediately after the toggle (had been 401 across 30 polls beforehand — the chicken-and-egg confirmation that the whole portal domain was behind Vercel SSO).
2. **Supabase** → Authentication → URL Configuration — Site URL is `https://portal-arxys.vercel.app`, Additional Redirect URLs include `https://portal-arxys.vercel.app/**` and `http://localhost:3000/**`. Unchanged from earlier setup; only a sanity-check.
3. **Supabase** → Authentication → Emails → SMTP Settings (note: Supabase moved this page since the brief was written — it's now under Authentication, not Project Settings → Auth) — custom SMTP enabled with Host `smtp.gmail.com`, Port `587`, **Username `andy.newbom@arxys.com`** (the Google account that owns the App Password, per ADR 0002), Password = the 16-character App Password pasted without spaces, Sender email `sales@arxys.com` (the "Send mail as" alias), Sender name `Arxys Partner Portal`. Supabase emits a generic "Check your SMTP provider — designed for personal email" warning on Gmail SMTP; acknowledged and dismissed per ADR 0025 "When to revisit" (Gmail Workspace deliverability is fine at MVP volume; migrate to a transactional provider if/when we exceed ~2000 messages/day).
4. **Supabase** → Authentication → Email Templates — all four templates pasted from `docs/email-templates/*.html` with updated subject lines per the table in `docs/email-templates/README.md`. Preview pane confirmed the Arxys logo + Gold CTA + branded footer before saving each.
5. **Smoke test (invite path) passed end-to-end** after the `{{ .TokenHash }}` URL fix landed:
   - Anonymous incognito → `/login`, not Vercel SSO.
   - Invite from `/admin/partners/new` to a personal Gmail.
   - Branded email arrived in Inbox (not Spam), From `Arxys Partner Portal <sales@arxys.com>`, Subject `You're invited to the Arxys Partner Portal`, Gold CTA + logo + footer all rendering correctly.
   - CTA link `https://portal-arxys.vercel.app/auth/confirm?token_hash=...&type=invite&next=/reset-password` (note: lands directly on our route handler — no Supabase verify round-trip).
   - `/auth/confirm` exchanged the token for a session and redirected to `/reset-password`. No URL fragment, no `error=missing_token`.
   - Setting the password signed the invitee in and landed them on `/dashboard`.
   - Phase A's layout gate auto-flipped `partners.status` from `'invited'` to `'active'` on first protected-page load.
6. **Smoke test (other paths) not yet exercised but high-confidence by transitivity**: forgot-password → recovery email, suspend → `/login?error=suspended` banner, Resend Invite → second invite email. All three use the same SMTP + template plumbing as the invite path. Worth a live pass when a real partner is onboarded; not blocking ship.

**Accepted minor UX limitation**: `/reset-password` is shared between the invite flow (set initial password) and the forgot-password flow (set new password). Heading reads "Reset your password" — slightly awkward for a brand-new invitee who has no existing password. Functionally correct and a common pattern (GitHub, Google, many B2B tools use the same one-page-two-flows shape). Captured here as a known UX nit; revisit if a partner comments on it or when marketing brings a brand-voice opinion. Not ADR-worthy.

### Decisions captured

- [`0025-supabase-custom-smtp-and-branded-templates.md`](./decisions/0025-supabase-custom-smtp-and-branded-templates.md)
- [`0026-light-mode-only-in-phase-1.md`](./decisions/0026-light-mode-only-in-phase-1.md)

### Detours & fixes

- **Template CTA used `{{ .ConfirmationURL }}` — wrong for our route handler.** First branded invite email landed at `/login?error=missing_token` with a giant `#access_token=...` URL fragment hanging off the end. Diagnosis: `{{ .ConfirmationURL }}` resolves to Supabase's legacy `/auth/v1/verify` endpoint, which returns the session as a URL fragment (implicit-flow style). Our `/auth/confirm` route handler (`src/app/auth/confirm/route.ts:9-34`) reads `token_hash` + `type` from **query params** (modern OTP / `@supabase/ssr` PKCE), and fragments are invisible to it server-side. Fix: replace `{{ .ConfirmationURL }}` in all four templates with a manually-constructed URL using `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<flow>&next=<path>`. Per-template `<flow>`: `invite` / `magiclink` / `recovery` / `signup`. Per-template `<next>`: `/reset-password` for invite + recovery (need to set/reset password), `/dashboard` for magic link + signup. Ampersands are XML-escaped as `&amp;` in the HTML. ADR 0025 now documents the pattern; the brief had this wrong and the README at `docs/email-templates/README.md` was updated to match. Lesson: when `@supabase/ssr` is in play with PKCE, **never** use `{{ .ConfirmationURL }}` — always construct via `{{ .TokenHash }}`.
- **First Supabase SMTP send returned `535 5.7.8 BadCredentials`.** Diagnosis via Supabase Auth logs (Logs → Auth Logs, filter by error level). Initial assumption was Username/Sender alias mismatch (the divergence we'd already documented); actual cause was simpler — the App Password was entered with the spaces Google displays it with. Stripping spaces fixed it. Lesson for the RUNBOOK: emphasise "no spaces" in the SMTP recipe loud enough that no one re-trips on this.
- **The first branded email was actually the Supabase default — not Arxys-branded.** Despite the templates living in `docs/email-templates/*.html`, the Supabase dashboard's Email Templates page still had the default HTML on the Invite template. Easy to skip in a multi-step dashboard pass; flagging here so the smoke-test checklist explicitly verifies the preview pane shows the Gold CTA + logo before sending a test invite.
- **Dark-mode auto-switch from `create-next-app` was producing white-on-white form fields** on macOS dark mode. Mostly masked across the app because components pin text colors explicitly with Tailwind classes — but native form elements didn't, and inherited the near-white `--foreground` from globals.css under `prefers-color-scheme: dark`. Initial diagnosis assumed placeholder contrast (Tailwind's default placeholder shade); the real cause was the dark-mode media query swapping the body color. Removing the media query and pinning form-element colors explicitly fixes the visible bug AND prevents the next unstyled component in Phase 2+ from re-introducing it. Documented in ADR 0026.
- **Brief said Port 587, ADR 0002 / RUNBOOK §2 establish 465.** Both work against Gmail (587 = STARTTLS, 465 = SSL). The nodemailer transport at runtime uses 465; the Supabase form is being set to 587 because that's the port Supabase recommends in-product. Captured the divergence in ADR 0025 so future readers don't see "two ports for one SMTP host" and assume one is wrong.
- **Brief instructed `Username: sales@arxys.com` in the Supabase SMTP form.** ADR 0002 documents the actual App Password as belonging to `andy.newbom@arxys.com` with `sales@arxys.com` set up as a "Send mail as" alias under that account — Google App Passwords are bound to the authenticating account, not the alias, so the Supabase `Username` field must use the owning account. The `Sender email` (the visible From) is correctly the alias. Surfacing this in the pending list so the dashboard step uses the right credential, not the literal brief text.
- **Logo source.** Brief noted "user attached it earlier in the conversation history" — not available in a fresh session. Fell back to the brief's documented fallback ("pull from `https://www.arxys.com/` — the homepage header logo is the canonical asset"). Confirmed via `grep` of the homepage HTML; `Arxys-logo-gold-e1503013560806.png` is the canonical wordmark.

---

## 2026-05-20 — Step 9 Phase B: admin panel + partner submission history

### Work done

- **`src/app/(app)/admin/layout.tsx`** — admin-only shell. Re-checks `partners.role='admin' AND status='active'` defensively and calls `notFound()` if either is missing — a 404 (not 403) so the admin section doesn't leak its existence to non-admins. Inherits the header + signOut from `(app)/layout.tsx`. Renders a thin left side-nav with Overview / Partners / Submissions / Back to Dashboard.
- **`src/app/(app)/admin/page.tsx`** — landing page with three KPI cards (Partners broken down by status, all-time submissions, submissions in the last 30 days) and a 10-row "Recent submissions" table linking each row to `/admin/submissions/[id]`. The 30-day cutoff goes through a `cutoffIsoDaysAgo()` helper so the impure `Date.now()` read isn't inline in the render body (eslint's `react-hooks/purity` rule treats async Server Components as render functions; see Detours).
- **`src/app/(app)/admin/partners/page.tsx`** — table of all partners, ordered by `created_at desc`. Columns: company, contact, email, role, status (colored pill), created date, actions. Email comes from `auth.admin.listUsers({ perPage: 200 })` joined in memory — `partners` doesn't store email (it's the `auth.users` source of truth). Top-right "Invite partner" CTA links to `/admin/partners/new`.
- **`src/app/(app)/admin/partners/partner-row-actions.tsx`** — client component wrapping the per-row Suspend / Reactivate / Resend Invite buttons. Each button is its own `<form>` with `useActionState` so inline errors (from the self-suspend / last-active-admin / TOCTOU guards) render next to the offending button. Suspend has a `window.confirm` prompt to defuse misclicks. Buttons are rendered conditionally on `row.status` — Suspend only for `active`, Reactivate only for `suspended`, Resend Invite only for `invited`.
- **`src/app/(app)/admin/partners/actions.ts`** — four Server Actions (`invitePartner`, `suspendPartner`, `reactivatePartner`, `resendInvite`). All four start with a `requireAdmin()` helper that re-verifies the caller via the user-scoped client before opening the service-role client. Guards as committed: `invitePartner` rolls back the auth user with `admin.auth.admin.deleteUser` if the partners-row INSERT fails; `suspendPartner` refuses self-suspend and the last-active-admin case (count via service-role); `resendInvite` re-reads `partners.status` and refuses if no longer `'invited'` (TOCTOU). Redirect URL for both invite calls mirrors the `headers().get('origin')` pattern from `src/app/(auth)/forgot-password/actions.ts:23-30`.
- **`src/app/(app)/admin/partners/new/page.tsx` + `invite-form.tsx`** — server page wrapping a client form. Three fields (email, contact name, company name); validation with zod inside the Server Action, field-level errors surfaced via `useActionState`. Submit button shows pending state.
- **`src/app/(app)/admin/submissions/page.tsx`** — paginated (`LIMIT 50 OFFSET ?`) table of every submission across partners. `?partnerId=` GET filter via a dropdown sourced from the partners list (admin-only read OK via existing RLS). Columns: date, partner company, project, recommendation (`N × Model`), camera count, list price, View link.
- **`src/app/(app)/admin/submissions/[id]/page.tsx`** — read-only admin submission detail. Uses the shared `<SubmissionDetail mode="admin" partner={...} />` component.
- **`src/app/(app)/submissions/page.tsx`** — partner-facing list of the caller's own submissions. Same shape as the admin list minus the partner column. RLS scopes automatically; no application-level `partner_id` filter (per ADR 0024).
- **`src/app/(app)/submissions/[id]/page.tsx`** — partner-facing detail, same shared component in `mode="partner"`. No partner header line, no Pipedrive link, no partner-price row.
- **`src/app/(app)/_components/submission-detail.tsx`** — shared Server Component renderer. The `mode` prop is the only difference between admin and partner views; the partner-price row and the Pipedrive link key off it. Renders the calculator inputs table, the per-group breakdown from `groups_payload`, the recommendation block (joined `products.name + description + sku`), the Download PDF link, and (admin only) the Pipedrive deal link.
- **`src/app/(app)/_components/load-submission.ts`** — `loadSubmissionDetail(id)` helper used by both detail pages. Single Supabase SELECT with the products embed; flattens the Supabase array-vs-object embed shape into a normalised object.
- **`src/app/(app)/calculator/actions.ts`** — defense-in-depth at the top of `submitCalculation`: refuse with a clear error if the caller's `partners.status !== 'active'`. The Phase A layout gate already blocks suspended partners from the UI; this catches a stale tab or scripted POST.
- **`scripts/test-rls.ts`** — extended with an `admin` persona (`provisionPersona("ADMIN", { role: "admin" })`). Added three test cases: admin SELECT partners returns at least A + B + self (8a), admin SELECT submissions returns rows for both A and B (8b), suspending the admin (via service-role) strips their cross-partner reads — they go from "sees all" to "sees only self" without dropping the session (8c, proves `is_admin()` correctly requires `status='active'`). Server Action guards (self-suspend, last-active-admin, resend-invite TOCTOU) are explicitly noted as out-of-scope for `test-rls.ts` because they live in Server Actions, not RLS.
- **ADRs.**
  - [`0023-partner-management-actions.md`](./decisions/0023-partner-management-actions.md) — minimal action surface: Invite + Suspend/Reactivate + Resend Invite. Explicit non-features: no delete, no edit-profile, no role-flip.
  - [`0024-partner-submission-history.md`](./decisions/0024-partner-submission-history.md) — partner routes at `/submissions`, RLS-only scoping, shared detail renderer with `mode` prop.
- **Verification** — `npm run build` clean (15 routes, ~2.8s compile + 2.6s TS), `npm run lint` clean (after the purity-rule workaround), `npm test` 19/19. `scripts/test-rls.ts` not executed in this session (requires service-role credentials in the local env) — extension is mechanical and the existing pattern is unchanged.
- **RUNBOOK** — unchanged. Phase B introduces no new env vars, scripts, or setup steps.
- **Local commits** — five, grouped by area: admin shell + landing; partner management (list + actions + invite + row-actions); submissions (admin + partner + shared component + loader); calculator defense + RLS test extension; docs (ADRs + this JOURNAL entry). Not pushed.

### Detours & fixes

- **`react-hooks/purity` flagged `Date.now()` inside the admin landing's Server Component.** First write put `new Date(Date.now() - 30 * 86_400_000).toISOString()` directly inside the `Promise.all([...])` body for the last-30-days submission count. ESLint v9 with `eslint-config-next` 16.2.6 now ships a purity rule that treats async RSCs as render functions and flags impure calls like `Date.now()` inline. Workaround: hoist into a one-line `cutoffIsoDaysAgo(days: number)` helper at module scope and call it once before the parallel reads — the rule allows function calls to non-render helpers. Captured here because the rule is recent enough that future authors writing similar "cutoff" logic in Server Components will hit the same warning.
- **Server Action result state doesn't reach the page when used as a plain `<form action={...}>`.** Initially planned the row actions as plain server-rendered forms with the action functions wired directly. That works for the happy path (`revalidatePath` causes a re-render) but loses the inline error case — when `suspendPartner` returns `{ status: 'error', error: 'You cannot suspend yourself' }`, the page just re-renders without the message. Wrapped the buttons in a small client component (`partner-row-actions.tsx`) using `useActionState`. Trade-off acknowledged: an extra small client bundle on the partners page; the alternative (writing the error into a query string and reading it back) would have leaked partner IDs into the URL bar and required custom plumbing per action.
- **`auth.admin.listUsers` is paginated, capped at 200 per page by default.** The partners table joins email from `auth.users` because email isn't denormalised onto `partners`. The current implementation calls `listUsers({ perPage: 200 })` once. For partner bases >200 we'd need to walk pages. Recorded as a known limitation in this entry rather than building speculative pagination — the current partner count is in single digits and the comment in [`admin/partners/page.tsx`](./../src/app/(app)/admin/partners/page.tsx) flags the limit.
- **`recovery` vs `invite` confirm route.** The Supabase docs and `src/app/auth/confirm/route.ts` already accept `type=invite` (it's a value in `EmailOtpType`). The invite redirect goes to `/auth/confirm?next=/reset-password`; the verifyOtp call sets the session and forwards to `/reset-password` where the invitee picks a password. No new route was needed.
- **No new migrations and no new RLS policies were introduced.** Every column referenced by Phase B (`partners.status`, `submissions.pipedrive_deal_id`, `submissions.groups_payload`, the embedded `products` columns) was already in place by the end of Step 8. The admin-aware select policies (`partners_select_self_or_admin`, `submissions_select_own_or_admin`, `products_select_active_or_admin`) cover every read; service-role writes cover the four partner-management actions.

### Decisions captured

- [`0023-partner-management-actions.md`](./decisions/0023-partner-management-actions.md)
- [`0024-partner-submission-history.md`](./decisions/0024-partner-submission-history.md)

### Pending / explicit non-goals

- Smoke test in production: invite a real test partner, confirm the invite email arrives, click through `/reset-password`, set a password, sign in, verify dashboard renders with `partners.status` now `'active'`, suspend the test partner from `/admin/partners`, confirm the next request bounces to `/login?error=suspended`.
- `scripts/test-rls.ts` end-to-end run requires the service-role key — defer to a session where Andy has env access loaded.
- No partner self-service profile editing, no role-flip UI, no hard delete (ADR 0023).
- No customised Supabase invite email — defaults are acceptable for Phase 1.

---

## 2026-05-20 — Step 9 Phase A: foundation gates + dashboard cleanup

### Work done

- **`src/app/(app)/layout.tsx`** — extended the existing partner-row `select` to include `status`. Inserted two branches between the partner load and the render:
  1. `if (partner?.status === "suspended")` → `await supabase.auth.signOut()` then `redirect('/login?error=suspended')`. The signOut is load-bearing: without it, the proxy's authed-on-`/login` redirect (`src/lib/supabase/proxy.ts:59-64`) would bounce the still-authenticated user back to `/dashboard` and produce an infinite redirect loop.
  2. `if (partner?.status === "invited")` → service-role `UPDATE partners SET status='active' WHERE id=?` via `createSupabaseAdminClient()`. Errors are logged, not thrown — a failed flip leaves the user `'invited'` until the next request, which is harmless because `'invited'` and `'active'` are functionally equivalent for non-admin paths (only `is_admin()` requires `status='active'`).
  3. Added a conditional "Admin" link in the header chrome next to "Sign out", rendered only when `partner.role === 'admin'`. The link points at `/admin`, which doesn't exist yet — Phase B will add the route. Only admins see the link; non-admin partners never get a 404.
- **`src/app/(auth)/login/page.tsx`** — widened the `Search` promise type to accept an optional `error` query string. When `error === 'suspended'`, renders a small red banner above the sign-in form: "Your account has been suspended. Contact your administrator." Banner uses the same `text-red-*` palette as the existing `LoginForm` error pattern (`login-form.tsx:44-48`).
- **`src/app/(app)/dashboard/page.tsx`** — deleted the dashed-border "Coming in Step 5" stub. Added two cards, both styled to match the existing Calculator card so the dashboard reads coherently:
  - "Submission history" → `/submissions` for all users. Route 404s today; Phase B adds the partner-facing submissions list.
  - "Admin" → `/admin`, rendered only when the current user is an admin. Same 404 caveat; Phase B adds it.
- **ADRs.**
  - [`0021-suspend-gate-in-app-layout.md`](./decisions/0021-suspend-gate-in-app-layout.md) — why the gate lives in the layout (vs. proxy or RLS) and why the signOut-before-redirect is required.
  - [`0022-auto-activate-on-first-sign-in.md`](./decisions/0022-auto-activate-on-first-sign-in.md) — why the `'invited' → 'active'` flip happens on first protected-page load via service-role rather than manually or via a webhook.
- **Local commits** — grouped as: layout + login banner; dashboard cards; docs (ADRs + this JOURNAL entry). Not pushed.

### Decisions captured

- [`0021-suspend-gate-in-app-layout.md`](./decisions/0021-suspend-gate-in-app-layout.md)
- [`0022-auto-activate-on-first-sign-in.md`](./decisions/0022-auto-activate-on-first-sign-in.md)

### Phase B handoff brief

> The next session reads this cold. Everything below is the locked input for Phase B; if any of it conflicts with new information discovered during implementation, update *here* before changing course.

#### Locked decisions (re-state verbatim in the Phase B session)

1. **Suspend gate lives in `src/app/(app)/layout.tsx`** (not the proxy, not RLS). Signs the user out and redirects to `/login?error=suspended`. Done in Phase A — Phase B does not re-implement.
2. **Auto-activate on first protected-page load** flips `partners.status` from `'invited'` to `'active'` via the service-role client. Done in Phase A — Phase B does not re-implement. Phase B's admin partner table simply reads the current status; it does not need to provide a "Mark active" action separate from "Suspend/Reactivate."
3. **Dashboard stub folded** into real navigation cards (Submission history for all; Admin for admins). Done in Phase A.
4. **Partner actions in Phase B = exactly three:** Invite (new partner email → `inviteUserByEmail` + partners row insert via service-role), Suspend / Reactivate (toggle `partners.status` between `'active'` and `'suspended'`), Resend Invite (re-trigger the invite email; only visible for rows still at `status='invited'`). No edit-profile, no delete, no role-flip in Phase B.

#### Confirmed guards (must be enforced in the Phase B Server Actions)

- **Self-suspend block.** A suspended admin loses admin privileges immediately (`is_admin()` requires `status='active'`), which can lock the org out if the *only* active admin suspends themselves. The Suspend action MUST refuse when `targetId === auth.uid()`.
- **Last-active-admin block.** The Suspend action MUST refuse if the target is the last partner with `role='admin' AND status='active'`. Run the count inside the same Server Action with the service-role client.
- **Resend Invite hidden for non-invited rows.** Only render the button when `row.status === 'invited'`. The Server Action should also re-check and refuse if status has changed between page render and submit (TOCTOU).

#### Brief-vs-reality deltas discovered during scoping

These bit us during Phase A planning; surfacing them so Phase B doesn't re-trip:

1. **No migrations needed.** `partners.status` with CHECK `('active','invited','suspended')` is already in `supabase/migrations/20260515193702_initial_schema.sql:34-35` since the project's first migration. No new column, no new policy.
2. **`submissions.recommendation jsonb` does not exist and should NOT be added.** Earlier Step 9 drafts assumed a denormalised JSON column for the recommendation payload. The current schema stores the recommendation as the normalised columns `recommended_product_id`, `recommended_units`, `total_list_price_usd`, `total_partner_price_usd` (initial schema lines 114-117) — Phase B's submission detail page reads from those + a join to `products`, not from a JSON blob.
3. **`pipedrive_deal_id` is already in the initial schema** (line 119). Step 8 discovered this the hard way (duplicate `alter table` error in CI). Phase B's submission detail page can read it directly.
4. **The proxy file is `src/proxy.ts`, not `src/middleware.ts`** (Next 16 convention; see ADR [0009](./decisions/0009-proxy-replaces-middleware-next16.md)). Reusable session logic lives at `src/lib/supabase/proxy.ts`. Phase B does NOT touch either file.
5. **`is_admin()` already requires `status='active'`** (initial schema lines 131-145). So a suspended admin automatically loses admin RLS privileges — no Phase B work needed to keep them out of admin tables. The layout gate handles UX; RLS handles enforcement.
6. **RLS already grants admin SELECT on partners + submissions.** The `partners_select_self_or_admin` policy (lines 172-175) and the analogous submissions policy admit `is_admin(auth.uid())`. Phase B's `/admin/partners` and `/admin/submissions` pages can use the regular user-scoped client for reads; service-role is only needed for writes that bypass RLS (Invite, Suspend, Reactivate, Resend Invite) and for any read where we deliberately want to ignore RLS.
7. **The PDF route at `src/app/(app)/api/submissions/[id]/pdf/route.ts` is already admin-accessible via existing RLS.** Because the submission-select policy admits admins, an admin hitting an arbitrary submission's PDF URL succeeds. Phase B's admin submission detail page can link to the existing PDF route directly — no separate admin handler needed.

#### Phase B file-by-file task list

```
src/app/(app)/admin/layout.tsx                  NEW  — admin-only shell: defensive is_admin() re-check; side-nav (Partners / Submissions / back to Dashboard)
src/app/(app)/admin/page.tsx                    NEW  — admin landing: KPI cards (partner counts by status, recent submissions) + quick links
src/app/(app)/admin/partners/page.tsx           NEW  — table of all partners (company, contact, email, role, status, created_at). Row actions: Suspend/Reactivate, Resend Invite (if invited). "Invite partner" CTA → /admin/partners/new
src/app/(app)/admin/partners/actions.ts         NEW  — Server Actions: invitePartner({ email, name, company }), suspendPartner(id), reactivatePartner(id), resendInvite(id). All use createSupabaseAdminClient(). Self-suspend + last-active-admin guards live here.
src/app/(app)/admin/partners/new/page.tsx       NEW  — invite form (email, contact_name, company_name). On submit: invitePartner() → supabase.auth.admin.inviteUserByEmail() + partners row insert with status='invited' role='partner'. Use headers().get('origin') for the redirect (mirror src/app/(auth)/forgot-password/actions.ts:23-30).
src/app/(app)/admin/submissions/page.tsx        NEW  — table of ALL submissions across partners (joined to partners.company_name). Filterable by partner. Rows link to /admin/submissions/[id].
src/app/(app)/admin/submissions/[id]/page.tsx   NEW  — read-only submission detail: project name, partner, calculator inputs, recommended product + units, total prices, pipedrive_deal_id (linkified to Pipedrive if non-null), Download PDF (re-uses /api/submissions/[id]/pdf).
src/app/(app)/submissions/page.tsx              NEW  — partner-facing list of THEIR own submissions (RLS already enforces). Same row layout as admin list minus the partner column.
src/app/(app)/submissions/[id]/page.tsx         NEW  — partner-facing submission detail. Same content as admin detail, no admin-only metadata.
scripts/test-rls.ts                             EDIT — extend the existing RLS verification harness to cover: suspended-partner read denial, admin cross-partner reads, invited-partner read (no admin), and the new admin write paths.
docs/decisions/0023-*.md                        NEW  — ADR covering the partner-management action surface (Invite + Suspend/Reactivate + Resend Invite; explicit non-features: no delete, no role flip).
docs/decisions/0024-*.md                        NEW  — ADR covering the partner-facing submission history routes (path scheme, RLS-only enforcement, mirror of admin detail).
docs/JOURNAL.md                                 EDIT — Phase B entry at top with a short walkthrough of the admin partners flow.
```

Out-of-scope reminders that should NOT silently creep back into Phase B:

- No edits to `src/proxy.ts` or `src/lib/supabase/proxy.ts`. The gate is in the layout by deliberate design.
- No new RLS policies. Existing policies cover every Phase B read path; service-role covers every Phase B write path.
- No new migrations. Every column is already in place.
- No customisation of the Supabase invite email. Default template is acceptable for Phase 1; revisit when the marketing site lands.
- Pipedrive integration is not touched in Phase B. Submission rows already carry `pipedrive_deal_id` from Step 8; admin detail just links out.

#### Definition of done for Phase B

- Admin can invite a new partner from `/admin/partners/new`; partner receives the Supabase invite email; first sign-in lands them on `/dashboard` with status auto-flipped to `'active'`.
- Admin can suspend any partner *except themselves and except the last active admin*; suspended partner is bounced to `/login?error=suspended` on their next request.
- Admin can reactivate any suspended partner.
- Admin can resend the invite to any partner still at `'invited'`.
- Partner sees `/submissions` and `/submissions/[id]` for their own rows. No cross-partner reads possible (verified by `scripts/test-rls.ts`).
- Admin sees `/admin/partners` and `/admin/submissions` lists, can drill into either.
- `npm run build` clean. `npm run lint` clean. `tsx --test` clean. `scripts/test-rls.ts` clean.

---

## 2026-05-19 — UI polish: widen app shell max-width from 1024 to 1280

### Work done

- `src/app/(app)/layout.tsx` line 50: `max-w-5xl` → `max-w-7xl` on `<main>` (1024 → 1280px). The 1024px cap squeezed the calculator's 3 KPI cards + bar charts on wide screens and forced needless vertical scroll. Dashboard at 1280px still reads cleanly. Header bar at line 24 stays `max-w-5xl` — the asymmetry is intentional, keeps the top nav compact while letting page content breathe.
- Verified with `npm run build` — clean. No other layout changes needed.
- Lands as its own commit before Step 9 (Admin) so the admin pages inherit the wider shell from day one.

---

## 2026-05-19 — Step 8 follow-up: populate admin-curated Pipedrive deal fields

### Work done

First production smoke test confirmed the Deal was created in the right pipeline/stage with the partner's Person + Org and the six `arxys_*` custom fields populated. But the admin-curated calculator fields that already existed in Pipedrive — `Project Name`, `VMS`, `Camera Streams`, `Recording`, `Motion Activity Est. %`, `Frame Rate`, `Resolution`, `Retention Days`, `CODEC`, `Total Storage`, `Scene Complexity`, `Recording hours`, `Recommended Server` — were all empty (screenshot from Andy). The Step 8 brief had locked the field set to only the six `arxys_*` fields, but the real Pipedrive tenant has a richer schema that the calculator inputs map onto directly. This entry adds that mapping.

- **Hit `GET /v1/dealFields`** on the live Pipedrive tenant (via `curl` + the local `PIPEDRIVE_API_TOKEN`) to enumerate every existing deal field. Captured names, hashed keys, field types, and option IDs for the enum/set fields. The screenshot confirmed which ones the calculator should fill.
- **`src/lib/pipedrive/lookups.ts` — added `resolveCalculatorFieldKeys()`** that reads `/dealFields` and returns a `Partial<Record<CalculatorFieldName, key>>`. Missing fields are logged via `console.warn` but do not throw — a Pipedrive admin renaming a single field shouldn't block the rest of the deal from saving. Refactored the dealFields fetch into a shared `getDealFieldsCached()` so this lookup and `ensureCustomFields()` share one HTTP call. `__resetLookupCache` extended to clear the new cache slots.
- **`src/lib/pipedrive/deal.ts` — extended the input contract** with `vms`, `retentionDays`, and a `primaryGroup` object carrying `resolutionLabel`, `codec`, `complexity`, `fps`, `recordingPercent`, `motionPercent`. Added three option-ID maps (`VMS_OPTION_IDS`, `CODEC_OPTION_IDS`, `COMPLEXITY_OPTION_IDS`) keyed by the calculator's string values; values are the Pipedrive option IDs captured from the live tenant. Added the Recording-mode heuristic (recordingPercent ≥ 100 → "24 Hour Continuous" id 118, else "Record Only On Motion" id 119). Added the recording-hours derivation (`round(recordingPercent / 100 * 24)`). `Total Storage` formatted as `"X.XX TB"` (matches the calculator's storage_tb column and reads better than raw GB for humans). `Recommended Server` mirrors `arxys_recommended_models` (`"N × MODEL"`).
- **`src/app/(app)/calculator/actions.ts`** — pass `vms`, `retentionDays`, and the primary-group characteristics (resolution label / codec / complexity tier / fps / recording% / motion%) from the existing `primary` variable into `createDealFromSubmission`.
- **`src/lib/pipedrive/deal.test.ts`** — three new cases:
  - Calculator fields are populated with mapped option IDs (`VMS=14` for Milestone, `Recording=118` for 100% continuous, `CODEC=139` for h265, `Scene Complexity=288` for medium) and string values (`Resolution="4MP (2560×1440)"`, `Total Storage="1500.00 TB"`, `Recording hours="24"`).
  - `recordingPercent=50` flips `Recording` to `119` and `Recording hours` to `"12"`.
  - When `/dealFields` doesn't expose the calculator field names (rename or admin tenant without them), the deal still saves with the arxys_* fields populated and the calculator-field keys absent from the payload.
- Fixture data updated to include the new required `vms`, `retentionDays`, and `primaryGroup` inputs.
- Test count: 19/19 (previously 16). Build + lint clean.

### Detours & fixes

- **The Step 8 brief was scoped too narrowly.** It locked the deal-field set to six `arxys_*` fields invented for the portal; the real Pipedrive tenant already had ~30 admin-curated fields that the calculator inputs map onto. Symptom: deal created successfully, every form field empty in the screenshot. Root cause: brief assumption rather than a code bug. Resolution: extend the deal builder with a separate `resolveCalculatorFieldKeys` path that reads (but never creates) the admin-curated fields, and populate them. The `arxys_*` fields are still useful — they encode the canonical/numeric values (camera count, bandwidth Mbps, storage GB) without going through Pipedrive's varchar formatting.
- **Set vs. enum vs. varchar matters at write time.** The calculator-matching Pipedrive fields are a mix: `VMS` and `Scene Complexity` are *sets* (option IDs, comma-separated string for multi-select), `Recording`, `CODEC`, `Failover Recorder` are *enums* (single option ID), `Frame Rate`, `Motion Activity Est. %`, `Retention Days`, `Total Storage`, `Recording hours`, `Resolution` are *varchar* (free text). Wrote each value in the type Pipedrive expects — option ID number for enums/sets, string for varchars. Captured the option-ID maps in `deal.ts` so a rename in Pipedrive surfaces as a missing-key skip rather than a silent wrong-ID write.
- **Three fields can't be populated yet.** `VMS Edition`, `Vms Key Features`, and `Failover Recorder` are admin-curated Pipedrive fields with no matching calculator input. Left them blank for now; if/when the calculator grows these inputs, the mapping is a one-line addition each.
- **Hanwha → Wisenet mapping.** Calculator's `VMS_OPTIONS` includes "Hanwha"; Pipedrive's VMS set has "Wisenet" (Hanwha's security-product brand). Mapped Hanwha → Wisenet option id 169. Logged here for traceability.

### Pending

- Smoke test post-redeploy: save a new calculation, confirm all visible Pipedrive fields are now populated (not just the `arxys_*` ones). Expected populated fields on a typical submission: `Project Name`, `VMS`, `Camera Streams`, `Recording`, `Motion Activity Est. %`, `Frame Rate`, `Resolution`, `Retention Days`, `CODEC`, `Total Storage`, `Scene Complexity`, `Recording hours`, `Recommended Server`.

---

## 2026-05-19 — Step 8: Pipedrive Deal creation per submission

### Work done

- **New module tree** under `src/lib/pipedrive/`:
  - `client.ts` — thin fetch wrapper around `https://api.pipedrive.com/v1/...`, `api_token` appended from `env.PIPEDRIVE_API_TOKEN`. Typed methods for the 10 endpoints Step 8 touches (`getPipelines`, `getStages`, `searchUsers`, `searchPersons`, `searchOrganizations`, `createPerson`, `createOrganization`, `getDealFields`, `createDealField`, `createDeal`, `createNote`). All paths return parsed `data` or throw a typed `PipedriveError` carrying status + `error_info` so callers can log without re-parsing.
  - `lookups.ts` — `resolvePipelineId`, `resolveStageId`, `resolveOwnerId`, `ensureCustomFields`. Module-level promise cache: each lookup runs once per process and subsequent calls are free. `resolveOwnerId` honors `PIPEDRIVE_DEAL_OWNER_ID` as an optional override before the name lookup. `ensureCustomFields` reads `/dealFields`, finds the six `arxys_*` fields by `name`, creates any that are missing, returns a `{ friendly_name: hashed_key }` map (the hashed key is what `createDeal` requires when writing custom values).
  - `contacts.ts` — `upsertPerson({ name, email, orgId? })` and `upsertOrganization({ name })`. Search-by-email / search-by-name first; create if no hit. Idempotent — re-running a submission for the same partner returns the same IDs.
  - `deal.ts` — `createDealFromSubmission(submission, recommendation, partner)`. Resolves pipeline + stage + owner + custom-field keys in parallel (cached), upserts org then person, builds the payload (`value=0`, currency USD, six custom fields keyed by their hashed keys, title falls back to `${company} — submission ${id}` when project name is blank), posts the deal, and pins a placeholder note explaining the $0 value (ADR 0019). Returns `{ dealId }`. Note-creation failure is logged but does not invalidate the deal.
- **No migration needed.** `submissions.pipedrive_deal_id bigint` is already in `20260515193702_initial_schema.sql` at line 119. Discovered this on `supabase db push` when the duplicate `alter table` errored with `column "pipedrive_deal_id" of relation "submissions" already exists`. Deleted the redundant migration file; the column already exists on the cloud DB and locally. No RLS change required; per-partner RLS already gates the row.
- **Server Action wire-up** in `src/app/(app)/calculator/actions.ts` — after `sendSubmissionNotification(...)` returns, call `createDealFromSubmission(...)` inside its own `try/catch`. On success: `UPDATE submissions SET pipedrive_deal_id = ?`. On failure: `console.error("pipedrive deal creation failed", { submissionId, error })`. Submission success is already committed to the client at this point; a Pipedrive outage cannot regress the persist/PDF/email path.
- **Test** `src/lib/pipedrive/deal.test.ts` — 7 cases, all mocking `globalThis.fetch`:
  - Deal payload has `title`, `value=0`, `currency=USD`, resolved `pipeline_id`/`stage_id`/`user_id`/`person_id`/`org_id`, and all six custom-field hashed keys mapped to the right values.
  - Title falls back to `${company} — submission ${id}` when `projectName` is null.
  - A pinned `/v1/notes` POST follows the deal create with the Phase 1 placeholder text + ADR 0019 reference.
  - Pipeline / stage / owner / dealFields lookups fire exactly once across two `createDealFromSubmission` invocations (cache works).
  - When `/persons/search` and `/organizations/search` hit, no create POSTs are issued.
  - When they miss, `/persons` + `/organizations` are POSTed with the expected name/email/org_id.
  - When `/dealFields` returns only a subset, the missing ones are created and their returned hashed keys appear in the final deal payload.
- **Docs** — ADR [`0020-pipedrive-deal-creation-on-submission.md`](./decisions/0020-pipedrive-deal-creation-on-submission.md). RUNBOOK unchanged (no new env var; `PIPEDRIVE_API_TOKEN` already in `REQUIRED_VARS`).
- **Verification** — `npm test` 16/16, `npm run lint` clean, `npm run build` clean (Turbopack, 6.1s compile + 4.0s TS, 10 static pages).

### Detours & fixes

- **Vercel had `PIPEDRIVE_API_KEY`, not `PIPEDRIVE_API_TOKEN`.** First production smoke test: email + PDF arrived, no Pipedrive deal created. `vercel logs --json` on the production deployment showed the caught error: `Error: Missing required environment variable: PIPEDRIVE_API_TOKEN` — the lazy `env.ts` getter threw, the defensive `try/catch` in `submitCalculation` ate it (correct behaviour), submission + email succeeded but no deal. Root cause: Vercel had `PIPEDRIVE_API_KEY` set (orphaned from a Phase 1 scaffold attempt — referenced only in the Phase 2 proposal doc, not in any current code); `.env.local` and `env.ts`'s `REQUIRED_VARS` both use the canonical name `PIPEDRIVE_API_TOKEN`. The handoff brief's assumption that `PIPEDRIVE_API_TOKEN` was already in Vercel production was wrong. Same shape of bug as Step 5's "SMTP vars missing from Vercel" (logged 2026-05-19). Fix: `vercel env add PIPEDRIVE_API_TOKEN production --sensitive` with the value from `.env.local`, `vercel redeploy <prod-url>` so the new env reaches the running deployment. Left the stale `PIPEDRIVE_API_KEY` in place at user request (orphan, no current consumer; Phase 2 will use `PIPEDRIVE_API_TOKEN` too).
- **The `pipedrive_deal_id` column was already in the initial schema.** Wrote a fresh migration per the brief, ran `supabase db push`, hit `ERROR: column "pipedrive_deal_id" of relation "submissions" already exists`. Confirmed via grep: `20260515193702_initial_schema.sql:119` already declares `pipedrive_deal_id bigint`. Deleted `20260519224318_step8_submissions_pipedrive_deal_id.sql`. No schema change needed for Step 8; the column has been in place since the project's first migration. Worth noting because the Step 8 brief explicitly called for a new migration, which would have been a hard error in CI if the duplicate had landed.
- **Linking the cloud project after the iCloud → ~/Developer move.** `supabase/.temp/` only carried `cli-latest` from the clone; the project ref was not preserved. `supabase db push` failed with `Cannot find project ref. Have you run supabase link?`. Re-linked via `supabase link --project-ref ddqnpwpouvkgivvbjpju --password '…'`, extracting the ref from `NEXT_PUBLIC_SUPABASE_URL`. This is a one-time chore in the new working copy and only matters until the link is cached.
- **`import "server-only"` blocks the test.** Initial draft followed the brief's "(same pattern as the email transport)" and put `import "server-only"` on all four pipedrive modules. The deal test imports `deal.ts` directly, which fails under `tsx --test` with `Cannot find module 'server-only'` — the marker package is not a direct dependency of the repo (Next.js carries its own compiled copy at `node_modules/next/dist/compiled/server-only/` and the bundler aliases the bare import internally). First workaround attempt: pass `--conditions=react-server` so Node resolves to the empty stub. That broke the existing PDF test because `@react-pdf/renderer` exposes a different (less complete) entry under the `react-server` condition (`Cannot read properties of undefined (reading 'S')`). Settled on dropping the marker from the four pipedrive modules entirely. Server-side enforcement comes indirectly from `env.PIPEDRIVE_API_TOKEN` being non-`NEXT_PUBLIC` — a client component that tried to use the pipedrive client would throw at the env read. Documented this tradeoff in `client.ts`'s header comment and in ADR 0020's "Negative" consequences.
- **Pipedrive Deals don't have a description field.** The brief said "Deal description: include a one-line note…". Initial draft tried to bundle the note into the deal `title` in a parenthetical; that's ugly and visible everywhere the title appears (lists, notifications, Slack integrations). Replaced with a separate `POST /v1/notes` after `createDeal`, with `pinned_to_deal_flag: 1` and `deal_id` set. Note-creation failure is caught + logged so it cannot fail the deal write that already succeeded.
- **Storage in GB has fractional precision.** Bandwidth and storage totals from the calculator have many decimals (e.g. `1500000.789`). Trimmed both to 2 decimals before sending to the custom fields — Pipedrive accepts arbitrary precision but `1500000.79` reads more clearly to a human browsing the deal.

### Decisions captured

- [`0020-pipedrive-deal-creation-on-submission.md`](./decisions/0020-pipedrive-deal-creation-on-submission.md) — synchronous Pipedrive write in the Server Action, defensive catch, runtime name → ID resolution with module-level cache, $0 Deal value + pinned placeholder note pending Phase 2.

### Pending

- End-to-end smoke test on Vercel production: save a calculation, confirm a new Deal lands in `Project Pipeline → New Lead`, owned by Andy, with the partner's Person + Organization linked, all six custom fields populated, value $0, pinned note visible. Verify `submissions.pipedrive_deal_id` is non-null afterwards.
- Negative smoke test: temporarily set `PIPEDRIVE_DEAL_OWNER_ID` to a clearly-invalid value (e.g. `99999999`) in Vercel, save another submission, confirm the partner still sees a success response and `pipedrive_deal_id` remains `NULL`.

---

## 2026-05-19 — Planned: Step 8 (Pipedrive Deal creation) — scope locked

### Work done

Locked the inputs for the upcoming Step 8 implementation session. No code yet; values recorded here so they survive any session-compaction or context switch:

- **Trigger:** every successful `submitCalculation` Server Action call creates a Pipedrive Deal after the existing sales + partner emails go out. Pipedrive failure must not block the submission, the emails, or the PDF download — same defensive pattern Steps 6+7 used for PDF.
- **Pipedrive target:**
  - Pipeline: **"Project Pipeline"** (resolved at runtime by name → ID lookup against `GET /v1/pipelines`)
  - Initial stage: **"New Lead"** (resolved at runtime by name → ID against `GET /v1/stages?pipeline_id=N`)
  - Owner: **"Andy Newbom"** (resolved at runtime via `GET /v1/users?term=Andy+Newbom`, cached; failure surfaces a clear error suggesting a `PIPEDRIVE_DEAL_OWNER_ID` env override)
- **Custom fields:** implementation session creates them on first run if absent (idempotent — check by `key` then create). Fields:
  - `arxys_submission_id` (varchar)
  - `arxys_total_cameras` (double)
  - `arxys_bandwidth_mbps` (double)
  - `arxys_storage_gb` (double)
  - `arxys_recommended_models` (varchar, e.g. "3 × V800")
  - `arxys_portal_url` (varchar, URL back to portal — placeholder route for now, e.g. `https://portal-arxys.vercel.app/dashboard`)
- **Field mapping (confirmed):**

  | Submission field | Pipedrive Deal field |
  |---|---|
  | Project name | Deal title |
  | (placeholder $0 — real pricing in Phase 2 per ADR 0019) | Deal value |
  | Partner contact email | Person (lookup by email; create if missing) |
  | Partner company | Organization (lookup by name; create if missing) |
  | Submission ID | Custom `arxys_submission_id` |
  | Total cameras | Custom `arxys_total_cameras` |
  | Total bandwidth Mbps | Custom `arxys_bandwidth_mbps` |
  | Total storage GB | Custom `arxys_storage_gb` |
  | Recommended models | Custom `arxys_recommended_models` |
  | Link to submission | Custom `arxys_portal_url` |

- **Phase 1 placeholder rule (per ADR 0019):** Deal value = 0, with a `[Phase 1 placeholder — pricing in Phase 2]` note added to the Deal description so internal users browsing Pipedrive see the gap explicitly.
- **Scope reaffirmed:** next session is **Step 8 only**. Step 9 (Admin) is a separate future session. Step 10 (real pricing) is removed from Phase 1, replaced by the Phase 2 Pricing Pipeline project (`docs/proposals/phase-2-pricing-pipeline.md`).

### Decisions captured

- ADRs to author at Step 8 implementation:
  - `0020-pipedrive-deal-creation-on-submission.md` — Pipedrive Deal trigger, defensive failure path, runtime lookups (pipeline/stage/owner/custom-field IDs) over hardcoded constants.

---

## 2026-05-19 — Planned: defer real pricing to Phase 2; Phase 1 uses placeholders

### Work done

- Inspected the actual VideoX MSRP price list (43 SKUs across 12 product families, storage-tier-specific SKUs). Discovered that real pricing forces a schema rewrite, an algorithm rewrite (SKU-level recommendation), and depends on data work that is not yet done.
- Read Andy's Pricing Pipeline planning doc (Google Sheet → Pipedrive → Supabase → Portal, with its own Phase 0/1/2/3) and saved it verbatim at [`docs/proposals/phase-2-pricing-pipeline.md`](./proposals/phase-2-pricing-pipeline.md). Outstanding reconciliation questions captured at the bottom of that file (count mismatch, V255/V270 group assignment, schema collision with existing `products`, etc.).
- **Scope decision:** Portal Phase 1 will not implement real pricing. The originally-planned Portal Step 10 is dropped. Placeholders are used everywhere until Phase 2 (the Pricing Pipeline project) replaces them.
  - `products.list_price_usd` placeholders (1..6) from Step 5 stay as-is.
  - Calculator, PDF, and email show "Pricing TBD" or equivalent text in any price field.
  - Pipedrive Deal creation (Portal Step 8) omits the `value` field or sets it to 0, with a placeholder note.
- Captured the rationale in [`decisions/0019-defer-real-pricing-to-phase-2.md`](./decisions/0019-defer-real-pricing-to-phase-2.md).
- Revised Portal Phase 1 remaining work: Step 8 (Pipedrive Deals, no real pricing) → Step 9 (Admin) → Step 11 (pre-launch checklist). Step 10 deferred to Phase 2.

### Detours & fixes

- **Sandbox blocked reading the xlsx from `~/Library/CloudStorage/Dropbox/`.** macOS TCC denies terminal access to Dropbox-managed paths. Worked around by asking Andy to `cp` the file to `~/Desktop/` where shell access is unrestricted. The price list itself was set aside after reading — it's being retired in favor of the Master Google Sheet (Pricing Pipeline Phase 0).
- **First scope cut was too narrow.** Initially proposed combining Steps 8+10 (Pipedrive + Pricing) as a single 4–6 hour session. The price-list inspection revealed Step 10 alone was 6–8 hours and would force schema + algorithm changes; bundling it with Step 8 became infeasible. The Phase 2 deferral resolves this cleanly.

### Decisions captured

- [`0019-defer-real-pricing-to-phase-2.md`](./decisions/0019-defer-real-pricing-to-phase-2.md) — real pricing moves to the Pricing Pipeline project; Phase 1 uses placeholders.

---

## 2026-05-19 — Ops: moved repo out of iCloud Documents to ~/Developer/

### Work done

- Relocated the working copy from `~/Documents/Documents - Andy’s Gold Mac/ARXYS/Arxys Portal/` to `~/Developer/Arxys Portal/`. Clone-fresh approach (not `mv` or `cp -R`) so no iCloud-specific metadata follows.
- Procedure: ran `/tmp/move-portal-to-developer.sh` (saved in case of repeat). Pre-flight required clean working tree + `local main == origin/main`. Script: cloned from `git@github.com-arxys:Arxys-Projects/Portal.git`, copied `.env.local`, ran `vercel link --yes --project=portal`, `npm ci`, `npm run build`. Old folder left intact for rollback.
- Updated RUNBOOK §1 to direct future clones into `~/Developer/` and to call out the iCloud penalty explicitly so the lesson doesn't have to be re-learned.
- The U+2019 curly-apostrophe note from the previous JOURNAL entry is now obsolete for any working-copy path under the new location (`~/Developer/Arxys Portal/` has no special characters). The previous entry stays in the JOURNAL as history; the in-memory note in `~/.claude/projects/-Users-andynewbom/memory/MEMORY.md` has been superseded.

### Detours & fixes

- **Why this was triggered.** Step 6+7's implementation session reported `npm run build` and `tsc --noEmit` "wedged at 0% CPU on iCloud Documents I/O" and had to push to Vercel CI to get an authoritative build. That CI run caught a TypeScript error (`9b6c032` — `cast SubmissionPdf element to DocumentProps for renderToBuffer`) that should have been a local 3-second check. The penalty was no longer "build is slow" — it was "build doesn't run." Time to leave iCloud.
- **Measured improvement.** Same code, same machine, just a different path: post-move `npm ci` = 9s, `npm run build` (turbopack) = 6.5s total (3.7s compile + 2.6s typecheck + 0.17s static gen). Prior iCloud-folder runs hung indefinitely.
- **Pre-flight catch.** Script's `local main == origin/main` check forced verification that the other chat's commits (`cd14c28` then `9b6c032`) had all reached origin before the move. Without that check the move would silently take a stale snapshot.
- **`git ls-files --others -i --exclude-standard` output exploded.** The pre-flight prints gitignored files for visibility; with `node_modules` populated this is tens of thousands of lines. Cosmetic, not a functional issue, but worth noting for anyone re-using the script — pipe through `head` if you want to skim.

### Decisions captured

- No new ADR. This is an environmental move, not an architectural decision; the rationale lives in this JOURNAL entry and in the RUNBOOK §1 caveat.

---

## 2026-05-19 — Note: repo path uses U+2019, not ASCII apostrophe

### Work done

- Caught a recurring error in the handoff briefs: the working-directory path was being written as `Andy's Gold Mac` (ASCII `'`) when the actual folder is `Andy’s Gold Mac` (U+2019, RIGHT SINGLE QUOTATION MARK, UTF-8 `0xE2 0x80 0x99`). Verified via `pwd | od -c`.
- Effect of the typo: `cd "/Users/andynewbom/Documents/Documents - Andy's Gold Mac/..."` silently fails (no such directory), then a fresh session burns time looking for the folder via `find` or `ls`.
- Future briefs and any shell snippets shared with fresh sessions must use the curly `’`. Copy-paste from this JOURNAL entry or from the file path in your terminal — do not retype.

---

## 2026-05-19 — Steps 6 + 7: submission PDF + partner-facing email

### Work done

- **PDF module** under `src/lib/pdf/`:
  - `colors.ts` — palette constants (Arxys gold, cameras blue, bandwidth cyan, storage green, slate/muted text, light bg/border, note bg/border/text). Mirrors the legacy WordPress mailer hex values; one source of truth, no hardcoded hexes inside the renderer.
  - `types.ts` — `SubmissionPdfInput` view model. Pure data shape; the renderer never sees Supabase or the legacy schema.
  - `SubmissionPdf.tsx` — `@react-pdf/renderer` `Document` rendering the eight sections from the legacy `arxys_build_pdf_html()` (gold-bar header, title, 3-up summary boxes, Project Information table, Camera Details table, Recommended Hardware box, 20%-overhead note, footer). US Letter portrait, 50px margins / 80px bottom, default Helvetica font (no font registration — keeps the bundle small).
  - `render.ts` — `renderSubmissionPdfBuffer(input)` returns a `Buffer` via `renderToBuffer`; `pdfFilename(input)` produces `Arxys-Report-YYYY-MM-DD-<submissionId>.pdf`; `loadSubmissionPdfInput(submissionId, supabase)` assembles the view model from a persisted row + partners + products + server_specs joins (used by the Route Handler).
- **Route Handler** `src/app/(app)/api/submissions/[id]/pdf/route.ts` — GET-only, `runtime = 'nodejs'` (React-PDF needs Node builtins), Supabase SSR auth; RLS on `submissions` does the per-partner authorization implicitly. Returns the PDF with `Content-Disposition: attachment` and `Cache-Control: private, no-store`.
- **Email sender** `src/lib/email/submission-notification.ts` — accepts optional `pdfBuffer + pdfFilename` (attached to both messages when present) and optional `partnerEmail`. Sales message keeps the Step-5 plain-text body. Partner message gets a partner-friendly subject ("Your Arxys Video Storage Report") and a short partner-framed body. Both preserve ADR 0015's BCC-to-`SMTP_USER`. Partner-send failure is caught and logged so it cannot regress the sales-send path.
- **Server Action** `src/app/(app)/calculator/actions.ts` — server_specs query now also pulls `products.name` and `products.description`. After `recommend()` runs, the action builds the `SubmissionPdfInput` from in-memory data (no re-query of the row it just inserted), renders the PDF in a `try/catch` (render failure → `pdfBuffer` stays undefined and the sales email goes out without an attachment, submission still persists), and passes `pdfBuffer + pdfFilename + partnerEmail` to `sendSubmissionNotification`.
- **Calculator UI** — `RecommendationPanel` in `calculator-form.tsx` gets a `Download PDF` anchor (`href` to the new Route Handler, `download` attribute, opens the file with the partner-branded filename). Styled via a new `.ax-pdf-btn` rule in `calculator.css`, scoped under `#arxys-calc-root`.
- **Test** `src/lib/pdf/render.test.ts` — golden case asserts the renderer produces a non-empty buffer beginning with the `%PDF-` magic header. Imports `SubmissionPdf` + `@react-pdf/renderer` directly to dodge the `import "server-only"` marker on `render.ts` (the marker is intentional for the production path; the test exercises the same composition without it). Runs in ~210ms; all nine tests (eight existing recommend + one new PDF) pass under `tsx --test`.

### Detours & fixes

- **`@react-pdf/renderer` was already installed.** ADR 0014 mentioned it was in `package.json` but unused — confirmed at `^4.5.1` with the lockfile committed. No new install needed; brief Step 1 was a no-op.
- **Brief said "iterate `RecommendationResult.units[]`".** Wrong shape. `RecommendationResult.winner` is a single `RecommendationCandidate` (one model + N units), not a list of different models. The PDF's Recommended Hardware section is one line: `<winner.units> x <product description>` + capacity sub-line. Warnings render as additional yellow note boxes below the recommend box.
- **No `failover` column on `submissions`.** Confirmed in the schema (and noted in the previous JOURNAL entry's known mismatches). Omitted that row from the PDF Project Information section per the brief.
- **`daily_ingest` column also absent, but the value is derivable.** Computed as `totals.storageGb / retentionDays` at render time and surfaced in the Project Information section to preserve parity with the legacy report.
- **`server-only` blocks the test runner.** `render.ts` uses `import "server-only"`, which throws under plain Node. The test was rewritten to import `SubmissionPdf.tsx` + `renderToBuffer` directly — exercises the same composition `renderSubmissionPdfBuffer` does, without the marker. The marker stays on the production module to fail fast if anyone tries to bundle the renderer into a client component.
- **Product description sourcing.** Legacy PHP used `server['description']`. The portal's `products` table has both `name` ("VideoX V200 1U 4Bay Rack") and `description` ("V5 NVR Server — …"). The PDF shows `name — description` when both exist, falling back to `name`, then `modelCode`. Same logic in the action (in-memory) and the route handler (from the persisted row).

### Decisions captured

- [`0016-pdf-library-react-pdf.md`](./decisions/0016-pdf-library-react-pdf.md) — `@react-pdf/renderer` over Puppeteer/pdf-lib (Vercel-friendly, JSX maintainability, no Chrome dependency).
- [`0017-pdf-no-storage.md`](./decisions/0017-pdf-no-storage.md) — render on every read; no Supabase Storage, no `pdf_path` column.
- [`0018-partner-email-on-submission.md`](./decisions/0018-partner-email-on-submission.md) — partner now receives their own copy of the report via a separate sendMail call; supersedes ADR 0014. ADR 0014 status updated to "Superseded by 0018".

### Pending

- End-to-end smoke test on Vercel production: save a calculation, confirm both sales and partner mailboxes receive the email with the attached PDF, confirm the Download PDF button returns a valid file.

---

## 2026-05-19 — Planned: Steps 6 + 7 combined (PDF + partner email)

### Work done

- Decided to combine Steps 6 (PDF) and 7 (email) into a single implementation session. Rationale: both modify the same Server Action (`submitCalculation`), the same email sender (`submission-notification.ts`), and consume the same artifact (the PDF buffer). Splitting them would create duplicate plumbing across two sessions for no benefit.
- Step 7 scope confirmed narrow: **partner-facing email only**. The partner who saved the submission receives the same PDF the sales group already gets (per Step 5). No unsubscribe management, no email service migration, no customer end-user email. Email preferences and CAN-SPAM compliance are deferred to a later step if/when needed.
- The combined session adds one ADR beyond the original Step 6 set: `0018-partner-email-template.md` (Context: partner now gets a copy; Options: identical body to sales / partner-friendlier wording; Decision: TBD by implementation).

---

## 2026-05-19 — Planned: Step 6 (PDF generation) — scope locked

### Work done

- Confirmed Step 6 in the Phase 1 plan (kickoff entry, 2026-05-14) is **PDF generation**. Eleven-step plan ordering: scaffold → schema → auth → calculator integration → API route → **PDF** → email → Pipedrive → admin → pricing → pre-launch.
- Decisions locked for the implementation session:
  - **Audience:** both partner + sales. Same PDF, two delivery channels — a Download button on `/calculator` after submit, and an attachment on the existing internal sales notification email.
  - **Content:** mirror what `reference/arxys-calculator-mailer-FINAL.php`'s `arxys_build_pdf_html()` produced. Sections in order: gold-bar header, title, 3-up summary boxes (cameras / bandwidth / storage), Project Information table, Camera Details table (per-group), Recommended Hardware box, 20%-overhead note, footer.
  - **Library:** `@react-pdf/renderer`. JSX-based, runs in Node/Vercel without headless Chrome.
  - **Storage:** none. Generate on-demand. Partner click re-renders from the live submission row. Email attachment generated in-memory at notification time. `submissions` schema **does not** get a `pdf_path` column.
- Reference PHP confirmed on disk at `reference/arxys-calculator-mailer-FINAL.php` (709 lines; PDF html builder at lines 209–308; uses Dompdf 3.1.5 on the legacy WordPress side).
- Two known mismatches between the legacy PDF and the current submission schema that the implementation session will need to handle:
  1. The legacy PDF shows `failover` and `daily ingest` per-row. Current Step-2 schema does not have a failover field. Either drop those fields from the new PDF, or surface them from the form if they exist there but aren't persisted yet.
  2. Legacy "Recommended Hardware" assumed a single model row (`N x [server description]`). Step 5's recommendation can return multiple units of different models. The new PDF must iterate the `RecommendationResult.units[]` and may render multiple rows or a single combined row — implementation choice.

### Decisions captured

- ADRs to author at implementation time:
  - `0016-pdf-library-react-pdf.md` — why `@react-pdf/renderer` over Puppeteer or pdf-lib (Vercel-friendly, JSX maintainability, no Chrome dependency)
  - `0017-pdf-no-storage.md` — why generate on-demand instead of persisting to Supabase Storage (current submissions are immutable in practice; storage cost + signed-URL complexity not yet justified; revisit when a "share this submission" feature lands)

---

## 2026-05-19 — Step 5 closed

### Work done

Step 5 (save-and-recommend on `/calculator`, with internal sales notification) is shipped to production and verified end-to-end. The original Step 5 Definition of Done is met:

- Migration applied to the cloud Supabase project. `server_specs` seeded with six VideoX rows; `submissions.groups_payload` jsonb in place.
- `npm run build` clean (Turbopack, 8 routes, 0 errors).
- `npm run lint` clean.
- `npm test` — 8/8 recommendation-algorithm golden cases pass.
- Save click on `/calculator` writes the submission row, sends a notification through Gmail SMTP to the `sales@arxys.com` Google Group, and renders the recommendation inline below the form without a page reload.
- Two real submissions placed in production. Both rendered correctly (3 × V800 with both warnings; 2 × V200 with stacking warning), both visible in the Sales group's Conversations view, owner receives a direct copy via the BCC fix.

ADRs 0012 (bandwidth gate dropped; supersedes 0006), 0013 (inline result), 0014 (internal-only email), and 0015 (BCC SMTP user) are on disk.

### Deferred to future work — non-blocking

These came up during Step 5 verification but were never in the Step 5 brief. They are tracked here so they don't rotate out of head:

- **DKIM alignment for outbound `arxys.com` mail.** Half-done already — the DKIM TXT record at `google._domainkey.arxys.com` exists (1024-bit RSA, selector `google`). What's missing is flipping **Workspace Admin → Apps → Google Workspace → Gmail → Authenticate email → Start authentication** so outbound Gmail-SMTP mail signs as `d=arxys.com` instead of `d=arxys-com.YYYYMMDD.gappssmtp.com`. Optional upgrade to a 2048-bit key in the same pass. DNS hosted at SiteGround; the TXT-record swap goes through SiteGround's DNS Zone Editor. Effect: stops the DMARC alignment-fail signal in arxys.com's daily Mimecast reports, lowers spam-classification risk on Workspace member mailboxes, and is a prerequisite for ever tightening DMARC from `p=none` to `p=quarantine`/`p=reject`. **Not a portal code change.**
- **Member spam-folder confirmation.** Three non-owner members of `sales@arxys.com` should confirm portal notifications aren't landing in Spam. If they are, the DKIM work above is the durable fix.

### Decisions captured

None new in this entry. ADR 0015 (the BCC fix) was captured in yesterday's verification entry below.

---

## 2026-05-19 — Step 5 verification + Google Groups loopback fix

### Work done

- End-to-end smoke test on Vercel production with two real submissions ("test andy" → 3 × V800 with both warnings; "ttt" → 2 × V200 with stacking warning). Submissions persisted, recommendation algorithm produced correct results, emails landed in the Sales Google Group's Conversations view.
- **Detour:** group owner (`andy.newbom@arxys.com`) reported not receiving the notification despite being a member of `sales@arxys.com`. Root cause: Google Groups suppresses fan-out delivery back to the sending member by design. Send-mail-as alias does not escape this rule. Fixed by BCC'ing `SMTP_USER` on every notification (see ADR 0015). Implementation: one conditional in `src/lib/email/submission-notification.ts` — no new env var.
- Also resolved the **Vercel env-var gap** discovered during the same test run: none of the six `SMTP_*` / `INTERNAL_NOTIFICATION_EMAIL` vars existed in Vercel production, only in `.env.local`. The lazy validator in `env.ts` therefore threw at first SMTP read; the catch in the Server Action swallowed it (by design) and the UI showed success. Pushed all six via `vercel env add --sensitive`, then `vercel redeploy` (Vercel only applies new env vars to new deployments).

### Detours & fixes

- **"No email received" looked like an SMTP failure but was three separate issues.** In order of discovery:
  1. Missing env vars in Vercel production → fixed by `vercel env add` + redeploy.
  2. Loopback suppression on the owner's own group → fixed by ADR 0015's BCC.
  3. DKIM alignment failure on outgoing Gmail-SMTP mail (signed `d=gappssmtp.com` instead of `d=arxys.com`) — flagged in the original DMARC report. Today this is harmless (`arxys.com` is `p=none`). Logged as a follow-up; the fix is in Google Workspace Admin, not in portal code.

### Decisions captured

- [`0015-bcc-smtp-user-on-group-notifications.md`](./decisions/0015-bcc-smtp-user-on-group-notifications.md) — BCC the SMTP user to bypass Google Groups loopback suppression.

### Pending follow-ups

- Configure `arxys.com` DKIM signing in Google Workspace Admin so outbound Gmail-SMTP mail signs as `d=arxys.com` and aligns with DMARC. Not a portal code change.
- Members of the Sales group should confirm the notifications aren't landing in their Spam folders. If they are, the DKIM alignment work above is the durable fix.

---

## 2026-05-18 — Step 5: submission save, recommendation algorithm, sales notification

### Work done

- **Migration `supabase/migrations/20260519052732_step5_submissions_and_seeds.sql`:**
  - Dropped `NOT NULL` on `server_specs.max_bandwidth_mbps` and replaced the CHECK with `is null or > 0` (ADR 0012 supersedes 0006 — bandwidth gate removed).
  - Added `submissions.groups_payload jsonb` so the per-camera-group form snapshot is preserved alongside the single-row recommendation. Resolves the open question from ADR 0011.
  - Seeded six `products` rows (VideoX V200–V800) with `list_price_usd` = 1..6 as the order-proxy pricing the Step 5 decision called for. Stable UUIDs so server_specs FK references are deterministic.
  - Seeded six `server_specs` rows referencing those products. `max_storage_tb` = configurator MAX; configurator MIN recorded in `notes`. `max_bandwidth_mbps` left NULL.
- **`src/lib/recommend/`** — pure module with no I/O:
  - `types.ts`: `ServerSpec`, `RecommendationInput`, `RecommendationCandidate`, `RecommendationResult`. `GB_PER_TB = 1000` (vendor convention).
  - `algorithm.ts`: multi-unit packer per ADR 0003, bandwidth gate removed per ADR 0012. Tiebreak: total cost, then unit price, then alphabetical model code. Emits warnings for `units > 1` and for workloads that exceed the largest single VideoX on cameras or storage.
  - `algorithm.test.ts`: 8 golden cases including the tricky 2×V200-beats-1×V400-on-unit-price-tiebreak. All pass under `npm test` (added `"test": "tsx --test 'src/**/*.test.ts'"` to package.json).
- **`src/lib/email/`** — Gmail SMTP transport per ADR 0002 (`transport.ts` lazy-caches the nodemailer instance) + `submission-notification.ts` plain-text template that sends to `INTERNAL_NOTIFICATION_EMAIL` (already in `env.ts`). Internal-only for Phase 1 — ADR 0014.
- **`src/app/(app)/calculator/actions.ts`** — Server Action `submitCalculation`. Validates with zod, **server-side recomputes** totals (client values are never trusted), loads active `server_specs` with their product price via a single FK join, runs `recommend()`, inserts the submission (the primary group's resolution/codec/complexity becomes the canonical single-row record; the full per-group payload lives in `groups_payload`), sends the sales notification, stamps `email_sent_at`. Email failure does not block the submission — it is logged server-side.
- **`src/app/(app)/calculator/calculator-form.tsx`** — added Save button + inline RecommendationPanel below the form. Wired via `useActionState`. Panel shows unit count, model, cameras + storage coverage, driving dimension, warnings, and the submission ID. ADR 0013 — no `/submissions/[id]` route.
- **CSS** — appended `.ax-save*` and `.ax-rec*` selectors to `calculator.css`, all scoped under `#arxys-calc-root`.
- **Docs** — three new ADRs (0012 supersedes 0006 inline, 0013, 0014). ADR 0006 status line updated to "Superseded by 0012 on 2026-05-18".

### Detours & fixes

- **Brief assumed schema state that didn't match disk.** The brief proposed creating `server_specs` and a new `submission_groups` table. In reality `server_specs` was already in `20260515193702_initial_schema.sql` with the final ADR-0006 shape (including `max_bandwidth_mbps NOT NULL CHECK > 0`), and `submissions` already had `recommended_product_id` + `recommended_units` for a single-recommendation-per-submission shape. Confirmed with the user before writing code: skip `submission_groups`, add `groups_payload jsonb` to `submissions` instead.
- **Three blockers surfaced in a single AskUserQuestion before writing the algorithm.** Decisions: drop the bandwidth gate (option C → ADR 0012); use 1..6 order-proxy pricing on `products.list_price_usd`; skip `submission_groups` and use the jsonb column.
- **`INTERNAL_NOTIFICATION_EMAIL` already existed in `src/lib/env.ts`** as a required var. The brief's "hardcode `sales@arxys.com`" was wrong — used the env var to stay aligned.
- **No test runner was set up.** Added an `npm test` script using `tsx --test` (tsx was already a devDep, no new packages needed).
- **ESLint runs appeared to hang** under the harness — the `npm run lint` script is bare `eslint`, which on flat-config lints with no output on success. Two completed background runs returned exit 0 with empty stdout; that's the success signal. Future: add `--max-warnings 0` for explicit confirmation.

### Decisions captured

- [`0012-bandwidth-gate-resolution.md`](./decisions/0012-bandwidth-gate-resolution.md) — drop the bandwidth gate; supersedes 0006.
- [`0013-submission-result-inline.md`](./decisions/0013-submission-result-inline.md) — inline result on the calculator page; no `/submissions/[id]`.
- [`0014-submission-email-notification.md`](./decisions/0014-submission-email-notification.md) — internal-only sales email for Phase 1; no partner email or PDF.

### Pending

- `supabase db push` against the cloud project — the migration is on disk but needs `SUPABASE_DB_PASSWORD` from the user's password manager. Run from the repo root:
  ```
  SUPABASE_DB_PASSWORD='<from-password-app>' supabase db push
  ```
- End-to-end smoke test on a real Supabase project: sign in as a partner, fill the calculator, click Save, confirm the submission row + the email to `sales@arxys.com`.

---

## 2026-05-18 — Planned: Step 5 handoff brief patches (transport, auth, ADR title)

### Work done

Three clarifications folded into the Step 5 handoff brief before the implementation session opens:

1. **Email transport is Gmail SMTP, already decided.** ADR [`0002-gmail-smtp-over-siteground.md`](./decisions/0002-gmail-smtp-over-siteground.md) is authoritative — env vars `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (with `SMTP_FROM=noreply@arxys.com` via Gmail "Send mail as" alias). The internal notification recipient is `sales@arxys.com` (the brief used `INTERNAL_NOTIFICATION_EMAIL` as a placeholder — confirm whether that env var exists or hardcode `sales@arxys.com` in the action; user preference: hardcode for Phase 1, no need for an env var). If `src/lib/email/` does not yet exist, the implementation session creates it using nodemailer against the env vars above. Do **not** pick a different transport (Resend, SES, etc.) — that would silently supersede ADR 0002.

2. **Auth posture: all behind login.** `/calculator` lives under `(app)/`, the protected route group. Anonymous submissions are not in scope. RLS on `submission_groups` therefore mirrors `submissions` exactly: `partner_id = auth.uid() OR is_admin()`. The Server Action reads the Supabase user from the server-side client and writes `partner_id` from `auth.uid()` — never trusts a client-supplied id.

3. **ADR 0012 title generalized.** Renamed from `0012-server-specs-bandwidth-resolution.md` to `0012-bandwidth-gate-resolution.md` so the title fits all three branches (A: add column, B: derive from cameras, C: drop the gate and supersede ADR 0006). The ADR records which option the user picked and the rationale; if option C, it also carries the `Supersedes: 0006` link and ADR 0006 gets its `Status:` line updated in the same commit.

These three points are now part of the handoff brief the user is pasting into the Step 5 session.

---

## 2026-05-18 — Planned: Step 5 configurator data received + bandwidth-gate open question

### Work done

- User supplied the configurator capacity table for `server_specs` seed (six rows):

  | model | description | max_cameras | storage_min_tb | storage_max_tb |
  |---|---|---|---|---|
  | V200 | VideoX V200 1U 4Bay Rack - V5 NVR Server | 100 | 10 | 64 |
  | V400 | VideoX V400 2U 8Bay Rack - V5 Video & Analytics Server | 200 | 65 | 118 |
  | V500 | VideoX V500 2U 12Bay Rack - V5 Video & Analytics Server | 275 | 119 | 210 |
  | V600 | VideoX V600 3U 16Bay Rack - V5 Video & Analytics Server | 275 | 211 | 300 |
  | V700 | VideoX V700 4U 24Bay Rack - V5 Video & Analytics Server | 325 | 301 | 430 |
  | V800 | VideoX V800 4U 36Bay Rack - V5 Video & Analytics Server | 325 | 431 | 640 |

  Notes:
  - V500 / V600 are identical in camera capacity (275); they differ only in storage range — confirming the earlier "storage-only differentiation" given by the user.
  - V700 / V800 likewise identical in cameras (325); storage-only differentiation.
  - V200 is **NVR-only** (no analytics) — included in this table because Step 5 sizes a bandwidth + storage workload from the existing calculator and V200 is a legitimate cheapest-fit candidate. V200 is **excluded** from the future VideoX Analytics Sizing calculator (that calculator's recommendation set starts at V400).

### Open question (BLOCKING for Step 5 implementation, not for scope)

- **No bandwidth-cap column in the configurator.** ADR 0006 (bandwidth gate) presupposes per-model `max_bandwidth_mbps`. Three options to resolve before code lands:
  - **A)** User supplies per-model bandwidth caps (preferred — keeps the gate as a real constraint).
  - **B)** Derive bandwidth implicitly: `max_bandwidth_mbps = max_cameras × X` for some constant `X` per Mbps/camera. Requires `X` from user.
  - **C)** Drop the bandwidth gate. Recommendation becomes camera-count + storage-only. ADR 0006 would be amended/superseded.
  The implementation session must NOT proceed with the recommendation algorithm until this is answered.

---

## 2026-05-18 — Planned: Step 5 scope locks (inline result on calculator page)

### Work done

- Confirmed Step 5 (submission save / recommendation algorithm) will display its result **inline on the calculator page** rather than redirect to a separate submission detail view. Saves design surface area and keeps the calculator → recommendation → "looks good, submit to sales" flow on one screen.
- `server_specs` seed data confirmed to come from the **configurator data** (per-model capacity table: model, max_cameras, max_bandwidth_mbps, max_storage_tb, optional notes), not the price list. User to supply the sheet at the start of the Step 5 session.
- Step 5 itself deferred to a future fresh Claude Code session. Estimated 3–5 hours focused work.

### Decisions captured

- ADR to author at Step 5 implementation: `NNNN-submission-result-inline.md` (Context: needs a result surface after Save; Options: dedicated `/submissions/[id]` page vs inline panel on `/calculator`; Decision: inline; Consequences: simpler routing, no shareable submission URL until later).

---

## 2026-05-18 — Planned: VideoX Analytics Sizing Calculator (new step, scoped only)

### Work done

- Captured the scope for a new self-contained calculator page to be added to the Portal. **Not yet implemented** — recorded here so the next session has a clean handoff and the open questions don't rotate out of head.
- Scope as provided:
  - **Purpose:** size Avigilon NVR6 workloads (Appearance Search, Appearance Search + Facial Recognition, ALPR) and recommend a VideoX model.
  - **Inputs:** AS-only streams (0–200, used raw), FR streams (0–50, buffered), ALPR lanes (0–60 nominal, real cap depends on FPS tier) + FPS tier selector (5/10/20/30), plus a read-only total stream count.
  - **Buffer step (CONFIRMED 2026-05-18 after a clarification round):** tiered multiplier on FR and ALPR based on stream-count band. AS used raw. *An earlier exchange briefly recorded this as a flat ×1.10; that was wrong and has been reverted.* The authoritative tables:
    - **FR** (max 50): 0–16 → ×1.05; 17–33 → ×1.10; 34–50 → ×1.15.
    - **ALPR 5 FPS** (max 40): 0–13 → ×1.05; 14–26 → ×1.10; 27–40 → ×1.15.
    - **ALPR 10 FPS** (max 20): 0–6 → ×1.05; 7–13 → ×1.10; 14–20 → ×1.15.
    - **ALPR 20 FPS** (max 10): 0–3 → ×1.05; 4–6 → ×1.10; 7–10 → ×1.15.
    - **ALPR 30 FPS** (max 6): 0–2 → ×1.05; 3–4 → ×1.10; 5–6 → ×1.15.
    Integer bands are authoritative; the "% of max" wording in the original spec is rationale, not the implementation rule.
  - **Budget formula:** `(AS/200) + (FR_buffered/50) + (ALPR_buffered/LPR_tier_max)` = single budget fraction.
  - **Tier mapping:** ≤0.50 → NVR6 Standard, 0.51–0.75 → Premium, 0.76–1.00 → Premium Plus, >1.00 → multi-server warning.
  - **VideoX recommendation (FINAL 2026-05-18):** the 20% rule is a per-model **headroom guarantee**, motivated by Arxys product economics (Arxys is ~½ Avigilon's price, so over-spec rather than under-spec). Mechanically: pick the smallest VideoX model whose capacity satisfies `budget ≤ 0.80 × model_capacity`. The "tier-boundary bump" language used earlier is just the visible behavior of this rule near tier ceilings. The Avigilon tier label (Standard / Premium / Premium Plus) is still shown to the user as context but is *not* what drives the model recommendation — the headroom rule does.
  - **UI:** live recalc, visual budget bar (green→amber→red), Avigilon tier label, VideoX recommendation. Client-side only, no backend, no persistence. Match the Arxys Portal styling conventions established for the bandwidth calculator (`#arxys-calc-root` scoped CSS, gold accents).
- Frontend-only. Sits under the protected `(app)/` route group like the existing calculator. No DB migrations, no Route Handlers, no email.

### Open questions / problems flagged before coding

**Resolved 2026-05-18:**
- ~~Asymmetric buffering rationale~~ → AS load is less variable per stream than FR/ALPR. Capture in ADR when authored.
- ~~Whether buffer is tiered or flat~~ → tiered, per the original spec table. The intermediate "flat ×1.10" exchange was a misunderstanding and is reverted.

**Still open:**

1. ~~Per-tier VideoX capacity values~~ → **CONFIRMED 2026-05-18**: V400=0.50, V500/V600=0.75, V700/V800=1.00. Compute tiers are three: {V400}, {V500, V600}, {V700, V800}. Storage choice within a paired tier is out of scope for this calculator.
2. **Boundary comparators on the tier mapping.** Original spec: "≤ 0.50", "0.51–0.75", "0.76–1.00." With floats, 0.501 needs an explicit home. Confirm: `budget ≤ 0.50` → Standard, `0.50 < budget ≤ 0.75` → Premium, `0.75 < budget ≤ 1.00` → Premium Plus, `budget > 1.00` → multi-server.
3. **Single-category overflow.** FR=50 buffered = 57.5 → contributes 1.15 alone. ALPR at tier max → 1.15 alone. So budget > 1.0 is reachable from a single maxed category. Multi-server warning every time, or is there a "V800 covers it" path?
4. ~~V500 in two tier ranges~~ → resolved: V500/V600 are one compute tier; V500 reached from "Standard" workloads is just the headroom rule promoting from V400 to the V500/V600 pair.
5. ~~Premium / Premium Plus showing one or two models~~ → resolved: always show the pair when the recommendation lands in the V500/V600 or V700/V800 compute tier. Note that storage choice within the pair is out of scope.
6. **FPS tier change behavior.** ALPR lanes at 40 (valid for 5 FPS), user switches to 30 FPS (max 6). Clamp value, warn, or allow overflow into budget > 1.0?
7. **ALPR input range 0–60 vs per-tier max of 40/20/10/6.** Clamp input to selected tier's max, or allow 0–60 nominal?
8. **Total stream count.** Display-only, unused in calc. Keep as a sanity check? Label accordingly?
9. **Routing + dashboard entry.** Route path (`/videox-calculator`? `/analytics-sizing`?) and whether the dashboard gets a third card.
10. **Styling scope.** Recommendation: separate `videox-calculator.css` with `#arxys-videox-root` id-scope, share CSS variables via globals.
11. **Input shape.** Recommendation: combined number-input + range-slider per input row.

### Spec status (2026-05-18, post-clarification round)

All blocking questions resolved. Calculator is ready to implement in a fresh Claude Code session. ADRs to author at implementation time:
- One ADR for the buffer-rule rationale (asymmetric AS-no-buffer + tiered FR/ALPR multipliers)
- One ADR for the 20% headroom selection rule + the three-compute-tier model (V400 / V500-V600 / V700-V800) and the capacity values 0.50 / 0.75 / 1.00
- One ADR for the routing/dashboard integration (route name, dashboard card placement)

### Implementation plan (for the fresh session)

**File layout** (mirrors the existing bandwidth calculator under `src/app/(app)/calculator/`):

```
src/app/(app)/analytics-sizing/
  page.tsx                  # server component, ↶ Back to dashboard link + <SizingForm />
  sizing-form.tsx           # "use client" — form state, live recalc
  sizing.css                # scoped to #arxys-videox-root, imports CSS vars from globals
  icons.tsx                 # any new SVGs (or import from ../calculator/icons.tsx if reusable)
src/lib/analytics-sizing/
  tables.ts                 # buffer bands + capacity table, verbatim from JOURNAL spec
  compute.ts                # pure functions, fully unit-testable
  compute.test.ts           # vitest if present, else node:test
```

Dashboard card added in `src/app/(app)/dashboard/page.tsx` — third card alongside the existing Calculator + Submission History cards.

**`tables.ts` shape:**

```ts
export const AS_MAX = 200;
export const FR_MAX = 50;

export const FR_BUFFER_BANDS: readonly { max: number; mult: number }[] = [
  { max: 16, mult: 1.05 },
  { max: 33, mult: 1.10 },
  { max: 50, mult: 1.15 },
];

export const ALPR_FPS_TIERS = [
  { fps: 5,  laneMax: 40, bands: [{ max: 13, mult: 1.05 }, { max: 26, mult: 1.10 }, { max: 40, mult: 1.15 }] },
  { fps: 10, laneMax: 20, bands: [{ max: 6,  mult: 1.05 }, { max: 13, mult: 1.10 }, { max: 20, mult: 1.15 }] },
  { fps: 20, laneMax: 10, bands: [{ max: 3,  mult: 1.05 }, { max: 6,  mult: 1.10 }, { max: 10, mult: 1.15 }] },
  { fps: 30, laneMax: 6,  bands: [{ max: 2,  mult: 1.05 }, { max: 4,  mult: 1.10 }, { max: 6,  mult: 1.15 }] },
] as const;

export const COMPUTE_TIERS = [
  { id: "small",  models: ["V400"],         capacity: 0.50 },
  { id: "medium", models: ["V500", "V600"], capacity: 0.75 },
  { id: "large",  models: ["V700", "V800"], capacity: 1.00 },
] as const;

export const HEADROOM_FACTOR = 0.80;  // budget must be ≤ 0.80 × capacity

export const AVIGILON_TIERS = [
  { id: "standard",     label: "NVR6 Standard",     max: 0.50 },
  { id: "premium",      label: "NVR6 Premium",      max: 0.75 },
  { id: "premiumPlus",  label: "NVR6 Premium Plus", max: 1.00 },
] as const;
```

**`compute.ts` shape** — pure functions, no React:

```ts
export function bufferFor(count: number, bands: readonly { max: number; mult: number }[]): number;
// returns the multiplier whose band the count falls in (count <= band.max)

export function bufferedFr(count: number): number;            // count * bufferFor(count, FR_BUFFER_BANDS)
export function bufferedAlpr(lanes: number, fps: 5|10|20|30): number;

export interface SizingInputs {
  asStreams: number;          // 0..200
  frStreams: number;          // 0..50
  alprLanes: number;          // 0..tier.laneMax
  alprFps: 5 | 10 | 20 | 30;
}

export interface SizingResult {
  budget: number;                       // raw fraction, can exceed 1.0
  avigilonTier: "standard" | "premium" | "premiumPlus" | "overflow";
  recommendation:
    | { kind: "model"; tier: "small" | "medium" | "large"; models: readonly string[] }
    | { kind: "multiServer" };
  totalStreams: number;                 // as + fr + alpr (display only)
  contributions: {                      // for the budget bar tooltip
    as: number;
    fr: number;
    alpr: number;
  };
}

export function computeSizing(inputs: SizingInputs): SizingResult;
```

`computeSizing` is the single entry point the form calls on every change. Selection rule: walk `COMPUTE_TIERS` in order; first tier where `budget <= HEADROOM_FACTOR * capacity` wins. None pass → `{ kind: "multiServer" }`.

**`sizing-form.tsx` shape:**

- `useState<SizingInputs>` with sensible defaults (e.g. `{ as: 0, fr: 0, alpr: 0, alprFps: 10 }`).
- `useMemo` → `computeSizing(inputs)`.
- Four input rows, each: label + tooltip + `<input type="number">` + `<input type="range">` synchronized via `onChange`. ALPR row also has a `<select>` for FPS tier; on FPS change, clamp `alprLanes` to the new tier's `laneMax`.
- Output panel: budget bar (width: `min(100, budget*100)%`, color: green ≤0.66, amber ≤1.0, red >1.0), Avigilon tier label, VideoX recommendation (single model or pair, multi-server warning), total stream count as a small subdued line.
- Reset button → restores defaults.

**Styling:** wrap the form root in `<div id="arxys-videox-root" className="ax-root">`. Copy the relevant ax-* class structure from `src/app/(app)/calculator/calculator.css` for visual consistency (summary cards, body card, results panel) and add new id-prefixed selectors in `sizing.css` only where the new UI diverges (the budget bar, the FPS-tier selector, the model-pair badge). Share `--ac`, `--bg`, `--tp`, `--ts` etc. via the global stylesheet so theme drift can't happen.

**Tests:**
- `bufferFor` boundary cases: 0, 16, 17, 33, 34, 50 for FR.
- `computeSizing` golden cases: pick 6–8 hand-calculated input combos covering each compute tier and the multi-server case. Numbers in the test should match the JOURNAL spec's worked examples.

**ADRs to write at the start of implementation:**

1. `NNNN-analytics-sizing-buffer-rule.md` — why AS uses raw streams while FR/ALPR get tiered buffers; alternatives considered (flat ×1.10, no buffer).
2. `NNNN-analytics-sizing-headroom-and-tiers.md` — the 20% headroom rule, three-compute-tier model, V500=V600 and V700=V800 storage-only differentiation, capacity values 0.50/0.75/1.00.
3. `NNNN-analytics-sizing-route-and-integration.md` — route at `/analytics-sizing` (product-name-neutral), dashboard third-card placement, scoped CSS pattern (`#arxys-videox-root`).

**Definition of done:**

- `/analytics-sizing` renders behind auth, shows the form, recalculates live with no submit button.
- Compute tests pass.
- Dashboard has a third card linking to the new route.
- JOURNAL appended with an implementation entry; RUNBOOK unchanged (no setup-recipe change); three ADRs landed.
- No `TODO` / placeholder values anywhere; no `any` types in compute.

### Decisions captured

- None yet — ADRs land with the implementation.

---

## 2026-05-18 — Ops: stray `vercel deploy` clobbered prod, recovery + prevention

### Work done

- Another Claude session ran `vercel deploy` from a different folder while my Vercel CLI auth was active. The Vercel org `arxys` only had one project at the time (`portal`), so the CLI's "link to existing project?" prompt offered `portal` and the deploy went to the Portal's production alias. Live URL temporarily served the wrong app ("Arxys Forecast").
- Recovery: pushed an empty commit `9ffd053` to force Vercel's GitHub webhook to rebuild from `main` (`5762733`). The new build went to production automatically as `dpl_942kfHsRHdFAHH6kgnHTz4AqrGKJ`. Verified via `vercel inspect` (target=production, status=Ready) and `vercel curl` (live URL renders the Portal `/login` page).
- Prevention layer A: created an empty `forecast` Vercel project (`vercel projects add forecast`). Now there are two projects in the `arxys` org, so future `vercel deploy` from the Forecast folder has an obvious correct destination — no path of least resistance back to `portal`.
- Prevention layer B: ran `vercel link --yes --project=portal` here so `.vercel/project.json` pins this folder to `prj_tu3RWtzjhh7ao4mAELuJVaFWgkJV`. Future `vercel inspect`/`vercel curl` from this directory don't prompt and can't accidentally target the wrong project. `.vercel/` is already in `.gitignore` (line 37, from create-next-app).

### Detours & fixes

- **No `.vercel/project.json` existed anywhere on disk.** I expected to find one in the Forecast folder and `vercel unlink` it. Wider `find` came up empty. The rogue deploy must have been one-shot (CLI prompted for project, deployer chose `portal`, no link persisted to disk). So the prevention had to operate at the *project existence* level (make `forecast` exist as an alternative) plus *this folder's link* (so our own commands stay safe).
- **Vercel CLI uses ambient auth.** Whoever is logged in to `vercel` on this Mac can deploy to any project in the `arxys` org. Folder-level unlinking is only a hint, not a guard. The real defense is making the right project obvious at the prompt, plus running deploys from explicitly-linked folders.

### Decisions captured

- None new. Documented inline; the choice of "create a placeholder project to give CLI prompts an unambiguous destination" is straightforward enough that an ADR would be over-formal.

---

## 2026-05-18 — Step 4 follow-up: full reference-CSS port

### Work done

- Copied the calculator stylesheet from `reference/Arxys-React-calculator.clean.html` verbatim into `src/app/(app)/calculator/calculator.css`. All ~190 selectors prefixed with `#arxys-calc-root` so the stylesheet cannot leak into auth pages or the dashboard. CSS custom properties (`--ac`, `--bg`, `--ts`, etc.) preserved exactly.
- Created `src/app/(app)/calculator/icons.tsx` with the inline SVG icons from the reference (CameraIcon, PlusIcon, TrashIcon, DuplicateIcon, BarsIcon, StorageIcon, InfoIcon, ResetIcon).
- Rewrote `calculator-form.tsx` to mirror the reference JSX structure: summary cards (`.ax-sum`), global settings row (`.ax-gl`), camera cards with header/body/results (`.ax-cam` / `.ax-ch` / `.ax-cb` / `.ax-cr`), dashed Add Camera Group button (`.ax-add`), per-group results table (`.ax-tw`), bandwidth + storage bar charts (`.ax-cht`), and footer note (`.ax-fn`). Reset button included. Hrs/Day input converts between hours and the `recordingPercent` state. Motion is a `<input type="range">` slider. Tooltips on Codec / Hrs/Day / Motion match the reference. The page now looks essentially identical to the public arxys.com calculator.
- Updated `calculator/page.tsx` to import the CSS and drop my page-level header — the form provides its own visual hierarchy via the summary cards.
- Deliberately omitted from the reference: the tabs (everything renders on one page now that we're inside a logged-in portal, not a public landing page), the "Get Your Full Report" CTA box and email-collection (auth replaces it), the failover checkbox (not in our schema yet).

### Detours & fixes

- **Inputs were invisible** before the restyle landed — text inherited a near-white color from Tailwind v4 defaults on `bg-white`. Fixed immediately with `text-neutral-900` in commit 3dfa3e8. The full restyle replaced that scaffolding with explicit `color: var(--tp)` rules from the reference CSS, so the workaround is no longer needed but doesn't hurt either.
- **Initial Step 4 used minimal Tailwind** because I'd applied the auth-pages styling choice ("minimal Tailwind, functional" from Step 3) to the calculator without re-asking. The calculator is the partner's main tool and has a battle-tested design on the public arxys.com site. Should have asked separately. Lesson for the discipline: when styling matters to recognizability or familiarity, ask scope per page, not once globally.

---

## 2026-05-18 — Step 4: Calculator UI

### Work done

- Extracted the lookup tables from `reference/Arxys-React-calculator.clean.html` into `src/lib/calculator/tables.ts`:
  - 26 resolutions (QVGA through 29MP), exact widths/heights preserved
  - 3 codecs (H.265, H.264, H.264-Smart) with per-codec bitrate factors
  - 3 complexity tiers (Low office / Med retail / High outdoor)
  - 6 VMS options
  - `STORAGE_OVERHEAD = 1.20` as a named constant
- Ported the four computation functions into `src/lib/calculator/compute.ts` as named, typed, pure functions: `estimateFrameKb`, `applyMotionAdjustment`, `computeBandwidthMbps`, `computeRawStorageGb`. Plus a `computeGroup` aggregator and three display formatters (`formatNumber`, `formatStorageGb`, `formatBandwidthMbps`).
- Built the calculator page at `/calculator`:
  - `page.tsx` is a Server Component shell.
  - `calculator-form.tsx` is the Client Component holding all the state. Supports add / duplicate / remove on camera groups (legacy parity).
  - Totals roll up live across groups as the user edits.
  - Project-level fields: project name, retention days (1–3650), VMS dropdown.
  - Per-group fields: cameras, fps, resolution, codec, scene complexity, recording %, motion %.
  - Each group shows per-camera bitrate, group bandwidth, group storage (post-overhead), and raw group storage (for transparency).
- Updated `/dashboard` to be a two-card grid: a live "Calculator" card linking to `/calculator`, and a stub "Submission history" card flagged "Coming in Step 5."

### Detours & fixes

- **The legacy calculator's per-group breakdown doesn't fit the current `submissions` schema.** The Step 2 migration designed `submissions` as a single-row aggregate (single `resolution_code`, single `codec`, etc.). Groups need to be persisted as child rows or as JSON. Decided to defer the schema change to Step 5 (when save lands anyway) and recorded the eventual choice in [`decisions/0011`](./decisions/0011-camera-groups-schema-tbd.md): a `submission_groups` child table. Step 4 has no save, so this isn't blocking.
- **Motion adjustment applied to all three codecs**, not just `smart`. The legacy code does `["h264","h265","smart"].includes(cod)` to gate the adjustment, but every codec in `COD` matches that condition, so the gate is a no-op. Faithful port keeps the multiplier on all codecs. If we ever discover a codec that genuinely shouldn't motion-scale, we'll move the multiplier into a per-codec table.

### Decisions captured

- [`0011-camera-groups-schema-tbd.md`](./decisions/0011-camera-groups-schema-tbd.md) — defer to Step 5, but committing to `submission_groups` child table

---

## 2026-05-15 — Step 3: Authentication (invite-only)

### Work done

- Wrote three Supabase client helpers under `src/lib/supabase/`:
  - `browser.ts` — `createBrowserClient()` from `@supabase/ssr` for client components.
  - `server.ts` — `createServerClient()` wired to the Next 16 async `cookies()` store. Used by Server Components, Server Actions, Route Handlers.
  - `admin.ts` — `@supabase/supabase-js` `createClient()` with the service-role key. Imports `server-only` at the top so it cannot accidentally land in a browser bundle.
- Wrote `src/lib/supabase/proxy.ts` exporting `updateSession(request)` — refreshes the Supabase auth cookie on every request, redirects unauthenticated traffic to `/login`, redirects authenticated traffic away from `/` and `/login` to `/dashboard`. Public paths are explicitly enumerated.
- Wrote `src/proxy.ts` as a one-line delegator that calls `updateSession`. Uses Next 16's `proxy` convention (see [`decisions/0009`](./decisions/0009-proxy-replaces-middleware-next16.md)).
- Built the auth UI under `src/app/(auth)/`:
  - `layout.tsx` — minimal Tailwind card layout.
  - `login/{page,login-form,actions}.tsx` — sign-in with email + password via a Server Action using `useActionState`. On success: redirect to `/dashboard` (or `?next=...` if present).
  - `forgot-password/{page,forgot-form,actions}.tsx` — sends a reset email via `supabase.auth.resetPasswordForEmail()`. Returns `"sent"` regardless of whether the email exists, to avoid email enumeration.
  - `reset-password/{page,reset-form,actions}.tsx` — sets a new password via `supabase.auth.updateUser()`. Requires an active session (the user gets one from clicking the email link, which routes through `/auth/confirm` first).
- `src/app/auth/confirm/route.ts` — handles the link clicked from any Supabase email (invite, recovery, signup, email change). Calls `verifyOtp({ type, token_hash })`, then redirects to `?next=<path>`.
- `src/app/(app)/layout.tsx` — protected shell. Calls `supabase.auth.getUser()`, redirects to `/login` if no user, otherwise reads the `partners` row and renders a header with company + contact + role and a sign-out button.
- `src/app/(app)/dashboard/page.tsx` — placeholder dashboard. Step 4 will replace the placeholder with the calculator entry point.
- `src/app/(app)/_actions/logout.ts` — Server Action that calls `signOut()` and redirects to `/login`.
- Replaced the create-next-app default `src/app/page.tsx` with a redirect that sends authenticated users to `/dashboard` and unauthenticated to `/login`. The proxy already covers most of this; the page redirect is the fallback for direct hits.
- Wrote `scripts/bootstrap-admin.ts` — one-shot CLI that creates the first admin via the service-role admin API. Idempotent: re-running for the same email upserts the partner row to role=admin. Generates a 24-byte URL-safe random password by default, prints it once.
- Ran the bootstrap for `andy.newbom@arxys.com` (Arxys / Andy Newbom). Captured the generated password.
- Configured the Supabase auth URLs in the dashboard (Site URL + redirect URL allow-list) so email-link redirects land on the right host.

### Detours & fixes

- **Vercel build failed: "Missing required environment variable: PIPEDRIVE_API_TOKEN"** during `Collecting page data for /dashboard`. Root cause: `src/lib/env.ts` validated *all* env vars eagerly at module load, so any import chain that touched it (including Next's page-data collection on the dashboard) triggered the check — even though `/dashboard` doesn't use Pipedrive vars. Vercel only had the 3 Supabase keys at this point because that's all I'd asked for. Fix: refactor `env.ts` to use `Object.defineProperty` getters so each variable is checked the first time *something actually reads it*. The dashboard never reads Pipedrive vars, so unrelated subsystems can be provisioned on Vercel just-in-time as Steps 7/8 ship. Existing call sites (`env.NEXT_PUBLIC_SUPABASE_URL`) are unchanged.
- **`middleware.ts` is now `proxy.ts` in Next 16.** Caught from `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` before writing any code (per AGENTS.md). Exported function is `proxy`, not `middleware`. Internet examples and Supabase docs still say "middleware" — translate when copying.
- **`cookies()` is async**, returns a promise. Same shape as Next 15, but worth confirming via `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md` before writing the server client wrapper.
- **Sign-up route intentionally omitted.** Decision recorded in [`decisions/0010`](./decisions/0010-invite-only-signup.md). The first admin comes from the bootstrap script; subsequent partners get invited from the admin panel (Step 9, not yet built).
- **Don't run logic between `createServerClient` and `auth.getUser()` in the proxy.** Per `@supabase/ssr` docs — mistakes here cause randomly-logged-out users. The code keeps these calls adjacent.
- **Forgot-password action always returns `"sent"`**, even when the email doesn't exist, to defeat email enumeration. The actual error (if any) is logged server-side for debugging.

### Decisions captured

- [`0009-proxy-replaces-middleware-next16.md`](./decisions/0009-proxy-replaces-middleware-next16.md)
- [`0010-invite-only-signup.md`](./decisions/0010-invite-only-signup.md)

---

## 2026-05-15 — Step 2: Supabase schema + RLS

### Work done

- Created the Supabase cloud project: `arxys-portal`, us-east-1, Free tier. Saved DB password in 1Password.
- Installed Supabase CLI 2.98.2 via Homebrew: `brew install supabase/tap/supabase`.
- Authenticated the CLI with a Personal Access Token from `https://supabase.com/dashboard/account/tokens`.
- Ran `supabase init` (creates `supabase/config.toml` + `supabase/migrations/` + a `.gitignore` for `.temp`/`.branches`).
- Ran `supabase link --project-ref ddqnpwpouvkgivvbjpju` (DB password passed via `SUPABASE_DB_PASSWORD` env so the prompt doesn't hang).
- Wrote `supabase/migrations/20260515193702_initial_schema.sql` covering:
  - 4 tables: `partners` (FK to `auth.users`), `products`, `server_specs`, `submissions`
  - `set_updated_at()` trigger applied to `partners`, `products`, `server_specs`
  - `is_admin(uid)` SECURITY DEFINER helper (used by policies)
  - RLS enabled on all 4 tables; `anon` and `authenticated` grants revoked then re-granted at the column level needed (`SELECT/UPDATE` on `partners`, `SELECT` on `products`/`server_specs`, `SELECT/INSERT` on `submissions`)
  - 5 policies: self-or-admin reads + updates on `partners`; active-or-admin reads on `products` and `server_specs`; own-or-admin reads + self-only inserts on `submissions`
- Applied via `supabase db push` — clean apply, only a `NOTICE` about `pgcrypto` already existing.
- Wrote `scripts/test-rls.ts` — a regression suite that provisions two ephemeral users via `auth.admin.createUser({ email_confirm: true })`, inserts their `partners` rows via service-role, runs cross-partner SELECT/INSERT, then tears them down. Installed `tsx` as a dev dependency to run it.
- Ran the suite: **10/10 passes** (5 anon-blocked tests via curl + 5 authenticated isolation tests via the script). Anon gets HTTP 401 `permission denied` (Postgres error 42501) on every table; cross-partner INSERTs are blocked by the `partner_id = auth.uid()` check.
- Configured cloud auth via the Management API. Confirmed `jwt_exp = 3600` and `refresh_token_rotation_enabled = true` were already correct. Attempted to set `sessions_timebox = 2592000` — Free tier rejected with HTTP 402 (Pro-only feature).
- Added the three Supabase env vars (URL, anon publishable key, service-role secret key) to both `.env.local` and the Vercel dashboard for Production/Preview/Development.

### Detours & fixes

- **Supabase CLI browser login failed** with "Could not create the CLI sign-in session — Unknown error." Bypassed cleanly with `supabase login --token <PAT>` from the dashboard's Account → Access Tokens page. No browser callback, no flaky session.
- **Sourcing `.env.local` in bash broke** on `SMTP_PASS=zddk flxo pysk svub` (Gmail app password format has internal spaces). Switched the test-runner invocation from `set -a && source .env.local` to Node 20's native `--env-file=.env.local` flag, which parses dotenv format correctly.
- **`sessions_timebox` is Pro-only**. The Phase 1 plan called for a 30-day refresh timebox, but Free tier returns 402 on PATCH. Accepted the gap; documented it inline in `supabase/config.toml` so future-us sees it when looking at session settings. The other two session-related requirements (3600s access TTL + refresh-token rotation) are unaffected and active.
- **`supabase db dump` requires Docker** (it spins up a pg_dump container locally) and we don't run Docker on this machine. Verified the migration applied by hitting the cloud project's PostgREST `/rest/v1/` introspection endpoint directly with curl — saw all four tables exposed plus `/rpc/is_admin`.

### Decisions captured

- [`0003-multi-unit-packing-over-single-unit-filter.md`](./decisions/0003-multi-unit-packing-over-single-unit-filter.md) — recommendation algorithm choice (preview for Step 5)
- [`0004-supabase-cli-migrations.md`](./decisions/0004-supabase-cli-migrations.md) — CLI over SQL Editor
- [`0005-supabase-ssr-over-auth-helpers.md`](./decisions/0005-supabase-ssr-over-auth-helpers.md) — modern client
- [`0006-bandwidth-gate-in-recommendation.md`](./decisions/0006-bandwidth-gate-in-recommendation.md) — bandwidth filter
- [`0008-defer-sessions-timebox-to-pro.md`](./decisions/0008-defer-sessions-timebox-to-pro.md) — Free-tier scope cut

---

## 2026-05-14 — Step 1: scaffold, env, GitHub, Vercel

### Work done

- Moved the PHP backend and React calculator HTML out of the project root into a `reference/` subdirectory so they wouldn't be picked up by `next build`.
- Scaffolded a fresh Next.js app via `npx create-next-app` (Next 16.2.6, React 19.2.4, TypeScript, ESLint, Tailwind v4, App Router, Turbopack).
- Installed runtime deps: `@supabase/ssr`, `@supabase/supabase-js`, `nodemailer`, `@react-pdf/renderer`, `zod`. Dev deps: `@types/nodemailer`. (Default `eslint`, `eslint-config-next`, `typescript`, `tailwindcss`, `@tailwindcss/postcss` came from create-next-app.)
- Hardened `eslint.config.mjs`: `@typescript-eslint/no-explicit-any: error` and `@typescript-eslint/no-unused-vars: error` (with `_`-prefix escape).
- Created `.env.local` with the known values (Pipedrive token, SMTP credentials, Gmail app password, internal notification address). Supabase placeholders left blank for Step 2.
- Wrote `src/lib/env.ts` — a startup validator that loops over a `REQUIRED_VARS` array at runtime and throws if any are missing or empty. Imported once at server-side boot so misconfigured environments fail fast.
- Verified `.env.local` and `.DS_Store` are gitignored.
- Committed Step 1 locally.
- Set up SSH multi-account GitHub auth: generated `~/.ssh/id_ed25519_arxys` (no passphrase, dedicated to the Arxys-Projects org), added a `Host github.com-arxys` block to `~/.ssh/config` with `IdentitiesOnly yes` so it doesn't collide with the existing TorqueCoffee HTTPS+Keychain workflow.
- Pushed `main` to `git@github.com-arxys:Arxys-Projects/Portal.git`.
- Wired Vercel to the GitHub repo; first deployment succeeded.

### Detours & fixes

- **The React calculator HTML file was actually an RTF document with a `.html` extension** (TextEdit had saved it that way). De-RTF'd cleanly with `textutil -convert txt -format rtf -inputencoding UTF-8 -encoding UTF-8`. Preserved the original as `.rtf` and produced `.clean.html`. Verified zero RTF residue, zero backslash-EOL escapes, and all 26 Unicode chars (e.g. `×`, `•`) preserved.
- **`npx create-next-app .` refused** because the parent directory name (`Arxys Portal`) violates npm package naming (capital letter, space). Worked around by scaffolding into `arxys-portal/` then `shopt -s dotglob && mv arxys-portal/* ./ && rmdir arxys-portal` to relocate the files in place. `package.json` "name" is `arxys-portal` while the folder remains `Arxys Portal`.
- **ESLint failed on `env.ts`** because the initial draft used `REQUIRED_VARS` only as a type source. Refactored `loadEnv()` to iterate the array at runtime, which satisfies `no-unused-vars` and keeps the type narrowing.
- **`git commit` heredoc broke under bash** with quoting errors. Switched to writing the commit message into a temp file and using `git commit -F`.
- **First push got HTTP 403**. The macOS Keychain (`osxkeychain` credential helper) had cached the user's TorqueCoffee credentials globally, and TorqueCoffee has no write access to `Arxys-Projects/Portal`. Solution: SSH key on a dedicated host alias (`github.com-arxys`), set the repo's remote to `git@github.com-arxys:...`, and the original HTTPS-cached identity stays untouched for other repos.
- **First Vercel URL (`portal-flame-eta.vercel.app`) returned 404 NOT_FOUND**. This was a default project URL that no longer matched our deployment. The correct alias was `portal-arxys.vercel.app`.
- **Second URL returned 401 with `_vercel_sso_nonce`**. This was Vercel Deployment Protection (SSO gate) — expected, not a bug.
- **After SSO auth, the page showed "404: NOT_FOUND"** with an empty `x-matched-path`. The root cause was the Vercel project's **Framework Preset** being unset, so Vercel had no routing config for the Next.js App Router output. The `next build` succeeded and produced `.next/` artifacts, but Vercel didn't know how to serve them. Fix: Dashboard → Settings → General → Framework Preset → **Next.js** → Save → Redeploy. After that, the default landing page rendered.
- **Local `npm run build` failed** with `Cannot find module 'next/types.js'` during the TS validator check. Direct `tsc --noEmit --project tsconfig.json` was clean (exit 0). Inspected `node_modules/next/dist/lib/typescript/runTypeCheck.js` and the generated `.next/types/validator.ts` — the validator hard-codes `import type { ResolvingMetadata, ResolvingViewport } from "next/types.js"`, which should resolve fine via bundler resolution. Rather than dig deeper into Next internals, removed `.next` + `node_modules` and ran `npm ci` (430 packages, 40s). Re-ran `npm run build`: clean, 72s compile + 48s TypeScript. Confirmed the bug was stale state in `node_modules`, not a real issue with the code.
- **"Next.js v24" in Vercel's Framework Preset dropdown** is the preset *config* version, not the Next.js version. The actual Next.js stable is 16.2.6 (what we use).

### Decisions captured

- [`0002-gmail-smtp-over-siteground.md`](./decisions/0002-gmail-smtp-over-siteground.md)
- [`0007-ssh-multi-account-github.md`](./decisions/0007-ssh-multi-account-github.md)

---

## 2026-05-14 — Project kickoff

### Work done

- Received the Phase 1 execution plan covering 11 steps (scaffold → schema → auth → calculator integration → API route → PDF → email → Pipedrive → admin → pricing → pre-launch checklist).
- Located the two reference files (`arxys-calculator-mailer-FINAL.php`, the React calculator HTML) in the existing `Arxys Portal` folder.
- Settled the eleven open questions in the plan: de-RTF the HTML, port the PHP multi-unit packing algorithm (not the React file's single-unit filter), bandwidth comes from a Google Sheet and gates the recommendation, Gmail SMTP only (never SiteGround), SMTP-as-alias on Andy's account for `noreply@arxys.com`, reference files move to `reference/`, GitHub repo URL `https://github.com/Arxys-Projects/Portal.git`, Vercel project already exists, Supabase not yet provisioned, SSH multi-account (Option C) for GitHub auth.

### Decisions captured

- [`0001-three-doc-structure.md`](./decisions/0001-three-doc-structure.md) — meta-decision for the docs system (this very file)
