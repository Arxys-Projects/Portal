# Portal Phase 2 — Pricing Pipeline & partner launch

Portal Phase 1 closed 2026-05-20 (JOURNAL: *Step 11 — pre-launch verification*). Phase 2 is the next coherent unit of work. It carries the partner-launch goal forward from where Phase 1 stopped: structural verification was green but partner-facing launch couldn't ship because of a placeholder-pricing-on-partner-pages issue. Phase 2 resolves that and lands the Pricing Pipeline outlined in [`proposals/phase-2-pricing-pipeline.md`](./proposals/phase-2-pricing-pipeline.md).

## Naming (per ADR [0029](./decisions/0029-phase-2-step-naming-convention.md))

- **Portal Phase 1** = the partner-portal MVP. Closed.
- **Portal Phase 2** = this work.
- **Phase 2 Step N** = a discrete work unit inside Portal Phase 2. Numbered from 1.
- **Pipeline Phase 0 / 1 / 2 / 3** = the four sub-phases inside the Pricing Pipeline proposal. Distinct from Portal Phase 2.
- When someone writes "Phase 2" with no qualifier, it means Portal Phase 2.

## Open work units (tentative — PQ answers may merge, split, or reorder)

Consolidated from the Step 11 close-out "Handed off to Phase 2" list **plus** the Pricing Pipeline proposal:

| # | Title | Source | Status / Blocker |
|---|---|---|---|
| Phase 2 Step 1 | **Pipeline Phase 0** — Master Sheet reconciliation (data work) | proposal | Andy data work. Blocked on PQ2 + PQ3 |
| Phase 2 Step 2 | **Partner-price display resolution** — the Step 11 launch blocker | Step 11 detour | Blocked on PQ1 |
| Phase 2 Step 3 | **Schema migration** — `products` UUID-PK → SKU-PK; cascade FKs on `submissions` + `server_specs` | proposal + PQ4 | Blocked on PQ4. May collapse with Step 4 |
| Phase 2 Step 4 | **Recommendation algorithm rewrite** — family → SKU-level | proposal | Blocked on Step 3 |
| Phase 2 Step 5 | **Pipeline Phase 1** — push script (Sheet → Supabase + Pipedrive Products) | proposal | Blocked on Steps 1 + 3 |
| Phase 2 Step 6 | **Pipeline Phase 2** — Portal Price Book page (new authenticated route) | proposal | Blocked on Steps 3 + 5; depends on PQ3 |
| Phase 2 Step 7 | **Pre-launch verification redux** — Step 11 deferred smoke tests + page-by-page production pass | Step 11 deferrals | Blocked on Steps 2 + 6 |
| Phase 2 Step 8 | **Partner cohort invite** — 2–3 partners (D5 deferred) | Step 11 deferrals | Blocked on Step 7 |
| Phase 2 Step 9 | **Pipeline Phase 3** — retire Google Slides price book | proposal | Andy comms. Blocked on Step 6 |
| Phase 2 Step X (optional) | Custom domain `portal.arxys.com` (Step 11 D1 deferred) | Step 11 deferrals | Independent; can land any time |

This list is the **current sketch**, not a contract. As PQ answers come in some steps will merge (e.g. Steps 3 + 4 likely combine), and a couple may grow into multi-step efforts of their own.

## PQ — decisions to lock before scoping any step

Before any Phase 2 Step is written up as its own scoping brief (Step 11 shape — Andy prereqs separated from code work), these six decisions need answers:

1. **PQ1 Launch-blocker treatment.**
   - (a) Path B: suppress partner-visible prices via a tiny patch; ship Phase 1 to a canary partner before Phase 2 proper starts.
   - (b) No partners until Phase 2 ships real prices; cohort waits for Step 6.
   - (c) Hybrid: canary partner gets Path B + we proceed to Phase 2 in parallel.

2. **PQ2 Pipeline Phase 0 completion target.**
   - (i) Finish Phase 0 per the proposal's spec — add Product Group + Price Type columns; add the missing `VX5-PP5-V100`; reach 41 rows.
   - (ii) Update the proposal to match the Sheet's actual shape today (35 rows; MKT/CFQ inline in MSRP cell; no Product Group column) and proceed from there.
   - (iii) Hybrid — partial spec compliance.

3. **PQ3 Discount mechanic.**
   - (a) Sheet's `Partner Discount Price` column (one discount % per sheet refresh).
   - (b) Proposal's per-user `partners.discount_tier` (runtime computation).
   - Which is canonical going forward? Affects Step 6 (Price Book page) and Step 5 (push script).

4. **PQ4 Schema appetite.**
   - (a) Full SKU-PK migration + algorithm rewrite (the deep change ADR 0019 deferred).
   - (b) Values-only update of the existing 6 family rows as a stopgap; defer SKU-PK rewrite to a later phase.
   - Drives whether Steps 3 + 4 happen now or are pushed past Step 5.

5. **PQ5 Push script location.**
   - (a) `scripts/push-prices.ts` in this repo (reuses existing Supabase + Pipedrive clients; sits next to `bootstrap-admin.ts` and `test-rls.ts`).
   - (b) Separate repo (cleaner separation; new env setup).

6. **PQ6 Sub-phase sequencing.**
   - (a) Single sweep — scope all of Phase 2 up front, execute in one long arc.
   - (b) Per-step scoping briefs (the Step 11 shape) — scope each Phase 2 Step on demand.

## How each Phase 2 Step gets scoped

Same shape as the Step 11 brief: each scoping brief at `docs/phase-2/step-N-<short-title>.md` covers:

1. Andy's dashboard / account / manual prereqs (separated from code work).
2. The code work, with file-level task list.
3. Verification gates (build, lint, test, RLS, smoke).
4. Definition of done.
5. Open questions to lock before execution.

## References

- [`JOURNAL.md`](./JOURNAL.md) — Step 11 close-out entry (2026-05-20) for the trigger event and the full deferral list.
- [`proposals/phase-2-pricing-pipeline.md`](./proposals/phase-2-pricing-pipeline.md) — authoritative Pricing Pipeline spec. Pipeline Phases 0–3 live there. Verbatim reference copy of Andy's Google Doc; not edited here.
- [ADR 0019](./decisions/0019-defer-real-pricing-to-phase-2.md) — original deferral that created Phase 2 as a concept.
- [ADR 0027](./decisions/0027-silent-log-for-non-blocking-integrations.md) — Phase 1 silent-log behavior; revisit if a Phase 2 step justifies retry/alert plumbing.
- [ADR 0028](./decisions/0028-defer-per-flow-reset-password-heading.md) — reset-password heading fix folded into Phase 2 copy work (likely Step 6 or Step 7).
- [ADR 0029](./decisions/0029-phase-2-step-naming-convention.md) — naming convention this doc uses.
