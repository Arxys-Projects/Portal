# Baseline review plan: Arxys Partner Portal

Place at `docs/reviews/BASELINE-PLAN.md`. Written 2026-10-19 from a planning session with Andy. This file is the source of truth for the baseline audit. Each group below is one Claude Code session, run in order, one at a time.

**Recommended model:** Opus 5.5 (re-check the current Opus tier before starting) · **Effort:** xhigh for the orchestrating session. Reviewer subagents: security at xhigh, architect at high or xhigh as each group states.
**Why Opus:** adversarial review needs cross-file tracing and judgment about reachability. The orchestrating session only coordinates and writes reports, so its context stays small.

**Status:** Not started. Next: Group 1.

## Purpose

The portal has never had a systematic review. ADR 0151 (partners could edit their own `role` and `is_internal` until 2026-10-16) shows that holes can sit in production unseen. This audit produces a ranked, evidence-backed backlog of must-fix, should-fix and needless-complexity findings. It changes no code.

## How to run this plan

- One group per session. Start every session by reading this file in full, then `AGENTS.md`, `docs/README.md`, the ADR index (list the titles in the decisions folder), and the Project Portal brief for its locked decisions.
- Do not read the whole JOURNAL (about 857 KB). Read the newest 300 lines and search it for specific topics when a finding needs history.
- Stop at the end of every group. Report, then wait for Andy before the next group.

## Preflight (every group)

1. Run `git status` and `git rev-parse HEAD`. Record the commit hash in every report. A finding is only valid for the commit it was made on. Parallel sessions share this checkout, so if the tree is dirty with changes you did not make, say so and review the committed state.
2. Confirm the `review-gate`, `architect-review` and `security-review` skills load. If any does not, stop and tell Andy. Do not improvise a weaker review.
3. Create `docs/reviews/` if it is missing. Check every filename you plan to write is free.

## Standing rules (non-negotiable)

- **Read only.** Change no source, config, migration or dependency. No fixes in this audit, however small. Log them instead.
- No `git push`. No `supabase db push`. No live Pipedrive, Supabase, Vercel or email writes.
- **Never run `scripts/test-rls.ts` or any script that touches production** (it uses live test personas). Review its coverage by reading it. Andy runs live checks.
- Allowed commands: read, grep, glob, `git log`, `git diff`, `git show`, `tsc`, lint, unit tests that you have confirmed use mocks and make no network or database calls, and `npm audit` and `npm outdated` (registry reads only). If unsure whether a test touches the network or database, do not run it.
- Never print a secret value. Name its location and type and redact it.
- The only files you may create or edit are under `docs/reviews/`, plus one short JOURNAL entry per group. Commit locally at the end of the group, adding only those paths explicitly. Andy pushes.
- Write plain, direct prose. Never use em dashes. Never use "not X, but Y" or "it is not X, it is Y" constructions.

## Method (for every slice in a group)

1. **Scope discovery.** Glob the paths listed for the slice, add anything the globs reveal that belongs in it, and write the final file list into the slice report. Do not review files outside the slice unless tracing a call requires it, and say when you did.
2. **Invoke `review-gate`** with the slice as an explicit area scope (a list of paths, not a diff). The gate launches `architect-review` (area mode) and `security-review` in parallel as fresh subagents. Tell the gate:
   - This is baseline mode. Raise the finding cap to 20 per reviewer. Keep dropping anything without a reachable path.
   - Pass the slice's emphasis from the group section below.
   - Pass the known-issues list below as "verify status, do not report as new".
