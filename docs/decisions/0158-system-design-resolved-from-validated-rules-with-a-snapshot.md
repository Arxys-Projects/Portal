# 0158 - A pure engine resolves each project calc's system design from validated rules, and the calc banks a snapshot of them

- **Status**: Accepted
- **Date**: 2026-10-19
- **Related**: 0154 (the rules tables), 0132 (per-group retention), 0159 (failover sizing), 0161 (BOM lines)

## Context

Project calcs carry system design inputs: SFP+, GPU, failover (days and primaries per failover),
a dedicated management server (single or pair) and workstations. Every default comes from the
admin-edited `system_design_rules` table, whose `value` is jsonb, so nothing in the database checks
its type (0154). The brief also requires each calc to keep the rules it was saved with, so an
admin edit later does not change an issued quote. Step 3 builds the engine; Step 4 wires it into
the save and decides where the snapshot is banked.

## Options considered

- **A malformed or missing rule**: fall back to a constant in code vs refuse the calc with a
  plain-language error. A fallback makes an admin's edit look saved while calcs ignore it.
- **Snapshot shape**: a computed summary vs the validated rows in the shape they were read in. The
  row shape can be fed back into the same engine.
- **Failover days default**: `ceil(longest retention × fraction)` computed raw vs with a small
  tolerance. Raw, `0.07 × 100` is `7.000000000000001` and rounds up to 8.
- **Dropdown SKUs** (management server, workstations): trust the form vs check against a list the
  caller loads from active products.
- **SFP+ or GPU on with no active rule for it**: build the BOM without the add-on vs refuse.
- **Where the sizing chain lives**: in Step 4's server action vs one exported pure function the
  tests exercise.

## Decision

- `resolveSystemDesign(calc, projectDefaults, rules, catalog)` in `src/lib/system-design/resolve.ts`
  is pure. It returns the resolved design, the parsed rule values, the snapshot and warnings, or a
  list of errors. A fourth argument, `catalog`, holds the dropdowns' SKUs (the brief sketched three
  arguments). The caller loads it on the server from active products, never from the request.
- `parseDesignRules` (`rules.ts`) checks each known key's type and range, refuses a missing or
  repeated key, and refuses any calc while a rule is malformed. Unknown keys are ignored. A BOM row
  with no `active` flag is an error, so a read that leaves the column out cannot drop every add-on.
- The snapshot is the known rule rows plus the active BOM rules, copied field by field, in row
  shape. It fixes the **rules** a calc was saved with. The resolved design also depends on the calc's
  inputs and the dropdown catalog, which the snapshot does not hold, so a saved calc is displayed and
  reopened from its banked resolved design and BOM. Resolving again is a fresh save against today's
  catalog and can fail if a SKU has left the dropdown.
- Retention for the failover default is the group's own, then the calc's: the same chain
  `submitCalculation` sizes with (ADR 0132), so the default comes from the retention the sizing
  used. VMS comes from the calc, then the project.
- The failover days default rounds up with a 1e-9 tolerance and is never below 1.
- Ceilings on rep-entered counts: primaries per failover 1 to 100 (the rule too), workstations 0 to
  500, failover days 1 to 730. All must be safe integers. A SKU that is not text is reported as an
  inactive SKU instead of throwing. The 100 and 500 are placeholders for Andy to confirm.
- SFP+ or GPU on with no active BOM rule for recorders is an error. For an item that is on, the
  recorders' and failovers' add-ons are compared by SKU and quantity, with or without a failover in
  the calc, and a difference is a warning: it most likely means one retired row of a pair. Known
  limit: retiring the same part for both roles leaves the two lists equal, so nothing warns; catching
  that would mean naming SKUs in code.
- Warnings that leave the design as chosen: GPU on with a VMS that does not use it (Milestone, Genetec,
  ExacqVision); failover days above the longest retention. `dedicatedManagementSuggestion` applies
  `suggest_dedicated_mgmt_above_servers` once sizing is known, counting primaries and failovers.
- `sizeProjectDesign` (`size.ts`) is the one chain after resolution: `recommend` and
  `recommendFailover` with the same specs and `excludeOneU = sfp`, then `buildBom`, then the merged
  warnings. It refuses an empty group list, and groups whose longest retention differs from the
  resolved design's, so the failover default and the failover's daily load come from the same groups. A sizing error comes
  back as `ok: false`. Step 4 calls it instead of repeating the glue.

## Consequences

**Positive:** an admin typo stops calcs with a message naming the rule, instead of quietly quoting
on a default. Issued quotes keep their rules. Every path is unit-tested without a database.

**Negative:** one bad rule blocks every project calc until an admin fixes it. Step 4 must load the
dropdown SKUs to pass `catalog`, and must bank the resolved design (not only the snapshot) to
reopen a calc as saved.

**Constraint on Step 4 (security review S-1):** the engines trust a well-typed snapshot and
design, so whoever can write them controls the add-ons and quantities. Step 4 banks the resolved
design, the snapshot and the BOM in a side table with no INSERT, UPDATE or DELETE grant for
`authenticated`, written only by server code that first checks the caller owns the submission, and
never on `submissions`. It never reads a snapshot or a design from the request. `scripts/test-rls.ts`
gets a denied-write case for the table.

**When to revisit:** if rules gain draft/publish, or if a rule needs a type other than a number.
