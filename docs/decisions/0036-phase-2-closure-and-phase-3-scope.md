# 0036 — Phase 2 closure; partner cohort invite + custom domain deferred to Phase 3

- **Status**: Accepted
- **Date**: 2026-05-22

## Context

Portal Phase 2 was scoped on 2026-05-20 (see ADR [0030](./0030-phase-2-scope-and-locked-decisions.md)) to take the project from "Phase 1 structurally verified but partner-launch blocked" to "MVP final — first external partners invited." The plan listed 10 work units (Phase 2 Steps 1–10) plus one optional step (Step X: custom domain `portal.arxys.com`).

Steps 1–9 landed cleanly between 2026-05-20 and 2026-05-22:

| Step | What | Commits / JOURNAL |
|---|---|---|
| 1 | Minimal portal branding | `5ae3cac` |
| 2 | Master Sheet validation | `9ae13c0` |
| 3+4 | Schema migration + recommendation algorithm rewrite | `b0493f4` + `d02556c` hotfix |
| 5+6 | Push script + real pricing live | Sonnet session |
| 7 | Partner XLSX download | Sonnet session |
| 8 | HTML price book live | `7568bf8` (mockup) + Step 8b Sonnet session + polish commits |
| 9 | Internal verification / smoke testing | Folded into Step 8 polish commits; no separate JOURNAL entry — testing surfaced fixes that landed inline (compliance badges, V600–V800 net storage, warranty KPIs, SW section, V700/V800 hero replacement, dual datasheet buttons) |

Step 10 (2–3 partner cohort invite) and Step X (custom domain `portal.arxys.com`) remain open. Andy's 2026-05-22 call: both move to a new Portal Phase 3 rather than holding Phase 2 open. Reasoning: inviting partners against `portal-arxys.vercel.app` then re-inviting once `portal.arxys.com` is wired creates partner-perception friction; sequencing the domain switch *before* the first external invite produces a cleaner launch.

## Options considered

- **Keep Phase 2 open until Steps 10 + X land.** Maintains the original "MVP final = cohort invite" definition. Costs the narrative an open phase for what's now mostly domain-cutover + partner email work — both operational, not build.
- **Close Phase 2 at Step 9; move Steps 10 + X to Phase 3.** *(Chosen.)* Phase 2's deliverable becomes "MVP feature-complete, internally validated, ready for production launch." Phase 3 becomes the production launch arc.
- **Close Phase 2 at Step 9, invite the cohort under `portal-arxys.vercel.app`, defer only the CNAME.** Splits the partner-launch story across two phases. Worse narrative; partners get a domain change letter mid-onboarding.

## Decision

**Portal Phase 2 closes 2026-05-22 with Steps 1–9 complete.** Step 10 (partner cohort invite) and Step X (custom domain `portal.arxys.com`) move to a new **Portal Phase 3** when scoped.

Implications:

1. `docs/phase-2-plan.md` Status header → **Complete**. Document stays in place as historical record; not edited going forward except for typo fixes.
2. `docs/README.md` plan index reflects the closure.
3. Future "Phase 3" work gets its own scoping ADR + plan doc when first scoped (mirroring ADR 0030 + `phase-2-plan.md` for Phase 2). Naming convention from ADR 0029 carries forward: "Portal Phase 3 Step N."
4. **No external partner invitations until Phase 3 scopes are locked.** The internal-only-during-Phase-2 constraint from ADR 0030 continues; Phase 3 will explicitly unlock external partners once the canary domain + invite cadence is locked.

## Consequences

**Positive:**

- Clean phase boundary at "feature-complete + internally validated."
- Partner-launch operational work (domain, invite copy, canary cadence, post-invite monitoring) gets first-class scoping in Phase 3 rather than being a trailing checkbox on Phase 2.
- Phase 2 retrospective is meaningfully shippable: 8 build steps + 1 verification step in 3 calendar days.

**Negative:**

- Original plan defined Phase 2 = "MVP final via cohort invite." Renaming that goalpost to "MVP feature-complete" mid-execution is a real plan revision; this ADR is the canonical record of the revision.
- Anyone reading `phase-2-plan.md` will see Steps 10 + X listed without ✓; this ADR is the only thing linking them forward to Phase 3.

**When to revisit:**

- When Phase 3 is scoped: this ADR's Step 10 + Step X owners transfer to that phase's plan doc; no supersede needed (this ADR records *closure*, not a contested decision).
- If the team decides to invite partners before Phase 3's CNAME work lands (e.g. business pressure for a faster canary): reopen ADR 0030's "internal-only" constraint with a follow-up ADR.

## Numbering housekeeping

Captured here because it's a Phase 2 close-out item: ADR `0032` was double-assigned during Phase 2 — first to `sku-level-recommendation-algorithm.md` (Step 3+4, 2026-05-21), then again to `price-book-brand-scope.md` (Step 8b, 2026-05-22). Per ADR discipline ("numbers never get reused, even if an ADR is superseded"), the later collision is resolved at this Phase 2 close by renaming the second to **0035**. The earlier 0032 (SKU-level recommendation algorithm) keeps its number. JOURNAL cross-references updated in the same commit as this ADR.