3. **Your own context stays small.** You coordinate and write reports. Do not read the slice's source yourself beyond scope discovery.
4. **Write the slice report** to `docs/reviews/YYYY-MM-DD-baseline-slice-N-NAME.md` using the gate's output format. Add an appendix with the slice's inventory or matrix where the group section asks for one.
5. **Update the backlog** `docs/reviews/BASELINE-BACKLOG.md` (create it in Group 1). One table row per finding with these columns: ID, slice, source (security or architect), severity, VERIFIED or PLAUSIBLE, location (file:line), summary, simplest fix, owner (build session or Andy), status (open, known, accepted risk, fixed, wontfix), fix group (blank until Group 6). Finding IDs use the form `B3-S-4` (slice 3, security, number 4) and `B3-A-2` (architect). Dedupe against existing rows, keep both IDs on a shared root cause.
6. **Stop conditions.** If a slice finds a live secret or an actively exploitable production hole, finish writing that slice's report with a banner at the top, tell Andy at once, and do not start the next slice until he replies.

## Known issues (verify current status, tag KNOWN, do not report as new)

- ADR 0151: partners could update their own `role` and `is_internal`. Fixed by a guard trigger on 2026-10-16. Verify the guard covers every sensitive column and every write path.
- ADR 0150: the price push deleted Pipedrive products through `active_flag: false`. Fixed 2026-10-16. Verify no other code path sends it.
- The partner path still uses Pipedrive v1 (out of support since 2026-08-01, still answering) and name-based upserts: `upsertOrganization` (`contacts.ts:27`), `upsertPerson` (`contacts.ts:6`), the deal owner lookup by the name "Andy Newbom" (`lookups.ts:113`), the `groupIntoDeals` company key (`forecast.ts:84`), and the 14-day duplicate guard `ilike` (`calculator/actions.ts:277`).
- `ensureCustomFields()` in `lookups.ts` creates any field listed in `CUSTOM_FIELDS` on the next deal write from any path.
- 100 legacy Pipedrive product codes are duplicated. `VX5-RAM-32GB` is portal-inactive but still linkable.
- A leftover live test persona "RLS Hijack Co" (`rls-test-a-1792186404373@arxys-rls-test.invalid`) exists from an interrupted RLS run.
- Migrations are applied by hand in the SQL editor, so the live database may have drifted from the migration files. Treat drift as an open question until Andy runs the verification queries.

## Group 1: Data and access layer, then auth and app shell (security leads)

### Slice 1: Data and access layer

**Scope:** `supabase/migrations/**`, `supabase/rollback/**`, `docs/apply-notes/**`, any seed SQL, and `scripts/test-rls.ts` (read for coverage, never run).
**Emphasis:** security xhigh, architect high.

Required deliverables in the slice report:

- **Effective policy matrix.** There is no live database access, so replay the migrations in order (later ones override earlier ones) and build one row per table: RLS enabled, policies per command with USING and WITH CHECK text, guard triggers, grants to anon and authenticated, and which SECURITY DEFINER functions touch it. Also list every function (with `search_path` and EXECUTE grants), every view (with `security_invoker` status) and every storage policy.
- **Live verification queries for Andy.** Write read-only SQL for the Supabase SQL editor that reproduces the matrix from the live catalogs (`pg_policies`, `pg_tables.rowsecurity`, `pg_proc`, `information_schema.role_table_grants`, view options) so Andy can diff live against the migrations. Mark clearly that they are read only.
- **test-rls.ts coverage map.** For every table, policy and column guard, say whether a partner-denied case and an internal-allowed case exist. Missing cases are findings.

Security focus: UPDATE policies without WITH CHECK, column-level escalation, `user_metadata` used in authorization, SECURITY DEFINER hygiene, views bypassing RLS, grants, service-role-only tables reachable by anon, storage buckets.
Architect focus: constraints and unique indexes in place of app logic, RLS performance (`(select auth.uid())`), indexes on foreign keys and policy columns, migration ordering and rollback quality, duplicated role-check logic across policies, naming consistency, audit triggers.

### Slice 2: Auth and app shell

**Scope:** middleware, auth routes and pages (login, signup gating, invites, password reset, access requests), Supabase client creation (`src/lib/supabase/*` or equivalent), role helpers, the admin panel's gating, layouts, `next.config.*`, `vercel.json`, `.env.example`, and any code reading environment variables.
**Emphasis:** security xhigh, architect high.

