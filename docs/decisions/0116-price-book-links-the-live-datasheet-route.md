# 0116 — Price Book links the live datasheet route, and the gate widens to any active partner

- **Status**: Accepted
- **Date**: 2026-08-05
- **Related**: widens the gate set by [0110](./0110-datasheet-generation-in-the-portal.md);
  depends on [0111](./0111-management-is-a-ledger-variant.md) and
  [0104](./0104-appliance-specs-seeded-by-reviewed-import.md) having closed the V250/V255 and
  SW10/SW20 coverage gaps; leaves the ACM exclusion of 0110 in place

## Context

The Price Book's per-family "Documentation" section linked to static PDFs hosted on arxys.com
(`Arxys-VideoX-Factsheet-V600-V5.pdf` and friends), stored per family in `families.ts`. Those files
are hand-published and drift from the spec tables the portal itself edits: a figure corrected in
`/admin/specs` shows on the Price Book page immediately and on the linked PDF never.

ADR 0110 built `GET /api/datasheet/{model}`, which renders the same sheet on demand from live spec
rows, and 0111 plus the `appliance_specs` work extended it. Coverage was re-verified against live
rows today rather than taken from the 2026-07-23 audit, and every catalogue entry was rendered
end-to-end with `scripts/render-datasheet.ts --all`: ten sheets render at their specced page count
(V100, V200, V400, V500, V600, V700, V800, V250/V255, SW10, SW20). Only the three ACM rows — V150,
V260, V265 — still have no template, and answer 409 by design.

The blocker was authorization, not coverage. `requireDatasheetAccess()` gated the route to admin and
internal users, while the Price Book is visible to every active partner. A straight link swap would
have answered 403 on a button that worked for those partners the day before.

## Options considered

- **Swap the links, leave the gate.** Faithful to the brief, but ships a 403 to the majority of the
  page's audience. Rejected.
- **Render the live button only for admin/internal, static PDF for everyone else.** No 403s, but two
  link targets for one document, and partners keep receiving the stale sheet — the exact drift the
  swap exists to end.
- **Wait for a marketing pass on `copy.ts` before swapping anything.** The safest, and the reason
  0110 set the narrow gate in the first place. Costs an unbounded delay on a drift bug that is live
  now.
- **Widen the gate to any active partner and swap.** Accepts unreviewed authored copy reaching
  partners in exchange for figures that are correct.

## Decision

**Widen `requireDatasheetAccess()` to any active partner, and point the Price Book at the live route
for the ten models it covers.**

A datasheet is marketing collateral. Nothing on it is priced, per-partner, or otherwise sensitive —
the same figures are already printed on the Price Book page that links to it. The gate is
status-based only: suspended and invited partners are still refused, which is the same line the
`(app)` layout draws for every other signed-in surface.

**`/admin/datasheets` does not widen with it.** It previously borrowed `requireDatasheetAccess()` and
now calls `requireAdminOrInternal()` directly. It shows gaps, warnings, template names and the ACM
refusal reasons — an internal spec-admin view that happens to dispense PDFs.

**The V260 ACM family keeps its static PDF.** `/api/datasheet/V260` answers 409, and a working link
is not traded for an error page. This is the one family the swap leaves behind; it comes back when an
ACM template exists.

**`Family.datasheetModels: string[]` is the new field, and `datasheetButtonsFor()` the single place
the button list is decided.** A model key is a datasheet catalogue key, not a slug and not a SKU:
`v250` maps to the one key `V250` because V255 is an alias on the same sheet, and the `sw` family maps
to two keys because SW10 and SW20 were never one sheet. `datasheetUrl` survives only where no live
sheet exists, and a test asserts the two are never both set.

## Consequences

**Positive:** every partner-facing datasheet is now generated from the row an admin can edit, so the
Price Book figures and the downloaded sheet cannot disagree. Ten of eleven link targets are live. The
`datasheetButtons`/`datasheetUrl` double-gate that had silently hidden both SW workstation sheets
behind "Documentation coming soon." is gone, replaced by one resolver with tests.

**Negative:** partners now receive authored copy from `copy.ts` that has never had a marketing pass —
a known cost, taken deliberately, and the thing to fix next. The V260 family is inconsistent with the
other ten. A typo in `datasheetModels` produces a 404 where a static URL would merely have 404'd on
arxys.com; the static test catches keys that are not one of the family's own product groups, but only
`scripts/render-datasheet.ts --all` proves a key actually renders.

**When to revisit:** when `copy.ts` gets its marketing pass (the negative above disappears); when an
ACM datasheet template is designed (V260 joins the other ten and `datasheetUrl` can be deleted
outright); or if a datasheet ever needs to carry partner-specific or priced content, in which case
the gate is the wrong shape and should move back toward 0110's.
