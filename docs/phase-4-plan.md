# Portal Phase 4 — Quote revision, partner pipeline forecast & calculator improvements

> **Status: Scoped, all decisions locked (2026-05-28). Ready for implementation.** Sequenced after the Phase 3 custom-domain + cohort work, but Steps 1 and 2 have no dependency on Phase 3 and can land earlier if useful.

Phase 4 turns the portal from "partners can size and submit one quote at a time" into "partners can revise prior quotes, and Arxys can read partner-submitted activity as a weighted pipeline." Three steps:

- **Step 1 — Partner pipeline forecast.** Admin can view/group submissions ("deals") by *partner* (not just project) with a status-weighted forecast; partners see a small funnel of their own pipeline. Read-only, queries-only, **no schema change.**
- **Step 2 — Calculator improvements.** Fix the reset-leaves-stale-result bug and the full minor/cosmetic cluster; add two "add-on" checkboxes (failover recorder, management server) that flow to a Pipedrive note; surface the runner-up + next-size-up SKUs as a min/max bracket. Independent; ships before Step 3 so the form is clean before rehydration touches it.
- **Step 3 — Quote revision (rehydration) + Pipedrive deal update.** Reopen a past submission, pre-fill the calculator, edit, and save as a new revision — non-destructively updating the original Pipedrive deal rather than spamming a new one.

## Naming

- **Portal Phase 4** = this work. **Phase 4 Step N** = a discrete work unit, numbered from 1. "Phase 4" unqualified = Portal Phase 4.

## Locked decisions

All confirmed (architecture-forced, or from Andy 2026-05-28).

- **No database migrations in Phase 4.** Every reporting column the forecast needs already exists on `submissions` (`total_list_price_usd`, `recommended_units`, `recommended_product_id`, `cameras_count`, `bandwidth_mbps`, `storage_tb`, `vms`, `retention_days`, `status`, `is_preferred`, `pipedrive_deal_id`, `project_name`, `created_at`). Rehydration creates a *new* submission row (it does not mutate). The two add-on toggles live in the existing `input_state` JSON. If the implementer finds themselves writing a migration, stop and flag it.
- **A "deal" = (partner, project).** Group submissions by `partner_id` + case-insensitive trimmed `project_name`, reusing the Step 5 pipeline grouping. One value per deal — never sum every submission.
- **Deal value + status come from one representative submission per deal:** the `is_preferred` row if starred, else the most recent by `created_at`.
- **Forecast weighting (OQ-2):** `on-hold` 20%, `sent` 40%, `won` 100%, `lost` 0% — a typed constant in `src/lib/pipeline/forecast.ts`, used by the portal pipeline-forecast view.
- **Drafts are excluded from the forecast (OQ-4).** `draft`/`NULL` submissions do not contribute to pipeline value or weighted forecast at all. They may still appear as a separate *count* for visibility, but never as dollars. (So no draft probability is needed.)
- **Revision updates the existing Pipedrive deal — non-destructively (OQ-1).** On a revision whose source submission has a `pipedrive_deal_id`, update *only* the calculator-derived custom fields, the deal `value`, the portal URL, and add a "revised from portal {date}" note. **Never** write `stage_id`, `user_id`, or `pipeline_id` — those may have been changed by sales and must be preserved. Fall back to creating a new deal if the source has no `pipedrive_deal_id` or the deal returns 404. The new revision submission's `pipedrive_deal_id` is set to the same deal id. No new sales-notification email is sent on a revision (the deal note is the signal).
- **Revision creates a NEW submission** (status `draft`), grouped to the same project. Parent lineage is not persisted in v1 — the (partner, project) grouping collapses revisions automatically.
- **Two add-on checkboxes → Pipedrive note (OQ-3 / OQ-5).** Add "Add Failover Recorder?" and "Add Management Server?" toggles. They are **note-only and have no effect on the sizing math** — surfaced as a note on the Pipedrive deal and carried in `input_state` so rehydration restores them.
- **Surface runner-up + next-size-up SKUs.** The recommendation panel shows the winner plus the cheapest runner-up(s) and a "more headroom" next-capacity-up option (a min/max bracket). `recommend()` already returns `alternatives`; only a small selection helper is new.
- **Fix all minor/cosmetic calculator issues** found in the audit (see Step 2).
- **Pipedrive is system of record; the portal forecast is pre-CRM partner-activity insight** — labelled as such, each deal row linking to its Pipedrive deal when `pipedrive_deal_id` is set.

