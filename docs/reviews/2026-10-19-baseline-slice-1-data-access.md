# Baseline Slice 1: Data and access layer

> **BANNER: STOP CONDITION HIT. Two holes are open to exploitation in production now, if live matches the repository on these points. No key needs rotating.**
>
> 1. **Any signed-in partner can overwrite another company's Pipedrive deal (B1-S-2, B1-A-1).**
>    - `authenticated` holds table-wide UPDATE on `submissions`, and the policy limits rows only, never columns.
>    - A partner PATCHes `pipedrive_deal_id` on their own row through the REST API, then submits a calculator revision of that row.
>    - The revise path reads the deal id from that row with the partner's own client and calls `updateDealFromRevision()` on it (`src/app/(app)/calculator/actions.ts:249-256, 694-702`). That rewrites the deal's value and portal fields and pins a note.
>    - The coordinator re-read this path and the grant (`20260527182010_step5_submission_lifecycle.sql:50`) before raising this banner.
>    - The ADR 0151 guard fixes `partners` only, so this stays open after 2026-10-16.
> 2. **A suspended internal user keeps cross-partner read access through REST (B1-S-3).** `is_internal()` never checks `status`, and suspending someone never bans their Supabase Auth account.
> 3. **The leftover "RLS Hijack Co" test persona may be an active admin (B1-S-6).** Check it, then delete it.
>
> First steps for Andy are in "Andy action items" below, items 1 to 4. Per the plan, Slice 2 has not started and waits for Andy's reply.

**Commit:** `6201569aebc78e65ab199a719490ea743e5e5235` (equal to `origin/main` on 2026-10-19). Every finding is valid for this commit only.
**Date:** 2026-10-19.
**Mode:** baseline, area scope through `review-gate`, with the finding cap raised to 20 per reviewer.
**Reviewers:** `security-review` at xhigh and `architect-review` at high, run as fresh parallel subagents. Both skills loaded.
**Inventory:** a third read-only subagent built the inventory appendix (policy matrix, live verification queries, test-rls coverage map). The two reviewers worked independently of it, so their findings and the inventory cross-check each other.
**Tree state:** clean. The only untracked path was `docs/reviews/`.
**Checks run:** read, grep, `git ls-files`, `git log`, `git show`.
**Not run:**
- `tsc`, lint and unit tests. `node_modules` is absent, and installing would run package install scripts.
- `scripts/test-rls.ts`. It is never run in this audit.
- Anything touching a live system.

## The repo is behind production

Andy's Mac checkout carries 2026-10-16 work that is applied live and absent from this commit. The source is the JOURNAL Andy uploaded on 2026-10-19, lines 1 to 322. The missing work:
- `20261016000001_partners_guard_self_update.sql`, the ADR 0151 guard trigger.
- `20261016000002` to `20261016000006`, the Project Portal schema: 13 tables.
- Their rollbacks, apply notes 0151 and 0153, ADRs 0150 to 0157, and `test-rls.ts` blocks 23 and 24.

None of that could be read here. This report reviews the base portal as committed, and treats the 2026-10-16 objects as known and unverified from source. The live verification queries (Appendix A, section E) list every object without filtering, so the live-only tables will show up in Andy's results.

## Scope (final file list)

- `supabase/migrations/*.sql`: 44 files, `20260515193702_initial_schema.sql` to `20260914000002_v700_v800_match_v500_cpu.sql`, replayed in filename order.
- `supabase/rollback/*.sql`: 29 files.
- `docs/apply-notes/*`: 10 files.
- `scripts/test-rls.ts`: 1912 lines, read for coverage only.
- Seed SQL: none exists. `supabase/config.toml` `[db.seed]` points at `./seed.sql`, which is missing. Seeds are TypeScript scripts and belong to Slice 8.
- Read outside the slice to trace calls (the reviewers list them in Appendices B and C):
  - `src/app/(app)/calculator/actions.ts`, `src/app/(app)/submissions/actions.ts`, `src/app/(app)/admin/submissions/actions.ts`, `src/app/(app)/admin/partners/actions.ts`, `src/app/(app)/layout.tsx`.
  - `src/lib/pipedrive/deal.ts`, `src/lib/project-quote/{assemble,generate,types}.ts`, `src/lib/pdf/*`, `src/lib/storage/partner-logo.ts`.
  - `scripts/push-prices.ts`.
  - `src/app/(auth)/login/request-access-actions.ts`.

## Verdict

**BLOCK.** There are two architect Must-fix items and three security High items. The worst of them lets any partner rewrite another company's Pipedrive deal through a column RLS never guards.

## Plain-language summary

The database rules that keep one partner from reading another's quotes mostly hold. They have one blind spot: they control which rows a partner can change, but never which fields.

That blind spot lets a partner change the hidden deal number on their own quote. The portal then edits whatever Pipedrive deal that number points to. The same gap lets a partner reshare a quote or rewrite its stored figures.

Two more problems sit beside it:
- Suspending an Arxys staff member blocks only the website. Their database access still works.
- The fix that stopped partners from making themselves admin exists only in production and on Andy's laptop, so rebuilding from the repository would reopen it.

The automated permission tests run against production, miss these cases, and leave a test account behind on every run.

## Ranked findings

Ranked in the gate's order:
1. Security Critical
2. Architect Must fix
3. Security High
4. Architect Should fix
5. Security Medium
6. Architect Consider
7. Security Low

A row shared by both reviewers takes the higher rank. Architect Consider items C-1 to C-5 are numbered B1-A-12 to B1-A-16.

| # | ID | Source | Severity | V/P | Location | One-line fix |
|---|---|---|---|---|---|---|
| 1 | B1-A-1, B1-S-2 | both | Must fix / High | VERIFIED | `supabase/migrations/20260527182010_step5_submission_lifecycle.sql:50`; `src/app/(app)/calculator/actions.ts:249` | Partners can write any column of their own `submissions` rows. That includes `pipedrive_deal_id`, which lets them overwrite any deal. Fix with an allow-list guard trigger on `submissions` (ADR 0151 pattern): non-admin `authenticated` callers may change only `status` and `is_preferred`, and INSERT may not set deal, email, timestamp or on-behalf fields. Also move the two partner-session writes at `calculator/actions.ts:610, 742` to the service-role client. |
| 2 | B1-A-2, B1-S-1 | both | Must fix / High | VERIFIED | `supabase/migrations/` (no `20261016*`); `20260515193702_initial_schema.sql:163` | The repo has drifted from live, and the ADR 0151 fix exists only in production. Push the 2026-10-16 work, commit each migration before applying it, and commit a catalog snapshot query plus its output after every apply. |
| 3 | B1-S-3, B1-A-6 | both | High / Should fix | VERIFIED | `supabase/migrations/20260605000004_fix_partners_internal_recursion.sql:13` | Add `status = 'active'` to `is_internal()`. Ban the Auth user on suspend (Slice 2). Later, replace the 14 copied staff checks with one no-argument `is_staff()` called as `(select ...)`. |
| 4 | B1-A-3 | architect | Should fix | VERIFIED | `20260818000001_semi_custom_ncd_upgraded_nic_gpu_skus.sql:54`; `scripts/revert-v700-v800-9135-cpu.ts` | Catalog data changes live in migrations and scripts, so a replay gives the wrong data. Keep migrations schema-only. Change data through admin forms or guarded scripts, and add a header to historical data migrations saying live values differ. |
| 5 | B1-A-4 | architect | Should fix | VERIFIED path, PLAUSIBLE trigger | `scripts/push-prices.ts:513` | A new price version re-activates and un-hides a SKU. Carry `active` and `hidden_from_catalog` forward from the current row, print "would reactivate" in the preview, and add a unit test. |
| 6 | B1-A-5 | architect | Should fix | VERIFIED | `20260702000001_price_versioning_append_only.sql:35` | Prices are append-only by convention only. Add a trigger that refuses UPDATE of `sku`, `msrp`, `price_type` and `effective_date`, and refuses DELETE. Move test 9b off production first. |
| 7 | B1-A-7 | architect | Should fix | VERIFIED | `src/app/(app)/submissions/actions.ts:79`; `20260527182010:8` | The "one preferred quote per project" rule is not atomic and crosses partners when an admin sets it. Add a partial unique index (after a duplicate check) and use one atomic UPDATE scoped by `partner_id`. |
| 8 | B1-A-8 | architect | Should fix | VERIFIED | `supabase/rollback/rls-perf-consolidation-rollback.sql`; 15 migrations with no rollback | Rollbacks are missing, stale or unrunnable. Name rollbacks by migration timestamp, add SUPERSEDED headers, run every rollback in the offline harness, and fix the status rollback mapping. |
| 9 | B1-S-7, B1-A-9 | both | Medium / Should fix | VERIFIED | `scripts/test-rls.ts:296, 976` | The RLS tests run only against production and have many gaps. Commit the PGlite harness as the offline check, keep `test-rls.ts` as a short live smoke test, and add the missing cases (Appendix A, F.4 and G items 27 to 48). |
| 10 | B1-A-10 | architect | Should fix | VERIFIED | `20260515193702_initial_schema.sql:40`; `20260727000001_product_specs_admin_editable.sql:92` | `partners` and `submissions` have no change history, so "was the ADR 0151 hole used" cannot be answered. Add one generic audit table and trigger. |
| 11 | B1-A-11 | architect | Should fix | VERIFIED | `src/app/(auth)/login/request-access-actions.ts:86`; `20260702000002_access_requests.sql:12` | Access-request dedup runs only in app code and races. Add a partial unique index on pending email and a lower-case CHECK, and insert with `on conflict do nothing`. |
| 12 | B1-S-4 | security | Medium | VERIFIED | `20260616000002_phase10_project_quotes.sql:89`; `src/lib/project-quote/generate.ts:100` | Internal users can insert an arbitrary, immutable Project Quote snapshot. Add a BEFORE INSERT trigger pinning the deal id to the submission's deal and the version to max+1. |
| 13 | B1-S-5 | security | Medium | VERIFIED policy, PLAUSIBLE listing | `20260721000002_partner_logos_bucket.sql:31` | Anyone can list the public partner-logos bucket and enumerate partner ids. Drop the SELECT policy (public URLs keep working) and set MIME and size limits on the bucket. |
| 14 | B1-S-6 | security | Medium | VERIFIED at commit, PLAUSIBLE live | `scripts/test-rls.ts:81, 118, 587, 1886` | Teardown leaves persona A in production on every run, likely as admin after the pre-fix run. Delete the 8h row before teardown, provision inside `try`, print teardown errors, sweep old test users at start, and trap SIGINT. |
| 15 | B1-A-12 | architect | Consider | VERIFIED | `20260812000001_calculator_math_phase_a.sql:50` | Validate the three `NOT VALID` checks. |
| 16 | B1-A-13 | architect | Consider | VERIFIED | `project_quotes.generated_by`, `*_specs.updated_by`, audit `changed_by` | Index the unindexed foreign keys (low impact). |
| 17 | B1-A-14 | architect | Consider | VERIFIED | policy and trigger names across migrations | Pick one naming convention for policies and triggers. |
| 18 | B1-A-15 | architect | Consider | VERIFIED | `supabase/config.toml` `[db.seed]` | Point the seed path at a real file or disable it. |
| 19 | B1-A-16 | architect | Consider | VERIFIED | `appliance_specs` | Add a CHECK `cameras_managed_min <= cameras_managed_max`. |
| 20 | B1-S-8 | security | Low | VERIFIED | `20260605000004_fix_partners_internal_recursion.sql:27` | Any partner can ask over RPC whether any user id is admin or internal. B1-A-6's no-argument helpers close this, as would moving the helpers to a private schema. |
| 21 | B1-S-9 | security | Low | VERIFIED | `20260615000001_rls_perf_consolidation.sql:78` | Partners can read future-dated, hidden `-NCD` and stale rows in `products`. Limit the non-admin branch to `active and effective_date <= current_date`. |
| 22 | B1-S-10 | security | Low | VERIFIED | `20260702000001:99`; `20260615000002_phase10_camera_specs.sql:48` | Grant hygiene. Revoke anon on `current_products`. Pin `search_path` on `camera_aliases_text` and revoke its EXECUTE. Move `pg_trgm` out of `public`. Revoke anon default privileges. |
| 23 | B1-S-11 | security | Low | VERIFIED | `20260702000002_access_requests.sql:33`; `20260803000002_pipedrive_deal_cache.sql:146` | Internal users hold write grants the app does not use. Revoke UPDATE on `access_requests` and accept or narrow the cache grant. |
| 24 | B1-S-12 | security | Low | VERIFIED | `20260615000001_rls_perf_consolidation.sql:64` | Admins can bypass the partner-management guards over REST. Make the live guard refuse `role` changes from every `authenticated` caller. |

**Counts by source.**
- Security: Critical 0 new, High 3, Medium 4, Low 5. One known Critical (ADR 0151) remains open in the repo and is fixed live.
- Architect: Must fix 2, Should fix 9, Consider 5.
- After deduplication: 24 rows (4 shared root causes).

## Known issues status

| Known issue | Status at this commit | Evidence |
|---|---|---|
| ADR 0151: partners can update their own `role`, `is_internal` and other columns | **Open in the repo, fixed live.** The repo gap is B1-A-2 / B1-S-1. The guard does not cover `submissions` (B1-A-1), suspended internal reads (B1-S-3) or admin REST writes (B1-S-12). | `20260515193702_initial_schema.sql:163`; `20260615000001:64-68`; uploaded JOURNAL lines 193 to 253 |
| ADR 0150: `active_flag: false` deletes Pipedrive products | **Open in the repo, fixed in Andy's unpushed code.** The data layer never sends it. | `scripts/push-prices.ts:599` (Slice 4 owns it) |
| Pipedrive v1 and name-based upserts | Out of slice. Note: partners can still write `company_name`, which feeds the upserts, until the guard is in the repo. | Slice 4 |
| `ensureCustomFields()` | Out of slice. It also runs inside the B1-S-2 attack path (`deal.ts:400-403`). | Slice 4 |
| 100 duplicated codes, `VX5-RAM-32GB` linkable | Pipedrive side out of slice. In the portal the SKU is inactive by hand UPDATE, and a later price version would re-activate it (B1-A-4). | Slice 4 |
| "RLS Hijack Co" leftover persona | **Still present.** The committed teardown can never delete persona A (B1-S-6). It is likely an admin from the pre-fix block 23 run. | `scripts/test-rls.ts:587-608, 1886`; uploaded JOURNAL lines 51 to 54 |
| Hand-applied migrations, possible drift | **Drift confirmed.** At least six migrations are live and missing from the repo. `rls_auto_enable` and some catalog data also came from outside the migrations. The rest stays open until Andy runs Appendix A section E. | B1-A-2, B1-A-3, Appendix A section A.17 |

## Live evidence: Supabase Security Advisor

Andy ran the advisor against production and pasted the results on 2026-10-19 (observed 18:43:31 UTC). It returned six warnings and no errors.

| Advisor lint | Object | Matches | Effect on the finding |
|---|---|---|---|
| `function_search_path_mutable` | `public.camera_aliases_text` | B1-S-10 | Confirmed live. |
| `extension_in_public` | `pg_trgm` in `public` | B1-S-10 | Confirmed live (inventory gap 9 was unverified). |
| `public_bucket_allows_listing` | `partner-logos`, policy `partner_logos_public_read` | B1-S-5 | Anonymous listing confirmed live; was PLAUSIBLE. |
| `authenticated_security_definer_function_executable` | `public.is_admin(uuid)` | B1-S-8 | Confirmed live. ADR 0053 dismissed this lint as a false positive, and B1-S-8 shows it is a real role lookup. |
| `authenticated_security_definer_function_executable` | `public.is_internal(uuid)` | B1-S-8 | Confirmed live. Same note. |
| `auth_leaked_password_protection` | Auth settings | none in Slice 1 | A new item for the Slice 2 dashboard checklist: leaked password protection (HaveIBeenPwned) is off. |

What the advisor cannot see:
- Column-level write holes (B1-A-1 / B1-S-2).
- Status checks inside function bodies (B1-S-3).
- Test-script behavior (B1-S-6).

Its silence on those is expected and does not clear them. It raised nothing on the 13 live-only Project Portal tables or the ADR 0151 guard trigger: no table without RLS, no definer view and no mutable `search_path`.

## Andy action items

Items 1 to 4 are urgent.

1. **Run the read-only detection queries in Appendix B, action item 3.** They cover:
   - deals linked from more than one creator
   - on-behalf fields set by non-internal partners
   - future `created_at` values
   - cross-owner parent links
   - suspended internal users
   - leftover test personas
   - privileged `partners` rows

   Also search the Supabase API logs (Logs Explorer) for `PATCH /rest/v1/submissions` and `PATCH /rest/v1/partners` sent with partner JWTs.
2. **Ban every suspended internal user in Supabase Auth** until B1-S-3 is fixed.
3. **Read the `@arxys-rls-test.invalid` personas' rows** (Appendix A query E21), then delete them, "RLS Hijack Co" included.
4. **Decide on an urgent fix session for B1-A-1/B1-S-2 and B1-S-3.**
   - Both are RLS changes, so each needs the review gate and a fresh security pass.
   - This audit fixes nothing.
   - The B1-S-2 fix needs code and SQL together, because the calculator writes `pipedrive_deal_id` with the partner's own client. There is no SQL-only stopgap.
5. **Push the 2026-10-16 work**, and commit the PGlite harness.
6. **Run the live verification queries in Appendix A, section E (E1 to E24).** They are read only. Paste the results back so the next session can diff live against the matrix.
7. **Security Advisor: done 2026-10-19.** The results are in "Live evidence" below. **Still to run:** the Performance Advisor. Compare its output with B1-A-6 (per-row role helpers) and B1-A-13 (unindexed foreign keys).
8. **Run the read-only data checks in Appendix C, action item 3:**
   - duplicate preferred quotes
   - duplicate pending access requests
   - inactive SKUs that resurface through an older row
   - EOL or `-NCD` rows still in the Master Sheet
9. **Make four decisions:**
   - May a partner move a quote out of `won` or `lost`?
   - Mark ADR 0004 as superseded by the hand-apply practice.
   - Resolve the ADR 0076 edge case (B1-A-4, B1-S-9).
   - Confirm the structure for the role helpers (open disagreement 3).

## Not checked

- The six `20261016*` migrations, their rollbacks, apply notes 0151 and 0153, ADRs 0150 to 0157, `test-rls.ts` blocks 23 and 24, and the PGlite harness. None of them is in this commit. Nobody knows yet whether the 2026-10-16 work changed the `submissions` grants.
- The live database. There was no access. Every matrix entry marked "Supabase default (assumed)" needs query E13.
- The Project Portal brief. It is not in this repository or in Drive. Per the JOURNAL it lives at `docs/Portal-Project revamp/claude-code-brief-project-portal-backend.md` in Andy's checkout.
- Full git history. The clone is shallow, at 50 commits.
- `tsc`, lint and unit tests. `node_modules` is absent.
- Dashboard-only settings: Auth, Storage, Realtime, `pg_graphql` and network restrictions. These go to the Slice 2 checklist.
- `verify-project-queue.mts`, the TypeScript seed scripts and the service-role inventory. These belong to Slices 2 and 8.

## Open disagreements

1. **Verdict label.**
   - Architect wrote FIX BEFORE COMMIT while listing two Must-fix items.
   - Security wrote BLOCK.
   - Under the gate's rule any Must fix means BLOCK, so the merged verdict is BLOCK. The substance does not differ.
2. **How to close `pipedrive_deal_id` (B1-A-1, B1-S-2).**
   - Architect offered, as one option, allowing the column only while it is null.
   - Security showed that a "set once" rule leaves the hole open: a partner can set it once on a fresh row.
   - Security's veto applies to a simplification that removes a control. The backlog carries the security fix: no partner writes to the column at all, and the server writes it as service role.
3. **How to harden the role helpers (B1-A-6, B1-S-8).**
   - Architect: no-argument `is_staff()` and `is_admin()` reading `auth.uid()`, then revoke the uuid overloads.
   - Security: move the helpers to a private schema.
   - Both close the RPC lookup. Structure is the architect's call under the gate rules, and security raised no veto. Andy to confirm.
   - Either way, B1-S-3's one-line `status = 'active'` fix ships first.
4. **ADR 0076.** Both reviewers challenge it, with compatible fixes:
   - Architect: a one-row-per-SKU attributes table.
   - Security: narrow the `products` policy.

   Andy decides whether to revisit the ADR.

## Claims verified or refuted

| Claim | Result | Evidence |
|---|---|---|
| ADR 0151's guard trigger landed 2026-10-16 | **Refuted for this commit, confirmed live** per the JOURNAL. No `20261016*` file, rollback, apply note or ADR is present. The committed state lets a partner set their own `role`, `is_internal`, `status`, `company_name`, `contact_name`, `pipedrive_user_id` and `logo_path`. | Appendix B, claim 1 |
| ADR 0055: the RLS consolidation was authorization-neutral | **Confirmed** for policy logic. It carried the partners hole forward. | Appendix B, claim 2 |
| ADR 0055: auth calls are wrapped for InitPlan everywhere | **Confirmed** for `auth.uid()`. **Refuted** for the claim that `is_admin` and `is_internal` evaluate once per statement: they run per row. | Appendix C, claim 3 |
| ADR 0053: function EXECUTE grants hardened | **Partly confirmed.** True for the four functions it named. Later functions skipped it, and the uuid helpers allow role lookups. | Appendix B, claim 3 |
| ADR 0004: migrations go through the Supabase CLI | **Refuted.** Since July they are applied by hand in the SQL editor, and nothing detects drift. | Appendix C, claim 2 |
| ADR 0076: prices are append-only | **Refuted.** Nothing in the database enforces it, and rows are updated in practice. | Appendix C, claim 4 |
| ADR 0037: won or lost rows cannot be deleted, even by direct POST | **Refuted.** A partner can PATCH `status` back to open, then DELETE. | Appendix B, Challenges |
| JOURNAL: `test-rls.ts` covers partner-denied and internal-allowed cases for every table | **Refuted.** Appendix A section F.4 lists the gaps. | Appendix A, section G |

## Deliverables index

- **Effective policy matrix:** Appendix A, sections A to D. These cover tables, policies with USING and WITH CHECK, triggers, grants, functions with `search_path` and EXECUTE, views with `security_invoker`, and storage.
- **Live verification queries:** Appendix A, section E (E1 to E24). Detection queries for the banner items are in Appendix B, action item 3. Data checks are in Appendix C, action item 3. All of them are read only.
- **test-rls.ts coverage map:** Appendix A, section F. Gaps are in section G, items 19 to 48.

---

# Appendix A: Inventory (policy matrix, verification queries, coverage map)

Built by a read-only inventory subagent from the committed migrations. Reproduced verbatim.

## Slice 1 inventory appendix: data and access layer

- Repository: `/home/user/Portal`
- Commit: `6201569aebc78e65ab199a719490ea743e5e5235` (committed 2026-10-16 12:41:59 -0700). Tracked tree clean; one untracked path, `docs/reviews/` (holds `BASELINE-PLAN.md`).
- Method: every file in `supabase/migrations/` (44 files, 4182 lines) read and replayed by hand in filename order. Seed value tuples were skimmed; every DDL, grant, revoke, policy, function, trigger, view and storage statement was read in full and cross-checked with a grep of all 44 files. `supabase/rollback/*.sql` and `docs/apply-notes/*` read for context. `scripts/test-rls.ts` (1912 lines) read in full and never run. No database access. No query in section E was executed.
- Scope: the base portal as committed at 6201569, full history. Objects applied live on 2026-10-16 but absent from this checkout are listed separately in section A2 from the JOURNAL extract Andy supplied, and are unverified from source.

