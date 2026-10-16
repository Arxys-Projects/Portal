# Claude Code brief: Project Portal backend foundation (MVP 1.0)

**Recommended model:** Opus 5.5 (current Opus tier; re-check the lineup before starting) · **Effort:** xhigh
**Why Opus:** schema, RLS, the Pipedrive CRM write path, and cross-module judgment.

Written 2026-10-16 from a planning session with Andy. This file is the source of truth for the build. Update it at each gate with anything discovered or decided, so the next session starts from the corrected brief.

**Status:** Step 0 done 2026-10-16. Its results and Andy's decisions are folded in below; see "Step 0 results" and the JOURNAL entry "Project Portal backend, Step 0". Two prerequisites it surfaced are fixed and live: the partner self-escalation hole (ADR 0151) and the price push deleting Pipedrive products (ADR 0150). Step 1 done 2026-10-16: migrations 20261016000002 to 000005 applied by Andy, live RLS suite all pass (section 24 included); ADRs 0153 to 0155, apply note `docs/apply-notes/0153-project-portal-schema.md`. Addendum 20261016000006 (company include list, ADR 0156) applied and verified the same day (24i passes). Step 2 code written and dry-run against production 2026-10-16 (ADR 0157; see "Step 2 results"). **At the Step 2 gate**: Andy reviews the mapping file, then runs `--execute` and `--apply-mapping`.

## How to run this brief
- Run one step per session unless a step is small enough to pair with the next.
- Start each session by reading this file in full, then `AGENTS.md` and the files under "Read first".
- Stop at every gate listed at the end. Report what changed, tests run, and what is unverified.