## Work-unit table

| # | Title | Depends on | Schema? | Notes |
|---|---|---|---|---|
| **Step 1** | Partner pipeline forecast (admin rollup + partner funnel) | none | No | Highest value, lowest risk. Queries-only over existing columns. CSV/XLSX export reuses `src/lib/price-book/xlsx.ts`. |
| **Step 2** | Calculator improvements (bug fix, cosmetics, add-on toggles, min/max options) | none | No | Reset-stale bug + full cosmetic cluster + two Pipedrive-note checkboxes + runner-up/headroom display. Introduces the first `createNote` on deals. |
| **Step 3** | Quote revision (rehydration) + non-destructive Pipedrive deal update | Step 2 | No | Index→label resolution, version stamp, new-revision submit, `PUT`-based deal update reusing Step 2's note mechanism. |

---

## Step 1 — Partner pipeline forecast

**Andy's prereqs:** none — all decisions locked.

**Code work:**
- New `src/lib/pipeline/forecast.ts`: `STAGE_PROBABILITY` constant (on-hold/sent/won/lost; drafts excluded upstream); `groupIntoDeals(submissions, partners)` collapsing rows to one deal per (partner, project) via preferred-or-latest; `weightedForecast(deals)` that **filters out draft/NULL deals** before weighting. Pure functions, no Supabase dependency.
- New `src/lib/pipeline/forecast.test.ts`: dedup-to-one-deal, preferred-over-latest, weighted-sum, drafts-excluded-from-forecast, NULL-project handling.
- `src/app/(app)/admin/submissions/page.tsx` (read first): add a **Partner / Project** group-by toggle via `?groupBy=`. Partner mode → summary cards (active partners, raw open-pipeline total, weighted forecast, counts by status incl. a separate draft count), then per-partner expandable rows → deals → submissions. Add status / date-range filters. Read-only (ADR 0037 — partners own their pipeline).
- New `src/app/(app)/api/admin/forecast/xlsx/route.ts` mirroring `src/app/(app)/api/price-book/xlsx/route.ts`; admin-only; reuses the `exceljs` pattern in `src/lib/price-book/xlsx.ts`.
- `src/app/(app)/dashboard/page.tsx`: small partner-facing funnel card (own counts + open value + weighted forecast, drafts shown as a count only), RLS-scoped.
- Aggregate in the Server Component in JS (fetch rows, group in memory) — robust at single-digit-partner scale.

