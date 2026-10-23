# 0176 - A portal-built deal is quoted only from confirmed pricing, read once

- **Status**: Accepted (code behind `PROJECT_QUOTE_GATE`, default off; Step 6 Phase B of [the brief](../Portal-Project%20revamp/claude-code-brief-project-portal-backend.md); live test passed on deal #5589 2026-10-23, deployed with the flag off)
- **Date**: 2026-10-23
- **Related**: 0155 / 0175 (confirmations, server-written), 0170 / 0171 (claim and ledger), 0173 (revisions keep their deal), 0174 (quote pin), 0060 (a quote renders from its snapshot)

## Context

For an Arxys-started project the portal builds the Pipedrive deal and its lines (Step 5). The rep
then sets discounts in Pipedrive. The brief locks a pricing gate: the rep confirms pricing before a
Project Quote can be generated, and an edit in Pipedrive afterwards must be noticed.

Three gaps had to be closed for the gate to mean anything. Generation read the deal's lines with a
single v1 call (no paging) and could read them again after any check. Revisions share their source's
deal, so a confirmation for one revision says nothing about another's design. And the Step 5
fingerprint left out discount and role.

## Options considered

- **Decide "portal-built" from a Pipedrive field (`arxys_project_id`) or the title.** Editable in
  Pipedrive; refused by the prompt.
- **Check the gate, then let generation read the deal as before.** Leaves a window where a line
  changes between the check and the PDF.
- **Read the lines once in the gate and hand them to the quote reader** (chosen).
- **Diff the deal against the calc that built it** at confirm time. Blocks every revised deal for
  good (ADR 0173). Chosen instead: the deal's current calc, the newest project-linked calc on that
  deal that no other one revises.

## Decision

- **Portal-built** means a `project_deal_claims` row or `deal_line_syncs` rows for the deal, read as
  service role so RLS cannot hide one. A read error refuses; it never falls through to legacy.
- **`confirmDealPricing(deps, dealId, shownFingerprint, actor)`**, internal or admin, refuses unless:
  the deal has a claim; every ledger row is `added` (an empty ledger counts as pending); the deal has
  lines (v2, every page); `diffBomAgainstDeal` against the current calc is clean; and a fresh
  fingerprint equals the one the rep was shown. It then writes the confirmation as service role with
  the fingerprint, the raw lines (`deal_lines`) and the current calc's id. `readDealPricing` is the
  read-only half the rep reviews first.
- **The gate fingerprint** is the `DealLineFingerprint` shape plus optional `discount`,
  `discount_type`, `role` (from the line comment) and `currency`, built by `fingerprintGateLines`
  and compared by `sameGateLines` (name included). The Step 5 preview fingerprint, `sameLineItems`
  and the cache are untouched.
- **Generation** (`checkQuoteGate`, called from `readQuoteInputs` in assembly): flag off, or a deal
  the portal did not build, is not gated and reads exactly as before. Otherwise the latest
  confirmation (`confirmed_at desc, id desc`, the table has no `created_at`; rows without
  `deal_lines` ignored) must be for the calc being quoted, then ONE v2 read of the lines
  (`sort_by=order_nr`, every page) must match it, and `getDealForQuote` is handed those lines and
  does not read them again. The confirmation id and fingerprint go into the snapshot
  (`pricingGate`). A refusal tells the rep to confirm again.
- A 23505 that survives `generate.ts`'s one retry reads "Another quote was just generated for this
  calc. Try again."
- Confirm always records the deal's current calc (the newest revision). Once a newer revision is
  confirmed, an older one can no longer be quoted on a gated deal. Until then, the last confirmed
  calc stays quotable even after a newer revision is saved, and the rep confirms the new one when
  its lines are fixed. Simpler than per-calc confirmations.
- A line the fingerprint cannot read (no product id) refuses, so nothing prints unchecked.
- **Phase C test override** (Andy, 2026-10-23): test deal #5589 was rebuilt by hand during
  development and no longer matches its calc's design. `deps.designCheckOverride = "phase-c-test"`
  skips only the design diff in `confirmDealPricing`; every other check runs. It is set only by
  `scripts/project-quote-phase-c.mts confirm --ignore-design-diff`, which allows deal #5589 alone, and
  a unit test fails if any app file mentions it. The confirmation row does not record that the
  override was used (no column for it); the JOURNAL does.

## Consequences

**Positive:** the PDF prices are exactly the lines the gate checked against what the rep confirmed.
A discount, price, quantity, role, name or currency edit after confirmation is caught.

**Negative:** the deal header (value, currency, people) still comes from a separate v1 read and is
not in the fingerprint (review gate S-2, Medium). Pipedrive computes the value from the lines
(verified in Step 5 Phase B), so a mismatch needs an edit between two reads a moment apart.
The v2 response field names were verified on deal #5589 (2026-10-23): each line carries
`discount`, `discount_type`, `sum`, `currency`, `order_nr` and `comments`, and the v1 and v2 builds
of its quote lines are identical. v1 returns lines out of `order_nr` sequence; both PDF line tables
sort by `order_nr`, so the printed order is the same.
Every confirm reads the full product list.

**When to revisit:** if a header field starts carrying pricing (a deal-level discount), or when
options and phases put several calcs on one deal.
