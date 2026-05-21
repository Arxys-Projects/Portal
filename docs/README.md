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
| [`phase-2-plan.md`](./phase-2-plan.md) | **Current** — Portal Phase 2 work plan (Pricing Pipeline + partner-launch completion). See ADR [0029](./decisions/0029-phase-2-step-naming-convention.md) for the "Phase 2 Step N" naming convention. |
| [`proposals/phase-2-pricing-pipeline.md`](./proposals/phase-2-pricing-pipeline.md) | Reference — verbatim copy of Andy's Pricing Pipeline planning doc. Authoritative spec for Pipeline Phases 0–3. Read-only history; the operational plan is in `phase-2-plan.md`. |
