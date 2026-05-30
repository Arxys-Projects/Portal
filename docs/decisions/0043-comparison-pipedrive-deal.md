# 0043 — Comparison deal vs sizing deal distinction

- **Status**: Accepted
- **Date**: 2026-05-29

## Context

Phase 5 Step 3 adds a "Get My Partner Quote" Server Action that creates a Pipedrive
deal when an authenticated partner requests a quote via the comparison tool. The
existing `createDealFromSubmission()` function is calculator-specific — it requires
a `RecommendationResult` (with winner, alternatives, computed totals) that doesn't
exist in the comparison flow. Sales and operations need to be able to distinguish
comparison-tool leads from calculator sizing leads in the Pipedrive pipeline.

## Options considered

- **Reuse `createDealFromSubmission()` with a stub RecommendationResult** — avoids
  a new function. Requires constructing fake calculator data; misleading to sales
  reading the deal card.
- **New `createComparisonDeal()` that reuses `buildDealFields()`** — still needs a
  fake RecommendationResult. Same problem as above.
- **New `createComparisonDeal()` with its own minimal payload** — writes only the
  fields meaningful for a comparison deal (title, value, org, person, pipeline, stage)
  plus a pinned note. Clean, no fake data.

## Decision

New `createComparisonDeal()` in `src/lib/pipedrive/deal.ts`. Distinguishable from
sizing deals by:
1. **Title prefix**: `"Comparison: {vendor} {model} vs Arxys — {company}"` — visible
   in the Pipedrive kanban without opening the deal.
2. **Pinned note**: contains `lead_source: comparison_tool`, competitor model, Arxys
   match ID, server count, and deal value. Readable by sales in the deal activity log.

Uses the same pipeline (`Project Pipeline`) and stage (`New Lead`) as sizing deals,
so comparison leads enter the same funnel. Value = `arxys_msrp × server_count`,
giving sales a starting point for the conversation.

Does NOT add a new `lead_source` Pipedrive custom field — the pinned note is
sufficient to distinguish programmatically if needed later, and creating a new
deal field requires admin UI access that doesn't need to be automated.

## Consequences

**Positive:**
- No fake calculator data in Pipedrive.
- Title prefix makes comparison deals visually distinct in list views.
- Same pipeline routing means no new Pipedrive admin setup required.

**Negative:**
- `lead_source` lives in the note body, not a queryable Pipedrive field. Filtering
  by lead source requires searching note text, not a deal field filter.

**When to revisit:** If Arxys wants to build Pipedrive reports segmenting comparison
vs. calculator leads by volume, add a `lead_source` enum deal field and set it in
both `createDealFromSubmission` and `createComparisonDeal`.
