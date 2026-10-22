# 0168 - Project calcs load the candidate pool through their own loader

- **Status**: Accepted
- **Date**: 2026-10-22
- **Related**: 0082 (one pool loader for the calculator and Quick Calc), 0094 (capacity from `product_specs`), 0160 (SFP+ excludes 1U by `rack_units`), 0166 (the snapshot harness)

## Context

The SFP+ rule (ADR 0160) reads `product_specs.rack_units`, and the `sfp_addon` cross-check reads
`sfp_addon`. `loadCandidateSpecs` does not select either column, so on today's path both come
through as null, and an SFP+ calc would empty the pool and fail to size.

`loadCandidateSpecs` serves every partner save and the Quick Calc preview. The `submitCalculation`
snapshot (ADR 0166) records the exact request it sends, and Step 4 must leave the partner path
byte-identical.

## Options considered

- **Add the two columns to the shared query.** One loader, but every partner save then sends a
  different request and reads two columns it never uses, and the snapshot fails for a Step 4
  change, which ADR 0166 does not allow re-recording for.
- **A second, separate loader for project calcs.** Copies the product query, the join and the
  usable-capacity math, which then have to be kept in step by hand.
- **One private loader that takes the spec column list, with two exported entry points**
  (chosen). The partner entry point passes the old list; the project one adds `rack_units` and
  `sfp_addon`.

## Decision

`candidates.ts` has a private `loadPool(supabase, specColumns)`. `loadCandidateSpecs` calls it with
the partner column list, written as a constant whose comment says the snapshot pins it.
`loadProjectCandidateSpecs` calls it with that list plus `rack_units, sfp_addon`. `submitCalculation`
uses the project loader only when the save is a project calc. The product query, the join on SKU
and the net-usable storage are shared.

A unit test pins both column lists, and the snapshot harness pins the partner request byte for byte.

## Consequences

**Positive:** the partner query does not change, and a project calc sizes from the same products,
filters and capacity figures as a partner calc, plus the two SFP+ columns.

**Negative:** two entry points to one query. A later change to the partner column list has to
remember the project list is built from it.

**When to revisit:** when the partner path is allowed to change (for example, if partners get SFP+),
fold the two loaders back into one.