### Conventions

- `NNNNNNNNNNNNNN:L` means `supabase/migrations/NNNNNNNNNNNNNN_*.sql` line `L`. `test-rls:L` means `scripts/test-rls.ts` line `L`.
- Policy text is quoted from the migration source with whitespace collapsed. Live `pg_policies` shows the deparsed form (for example `( SELECT auth.uid() AS uid)`), so cosmetic differences are expected when diffing.
- "Supabase default (assumed)" means no migration changes the privilege, and the value comes from Supabase's standard default privileges in schema `public` (ALL on tables, views and sequences, and EXECUTE on functions, for `anon`, `authenticated` and `service_role`). This is an assumption. Andy's live queries E9, E10 and E13 must confirm it.
- Postgres also grants EXECUTE on every new function to `PUBLIC` unless revoked.

#### Migration index

| Prefix | File |
|---|---|
| 20260515193702 | initial_schema |
| 20260519052732 | step5_submissions_and_seeds |
| 20260521190350 | step3_4_products_sku_pk |
| 20260527000700 | step4_submissions_input_state |
| 20260527182010 | step5_submission_lifecycle |
| 20260529000001 | phase5_product_specs |
| 20260529000002 | phase5_competitor_products |
| 20260601000001 | admin_submission_edit |
| 20260602000001 | quickcompare_columns |
| 20260604000001 | phase7_on_behalf |
| 20260604000002 | internal_user_read_submissions |
| 20260605000001 | fix_cpu_cache |
| 20260605000002 | fix_hdd_count_raid_level |
| 20260605000003 | partners_select_internal |
| 20260605000004 | fix_partners_internal_recursion |
| 20260611000001 | security_advisor_hardening |
| 20260612155238 | on_behalf_target_visibility |
| 20260615000001 | rls_perf_consolidation |
| 20260615000002 | phase10_camera_specs |
| 20260616000001 | phase10_camera_search_rpc |
| 20260616000002 | phase10_project_quotes |
| 20260624000001 | genetec_streamvault_hw_platform |
| 20260702000001 | price_versioning_append_only |
| 20260702000002 | access_requests |
| 20260717000001 | drop_product_specs_msrp |
| 20260717000002 | pipeline_status_model_reduction |
| 20260720000001 | project_quotes_partner_select |
| 20260721000001 | partners_logo_path |
| 20260721000002 | partner_logos_bucket |
| 20260724000001 | submission_revision_lineage |
| 20260727000001 | product_specs_admin_editable |
| 20260729000001 | datasheet_appliance_specs |
| 20260729000002 | datasheet_product_specs_additive |
| 20260730000001 | datasheet_media_and_usage |
| 20260731000001 | management_cameras_managed |
| 20260803000001 | internal_project_archive |
| 20260803000002 | pipedrive_deal_cache |
| 20260810000001 | partners_pipedrive_user_id |
| 20260812000001 | calculator_math_phase_a |
| 20260817000001 | calculator_math_phase_bc |
| 20260818000001 | semi_custom_ncd_upgraded_nic_gpu_skus |
| 20260818000002 | hide_ncd_skus_from_catalog |
| 20260914000001 | v400_v700_v800_9015_cpu_refresh |
| 20260914000002 | v700_v800_match_v500_cpu |

---

### A. Effective policy matrix (final replayed state at 6201569)

#### A.0 Summary matrix

Schemas touched: `public` (13 tables, 1 view, 10 functions, 1 event trigger), `storage` (4 policies on `storage.objects`, 1 row in `storage.buckets`), extensions `pgcrypto` (20260515193702:7) and `pg_trgm` (20260615000002:36). `auth.users` is referenced by FK only.

| Table | RLS | FORCE | `authenticated` table grants | `anon` grants | Policies (S / I / U / D) | Triggers |
|---|---|---|---|---|---|---|
| public.partners | on | no | SELECT, UPDATE | none | 1 / 0 / 1 / 0 | `trg_partners_set_updated_at` |
| public.products | on | no | SELECT | none | 1 / 0 / 0 / 0 | `trg_products_set_updated_at` |
| public.submissions | on | no | SELECT, INSERT, UPDATE, DELETE | none | 1 / 1 / 1 / 1 | none |
| public.product_specs | on | no | SELECT, INSERT, UPDATE | none | 1 / 1 / 1 / 0 | stamp (BEFORE), audit (AFTER) |
| public.product_specs_audit | on | no | SELECT | none | 1 / 0 / 0 / 0 | none |
| public.competitor_products | on | no | SELECT | none | 1 / 0 / 0 / 0 | none |
| public.camera_specs | on | no | SELECT, INSERT, UPDATE, DELETE | none | 1 / 1 / 1 / 1 | none |
| public.project_quotes | on | no | SELECT, INSERT | none | 1 / 1 / 0 / 0 | none |
| public.access_requests | on | no | SELECT, UPDATE | none | 1 / 0 / 1 / 0 | none |
| public.appliance_specs | on | no | SELECT, INSERT, UPDATE | none | 1 / 1 / 1 / 0 | stamp (BEFORE), audit (AFTER) |
| public.appliance_specs_audit | on | no | SELECT | none | 1 / 0 / 0 / 0 | none |
| public.submission_internal_archives | on | no | SELECT, INSERT, UPDATE, DELETE | none | 1 / 1 / 1 / 1 | none |
| public.pipedrive_deal_cache | on | no | SELECT, INSERT, UPDATE | none | 1 / 1 / 1 / 0 | none |
| storage.objects | Supabase-managed (assumed on) | unknown | Supabase-managed | Supabase-managed | partner-logos: 1 / 1 / 1 / 1 | Supabase-managed |

Facts that hold across the matrix:

- Every table above has RLS enabled by an explicit `enable row level security` statement. No table has RLS enabled with zero policies. No migration sets FORCE ROW LEVEL SECURITY on any table.
- Every policy is PERMISSIVE. No RESTRICTIVE policy exists. No policy uses command ALL.
- Every UPDATE policy in the final state has a WITH CHECK clause (count of UPDATE policies with USING and no WITH CHECK: 0).
- Every table runs `revoke all ... from anon, authenticated` before its grants, so table grants to `anon` and `authenticated` are migration-defined for all 13 tables. `service_role` on every table: Supabase default (assumed).
- No migration grants or revokes a column-level privilege. All grants are table-wide.
- One policy is scoped `to public`: `partner_logos_public_read` on `storage.objects`. All other final policies are `to authenticated`.
- Sequences receive no explicit grant or revoke: `products_id_seq` (identity, 20260702000001:36), `product_specs_audit_id_seq` (bigserial, 20260727000001:93), `appliance_specs_audit_id_seq` (bigserial, 20260729000001:258). Supabase default (assumed).
- The event trigger `ensure_rls` (20260611000001:68-74) auto-enables RLS on any table created later in schema `public`.

#### A.1 public.partners

- Created 20260515193702:27. Final columns: `id` (PK, FK to `auth.users(id)` on delete cascade, :28), `company_name`, `contact_name`, `phone`, `role` (check partner/admin), `status` (check active/invited/suspended), `created_at`, `updated_at`, `is_internal` (20260604000001:14), `logo_path` (20260721000001:17), `pipedrive_user_id` (20260810000001:26). Andy's 2026-10-16 catalog query found no columns beyond these (uploaded JOURNAL lines 200-203).
- RLS: enabled 20260515193702:151. FORCE: not set.
- Grants: `anon` none (revoke all 20260515193702:158). `authenticated` SELECT, UPDATE table-wide (20260515193702:163). No INSERT or DELETE. No column-level grants. `service_role`: Supabase default (assumed).
- Policies:

| Name | Cmd | Roles | Type | USING | WITH CHECK | Final source |
|---|---|---|---|---|---|---|
| partners_select_self_admin_internal | SELECT | authenticated | permissive | `id = (select auth.uid()) or public.is_admin((select auth.uid())) or public.is_internal((select auth.uid()))` | none | 20260615000001:53 |
| partners_update_self_or_admin | UPDATE | authenticated | permissive | `id = (select auth.uid()) or public.is_admin((select auth.uid()))` | `id = (select auth.uid()) or public.is_admin((select auth.uid()))` | 20260615000001:64 |

- Triggers: `trg_partners_set_updated_at` BEFORE UPDATE FOR EACH ROW EXECUTE FUNCTION `public.set_updated_at()` (20260515193702:40).
- Guard triggers in migrations: none. **Live guard trigger per JOURNAL 2026-10-16 (20261016000001), not in this checkout.** See A2.
- Column-level effect in the replayed state: a non-admin caller can UPDATE every column of their own row (`role`, `is_internal`, `status`, `company_name`, `contact_name`, `phone`, `logo_path`, `pipedrive_user_id`, `created_at`, `updated_at`). The WITH CHECK pins `id` to the caller. Self-setting `role = 'admin'` satisfies `is_admin()` while `status = 'active'` (20260515193702:140). This is the ADR 0151 hole; the uploaded JOURNAL (lines 197-231) records it as real in production before the 2026-10-16 guard.
- SECURITY DEFINER functions that read it: `public.is_admin(uuid)`, `public.is_internal(uuid)`. None write it.
- Inbound FKs (delete behaviour matters for test teardown, section F): `submissions.partner_id` on delete restrict (20260515193702:104); `submissions.on_behalf_of_partner_id` no action (20260604000001:23); `project_quotes.generated_by` restrict (20260616000002:55); `product_specs.updated_by` no action (20260727000001:68); `product_specs_audit.changed_by` no action (20260727000001:96); `appliance_specs.updated_by` no action (20260729000001:180); `appliance_specs_audit.changed_by` no action (20260729000001:261); `submission_internal_archives.archived_by` restrict (20260803000001:60).

#### A.2 public.products (versioned price table)

- The original uuid-keyed `products` (20260515193702:51) was dropped with `cascade` at 20260521190350:39. The current table was created at 20260521190350:62 (SKU primary key), then given a bigint identity `id` primary key, `effective_date`, `pushed_to_pipedrive_at` and unique `(sku, effective_date)` (20260702000001:35-68), then `hidden_from_catalog` (20260818000002:24).
- RLS: enabled 20260521190350:100. FORCE: not set.
- Grants: `anon` none (revoke 20260521190350:102). `authenticated` SELECT (20260521190350:103). No column grants. `service_role`: Supabase default (assumed). Writes are service_role only (comment 20260521190350:110).
- Policies:

| Name | Cmd | Roles | Type | USING | WITH CHECK | Final source |
|---|---|---|---|---|---|---|
| products_select_active_or_admin | SELECT | authenticated | permissive | `active = true or public.is_admin((select auth.uid()))` | none | 20260615000001:78 |

- Triggers: `trg_products_set_updated_at` BEFORE UPDATE FOR EACH ROW EXECUTE FUNCTION `public.set_updated_at()` (20260521190350:87).
- SECURITY DEFINER functions: none read or write it directly (the policy calls `is_admin`, which reads `partners`).
- Read through view `public.current_products` (section C).

#### A.3 public.submissions

- Created 20260515193702:102. Later columns: `groups_payload` (20260519052732:39), `recommended_product_id` retyped to text and FK dropped (20260521190350:30-48), `input_state` (20260527000700:5), `status` and `is_preferred` (20260527182010:33-38; status domain reduced to open/won/lost, NOT NULL, default open at 20260717000002:20-40), `on_behalf_of_partner_id` and `on_behalf_of_company_name` with check `submissions_on_behalf_one_of` (20260604000001:22-31), `parent_submission_id` self-FK on delete set null (20260724000001:11), `calc_version`, `max_disk_utilization_pct`, `recorded_storage_tb` with NOT VALID checks (20260812000001:41-62).
- RLS: enabled 20260515193702:154. FORCE: not set.
- Grants: `anon` none (revoke 20260515193702:161). `authenticated` SELECT, INSERT (20260515193702:166) plus UPDATE, DELETE (20260527182010:50). All table-wide. `service_role`: Supabase default (assumed).
- Policies:

| Name | Cmd | Roles | Type | USING | WITH CHECK | Final source |
|---|---|---|---|---|---|---|
| submissions_select_authorized | SELECT | authenticated | permissive | `partner_id = (select auth.uid()) or public.is_admin((select auth.uid())) or public.is_internal((select auth.uid())) or on_behalf_of_partner_id = (select auth.uid())` | none | 20260615000001:91 |
| submissions_insert_self | INSERT | authenticated | permissive | none | `partner_id = (select auth.uid())` | 20260615000001:107 |
| submissions_update_authorized | UPDATE | authenticated | permissive | `partner_id = (select auth.uid()) or public.is_admin((select auth.uid()))` | `partner_id = (select auth.uid()) or public.is_admin((select auth.uid()))` | 20260615000001:119 |
| submissions_delete_authorized | DELETE | authenticated | permissive | `(partner_id = (select auth.uid()) and status = 'open') or public.is_admin((select auth.uid()))` | none | 20260717000002:49 |

- Triggers: none.
- Column guards: none. The owning partner can INSERT and UPDATE every column of their own rows, including `status`, `is_preferred`, `pipedrive_deal_id`, `email_sent_at`, price totals, `on_behalf_of_partner_id`, `on_behalf_of_company_name`, `parent_submission_id` and `calc_version`. 20260803000001:12-17 and 20260803000002:27-29 state this in their own comments.
- Consequences visible from the policy text: (a) setting `on_behalf_of_partner_id` on an own row grants the named partner SELECT on that row (20260615000001:98) and on its `project_quotes` (20260720000001:36-39); (b) the delete guard `status = 'open'` can be passed by first updating an own `won` or `lost` row back to `open`, which `submissions_update_authorized` permits.
- SECURITY DEFINER functions: none read or write it directly. `project_quotes_select_internal_or_owner` reads it as the invoker.
- Inbound FKs: `project_quotes.submission_id` restrict (20260616000002:37); `submission_internal_archives.submission_id` cascade (20260803000001:55); `submissions.parent_submission_id` set null (20260724000001:12).

#### A.4 public.product_specs

- Created 20260529000001:11. Column additions at 20260602000001:30-60, 20260727000001:66-68 and :197, 20260729000002:53-107, 20260730000001:36-70. `msrp` dropped at 20260717000001:13. Data rewrites at 20260605000001, 20260605000002, 20260914000001, 20260914000002 and inserts at 20260818000001:78-184.
- RLS: enabled 20260529000001:36. FORCE: not set.
- Grants: `anon` none (revoke 20260529000001:37). `authenticated` SELECT (20260529000001:38), INSERT, UPDATE (20260727000001:38). No DELETE. `service_role`: Supabase default (assumed).
- Policies:

| Name | Cmd | Roles | Type | USING | WITH CHECK | Final source |
|---|---|---|---|---|---|---|
| product_specs_select_all | SELECT | authenticated | permissive | `true` | none | 20260529000001:40 |
| product_specs_insert_admin | INSERT | authenticated | permissive | none | `public.is_admin((select auth.uid()))` | 20260727000001:40 |
| product_specs_update_admin | UPDATE | authenticated | permissive | `public.is_admin((select auth.uid()))` | `public.is_admin((select auth.uid()))` | 20260727000001:45 |

- Triggers: `product_specs_stamp_updated_trg` BEFORE INSERT OR UPDATE FOR EACH ROW EXECUTE FUNCTION `public.product_specs_stamp_updated()` (20260727000001:167); `product_specs_write_audit_trg` AFTER INSERT OR UPDATE FOR EACH ROW EXECUTE FUNCTION `public.product_specs_write_audit()` (20260727000001:171).
- SECURITY DEFINER functions: `public.product_specs_write_audit()` reads OLD/NEW and writes `product_specs_audit`.
- Inbound FK: `competitor_products.arxys_match_id` (20260529000002:30).

#### A.5 public.product_specs_audit

- Created 20260727000001:92.
- RLS: enabled 20260727000001:106. FORCE: not set.
- Grants: `anon` none (revoke 20260727000001:107). `authenticated` SELECT (:108). `service_role`: Supabase default (assumed).
- Policies:

| Name | Cmd | Roles | Type | USING | WITH CHECK | Final source |
|---|---|---|---|---|---|---|
| product_specs_audit_select_admin | SELECT | authenticated | permissive | `public.is_admin((select auth.uid()))` | none | 20260727000001:110 |

- Triggers: none. Rows are written only by `public.product_specs_write_audit()` (SECURITY DEFINER).

#### A.6 public.competitor_products

- Created 20260529000002:9. `hw_platform` added and vendor check widened at 20260624000001:24-34; seed upserts 20260624000001:45-371.
- RLS: enabled 20260529000002:38. FORCE: not set.
- Grants: `anon` none (revoke :39). `authenticated` SELECT (:40). `service_role`: Supabase default (assumed).
- Policies:

| Name | Cmd | Roles | Type | USING | WITH CHECK | Final source |
|---|---|---|---|---|---|---|
| competitor_products_select_all | SELECT | authenticated | permissive | `true` | none | 20260529000002:42 |

- Triggers: none. SECURITY DEFINER functions: none.

#### A.7 public.camera_specs

- Created 20260615000002:14.
- RLS: enabled 20260615000002:67. FORCE: not set.
- Grants: `anon` none (revoke :68). `authenticated` SELECT, INSERT, UPDATE, DELETE (:69). `service_role`: Supabase default (assumed).
- Policies:

| Name | Cmd | Roles | Type | USING | WITH CHECK | Final source |
|---|---|---|---|---|---|---|
| camera_specs_select_all | SELECT | authenticated | permissive | `true` | none | 20260615000002:71 |
| camera_specs_insert_admin | INSERT | authenticated | permissive | none | `public.is_admin((select auth.uid()))` | 20260615000002:76 |
| camera_specs_update_admin | UPDATE | authenticated | permissive | `public.is_admin((select auth.uid()))` | `public.is_admin((select auth.uid()))` | 20260615000002:81 |
| camera_specs_delete_admin | DELETE | authenticated | permissive | `public.is_admin((select auth.uid()))` | none | 20260615000002:87 |

- Triggers: none. No audit table.
- Functions reading it: `public.search_camera_specs` (INVOKER), `public.camera_aliases_text` (index expression only).

#### A.8 public.project_quotes

- Created 20260616000002:32. Unique `(submission_id, version)`.
- RLS: enabled 20260616000002:80. FORCE: not set.
- Grants: `anon` none (revoke :81). `authenticated` SELECT, INSERT (:82). No UPDATE or DELETE. `service_role`: Supabase default (assumed).
- Policies:

| Name | Cmd | Roles | Type | USING | WITH CHECK | Final source |
|---|---|---|---|---|---|---|
| project_quotes_select_internal_or_owner | SELECT | authenticated | permissive | `public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())) or exists ( select 1 from public.submissions s where s.id = project_quotes.submission_id and ( s.partner_id = (select auth.uid()) or s.on_behalf_of_partner_id = (select auth.uid()) ) )` | none | 20260720000001:26 |
| project_quotes_insert_internal | INSERT | authenticated | permissive | none | `(public.is_internal((select auth.uid())) or public.is_admin((select auth.uid()))) and generated_by = (select auth.uid())` | 20260616000002:89 |

- Policy comment set at 20260720000001:43.
- Triggers: none. SECURITY DEFINER functions: none touch it directly. The EXISTS subquery runs under the caller's `submissions` RLS.

#### A.9 public.access_requests

- Created 20260702000002:9.
- RLS: enabled 20260702000002:26. FORCE: not set.
- Grants: `anon` none (revoke :32). `authenticated` SELECT, UPDATE (:33). No INSERT or DELETE. Inserts happen through service_role in the `requestAccess()` action (comment :1-7). `service_role`: Supabase default (assumed).
- Policies:

| Name | Cmd | Roles | Type | USING | WITH CHECK | Final source |
|---|---|---|---|---|---|---|
| access_requests_select_admin_internal | SELECT | authenticated | permissive | `public.is_admin((select auth.uid())) or public.is_internal((select auth.uid()))` | none | 20260702000002:35 |
| access_requests_update_admin_internal | UPDATE | authenticated | permissive | `public.is_admin((select auth.uid())) or public.is_internal((select auth.uid()))` | `public.is_admin((select auth.uid())) or public.is_internal((select auth.uid()))` | 20260702000002:43 |

- Internal users (as well as admins) can UPDATE every column, including `email`, `status` and `converted_at`.
- Triggers: none.

#### A.10 public.appliance_specs

- Created 20260729000001:44. Columns added at 20260730000001:38-70 and 20260731000001:35-37.
- RLS: enabled 20260729000001:225. FORCE: not set.
- Grants: `anon` none (revoke :226). `authenticated` SELECT, INSERT, UPDATE (:227). No DELETE. `service_role`: Supabase default (assumed).
- Policies:

| Name | Cmd | Roles | Type | USING | WITH CHECK | Final source |
|---|---|---|---|---|---|---|
| appliance_specs_select_all | SELECT | authenticated | permissive | `true` | none | 20260729000001:229 |
| appliance_specs_insert_admin | INSERT | authenticated | permissive | none | `public.is_admin((select auth.uid()))` | 20260729000001:234 |
| appliance_specs_update_admin | UPDATE | authenticated | permissive | `public.is_admin((select auth.uid()))` | `public.is_admin((select auth.uid()))` | 20260729000001:239 |

- Triggers: `appliance_specs_stamp_updated_trg` BEFORE INSERT OR UPDATE FOR EACH ROW EXECUTE FUNCTION `public.appliance_specs_stamp_updated()` (20260729000001:330); `appliance_specs_write_audit_trg` AFTER INSERT OR UPDATE FOR EACH ROW EXECUTE FUNCTION `public.appliance_specs_write_audit()` (:334).
- SECURITY DEFINER functions: `public.appliance_specs_write_audit()`.

#### A.11 public.appliance_specs_audit

- Created 20260729000001:257.
- RLS: enabled :271. FORCE: not set.
- Grants: `anon` none (revoke :272). `authenticated` SELECT (:273). `service_role`: Supabase default (assumed).
- Policies:

| Name | Cmd | Roles | Type | USING | WITH CHECK | Final source |
|---|---|---|---|---|---|---|
| appliance_specs_audit_select_admin | SELECT | authenticated | permissive | `public.is_admin((select auth.uid()))` | none | 20260729000001:275 |

- Triggers: none. Written only by `public.appliance_specs_write_audit()` (SECURITY DEFINER).

#### A.12 public.submission_internal_archives

- Created 20260803000001:46. PK `submission_id` (FK to submissions, on delete cascade).
- RLS: enabled :102. FORCE: not set.
- Grants: `anon` none (revoke :103). `authenticated` SELECT, INSERT, UPDATE, DELETE (:104). `service_role`: Supabase default (assumed).
- Policies:

| Name | Cmd | Roles | Type | USING | WITH CHECK | Final source |
|---|---|---|---|---|---|---|
| submission_internal_archives_select_internal | SELECT | authenticated | permissive | `public.is_internal((select auth.uid())) or public.is_admin((select auth.uid()))` | none | 20260803000001:106 |
| submission_internal_archives_insert_internal | INSERT | authenticated | permissive | none | `(public.is_internal((select auth.uid())) or public.is_admin((select auth.uid()))) and archived_by = (select auth.uid())` | 20260803000001:111 |
| submission_internal_archives_update_internal | UPDATE | authenticated | permissive | `public.is_internal((select auth.uid())) or public.is_admin((select auth.uid()))` | `(public.is_internal((select auth.uid())) or public.is_admin((select auth.uid()))) and archived_by = (select auth.uid())` | 20260803000001:121 |
| submission_internal_archives_delete_internal | DELETE | authenticated | permissive | `public.is_internal((select auth.uid())) or public.is_admin((select auth.uid()))` | none | 20260803000001:130 |