**Verification gates:** `npm run build` clean · `npm run lint` 0 new errors · `npm test` green incl. `forecast.test.ts` · `scripts/test-rls.ts` green (confirm a partner cannot read another's funnel) · manual smoke: both group-by modes, filters, drafts excluded from the $ forecast, XLSX matches on-screen totals.

**Definition of done:** admin can switch between Partner/Project grouping, read a weighted forecast (drafts excluded) per partner and overall, filter and export it; each partner sees their own funnel; Pipedrive links resolve where present.

**ADR during execution:** `0038-partner-pipeline-forecast.md`.

---

## Step 2 — Calculator improvements

**Andy's prereqs:** none.

**Code work:**
- **Bug — reset leaves stale result.** In `calculator-form.tsx`, dismiss the `RecommendationPanel`/error on `reset()` and on the first input change after a successful submit (a local `resultDismissed` flag gating the panel). Keep `hasInteracted` Save-gating intact.
- **Cosmetic cluster (all):**
  - `formatNumber` in `src/lib/calculator/compute.ts`: round the ≥1000 branch to two decimals with thousands separators instead of truncating to one. Update the unit test.
  - Make the results-table "Rec" column show hours (matching the Hrs/Day input) consistently across table + PDF.
  - Allow a transient empty value in numeric inputs (clamp on blur, not snap-to-1 per keystroke).
  - A11y: `aria-label` on the motion `range`; make the `Tooltip` trigger keyboard-focusable (`tabIndex` + `:focus-visible`).
- **Add-on toggles → Pipedrive note.** Add "Add Failover Recorder?" and "Add Management Server?" checkboxes to the global-settings block. Carry both booleans in form state, in the submit payload, and in `input_state`. In `src/lib/pipedrive/deal.ts`, after `createDeal`, post a note via the existing `pipedriveClient.createNote` listing the add-ons (e.g. "Add-ons requested — Failover recorder: Yes/No · Management server: Yes/No"). This is the first note created on deals (the Phase-1 placeholder note was removed); keep note-creation in a try/catch so a note failure can't fail the deal. Note-only — no effect on the recommendation math.
- **Min/max options.** New helper `pickHeadroomOption(winner, alternatives)`: the cheapest alternative whose `coveredCameras` **and** `coveredStorageTb` both exceed the winner's, preferring fewer units. `RecommendationPanel` renders the winner, 1–2 cheapest runner-ups from `recommendation.alternatives`, and the headroom pick — framed as "recommended / alternatives / room to grow." Pure display; `recommend()` is unchanged.

**Verification gates:** `npm run build` clean · `npm run lint` 0 new errors · `npm test` green incl. updated `compute` + new helper test · `scripts/test-rls.ts` green · manual smoke: submit → reset → no stale panel; clear/retype a number; tab to slider + tooltip; toggle both add-ons and confirm the Pipedrive deal carries the note; confirm winner + alternatives + headroom render.

**Definition of done:** reset fully clears; numeric formatting consistent; form keyboard-navigable; both add-ons appear as a Pipedrive note on new submissions; partners see a min/max SKU bracket.

**ADRs during execution:** none required for the cosmetics/toggles/display (routine — JOURNAL + git history per AGENTS.md). The deal-note pattern is captured in the Step 3 ADR alongside the update path.

---

## Step 3 — Quote revision (rehydration) + non-destructive Pipedrive deal update

**Andy's prereqs:** none beyond the locked OQ-1.

**Code work:**
- New `src/lib/calculator/rehydrate.ts`: `fromStoredSubmission(row)` → form initial state. Resolve each group's `resolutionIdx`/`codecIdx`/`complexityIdx` **robustly** — prefer matching the resolved values banked in `groups_payload` (`resolutionLabel`→index, `codec` value→index, `complexity` tier→index), fall back to the raw `input_state` index, clamp to bounds. Coerce an out-of-list `vms` to `""`. `normalizeInputState()` fills defaults (incl. the two add-on booleans) and re-clamps numerics. Unit-test against a synthetic old `input_state` whose indices would be wrong if the tables had shifted.
- **Version stamp:** `actions.ts` writes `{ version: 1, ... }` into `input_state`; `normalizeInputState()` reads it. Additive JSON only.
- `calculator-form.tsx`: optional `initialState` prop seeding the `useState` initializers; on rehydrate set `hasInteracted = true` for immediate re-submit. Add `isRevision` + `sourceSubmissionId` to the payload.
- Entry point: an **"Edit / revise"** action on the submission detail page and/or pipeline row (`src/app/(app)/submissions/` — read first), routing to the calculator with the source state.
- **Pipedrive deal update path.** In `src/lib/pipedrive/client.ts`, extend the internal `request` to allow `"PUT"` and add `updateDeal(id, payload)` → `PUT /v1/deals/{id}`. Refactor the payload-building portion of `createDealFromSubmission` into a shared `buildDealFields(...)`. New `updateDealFromRevision(dealId, submission, recommendation)` writes **only** the `arxys_*`/calculator custom fields + `value` + portal URL, posts a "revised {date}" note, and **does not** set `stage_id`/`user_id`/`pipeline_id`.
- `actions.ts`: accept `isRevision` + `sourceSubmissionId`; persist the new submission; if `isRevision`, look up the source submission's `pipedrive_deal_id` (RLS-scoped) — if present, `updateDealFromRevision` and set the new row's `pipedrive_deal_id` to the same id; if absent or the deal 404s, fall back to `createDealFromSubmission`. **Skip** `sendSubmissionNotification` on a revision.

**Verification gates:** `npm run build` clean · `npm run lint` 0 new errors · `npm test` green incl. `rehydrate.test.ts` (esp. index-shift resilience) and a deal-update unit test (asserts stage/owner/pipeline are NOT in the update payload) · `scripts/test-rls.ts` green (a partner can only revise their own submissions) · manual smoke: reopen a pre-Phase-4 submission → every field matches → change one value → save → new submission appears, the original Pipedrive deal's value + note update while its stage/owner stay put, no new sales email, and the forecast groups the revision under the same project.

**Definition of done:** a partner can reopen any of their submissions, see it faithfully reconstructed (correct resolution/codec/complexity even for historical rows), edit, and save a revision that updates the original deal non-destructively without CRM spam.

**ADRs during execution:** `0039-quote-revision-rehydration.md` (index→label resolution, version stamp, new-revision-not-mutate) and `0040-pipedrive-deal-update-on-revision.md` (non-destructive field subset, fallback-to-create, the new deal-note pattern shared with Step 2).

---

## Out of scope / future possibilities

- **Attaching products (line items) to the Pipedrive deal from a submission.** Not done today and not in Phase 4. Possible but unlikely future add; if pursued it would build on the SKU + units already persisted on the submission row.
- **Admin-editable stage probabilities** (vs the code constant). Deferred; revisit if the weights need tuning without a deploy.
- **`parent_submission_id` lineage** on revisions. Deferred; the (partner, project) grouping makes it unnecessary for v1.

## References

- `docs/README.md` — three-document discipline. `AGENTS.md` — Next.js caveat + docs-as-you-go.
- JOURNAL 2026-05-27 (Step 5) — submission lifecycle / `status` / `is_preferred` / pipeline grouping (Step 1).
- JOURNAL 2026-05-27 (Step 4) — `input_state` banking (Step 3 source).
- `src/lib/recommend/algorithm.ts` — `recommend()` returns `winner` + `alternatives` (Step 2 min/max).
- `src/lib/pipedrive/{client,deal,lookups}.ts` — deal create today is POST-only; Step 3 adds PUT/update.
- `src/lib/price-book/xlsx.ts` — export pattern Step 1 reuses.

---

## Claude Code kickoff prompt

```
You are working in the Arxys Portal repo. Before writing any code, read, in order:
1. AGENTS.md and docs/README.md — follow the three-document discipline (append docs/JOURNAL.md
   newest-first, update docs/RUNBOOK.md only if the happy path changes, write a numbered ADR in
   docs/decisions/ for each non-obvious decision; next numbers are 0038, 0039, 0040).
2. The relevant guide under node_modules/next/dist/docs/ — this is not the Next.js in your training data.
3. docs/phase-4-plan.md — the plan you will execute. All scoping decisions are locked; do not relitigate them.
4. The actual files each step names, before editing them.

Execute one step at a time, in order: Step 1 (partner pipeline forecast), Step 2 (calculator
improvements), Step 3 (quote revision + Pipedrive deal update). Hard constraints:
- No database migration anywhere in this phase. If you reach for one, stop and flag it.
- Drafts are excluded from forecast dollar totals (count only).
- In Step 3's deal-update path, write ONLY the calculator-derived custom fields, deal value, portal URL,
  and a note. NEVER write stage_id, user_id, or pipeline_id — sales may have changed them. Fall back to
  creating a new deal only if the source submission has no pipedrive_deal_id or the deal 404s.

After each step: run the step's verification gates (npm run build, npm run lint, npm test,
scripts/test-rls.ts, and the manual-smoke checklist — hand the authed click-through to me if a dev server
can't be driven non-interactively), then write the JOURNAL entry and any ADR before reporting the step
done. Do not combine steps into one commit.
```