## Read first
- `AGENTS.md`, `docs/README.md` (JOURNAL / RUNBOOK / ADR discipline)
- ADRs: 0020, 0027, 0045, 0054, 0055, 0059, 0061, 0064, 0068, 0076, 0078/0079, 0083, 0086, 0093, 0094, 0096/0097, 0098, 0099, 0112, 0113, 0118, 0132, 0137/0138, 0143, and from Step 0: 0150 (Pipedrive products), 0151 (partners self-update guard), 0152 (how a contact's login sees project quotes)
- JOURNAL: the three 2026-10-16 entries (Step 0, ADR 0150, ADR 0151), 2026-10-15 "Prepared for" fix, 2026-10-12 Escambia, 2026-09-01 JCT, 2026-08-26 Travis AFB (both entries)
- Code: `src/app/(app)/calculator/actions.ts`, `src/lib/recommend/{algorithm,candidates}.ts`, `src/lib/calculator/{compute,rehydrate}.ts`, `src/lib/pipedrive/*`, `scripts/push-prices.ts`, `src/lib/project-quote/*`, `src/lib/projects/*`, `src/lib/pipeline/forecast.ts`

## Standing rules (non-negotiable)
- No `git push`. Commit locally at the end of each step; Andy reviews and pushes.
- No `supabase db push`. Write migrations plus rollback files; Andy applies them by hand in the SQL editor.
- No price math in the portal UI. Prices shown or sent come from Pipedrive, passed through verbatim.
- RLS changes are stop-and-flag. Every new table gets explicit policies; the `ensure_rls` trigger makes new tables deny-all by default.
- No live Pipedrive writes without Andy's explicit go-ahead for that specific write.
- The partner self-serve path (full calculator, Quick Calc, Register a Deal) must behave bit-identically. Golden and recommender tests stay green.
- JOURNAL entry per step. ADR for every non-obvious choice, numbered from the next free number (0158+; 0150 to 0157 were taken on 2026-10-16). Check the number is free right before writing; 0146 collided before, and parallel sessions share this checkout.
- New Pipedrive calls use the v2 API. The v1 org, person, deal and product endpoints have been out of support since 2026-08-01. The existing partner path stays on v1 for now (bit-identical rule); moving it is separate work.
- Never send `active_flag: false` to a Pipedrive product: it deletes the product. "Off the deal picker" is `is_linkable: false` (ADR 0150).

## Context
Partners rarely run their own calcs. They email Arxys, Arxys gathers specs, and an Arxys rep sizes and quotes. The portal is adding an internal **Project** layer. A project is prepared for a **company** (Pipedrive org) and a **contact** (Pipedrive person, with or without a portal login). Calculations hang off projects. Each calc carries **system design** inputs: failover, management server, GPU, SFP+, workstations. For Arxys-started projects, the portal creates the Pipedrive deal **with product lines** after the rep previews and confirms them. This brief is backend only; screens follow a separate Claude Design pass.

## Locked decisions

| Topic | Decision |
| --- | --- |
| Companies | Pipedrive orgs carrying the label **"Arxys Security Partner"**. Each branch office is its own org. Keyed by Pipedrive org id. Step 0: the label is option id 73 on the org `label_ids` field (stored as "ARXYS SECURITY PARTNER"; match the option label case-insensitively, then filter on the id). |
| Contacts | Pipedrive persons under those orgs, keyed by person id. A portal login is optional. |
| Logins | Gated as today. A partner login is linked to a contact; it never defines one. |
| Visibility | No company-wide visibility. A contact with a linked login sees their quotes through the existing per-person path, which is `submissions.on_behalf_of_partner_id`: on a project calc it is set to the primary contact's linked login when there is exactly one (ADR 0152, decided 2026-10-16). No RLS change. Contacts with no login, or more than one, get email. |
| Partner path | Unchanged. Partners get no project path. |
| Legacy rows | Not migrated. A later "Make project" action links an existing submission to a project. |
| On-behalf | Project calcs are prepared for company + contact. They never write `on_behalf_of_company_name`, and write `on_behalf_of_partner_id` only as the visibility grant above (ADR 0152). Legacy rows keep both columns as they are. |
| Deals | One Pipedrive deal per quote. Options and phases are not in MVP, but the schema must allow several calcs and deals per project. |
| Deal lines | Arxys-started projects only: SKU and quantity from the BOM, price read from the Pipedrive product and sent back as `item_price` (the API requires it). Revisions never rewrite deal lines; they show a diff. Step 0: a line is refused when its product is missing, shares its code with another product, is off the picker (`is_linkable=false`), or is $0 / [MKT] / [CFQ]. |
| Pricing gate | The rep confirms pricing (discounts set) before a quote can be generated. |
| SFP+ | Yes/no. Per recorder and per failover: 1 × `VX5-NIC-SFP28` + 1 × `VX5-NIC-SFP28x10` (10Gb pair, always). Excludes 1U models from primary and failover selection. |
| GPU | Yes/no. 1 × `VX5-GPU-A1000` per recorder and per failover. No model exclusion (the V200 takes a GPU). Partner-facing note: Avigilon and Hanwha WAVE / Nx Witness recorders only; workstations already include GPUs. |
| Failover | Inputs: failover days (default half of the calc's longest retention, rounded up) and primaries per failover (ratio). Count = ceil(primary units ÷ ratio). Each failover needs `max_cameras` ≥ the primary SKU's `max_cameras` and usable storage ≥ (total recorded load ÷ primary units) × failover days. Pick the cheapest qualifying SKU; warn if none qualifies. |
| Management / Directory | "Dedicated?" yes/no, "Failover pair?" yes/no (1 or 2 units), SKU from a dropdown of active management-server SKUs. |
| Workstations | Count plus SKU dropdown (active SW SKUs only: SW10 and SW20 today). |
| Rules | Every default and BOM mapping is admin-editable, carries a plain-language description, and is snapshotted onto each calc at save. |
| Company list cleanup | Andy merges Alscan, Insight and Security Control Integrators in Pipedrive (done; Andy confirmed 2026-10-16). Minuteman offices now carry state names (NH, MA). VastGlobe Logistics and the test accounts are ignored. LiquidPC and NCD Communications are companies: Andy labeled LiquidPC LLC (#10528) and NCD Communications (#12243) with option 73 on 2026-10-16, after the first Step 2 dry run found them on other labels or none. The other two LiquidPC orgs (#12281, #12284) stay unlabeled and are proposed as aliases. **Relativity Space must stay unlabeled**: the label drives partner emails, and it is not a partner. It is still wanted as a company, so it comes in through the portal-side include list `company_sync_includes` (Andy, 2026-10-16; ADR 0156). Pipedrive is not changed. **Skipped for now** (Andy, 2026-10-16): no include row yet, so its portal spellings land in the exceptions list. "Minuteman Security - Edison" is also labeled. |

## Step 0: Discovery and plan (read-only). DONE 2026-10-16.
Verify and report with file:line or API evidence:
1. Pipedrive API path to filter orgs by label: how the "Arxys Security Partner" label id resolves (organizationFields `label` / `label_ids`), plus pagination. Check v1 deprecation status and whether new endpoints should use v2.
2. `POST /deals/{id}/products`: confirm `item_price` is required, and whether an archived product (`active_flag=false`) can be attached.
3. `VX5-NIC-SFP28`, `VX5-NIC-SFP28x10`, `VX5-GPU-A1000`, the management-server SKUs and SW10/SW20 are active in `current_products` **and** exist in Pipedrive with matching `code`. List mismatches, $0 MKT/CFQ products, and duplicate codes.
4. `product_specs` values for `rack_units`, `sfp_addon`, `avigilon_gpu` across the recorder pool (V200 to V800). Confirm which SKUs SFP+ excludes.
5. Whether each recorder family has smaller-storage SKUs at the same `max_cameras`. If not, failover will often equal the primary SKU; report it.
6. Every place that resolves a Pipedrive org or person by name (`upsertOrganization`, `upsertPerson`, relink). List each one to switch to id-based resolution for project paths.
7. The partners UPDATE policy: confirm partners can update any column on their own row. If so, the login-to-contact link **must not** be a column on `partners`.

Deliverable: a short findings report, the final step plan, and the ADR list. **STOP.**

### Step 0 results (2026-10-16, read-only API and DB probes; recheck before relying on a number)
1. **Label filter.** The label is option id 73 on `label_ids` (set field 4053; the legacy single `label` enum, field 4035, has the same options). 62 of 8,522 orgs carry it. `GET /api/v2/organizations` has no label parameter (passing `label_id` or `label_ids` returns 400). Saved filter #44 adds a second condition and returns 16 orgs, so it is unusable. The sync pages every org through v2 (cursor, 500 per page, 18 requests) and filters on `label_ids` in code; persons come from `GET /api/v2/persons?org_id=`. The 62 orgs hold 402 persons, 367 with an email; 2 orgs have none. Observed limit: 80 requests per 2 seconds. A 429 carries `x-ratelimit-reset` and no `Retry-After`. v1 org/person/deal/product CRUD, `GET /v1/deals/{id}/products` and the v1 searches are out of support since 2026-08-01 (they still answer).
2. **Deal products.** `POST /api/v2/deals/{id}/products` requires `product_id`, `item_price`, `quantity`. There is no currency field; the price is in the deal's currency. A bulk endpoint takes up to 100 lines. An "archived" product cannot be attached because v1 `active_flag=false` deletes it (404 by id). The real "off the picker" flag is `is_linkable` (835 of 1,051 products are off). Whether Pipedrive accepts a non-linkable product on a deal is undocumented, so the preview refuses those lines.
3. **BOM SKUs.** All seven are active in `current_products`, exist in Pipedrive by exact code, are linkable, and the USD prices match: VX5-NIC-SFP28 #1415 $670 · VX5-NIC-SFP28x10 #1417 $315 · VX5-GPU-A1000 #1416 $1,706 · VX5-V250-MGM #1433 $14,020 · VX5-V255-MGM #1430 $15,734 · VX5-SW10-100 #1459 $6,426 · VX5-SW20-200 #1460 $7,873. The management-server dropdown is V250-MGM and V255-MGM. Workstations are SW10-100 and SW20-200 (SW25/30/35 are inactive). None is $0/MKT/CFQ. Elsewhere: the VX5-V600-320 duplicate code was fixed 2026-10-16 (ADR 0150). VX5-RAM-32GB is portal-inactive but linkable; the next price push retires it. 100 legacy codes are duplicated; none is a portal SKU.
4. **Specs.** In the pool, only V200-64/80/96 are 1U, with `sfp_addon` "No". V400 to V800 are 2U to 4U with `sfp_addon` "Optional" (free text, two spellings). So the SFP+ rule keys on `rack_units = '1U'`, and it excludes exactly the V200s. `avigilon_gpu` is "Optional" on V200 to V800 ("NO" on the V100, outside the pool), consistent with no GPU exclusion. V250/V255 are 1U with no SFP option; SFP+ applies to recorders and failovers only, so they are unaffected.
5. **Smaller-storage SKUs.** Every family has three storage tiers at one `max_cameras`: V200 100 · V400 150 · V500 and V600 275 · V700 and V800 325. So failover will usually be smaller than the primary. Illustration, assuming uniform retention: Escambia's 18 × V800-864 is about 690 TB of required capacity per unit, so failover days at half retention need about 345 TB. That gives 9 × V700-480 (400 TB usable, $75,995) rather than 9 more V800-864s ($117,054). On a recorded-data basis (no buffer) it would be V700-384.
6. **Name-based Pipedrive resolution** (switch to ids for project paths):
   - `upsertOrganization` (`src/lib/pipedrive/contacts.ts:27`) searches by exact name, takes the first hit, and creates an org if none.
   - `upsertPerson` (`contacts.ts:6`) does the same by email.
   - Both run in `createDealFromSubmission` (`deal.ts:274/279`), called from `calculator/actions.ts:713` and `:733` and from the admin relink (`admin/submissions/actions.ts:253`). `createComparisonDeal` (`deal.ts:489/492`) calls both and is called from `comparison/actions.ts:70`.
   - The deal owner is found by the name "Andy Newbom" (`lookups.ts:113`).
   - Pipedrive has orgs named exactly like portal strings next to the labeled ones ("Cornerstone HQ", "Cornerstone WI", "JCT", "Digital Provisions" and "Digital Provisions, Inc.", "LiquidPC" and "LiquidPC, LLC", "Insight", "VastGlobe Logistics"), very likely created by this upsert. 3 labeled orgs share their exact name with another org.
   - Portal-side name keys to avoid on project paths: the `groupIntoDeals` company key (`forecast.ts:84`) and the duplicate guard's `ilike` (`calculator/actions.ts:277`).
7. **Partners UPDATE.** Confirmed live: a partner could update every column of their own row, `role` and `is_internal` included. Fixed by a guard trigger (ADR 0151), applied 2026-10-16; the live RLS suite passes 88/88. So the login-to-contact link lives in `partner_contact_links`, never on `partners`.

Also found:
- **Mapping preview:** 48 distinct non-internal partner company names (20 match a labeled org after normalizing); 16 free-typed on-behalf names (3 match); one non-internal partner row named "Arxys".
- **No `arxys_project_id` deal field exists.** Adding it to `CUSTOM_FIELDS` in `lookups.ts` would make `ensureCustomFields()` create it on the next deal write from any path, partner path included. Create it once, on purpose, in Step 5.
- **Quick Calc saves through `submitCalculation`** (`quick-calc-form.tsx:163`).

## Step 1: Schema (migrations written, not applied). STOP for Andy to apply. DONE 2026-10-16.
All tables are internal-only (policies gated on `is_internal(auth.uid()) OR is_admin(auth.uid())`) unless noted.
- `companies`: `pipedrive_org_id` (unique), `name`, `active`, sync timestamps.
- `company_name_aliases`: maps legacy portal spellings and merged Pipedrive orgs to one company.
- `contacts`: `pipedrive_person_id` (unique), `company_id`, `name`, `email`, `phone`, `active`.
- `partner_contact_links`: `partner_id` (the login, unique: a login links to one contact), `contact_id`, `company_id`. Internal and admin read and write; **no partner SELECT** (Step 0 found no need, and visibility runs through `on_behalf_of_partner_id`, ADR 0152).
- `projects`: `company_id`, `primary_contact_id`, `name` (the 50-character limit applies only when copied into `submissions.project_name`), `end_customer` (text), `site`, `vms`, `install_type` (new / upgrade; upgrade means existing cameras), `default_retention_days`, `bid_due_date`, `notes`, `created_by`, timestamps.
- `project_contacts`: extra contacts per project.
- `project_submissions`: `submission_id` (unique), `project_id`, `calc_role` (default `primary`; reserved for future `option` / `phase`). The link stays off `submissions` so a partner cannot set it.
- `system_design_rules`: `key`, `value`, `description`, `updated_by`, `updated_at`. Seed `failover_days_fraction = 0.5`, `default_primaries_per_failover = 2`, `suggest_dedicated_mgmt_above_servers = 3`.
- `bom_rules`: `design_item`, `applies_to_role` (recorder / failover / mgmt / workstation), `sku`, `qty_per_server`, `description`, `active`. Seed the SFP+ and GPU rows. Server eligibility reads the existing `product_specs.sfp_addon` / `rack_units`; do not duplicate it.
- `deal_line_syncs`: `pipedrive_deal_id`, `submission_id`, `sku`, `role` (recorder / failover / mgmt / workstation), `qty`, `pipedrive_product_id`, `pipedrive_deal_product_id` (the attachment id the POST returns; needed for retry and diff), `item_price_sent`, `status` (pending / added / failed), `error`, `created_by`, timestamps. Unique on (`pipedrive_deal_id`, `sku`, `role`) so a retry can never add a line twice. Drives idempotent retry. (Decided 2026-10-16.)
- `quote_pricing_confirmations`: `pipedrive_deal_id` (or `submission_id`), `confirmed_by`, `confirmed_at`, and `deal_lines_fingerprint` (jsonb: the deal's lines at confirmation, in the normalized shape of `src/lib/projects/line-items.ts`), so a later edit in Pipedrive is detectable. (Decided 2026-10-16.)
- Audit and stamp triggers on both rules tables per the ADR 0096/0097 pattern; no DELETE.
- **As built (2026-10-16, see ADRs 0153 to 0155):** synced tables (`companies`, `contacts`, `company_name_aliases`) are internal SELECT-only, written by the sync as service_role; rules are admin-write with one shared `design_rules_audit`; `system_design_rules.value` is jsonb; `bom_rules.sku` is checked against `products` by trigger; `quote_pricing_confirmations` is insert-only and keys on the deal (`submission_id` optional); `deal_line_syncs` and confirmations have no delete. Addendum (ADR 0156): `company_sync_includes`, migration 20261016000006, applied and verified 2026-10-16; no row yet (Andy adds Relativity Space). Next free ADR: 0157.
- Rollback file per migration in `supabase/rollback/`. RLS tests in `scripts/test-rls.ts`: partner cannot read or write any new table, `partner_contact_links` included; internal can; partner cannot attach a submission to a project. The partners guard (ADR 0151) is live, so a partner can no longer flip `is_internal` to get past these policies; the 23a to 23k cases cover that.

## Step 2: Company and contact sync (dry run by default)
- Company membership: labeled **or** listed in `company_sync_includes` (ADR 0156). A company that is neither any more is marked inactive, never deleted.
- Client methods (v2, see Step 0 results item 1): read the `label_ids` options from `GET /api/v2/organizationFields` and resolve "Arxys Security Partner" to its id (73 today), case-insensitively; page `GET /api/v2/organizations` (cursor, limit 500) and keep orgs whose `label_ids` contain it; list persons with `GET /api/v2/persons?org_id=`. On 429, wait for `x-ratelimit-reset` (there is no `Retry-After`) and retry. Don't rely on saved filter #44.
- `scripts/sync-pipedrive-companies.mts`: dry run by default; `--execute` with a typed CONFIRM; upserts `companies` and `contacts` by Pipedrive id; never writes to Pipedrive.
- **Mapping report** (dry-run output): each distinct `partners.company_name` and `submissions.on_behalf_of_company_name` → proposed company (exact, normalized, alias), plus an exceptions list. Skip test accounts: RLS Test Co A, Gate Test Co plain / suspended, Big Corp, Evil Corp. Flag the one non-internal "Arxys" partner row. LiquidPC and NCD Communications must come through the label filter; if missing, report it. An org also qualifies when its id is in `company_sync_includes` (ADR 0156); that is how Relativity Space comes in. Report which orgs came in by label and which by the list. Do not hard-code org names or ids.
- After Andy approves the mapping, a separate `--execute` step writes `partner_contact_links` and aliases.
- Before the `--execute`: the planned merges are done (Andy confirmed 2026-10-16) and LiquidPC and NCD are labeled; Relativity Space is skipped for now (no include row); the merged-away org ids no longer exist, so the dry run will not see them as alias candidates. The mapping report should also list the unlabeled orgs that exactly match portal strings (Step 0 results item 6) as alias candidates, since existing deals hang off them.

### Step 2 results (2026-10-16 dry run; recheck before relying on a number)
- Built: `src/lib/pipedrive/company-api.ts` (v2 GETs), `src/lib/companies/sync.ts` (pure, unit-tested), `scripts/sync-pipedrive-companies.mts` (dry run; `--execute`; `--apply-mapping=<file>`). ADR 0157.
- After Andy labeled LiquidPC LLC and NCD (rerun 2026-10-16): 64 companies (all by label), 413 contacts. 58 portal names: 22 exact, 9 normalized, 27 exceptions; 20 unlabeled name twins. Proposed file: 8 aliases, 68 links. 90 logins: 68 email matches, 2 company mismatches (Insight → Insight Enterprise #12008, which is also labeled; Security Control Integrators → "Security Control Integrators SCI"), 3 duplicate emails, 17 no contact.
- Insight (Andy, 2026-10-16): only "Insight, Inc." (#9239) is Insight. The portal's "Insight" spellings and the unlabeled #12287 map to it, and gabriel.sagredo@insight.com links to it. "Insight Enterprise" (#12008) still carries the label, so it syncs as its own company; gary.allen@insight.com's person sits under it, so that login is not linked (moving the person to #9239 in Pipedrive would link it on the next run).
- Open for Andy before `--execute`: review the mapping file in `backups/`.
- Leftover live test persona "RLS Hijack Co" (`rls-test-a-1792186404373@arxys-rls-test.invalid`) from an earlier interrupted RLS run: delete it.

## Step 3: Pure engines (no I/O, fully unit-tested)
- `resolveSystemDesign(calcInputs, projectDefaults, rules)` → resolved inputs plus a rules snapshot.
- `recommendFailover(primary, groupsTotals, failoverDays, ratio, candidates, {excludeOneU})`: new function using the same candidate pool and filters as the primary, plus the SFP+ 1U exclusion. Two choices to make and record in the failover ADR (Step 0 results item 5): the sizing basis (required capacity with the utilization buffer and binary charge, like the primary, or recorded data; recommended: the primary's basis), and the daily load on a mixed-retention calc (each group's storage divided by its own retention, summed).
- Primary recommender: add an `excludeOneU` filter applied only when SFP+ is on, keyed on `product_specs.rack_units = '1U'`, with a test that `sfp_addon` agrees on every pool SKU. The default path stays bit-identical (golden tests prove it: `src/lib/calculator/golden.test.ts`, `src/lib/recommend/*.test.ts`).
- `buildBom(primary, failover, mgmt, gpu, sfp, workstations, bomRules)` → lines `{sku, qty, role, ruleId}`. **No prices.**
- Tests: SFP+ on a calc that would have picked V200; GPU on V200; failover count rounding; failover with no qualifying SKU; failover-pair management (2 units); zero workstations; a rule edited after save where the snapshot holds the old value.

## Step 4: Calc save integration (server side)
- `submitCalculation` accepts optional `projectId` and `systemDesign`, honored **only** when the caller is internal and the project exists (verified server side).
- `input_state` version → 4; the normalizer defaults v1 to v3 rows unchanged. Bump `calc_version` only if banked figures change.
- Bank the BOM and rules snapshot in a jsonb on `submissions` (internal-written, read-only display) or a side table; decide and record in an ADR. The project link goes in `project_submissions`.
- For project calcs, the project's company and contact replace the on-behalf picker. Decided (ADR 0152): never write `on_behalf_of_company_name`; set `on_behalf_of_partner_id` to the primary contact's linked login when exactly one exists, verified server-side like today's picker (active, non-internal). That is how My Pipeline, the Project Quote download (ADR 0083) and `groupIntoDeals` find the login, unchanged. With no login or several, leave it null.
- Scope the 14-day duplicate guard to the project for project calcs.
- Keep the old failover / management add-on booleans readable for legacy rows; project calcs use system design instead.
- **Prove** with snapshot tests that a partner save and a Quick Calc save produce byte-identical rows and Pipedrive payloads to today. Quick Calc saves through `submitCalculation` (`quick-calc-form.tsx:163`), so one harness covers both.

## Step 5: Pipedrive deal with products (behind `PROJECT_DEAL_PRODUCTS`, default off)
- `previewDealLines(bom)`: resolves SKU → Pipedrive product id by exact `code` from one full `GET /api/v2/products` read (deleted products are never returned); reads the USD price from the Pipedrive product; refuses missing products, duplicate codes, products with `is_linkable=false`, and $0 / MKT / CFQ lines. **Never** reads prices from `current_products` for this path. `src/lib/pipedrive/product-sync.ts` and `product-api.ts` (ADR 0150) already hold the v2 product read and the duplicate-code grouping.
- `createProjectDeal(projectCalc, confirmedLines)`:
  - deal under `companies.pipedrive_org_id` and `contacts.pipedrive_person_id` (**no name-based upsert**)
  - deal lines via `POST /api/v2/deals/{id}/products` (`product_id`, `item_price`, `quantity` required)
  - existing title pattern, plus a new `arxys_project_id` deal field, created once with Andy's approval. Not added to the `CUSTOM_FIELDS` auto-create list, which would create it from the partner path's next deal write.
  - one `deal_line_syncs` row per line, then add lines one at a time
  - partial failure leaves a clear "lines pending" state and a non-fatal notice
  - `retryMissingLines(dealId)` adds only pending / failed lines and never duplicates
- `diffDealLines(dealId, bom)`: portal BOM vs deal lines by SKU (needs a product id → code map; the deal cache stores no codes). Used on revisions instead of rewriting lines.
- Revisions of portal-built deals keep the ADR 0098 retry without `value`. Replace the "ACTION NEEDED" note text for these deals with a pointer to the diff.
- Tests against a mocked client. **One** live end-to-end test on a deal Andy names, with his explicit approval, then report.

## Step 6: Quote gate and notification
- Project Quote generation for portal-built deals requires a `quote_pricing_confirmations` row. The existing empty-deal guard stays for legacy and partner deals.
- Generation reads "Prepared for" from the project's company and contact when the submission is in a project; it falls back to the 2026-10-15 resolver otherwise.
- "Quote ready" email to the project's primary contact: PDF attached, plus a portal link if they have a login or an access-request link if not. Behind a flag, using the existing SMTP path.

## Step 7: Docs
- ADRs (write each when its decision is made, not saved for this step; numbers from 0153): companies / contacts / links; project link side table; Pipedrive v2 and label resolution; system design and rules snapshot; failover sizing; SFP+ 1U exclusion; BOM rules; where the BOM snapshot is banked; deal-lines pass-through pricing; line sync and retry; pricing gate; "prepared for company + contact" superseding on-behalf for project calcs (builds on 0152). Already written: 0152, how a contact's login sees project quotes.
- JOURNAL per step. RUNBOOK only if setup changed.

## Out of scope
UI screens and screen server actions (after the design pass), renaming `/projects` (UI phase), intake form (1.1), options and phases UI, auto-closing losing options, company-wide visibility, any partner-path change, migrating legacy submissions, workstation calculator, camera list import.

## Gates
- STOP after Step 0 (report). Done 2026-10-16.
- STOP after Step 1 (migrations for Andy to apply; RLS tests run after he applies). Done 2026-10-16: applied, live suite all pass.
- STOP before the Step 2 `--execute` runs (mapping approval). Reached 2026-10-16.
- STOP before any live Pipedrive write in Step 5.
- At the end of each step, report what changed, tests run, and what is unverified.

## Kickoff prompt (first session)

> **Model:** Opus 5.5 · **Effort:** xhigh
>
> Read `docs/Portal-Project revamp/claude-code-brief-project-portal-backend.md` in full, then `AGENTS.md` and the files it lists under "Read first". Execute **Step 0 only** (read-only discovery). Report findings and the final step plan, then stop. Do not write code, migrations, or docs in this session.

For later sessions, change the step number and add one line pointing to the previous step's JOURNAL entry.

## Kickoff prompt (Step 1)

> **Model:** Opus 5.5 · **Effort:** xhigh
>
> Read `docs/Portal-Project revamp/claude-code-brief-project-portal-backend.md` in full, then `AGENTS.md` and the files it lists under "Read first". Execute **Step 1 only** (schema: migrations plus rollbacks, written, not applied; RLS tests written). Stop at the Step 1 gate for Andy to apply the migrations by hand, and report what changed, tests run, and what is unverified. Do not run `supabase db push` or `git push`.
>
> Previous step: JOURNAL 2026-10-16 "Project Portal backend, Step 0: discovery (read-only)"; the brief's "Step 0 results" and locked decisions already include its findings and Andy's decisions (ADR 0152).
