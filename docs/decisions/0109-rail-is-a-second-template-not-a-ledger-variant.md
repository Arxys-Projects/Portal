# 0109 — Rail is a second template with its own content type, not a Ledger variant

- **Status**: Accepted
- **Date**: 2026-07-31

## Context

The Phase 2 design handoff specifies two datasheet templates: "Ledger" for the V100–V800 NVRs and
the V250/V255 management servers, and "Rail" for the SW security workstations. Ledger shipped first
and, at three pages, is the subject of [ADR 0105](./0105-datasheet-renders-at-three-pages.md).

An earlier session rendered an SW10 mockup through the *Ledger* template to see how far it would
stretch. It rendered, but every section had to be re-purposed and labelled ADAPTED in the source: a
workstation has no drive bays, no RAID level, no recording ceiling and no orderable drive
capacities, so the model ladder became two cells, the "vs. 4MP baseline" column became a decode
comparison, and the orderable-configurations table carried bandwidth under a column header reading
RAW. The output was a server sheet wearing workstation figures.

Rail is also structurally different, not just differently populated: a 214px left rail carrying
identity, attributes, warranty and compliance; a four-column camera stream matrix
(Resolution / Codec / Camera Streams / Bandwidth) that lists H.264 and H.265 as separate rows where
Ledger's VSR table is H.265-only; no headline spec strip, no feature grid, no VMS row; and one page
rather than three.

## Options considered

- **One `DatasheetContent` with optional fields, one component branching on family type** — a
  dozen optional fields whose presence encodes which template is meant; the branch moves out of the
  type and into the layout, where it is harder to see.
- **One content type, two components** — the type still has to be the union of both sheets, so it
  stops describing either one, and nothing stops a Rail component reading a Ledger-only field.
- **A second content type and a second component, sharing tokens and asset loading** — two honest
  contracts; duplicate cost is limited to a handful of small styles.

## Decision

Rail gets its own `RailContent` type (`src/lib/datasheet/rail-types.ts`) and its own
`RailDatasheetPdf` component. Both share `tokens.ts` — `px()`, the colour and font tokens,
`registerDatasheetFonts()` and `loadPng()`. `DatasheetContent` and `DatasheetPdf` are untouched.

Three things are fixed by this ADR rather than left to the next editor:

1. **Rail is one page, and that is a constraint, not a default.** Unlike Ledger, there is no
   standing recommendation to spill. If a SKU stops fitting, that is a design call to raise, not an
   implementation detail to absorb. The render script counts pages in the emitted PDF and shouts
   when the count is not 1.
2. **The warranty seal is chosen by term, never by convenience.** The handoff recorded that no
   3-year seal graphic existed and held a dashed 62px circle for one. The graphic arrived the same
   day as this template — `public/price-book/3_year_warranty-circle.png`, 347×349 RGBA, matching
   its 5-year sibling in the same folder — so workstations now render the real mark and the held
   circle survives only as the fallback when a term has no graphic. The two seals sit next to each
   other under the same naming; pointing a 3-year sheet at the 5-year file would print a false
   warranty claim on a customer-facing document, so the path is derived from `warranty_years`
   rather than hardcoded.
3. **Empty spec columns produce no row.** SW10 has empty `raid_support`, `cooling`, `remote_mgmt`,
   `storage_temp`, `regulatory_emissions` and `security_features`; its own `notes` column records
   that the source factsheet lacks those blocks. The template omits them rather than inventing a
   TPM or encryption claim the product never made.

## Consequences

**Positive:** each type describes exactly one sheet, so a missing field is a compile error rather
than a blank region. Ledger's three-page layout and its 442-test baseline are unaffected. The two
templates can diverge further — Rail wants an on-screen portal view with a different breakpoint
story — without either constraining the other.

**Negative:** two components to keep in step when a shared token changes, and two mockup render
scripts. Some small styles (photo slot, spec list, compliance pill) are near-duplicates that will
tempt an extraction before they have earned one.

**When to revisit:** if a third template appears — the ACM line (V150 / V260 / V265) is out of
scope for this pass and has no sheet designed — the shared pieces should be pulled into a common
module before a third copy of the spec list exists, rather than after.
