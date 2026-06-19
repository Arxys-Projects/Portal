# 0066 — Reinstate the Project Quote product showcase page

- **Status**: Accepted
- **Date**: 2026-06-18 (amended 2026-06-19)
- **Supersedes**: #0065 (drop the showcase page)
- **Amends**: restores the showcase plumbing #0065 removed from #0059 / #0060

> **Amendment (2026-06-19): standalone recommended-server hero removed.** With
> the showcase reinstated, the page-1 "recommended server" hero block (model,
> SKU, MAX CAMERAS / BANDWIDTH / USABLE STORAGE / DRIVE BAYS / CPU / RAM / OS /
> WARRANTY) was a *third* presentation of the product — shown again on the
> page-2 showcase and priced once on the commercial page — and, being a
> `wrap={false}` block at the foot of a tall page 1, it overflowed onto its own
> heading-less page. It is deleted. The product is now presented exactly once
> (page-2 showcase) and priced exactly once (commercial page). The intended
> four-page document is **Sizing (parameters · camera schedule · capacity bars,
> no recommended-system block) → Products in this quote → Commercial → Terms.**
> This refines the same showcase decision, so no new ADR number. Data-layer
> note: `sizing.serverSpec` is kept — the page-1 capacity bars still derive
> their ceilings (usable-TB and Mb/s) from it; only the *display* block is gone.
> `primaryServerHeroImagePath` is now an unrendered snapshot field, retained to
> keep the snapshot shape frozen (dropping it would be a separate shape change,
> out of scope here).

## Context

ADR 0065 (earlier today) dropped the Project Quote showcase page entirely — not just the render, but the `showcase` field in the snapshot shape, the showcase builders in `snapshot.ts`, the catalog resolution in `assemble.ts`, and the hero loading in `render.ts` — leaving a three-page document (Sizing, Commercial line items, Terms) with the commercial table as the sole product record. Its stated reason: two product lists (an estimate-derived showcase and the priced commercial table) on a signable document is a clarity/correctness hazard.

Sales subsequently asked for the marketing-style product presentation back, scoped explicitly as a *marketing* page distinct from the priced commercial table — exactly the "when to revisit" condition ADR 0065 named. The showcase is intentionally light on specs (hero image, name, SKU·family, a short highlight grid) and carries no prices; the page-3 commercial table remains the single authoritative priced record. With the two pages visually and functionally distinct, the original confusion risk is mitigated rather than reintroduced.

## Options considered

- **Reframe the existing commercial page in place** (heading + bordered rows, no new data). Cheapest, but the commercial table can only show priced line items — it cannot carry per-product hero images or spec highlights, which is the marketing ask. Rejected: doesn't deliver the requested presentation.
- **Re-add the showcase as a clearly-labeled marketing page (chosen).** Restore the data plumbing 0065 deleted and render a new compact, full-width layout (five products per page) distinct from the priced table.

## Decision

Reinstate the showcase. The document returns to four pages: Sizing, Products (marketing showcase), Commercial line items, Terms. The restoration is full and mirrors the pre-0065 data layer: the `showcase` field and its types return to the snapshot shape; `buildShowcase` / `buildShowcaseSpecHighlights` / `isShowcaseProductGroup` / `ShowcaseCatalogRecord` return to `snapshot.ts`; `loadShowcaseCatalog` + the `dealSkus`/`catalogBySku` plumbing return to `assemble.ts`; and the per-item hero loading returns to `render.ts`. Eligibility is the widened family-based predicate (`productGroupToFamilySlug(productGroup) !== null` — all V-series and SW workstations; add-ons / NICs / transceivers / warranty / [MKT] excluded). The catalog is read at *generation* and frozen into the snapshot; render loads only the frozen image paths (ADR 0060 unchanged). The render layout is new (not the prior 2-column card grid): one compact, thin-bordered, full-width row per product (hero left, name + SKU·family, a four-column highlight grid capped at eight pairs), sized so five rows fit one page.

`PROJECT_QUOTE_SNAPSHOT_VERSION` is **not** bumped: the renderer never branches on the version for this field; it reads `snapshot.showcase ?? []`, so any row frozen in the 0065→0066 window (the table held 0 rows at 0065) renders as an empty showcase rather than crashing. No DB migration is involved — the snapshot is a `jsonb` column, so adding a shape field changes no table schema or mirror column.

## Consequences

**Positive:** the requested marketing presentation returns; one authoritative *priced* list is preserved (the commercial table); the showcase is unambiguously a marketing section; no migration and no version bump.

**Negative:** assembly does an extra catalog read at generation; the document is a page longer; the snapshot shape carries showcase data again. The two-list clarity risk that motivated 0065 returns in muted form, mitigated by the distinct layout and the no-prices framing.

**When to revisit:** if a customer ever mistakes the showcase for the priced record, or if sales drop the marketing page, remove it again (this ADR and 0065 hold both designs).
