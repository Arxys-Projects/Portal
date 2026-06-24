# 0074 — Remap Genetec SV-2041E-R4 arxys_match_id to an existing product_spec

- **Status**: Accepted
- **Date**: 2026-06-24

## Context

The Genetec StreamVault portal load (see JOURNAL 2026-06-24) specified
`arxys_match_id = 'VX5-V200-88'` for the three `SV-2041E-R4` rows. That ID does
not exist in `product_specs` — the live table has 21 VideoX models and the
`VX5-V200` tier jumps `…-64, -80, -96` with no `-88`. `competitor_products.arxys_match_id`
is `NOT NULL REFERENCES product_specs(id)`, so inserting those rows as specified
would fail with a foreign-key violation.

Two source instructions conflicted: "preserve `arxys_match_id` exactly" and
"do not modify `product_specs`". Both cannot hold when the referenced model
doesn't exist and we won't create it.

## Options considered

- **Remap to the nearest existing tier (VX5-V200-96)**: rows insert cleanly; the comparison points at the closest real VideoX model (higher tier, conservative — never under-states Arxys capacity vs. the Genetec box's 300 cameras / 64 TB).
- **Remap to VX5-V200-80**: also valid, but the lower neighbour — a weaker Arxys match for a 300-camera competitor.
- **Add a `VX5-V200-88` product_spec**: satisfies the FK but violates "don't modify product_specs", and no authoritative spec values for that model were provided.
- **Hold the 3 rows out**: respects every constraint but ships Genetec at 14/17, leaving the SV-2041E-R4 family uncomparable.

## Decision

Remap the three `SV-2041E-R4` rows to **`VX5-V200-96`**, the nearest existing
higher tier. The substitution is recorded in the migration header, in each
row's `notes` field in `data/server-specs.json`, and here.

## Consequences

**Positive:** All 17 Genetec rows insert without weakening the FK. The match is conservative (higher Arxys tier).
**Negative:** Overrides the "preserve exactly" instruction for 3 rows; the match is a substitution, not the originally intended target.
**When to revisit:** If a `VX5-V200-88` (or otherwise intended) VideoX model is added to `product_specs`, update the three `SV-2041E-R4` rows' `arxys_match_id` to point at it.