Required deliverables:

- **Service-role inventory.** Every place the service-role key is read or a service-role client is created, with the file, the caller, why it is needed, and what authorization check guards it.
- **Dashboard checklist for Andy.** The reviewer cannot see dashboard settings, so list exactly what Andy should confirm: Supabase auth redirect URL allowlist, email confirmation, signup gating, password policy, JWT expiry, Vercel preview deployment protection, env var scoping between production and preview, and which keys exist in each environment.
- **Framework version note.** Report the Next.js, `@supabase/ssr` and `@supabase/supabase-js` versions and check them against current advisories (including the 2025 Next.js middleware authorization bypass, CVE-2025-29927).

Security focus: authorization resting on middleware alone, open redirects, signup and invite abuse, email enumeration on login and reset, cookie flags, security headers and CSP, `NEXT_PUBLIC_` exposure, `server-only` usage.
Architect focus: how many places check roles and whether they share one helper, auth structure, config sprawl.

### Group 1 finish

Create `BASELINE-BACKLOG.md`. Report per slice: verdict, counts by severity, top five findings, consolidated Andy action items (run the verification queries, confirm dashboard settings), and anything urgent. Recommend whether to proceed to Group 2.

## Group 2: Server actions and routes (security leads)

### Slice 3: Every entry point

**Scope:** every file containing `"use server"`, every `route.ts` and `app/api/**` handler, including `calculator/actions.ts`, `comparison/actions.ts`, `admin/submissions/actions.ts`, quote and PDF download routes, and cron or webhook routes.
**Emphasis:** security xhigh, architect high.

Required deliverable in the slice report: an **entry-point inventory** with one row per exported action or handler: file and name, who calls it, how it authenticates, which role it requires, how input is validated (schema, ad hoc, none), whether it uses a service-role client, what it writes (tables and external systems), and what it returns. Review the highest-risk rows in depth and give every row at least a one-line verdict.

Security focus:

- Authorization inside each action, never trusting middleware or hidden UI.
- IDOR on submission, project, quote, partner and company ids.
- Mass assignment from client objects.
- Whether the server recomputes figures or trusts client-sent values banked into submissions.
- Validation of `on_behalf_of_partner_id` (active, non-internal) and of any other id the client supplies.
- The 14-day duplicate guard and its bypasses.
- Double-submit and replay.
- Rate limiting on any action that sends email or writes to Pipedrive.
- Error and log leakage.
- Cron and webhook authentication.

Architect focus: repeated auth boilerplate that should be one helper, oversized action files, mixed pure logic and I/O, inconsistent validation and error handling, dead actions.

Constraint for recommendations: the partner self-serve path (full calculator, Quick Calc, Register a Deal) must stay bit-identical. Any fix that could change its output is flagged as such.

### Group 2 finish

Update the backlog. Same report format as Group 1.

## Group 3: Pipedrive integration, then scripts and supply chain

### Slice 4: Pipedrive

**Scope:** `src/lib/pipedrive/*` (`contacts.ts`, `deal.ts`, `lookups.ts`, `product-sync.ts`, `product-api.ts`, `company-api.ts`), `scripts/push-prices.ts`, `scripts/sync-pipedrive-companies.mts`, and the admin relink action.
**Emphasis:** security xhigh, architect xhigh.

Required deliverables:

- **v1 endpoint inventory.** Every Pipedrive v1 call still in use, with call site, purpose, and the v2 replacement if one exists. Propose a migration order that keeps the partner path bit-identical until each piece is proven.
- **Write-path map.** Every code path that writes to Pipedrive, which flag or confirmation gates it, and whether it is idempotent.

