# 0080 — Quoted-solution capacity bars derived at render, not frozen

- **Status**: Accepted
- **Date**: 2026-07-07

## Context

Page 1 of the Project Quote shows two capacity bars (Total storage, Bandwidth)
that measure the calculated requirement against the *recommended* server's
capacity. Its caption already forward-references a "quoted solution on page 2
for actual delivered capacity" — a promise page 2 did not yet keep. The System
utilization bar was removed on 2026-06-22 precisely because the calculator
recommendation and the Pipedrive quote are independent data sources; this ADR
reinstates the correlation on page 2, where the quoted equipment lives.

Task 2b required a "Quoted solution" section below the product cards: a storage
bar (requirement ÷ summed net-usable storage of the quoted servers) and a
bandwidth bar (requirement ÷ summed max bandwidth). The gate was whether
net-usable storage is a *structured* field or only appears in the free-text
product title. Verification: it is structured. The page-2 showcase already
freezes `specHighlights` per product with `storageRawTb` / `hddCount` /
`raidLevelDisplay` (the inputs to the shared `usableCapacityTb` helper) and
`maxBandwidthMbps`. Nothing needs to be parsed from a title; no migration and no
schema addition are required.

## Options considered

- **Freeze a new `quotedSolution` block on the snapshot** (numerators +
  denominators computed at generation). Explicit and queryable, but adds a
  snapshot field, forces a `snapshotVersion` bump, and duplicates data already
  frozen — violating the "freeze raw, derive display at render" rule the
  snapshot is built on.
- **Derive at render from data already frozen** (`sizing.storageTb` /
  `sizing.bandwidthMbps` as numerators; `showcase[]` specs × line-item
  quantities as denominators). No new field, no version bump, works for every
  existing quote whose snapshot already carries `showcase`.
- **Parse net-usable from the product title.** Rejected outright — brittle and
  explicitly ruled out by the task.

## Decision

Derive the two bars at render. A pure exported helper `sumQuotedCapacity`
(`ProjectQuotePdf.tsx`) sums delivered capacity across the quoted equipment;
the page-2 section renders bars with the existing `CapacityBar` component and
navy-on-gray styling. Resolved sub-decisions:

- **Quantity-weighted.** A line's quantity multiplies its per-unit spec (N boxes
  deliver N× capacity), mirroring page 1's `serverSpec.maxBandwidthMbps × recUnits`.
- **Sum over the cards shown, null → 0.** Every showcase card contributes its
  structured values; a card with no `product_specs` row, or a SW workstation
  with bandwidth but no storage, simply adds 0 to the bar it can't feed. No
  per-family filter.
- **No `snapshotVersion` bump.** All inputs are already frozen; the renderer
  reads `snapshot.showcase ?? []` defensively for pre-ADR-0066 rows.
- **No conditional styling** for over/under-provisioning — neutral navy either
  way, per the task.

## Consequences

**Positive:** Zero migration, zero schema change; every existing quote gains the
section on re-render. Consistent with the snapshot's raw-freeze / derive-display
architecture. The math is unit-tested independently of the PDF.

**Negative:** The denominator is recomputed on every render rather than stored,
so it is not directly queryable from the row without unpacking the snapshot. A
quantity join (showcase SKU → line-item quantity) happens at render.

**When to revisit:** If a quoted-capacity figure ever needs to be queried or
audited outside the PDF, or if quotes begin mixing products whose bandwidth
spec is not additive toward the recording requirement, freeze an explicit
`quotedSolution` block and bump `snapshotVersion`.
