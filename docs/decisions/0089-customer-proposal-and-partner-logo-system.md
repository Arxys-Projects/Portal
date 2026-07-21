# 0089 — Customer Proposal document + partner logo system

**Status:** Accepted
**Date:** 2026-07-21
**Depends on:** 0083 (partner SELECT on `project_quotes`)
**Related:** 0086 (single price source — `current_products`), 0085 (price-lock / validity copy)

## Context

Partners can now see their own Project Quote (0083). The Project Quote shows
partner economics — MSRP, discount %, partner price, partner total — and is the
document a partner uses to know their own cost. Partners also need a document
they can hand to their own end customer that carries the same technical story
and a clean price, with no partner discount or cost visible.

Two additional needs surfaced in the same session:

1. A partner-branded header. Arxys admin will produce and upload transparent-PNG
   partner logos so they render accurately, attached to the partner record so
   they auto-appear on generated documents.
2. A small partner-logo touch on the partner's own dashboard for recognition.

## Decision

### 1. One snapshot, two views

The Customer Proposal is a **second renderer over the identical `project_quotes`
snapshot** used by the Project Quote. No second table, no second snapshot, no
fork in the generation flow. The two documents are two views of one data object.

### 2. Discount stripped at the assembler (critical)

The object passed to the Customer Proposal renderer must have all partner /
discount fields **physically absent** — removed at the data-assembly layer, not
hidden in layout. This covers: discount %, partner-each price, partner line
total, and the partner grand total. The renderer never receives these values.

Filename and PDF metadata are scrubbed of any partner/discount reference.

A build-failing automated guard test asserts that no partner/discount value from
the source snapshot appears anywhere in rendered Customer Proposal output
(text layer + metadata). This test is a required part of the change.

### 3. Customer Proposal content (vs. the Project Quote)

Header:
- Badge reads **CUSTOMER PROPOSAL** (Project Quote keeps **PROJECT QUOTE**).
- Partner logo (or blank) in the **center** of the header. Arxys lock-up (left)
  and badge/ref/date stack (right) are unchanged.

Page 1 (project parameters + camera schedule):
- Kept, including "Prepared for".
- **"System capacity" bars removed** — they reflect the original calculator
  submission, which the end customer did not make.

Page 2 (products):
- "Products in this quote" full spec blocks kept (form factor, CPU, RAM, drive
  bays, etc.).
- **"Quoted solution" bars kept** — these reflect capacity actually delivered by
  the quoted equipment.

Commercial page (line items):
- Columns: `CODE | PRODUCT | PRICE EACH | QTY | PRODUCT TOTAL`.
- `PRICE EACH` = the existing MSRP-each value, relabeled. No new field.
- `PRODUCT TOTAL` = MSRP each × qty.
- **Removed:** DISC %, PARTNER EACH, PARTNER TOTAL columns.
- **Removed:** the DEAL cell in the header block (raw internal Pipedrive title).
  CUSTOMER and CONTACT cells kept.
- **Grand total recomputed** as the sum of MSRP line totals (NOT the inherited
  partner/discounted total).
- Footnote reduced to "All amounts in USD." ("Partner pricing as quoted."
  removed; the Arxys-PO-acceptance price-lock line dropped from the customer
  document.)
- Top validity banner ("Quote valid for a maximum of 7 days…") kept.

Terms page:
- **Page-4 Terms & Conditions removed entirely.**

Footer:
- Address unchanged (El Cajon), same as the Project Quote.

### 4. MSRP frozen at generation

`PRICE EACH` must reflect the MSRP at the time the quote was generated, not a
live lookup. If the current snapshot resolves MSRP live from
`current_products.msrp` (ADR 0086) rather than storing it, the snapshot is
extended to store MSRP-each per line at generation so a Customer Proposal
re-downloaded after a price change still shows the originally-quoted number.
The Project Quote's MSRP-each column is fed from the same stored value.

### 5. Partner logo system