- Triggers: none.

#### A.13 public.pipedrive_deal_cache

- Created 20260803000002:49. PK `pipedrive_deal_id`.
- RLS: enabled :144. FORCE: not set.
- Grants: `anon` none (revoke :145). `authenticated` SELECT, INSERT, UPDATE (:146). No DELETE. `service_role`: Supabase default (assumed).
- Policies:

| Name | Cmd | Roles | Type | USING | WITH CHECK | Final source |
|---|---|---|---|---|---|---|
| pipedrive_deal_cache_select_internal | SELECT | authenticated | permissive | `public.is_internal((select auth.uid())) or public.is_admin((select auth.uid()))` | none | 20260803000002:148 |
| pipedrive_deal_cache_insert_internal | INSERT | authenticated | permissive | none | `public.is_internal((select auth.uid())) or public.is_admin((select auth.uid()))` | 20260803000002:153 |
| pipedrive_deal_cache_update_internal | UPDATE | authenticated | permissive | `public.is_internal((select auth.uid())) or public.is_admin((select auth.uid()))` | `public.is_internal((select auth.uid())) or public.is_admin((select auth.uid()))` | 20260803000002:158 |

- Triggers: none.

#### A.14 storage.objects and storage.buckets

- Supabase owns both tables. Migrations add four policies on `storage.objects` and one row in `storage.buckets` (20260721000002). RLS state, FORCE flag, grants and Supabase's own triggers on these tables are not set by any migration. Detail in section D.

#### A.15 Tables created and later dropped

| Table | Created | Dropped |
|---|---|---|
| public.server_specs | 20260515193702:78 (RLS :153, policy `server_specs_select_active_or_admin` :201, trigger `trg_server_specs_set_updated_at` :91) | 20260521190350:38 (`drop table ... cascade`) |
| public.products (uuid key version) | 20260515193702:51 (policy `products_select_active_or_admin` :190, trigger :67) | 20260521190350:39 (`drop table ... cascade`) |

#### A.16 Policy history (created, then dropped or replaced)

| # | Policy | Table | Created | Dropped | Note |
|---|---|---|---|---|---|
| 1 | partners_select_self_or_admin | partners | 20260515193702:172 | 20260615000001:50 | merged into partners_select_self_admin_internal |
| 2 | partners_update_self_or_admin (bare `auth.uid()`) | partners | 20260515193702:177 | 20260615000001:62 | recreated with `(select auth.uid())` at :64 |
| 3 | partners_select_internal v1 | partners | 20260605000003:10 | 20260605000004:11 | inline EXISTS on partners inside a partners policy, infinite recursion |
| 4 | partners_select_internal v2 | partners | 20260605000004:29 | 20260615000001:51 | used `public.is_internal(auth.uid())` |
| 5 | products_select_active_or_admin (uuid table) | products | 20260515193702:190 | 20260521190350:39 | dropped with table |
| 6 | products_select_active_or_admin (bare `auth.uid()`) | products | 20260521190350:105 | 20260615000001:76 | recreated at :78 |
| 7 | server_specs_select_active_or_admin | server_specs | 20260515193702:201 | 20260521190350:38 | dropped with table |
| 8 | submissions_select_own_or_admin | submissions | 20260515193702:212 | 20260615000001:87 | merged |
| 9 | submissions_insert_self (bare `auth.uid()`) | submissions | 20260515193702:217 | 20260615000001:105 | recreated at :107 |
| 10 | submissions_update_own | submissions | 20260527182010:58 | 20260615000001:116 | merged |
| 11 | submissions_delete_own_draft | submissions | 20260527182010:66 | 20260615000001:129 | merged |
| 12 | submissions_update_admin | submissions | 20260601000001:10 | 20260615000001:117 | merged |
| 13 | submissions_delete_admin | submissions | 20260601000001:17 | 20260615000001:130 | merged |
| 14 | submissions_select_internal | submissions | 20260604000002:12 | 20260615000001:88 | had no TO clause, so applied to PUBLIC |
| 15 | submissions_select_on_behalf_target | submissions | 20260612155238:26 | 20260615000001:89 | had no TO clause, so applied to PUBLIC |
| 16 | submissions_delete_authorized v1 (`status is null or status = 'draft'`) | submissions | 20260615000001:132 | 20260717000002:48 | recreated with `status = 'open'` at :49 |
| 17 | project_quotes_select_internal | project_quotes | 20260616000002:84 | 20260720000001:24 | replaced by project_quotes_select_internal_or_owner |

Rollback files can recreate dropped policies if run: `rls-perf-consolidation-rollback.sql` recreates #1, #2, #4, #6, #8 to #15 (lines 23-95); `project-quotes-partner-select-rollback.sql:12` recreates #17; `pipeline-status-model-reduction-rollback.sql:32` recreates #16; `step-3-4-rollback.sql:121-135` recreates `server_specs` and its policy. A live policy matching any of these names would indicate a rollback was run.

#### A.17 Applied outside migrations

1. `public.rls_auto_enable()` and event trigger `ensure_rls` existed only in production, hand-created in the SQL editor, before 20260611000001 captured them (comment 20260611000001:14-18). The capture creates the event trigger only if missing (:68-74).
2. ADR 0151 partners guard trigger and the 2026-10-16 Project Portal tables: see A2.
3. Data-only changes to `product_specs` made through service-role scripts, with no SQL file: `scripts/fix-product-specs-typos-2026-10.ts` and `scripts/fix-product-specs-decisions-2026-10.ts` (2026-10-12, commit 09ef28f), `scripts/revert-v700-v800-9135-cpu.ts` (2026-10-15, 36 writes, ADR 0149, commit a1a7d8c). All go through `scripts/product-specs-guarded-fix.ts` (REST PATCH on `product_specs`, :47-71). No access-control change. These supersede the V700/V800 CPU values in 20260914000002, so live `product_specs` values differ from a migration replay.
4. Apply-note verification SQL: `docs/apply-notes/0090-datasheet-schema.md:131-150` runs inside `begin ... rollback` (no residue); `0090-datasheet-schema.md:167` and `0096-product-specs-admin-editable.md:75` run `update public.product_specs set notes = notes where id = 'VX5-V100-32'`, which leaves `product_specs_audit` rows. No schema change.
5. No apply note records hand-run DDL or grant changes beyond the migration files themselves. Every stop-and-flag migration from 20260720000001 onward was applied by pasting the file into the dashboard SQL editor (for example `0112-0113-projects-page-schema.md:82-103`), and the CLI history is known to be out of sync (20260812000001:4-6).
6. Migrations with no file in `supabase/rollback/` (15 of 44): 20260515193702, 20260519052732, 20260529000001, 20260529000002, 20260601000001, 20260605000001, 20260605000002, 20260605000003, 20260605000004, 20260611000001, 20260717000001, 20260724000001, 20260817000001, 20260818000001, 20260818000002. Of these, 20260601000001, 20260605000003, 20260605000004 and 20260611000001 change policies, functions or EXECUTE grants. The other 29 have a matching rollback file.

---

### A2. Applied live, not in this checkout

Source: uploaded JOURNAL extract, lines 1-322 only (`959be18f-JOURNAL.md`). **Unverified from source.** None of the migration, rollback, apply-note or ADR files below exist at 6201569 (checked: `supabase/migrations/20261016000001_partners_guard_self_update.sql`, `supabase/rollback/partners-guard-self-update-rollback.sql`, `docs/apply-notes/0151-partners-guard-self-update.md`, `docs/apply-notes/0153-project-portal-schema.md`, `docs/decisions/0151-*.md`, `scripts/sync-pipedrive-companies.mts`, `src/lib/pipedrive/company-api.ts`, `src/lib/companies/sync.ts` are all absent). The leftover test persona was created at 2026-10-16 21:33:24 UTC (decoded from `rls-test-a-1792186404373`), about two hours after HEAD was committed (19:41:59 UTC), which places this work after 6201569.

| Migration (per JOURNAL) | Objects | Access model per JOURNAL | JOURNAL lines |
|---|---|---|---|
| 20261016000001_partners_guard_self_update.sql | BEFORE UPDATE trigger on `public.partners`, SECURITY INVOKER guard function (names not given in the extract) | A non-admin `authenticated` caller may change only `phone` on their own row. Allow-list: compares `to_jsonb(new)` with `to_jsonb(old)` minus allowed keys, so new columns are admin-only by default. Any other changed column raises 42501 (HTTP 403). Checks `current_user`; `service_role`, direct SQL and active admins pass. Applied by Andy 2026-10-16 in the SQL editor; live suite 88/88 after apply. | 193-253 |
| 20261016000002 | `companies`, `company_name_aliases`, `contacts`, `partner_contact_links` | Internal-only. Partners and anon have no grant a policy could open. Tables the sync writes are SELECT-only for internal users; the Step 2 sync writes as service_role. `partner_contact_links` internal-only. Composite FK keeps a link's company equal to its contact's company. | 96-123, 166-168 |
| 20261016000003 | `projects`, `project_contacts`, `project_submissions` | Internal-only. Trigger: a project's primary contact must belong to its company when set. | 99-111, 130-132 |
| 20261016000004 | `system_design_rules`, `bom_rules`, `design_rules_audit` | Rules admin-write with no delete. Admin rule edits are stamped and audited through a shared audit trigger (reads the key through `to_jsonb(new)`). Internal reads all tables except the audit. Trigger: a BOM rule SKU must exist in `products`. Seeds 3 defaults plus SFP+ pair and GPU rules. | 101-111, 121-129 |
| 20261016000005 | `deal_line_syncs`, `quote_pricing_confirmations` | No delete on either; confirmations have no update. `deal_line_syncs` carries `submission_id`, `role`, the Pipedrive deal-line id and a unique (deal, SKU, role) key; `status = 'added'` needs the attachment id; `item_price_sent > 0`. Confirmations store a fingerprint of the deal lines. | 103-111, 169-171 |
| 20261016000006_company_sync_includes.sql | `company_sync_includes` | Admin-write, internal read, no partner access; each row needs a reason. No row seeded. | 66-79 |

