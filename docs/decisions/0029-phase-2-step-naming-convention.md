# 0029 — Phase 2 step naming convention

- **Status**: Accepted
- **Date**: 2026-05-20

## Context

The Portal project has two phases: Phase 1 (closed 2026-05-20 — see JOURNAL Step 11 entry) and Phase 2 (starting now). The Pricing Pipeline proposal nested inside Phase 2 ([`docs/proposals/phase-2-pricing-pipeline.md`](../proposals/phase-2-pricing-pipeline.md)) has its own internal "Phase 0 / 1 / 2 / 3" sub-numbering for the work units inside the pipeline project. So the bare label "Phase 2" is ambiguous between **Portal Phase 2** and **Pipeline Phase 2** — different concepts at different scales.

JOURNAL entries through Phase 1 used "Step N" naming without an explicit phase prefix (Step 1 … Step 11). That worked because there was only one phase in progress; it stops working the moment a second phase's work units need to coexist with Phase 1's history.

## Options considered

- **(a) Continue monotonic step numbering.** Phase 2 work becomes Step 12, Step 13… Loses the Phase 1/2 boundary as a semantic marker; reader has to know that "Step 12+ = Phase 2."
- **(b) "Phase 2 Step N" prefix on all new entries.** Explicit and self-disambiguating in prose ("the Phase 2 Step 5 brief"). Existing Phase 1 entries keep their "Step N" form by inference.
- **(c) Abbreviated "P2-Step-N" prefix.** Shorter but uglier in prose; reads awkwardly in headings.
- **(d) Retroactively rename Phase 1 entries to "Phase 1 Step N".** Churn for no semantic gain; commit history loses readability.

## Decision

**(b).** Going forward:

- New Portal Phase 2 work units are named **"Phase 2 Step N"** starting at N = 1, in JOURNAL headings, file names, commit subjects, and prose references.
- The Pricing Pipeline proposal's internal sub-phases are referred to in writing as **"Pipeline Phase 0 / 1 / 2 / 3"** to disambiguate from Portal Phase 2. The proposal file itself is not edited — its own internal "Phase 0/1/2/3" naming stays because the file is a verbatim reference copy of Andy's Google Doc.
- Existing Phase 1 entries in the JOURNAL retain their bare "Step N" form. Phase 1 is closed; rewriting history serves nobody.
- Phase 2 step scoping briefs live at `docs/phase-2/step-N-<short-title>.md` (created as each step is scoped).

## Consequences

**Positive:**

- "Phase 2 Step 5" reads unambiguously in any context, including in prose where someone might otherwise wonder which "Phase 2" or which "Step 5."
- The Phase 1 / Phase 2 boundary becomes a usable semantic filter for JOURNAL history.
- No churn against existing entries, ADRs, or commits.

**Negative:**

- Slight verbosity. "Phase 2 Step 5" is longer than "Step 12" would be. Acceptable.
- Future Portal Phase 3 (if it ever exists) inherits the same pattern: "Phase 3 Step N." Consistent but verbose.

## When to revisit

- If a third phase exists and the prefix becomes unwieldy. At that point a flatter scheme (e.g. milestone-based naming) may serve better.
- If the proposal doc gets rewritten as a first-class plan rather than a verbatim Google-Doc copy. At that point its internal phase labels should be revisited too.
