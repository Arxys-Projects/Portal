# Portal Phase 3 — Partner experience + integrator tooling

> **Status: Active.** Phase 3 Step 1 closed 2026-05-26 (custom domain cutover). Steps 2–7 in progress. Scope extends ADR [`0036-phase-2-closure-and-phase-3-scope.md`](./decisions/0036-phase-2-closure-and-phase-3-scope.md) — see Locked decisions below.

Portal Phase 2 closed 2026-05-22 with the MVP feature-complete: real MSRPs live, partner XLSX download shipped, HTML price book at `/price-book` live, and the SKU-PK schema migration landed cleanly. Phase 3 takes the project from "internally validated MVP on the vercel.app domain" to **"partner-ready product with integrator-facing tooling, on the canonical `portal.arxys.com` domain."** Custom domain cutover is complete (Step 1). The remaining work delivers partner UX polish, calculator improvements, project lifecycle + pipeline view, partner discount mechanic, customer-facing white-label PDF, and an observability foundation.

The 2–3 partner cohort invite originally locked for Phase 3 in ADR 0036 is managed by Andy outside the codebase rather than as a coded step. Phase 3 is considered ready for cohort outreach once Steps 2–7 land.

## Naming (per ADR [0029](./decisions/0029-phase-2-step-naming-convention.md))

- **Portal Phase 3** = this work.
- **Phase 3 Step N** = a discrete work unit inside Portal Phase 3. Numbered from 1.
- "Phase 3" with no qualifier means Portal Phase 3.

## Locked decisions

These resolve scoping questions surfaced during Phase 3 strategy. They're enumerated here so each Step's scoping brief inherits them rather than re-litigating.

- **No cohort-invite step in code.** ADR 0036's "2–3 partner cohort invite" is managed by Andy directly (invitations, support channel, feedback collection) without portal-side automation. Phase 3 closes when Steps 2–7 land.
- **Hard-delete submissions deferred to Step 5.** The original "A3 hard delete with confirm dialog" item is incompatible with submissions that carry business state (`won` / `lost` / `on-hold`). A3 is bundled into Step 5 where it's designed alongside the status enum: delete permitted only when status is `draft` or unset; non-draft submissions retained.
- **Project name UX = autocomplete from partner's previous project names.** Submission grouping requires reliable project-name matching. Free-text + fuzzy match is fragile; a projects table is over-engineered for current scale. Step 4 brief locks autocomplete-from-prior with case-insensitive grouping as a fallback.
- **Deal Registration = email button only, not a workflow.** The full partner-portal deal-reg pattern (admin approval, status states, conflict resolution, time-bounded protection) is out of scope for Phase 3. The Step 2 implementation is a single dashboard button → Server Action → email to Andy containing partner ID, project name, and a free-text body. No schema, no admin UI. Justified by small partner base and low overlap risk.
- **Schema migrations bundled by feature affinity, not one-per-feature.** Three migrations land across Phase 3, each paired with its consuming feature(s): Step 4 (`submissions.input_state` JSONB), Step 5 (`submissions.status` enum), Step 6 (`partners.discount_tier` + `partners.logo_url` + `partners.contact_block` bundled). Each follows the Free-tier JSON-dump + rollback SQL pattern from Phase 2 Step 3+4 (per ADR [0031](./decisions/0031-step-3-4-schema-migration.md)).
- **No Google Slides automation.** Carried from ADR [0030](./decisions/0030-phase-2-scope-and-locked-decisions.md). The HTML price book is the price-list surface; Slides remains a non-thing.
- **`portal-arxys.vercel.app` left live as a fallback.** Step 1 cutover did not redirect or take down the original Vercel URL. Both work; `portal.arxys.com` is canonical.
- **A7 product-page white-space reduction dropped.** Subjective with no measurable success criterion. May resurface in a later phase if cohort feedback warrants.
- **VMS-specific notes per quote deferred** to a future phase. Useful but not load-bearing for cohort readiness.

## Work-unit table