Related decisions recorded in the JOURNAL extract and absent from this checkout: ADR 0150 (Pipedrive retire via `is_linkable`), 0151 (guard trigger), 0152 (a project contact's login sees quotes through `on_behalf_of_partner_id`, no RLS change), 0153 to 0157. ADR 0152 relies on the existing `submissions_select_authorized` and `project_quotes_select_internal_or_owner` policies in A.3 and A.8.

Andy's pre-fix catalog check (JOURNAL 200-203) matched this replay for `partners`: table-wide UPDATE, the two policies in A.1, only `trg_partners_set_updated_at`, no extra columns, and `is_admin()` / `is_internal()` as written.

Section E queries do not filter to the tables named in section A, so these objects appear in Andy's results. E19 lists them explicitly as live-only.

---

### B. Functions (final state)

| Function | Lang | Security | Volatility | `search_path` | EXECUTE after migrations | What it does | Defined |
|---|---|---|---|---|---|---|---|
| `public.set_updated_at()` returns trigger | plpgsql | INVOKER | VOLATILE (default) | `''` (set by `alter function` 20260611000001:31) | Revoked from anon, authenticated, PUBLIC (20260611000001:82). Owner keeps it; service_role: Supabase default (assumed) | Sets `new.updated_at = now()` | 20260515193702:13 |
| `public.is_admin(uid uuid)` returns boolean | sql | DEFINER | STABLE | `public` | Revoked from PUBLIC (20260515193702:144), granted to authenticated (:145), revoked from anon, PUBLIC (20260611000001:89). Final: authenticated yes, anon no, PUBLIC no; service_role: Supabase default (assumed) | True when a `partners` row has `id = uid and role = 'admin' and status = 'active'` | 20260515193702:131 |
| `public.is_internal(uid uuid)` returns boolean | sql | DEFINER | STABLE | `public` | Revoked from PUBLIC (20260605000004:26), granted to authenticated (:27), revoked from anon, PUBLIC (20260611000001:90). Final as for `is_admin` | True when a `partners` row has `id = uid and is_internal = true`. No status or role check | 20260605000004:13 |
| `public.rls_auto_enable()` returns event_trigger | plpgsql | DEFINER | VOLATILE | `pg_catalog` | Revoked from anon, authenticated, PUBLIC (20260611000001:85) | On `ddl_command_end`, runs `alter table if exists ... enable row level security` for CREATE TABLE, CREATE TABLE AS and SELECT INTO in schema `public` | 20260611000001:35 (captured from production) |
| `public.camera_aliases_text(aliases text[])` returns text | sql | INVOKER | IMMUTABLE | not set | Never revoked: PUBLIC by Postgres default; anon, authenticated, service_role by Supabase default (assumed) | `array_to_string(aliases, ' ')`, used by the trigram expression index `camera_specs_aliases_trgm_idx` (20260615000002:54) | 20260615000002:48 |
| `public.search_camera_specs(p_vendor text, p_query text, p_limit integer default 12)` returns table(id uuid, vendor text, model text, sensor_count integer, max_width integer, max_height integer) | sql | INVOKER | STABLE | `public` | Revoked from PUBLIC, anon (20260616000001:47); granted to authenticated (:48); service_role: Supabase default (assumed) | Vendor-scoped ILIKE search over `model` and aliases, `currently_shipping` rows only, limit clamped to 1..50. `p_query` is concatenated into the ILIKE pattern without escaping `%` or `_` | 20260616000001:17 |
| `public.product_specs_stamp_updated()` returns trigger | plpgsql | INVOKER | VOLATILE | `''` | Revoked from anon, authenticated, PUBLIC (20260727000001:164) | Sets `new.updated_at := now()`, `new.updated_by := auth.uid()` | 20260727000001:125 |
| `public.product_specs_write_audit()` returns trigger | plpgsql | DEFINER | VOLATILE | `''` | Revoked from anon, authenticated, PUBLIC (20260727000001:165) | Inserts into `product_specs_audit` (`spec_id`, `changed_by = auth.uid()`, `operation = lower(tg_op)`, `before = to_jsonb(old)` on UPDATE, `after = to_jsonb(new)`) | 20260727000001:142 |
| `public.appliance_specs_stamp_updated()` returns trigger | plpgsql | INVOKER | VOLATILE | `''` | Revoked from anon, authenticated, PUBLIC (20260729000001:327) | Same as `product_specs_stamp_updated` for `appliance_specs` | 20260729000001:289 |
| `public.appliance_specs_write_audit()` returns trigger | plpgsql | DEFINER | VOLATILE | `''` | Revoked from anon, authenticated, PUBLIC (20260729000001:328) | Same as `product_specs_write_audit` into `appliance_specs_audit` | 20260729000001:305 |

- Count: 10 functions, 5 SECURITY DEFINER (`is_admin`, `is_internal`, `rls_auto_enable`, `product_specs_write_audit`, `appliance_specs_write_audit`). All 5 pin `search_path`. One function has no `search_path`: `camera_aliases_text`.
- No migration drops a function. `alter function` is used once (20260611000001:31).
- Event trigger: `ensure_rls` ON `ddl_command_end` EXECUTE FUNCTION `public.rls_auto_enable()` (20260611000001:71, created only if missing).
- Extension functions are not inventoried here. `pgcrypto` (20260515193702:7) is pre-installed by Supabase in schema `extensions`, so that statement is a no-op there. `pg_trgm` (20260615000002:36) is created without a `schema` clause; its schema depends on the session `search_path` at apply time and is most likely `public`. If so, its functions are EXECUTE-able by PUBLIC. Unverified; E7 and E18 show it.
- `is_admin(uuid)` and `is_internal(uuid)` take the user id as an argument and are SECURITY DEFINER with EXECUTE for `authenticated`, so any signed-in user can call them through PostgREST RPC with any uuid.
- The 20260611000001 header (lines 4-12) states that the earlier `revoke ... from public` statements had not removed Supabase's explicit role grants, which is why the later revokes name roles.

---

### C. Views

| View | Definition summary | `security_invoker` | Grants | Source |
|---|---|---|---|---|
| public.current_products | `select distinct on (sku) id, sku, product_name, msrp, price_type, product_group, sort_order, active, max_cameras, max_storage_tb, effective_date, pushed_to_pipedrive_at, updated_at, hidden_from_catalog from public.products where effective_date <= current_date order by sku, effective_date desc, id desc` | `on` (20260702000001:80; restated 20260818000002:35) | `authenticated` SELECT (20260702000001:99). No revoke from anon or authenticated, so anon and authenticated also hold Supabase default (assumed) privileges. Under `security_invoker = on`, anon reads still fail on `public.products`, where anon holds nothing (20260521190350:102) | Created 20260702000001:79; replaced 20260818000002:34 (adds `hidden_from_catalog`) |

- Count: 1 view, 0 materialized views. No view without `security_invoker`.
- The view is not auto-updatable (DISTINCT ON), so any default write privilege on it has no effect.

---

### D. Storage

#### D.1 Buckets

| Bucket id | Public | file_size_limit | allowed_mime_types | Source |
|---|---|---|---|---|
| partner-logos | true | not set (NULL) | not set (NULL) | 20260721000002:25-27 (`insert ... on conflict (id) do nothing`, so a pre-existing bucket of the same id keeps its prior settings) |

- Limits exist only in application code: PNG or JPEG and at most 2 MB (`src/lib/storage/partner-logo.ts:23-31`), enforced in the admin upload path, which uses the service-role client (`src/lib/storage/partner-logo.ts:69-86`, `src/app/(app)/admin/partners/actions.ts:335`).
- Object path pattern: `<partner-id>/logo.<png|jpg>` (`src/lib/storage/partner-logo.ts:59-61`).

#### D.2 storage.objects policies

| Name | Cmd | Roles | Type | USING | WITH CHECK | Source |
|---|---|---|---|---|---|---|
| partner_logos_public_read | SELECT | public | permissive | `bucket_id = 'partner-logos'` | none | 20260721000002:31 |
| partner_logos_admin_insert | INSERT | authenticated | permissive | none | `bucket_id = 'partner-logos' and public.is_admin((select auth.uid()))` | 20260721000002:38 |
| partner_logos_admin_update | UPDATE | authenticated | permissive | `bucket_id = 'partner-logos' and public.is_admin((select auth.uid()))` | `bucket_id = 'partner-logos' and public.is_admin((select auth.uid()))` | 20260721000002:44 |
| partner_logos_admin_delete | DELETE | authenticated | permissive | `bucket_id = 'partner-logos' and public.is_admin((select auth.uid()))` | none | 20260721000002:51 |

- Each policy is preceded by `drop policy if exists` of the same name (20260721000002:30, 37, 43, 50). No earlier versions exist in the migrations.
- Public-bucket object URLs are served without RLS. The `to public` SELECT policy additionally lets `anon` list object names in the bucket through the Storage API, and object names contain partner ids.

#### D.3 Buckets referenced in code or ADRs without a migration (drift candidates)

- `grep` of `src/` and `scripts/` for `.storage`, `storage.from(`, `createBucket`, `listBuckets` finds one bucket, `partner-logos` (`src/lib/storage/partner-logo.ts:18, 79-81, 95, 109`), which has a migration.
- ADR 0089 (line 94) uses that bucket. ADR 0107 (lines 12-16, 27-29) and ADR 0108 (line 33) chose `public/` paths for datasheet photos and created no bucket. ADRs 0017, 0060 and 0064 consider Storage for PDFs and park it.
- Result: no bucket is "created outside migrations (drift candidate)" from code or ADRs. E15 lists every live bucket, so any bucket other than `partner-logos` in Andy's results is drift.

---

### E. Live verification queries for Andy

**READ ONLY. These queries change nothing. Run them in the Supabase SQL editor and paste the results back.**

Notes:

- Every statement is a single SELECT. None writes, locks for write, or calls a function with side effects.
- Written for PostgreSQL 15 catalogs and desk-checked against them. They were not executed (no database access in this audit).
- The SQL editor runs as `postgres`, which bypasses RLS, so E21 to E23 see all rows.
- Unless stated, queries cover every schema except Postgres internals and Supabase-managed schemas (`auth`, `extensions`, `graphql`, `graphql_public`, `realtime`, `_realtime`, `supabase_functions`, `supabase_migrations`, `vault`, `pgsodium`, `pgsodium_masks`, `net`, `cron`, `pgbouncer`, `_analytics`, `pgmq`). That keeps `public`, `storage` and any custom schema in scope. Nothing filters to the table names in section A.
- E9 uses `information_schema`, which only shows grants where the grantor or grantee is a role the current user holds. E10 reads `pg_class.relacl` directly and is authoritative when the two differ.

| Query | Checks section |
|---|---|
| E1 Schemas | A (scope) |
| E2 Tables, RLS, FORCE RLS | A |
| E3 All policies | A, D |
| E4 All non-internal triggers | A |
| E5 Triggers on public.partners with source | A.1, A2 |
| E6 Event triggers | B |
| E7 All functions with EXECUTE for anon / authenticated / PUBLIC | B |
| E8 SECURITY DEFINER function source | B |
| E9 Table and view grants (information_schema) | A, C |
| E10 Table, view and sequence grants (catalog ACLs) | A, C |
| E11 Column-level grants (information_schema) | A |
| E12 Column-level ACLs (catalog) | A |
| E13 Default privileges | A, B, C (tests the "Supabase default (assumed)" entries) |
| E14 Views and security_invoker | C |
| E15 Buckets | D |
| E16 Objects per bucket | D |
| E17 storage policies | D |
| E18 Extensions and their schemas | B |
| E19 Relations live versus the migration set | A, A2 |
| E20 Foreign keys into and out of public.partners | A.1, F |
| E21 Leftover test personas | F |
| E22 Other leftover test rows | F |
| E23 Privileged partners rows | A.1, A2 (ADR 0151 follow-up) |
| E24 CLI migration history (optional) | A.17 |

```sql
-- READ ONLY. These queries change nothing. Run them in the Supabase SQL editor and paste the results back.

-- E1. Schemas and relation counts (section A scope)
select n.nspname                                            as schema_name,
       pg_get_userbyid(n.nspowner)                          as owner,
       count(c.oid) filter (where c.relkind in ('r', 'p'))  as tables,
       count(c.oid) filter (where c.relkind in ('v', 'm'))  as views,
       count(c.oid) filter (where c.relkind = 'S')          as sequences
from pg_namespace n
left join pg_class c on c.relnamespace = n.oid
where n.nspname !~ '^pg_(temp|toast)'
  and n.nspname not in ('pg_catalog', 'information_schema')
group by n.nspname, n.nspowner
order by n.nspname;

-- E2. Every table: RLS enabled, FORCE RLS, owner, policy count (section A)
select t.schemaname,
       t.tablename,
       t.tableowner,
       t.rowsecurity          as rls_enabled,
       c.relforcerowsecurity  as rls_forced,
       (select count(*)
          from pg_policies p
         where p.schemaname = t.schemaname
           and p.tablename  = t.tablename) as policy_count
from pg_tables t
join pg_namespace n on n.nspname = t.schemaname
join pg_class c     on c.relnamespace = n.oid and c.relname = t.tablename
where not (t.schemaname = any (array['pg_catalog','information_schema','auth','extensions','graphql','graphql_public','realtime','_realtime','supabase_functions','supabase_migrations','vault','pgsodium','pgsodium_masks','net','cron','pgbouncer','_analytics','pgmq']))
  and t.schemaname !~ '^pg_(temp|toast)'
order by t.schemaname, t.tablename;

-- E3. Every policy (sections A and D)
select schemaname,
       tablename,
       policyname,
       cmd,
       permissive,
       roles,
       qual        as using_expression,
       with_check  as with_check_expression,
       (cmd in ('UPDATE', 'ALL') and with_check is null) as update_or_all_without_with_check
from pg_policies
where not (schemaname = any (array['pg_catalog','information_schema','auth','extensions','graphql','graphql_public','realtime','_realtime','supabase_functions','supabase_migrations','vault','pgsodium','pgsodium_masks','net','cron','pgbouncer','_analytics','pgmq']))
order by schemaname, tablename, cmd, policyname;

-- E4. Every non-internal trigger with its function (section A)
select n.nspname                       as schema_name,
       c.relname                       as table_name,
       t.tgname                        as trigger_name,
       t.tgenabled                     as enabled_flag,
       pg_get_triggerdef(t.oid)        as definition,
       pn.nspname || '.' || p.proname  as function_name,
       p.prosecdef                     as function_security_definer,
       p.proconfig                     as function_settings
from pg_trigger t
join pg_class c      on c.oid = t.tgrelid
join pg_namespace n  on n.oid = c.relnamespace
join pg_proc p       on p.oid = t.tgfoid
join pg_namespace pn on pn.oid = p.pronamespace
where not t.tgisinternal
  and not (n.nspname = any (array['pg_catalog','information_schema','auth','extensions','graphql','graphql_public','realtime','_realtime','supabase_functions','supabase_migrations','vault','pgsodium','pgsodium_masks','net','cron','pgbouncer','_analytics','pgmq']))
  and n.nspname !~ '^pg_(temp|toast)'
order by 1, 2, 3;

-- E5. Triggers on public.partners, with the trigger function source (section A.1 and A2)
select t.tgname                        as trigger_name,
       t.tgenabled                     as enabled_flag,
       pg_get_triggerdef(t.oid)        as definition,
       pn.nspname || '.' || p.proname  as function_name,
       p.prosecdef                     as security_definer,
       p.proconfig                     as function_settings,
       pg_get_functiondef(p.oid)       as function_source
from pg_trigger t
join pg_proc p       on p.oid = t.tgfoid
join pg_namespace pn on pn.oid = p.pronamespace
where t.tgrelid = 'public.partners'::regclass
  and not t.tgisinternal
order by t.tgname;

-- E6. Event triggers (section B)
select e.evtname,
       e.evtevent,
       e.evtenabled,
       e.evttags,
       pg_get_userbyid(e.evtowner)     as owner,
       pn.nspname || '.' || p.proname  as function_name,
       p.prosecdef                     as security_definer,
       p.proconfig                     as function_settings
from pg_event_trigger e
join pg_proc p       on p.oid = e.evtfoid
join pg_namespace pn on pn.oid = p.pronamespace
order by e.evtname;

-- E7. Every function: language, security, volatility, settings, owner, extension, EXECUTE (section B)
select n.nspname                                   as schema_name,
       p.proname                                   as function_name,
       pg_get_function_identity_arguments(p.oid)   as args,
       l.lanname                                   as language,
       case p.prokind when 'f' then 'function' when 'p' then 'procedure'
                      when 'a' then 'aggregate' when 'w' then 'window' end as kind,
       p.prosecdef                                 as security_definer,
       case p.provolatile when 'i' then 'immutable' when 's' then 'stable'
                          when 'v' then 'volatile' end as volatility,
       p.proconfig                                 as settings,
       pg_get_userbyid(p.proowner)                 as owner,
       x.extname                                   as from_extension,
       has_function_privilege('anon',          p.oid, 'EXECUTE') as anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
       has_function_privilege('public',        p.oid, 'EXECUTE') as public_can_execute,
       p.proacl::text                              as raw_acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l  on l.oid = p.prolang
left join pg_depend d
       on d.classid = 'pg_catalog.pg_proc'::regclass
      and d.objid = p.oid
      and d.deptype = 'e'
left join pg_extension x on x.oid = d.refobjid
where not (n.nspname = any (array['pg_catalog','information_schema','auth','extensions','graphql','graphql_public','realtime','_realtime','supabase_functions','supabase_migrations','vault','pgsodium','pgsodium_masks','net','cron','pgbouncer','_analytics','pgmq']))
  and n.nspname !~ '^pg_(temp|toast)'
order by from_extension nulls first, schema_name, function_name;

-- E8. SECURITY DEFINER functions with full source (section B)
select n.nspname                                   as schema_name,
       p.proname                                   as function_name,
       pg_get_function_identity_arguments(p.oid)   as args,
       p.proconfig                                 as settings,
       pg_get_userbyid(p.proowner)                 as owner,
       pg_get_functiondef(p.oid)                   as source
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.prosecdef
  and p.prokind in ('f', 'p')
  and not (n.nspname = any (array['pg_catalog','information_schema','auth','extensions','graphql','graphql_public','realtime','_realtime','supabase_functions','supabase_migrations','vault','pgsodium','pgsodium_masks','net','cron','pgbouncer','_analytics','pgmq']))
  and n.nspname !~ '^pg_(temp|toast)'
order by 1, 2;

-- E9. Table and view grants to anon, authenticated and PUBLIC (information_schema) (sections A and C)
select table_schema,
       table_name,
       grantee,
       string_agg(privilege_type::text, ', ' order by privilege_type::text) as privileges
from information_schema.role_table_grants
where grantee::text in ('anon', 'authenticated', 'PUBLIC')
  and not (table_schema::text = any (array['pg_catalog','information_schema','auth','extensions','graphql','graphql_public','realtime','_realtime','supabase_functions','supabase_migrations','vault','pgsodium','pgsodium_masks','net','cron','pgbouncer','_analytics','pgmq']))
group by table_schema, table_name, grantee
order by table_schema, table_name, grantee;

-- E10. Table, view and sequence ACLs for anon, authenticated and PUBLIC, read from pg_class (sections A and C)
select n.nspname  as schema_name,
       c.relname  as object_name,
       case c.relkind when 'r' then 'table' when 'p' then 'partitioned table'
                      when 'v' then 'view' when 'm' then 'materialized view'
                      when 'S' then 'sequence' when 'f' then 'foreign table' end as kind,
       case a.grantee when 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end   as grantee,
       string_agg(a.privilege_type, ', ' order by a.privilege_type)               as privileges,
       c.relacl is null                                                           as acl_is_owner_default
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join lateral aclexplode(
       coalesce(c.relacl,
                acldefault(case when c.relkind = 'S' then 's' else 'r' end::"char", c.relowner))) a
where c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
  and not (n.nspname = any (array['pg_catalog','information_schema','auth','extensions','graphql','graphql_public','realtime','_realtime','supabase_functions','supabase_migrations','vault','pgsodium','pgsodium_masks','net','cron','pgbouncer','_analytics','pgmq']))
  and n.nspname !~ '^pg_(temp|toast)'
  and (a.grantee = 0 or pg_get_userbyid(a.grantee) in ('anon', 'authenticated'))
group by 1, 2, 3, 4, 6
order by 1, 2, 4;

-- E11. Column-level grants to anon, authenticated and PUBLIC that are not implied by a table-level grant (section A)
select cp.table_schema,
       cp.table_name,
       cp.column_name,
       cp.grantee,
       cp.privilege_type
from information_schema.column_privileges cp
where cp.grantee::text in ('anon', 'authenticated', 'PUBLIC')
  and not (cp.table_schema::text = any (array['pg_catalog','information_schema','auth','extensions','graphql','graphql_public','realtime','_realtime','supabase_functions','supabase_migrations','vault','pgsodium','pgsodium_masks','net','cron','pgbouncer','_analytics','pgmq']))
  and not exists (
        select 1
        from information_schema.role_table_grants tg
        where tg.table_schema   = cp.table_schema
          and tg.table_name     = cp.table_name
          and tg.grantee        = cp.grantee
          and tg.privilege_type = cp.privilege_type)
order by 1, 2, 3, 4, 5;

-- E12. Column-level ACLs read from pg_attribute (section A)
select n.nspname  as schema_name,
       c.relname  as table_name,
       a.attname  as column_name,
       case x.grantee when 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end as grantee,
       x.privilege_type
from pg_attribute a
join pg_class c     on c.oid = a.attrelid
join pg_namespace n on n.oid = c.relnamespace
cross join lateral aclexplode(a.attacl) x
where a.attacl is not null
  and a.attnum > 0
  and not a.attisdropped
  and not (n.nspname = any (array['pg_catalog','information_schema','auth','extensions','graphql','graphql_public','realtime','_realtime','supabase_functions','supabase_migrations','vault','pgsodium','pgsodium_masks','net','cron','pgbouncer','_analytics','pgmq']))
  and n.nspname !~ '^pg_(temp|toast)'
order by 1, 2, 3, 4, 5;

-- E13. Default privileges (tests every "Supabase default (assumed)" entry in sections A, B and C)
select pg_get_userbyid(d.defaclrole)               as for_objects_created_by,
       coalesce(n.nspname, '(all schemas)')        as schema_name,
       case d.defaclobjtype when 'r' then 'tables and views' when 'S' then 'sequences'
                            when 'f' then 'functions' when 'T' then 'types'
                            when 'n' then 'schemas' end as object_type,
       case a.grantee when 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee,
       string_agg(a.privilege_type, ', ' order by a.privilege_type)             as privileges
from pg_default_acl d
left join pg_namespace n on n.oid = d.defaclnamespace
cross join lateral aclexplode(d.defaclacl) a
group by 1, 2, 3, 4
order by 1, 2, 3, 4;

-- E14. Every view and materialized view with security_invoker and definition (section C)
select n.nspname                    as schema_name,
       c.relname                    as view_name,
       case c.relkind when 'v' then 'view' else 'materialized view' end as kind,
       pg_get_userbyid(c.relowner)  as owner,
       c.reloptions,
       coalesce((select o.option_value
                   from pg_options_to_table(c.reloptions) o
                  where o.option_name = 'security_invoker'), 'not set') as security_invoker,
       pg_get_viewdef(c.oid, true)  as definition
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('v', 'm')
  and not (n.nspname = any (array['pg_catalog','information_schema','auth','extensions','graphql','graphql_public','realtime','_realtime','supabase_functions','supabase_migrations','vault','pgsodium','pgsodium_masks','net','cron','pgbouncer','_analytics','pgmq']))
  and n.nspname !~ '^pg_(temp|toast)'
order by 1, 2;

-- E15. Every storage bucket (section D)
select id,
       name,
       public,
       file_size_limit,
       allowed_mime_types,
       created_at,
       updated_at
from storage.buckets
order by id;

-- E16. Object count per bucket (section D)
select bucket_id,
       count(*)         as objects,
       min(created_at)  as oldest_object,
       max(created_at)  as newest_object
from storage.objects
group by bucket_id
order by bucket_id;

-- E17. Every policy in schema storage (section D)
select tablename,
       policyname,
       cmd,
       permissive,
       roles,
       qual        as using_expression,
       with_check  as with_check_expression
from pg_policies
where schemaname = 'storage'
order by tablename, cmd, policyname;

-- E18. Installed extensions and their schemas (section B)
select e.extname,
       e.extversion,
       n.nspname  as schema_name
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
order by e.extname;

-- E19. Relations present live that no migration at 6201569 creates, and migration relations missing live (sections A and A2)
--      Empty result = no drift in the relation list. Schema storage is excluded (Supabase-managed).
with known (schema_name, rel_name) as (
  values ('public', 'access_requests'),
         ('public', 'appliance_specs'),
         ('public', 'appliance_specs_audit'),
         ('public', 'camera_specs'),
         ('public', 'competitor_products'),
         ('public', 'current_products'),
         ('public', 'partners'),
         ('public', 'pipedrive_deal_cache'),
         ('public', 'product_specs'),
         ('public', 'product_specs_audit'),
         ('public', 'products'),
         ('public', 'project_quotes'),
         ('public', 'submission_internal_archives'),
         ('public', 'submissions')
),
live as (
  select n.nspname::text  as schema_name,
         c.relname::text  as rel_name,
         case c.relkind when 'r' then 'table' when 'p' then 'partitioned table'
                        when 'v' then 'view' when 'm' then 'materialized view'
                        when 'f' then 'foreign table' end as kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p', 'v', 'm', 'f')
    and not (n.nspname = any (array['pg_catalog','information_schema','auth','extensions','graphql','graphql_public','realtime','_realtime','supabase_functions','supabase_migrations','vault','pgsodium','pgsodium_masks','net','cron','pgbouncer','_analytics','pgmq','storage']))
    and n.nspname !~ '^pg_(temp|toast)'
)
select coalesce(l.schema_name, k.schema_name) as schema_name,
       coalesce(l.rel_name, k.rel_name)       as rel_name,
       l.kind,
       case when k.rel_name is null
            then 'LIVE ONLY: no migration at 6201569 creates it'
            else 'MISSING LIVE: created by migrations at 6201569' end as status
from live l
full outer join known k
  on k.schema_name = l.schema_name
 and k.rel_name    = l.rel_name
where k.rel_name is null
   or l.rel_name is null
order by 4, 1, 2;

-- E20. Foreign keys that reference public.partners, and the ones public.partners holds, with delete action (sections A.1 and F)
select c.conrelid::regclass   as constrained_table,
       c.conname,
       c.confrelid::regclass  as referenced_table,
       case c.confdeltype when 'a' then 'NO ACTION' when 'r' then 'RESTRICT'
                          when 'c' then 'CASCADE'   when 'n' then 'SET NULL'
                          when 'd' then 'SET DEFAULT' end as on_delete,
       pg_get_constraintdef(c.oid) as definition
from pg_constraint c
where c.contype = 'f'
  and (c.confrelid = 'public.partners'::regclass
       or c.conrelid = 'public.partners'::regclass)
order by c.conrelid::regclass::text, c.conname;

-- E21. Leftover RLS test personas: every auth.users row with a test email, its partners row, and the rows that block deletion (section F)
select u.id                 as user_id,
       u.email,
       u.created_at         as user_created_at,
       u.last_sign_in_at,
       p.id is not null     as has_partner_row,
       p.company_name,
       p.contact_name,
       p.role,
       p.status,
       p.is_internal,
       (select count(*) from public.submissions s    where s.partner_id = u.id)              as submissions_created,
       (select count(*) from public.submissions s    where s.on_behalf_of_partner_id = u.id) as submissions_on_behalf_of,
       (select count(*) from public.project_quotes q where q.generated_by = u.id)            as quotes_generated
from auth.users u
left join public.partners p on p.id = u.id
where lower(u.email) like '%@arxys-rls-test.invalid'
order by u.created_at;

-- E22. Other rows the committed test-rls.ts creates and deletes, left behind by an aborted run (section F)
select 'products'              as table_name, count(*) as leftover_rows from public.products              where sku like 'RLS-TEST-%'
union all
select 'camera_specs',                        count(*)                  from public.camera_specs          where model like 'RLS-CAM%'
union all
select 'product_specs',                       count(*)                  from public.product_specs         where id like 'RLS-SPEC%'
union all
select 'product_specs_audit',                 count(*)                  from public.product_specs_audit   where spec_id like 'RLS-SPEC%'
union all
select 'appliance_specs',                     count(*)                  from public.appliance_specs       where id like 'RLS-APPL%'
union all
select 'appliance_specs_audit',               count(*)                  from public.appliance_specs_audit where spec_id like 'RLS-APPL%'
union all
select 'access_requests',                     count(*)                  from public.access_requests       where lower(email) like '%arxys-rls-test.invalid'
union all
select 'project_quotes',                      count(*)                  from public.project_quotes        where terms_version = 'v-rls-test'
union all
select 'submissions',                         count(*)                  from public.submissions           where project_name in ('self-insert-A', 'B-owned', 'RLS-step5-status-test', 'B-revise-target', 'RLS-on-behalf-test', 'on-behalf-edit-attempt', 'internal-cross-update-attempt');

-- E23. Privileged or routing-sensitive partners rows (section A.1; ADR 0151 follow-up)
select id,
       company_name,
       contact_name,
       role,
       status,
       is_internal,
       pipedrive_user_id,
       logo_path,
       created_at,
       updated_at
from public.partners
where role = 'admin'
   or is_internal
   or pipedrive_user_id is not null
order by updated_at desc;

-- E24 (optional). Migration versions the Supabase CLI recorded. Fails with "relation does not exist" if the CLI never wrote history; run it on its own.
select version
from supabase_migrations.schema_migrations
order by version;
```

---

### F. test-rls.ts coverage map

#### F.1 Persona lifecycle

- **Creation** (`provisionPersona`, test-rls:38-79): `admin.auth.admin.createUser` with `email_confirm: true` and email `rls-test-${suffix}-${Date.now()}@arxys-rls-test.invalid` (:45-53); a `partners` row inserted through the service-role client with `company_name` `RLS Test Co ${suffix}`, and `role`, `status`, `is_internal` from options (:59-67); a fresh anon-key client signed in with the generated password (:69-76). The password is generated at run time and never stored in the repo. Credentials come from `src/lib/env` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; test-rls:17-19). The script has no target check or confirmation prompt; it acts on whatever project those variables name.
- **Personas**: A and B (partners), ADMIN (`role = 'admin'`), INT (`is_internal = true`, `role = 'partner'`), created at test-rls:118-122.
- **Teardown** (`teardownPersona`, test-rls:81-85): delete `submissions` where `partner_id = p.id`, delete the `partners` row, `auth.admin.deleteUser`. Return values and errors from all three calls are ignored. Called for A, B, ADMIN, INT in that order from the `finally` block (test-rls:1885-1890).
- **Env gates**: `RUN_0083_TESTS === "1"` gates tests 20a-20g on `project_quotes` owner visibility (test-rls:976-1121). No other env flag exists in the committed file. Per the uploaded JOURNAL (lines 214-215), local block 23 ran behind `RUN_0151_TESTS=1` until the guard was applied and now runs on every run; that flag is absent from this checkout.

#### F.2 Leftover-persona code paths (committed file, by reading; not executed)

1. **Provisioning sits outside `try`.** The four `provisionPersona` calls (test-rls:118-122) run before `try` opens at :124. If any call throws, personas already created are never torn down; `run()` rejects into `.catch` (:1909-1912). Inside `provisionPersona`, a failure after `createUser` (partners insert at :59-67 or sign-in at :72-76) leaves that auth user, and its `partners` row if the insert succeeded.
2. **No signal handling.** Nothing handles SIGINT or SIGTERM. A killed or interrupted process skips `finally`, leaving all four personas and any rows seeded so far.
3. **Persona A cannot be deleted on a normal run.** The on-behalf row seeded at test-rls:587-608 has `partner_id = internalPersona.id` and `on_behalf_of_partner_id = a.id`. No code deletes it before teardown. Teardown runs A first (:1886); `teardownPersona(a)` deletes only rows where `partner_id = a.id` (:82). The `partners` delete for A then violates `submissions.on_behalf_of_partner_id` (no ON DELETE action, 20260604000001:23), and `deleteUser(a.id)` cascades to `partners` (20260515193702:28) and hits the same FK. Both errors are ignored. The row is removed later by `teardownPersona(internalPersona)` (:1889), after A's attempt has already failed. Result by reading: every run that reaches test-rls:589 leaves persona A (`rls-test-a-<ms>@arxys-rls-test.invalid`, auth user plus `partners` row). Not verified live. E21 shows how many such users exist and E20 shows the live delete action on that FK. This applies to the file at 6201569; the JOURNAL extract (line 249) records later local changes to persona resets in block 23.
4. **Restrict FKs after a mid-block throw.** `project_quotes.submission_id` and `generated_by` are ON DELETE RESTRICT (20260616000002:37, :55). Throw sites inside `try`: `seedSubmission` (:110-112), the non-null assertion `seeded!.id` (:474), and the explicit throw (:604-606). A throw after the quote seed at :839-844 and before its cleanup at :967 (or between :995 and :1115 in the gated block) leaves quote rows, so teardown of B (owner of the quoted submission) and INT (`generated_by`) fails silently and both personas remain.
5. **Non-persona rows left by an aborted run** (cleanup line in brackets): `products` `RLS-TEST-INACTIVE-*` (:296-307 [:317]); `camera_specs` `RLS-CAM%` (:677-684 [:820]); `access_requests` emails `%@arxys-rls-test.invalid` (:1135-1144 [:1263-1266]); `product_specs` `RLS-SPEC%` and its audit rows (:1317-1319 [:1571-1572]); `appliance_specs` `RLS-APPL%` and its audit rows (:1611-1613 [:1882-1883]). `product_specs` RLS-SPEC rows are readable by every partner while present (policy `true`). E22 counts them.
6. **Known leftover.** `rls-test-a-1792186404373@arxys-rls-test.invalid` ("RLS Hijack Co") was created 2026-10-16 21:33:24 UTC, after HEAD. The string "RLS Hijack Co" appears nowhere in this commit; the committed file names persona A's company `RLS Test Co A` (:61). The uploaded JOURNAL (lines 51-54) calls it a leftover from an interrupted run, and lines 228-229 record that local block 23 changed partner A before the guard was applied. Both are outside this checkout.

#### F.3 Notes on test numbering

- Test id `12` is used twice: submissions `is_preferred` update (test-rls:341-354) and the camera_specs block `12a-12g` (:672-821).
- Ids `20a-20h` are used twice: the gated ADR 0083 project_quotes block `20a-20g` (:1002-1110) and the access_requests block `20a-20h` (:1150-1260). Citations below include line numbers to disambiguate.
- Test 8c (:487-509) runs after test 18.

#### F.4 Coverage by table and policy

