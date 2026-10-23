# 0154 — System design and BOM rules are admin-edited tables with one audit trail and no delete

- **Status**: Accepted (Step 1 of [the brief](../Portal-Project%20revamp/claude-code-brief-project-portal-backend.md); applied by Andy 2026-10-16, live RLS suite all pass)
- **Date**: 2026-10-16
- **Related**: 0096 / 0097 (admin-editable reference tables with stamp and audit triggers), 0094 (a missing spec row silently drops a SKU), 0076 (append-only `products`)

## Context

The brief locks that every system design default and BOM mapping is admin-editable, carries a
plain-language description, and is snapshotted onto each calc at save. Step 1 creates
`system_design_rules` (named defaults) and `bom_rules` (design item + server role → SKU × qty per
server) and seeds the brief's values.

## Options considered

- **Write access**: admin only (the 0096 pattern) vs admin or internal. Rules change the BOM on every
  future project calc; admin-only keeps that a deliberate act.
- **Audit**: one audit table per rules table (the 0096/0097 shape) vs one shared table keyed by
  `rule_table`. The two tables are edited by the same people on the same form; one history is simpler
  to read and to snapshot.
- **`system_design_rules.value` type**: numeric vs jsonb. All three seeds are numbers, but a later
  rule may be a boolean or a SKU.
- **`bom_rules.sku` integrity**: FK (impossible: `products.sku` is not unique since 0076) vs a trigger
  that refuses a SKU the catalog never had vs nothing.
- **Delete**: allow vs no grant. A deleted rule disappears from every future calc with no error.

## Decision

- Internal and admin SELECT (project calcs run as internal users); admin INSERT and UPDATE; no DELETE
  grant. A BOM rule is retired with `active = false`.
- One insert-only `design_rules_audit` (admin read, no client write), filled by a SECURITY DEFINER
  AFTER trigger; a BEFORE trigger stamps `updated_at` / `updated_by`.
- `value` is jsonb; the Step 3 engine validates each key's type.
- A trigger refuses a `bom_rules.sku` that no `products` row has ever carried. It does not require the
  SKU to be active; Step 5's preview refuses inactive or unpriced lines with a reason.
- Server eligibility for SFP+ is read from `product_specs.rack_units`, not stored as a rule.
- Seeds: `failover_days_fraction` 0.5, `default_primaries_per_failover` 2,
  `suggest_dedicated_mgmt_above_servers` 3; SFP+ (both NICs) and GPU rows for recorder and failover.

## Consequences

**Positive:** every rule change has a who, when, before and after. No silent loss of a rule. Admin
typos in a SKU fail at save.

**Negative:** a jsonb value moves type checking from the database to the engine. The audit grows
without a retention policy, like 0096's.

**When to revisit:** if internal reps need to tune rules themselves, if rules need draft/publish, or
if `products.sku` becomes unique again (then replace the trigger with an FK).