Security focus: token handling and logging, least privilege, destructive operations (`active_flag: false`, deletes), partner-typed text flowing into Pipedrive fields, whether confirmation gates in scripts can be bypassed, 429 handling that could cause retry storms.
Architect focus: the v1 and v2 split and duplication between clients, rate-limit handling, name-based resolution, the `ensureCustomFields()` side effect on every deal write, price single source of truth (any second copy of Pipedrive prices), retry and partial-failure design.

### Slice 8: Scripts, operations and supply chain

**Scope:** `scripts/**`, `backups/**` (check what is in it and that it is gitignored and excluded from deploys), `.gitignore`, `.vercelignore`, `package.json`, the lockfile, CI config, `docs/RUNBOOK.md`.
**Emphasis:** security xhigh, architect high.

Required deliverables:

- **Secret scan result.** Scan the working tree and git history for key-like strings. Use gitleaks or trufflehog only if already installed, otherwise targeted `git grep` and `git log -S` patterns. Redact every value.
- **Dependency report.** `npm audit` and `npm outdated` output summarized, dependency count, packages with install scripts, anything unmaintained, and any package that duplicates a platform or framework feature.
- **RUNBOOK accuracy check.** Does the RUNBOOK still match reality (setup, env vars, deploy, key rotation, restore)?

Security focus: committed `.env` files, secrets in history or journals or backups, scripts that act on production without a typed confirmation, PII in `backups/`.
Architect focus: script sprawl and overlap, one-off scripts that should be deleted, dependency weight, missing operational runbooks (incident, restore, key rotation).

### Group 3 finish

Update the backlog. Same report format.

## Group 4: Documents and output, then calculator and recommender

### Slice 5: Documents and output

**Scope:** `src/lib/project-quote/*`, the estimate, Project Quote and comparison PDF renderers, the XLSX price book download, the HTML price book, all email and SMTP code (deal-registration email, branded auth emails), and file delivery routes.
**Emphasis:** security xhigh, architect high.

Security focus: can partner A fetch partner B's quote, estimate or price book (guessable paths, missing ownership checks, signed URL handling); injection into HTML email, PDFs, and XLSX or CSV (formula injection for values starting with `=`, `+`, `-`, `@`); email header injection and reply-to taken from user input; price integrity (prices only from Pipedrive, no partner influence); information in PDF metadata.
Architect focus: renderer duplication after the unified renderer work, whether a maintained PDF or XLSX library is used in place of custom code, snapshot schema design, generation inside the request path against serverless time limits, partial-failure behavior.

### Slice 6: Calculator and recommender

**Scope:** `src/lib/recommend/{algorithm,candidates}.ts`, `src/lib/calculator/{compute,rehydrate}.ts`, the golden and recommender tests, calculator and Quick Calc client components, and the `input_state` normalizers and version handling.
**Emphasis:** architect xhigh, security high.

Architect focus: algorithm clarity and determinism, tie-break rules, golden test adequacy (do they prove the bit-identical claims or only assert them), the "no price math in the portal UI" rule (search client components for price arithmetic), `calc_version` and `input_state` version discipline, rehydrate path safety across versions, dead options.
Security focus: input bounds (huge counts, NaN, Infinity, negative values), whether the server recomputes everything it banks, trust placed in client-sent figures.

Extra deliverable: **"Implications for Step 3"**, at most ten lines, telling the Project Portal Step 3 builder what to know about the recommender's structure, candidate filtering and tie-break behavior before adding `excludeOneU` and `recommendFailover`. Step 3 stays on hold until this slice reports.

### Group 4 finish

Update the backlog. Same report format. Tell Andy that Step 3 can now start.

## Group 5: Projects, pipeline and remaining app surface, then the static site

### Slice 7: Projects, pipeline, companies and the rest of the app

**Scope:** `src/lib/projects/*`, `src/lib/pipeline/forecast.ts`, `src/lib/companies/*`, submissions lifecycle, My Pipeline and partner pipeline views, project name autocomplete, comparison tools, QuickCompare, VMS Selector, validation sheets, and everything else under `src/app/**` and `src/components/**` not covered by earlier slices.
**Emphasis:** security high, architect xhigh.

