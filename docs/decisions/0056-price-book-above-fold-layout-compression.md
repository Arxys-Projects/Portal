# ADR 0056 — Price Book above-the-fold layout compression

**Date:** 2026-06-15
**Status:** Accepted
**Deciders:** Andy Newbom

## Context

The Price Book page required roughly 650px of vertical scroll before the first product was visible. Three full-width stacked sections — hero band (~280px with padding), Enterprise Grade bullets (~160px), and H.265 feature block (~160px) — stacked sequentially above the product grid. Security integrator partners are the primary audience and are typically repeat visitors who know the VideoX product and want to reach pricing quickly.

## Decision

Compress the above-the-fold sections from ~650px to ~380px through six layout changes:

1. Hero band padding reduced from ~40px to 20px top and bottom.
2. Hero description trimmed from a 5-sentence paragraph to 2 lines; core differentiators preserved.
3. "Effective From" date moved inline with the "View all" link (same meta row, no separate block).
4. Enterprise Grade bullets changed from 3-column irregular to 2 columns x 4 rows (8 bullets). NDAA Compliant and American Made combined into one item to reach the even count.
5. H.265 feature block moved from a full-width band below Enterprise Grade to the left 38% of a new two-column row, with Enterprise Grade occupying the right 62%.
6. H.265 column given bg-[#1E4E8C] (lighter than hero navy) to maintain the blue brand palette while visually distinguishing it from the hero band.

## Rationale

Change 5 (H.265 alongside Enterprise Grade) recovers approximately 160px on its own by converting two sequential full-width bands into one shared row. Changes 1 through 3 contribute roughly another 100px. Total reduction is approximately 270px (~40%). No information is removed from the page; the hero description is condensed, not eliminated, and all 9 Enterprise Grade attributes are preserved (8 bullets, with NDAA + American Made merged).

## Consequences

Products are visible on first load at typical desktop viewport heights without scrolling past the intro content. The two-column row (H.265 left, Enterprise Grade right) should stack vertically on narrow viewports; verify responsive behavior at the portal's standard mobile breakpoint. The Enterprise Grade bullet count changes from 9 to 8 — the only substantive copy change is combining two single-credential bullets into one combined line.