- **Format:** transparent PNG (admin-produced). PNG/JPG enforced at upload.
- **Storage:** Supabase Storage bucket (logos are not secret).
- **Attachment:** a `logo_path` (or equivalent) column on the partner/company
  record; documents resolve the logo from the submission's owning partner so it
  auto-renders. react-pdf `<Image>` renders PNG/JPG (SVG is not supported —
  hence the PNG constraint).
- **Placement on documents:** center of the header on **both** the Project Quote
  and the Customer Proposal. Blank fallback when no logo is attached; the header
  layout does not shift.
- **Dashboard:** the partner's own logo renders next to the "Welcome back,
  [name]" line on their own logged-in dashboard only. Not on internal/admin
  views.

### 6. Access path

The Customer Proposal is partner-facing and reads the **same `project_quotes`
row** under the **same widened SELECT policy from 0083** — no additional RLS
surface. It is wired as a **variant parameter on the existing 0083 route**
(`/api/submissions/[id]/project-quote/pdf?variant=customer-proposal`), not a
second route. Same ownership double-gate.

### 7. My Pipeline — two buttons per project

Partner-facing, per project, appearing only once a quote snapshot exists:
- **Download Project Quote** — partner pricing (their cost).
- **Download Customer Proposal** — end-user version (no discount).

## Consequences

- Partners get a clean, branded leave-behind for their end customers with no
  cost/discount exposure.
- The leak-guard test makes discount exposure a build-blocking regression rather
  than a review-time catch.
- Freezing MSRP at generation makes both documents stable across price changes.
- The logo system is reusable for any future partner-branded surface.

## Non-goals / deferred

- No partner-settable sell price; PRICE EACH is Arxys MSRP only.
- No end-customer identity capture; "Prepared for" keeps its existing value.
- No SVG logo support.
- No logo on internal/admin views (dashboard, partner-side only).

## Implementation notes (2026-07-21)

- **MSRP is already STORED, so §4 was a no-op migration-wise.** The commercial
  PRICE EACH renders from `snapshot.commercial.lineItems[].unitPrice` (Pipedrive
  `item_price`, frozen at generation), never a live `current_products` lookup
  (that view feeds only the page-2 showcase / primary-server spec). Both
  documents already reproduce the originally-quoted MSRP; no snapshot schema
  change or migration was needed. A unit test pins `priceEach === unitPrice`.

- **The partner logo is resolved LIVE and overlaid at render — a deliberate,
  scoped deviation from ADR 0060's snapshot-determinism rule.** The logo is not
  frozen in the snapshot; each download resolves the current logo from the
  owning partner (`on_behalf_of_partner_id ?? partner_id`) and injects it into
  the renderer. This means a re-render is no longer a pure function of the
  snapshot. Accepted because the logo is a branding overlay, not quote content:
  it never affects prices, quantities, totals, or terms — the integrity-critical
  data ADR 0060 exists to freeze. If a logo must ever be reproduced as-issued
  (e.g. the partner rebrands and an old proposal should keep the old mark),
  revisit by freezing the resolved logo path into the snapshot.

- **Discount-leak guard mechanism.** react-pdf subsets font glyphs, so the
  emitted PDF's text layer cannot be grepped. The build-failing guard therefore
  works at two faithful surfaces instead: (1) an object-graph scan of the
  assembled `CustomerProposalCommercial` (proving no partner/discount value or
  key survives the strip — the §2 boundary), and (2) a scan of the React element
  tree the renderer returns (the actual display strings, pre-subsetting),
  cross-checked by a Project-Quote "canary" so the scan can never pass
  vacuously. The metadata title is asserted separately.

- **Access surface unchanged.** The Customer Proposal is `?variant=customer-proposal`
  on the existing 0083 route — same row, same widened SELECT policy, no new RLS.
  Extended `scripts/test-rls.ts` (20e–20g) reaffirms same-row access for both
  documents. As with 0083, partner visibility of *either* document is gated on
  applying `20260720000001_project_quotes_partner_select.sql`.
