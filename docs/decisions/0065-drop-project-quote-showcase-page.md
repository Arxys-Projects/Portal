# 0065 — Drop the Project Quote product showcase page

- **Status**: Accepted — reversal proposed in #0066 (awaiting review)
- **Date**: 2026-06-18
- **Amends**: #0059 (page-2 showcase), #0060 (showcase in the snapshot)

> **Note (2026-06-18):** Sales asked for a marketing showcase page back, scoped
> as a clearly-labeled marketing section distinct from the priced commercial
> table — the "when to revisit" condition below. ADR #0066 proposes reinstating
> the showcase. When #0066 is accepted, mark this Status `Superseded by #0066`.

## Context

The original Project Quote (ADR 0059) had four pages: sizing, a product "showcase" (page 2, hero cards for the V-series / SW SKUs on the deal, sourced from the submission estimate plus the catalog), the commercial line items (page 3, read live from the Pipedrive deal), and terms. In review, the showcase and the commercial table both present "the products," but only the commercial line items are the true, priced record of what is being quoted. The showcase is derived from the estimate and can diverge from the deal, so showing both invites confusion about which list is authoritative.

## Options considered

- **Keep the showcase as marketing context.** Rejected: two product lists on one quote, one of them an estimate, is a correctness/clarity hazard on a document a customer signs against.
- **Render the showcase only when it agrees with the commercial lines.** Adds reconciliation logic for a page that carries no commercial weight. Rejected as complexity for little gain.
- **Remove the showcase entirely (chosen).** The commercial line-item table is the sole product record on the quote.

## Decision

The Project Quote drops the showcase page. The document is now three pages: Sizing, Products (commercial line items), and Terms. The removal is full, not render-only: the `showcase` field is gone from the snapshot shape, and the showcase builders (`buildShowcase`, `buildShowcaseSpecHighlights`, `isShowcaseProductGroup`, `ShowcaseCatalogRecord`) and their catalog resolution in the assembler are deleted, so no dead data is frozen and no hero images are loaded for an unrendered page. No Project Quotes had been issued (`project_quotes` had 0 rows), so no historical snapshot loses content and `PROJECT_QUOTE_SNAPSHOT_VERSION` does not need a branch.

## Consequences

**Positive:** one authoritative product list (the priced commercial lines); a shorter, clearer quote; less assembly work and no showcase image loading at render; simpler snapshot shape.

**Negative:** the quote loses the marketing-style hero cards for the recommended products; if that presentation is wanted later it must be re-added (the git history and ADR 0059 hold the prior design).

**When to revisit:** if sales want a product-showcase or capabilities page back, reintroduce it as a clearly-labeled marketing section distinct from the priced commercial table.
