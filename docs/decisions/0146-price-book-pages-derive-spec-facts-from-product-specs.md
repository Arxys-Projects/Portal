# 0146 - Price Book product pages derive spec facts from product_specs

- **Status**: Accepted
- **Date**: 2026-10-12

## Context

`product_specs` is canonical and admin-editable (ADR 0096, 0097). The datasheet route
(ADR 0110, 0116), the calculators and the recommender all read it, so an `/admin/specs` edit
reaches them. The `/price-book/{slug}` product pages did not: their hero stats, Key Features
and Technical Specs were literal strings in `src/lib/price-book/families.ts`, and their SKU
tables carried 18 hand-typed `netStorage` overrides that shadowed the computed figure.

The cost was visible. A month after the 2026-09-14 CPU refresh, the V400 page still said 200
streams on the old CPU, and the V700/V800 pages said 325 streams at 4.3GHz, while the
datasheets for the same models said 150 and 275. The V400 page also said RAID 5 for a box the
rows and ADR 0092 both record as RAID 6. Every one of these was a hand-sync that nobody did.

Scope is the seven families with `product_specs` rows (V100, V200, V400 to V800). V250, V260,
V150 ACM and the SW workstations read `appliance_specs` and stay authored for now.

## Options considered

- **(a) Keep hand-syncing `families.ts`.** No code change, and the drift recurs on the next
  spec edit, as it already had twice.
- **(b) Derive the facts at request time from the rows the page already queries.** One read per
  page render (at most a handful of rows); a fact edit lands everywhere at once; the page and
  datasheet can share the canonical-row rule.
- **(c) Generate `families.ts` from the database at build time.** Removes the hand step but
  ties a spec edit to a deploy, and the page would still disagree with the live datasheet
  between deploys.

## Decision

**(b).** `src/lib/price-book/family-specs.ts` derives the three hero stats, five Key Features
and six Technical Specs from the model's canonical row, chosen by the same `canonicalRow()`
the datasheet uses (moved to `src/lib/datasheet/canonical-row.ts` so the page does not load
`@react-pdf/renderer`). The page passes only the SKUs it lists, so a hidden `-NCD` copy never
speaks for it.

`Family` is a union on `specSource`. A `"product_specs"` family cannot carry `kpis`,
`keyFeatures` or `technicalSpecs`; writing one is a compile error. `"authored"` families keep
their arrays. The 18 `netStorage` overrides on V200 to V800 are deleted and the cell is
computed; the V100 keeps its three dual-configuration strings (ADR 0092).

A blank column drops its bullet. Nothing falls back to the old authored text.
`scripts/audit-price-book-specs.ts` compares page and datasheet facts on live rows and exits
non-zero on any mismatch.

Wording decisions made at the two review gates: throughput in Mbit/s (one constant); the OS
line is `os_edition` as the datasheet prints it; the OS drive bullet is composed from
`os_ssd_type` and `os_redundancy` (the datasheet's fallback formula), with `os_drive_desc`
ignored because it drops the drive count and the mirroring on three models; network ports
come from the integer port columns; the warranty stat's unit line stays an authored constant
because `warranty_terms` is not short or consistent enough to print there.

## Consequences

**Positive:** a fact edit in `/admin/specs` reaches the product page and the datasheet
identically, proven by a parity test on fixture rows and by the live audit script. The
"forgot to update the Price Book" class of bug is gone for these seven families, and the type
system stops it coming back.

**Negative:** authored copy for these families shrinks to `tagline` and `greatFor`. A wording
change to a bullet is now a code change in `family-specs.ts`; a fact change is a data change.
Data defects now print on the page too (they already printed on the datasheet), so the
quality of free-text columns matters more. The page's hot-swap power test reads "Yes 1+1" as
yes, which is looser than the datasheet's `isYes()`.

**When to revisit:** when V250, V260, V150 ACM or SW move onto `appliance_specs`-derived page
facts (plug a second source into `resolveFamilyDisplay`), or if the datasheet's canonical row
stops being the right row for the page, which the hidden `-NCD` rows already strain (they are
in the datasheet's model groups today; the page excludes them).