Columns: **Partner allowed** (the partner's own access the policy grants), **Partner denied** (cross-partner or role denial), **Internal**, **Admin**, **Anon**. "GAP" means no case in the committed file. All lines are `test-rls:` lines.

**public.partners**

| Policy / command | Partner allowed | Partner denied | Internal | Admin | Anon |
|---|---|---|---|---|---|
| partners_select_self_admin_internal (SELECT) | 6a :125-141, 6b :143-156 (own row only) | 6a, 6b (no other rows returned) | GAP (internal reading all partners) | 8a :231-246 allowed; 8c :487-509 suspended admin sees only self | GAP |
| partners_update_self_or_admin (UPDATE) | GAP (self-update) | GAP (update of another partner's row) | GAP | GAP (the status flips at :492, :796, :1326 use the service-role client, which bypasses RLS) | GAP |
| INSERT, DELETE (ungranted) | n/a | GAP | GAP | GAP | GAP |
| Column guards (none in migrations): `role`, `is_internal`, `status`, `company_name`, `contact_name`, `logo_path`, `pipedrive_user_id`, `created_at` | n/a | GAP for every column | GAP (internal self-promotion to admin) | GAP (admin may change them) | n/a |

Per the uploaded JOURNAL (lines 214-221), Andy's local `test-rls.ts` has **block 23a-23k, not in this checkout**: partner cannot change own `role`, `is_internal`, `pipedrive_user_id`, `company_name`, `logo_path`; suspended partner cannot reactivate; internal user cannot make itself admin; partner can change own `phone`; partner cannot update another partner's row; admin JWT and service_role can change all guarded columns. `contact_name` and `created_at` are not named in that list.

**public.products and public.current_products**

| Policy / command | Partner allowed | Partner denied | Internal | Admin | Anon |
|---|---|---|---|---|---|
| products_select_active_or_admin (SELECT) | 9a :265-291 (active rows) | 9b :293-318 (inactive row hidden) | GAP | GAP (admin sees inactive rows) | GAP |
| INSERT, UPDATE, DELETE (ungranted) | n/a | GAP | GAP | GAP | GAP |
| current_products (view, security_invoker) | GAP | GAP | GAP | GAP | GAP |

**public.submissions**

| Policy / command | Partner allowed | Partner denied | Internal | Admin | Anon |
|---|---|---|---|---|---|
| submissions_select_authorized (SELECT) | 7c :202-229 own; 8h :610-621 and 8j :636-650 on-behalf target | 7c, 8g :566-578, 18 :451-485 cross-partner; 8i :623-634 unrelated partner on on-behalf row | 8d :520-535 allowed | 8b :248-263 allowed; suspended admin GAP | GAP |
| submissions_insert_self (INSERT) | 7a :158-180 | 7b :182-200 (partner_id of B) | GAP | GAP (no admin branch; admin inserting for another partner) | GAP |
| submissions_update_authorized (UPDATE) | 11 :326-339 status; 12 :341-354 is_preferred | 13 :356-374 cross-partner; 8k :652-671 on-behalf target cannot update | 8e :537-550 denied cross-partner | GAP (admin updating another partner's row) | GAP |
| submissions_update_authorized WITH CHECK (moving own row to another partner_id) | n/a | GAP | GAP | n/a | n/a |
| submissions_delete_authorized (DELETE) | 15 :396-409 own open | 14 :376-394 own lost; 16 :411-429 own won; 17 :431-449 cross-partner | 8f :552-564 denied cross-partner | GAP (admin deletes any status) | GAP |
| Column writes without a guard: `on_behalf_of_partner_id` (INSERT or UPDATE), `parent_submission_id`, `pipedrive_deal_id`, price totals | n/a | GAP | n/a | n/a | n/a |
| Delete-guard bypass (update own won/lost to open, then delete) | n/a | GAP | n/a | n/a | n/a |
| Suspended internal user still reads all rows (`is_internal` has no status check) | n/a | n/a | GAP | n/a | n/a |

**public.product_specs** (block 21)

| Command | Partner | Internal | Admin | Anon |
|---|---|---|---|---|
| SELECT product_specs_select_all | allowed 21a :1331-1342 | allowed 21b :1344-1355 | covered indirectly by 21h | GAP |
| INSERT product_specs_insert_admin | denied 21c :1357-1367 | denied 21d :1369-1381 | allowed 21h :1447-1458 | GAP |
| UPDATE product_specs_update_admin | denied 21e :1383-1403 | denied 21f :1405-1426 | allowed 21j :1480-1500 | GAP |
| DELETE (ungranted) | denied 21g :1428-1445 | GAP | denied 21i :1460-1478 | GAP |
| Triggers | n/a | n/a | stamp 21j; audit 21k :1502-1524 | n/a |

**public.product_specs_audit**

| Command | Partner | Internal | Admin | Anon |
|---|---|---|---|---|
| SELECT product_specs_audit_select_admin | denied 21l :1526-1538 | GAP | allowed 21n :1555-1566 | GAP |
| INSERT (ungranted) | denied 21m :1540-1553 | GAP | GAP | GAP |
| UPDATE, DELETE (ungranted) | GAP | GAP | GAP | GAP |

**public.competitor_products**: no case of any kind. SELECT for partner, internal, admin, anon and the denied writes are all GAP.

**public.camera_specs** (block 12a-12g)

| Command | Partner | Internal | Admin | Anon |
|---|---|---|---|---|
| SELECT camera_specs_select_all | allowed 12a :689-700 | allowed 12b :702-713 | GAP | GAP |
| INSERT camera_specs_insert_admin | denied 12c :715-730 | denied 12d :732-749 | allowed 12g :792-816 | GAP |
| UPDATE camera_specs_update_admin | denied 12e :751-771 | GAP | GAP | GAP |
| DELETE camera_specs_delete_admin | denied 12f :773-790 | GAP | GAP | GAP |
| RPC search_camera_specs | GAP | GAP | GAP | GAP (EXECUTE revoked from anon) |

**public.project_quotes** (block 19, gated block 20 at :976)

| Command | Partner | Internal | Admin | Anon |
|---|---|---|---|---|
| SELECT project_quotes_select_internal_or_owner | non-owner denied 19a :846-857; owner allowed 20a :1002-1013 and 20e :1069-1081 (gated); on-behalf target allowed 20c :1034-1046 and 20g :1098-1110 (gated); cross-partner denied 20b :1015-1032 and 20f :1083-1096 (gated) | allowed 19b :859-870 | allowed 19c :872-883 | GAP |
| INSERT project_quotes_insert_internal | denied 19d :885-895; owner denied 20d :1048-1059 (gated) | self allowed 19e :897-908; spoofed `generated_by` denied 19f :910-921 | GAP | GAP |
| UPDATE (ungranted) | GAP | denied 19g :923-943 | GAP | GAP |
| DELETE (ungranted) | GAP | denied 19h :945-963 | GAP | GAP |
| Owner path opened by a partner setting `on_behalf_of_partner_id` on its own submission | GAP | n/a | n/a | n/a |

The owner-visibility cases run only with `RUN_0083_TESTS=1`. Without it, nothing in the run asserts the widened policy that is live.

**public.access_requests** (block 20a-20h at :1123-1267)

| Command | Partner | Internal | Admin | Anon |
|---|---|---|---|---|
| SELECT access_requests_select_admin_internal | denied 20c :1176-1186 | allowed 20d :1188-1199 | allowed 20e :1201-1212 | denied 20b :1164-1174 |
| UPDATE access_requests_update_admin_internal | denied 20f :1214-1232 | allowed 20g :1234-1246 | allowed 20h :1248-1260 | GAP |
| INSERT (ungranted) | GAP | GAP | GAP | denied 20a :1150-1162 |
| DELETE (ungranted) | GAP | GAP | GAP | GAP |

**public.appliance_specs** (block 22)

| Command | Partner | Internal | Admin | Anon |
|---|---|---|---|---|
| SELECT appliance_specs_select_all | allowed 22a :1618-1630 | allowed 22b :1632-1643 | covered indirectly by 22h | GAP |
| INSERT appliance_specs_insert_admin | denied 22c :1645-1655 | denied 22d :1657-1669 | allowed 22h :1737-1751 | GAP |
| UPDATE appliance_specs_update_admin | denied 22e :1671-1691 | denied 22f :1693-1714 | allowed 22j :1777-1809 | GAP |
| DELETE (ungranted) | denied 22g :1716-1735 | GAP | denied 22i :1753-1775 | GAP |
| Triggers | n/a | n/a | stamp 22j; audit 22k :1811-1836 | n/a |

**public.appliance_specs_audit**

| Command | Partner | Internal | Admin | Anon |
|---|---|---|---|---|
| SELECT appliance_specs_audit_select_admin | denied 22l :1838-1850 | GAP | allowed 22n :1867-1878 | GAP |
| INSERT (ungranted) | denied 22m :1852-1865 | GAP | GAP | GAP |
| UPDATE, DELETE (ungranted) | GAP | GAP | GAP | GAP |

**public.submission_internal_archives**: no case of any kind. All four policies (SELECT, INSERT with `archived_by` check, UPDATE, DELETE) are GAP for partner, internal, admin and anon.

**public.pipedrive_deal_cache**: no case of any kind. All three policies and the ungranted DELETE are GAP for partner, internal, admin and anon.

**storage.objects (partner-logos)**: no case of any kind. Anon read and list, partner upload denied, admin upload, update and delete are all GAP.

**Functions**: anon EXECUTE denial on `is_admin`, `is_internal`, `search_camera_specs` is GAP. An authenticated RPC call to `is_admin` or `is_internal` with another user's id is GAP. `is_admin` status gate: covered for `partners` SELECT only (8c :487-509). `is_internal` with a suspended internal user: GAP.

**Live-only tables (A2)**: per the uploaded JOURNAL (lines 117-123, 75-76), Andy's local `test-rls.ts` has **block 24 (24 to 24h, plus 24i), not in this checkout**, covering partner, partner linked to a contact, anon, internal, admin and service_role on the 13 tables from 20261016000002 to 20261016000006. Coverage cannot be mapped from source.

---

### G. Gaps list

Structural anomalies (from sections A to D):

1. `public.partners`: `authenticated` holds table-wide UPDATE (20260515193702:163) and the only UPDATE policy restricts which rows change and places no limit on columns (20260615000001:64); no migration at 6201569 guards any column, so a partner can set own `role`, `is_internal`, `status`, `company_name`, `contact_name`, `logo_path`, `pipedrive_user_id`. Live guard trigger per JOURNAL 2026-10-16 (20261016000001), not in this checkout.
2. `public.submissions`: `authenticated` holds table-wide INSERT and UPDATE (20260515193702:166, 20260527182010:50); policies limit rows only, so the owner writes any column, including `on_behalf_of_partner_id`, `parent_submission_id`, `pipedrive_deal_id`, `status`, price totals (20260615000001:107, :119).
3. Setting `on_behalf_of_partner_id` on an own submission grants the named partner SELECT on that submission (20260615000001:98) and on its project_quotes (20260720000001:36-39).
4. The partner delete guard `status = 'open'` (20260717000002:53) can be passed by the owner, who may first UPDATE `status` back to `open` (20260615000001:119-123).
5. `public.is_internal(uuid)` checks no `status` (20260605000004:20-23), while `is_admin` requires `status = 'active'` (20260515193702:140). A suspended internal user keeps internal reads and writes on partners, submissions, project_quotes, access_requests, submission_internal_archives, pipedrive_deal_cache.
6. `is_admin(uuid)` and `is_internal(uuid)` are SECURITY DEFINER, take the uid as an argument, and are EXECUTE-able by `authenticated` (20260515193702:145, 20260605000004:27): any signed-in user can test any uuid for admin or internal status by RPC.
7. `public.camera_aliases_text(text[])` has no `search_path` and EXECUTE was never revoked; executable by PUBLIC, and by anon and authenticated under Supabase defaults (assumed) (20260615000002:48-52).
8. `public.current_products` has no revoke from `anon`; anon holds Supabase default (assumed) privileges on the view. Reads still fail through `security_invoker = on` (20260702000001:79-99, 20260818000002:34).
9. `pg_trgm` is created without a schema clause (20260615000002:36); if it landed in `public`, its functions are EXECUTE-able by PUBLIC and anon. Unverified (E18).
10. `storage.objects` policy `partner_logos_public_read` is `to public` with only a bucket filter (20260721000002:31-34), which lets anon list object names; names start with the partner id (`src/lib/storage/partner-logo.ts:59-61`).
11. Bucket `partner-logos` has no `file_size_limit` or `allowed_mime_types` (20260721000002:25-27); limits live only in app code (`src/lib/storage/partner-logo.ts:23-31`).
12. No table sets FORCE ROW LEVEL SECURITY (all 13 tables).
13. Sequences `products_id_seq` (20260702000001:36), `product_specs_audit_id_seq` (20260727000001:93), `appliance_specs_audit_id_seq` (20260729000001:258) get no explicit grant or revoke; Supabase default (assumed).
14. `public.rls_auto_enable()` and event trigger `ensure_rls` were hand-created in production before being captured, and the capture is conditional (20260611000001:14-18, :68-74).
15. Two historical SELECT policies applied to PUBLIC (20260604000002:12, 20260612155238:26) until rescoped (20260615000001:91). Historical only.
16. Four migrations that change policies, functions or EXECUTE grants have no rollback file: 20260601000001, 20260605000003, 20260605000004, 20260611000001.
17. Live state differs from a migration replay for `product_specs` V700/V800 CPU values and the V400 bandwidth, changed by service-role scripts outside migrations (`scripts/revert-v700-v800-9135-cpu.ts`, `scripts/fix-product-specs-decisions-2026-10.ts`, `scripts/fix-product-specs-typos-2026-10.ts`).
18. Section A2 objects (guard trigger and 13 tables from 20261016000001 to 20261016000006) are applied live and absent from this checkout; nothing about them is verifiable from source.

Structural checks that found nothing: no UPDATE or ALL policy without WITH CHECK; no SECURITY DEFINER function without `search_path` (5 of 5 set); no table with RLS enabled and no policies; no view without `security_invoker`; no RESTRICTIVE policy; no column-level grant.

test-rls.ts (committed file at 6201569):

19. Persona provisioning runs outside `try` (test-rls:118-122); a failed provision leaves earlier personas.
20. No SIGINT or SIGTERM handling; an interrupted run skips `finally` (test-rls:1885-1890).
21. Teardown ignores every error (test-rls:81-85).
22. Persona A is left behind on every run that reaches test-rls:589: the on-behalf row (test-rls:587-608) still references A when A is torn down first (test-rls:1886), and `submissions.on_behalf_of_partner_id` has no ON DELETE action (20260604000001:23). By reading; unverified live (E20, E21).
23. A throw between quote seed and cleanup (test-rls:839-967 or :995-1115) leaves `project_quotes` rows whose RESTRICT FKs (20260616000002:37, :55) block teardown of B and INT.
24. Test ids `12` and `20a-20h` are each used for two different blocks (test-rls:341, :672; :1002-1110, :1150-1260).
25. The ADR 0083 owner-visibility tests run only with `RUN_0083_TESTS=1` (test-rls:976).
26. Blocks 23 (partners guard, 23a-23k) and 24 (live-only tables, 24 to 24i) exist in Andy's local `test-rls.ts` per the JOURNAL and are not in this checkout.

Coverage GAPs (no case in the committed file):

27. partners SELECT: internal reads all rows; anon.
28. partners UPDATE: self-update allowed; cross-partner update denied; internal denied; admin updates another row; anon.
29. partners INSERT and DELETE denied for partner, internal, admin, anon.
30. partners column guards: `role`, `is_internal`, `status`, `company_name`, `contact_name`, `logo_path`, `pipedrive_user_id`, `created_at` (local block 23 covers some, per JOURNAL).
31. products: internal SELECT; admin sees inactive rows; anon; denied INSERT, UPDATE, DELETE for every role.
32. current_products view: every role.
33. submissions SELECT: anon; suspended admin; suspended internal.
34. submissions INSERT: internal; admin for another partner; anon; partner-set `on_behalf_of_partner_id`.
35. submissions UPDATE: admin on another partner's row; WITH CHECK moving `partner_id`; unguarded columns (`on_behalf_of_partner_id`, `parent_submission_id`, `pipedrive_deal_id`, totals); anon.
36. submissions DELETE: admin on any status; delete-guard bypass by status update; anon.
37. product_specs: internal DELETE; anon.
38. product_specs_audit: internal SELECT; INSERT by internal and admin; UPDATE and DELETE by every role; anon.
39. competitor_products: every policy, every role.
40. camera_specs: internal UPDATE and DELETE; admin UPDATE and DELETE; admin SELECT; anon; `search_camera_specs` RPC.
41. project_quotes: admin INSERT; partner and admin UPDATE and DELETE; anon; owner path opened by a partner-set `on_behalf_of_partner_id`.
42. access_requests: INSERT by partner, internal, admin; DELETE by every role; anon UPDATE.
43. appliance_specs: internal DELETE; anon.
44. appliance_specs_audit: internal SELECT; INSERT by internal and admin; UPDATE and DELETE by every role; anon.
45. submission_internal_archives: all four policies, every role.
46. pipedrive_deal_cache: all three policies and ungranted DELETE, every role.
47. storage.objects partner-logos: all four policies, every role, including anon listing.
48. Functions: anon EXECUTE denial on `is_admin`, `is_internal`, `search_camera_specs`; authenticated RPC on `is_admin` / `is_internal` with another uid; `is_internal` for a suspended user.

---

# Appendix B: Security reviewer report (security-review, xhigh)

Reproduced verbatim. Finding S-n here is B1-S-n in the backlog.

## Security review: Baseline Slice 1, data and access layer

> **BANNER: ACT FIRST (no key to rotate; two holes are exploitable in production today if live matches the repo on these points)**
>
> 1. **Any signed-in partner can overwrite any Pipedrive deal (S-2).** A partner PATCHes `pipedrive_deal_id` on their own `submissions` row through the REST API, then submits a calculator revision of that row. The server calls `updateDealFromRevision()` on the chosen deal id, which rewrites its value, portal fields and portal URL and pins a note. Deal ids are small sequential integers. The ADR 0151 guard covers `partners` only, so this stays open after the 2026-10-16 fix. First step: run the detection queries in Andy action item 3, then put the S-2 fix in the next build session. No safe SQL-only stopgap exists, because the calculator writes `pipedrive_deal_id` with the partner's own client.
> 2. **A suspended internal user keeps cross-partner read access through REST (S-3).** `is_internal()` ignores `status`, and suspension never bans the Supabase Auth account. Run the suspended-internal query in action item 3. Ban or delete any such account in Supabase Auth until `is_internal()` gains `status = 'active'`.
> 3. **The leftover "RLS Hijack Co" persona may be an active admin (S-6).** The 2026-10-16 JOURNAL says the pre-apply run left persona A as an admin, and this commit's teardown can never delete persona A. Check its `role`, `is_internal` and `status` (action item 3) and delete it.

### Header

- **Commit:** 6201569aebc78e65ab199a719490ea743e5e5235, branch `claude/group-1-audit-preflight-n8s0yw`. Tracked tree clean. `docs/reviews/` was untracked at review start (holds `BASELINE-PLAN.md`). The clone is shallow: `git log --all` shows 50 commits, so the history checks below cover only those.
- **Mode:** area mode, baseline (cap 20). Whole base portal as committed, all migrations replayed in filename order.
- **Files in scope, all read:** 44 files in `supabase/migrations/`, 29 in `supabase/rollback/`, 10 in `docs/apply-notes/`, `scripts/test-rls.ts` (read only, never run), `supabase/config.toml` (seed path only). No seed SQL exists (`[db.seed] sql_paths = ["./seed.sql"]`, file absent).
- **Read outside the slice, only to trace a call:** `src/app/(app)/layout.tsx`, `src/app/(app)/admin/partners/actions.ts`, `src/lib/auth/require-admin-or-internal.ts`, `src/app/(app)/calculator/actions.ts`, `src/app/(app)/admin/submissions/actions.ts`, `src/app/(app)/submissions/actions.ts`, `src/lib/pipedrive/deal.ts`, `src/app/(app)/api/submissions/[id]/pdf/route.ts`, `src/lib/pdf/render.ts`, `src/lib/pdf/partner-resolution.ts`, `src/lib/project-quote/{assemble,generate,types}.ts`, `src/lib/storage/partner-logo.ts`, `scripts/push-prices.ts` (grep), `src/lib/projects/pipedrive-cache.ts` (grep), `src/app/(auth)/login/request-access-actions.ts` and `src/app/(app)/admin/requests/*` (grep), `package.json`. Also `docs/JOURNAL.md` by grep only, and lines 1 to 322 of the uploaded JOURNAL `/root/.claude/uploads/0daee0d4-8e3a-58e6-a1a7-f614d5e59a34/959be18f-JOURNAL.md` (the unpushed 2026-10-16 entries).
- **ADRs relied on:** 0010, 0021, 0022, 0023 and 0053, 0055 (read in full); 0037, 0045, 0054, 0059, 0060, 0061, 0076, 0077, 0083, 0089, 0093, 0096, 0107, 0112, 0113, 0118 (read by targeted grep). ADRs 0150 to 0157 are absent from this commit; their content is known only from the uploaded JOURNAL.
- **Versions seen (package.json, node_modules absent):** next 16.2.6, @supabase/ssr ^0.10.3, @supabase/supabase-js ^2.105.4, react 19.2.4. Framework advisories belong to Slice 2.
- **Assumption on grants:** Supabase default privileges grant ALL on new `public` tables, views and sequences, and EXECUTE on new functions, to `anon`, `authenticated` and `service_role` (ADR 0053 confirms this for functions). Every table migration here runs `revoke all ... from anon, authenticated` and re-grants narrowly. The `current_products` view and `camera_aliases_text()` skip the revoke.
- **Secret check on slice files:** grep for JWT-shaped strings, `sb_secret`, service-role assignments and 40-hex tokens in `supabase/`, `docs/apply-notes/` and `test-rls.ts` found nothing. The apply notes name env vars and print two Pipedrive user ids (`0118` note), which are identifiers and carry no secret.

#### Effective policy matrix (committed migrations replayed; live may differ, see S-1)

| Object | RLS | anon | authenticated grant | SELECT | INSERT (CHECK) | UPDATE (USING / CHECK) | DELETE | Triggers, definer fns |
|---|---|---|---|---|---|---|---|---|
| partners | on | none | SELECT, UPDATE (all columns) | self OR is_admin OR is_internal | none | self OR is_admin / same | none | `trg_partners_set_updated_at`; read by `is_admin`, `is_internal`. Live adds the ADR 0151 guard (not in repo) |
| submissions | on | none | SELECT, INSERT, UPDATE, DELETE (all columns) | own OR admin OR internal OR on_behalf = self | partner_id = self | own OR admin / same | (own AND status='open') OR admin | none |
| products | on | none | SELECT | active OR admin (all dates) | service_role | service_role | service_role | set_updated_at |
| current_products (view) | security_invoker=on | default ALL, not revoked | SELECT plus default ALL | via products RLS | n/a | n/a | n/a | |
| product_specs | on | none | SELECT, INSERT, UPDATE | true | admin | admin / admin | none | stamp (invoker), audit (definer) |
| product_specs_audit | on | none | SELECT | admin | none | none | none | written by definer trigger |
| appliance_specs / _audit | on | none | same shape as product_specs / _audit | | | | | same pair |
| competitor_products | on | none | SELECT | true | none | none | none | |
| camera_specs | on | none | S, I, U, D | true | admin | admin / admin | admin | |
| project_quotes | on | none | SELECT, INSERT | internal OR admin OR EXISTS(own or on-behalf submission) | (internal OR admin) AND generated_by = self | ungranted | ungranted | |
| access_requests | on | none | SELECT, UPDATE | admin OR internal | ungranted (service_role) | admin OR internal / same | ungranted | |
| submission_internal_archives | on | none | S, I, U, D | internal OR admin | (internal OR admin) AND archived_by = self | same / + archived_by = self | internal OR admin | |
| pipedrive_deal_cache | on | none | S, I, U | internal OR admin | internal OR admin | same / same | ungranted | |
| storage.objects, bucket `partner-logos` (public) | on | SELECT via policy `to public` | | bucket match (anon included) | admin | admin / admin | admin | |

Functions: `set_updated_at()` invoker, `search_path=''`, EXECUTE revoked. `is_admin(uuid)` DEFINER, `search_path=public`, EXECUTE authenticated, checks `role='admin' AND status='active'`. `is_internal(uuid)` DEFINER, `search_path=public`, EXECUTE authenticated, **no status check**. `rls_auto_enable()` DEFINER, `search_path=pg_catalog`, revoked, backs event trigger `ensure_rls`. `camera_aliases_text(text[])` invoker, no `search_path`, EXECUTE left at default (anon). `search_camera_specs(text,text,int)` invoker, `search_path=public`, authenticated only. Four `*_stamp_updated` / `*_write_audit` trigger functions, `search_path=''`, revoked (audit ones DEFINER). `pg_trgm` is created without a schema (`20260615000002:36`), so its functions most likely sit in `public`. Views: only `current_products`, `security_invoker = on`. Every UPDATE policy carries WITH CHECK. No policy or function reads `user_metadata` or `app_metadata`. No auth-schema trigger provisions `partners` rows.

#### Claims checked

1. **ADR 0151 guard exists in this commit: REFUTED.** `git ls-files` has no `20261016*` migration, no guard rollback, no `0151` apply note, and `docs/decisions` stops at 0149. `git log --all` (50 commits, shallow) and `git grep` of HEAD find no reference to 0150 or 0151. The fix is live per the uploaded JOURNAL lines 193 to 253. **What the committed migrations let a partner change on their own `partners` row** (table-wide UPDATE grant `20260515193702_initial_schema.sql:163`; policy `20260615000001_rls_perf_consolidation.sql:64-68`, USING and CHECK `id = auth.uid() OR is_admin`):
   - `id`: no (WITH CHECK pins it).
   - `role`: yes, to `admin`. `is_admin()` then returns true while `status='active'`, which opens every admin policy and every app gate that reads `partners.role` (`requireAdmin`, `admin/partners/actions.ts:28-48`), which in turn run service-role actions.
   - `is_internal`: yes. Opens cross-partner reads on partners, submissions, project_quotes, access_requests (plus UPDATE), the internal side tables, and on-behalf calcs for any partner (`calculator/actions.ts:195`).
   - `status`: yes. A suspended user can reactivate; an invited user can self-activate.
   - `company_name`, `contact_name`: yes. They feed the name-based Pipedrive org and person upserts and every "Prepared for" label.
   - `pipedrive_user_id`: yes. `calculator/actions.ts:687` routes the deal owner to any Pipedrive user id for any caller.
   - `logo_path`: yes. A partner can point it at another partner's logo object.
   - `phone`: yes (intended). `created_at`: yes (cosmetic). `updated_at`: overwritten by the trigger.
   - After self-promotion the partner can update every column of every partner row.
   - Other write paths into `partners`: authenticated has no INSERT or DELETE grant; no SECURITY DEFINER function writes `partners`; the only committed trigger is `set_updated_at`. The remaining paths are service-role code (layout auto-activate, `/admin/partners` actions, bootstrap script; inventory belongs to Slice 2) and the admin branch of the RLS policy (S-12).
2. **ADR 0055, consolidation is authorization-neutral: CONFIRMED for the predicates.** For each (table, command) the consolidated predicate equals the OR of the dropped ones, including UPDATE, where Postgres ORs both USING and WITH CHECK across permissive policies. Moving `submissions_select_internal` from an inline EXISTS to `is_internal()` is equivalent, because a caller can always read their own `partners` row. Re-scoping two policies to `authenticated` changed nothing for anon (no grant). Caveats: "neutral" carried the partners self-update hole forward, and the JOURNAL line 6689 claim that a green `test-rls.ts` "confirms" neutrality cannot cover partners UPDATE, which no test exercised.
3. **ADR 0053, function EXECUTE hardened: PARTLY CONFIRMED.** True on 2026-06-11 for the four named functions (`20260611000001:31,82-90`). Later functions mostly follow the pattern (`search_camera_specs`, the four trigger functions), but `camera_aliases_text()` (`20260615000002:48-52`) has no revoke and no pinned `search_path`, `pg_trgm` landed in `public`, and no `ALTER DEFAULT PRIVILEGES` stops the next function from being anon-executable. The kept `authenticated` EXECUTE on `is_admin(uuid)` / `is_internal(uuid)` creates a role oracle (S-8), so the advisor flag is more than a false positive.
4. **JOURNAL: test-rls.ts covers each table's partner-denied and internal-allowed cases: REFUTED.** See the coverage map in S-7. Specific JOURNAL statements that do not hold at this commit: "No cross-partner reads possible (verified by scripts/test-rls.ts)" (line 8785) while partners UPDATE was untested and allowed self-promotion to admin; "Seeded with partner_id = internalPersona so existing teardown cleans it" (line 6840), which is false (S-6); and the planned "suspended-partner read denial, invited-partner read" cases (line 8765) were never written.

### Verdict

**BLOCK.** Replayed in order, the committed migrations still contain the Critical partners self-escalation, and two High holes (cross-partner Pipedrive deal tampering, suspended internal read access) are open in this commit and very likely live.

### Plain-language summary

Any partner with a portal login can make the portal overwrite another company's deal in Pipedrive by changing one hidden number on their own quote and then revising it. Arxys staff who are suspended keep reading every partner's quotes, prices and contacts if they still know their password, because suspension only hides the website and the database rule for internal staff never checks it. The fix for partners promoting themselves to admin is live in production but missing from the code repository, so rebuilding the database from the repository would reopen it. Anyone on the internet can list the partner logo storage folder, which reveals which companies are Arxys partners. The automated permission tests miss these cases and leave a test account behind on every run, possibly with admin rights.

### Findings

KNOWN (ADR 0151, not counted as new): partners self-escalation. See claim 1, S-1 and the Known issues status section.

#### S-1: Repo and live database have drifted; the ADR 0151 fix and five more migrations exist only in production

- **Severity:** High. **VERIFIED** (absence in `git ls-files`; presence live per uploaded JOURNAL lines 7 to 253).
- **Actor:** B (any partner, after any rebuild), E.
- **Location:** `supabase/migrations/` (no `20261016000001` to `20261016000006`); hole as committed at `supabase/migrations/20260515193702_initial_schema.sql:163` and `supabase/migrations/20260615000001_rls_perf_consolidation.sql:64-68`; `scripts/test-rls.ts` (no block 23 or 24).
- **What is wrong:** Production carries the ADR 0151 guard trigger (`20261016000001`), 13 Project Portal tables from `20261016000002` to `20261016000006`, their rollbacks, apply notes 0151 and 0153, ADRs 0150 to 0157 and test-rls blocks 23 and 24. None are in this commit. Older drift is documented too: hand-applied migrations "never recorded in remote history" (`20260812000001:5-6`, `20260818000002:19-22`), and `rls_auto_enable` once existed only live (`20260611000001:14-18`).
- **Preconditions:** any `supabase db reset`, disaster-recovery rebuild, preview branch or new environment built from the repo. Also any reviewer working from the repo.
- **Impact:** a rebuild silently reopens partner-to-admin escalation (Critical) and drops 13 tables. The live guard's code cannot be reviewed, so "covers every sensitive column and every write path" stays unverifiable. Running the committed `test-rls.ts` cannot catch a regression of the guard.
- **PoC (local only):** `supabase start`, `supabase db reset` from this commit, provision a partner with the `provisionPersona` pattern, then `PATCH /rest/v1/partners?id=eq.<self>` with `{"role":"admin"}` using the partner JWT. Returns 200 and the row changes.
- **Simplest fix:** commit and push the 2026-10-16 work from Andy's Mac as-is. Then run the read-only catalog queries in action item 2 and diff against the matrix above. Record the live `supabase_migrations.schema_migrations` contents in an apply note.
- **Regression test:** test-rls block 23 committed and run every time; add a CI-able local check (PGlite, as the JOURNAL describes) that replays all migrations and asserts the partners guard rejects a self `role` change.

#### S-2: Partners can write ownership and linkage columns on `submissions`, which lets them overwrite any Pipedrive deal

- **Severity:** High. **VERIFIED** (policy text plus traced server code).
- **Actor:** B, C.
- **Location:** `supabase/migrations/20260527182010_step5_submission_lifecycle.sql:12-16,50,58-62`; `supabase/migrations/20260615000001_rls_perf_consolidation.sql:107-110,119-123`; `supabase/migrations/20260724000001_submission_revision_lineage.sql:11-12`; traced to `src/app/(app)/calculator/actions.ts:249-256,694-702,742-745` and `src/lib/pipedrive/deal.ts:395-460`; `src/app/(app)/admin/submissions/actions.ts:229-247`.
- **What is wrong:** `authenticated` holds table-wide INSERT and UPDATE on `submissions`, and the policies check only `partner_id = auth.uid()`. The "column-level in the Server Action" control (migration comment lines 12-16, ADR 0037) does not apply to direct REST calls, which ADR 0112 and 0113 already acknowledge. Partner-writable columns that carry power, linkage or visibility:
  - `pipedrive_deal_id`: the revise path reads it from the source row with the caller's client and calls `updateDealFromRevision(sourceDealId, ...)`, which writes value, submission id, cameras, bandwidth, storage, recommended models and `arxys_portal_url` on that deal and pins a note.
  - `parent_submission_id`: FK accepts any existing submission id; the admin relink action then updates the parent's deal with this row's data.
  - `on_behalf_of_partner_id`: pushes the row and its Project Quotes into another partner's view (SELECT policy and ADR 0083), and makes "Prepared for" and the relink deal person resolve to that partner.
  - Banked sizing (`storage_tb`, `recommended_product_id`, `recommended_units`, `groups_payload`, `input_state`, `calc_version`): rendered into the Arxys-branded System Estimate (`src/lib/pdf/render.ts:59-80`) and used as the sizing half of internal Project Quotes. Direct REST INSERT skips the server-side recompute entirely.
  - `created_at`, `email_sent_at`, `status`: future dates distort the 14-day windows and ordering; `status` can be flipped from won back to open and the row deleted (see the ADR 0037 challenge).
- **Preconditions:** a partner login (invite-only, about 90 non-internal logins per the uploaded JOURNAL) and a target deal id (sequential integers). The JWT is obtainable by signing in against Supabase Auth with the public anon key.
- **Impact:** integrity of Arxys's Pipedrive deals across every partner and every non-portal deal: deal value and portal fields overwritten, deal repointed to the attacker's submission. If an internal user later generates a Project Quote for the attacker's submission, the snapshot contains the victim deal's organization, person and pricing, and the attacker can read it through ADR 0083 (cross-partner PII and pricing leak, PLAUSIBLE because it needs that internal action). The guard on `partners` does not touch this.
- **PoC (local or preview with a Pipedrive sandbox or mocked client only):**
  1. Local stack from this commit; provision partner A; sign in to get A's JWT.
  2. `POST /rest/v1/submissions` with A's JWT and the NOT NULL columns, or submit one calc through the app.
  3. `PATCH /rest/v1/submissions?id=eq.<row>` with `{"pipedrive_deal_id": 999999}`. Expect 200.
  4. Call `submitCalculation` with `isRevision: true, sourceSubmissionId: <row>` against the mock; observe `updateDeal(999999, ...)`.
- **Simplest fix:** mirror ADR 0151 on `submissions` with a SECURITY INVOKER BEFORE INSERT OR UPDATE guard trigger. For non-admin `authenticated` callers: on UPDATE allow only `status` and `is_preferred`; on INSERT require `pipedrive_deal_id`, `email_sent_at` null, `created_at` defaulted, `on_behalf_*` null unless `is_internal(auth.uid())`, and `parent_submission_id` null or pointing at a row where the caller is `partner_id` or `on_behalf_of_partner_id`. Move the two server writes of `pipedrive_deal_id` and `email_sent_at` in `calculator/actions.ts` (lines 610-612 and 742-745) to the `admin` client the action already holds. Fix check: this adds two service-role UPDATEs in a path that has already authenticated the caller and inserted the row as that caller; the narrower alternative (a set-once rule on `pipedrive_deal_id`) does not close the hole, because a partner can set it once on a fresh row. Forged sizing on direct INSERT remains until INSERT also moves to the service-role client; log that as a follow-up decision.
- **Regression test:** test-rls cases "A cannot PATCH own `pipedrive_deal_id` / `parent_submission_id` / `on_behalf_of_partner_id` / `created_at` (42501)", "A cannot INSERT with `pipedrive_deal_id` set", "A can still PATCH `status` and `is_preferred`", "internal and admin can still write", plus a unit test that the revise path never inherits a deal id the caller wrote.

#### S-3: `is_internal()` ignores suspension, and RLS never checks `status` outside `is_admin()`

- **Severity:** High. **VERIFIED** (function text; the uploaded JOURNAL line 201-203 confirms live `is_internal()` is "as written").
- **Actor:** C, D (a suspended or offboarded internal rep), B (a suspended partner).
- **Location:** `supabase/migrations/20260605000004_fix_partners_internal_recursion.sql:13-24`; consumers in `20260615000001:53-60,91-99`, `20260720000001:26-41`, `20260702000002:35-53`, `20260616000002:89-95`, `20260803000001:106-133`, `20260803000002:148-162`. Suspension writes only `partners.status` (`src/app/(app)/admin/partners/actions.ts:207-213`); the gate is the layout (`src/app/(app)/layout.tsx:24-29`).
- **What is wrong:** `is_admin()` requires `status = 'active'`; `is_internal()` does not. Suspension is the only offboarding tool (ADR 0023 has no delete) and it does not ban the Auth user, so the person can still sign in against Supabase Auth with the anon key and call REST directly. App gates check `status`, RLS does not.
- **Preconditions:** a suspended internal user who still knows their password or holds a refresh token.
- **Impact:** full read of every partner's submissions (with partner pricing), all partner rows, all Project Quote snapshots (customer PII and deal pricing), access requests (plus UPDATE), the deal cache (plus writes), and Project Quote INSERT (S-4). A suspended regular partner keeps REST access to their own rows and to the current price list. The live ADR 0151 guard stops self-reactivation and leaves these reads open.
- **PoC (local only):** provision an internal persona, set `status='suspended'` with service role, sign in with its password (succeeds), `GET /rest/v1/submissions?select=id,partner_id,total_partner_price_usd` returns other partners' rows.
- **Simplest fix:** `create or replace function public.is_internal(uid uuid) ... where id = uid and is_internal = true and status = 'active'`, matching `is_admin()`. Fix check: narrows only; no app path needs a suspended internal user to pass. Separately (Slice 2), ban the Auth user in `suspendPartner` and unban in `reactivatePartner`.
- **Regression test:** test-rls "8l: suspended internal user cannot SELECT another partner's submissions / partners / project_quotes / access_requests", "8m: suspended partner cannot SELECT own submissions" if Andy wants RLS-level suspension for partners too.

#### S-4: Internal users can insert a Project Quote with an arbitrary snapshot that the owning partner then downloads

- **Severity:** Medium. **VERIFIED** (policy text and the user-client insert in `src/lib/project-quote/generate.ts:100-104`).
- **Actor:** D (and C via S-3).
- **Location:** `supabase/migrations/20260616000002_phase10_project_quotes.sql:82,89-95`; `supabase/migrations/20260720000001_project_quotes_partner_select.sql:26-41`.
- **What is wrong:** the INSERT check pins `generated_by` and nothing else. `snapshot`, `pipedrive_deal_id`, `terms_version`, `validity_days` and `version` are free, so a REST insert bypasses the server assembly that reads prices from Pipedrive. Rows are immutable and the highest version is "current" (ADR 0061), so a forged row becomes the document the partner downloads.
- **Preconditions:** an internal login.
- **Impact:** Arxys-branded quotes with prices or terms that never came from Pipedrive, which breaks the "prices only from Pipedrive" rule; the forged row cannot be removed through the app.
- **PoC (local only):** as an internal persona, `POST /rest/v1/project_quotes` with `generated_by=self`, a partner's `submission_id`, `version` = max+1 and a hand-written snapshot; download the partner PDF route as that partner.
- **Simplest fix:** a BEFORE INSERT trigger that requires `new.pipedrive_deal_id` to equal the submission's `pipedrive_deal_id` and `new.version` to equal max+1. Prices inside the snapshot cannot be validated in SQL; if Andy wants that closed, revoke INSERT from `authenticated` and insert from `generateProjectQuoteCore` with the service-role client after `requireAdminOrInternal` (adds a service-role write path; flag it in that step's review).
- **Regression test:** test-rls "19i: internal cannot INSERT a quote whose `pipedrive_deal_id` differs from the submission's", "19j: internal cannot INSERT a skipped version".

#### S-5: The public `partner-logos` bucket lets anyone list every partner folder

- **Severity:** Medium. **VERIFIED** for the policy; listing through the Storage API is documented platform behavior and was not exercised.
- **Actor:** A, G.
- **Location:** `supabase/migrations/20260721000002_partner_logos_bucket.sql:25-34`; object path `<partner-id>/logo.<ext>` from `src/lib/storage/partner-logo.ts:55-60`.
- **What is wrong:** a public bucket serves objects by URL without any policy. The added `for select to public` policy also authorizes the list endpoint for anon. The bucket has no `allowed_mime_types` or `file_size_limit`.
- **Preconditions:** the public anon key (shipped to every browser) and the project URL.
- **Impact:** anonymous enumeration of partner UUIDs (equal to Auth user ids) and download of every logo, which reveals the partner roster to competitors and feeds S-8.
- **PoC (local only):** `supabase.storage.from('partner-logos').list('')` with an anon client returns the folder names.
- **Simplest fix:** drop `partner_logos_public_read`. Change `loadPartnerLogoDataUri` (`partner-logo.ts:109`), which today downloads through the caller's client and would break, to fetch the public URL from `getPublicUrl`. Set `allowed_mime_types = '{image/png,image/jpeg}'` and `file_size_limit = 2097152` on the bucket. Fix check: this narrows access, adds no service-role path, and the public URL host is fixed.
- **Regression test:** test-rls "25a: anon list of partner-logos returns nothing", "25b: partner upload to partner-logos is refused", "25c: admin upload succeeds".

#### S-6: `test-rls.ts` teardown leaves persona A in production on every complete run

- **Severity:** Medium. **VERIFIED** for this commit's code; PLAUSIBLE for the live 2026-10-16 version, which is not readable here.
- **Actor:** C (an orphaned, email-confirmed, possibly admin account).
- **Location:** `scripts/test-rls.ts:81-85` (teardown ignores every error), `:118-122` (personas provisioned before the `try` at `:124`), `:586-607` (8h seeds a row with `partner_id = internalPersona`, `on_behalf_of_partner_id = a.id`, never deleted), `:1885-1890` (teardown order A, B, admin, internal).
- **What is wrong:** `teardownPersona(a)` deletes A's own submissions, then the `partners` delete fails with 23503 because the internal persona's 8h row still references A (`20260604000001:23` FK, no ON DELETE action). `auth.admin.deleteUser(a.id)` then fails too, since its cascade into `partners` hits the same FK. Both errors are dropped. The internal persona's later teardown removes the row, and A is never retried. Separately, a throw while provisioning B, ADMIN or INT leaks the personas already created, and Ctrl-C skips `finally`.
- **Preconditions:** any full run against production.
- **Impact:** a confirmed persona `rls-test-a-<ms>@arxys-rls-test.invalid` survives each run. The known leftover (timestamp 1792186404373 = 2026-10-16 21:33:24 UTC) is persona A, and its date and name are consistent with the pre-apply run in which 23a left A as an admin (uploaded JOURNAL lines 51-54, 228-229, 247-249); the "RLS Hijack Co" name most likely came from a block 23 company-name case that succeeded before the guard existed. That link is an inference, since block 23 is not readable here. Its password was random and never stored, so direct login is unlikely; it still counts as an admin for the last-active-admin guard and pollutes partner lists and the company sync. Earlier runs since 2026-06-12 may have left more A personas.
- **PoC (local only):** run the suite against a local stack, then `select email from auth.users where email like '%@arxys-rls-test.invalid'` returns the A persona.
- **Simplest fix:** delete `onBehalfRowId` explicitly before the `finally` teardown (or delete `submissions where on_behalf_of_partner_id = p.id` inside `teardownPersona`); provision inside the `try` and push each persona to a list; check and print every teardown error; add a start-of-run sweep that removes `@arxys-rls-test.invalid` users older than one hour; trap SIGINT.
- **Regression test:** a final assertion in the script: zero `auth.users` rows match `%@arxys-rls-test.invalid` after teardown.

#### S-7: `test-rls.ts` coverage gaps

- **Severity:** Medium. **VERIFIED** (by reading every case name, `scripts/test-rls.ts:136-1874`).
- **Actor:** n/a (missing regression net for B, C, D).
- **Location:** `scripts/test-rls.ts`.
- **Coverage map at this commit** (P = partner-denied case, I = internal-allowed or internal-denied case as the policy intends; yes or MISSING):
  - partners SELECT: P yes (6a, 6b); I MISSING (8a is admin only).
  - partners UPDATE: P MISSING, I MISSING, column guard MISSING (block 23 exists only live).
  - partners INSERT/DELETE denied: MISSING.
  - submissions SELECT/INSERT/DELETE: P yes (7b, 13, 17, 18, 8g, 8i); I yes (8d, 8e, 8f).
  - submissions column guard (S-2): MISSING; tests 11 and 12 only assert that partners can write.
  - suspended internal and suspended partner reads (S-3): MISSING; only suspended admin (8c).
  - products: P yes for inactive rows (9b); future-dated rows, partner write denied, `current_products` view: MISSING.
  - competitor_products: MISSING entirely.
  - camera_specs: P yes; internal UPDATE/DELETE denied MISSING; admin UPDATE/DELETE allowed MISSING.
  - project_quotes: P yes (19a, 19d); I yes (19b, 19e, 19f). Owner and cross-partner cases 20a-20g run only with `RUN_0083_TESTS=1` (`:976`), so a default run skips the ADR 0083 ship gate on a live policy.
  - access_requests: P yes; I yes; anon UPDATE and partner DELETE MISSING (ungranted, low value).
  - product_specs, appliance_specs: complete. Their audit tables: internal-denied SELECT MISSING (21l and 22l test partners only).
  - submission_internal_archives, pipedrive_deal_cache: MISSING here; partly covered by `scripts/verify-project-queue.mts` (out of slice, not read).
  - storage `partner-logos`: MISSING entirely.
  - RPC EXECUTE (`is_admin`, `is_internal`, `search_camera_specs`, `camera_aliases_text` as anon): MISSING.
  - Duplicate labels: 20a-20h are used twice (ADR 0083 block and access_requests block).
- **Simplest fix:** add the missing cases in the order S-2, S-3, partners INSERT/DELETE, storage, RPC, then the rest; run the 0083 block unconditionally now that the policy is live.
- **Regression test:** the cases themselves.

#### S-8: `is_admin(uuid)` and `is_internal(uuid)` are a role oracle over RPC

- **Severity:** Low. **VERIFIED** (grants and exposed schema; no app code calls them over RPC, only `search_camera_specs` is used, `calculator/actions.ts:807`).
- **Actor:** B.
- **Location:** `supabase/migrations/20260515193702_initial_schema.sql:131-145`; `supabase/migrations/20260605000004_fix_partners_internal_recursion.sql:13-27`; `supabase/migrations/20260611000001_security_advisor_hardening.sql:87-90`; admin UUIDs exposed in read-open `product_specs.updated_by` (`20260727000001:66-68`) and `appliance_specs.updated_by` (`20260729000001:180`).
- **What is wrong:** both DEFINER helpers take any uid and bypass partners RLS. `POST /rest/v1/rpc/is_admin {"uid": "..."}` tells any partner whether that user is an admin or internal.
- **Preconditions:** a partner login plus UUIDs (from S-5, `updated_by`, or on-behalf rows).
- **Impact:** targeting of admin and internal accounts for phishing. No data leak by itself.
- **PoC (local only):** as partner A, call the RPC with the admin persona's id; returns true.
- **Simplest fix:** move both helpers to a schema PostgREST does not expose: `create schema private; alter function public.is_admin(uuid) set schema private; ...; grant usage on schema private to authenticated;`. Existing policies keep working because they store function OIDs. Fix check: PL/pgSQL bodies resolve names at run time, so the live ADR 0151 guard and any later function that calls `public.is_admin` by name must be updated in the same migration.
- **Regression test:** test-rls "authenticated RPC call to `is_admin` returns 404/permission error".

#### S-9: The products policy exposes rows the UI hides

- **Severity:** Low. **VERIFIED** (policy text; `push-prices.ts:17-19` supports future `--effective-date`, ADR 0076 "Future prices can be staged").
- **Actor:** B, G.
- **Location:** `supabase/migrations/20260615000001_rls_perf_consolidation.sql:78-81`; `supabase/migrations/20260702000001_price_versioning_append_only.sql:79-99`; `supabase/migrations/20260818000002_hide_ncd_skus_from_catalog.sql:1-29`.
- **What is wrong:** non-admins can `GET /rest/v1/products` and read every active row: staged future prices before their effective date, the `-NCD` SKUs "custom to one partner" with their prices (`hidden_from_catalog` is a UI filter only), and `pushed_to_pipedrive_at`. RLS also filters before the view's `DISTINCT ON`, so if only the newest row of a SKU is set inactive, partners see the older active row as current (ADR 0076 accepted this when deactivation was out of scope; five SKUs were deactivated on 2026-07-02).
- **Preconditions:** a partner login.
- **Impact:** early disclosure of price changes; one partner's custom configuration and price visible to all partners; possible stale prices for deactivated SKUs (PLAUSIBLE, depends on how the rows were deactivated).
- **PoC (local only):** insert a future-dated row with service role; read it as partner A through `/rest/v1/products?effective_date=gt.<today>`.
- **Simplest fix:** change the non-admin branch to `active = true and effective_date <= current_date`. The view already applies the date filter, so no reader changes. For deactivation, set `active = false` on every row of the SKU and check with the query in action item 3. Decide separately whether NCD SKUs stay visible.
- **Regression test:** test-rls "9c: partner cannot SELECT a future-dated products row", "9d: deactivated SKU absent from partner `current_products`".

#### S-10: Grant and function hygiene gaps that bypass the per-table pattern

- **Severity:** Low. **VERIFIED.**
- **Actor:** A.
- **Location:** `supabase/migrations/20260702000001_price_versioning_append_only.sql:99` and `20260818000002:34-53` (view keeps default anon privileges); `supabase/migrations/20260615000002_phase10_camera_specs.sql:36,48-52`.
- **What is wrong:** `current_products` gets only `grant select to authenticated`; anon keeps default ALL (reads fail today only because `security_invoker` hits products' revoked grant). `camera_aliases_text` has no pinned `search_path` and stays anon-executable. `pg_trgm` installed in `public` exposes its functions as RPC to anon. No `ALTER DEFAULT PRIVILEGES` revokes anon defaults, so every future object starts anon-reachable; two policies were already created without `to authenticated` once (ADR 0055).
- **Impact:** small surface today; the defaults make the next mistake reachable by anon.
- **Simplest fix:** `revoke all on public.current_products from anon;` `alter function public.camera_aliases_text(text[]) set search_path = '';` plus `revoke execute ... from anon, public`; `alter extension pg_trgm set schema extensions;` (index opclasses follow by OID); `alter default privileges for role postgres in schema public revoke all on tables from anon; ... revoke execute on functions from anon, public;`. All narrow access.
- **Regression test:** anon `GET /rest/v1/current_products` returns 401/42501 with a clear grant error; anon `rpc/camera_aliases_text` refused.

#### S-11: Internal users hold write grants the app does not use

- **Severity:** Low. **VERIFIED** (app writes `access_requests` only through the service-role client: `request-access-actions.ts:151`, `admin/requests/actions.ts:34-35`).
- **Actor:** D.
- **Location:** `supabase/migrations/20260702000002_access_requests.sql:33,43-53`; `supabase/migrations/20260803000002_pipedrive_deal_cache.sql:146,153-162`.
- **What is wrong:** internal users can PATCH any column of any access request (`email`, `ip_address`, `existing_user`, `status`, `converted_at`) and write any value into `pipedrive_deal_cache` (deal status and value that other internal users and the Band C totals read).
- **Impact:** an internal user can rewrite intake evidence or redirect a pending request's email before an admin approves it, and can falsify pipeline figures. No escalation path.
- **Simplest fix:** revoke UPDATE on `access_requests` from `authenticated` and drop its update policy (tests 20g and 20h then assert denial). Keep the cache grant (the refresh uses the user client) and accept the risk, or move the upsert to the service-role client later.
- **Regression test:** test-rls "20g': internal UPDATE of access_requests is refused".

#### S-12: Admins can bypass the partner-management guards through REST

- **Severity:** Low. **VERIFIED** for committed policy; live guard lets active admins pass (uploaded JOURNAL line 211).
- **Actor:** D (admin), C (compromised admin).
- **Location:** `supabase/migrations/20260615000001_rls_perf_consolidation.sql:64-68`; guards live only in `src/app/(app)/admin/partners/actions.ts:180-205`.
- **What is wrong:** ADR 0023 says role changes happen only through the bootstrap script and that self-suspend and last-active-admin are refused. Those rules live in server actions; an admin JWT can PATCH any `partners` row directly, promote others, demote or suspend the last admin, or set `is_internal`.
- **Impact:** a compromised admin session can mint further admins that survive the original account's suspension.
- **Simplest fix:** in the live guard trigger, refuse any change to `role` from every `authenticated` caller, admins included (the `/admin/partners` actions and the bootstrap script already write as service role per the uploaded JOURNAL line 204-206). Narrows only.
- **Regression test:** test-rls "23l: admin JWT cannot change any partner's `role`".

### Challenges to ADRs

- **ADR 0037 (status-guarded delete):** claims a won or lost row "cannot be deleted even by an application bug or a direct POST". A partner can PATCH `status` back to `open` (UPDATE policy, any column) and then DELETE. Its "column-level in the app is the standard Supabase split" premise is what S-2 exploits; column privileges or a guard trigger are the platform controls.
- **ADR 0053:** "Signed-In Users Can Execute ... accepted as a false positive" misses the uid parameter oracle (S-8), and the hardening was not made durable (S-10).
- **ADR 0021:** "RLS already strips admin privileges from a suspended admin" holds for admins only. `is_internal()` and own-row policies ignore suspension (S-3).
- **ADR 0023:** "Bootstrap script remains the only path to admin" was false in the repo until the live 0151 guard, and stays false for admins acting through REST (S-12).
- **ADR 0022:** noted in May that the partners UPDATE policy "admits status changes from the user themselves" and might be tightened. It was tightened only live, in October, and not in the repo (S-1).
- **ADR 0076:** "deactivation is out of scope and the pipeline always writes active = true" no longer holds: five SKUs were deactivated on 2026-07-02 and `push-prices.ts` treats `active=false` as the archive signal, so the RLS-before-`DISTINCT ON` edge now matters (S-9).
- **ADR 0083:** "Pricing appears only inside the rendered PDF, never as portal UI" holds for the UI; the owner can read the full `snapshot` jsonb through REST. Acceptable for the owner, and worth stating. Its ownership predicate depends on `submissions.on_behalf_of_partner_id`, which partners can write (S-2).
- **ADR 0112 / 0113:** correctly identified that partners can UPDATE any column of their own submissions and routed around it with side tables. The root cause was never logged or fixed, which left `pipedrive_deal_id` open (S-2).
- **ADR 0089:** the explicit public SELECT policy "makes the intent reviewable" and also enables anonymous listing (S-5).
- **ADR 0055:** no challenge; confirmed (claim 2).

### Andy action items

1. **Commit and push the 2026-10-16 work** (migrations `20261016000001` to `20261016000006`, their rollbacks, apply notes 0151 and 0153, ADRs 0150 to 0157, test-rls blocks 23 and 24) so the repo matches production. Then run a fresh security pass on the guard trigger code.
2. **Run these READ-ONLY catalog queries in the Supabase SQL editor** and diff against the matrix above:
   ```sql
   -- READ ONLY
   select tablename, policyname, cmd, roles, qual, with_check from pg_policies where schemaname in ('public','storage') order by 1,2;
   select c.relname, c.relkind, c.relrowsecurity, c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v') order by 1;
   select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated') group by 1,2 order by 1,2;
   select table_name, column_name, grantee, privilege_type from information_schema.column_privileges where table_schema='public' and grantee in ('anon','authenticated') order by 1,2;
   select p.oid::regprocedure, p.prosecdef, p.proconfig, has_function_privilege('anon',p.oid,'EXECUTE') anon_exec, has_function_privilege('authenticated',p.oid,'EXECUTE') auth_exec from pg_proc p where p.pronamespace='public'::regnamespace order by 1;
   select tgrelid::regclass, tgname, tgfoid::regprocedure, tgenabled from pg_trigger where not tgisinternal order by 1,2;
   select evtname, evtevent, evtfoid::regproc, evtenabled from pg_event_trigger;
   select extname, extnamespace::regnamespace from pg_extension order by 1;
   select id, public, file_size_limit, allowed_mime_types from storage.buckets;
   select pg_get_functiondef('public.is_internal(uuid)'::regprocedure);
   select version, name from supabase_migrations.schema_migrations order by version;
   ```
3. **Run these READ-ONLY detection queries:**
   ```sql
   -- READ ONLY. S-2: one deal linked from different creators with no on-behalf explanation
   select pipedrive_deal_id, array_agg(distinct partner_id) creators, count(*) from public.submissions where pipedrive_deal_id is not null group by 1 having count(distinct partner_id) > 1;
   -- S-2: non-internal creators carrying on-behalf columns, future created_at, cross-partner lineage
   select s.id, s.partner_id, s.on_behalf_of_partner_id, s.on_behalf_of_company_name from public.submissions s join public.partners p on p.id=s.partner_id where not p.is_internal and (s.on_behalf_of_partner_id is not null or s.on_behalf_of_company_name is not null);
   select id, partner_id, created_at from public.submissions where created_at > now();
   select c.id, c.partner_id, par.partner_id parent_owner from public.submissions c join public.submissions par on par.id=c.parent_submission_id where c.partner_id <> par.partner_id and par.on_behalf_of_partner_id is distinct from c.partner_id;
   -- S-3: suspended users who still pass is_internal
   select id, company_name, contact_name, status, is_internal from public.partners where status <> 'active' and is_internal;
   -- S-6 and known issue: leftover test personas and their privileges
   select u.id, u.email, u.created_at, u.last_sign_in_at, p.company_name, p.role, p.status, p.is_internal from auth.users u left join public.partners p on p.id=u.id where u.email like '%@arxys-rls-test.invalid' order by u.created_at;
   -- ADR 0151 "was the hole used": compare against the people you expect
   select id, company_name, contact_name, role, is_internal, status, pipedrive_user_id, logo_path, created_at, updated_at from public.partners where role='admin' or is_internal or pipedrive_user_id is not null order by updated_at desc;
   -- S-9: SKUs whose newest in-effect row is inactive while an older active row exists
   select distinct p.sku from public.products p where not p.active and p.effective_date = (select max(q.effective_date) from public.products q where q.sku=p.sku and q.effective_date <= current_date) and exists (select 1 from public.products r where r.sku=p.sku and r.active and r.effective_date <= current_date);
   ```
   Also search the Supabase API logs (Logs Explorer, edge logs) for `PATCH /rest/v1/partners` and `PATCH /rest/v1/submissions` requests carrying a partner JWT; table queries cannot show past escalation.
4. **Delete the leftover RLS personas** after reading their rows (query above); confirm none holds `role='admin'` or `is_internal`.
5. **Ban or delete any suspended internal user** in Supabase Auth until S-3 ships.
6. **Run the Supabase Security Advisor and Performance Advisor** and compare with S-5, S-8 and S-10 (expect "public bucket allows listing", "extension in public", "function search path mutable").
7. **Approve the fix order for the build session:** S-2 and S-3 first (both RLS changes, both need a fresh security pass), then S-6 and S-7, then the rest.

### Not checked

- The six `20261016` migrations, their rollbacks, apply notes 0151 and 0153, ADRs 0150 to 0157 and test-rls blocks 23 and 24: absent from this commit. Known only from the uploaded JOURNAL lines 1 to 322. Whether they changed `submissions` grants or policies is unknown.
- Live database state and drift: no database access. The matrix is the committed state only.
- The Project Portal brief: not in this repository or in Drive.
- Full git history: the clone is shallow (50 commits); deleted migrations or secrets in older history were not checkable.
- Dashboard-only settings: Auth configuration, Realtime publications, pg_graphql exposure, Storage settings beyond the migration, network restrictions. Slice 2 owns the dashboard checklist.
- `scripts/verify-project-queue.mts` and the TypeScript seed scripts under `scripts/`: later slices.
- The service-role inventory and the bootstrap-admin path: Slice 2.
- The rollbacks were reviewed for privilege widening only (none found; `rls-perf-consolidation-rollback.sql` and `pipeline-status-model-reduction-rollback.sql` restore a pre-0081 delete guard that fails closed). Rollback ordering quality belongs to the architect review.
- Nothing was run against Supabase, Vercel, Pipedrive or email. `scripts/test-rls.ts` was not run.

### Known issues status

- **ADR 0151 partners self-escalation:** OPEN in the repo at this commit (claim 1: `role`, `is_internal`, `status`, `company_name`, `contact_name`, `pipedrive_user_id`, `logo_path` all self-writable); FIXED LIVE 2026-10-16 per uploaded JOURNAL lines 193-253 (phone-only allow-list trigger, 88/88 live suite). Guard code unreviewable here; the repo gap is S-1. Admins still bypass ADR 0023 rules (S-12); the guard does not cover `submissions` (S-2) or `is_internal()` suspension (S-3).
- **ADR 0150 price push deleting Pipedrive products via `active_flag: false`:** fix not in this commit (`scripts/push-prices.ts:10-11,322-349` still describes archiving through `active_flag=false`); FIXED LIVE in code on Andy's Mac per uploaded JOURNAL lines 255-316. The data layer does not send `active_flag`; outside this slice.
- **Pipedrive v1 and name-based upserts:** outside this slice. Data-layer note: partner-writable `company_name` fed those upserts until the live guard; at this commit it still does.
- **`ensureCustomFields()` in lookups.ts:** outside this slice; it also runs inside the S-2 attack path (`deal.ts:400-403`).
- **100 duplicated legacy Pipedrive codes, `VX5-RAM-32GB` inactive but linkable:** outside this slice for Pipedrive. In the portal, `VX5-RAM-32GB` is hidden from partners by `products` RLS; S-9 gives a query to confirm no older active row resurfaces it.
- **Leftover "RLS Hijack Co" persona:** still present per uploaded JOURNAL line 53. Root cause found: this commit's teardown can never delete persona A (S-6), and the run that created it likely left it as an admin. Deletion is Andy's (action item 4).
- **Migrations applied by hand, possible drift:** CONFIRMED drift, at least six migrations live and absent from the repo (S-1). The rest stays open until Andy runs action item 2.

---

# Appendix C: Architect reviewer report (architect-review, high)

Reproduced verbatim. Finding A-n here is B1-A-n in the backlog; C-1 to C-5 are B1-A-12 to B1-A-16.

## Architect review: Baseline Slice 1, data and access layer

### 1. Header

- **Commit:** 6201569aebc78e65ab199a719490ea743e5e5235 (branch claude/group-1-audit-preflight-n8s0yw). Committed tree reviewed. The only untracked path is `docs/reviews/` (the audit plan), which this review does not depend on beyond reading it.
- **Mode:** area, baseline (finding cap 20, Consider at most 5). Scope covers the whole base portal data layer as committed, across its full migration history.
- **Scope (files):** `supabase/migrations/*.sql` (44 files, replayed in timestamp order), `supabase/rollback/*.sql` (29 files), `docs/apply-notes/*` (10 files), `scripts/test-rls.ts` (read only, never run), `supabase/config.toml` (seed path). No seed SQL exists: `[db.seed] sql_paths = ["./seed.sql"]` points at a missing file.
- **Read outside the slice to trace calls:** `src/app/(app)/submissions/actions.ts` (preferred toggle, status update), `src/app/(app)/calculator/actions.ts` (partner-session writes to `submissions`), `scripts/push-prices.ts` (how `products` rows are written), `src/app/(auth)/login/request-access-actions.ts` (access request dedup), greps of `src/` for `hidden_from_catalog` and `pipedrive_deal_id`, `docs/RUNBOOK.md` section 6, targeted greps of `docs/JOURNAL.md`, and lines 1 to 322 of Andy's Mac JOURNAL upload (`959be18f-JOURNAL.md`) supplied by the coordinator.
- **Context read:** AGENTS.md, docs/README.md, docs/reviews/BASELINE-PLAN.md.
- **ADRs relied on:** 0004, 0017, 0031, 0037, 0053, 0055, 0059, 0060, 0061, 0076, 0078, 0081, 0083, 0086, 0093, 0095, 0096, 0112, 0113, 0137, 0138, 0141, 0149. ADRs 0150 to 0157 are referenced from the uploaded JOURNAL only; their files are not in this commit.
- **Checks run:** read-only `git ls-files`, `git log`, `git show --stat`, `git rev-parse --is-shallow-repository` (true: 50 commits reachable), grep and file reads. **Not run:** typecheck, lint, unit tests (node_modules absent, nothing installed), `scripts/test-rls.ts` (production personas), any network call.

### 2. Verdict

**FIX BEFORE COMMIT.** Two Must-fix items: partners can still rewrite any column of their own `submissions` rows (the ADR 0151 class of hole, unfixed on that table), and the repository no longer describes production, including the live security fix for `partners`, so a rebuild from this commit reopens a closed hole. Both should land before any further migration is written on top of this base.

### 3. Plain-language summary

The database rules that keep partners apart are mostly sound, and the performance cleanup of June did wrap the user lookup everywhere it was supposed to. The biggest risk is that the repository and the live database have separated: the 2026-10-16 security fix and 13 new tables exist in production and on Andy's laptop only, so anyone rebuilding from this repository would bring back the hole that let partners make themselves admin. The same kind of hole still exists on quotes (submissions): a partner can change any field of their own quote directly through the API, including banked sizing figures, deal links and who the quote is "for". Several rules that the database could enforce (one preferred quote per project, prices never being overwritten, a hidden SKU staying hidden) are enforced only by app code or by convention, and two of them are already wrong in reachable cases. Many rollback scripts no longer match the schema and would either do nothing or fail if run today.

### 4. Findings

#### A-1. Must fix. VERIFIED. Partners can UPDATE every column of their own `submissions` row

- **Location:** `supabase/migrations/20260527182010_step5_submission_lifecycle.sql:50` (table-wide `grant update, delete`), `:13` (comment: "Column-level restriction ... lives in the Server Action"); `supabase/migrations/20260615000001_rls_perf_consolidation.sql:119` (`submissions_update_authorized`, row scope only); `supabase/migrations/20260717000002_pipeline_status_model_reduction.sql:49` (delete guard keyed on `status`).
- **What is wrong:** RLS restricts which rows a partner may update, never which columns. Any partner JWT can PATCH `on_behalf_of_partner_id`, `on_behalf_of_company_name`, `pipedrive_deal_id`, `parent_submission_id`, `storage_tb`, `bandwidth_mbps`, `recommended_product_id`, `recommended_units`, `total_list_price_usd`, `groups_payload`, `input_state`, `calc_version` and the rest on their own rows. The repo knows this: ADR 0112 and ADR 0113 each built a side table (`20260803000001_internal_project_archive.sql:12-17`, `20260803000002_pipedrive_deal_cache.sql:27-30`) specifically because "a partner can SELECT and UPDATE arbitrary columns of their own submission rows through PostgREST". It was worked around twice and never closed. ADR 0151 closed the identical hole on `partners` only (uploaded JOURNAL lines 193-253).
- **Failure scenario:** A partner submits a quote (the server recomputes and banks the figures, `calculator/actions.ts` "Client totals are never trusted"), then PATCHes `storage_tb`, `recommended_units` or `groups_payload` on that row. The System Estimate renders from the live row (ADR 0017), the admin relink and Project Quote assembly read it, and the "server recomputes" guarantee no longer holds. Setting `on_behalf_of_partner_id` to another partner's id grants that user SELECT on the row, which after ADR 0152 is also the project-contact visibility path. Separately, the ADR 0037/0081 "won and lost cannot be deleted" guard is a speed bump: the normal UI (`submissions/actions.ts:35-46`) lets the owner set `won` back to `open`, then delete.
- **Simplest fix:** Reuse the ADR 0151 allow-list guard trigger (already written and proven, off-repo) on `submissions`: a non-admin `authenticated` caller may change only `status` and `is_preferred`. Move the two partner-session writes that touch other columns (`email_sent_at` at `calculator/actions.ts:609-612` and `pipedrive_deal_id` at `:742-745`) to the service-role client the action already creates at `:187`, or allow `pipedrive_deal_id` only from null. Decide whether a partner may move a row out of `won`/`lost`; if not, refuse that transition in the same trigger, and say so in ADR 0037.
- **Delete:** the misleading comments at `20260527182010_step5_submission_lifecycle.sql:13-16` once the trigger exists.
- Security-review will likely report the same root cause; keep both IDs on one backlog row.

#### A-2. Must fix. VERIFIED. The repository no longer describes the live database, and nothing detects drift

- **Location:** whole `supabase/migrations/` directory; `docs/decisions/0004-supabase-cli-migrations.md` (Status: Accepted, "`supabase db push` for applying"); `docs/RUNBOOK.md:96-127`; `supabase/migrations/20260818000001_semi_custom_ncd_upgraded_nic_gpu_skus.sql:19`.
- **What is wrong:** Evidence, oldest to newest:
  - Hand-applied files never recorded in CLI history; `migration repair` run once to patch it (JOURNAL line 4733); two migrations renamed from `20260723*` to `20260729*` after creation.
  - A migration applied as a fragment: the Phase A column comments silently never landed and went unnoticed for five days (`docs/apply-notes/0123-calculator-math-phase-a.md:3-30`).
  - The NCD migration header still says "This file is a DRAFT and has not been applied" while later commits verify its rows live (commit 3ec3220). It has no apply note, and neither do `20260720000001`, `20260724000001` or `20260818000002`.
  - The final V700/V800 CPU state was written by `scripts/revert-v700-v800-9135-cpu.ts` (commit a1a7d8c), so replaying migrations ends on the wrong CPU and camera count (see A-3).
  - **At this commit, the six `20261016*` migrations (the `partners` guard trigger plus 13 Project Portal tables), their rollbacks, apply notes 0151 and 0153, ADRs 0150 to 0157 and test-rls blocks 23 and 24 are all live in production (uploaded JOURNAL lines 92-124, 193-233) and absent from the repository.** The PGlite harness that proved them (uploaded JOURNAL lines 112-116, 223-226) lives in a scratchpad, also outside the repo.
  - No script, query or CI step compares the live catalogs with the migration files. `supabase migration list` only compares version numbers, and it is known to be wrong here.
- **Failure scenario:** Andy's laptop is the only copy of the ADR 0151 fix. A disaster-recovery rebuild, a staging project, or a new session working from `origin/main` gets a `partners` table that partners can self-promote on (`20260515193702_initial_schema.sql:163,177-181` is the effective state here). The next migration written against this commit cannot reference the 13 live tables.
- **Simplest fix (process):** (1) Push the 2026-10-16 work now. (2) Adopt one rule: a migration file is committed before it is applied, and the commit that records "applied" also carries its apply note. (3) Check in one read-only catalog snapshot query (policies, grants, columns, functions with `proconfig`, triggers, views' `reloptions`) as `supabase/verify/catalog-snapshot.sql`; Andy runs it after each apply and commits the output, so drift becomes a git diff. (4) Mark ADR 0004 superseded by the hand-apply practice. The Group 1 deliverable "live verification queries" can seed step 3.

#### A-3. Should fix. VERIFIED. Catalog data changes live in migrations, admin forms and one-off scripts at once, so replay cannot reproduce live data

- **Location:** price rows in migrations: `20260521190350_step3_4_products_sku_pk.sql:123-131`, `20260818000001_semi_custom_ncd_upgraded_nic_gpu_skus.sql:54-72`; spec edits in migrations: `20260602000001`, `20260605000001`, `20260605000002`, `20260914000001`, `20260914000002_v700_v800_match_v500_cpu.sql:48,60`; spec edits by script: `scripts/revert-v700-v800-9135-cpu.ts` (commit a1a7d8c).
- **What is wrong:** ADR 0096 says seeding data inside a migration "is the practice ADR 0096 exists to end", yet `20260818000001` and both `20260914*` files did it again, each calling itself "not a precedent". Replaying all 44 files leaves V700/V800 on the 16C/32T part at 275 cameras; live is the EPYC 9135 at 325 (ADR 0149). `20260914000001` itself notes the seed "has since drifted under admin edits". The NCD file writes prices into `products` (the Master Sheet owns those) and uses `current_date` for `effective_date`, so a replay on another day creates a different price history.
- **Failure scenario:** Anyone using `db push` on a fresh project (RUNBOOK section 6 says "this section is the whole story") gets catalog data that recommends different SKUs than production. Tests and PDFs built against a rebuilt database disagree with live.
- **Simplest fix:** Declare migrations schema-only from here on. Catalog data changes go through the admin form or the guarded dry-run-first script pattern (`revert-v700-v800-9135-cpu.ts` is a good template), and disaster recovery for catalog data relies on `scripts/backup-tables.ts` dumps. Add one header line to each historical data migration: "historical data, live values differ; restore catalog from backup".
- **Delete:** nothing yet; stop adding.

#### A-4. Should fix. VERIFIED code path, PLAUSIBLE trigger. A new price version silently re-activates and un-hides a SKU

- **Location:** `supabase/migrations/20260818000002_hide_ncd_skus_from_catalog.sql:25,27`; `20260702000001_price_versioning_append_only.sql:35-64`; traced to `scripts/push-prices.ts:513-527` (insert payload hard-codes `active: true` and omits `hidden_from_catalog`) and `:290-305` (any name, price, group or type difference produces a new row).
- **What is wrong:** `active` and `hidden_from_catalog` are per-SKU business decisions stored on per-price-version rows. Every new version row starts from `active = true` and the column default `hidden_from_catalog = false`.
- **Failure scenario:** The Master Sheet still lists an EOL SKU (for example `VX5-RAM-32GB`) or later gains an `-NCD` row, and its name or price changes. The next `push-prices.ts --target=all` inserts a fresh row that is active and visible; the price book, the Excel export and the recommender (`src/lib/recommend/candidates.ts:120`) show it to every partner, and the Pipedrive step relinks it, undoing ADR 0138 and the 2026-07-02 deactivations without any warning in the preview.
- **Simplest fix:** In `push-prices.ts`, copy `active` and `hidden_from_catalog` from `cur` when it exists, and print "would reactivate" in the preview if a sheet row targets an inactive SKU. Add a unit test. The structural fix is in the ADR 0076 challenge below.

#### A-5. Should fix. VERIFIED. `products` is described as append-only, and the database does not enforce it (claim 4)

- **Location:** `20260702000001_price_versioning_append_only.sql:8-10,64`; `20260521190350_step3_4_products_sku_pk.sql:87` (`trg_products_set_updated_at` still fires on UPDATE); `20260818000002_hide_ncd_skus_from_catalog.sql:27` (an UPDATE).
- **What is wrong:** There is no trigger, rule or grant that stops UPDATE or DELETE of a price row. Only `authenticated` lacks the grant; `service_role` and the SQL editor can overwrite history. Today the table is mutated by: the same-day upsert on `(sku, effective_date)` that overwrites `msrp` (`push-prices.ts:540-541`), the `pushed_to_pipedrive_at` stamp, the hand `UPDATE ... active = false` for EOL SKUs (JOURNAL 2026-07-02), the hide-NCD migration, and `test-rls.ts:296-316`, which inserts and deletes a row in the live `products` table.
- **Failure scenario:** One hand UPDATE of `msrp` in the SQL editor rewrites history. ADR 0141's "last repricing date" and any audit of what a partner was quoted on a given date then read a price that never existed on that date.
- **Simplest fix:** A BEFORE UPDATE trigger that raises if `sku`, `msrp`, `price_type` or `effective_date` change (allow `pushed_to_pipedrive_at`, `active`, `hidden_from_catalog`, `updated_at`), and a BEFORE DELETE trigger that raises. Decide whether same-day corrections stay allowed; if so, document that the guarantee is "append-only across days". Move test 9b off production first (A-9), or it will be blocked.

#### A-6. Should fix. VERIFIED code, PLAUSIBLE performance. Role checks are duplicated, evaluated per row, and inconsistent about suspension

- **Location:** `20260515193702_initial_schema.sql:131-145` (`is_admin(uid)` checks `status = 'active'`); `20260605000004_fix_partners_internal_recursion.sql:13-24` (`is_internal(uid)` does not check status); `20260615000001_rls_perf_consolidation.sql:11` (claim that the function result "is cached per distinct argument within the statement").
- **What is wrong:**
  - `public.is_internal((select auth.uid())) or public.is_admin((select auth.uid()))` is repeated in at least 14 policy expressions across `project_quotes`, `access_requests`, `submission_internal_archives`, `pipedrive_deal_cache`, `partners` and `submissions`, plus the Project Portal tables per the uploaded JOURNAL.
  - Only the argument is wrapped. Postgres does not memoize STABLE function results across rows, and a SECURITY DEFINER SQL function is never inlined, so each call runs its own EXISTS lookup for every row that reaches that branch of the OR. The ADR 0055 rationale is therefore wrong for the helpers, though correct for `auth.uid()`.
  - A suspended internal user keeps cross-partner SELECT on partners, submissions, project quotes and access requests at the database level, while the app gate requires "active AND is_internal" (JOURNAL line 6319).
  - Because the helpers take a `uid` parameter and `authenticated` may EXECUTE them, any user can call `rpc('is_admin', {uid})` to learn who is staff.
- **Failure scenario:** An internal rep is suspended after leaving; their still-valid JWT reads every partner's submissions and quotes through PostgREST. As `submissions` grows, a partner listing their own quotes pays two function calls per foreign row.
- **Simplest fix:** One no-argument `public.is_staff()` (active and (admin or internal)) and a no-argument `public.is_admin()`, both reading `auth.uid()` inside, called as `(select public.is_staff())` so the planner runs each once per statement. Replace the 14 copies in one migration. Revoke the old `uid` overloads afterwards.

#### A-7. Should fix. VERIFIED. "One preferred quote per project" lives in app code, is non-atomic, and crosses partners for admins

- **Location:** `20260527182010_step5_submission_lifecycle.sql:8-9` (claims a case-insensitive free-text match "rules out a DB partial unique index"); traced to `src/app/(app)/submissions/actions.ts:79-108`.
- **What is wrong:** A partial unique index on an expression is ordinary Postgres: `unique (partner_id, lower(btrim(project_name))) where is_preferred`. The app sets the new preferred row first and clears others in a second statement, leaving two preferred rows on failure (a state the code accepts). The clearing query filters only by `is_preferred` and project name and relies on RLS for scope.
- **Failure scenario:** An admin marks one of their submissions preferred on project "Main Campus". RLS lets an admin read and update every partner's rows, so the action clears `is_preferred` on every other partner's "Main Campus" quote.
- **Simplest fix:** Add the partial unique index (Andy first runs a read-only query for existing duplicates), and replace the two statements with one: `update submissions set is_preferred = (id = $target) where partner_id = $owner and lower(btrim(project_name)) = $name and (is_preferred or id = $target)`.

#### A-8. Should fix. VERIFIED. Rollbacks are missing for 15 migrations and several existing ones are stale or cannot run

- **Location:** `supabase/rollback/*`.
- **What is wrong:**
  - No rollback for: `20260515193702`, `20260519052732`, `20260529000001`, `20260529000002`, `20260601000001`, `20260605000001`, `20260605000002`, `20260605000003`, `20260605000004`, `20260611000001`, `20260717000001`, `20260724000001`, `20260817000001`, `20260818000001`, `20260818000002`. The last three schema-changing ones postdate the rollback convention.
  - `phase-8-step-c-rollback.sql` and `on-behalf-target-visibility-rollback.sql` drop policies that `20260615000001` already removed. Today they "succeed" and change nothing; internal and on-behalf reads continue through `submissions_select_authorized`.
  - `rls-perf-consolidation-rollback.sql` would reinstate the `status is null or status = 'draft'` delete gate; since ADR 0081 no row can hold either value, so partners silently lose delete.
  - `step-5-rollback.sql` and `phase-7-step-1-rollback.sql` drop `status` and `on_behalf_of_partner_id`, which current policies reference, so Postgres refuses the drop and the script fails.
  - `pipeline-status-model-reduction-rollback.sql` re-adds a CHECK that rejects `'open'` while every row holds `'open'`, so it fails unless the July backup is restored first; its comment says restoring afterwards also works, which it cannot.
  - `price-versioning-append-only-rollback.sql` cannot run once any SKU has two versions (true since 2026-07-02).
  - Rollback filenames use phase names (`phase-10-step-5a`) instead of the migration timestamp, so pairing requires reading headers.
- **Failure scenario:** During an incident Andy runs the rollback that matches a policy problem; it either reports success while doing nothing or fails mid-way under pressure.
- **Simplest fix:** Name each rollback `<migration timestamp>_<slug>.rollback.sql`. Each rollback states "valid only while this is the newest migration touching <objects>"; when a later migration supersedes it, add a one-line SUPERSEDED header pointing to the newer rollback. Run every rollback in the offline harness from A-9 after replay. Fix the status rollback by mapping `'open'` to `'draft'` before re-adding the CHECK.

#### A-9. Should fix. VERIFIED. The only RLS test runs against production, and coverage has gaps at this commit

- **Location:** `scripts/test-rls.ts` (whole file; persona provisioning `:37-79`, teardown `:81-85`, live `products` write `:296-316`, gated block `:971-976`).
- **What is wrong:**
  - The suite provisions users in production, inserts rows into live `products`, `product_specs`, `camera_specs`, `project_quotes`, `access_requests` and both audit tables, and deletes audit rows afterwards. Only persona teardown sits in `finally`; an interrupted run leaves catalog and audit rows behind (the "RLS Hijack Co" persona is that failure mode).
  - Test IDs `20a` to `20h` are used twice (project quotes and access requests).
  - Missing cases at this commit: partner self-update of `partners` columns (added off-repo as block 23); partner column writes on `submissions` (A-1); `submission_internal_archives`, `pipedrive_deal_cache`, the `partner-logos` storage policies, the `current_products` view, `competitor_products` write denial, and a suspended internal user.
  - A PGlite harness that replays migrations, runs 121 to 135 checks, applies rollbacks and re-applies exists (uploaded JOURNAL lines 112-116, 74) but is outside the repository.
- **Failure scenario:** RLS changes can only be proven by writing to production; a policy regression on an untested table ships unnoticed.
- **Simplest fix:** Commit the PGlite harness under `scripts/` as the default offline check: replay all migrations, run the partner/internal/admin/anon matrix, run each rollback, re-apply. Keep `test-rls.ts` as a short live smoke test after each apply, with all seeded-row cleanup in `finally`. Add the missing cases listed above.

#### A-10. Should fix. VERIFIED. No history on `partners` or `submissions`, while the audit pattern exists twice

- **Location:** `20260515193702_initial_schema.sql:40-42` (only an `updated_at` trigger on `partners`); `20260727000001_product_specs_admin_editable.sql:92-173` and `20260729000001_datasheet_appliance_specs.sql:257-336` (two copy-pasted stamp and audit function pairs).
- **What is wrong:** Role, `is_internal` and `status` changes on `partners`, and status changes and hard deletes on `submissions`, leave no trace. ADR 0151's open question "was the hole ever used?" (uploaded JOURNAL line 232) cannot be answered from the database because no history exists. Meanwhile `product_specs_stamp_updated`/`appliance_specs_stamp_updated` and the two `*_write_audit` functions are identical except for the table name, and the uploaded JOURNAL describes a third audit table (`design_rules_audit`) with a shared trigger.
- **Failure scenario:** The next privilege or status abuse is again undetectable after the fact; a won deal deleted through A-1 leaves nothing behind.
- **Simplest fix:** One generic `audit.log` table (table name, row key, operation, actor, before, after) and one SECURITY DEFINER trigger function using `TG_TABLE_NAME`, attached to `partners` (UPDATE), `submissions` (UPDATE of status, DELETE), and reused by the spec tables when next touched.

#### A-11. Should fix. VERIFIED. Access-request dedup and email normalization live only in app code

- **Location:** `20260702000002_access_requests.sql:12,23`; traced to `src/app/(auth)/login/request-access-actions.ts:86-99`.
- **What is wrong:** "One pending request per email" is a count-then-insert in the action, and lower-casing is a comment ("stored lower-cased by the action").
- **Failure scenario:** Two concurrent submissions of the public form both pass the count and insert two pending rows; any future write path that skips the action stores mixed-case email and defeats the dedup.
- **Simplest fix:** `create unique index on access_requests (email) where status = 'pending'`, `check (email = lower(email))`, and `insert ... on conflict do nothing` in the action in place of the count query.

### Consider (at most five)

- **C-1.** Validate the three Phase A `NOT VALID` checks (`20260812000001_calculator_math_phase_a.sql:50,54,61`) with `alter table ... validate constraint`; the table is small and every row already passes per the apply note.
- **C-2.** Add indexes on the remaining unindexed foreign keys when next touching those tables: `project_quotes.generated_by`, `product_specs.updated_by`, `appliance_specs.updated_by`, `product_specs_audit.changed_by`, `appliance_specs_audit.changed_by`. Impact is low at current sizes; they matter only when a partner row is deleted.
- **C-3.** Adopt one naming convention for new objects: policies are `<table>_<cmd>_<who>` (today `select_all`, `select_authorized`, `select_self_admin_internal` and `select_internal_or_owner` coexist), triggers are either `trg_` prefix or `_trg` suffix (both exist).
- **C-4.** Point `supabase/config.toml` `[db.seed]` at nothing or disable it, since `seed.sql` does not exist.
- **C-5.** Add `check (cameras_managed_min is null or cameras_managed_max is null or cameras_managed_min <= cameras_managed_max)` on `appliance_specs` (`20260731000001_management_cameras_managed.sql`).

### 5. Complexity to remove

- `submissions.pdf_url`: zero references in `src/` or `scripts/` (ADR 0017 removed PDF storage).
- `products.max_cameras` and `products.max_storage_tb`: unread since ADR 0095, still carried forward by `push-prices.ts`. The NCD migration comment says it copies them from the base row and then inserts `null` (`20260818000001:61,66,71`). ADR 0095 already plans the drop.
- `product_specs.cpu_cores_threads` and `product_specs.cores_threads`: twin columns kept equal by hand; `20260914000001` had to set both and explains why. Keep one, or make the other a generated column.
- Duplicate stamp and audit trigger functions per table (A-10).
- 14 copies of the staff check in policies (A-6).
- Stale rollbacks that no longer apply (A-8): mark or delete.

### 6. Challenges to ADRs

- **ADR 0004 (migrations via `supabase db push`).** Practice since July is hand-apply in the SQL editor (STOP-AND-FLAG headers from `20260720000001` on, RUNBOOK section 6, JOURNAL line 4733). The ADR is still "Accepted" with no superseded note. Evidence: A-2.
- **ADR 0055 (InitPlan wrapping).** The `auth.uid()` part holds in the final replayed state. The stated reason that wrapping the argument makes `is_admin`/`is_internal` evaluate once per statement does not hold for SECURITY DEFINER STABLE functions. Evidence: A-6.
- **ADR 0076 (append-only `products`, attributes on version rows).** Its consequences accepted the RLS edge on the grounds that "deactivation is out of scope and the pipeline always writes active = true". Deactivation became in scope on 2026-07-02 (five SKUs hand-UPDATEd to inactive), ADR 0138 added a second per-SKU flag, and the pipeline's `active = true` default now undoes those decisions (A-4). Under `security_invoker`, RLS filters version rows before `DISTINCT ON`, so a partner can see an older active version of a SKU whose newest row is inactive, at the old price. The ADR's own revisit condition ("attribute churn") is met. Proposed: a one-row-per-SKU table for `active`, `hidden_from_catalog`, `sort_order` and group, joined in `current_products`; price rows keep only price fields.
- **ADR 0037 / 0081 (status-guarded delete as a DB-level guarantee).** The UI lets the owner move `won` to `open` and then delete, so the guard protects against accidents only. Either restrict the transition (A-1) or restate the ADR's guarantee.

### 7. Andy action items

1. Push the 2026-10-16 work (six migrations, rollbacks, apply notes 0151 and 0153, ADRs 0150 to 0157, test-rls blocks 23 and 24) and commit the PGlite harness into the repo.
2. Run read-only catalog queries against production and commit the output, to settle drift: `pg_policies`, `information_schema.role_table_grants` and `column_privileges` for `anon`/`authenticated`, `pg_trigger` on public tables, `pg_proc` with `proconfig` and `prosecdef`, and view `reloptions`.
3. Read-only data checks: (a) SKUs whose newest row is inactive while an older row is active: `select c.sku from current_products c where not c.active and exists (select 1 from products p where p.sku = c.sku and p.active and p.effective_date <= current_date)` (run as an admin or in the SQL editor); (b) duplicate preferred rows: `select partner_id, lower(btrim(project_name)), count(*) from submissions where is_preferred group by 1, 2 having count(*) > 1`; (c) duplicate pending access requests by `lower(email)`; (d) whether `VX5-RAM-32GB`, the other EOL SKUs, or any `-NCD` SKU are rows in the current Master Sheet (A-4).
4. Delete the "RLS Hijack Co" persona and any `RLS-*` rows left in `products`, `product_specs`, `camera_specs` and the audit tables from interrupted runs.
5. Approve the allow-list guard for `submissions` (A-1) and the `won`/`lost` transition rule.
6. Mark ADR 0004 superseded, and record the RLS edge decision for ADR 0076.

### 8. Not checked

- The six `20261016*` migrations (`20261016000001_partners_guard_self_update.sql` and `20261016000002` to `20261016000006`, 13 tables), their rollbacks, apply notes 0151 and 0153, ADRs 0150 to 0157, test-rls blocks 23 and 24, and the PGlite harness. None is in this commit; evidence about them comes only from the uploaded JOURNAL.
- The live database. No access; drift is an open question until Andy runs item 2.
- The "Project Portal brief" named in the plan: not in this repository or Drive.
- Storage, grants and SECURITY DEFINER hygiene in depth (for example the public bucket SELECT policy, default privileges on the `current_products` view, `camera_aliases_text` without a pinned `search_path`). These belong to security-review's matrix for this slice.
- Typecheck, lint and unit tests: node_modules absent.
- Seed data values in `20260529000002` and `20260624000001` (competitor specs): not checked for accuracy.
- Full JOURNAL: read by targeted grep only. Git history is shallow (50 commits), so `git log --all` cannot prove absence in older history; file absence at HEAD is what this review relies on.
- Fresh-replay behaviour of the explicit `begin;`/`commit;` in `20260818000001` under the CLI's own transaction: plausible issue, not verified.

### Claims verified

1. **ADR 0151 guard and ADR 0150 fix landed 2026-10-16.** Live: yes, per the uploaded JOURNAL (lines 193-253 and 255-319, applied and verified by Andy). In this commit: no. `git ls-files` lists no `20261016*` migration, no `partners-guard-self-update-rollback.sql`, no apply note 0151 or 0153, and no ADR 0150 to 0157. No commit message mentions them (`git log --all`, newest commit 6201569 at 2026-10-16 12:41 -0700), the repo JOURNAL's newest entry is 2026-10-15, `partners` still has table-wide UPDATE with a self-or-admin policy and only the `updated_at` trigger, and `scripts/push-prices.ts:599` still sends `active_flag: false`.
2. **CLI versus hand-apply.** Hand-apply in the SQL editor is the practice at this commit (STOP-AND-FLAG headers from `20260720000001` on; RUNBOOK section 6 note; `migration repair` incident in JOURNAL line 4733). ADR 0004 and RUNBOOK line 122 still describe `db push`. Drift detection: none. There are 10 apply notes with ad hoc verification queries, covering roughly 17 of 44 migrations, plus occasional `supabase migration list`, which tracks version numbers only. The 2026-10-16 repo-versus-live gap is the current instance (A-2).
3. **ADR 0055 wrapped auth calls everywhere.** Confirmed for `auth.uid()`: every policy in the final replayed state uses `(select auth.uid())`; the only bare calls left are inside trigger bodies, where per-row evaluation is intended. Refuted for the helper functions: `is_admin(...)` and `is_internal(...)` calls themselves are not wrapped and run per row (A-6).
4. **ADR 0076 prices are append-only.** Refuted: no database enforcement exists, and the table is updated in practice (A-5).

### Known issues status

- **ADR 0151 (partners self-update of `role` and `is_internal`):** fixed live 2026-10-16 per uploaded JOURNAL lines 193-233. Open in the repository at this commit: `20260515193702_initial_schema.sql:163` grant plus `20260615000001_rls_perf_consolidation.sql:65-67` policy, no guard trigger. The same column-level hole remains on `submissions` (A-1). The "was it ever used" query is still open, and no history table can answer it (A-10). KNOWN.
- **ADR 0150 (`active_flag: false` deletes Pipedrive products):** mostly out of slice. Fixed live and in Andy's unpushed checkout per uploaded JOURNAL lines 255-300. At this commit `scripts/push-prices.ts:599` still sends `active_flag: false`. KNOWN.
- **Pipedrive v1 and name-based upserts; `ensureCustomFields()`:** out of this slice; not checked.
- **100 duplicated legacy Pipedrive codes; `VX5-RAM-32GB` portal-inactive but linkable:** Pipedrive side out of slice. Database side: `VX5-RAM-32GB` was set inactive by hand UPDATE on 2026-07-02, and A-4 shows a later price version would re-activate it. The uploaded JOURNAL (line 289) says the next push would retire it via `is_linkable`. KNOWN.
- **"RLS Hijack Co" live persona:** still open per uploaded JOURNAL line 53-54 ("it should be deleted"). The persona name appears nowhere in this commit's `test-rls.ts`, which is consistent with it coming from the uncommitted block 23. Cleanup of seeded rows outside `finally` is the general cause (A-9). KNOWN.
- **Hand-applied migrations and drift:** confirmed structural and current. The repo lacks six live migrations and the final catalog data state; no drift detection exists (A-2, A-3). KNOWN, now with evidence.