Security focus: partner-to-partner leakage through autocomplete, aggregates, forecasts and caches; full database rows passed as props to client components; `dangerouslySetInnerHTML` and other XSS sinks; links built from user input.
Architect focus: component size and complexity, client versus server split, bundle weight, duplicated UI logic, dead pages and stale feature flags (list every flag with default and owner), name-keyed grouping that should use ids.

### Slice 9: arxys.com static site

**Scope:** the static site's HTML, CSS, JS, forms, `vercel.json` or header config, third-party scripts, `robots.txt` and sitemap.
**Emphasis:** security high, architect high.

If the static site is not in this checkout, skip the slice, record "not reviewed: repository not available" in the report, and tell Andy which repository path or URL is needed.

Security focus: inline scripts and handlers, `innerHTML` with data, third-party scripts without SRI, `target="_blank"` without `rel="noopener"`, form endpoints and spam control, email header injection, CSP and HSTS, secrets or internal URLs in JS, exposed `.git`, source maps and backup files.
Architect focus: any framework or build step where plain HTML works, JavaScript doing what CSS or native elements do (`dialog`, `details`, `:has`, grid, container queries), image weight, duplicated CSS. Stay out of SEO content and meta tags, which belong to the `arxys-seo` skill.

### Group 5 finish

Update the backlog. Same report format.

## Group 6: Cross-cutting review and consolidation

Inputs: every slice report and the backlog. Run `architect-review` and `security-review` through `review-gate` in area mode with the whole repository structure as scope and the slice reports as supporting input.

**Architect cross-cut:**

- Duplicated logic and inconsistent patterns across areas (auth helpers, validation, error handling, naming).
- Module boundaries and dependency direction.
- Documentation sprawl: JOURNAL size, ADR count, ADR index quality, superseded ADRs.
- Feature flag inventory with default, owner and removal plan.
- Test strategy map: which areas have strong tests, which have none.
- Operational readiness: logging, monitoring, alerting, backups, restore, incident and key-rotation runbooks.
- Vendor and cost exposure (Vercel, Supabase, Pipedrive).

**Security cross-cut:**

- Attack-path chaining across slices (for example an information leak plus an IDOR becoming an escalation).
- For each threat actor A to G, the top three attack paths and which findings enable them.

**Consolidation deliverables:**

1. **`docs/reviews/BASELINE-SUMMARY.md`**: a plain-language executive summary for Andy: counts by severity and slice, the top ten risks, the Andy-only action list (verification queries, dashboard settings, key rotations, deletions), and open disagreements between reviewers.
2. **Backlog re-ranked and grouped into proposed fix groups** (F1, F2, ...), each sized as one Claude Code session, with order, dependencies, risk, the review-gate requirement, and a note on whether it can touch the partner path. Security Critical and High items come first.
3. **Recommended review cadence:** when the gate runs during normal development (every step, before migrations are applied, before live writes), and when to repeat a full baseline.
4. **Suggested gate lines** for the Project Portal brief's remaining steps. Propose the text and do not edit the brief.

Do not write the fix prompts. Andy and the planning session write those after reading the summary.

## Out of scope

Fixing anything, applying migrations, rotating keys, deleting the leftover test persona, SEO content review, accessibility audit (a separate `design:accessibility-review` pass if wanted), and penetration testing against production.

## Kickoff prompt template

> **Model:** Opus 5.5 · **Effort:** xhigh
>
> Read `docs/reviews/BASELINE-PLAN.md` in full, then `AGENTS.md`, `docs/README.md`, the ADR index and the Project Portal brief. Run the preflight, then execute **Group N only**, following the plan's method, standing rules and the group's slice sections. This is a read-only audit: change no source, run no live scripts, and do not push. Stop at the group's finish step and report.
>
> Previous group: `docs/reviews/BASELINE-BACKLOG.md` and the slice reports it references (none for Group 1).