| # | Title | Blocker | Model | Schema | Notes |
|---|---|---|---|---|---|
| **Phase 3 Step 1** | Custom domain `portal.arxys.com` | None | — | None | ✅ Closed 2026-05-26. CNAME + Vercel domain attachment + Supabase Site URL flip + redirect URL allow-list + email template `{{ .SiteURL }}` confirmed via password-reset smoke test. JOURNAL entry only; no ADR. |
| **Phase 3 Step 2** | Portal polish + Support + Docs scaffold + Deal-Reg email button | Step 1 | Sonnet 4.6 | None | Largest single step by file count. Folds: dashboard title + card styling (A1), shared footer (A2), price book header copy (A4), Windows Server + warranty images (A5), Enterprise Grade box (A6), H.265 performance card (B5), arxys.com link additions (B6), Support box on dashboard (support docs link + open-ticket button to `arxys.supportsystem.com`), Documentation library scaffolding per family with starter content, Deal-Registration email button. Pre-seeded scoping brief strongly recommended. |
| **Phase 3 Step 3** | Calculator UX upgrade | Step 1 | Sonnet 4.6 | None | Submit button repositioning with disabled→enabled state (B1), smooth result animation (B2), product detail links in calculator results (B3), product link from submission history rows (B4). A3 hard-delete intentionally deferred to Step 5. |
| **Phase 3 Step 4** | Project grouping + Input persistence + Update Calculations | Step 3 | Opus 4.7 | Migration #1: `submissions.input_state` JSONB | Autocomplete project names from partner's prior submissions. Persist full calculator input state on submit. "Update Calculations" button on submission history → loads inputs into calculator → new submission inherits project name. JSON-dump backup + rollback SQL per ADR 0031 pattern. |
| **Phase 3 Step 5** | Submission lifecycle + Pipeline view + A3 hard-delete revisited | Step 4 | Opus 4.7 | Migration #2: `submissions.status` enum | Status enum (`draft` / `sent` / `won` / `lost` / `on-hold`). Partner pipeline view UI — list grouped by project name, filterable by status. A3 redesigned with status guard: delete permitted on `draft` only. Closes the deferred A3 question + ships pipeline in one coherent piece. |
| **Phase 3 Step 6** | Partner discount mechanic (PQ3) + White-label customer PDF | Step 5 | Opus 4.7 | Migration #3 (bundled): `partners.discount_tier` + `partners.logo_url` + `partners.contact_block` | PQ3 resolution: per-partner discount tier. Partner-facing price display picks up tier. White-label customer-facing PDF: strips partner-price row, adds partner logo + contact block. ADR closes PQ3 properly. Largest single step in the phase — split into 6a (discount) + 6b (white-label) at execution time if context budget requires. |
| **Phase 3 Step 7** | Customer-facing bandwidth report + Observability foundation | Step 6 | Sonnet 4.6 | None | Alternate UI on the existing recommendation algorithm exposing a partner-facing bandwidth + storage report for customer pitches; automated daily JSON-dump backup via GitHub Action consuming `scripts/backup-tables.ts`; `/admin/health` page (env presence, DB reachable, last successful push timestamp). Each piece is too small to justify its own step. |

## Open questions to lock when each Step gets its brief

These don't block Phase 3 as a whole, but each Step's scoping brief opens with these.

- **Step 5** — A3 hard-delete: is `draft`-only the right cutoff, or do `lost` submissions also become deletable after a retention window? Default: `draft`-only.
- **Step 6** — Discount tier admin surface: free-text percent per partner (e.g. `12`) or named tiers (`gold / silver / bronze`)? Set via Server Action only (no admin UI), or admin form? Default: free-text percent, Server Action only.
- **Step 6** — Ship as one Step or split 6a + 6b at execution time? Decide at brief-writing based on Steps 4 + 5's actual session sizes.
- **Step 7** — Observability scope: minimum viable (backup + health), or add submission analytics (top SKUs, partner activity)? Default: minimum viable; analytics is Phase 4.
- **Cohort readiness gate** — what's the checklist Andy uses to decide "Phase 3 is done, time to invite partners"? Not codified here; lives with Andy outside the docs.

## How each Phase 3 Step gets scoped

Same pattern as Phase 2. Each scoping brief at `docs/phase-3/step-N-<short-title>.md` covers:

1. Andy's dashboard / account / manual prereqs (separated from code work).
2. Code work, with file-level task list.
3. Verification gates (build, lint, test, RLS, smoke).
4. Definition of done.
5. Open questions to lock before execution.

Brief generation is itself a session — Claude (chat) drafts the brief, Andy reviews/edits, then a fresh Claude Code session (Opus or Sonnet per the table above) executes against the locked brief. This pattern produced clean Phase 2 deliverables.

## References

- [`JOURNAL.md`](./JOURNAL.md) — Phase 2 closure entry (2026-05-22) for the trigger event; Phase 3 Step 1 entry for the domain cutover.
- [`phase-2-plan.md`](./phase-2-plan.md) — predecessor plan; this doc mirrors its shape.
- [ADR 0036](./decisions/0036-phase-2-closure-and-phase-3-scope.md) — original Phase 3 scope (custom domain + cohort invite); this plan extends that scope.
- [ADR 0031](./decisions/0031-step-3-4-schema-migration.md) — Free-tier JSON-dump + rollback SQL backup pattern, reused for Steps 4 / 5 / 6 migrations.
- [ADR 0030](./decisions/0030-phase-2-scope-and-locked-decisions.md) — pattern for "locked decisions" section.
- [ADR 0029](./decisions/0029-phase-2-step-naming-convention.md) — naming convention.
- [`proposals/phase-2-pricing-pipeline.md`](./proposals/phase-2-pricing-pipeline.md) — PQ3 origin (resolved in Step 6).
