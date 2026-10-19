# 0161 - The BOM is one price-free line per SKU and role; add-ons scale per server and name their rule

- **Status**: Accepted
- **Date**: 2026-10-19
- **Related**: 0154 (bom_rules), 0155 (deal-line ledger keyed on deal, SKU, role), 0158 (rules snapshot)

## Context

Arxys-started project deals get product lines from the calc's bill of materials. Step 5 prices
each line from the Pipedrive product and records it in `deal_line_syncs`, which is unique on
(deal, SKU, role). Prices never come from the portal. The BOM rules say which SKUs a design choice
adds, per server role, at a quantity per server.

## Options considered

- **Line identity**: one line per SKU (merging roles) vs one per (SKU, role). The ledger and the
  revision diff key on role, so merging would lose which server a NIC belongs to.
- **Two rules adding the same SKU to the same role** (possible across design items): sum them vs
  refuse. Summing hides which rule a quantity came from.
- **Signature**: the brief's seven positional arguments vs one object with the same names. Two
  adjacent booleans (`gpu`, `sfp`) are easy to swap by position.

## Decision

- `buildBom({ primary, failover, management, gpu, sfp, workstations, bomRules })` in
  `src/lib/system-design/bom.ts` returns `{ sku, qty, role, ruleId }` lines. No prices.
- Server lines (recorder, failover, mgmt, workstation) have `ruleId: null`. A role with no servers
  gets no line.
- An add-on line is `qty_per_server` × that role's server count, for each active rule whose design
  item is on, and carries the rule's id so it can be traced in the snapshot.
- Rules for a design item the engine does not know (anything but `sfp` and `gpu`) add nothing; the
  resolver warns about them.
- `parseDesignRules` refuses two active rules for one (SKU, role). `buildBom` throws if a rule adds
  a role's own server SKU to it.
- `buildBom` checks each rule it is given again (id, SKU, role, `qty_per_server` a safe integer from
  1 to 100) and every line quantity, so a banked snapshot passed in without a fresh parse cannot
  produce a negative, fractional or overflowing quantity.
- Order is fixed: recorder, failover, mgmt, workstation; in each, the server line, then add-ons by
  rule id.
- `bomRules` comes from the rules snapshot, so a rebuilt BOM uses the rules the calc was saved with.

## Consequences

**Positive:** lines map one to one onto ledger rows and the revision diff. A quantity can always be
traced to a rule.

**Negative:** a second rule that adds an existing SKU to the same role has to be merged into the first.

**When to revisit:** if a design choice needs a fixed quantity per calc rather than per server, or a
rule needs to depend on the server model.
