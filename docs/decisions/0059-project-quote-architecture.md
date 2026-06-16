# 0059 — Project Quote: portal-rendered unified proposal and quote document

- **Status**: Accepted
- **Date**: 2026-06-15

## Context

Sales currently rely on a Google Docs template that must be manually field-synced, duplicated per user, and shared per deal. This creates version-skew risk between the portal's sizing data and the quote's commercial data, and it requires per-user template administration. The portal already holds the authoritative sizing output (from the submission) and creates the Pipedrive deal at submission time, making it the natural place to generate a unified document that combines sizing and commercial data in a single rendered view.

## Options considered

- **Keep the Google Docs template flow.** No build cost, but it keeps the per-user template administration, the manual field sync, and the version-skew risk that motivated the change.
- **Read the sizing half from the deal's custom sizing fields.** Would let a manually-created deal generate a quote, but it splits the authoring path and lets deal edits silently diverge from the portal's calculator output. Rejected: the portal stays the single authoring path.
- **Portal-rendered unified document; sizing from the submission, commercial read live from the deal (chosen).** One internal-only document; the sizing half comes from the submission, the commercial half is read live from the linked Pipedrive deal at generation and displayed verbatim.

## Decision

A single internal-only "Project Quote" document generated from the portal for a linked submission. The sizing half (parameters block, camera schedule, capacity bars, primary-server hero) comes from the portal submission; the commercial half (line-item products, prices, discounts, totals, terms) is read live from the linked Pipedrive deal at generation time and displayed verbatim. Prices flow Pipedrive to portal only; the portal never computes or modifies a price, and never stores a derived price (display values such as partner-price-each are derived at render from the frozen raw data). Generation is gated on a stored `pipedrive_deal_id`; manually-created Pipedrive deals have no portal submission to generate from, which enforces the portal as the single authoring path. Generation refuses when the deal has zero product line items (empty-deal guard, Step 6). The sizing source is the portal submission exclusively; the deal's custom sizing fields are not read.

The read path is `getDealForQuote(dealId)` (Step 4): a headless, validated, never-throws read that returns the typed `DealQuote` or a typed `QuoteError`. Step 5a adds the storage layer: a `project_quotes` table whose snapshot freezes the verbatim `DealQuote`, the resolved sizing, the resolved showcase, and the in-force terms.

**Authorization (confirmed 2026-06-15):** Project Quote generation is available to *all internal users*, not restricted to admins. The `project_quotes` read and write paths are gated on `public.is_internal((select auth.uid())) or public.is_admin((select auth.uid()))` (admins are covered explicitly in case an admin is not separately flagged internal), and the insert additionally requires `generated_by = (select auth.uid())`. This is distinct from `camera_specs`, whose admin-only write gate governs library seeding, not quote creation (ADR 0057).

## Consequences

**Positive:** one authoritative document combining sizing and commercial data; the portal is the single authoring path by construction; prices are always the rep's Pipedrive numbers, never a portal recomputation; internal-only access keeps pricing and customer PII off the partner surface.

**Negative:** adds a net-new external read dependency on Pipedrive (the portal previously only wrote); a quote can only be generated for a portal-created submission, so a manually-created deal cannot be quoted without first having a submission.

**When to revisit:** if quotes ever need to be generated for deals with no portal submission, or if a non-internal role (for example a partner self-serve quote) is required.
