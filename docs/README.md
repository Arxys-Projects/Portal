# Arxys Partner Portal — Documentation

Three documents, three jobs. Don't mix them.

| File | Purpose | When to read | When to write |
|---|---|---|---|
| [`JOURNAL.md`](./JOURNAL.md) | Chronological narrative of what was tried, what failed, what we course-corrected on, and why. The history book. | When you need to understand *why* something looks the way it does, or what we ruled out. | Append after every meaningful work session. Include detours, fixes, surprises. |
| [`RUNBOOK.md`](./RUNBOOK.md) | The clean, idempotent recipe to recreate this project from a blank Mac. No dead-ends, no detours. | When you (or a new contributor) need to set up the project from zero or recover from a broken state. | Update *immediately* every time a step in the happy path changes. Keep it linear and copy-pasteable. |
| [`decisions/NNNN-title.md`](./decisions/) | Architecture Decision Records (ADRs). One short markdown per non-obvious choice: context, options considered, decision, consequences. | When deciding whether to revisit a past choice, or when onboarding someone who'll be making similar choices. | Whenever a decision is made that isn't self-evident from the code six months later. |

## How they relate

- A bug fix in production → JOURNAL entry (what broke and why), maybe a RUNBOOK update (if the fix changes setup), no ADR.
- Switching a library or pattern → JOURNAL entry, RUNBOOK update, **and** an ADR.
- A failed approach we backed out of → JOURNAL entry, no RUNBOOK change, no ADR.
- Adopting a tool that needs install steps → JOURNAL entry, RUNBOOK update for the install.

## Filename conventions

- JOURNAL entries are dated headings inside a single file. Newest at top.
- ADRs are sequentially numbered: `0001-title.md`, `0002-title.md`. Numbers never get reused, even if an ADR is superseded.
- A superseded ADR isn't deleted — it gets a `Status: Superseded by #NNNN` note at the top and stays in the directory.

## Forward-looking plans

The three core docs above are the source of truth for *what happened* and *how to recreate it*. They don't cover *what's next*. Active project plans live alongside them and follow different rules — they're rewritten as project state evolves rather than appended to like JOURNAL.

| File | Status |
|---|---|
| [`phase-7-plan.md`](./phase-7-plan.md) | **Active** — internal "on behalf of" calculations. Step 1 + companion UI shipped 2026-06-04 (see JOURNAL + ADR [0045](./decisions/0045-on-behalf-of-calculations.md)); deferred steps remain open. Handoff brief: [`phase-7-step-1-brief.md`](./phase-7-step-1-brief.md). |
| `phase-3-plan.md` (not yet created) | **Next** — Portal Phase 3 work plan. Will cover custom domain `portal.arxys.com` + 2-3 partner cohort invite + anything else surfaced after Phase 2 close. Scoped when needed. |
| [`phase-2-plan.md`](./phase-2-plan.md) | Complete (2026-05-22) — Portal Phase 2 work plan (Pricing Pipeline + MVP feature-complete). Historical record; see ADR [0036](./decisions/0036-phase-2-closure-and-phase-3-scope.md) for closure. |
| [`proposals/phase-2-pricing-pipeline.md`](./proposals/phase-2-pricing-pipeline.md) | Reference — verbatim copy of Andy's Pricing Pipeline planning doc. Authoritative spec for Pipeline Phases 0–3. Read-only history; the operational plan was in `phase-2-plan.md`. |

## Handoff briefs

Session-scoping briefs for work handed to a fresh Claude Code session: model + effort, what to
read first, tasks, and the hard "do not" list. One per build step that needs one — not every
step does. They live next to the ADR they implement, as `decisions/claude-code-brief-*.md`.
Written before the work, not updated after it; the JOURNAL records what actually happened.

| File | Status |
|---|---|
| [`decisions/claude-code-brief-projects-page-schema-and-query-layer.md`](./decisions/claude-code-brief-projects-page-schema-and-query-layer.md) | Phase 1 of 2 complete 2026-08-03 — schema + query layer for `/projects`, ADRs [0112](./decisions/0112-internal-project-archive-is-a-side-table.md) / [0113](./decisions/0113-pipedrive-reads-are-cached-with-a-last-known-fallback.md), migrations **not yet applied** ([apply note](./apply-notes/0112-0113-projects-page-schema.md)). **Phase 2 (the page itself) is open and needs its own brief**; the design spec is [`design/projects-page-handoff/handoff/claude-code-prompt-projects.md`](./design/projects-page-handoff/handoff/claude-code-prompt-projects.md) and the contract to build against is `src/lib/projects/types.ts`. |
| [`decisions/claude-code-brief-0097-step-2.md`](./decisions/claude-code-brief-0097-step-2.md) | Complete — ADR [0097](./decisions/0097-datasheet-surfaces-join-admin-editable-pattern.md) build step 2: `src/lib/spec-form/` extracted and `/admin/specs` migrated onto it, shipped 2026-07-28. Steps 1, 3 and 4 also shipped that day; **step 5** (the `appliance_specs` surface) is the open one and has no brief yet — design §3–4 and §7 scope it. |
| [`decisions/claude-code-brief-0089-customer-proposal-and-logo.md`](./decisions/claude-code-brief-0089-customer-proposal-and-logo.md) | Complete — ADR [0089](./decisions/0089-customer-proposal-and-partner-logo-system.md) Customer Proposal + partner logo system. Shipped to production 2026-07-22. |
| [`phase-7-step-1-brief.md`](./phase-7-step-1-brief.md) | Complete — `phase-7-plan.md` step 1, shipped 2026-06-04. Predates the `decisions/` convention above; left where it is. |
