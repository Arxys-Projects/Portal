# 0032 — SKU-level recommendation algorithm (Phase 2 Step 4)

- **Status**: Accepted
- **Date**: 2026-05-21

## Context

ADR [0031](./0031-step-3-4-schema-migration.md) replaces the family-PK `products` + `server_specs` with a single SKU-PK `products` table. The recommendation algorithm at `src/lib/recommend/algorithm.ts` was previously family-level (picked V200/V400/V500/V600/V700/V800 with placeholder $1–$6 prices). It now picks a specific SKU from real MSRPs.

The algorithm's input space is changing from 6 families to ~36 SKUs (currently 6 seed SKUs; Step 5 expands to the full Sheet). With real prices, the rank order is no longer monotonic in family size — e.g. 1× V400 can beat 2× V200 on total cost despite V400 having a higher per-unit price. The tie-break logic also needs reconsidering: the old "unit price ASC" tertiary doesn't carry forward cleanly when multiple SKUs in the same family have different prices.

The brief at [`docs/phase-2/step-3-and-4-schema-and-algorithm.md`](../phase-2/step-3-and-4-schema-and-algorithm.md) §3 specified the new tie-break, with one wording ambiguity: "capacity utilization ascending (less over-provisioning preferred)" reads as contradictory (ASC utilization = LOW utilization = MORE over-provisioning). This ADR resolves the ambiguity by treating "less over-provisioning" as authoritative.

## Options considered

### Tie-break ordering (after primary `totalCost ASC`)

- **(i)** Secondary: `units ASC`. Tertiary: `unit_msrp ASC` (Phase 1 holdover).
  - Inherits a tertiary that no longer makes sense — with real prices, the unit-msrp tie is rare and the rule has no engineering meaning.
- **(ii)** *(Chosen)* Secondary: `units ASC`. Tertiary: **excess capacity in driver dimension ASC** (tighter fit wins). Quaternary: `sku ASC` (deterministic).
  - The brief's intent. Two SKUs that fit the workload identically (same total cost, same unit count) — prefer the one whose covered capacity is closer to the requirement.
- **(iii)** Secondary: `units ASC`. Tertiary: **utilization ratio DESC** (high utilization wins).
  - Equivalent to (ii) in single-dimension cases; subtly different when cameras and storage diverge. (ii) is simpler to compute and reason about.

### MKT/CFQ filtering

- **(a)** *(Chosen)* Filter at both the query layer (calculator action) and the algorithm layer (defensive). MKT/CFQ SKUs are never candidates.
- **(b)** Filter at the query layer only. Algorithm trusts its input.
- **(c)** Algorithm filter only. Calculator query loads everything.
  - (a) is "belt and suspenders" — the algorithm is also called from tests + future tooling that may not pre-filter. The defensive filter throws an explicit error if the pool ends up empty, which is more useful than picking an MKT/CFQ row by accident.

### Warning shape

- **(α)** *(Chosen)* "Workload exceeds a single {productGroup}; recommendation stacks N units of {sku}." References both the family (for context) and the SKU (for precision).
- **(β)** Just the SKU: "Recommendation stacks N units of VX5-V800-720."
- **(γ)** Just the family (Phase 1 style): "Recommendation stacks N units of V800."
- (α) gives the partner enough info to interpret either way without a sku-decoder lookup.

## Decision

Algorithm rewritten in `src/lib/recommend/algorithm.ts`:

1. **Filter** the candidate pool to `priceType === 'numeric'` (Q4a from ADR 0031). Throw if the resulting pool is empty.
2. **Evaluate** each surviving SKU: units = max(1, ceil(cams/maxCams), ceil(storage/maxStorageTb)); totalCost = units × msrp; coveredCameras + coveredStorageTb directly; driverDimension = whichever dimension drove the unit count (storage > cameras tie breaks to cameras).
3. **Rank** by (totalCost ASC, units ASC, excess in driver-dimension ASC, sku ASC).
4. **Warnings**:
   - units > 1 → "Workload exceeds a single {productGroup}; recommendation stacks {units} units of {sku}."
   - workload exceeds the largest single SKU on either dimension → "Workload exceeds the largest single VideoX SKU on at least one dimension. Sales engineering should review before quoting."

Candidate shape from `src/lib/recommend/types.ts`:

```ts
type RecommendationCandidate = {
  sku: string;
  productGroup: string;
  productName: string;
  units: number;
  unitMsrp: number;
  totalCostUsd: number;
  coveredCameras: number;
  coveredStorageTb: number;
  driverDimension: "cameras" | "storage";
};
```

Tests at `src/lib/recommend/algorithm.test.ts` exercise 11 cases including the new MKT/CFQ filter (positive + negative) and the tighter-fit tie-break.

## Consequences

**Positive:**

- Tie-break logic is engineering-coherent: prefer cheaper, then fewer boxes, then tighter fit. Sales conversations can defend any of these layers.
- MKT/CFQ SKUs can land in the Sheet (and get pushed by Step 5) without breaking the calculator — the filter handles them transparently.
- Candidate carries `productGroup` + `productName` + `sku`, so downstream consumers (Pipedrive deal builder, PDF render, calculator UI) don't need separate lookups for display strings.

**Negative:**

- Tighter-fit tie-break is unfamiliar to anyone who only knew the Phase 1 algorithm. Documented here + in the algorithm-module header to keep the wording-ambiguity resolution discoverable.
- The brief's contradiction ("capacity utilization ascending" vs "less over-provisioning preferred") is resolved silently in code; future readers should hit this ADR before the algorithm if confused.

**When to revisit:**

- If a real workload produces a recommendation that sales considers wrong, the most likely root cause is either (a) wrong `max_cameras`/`max_storage_tb` for a specific SKU (Step 5 push script + Sheet data quality), (b) MKT/CFQ exclusion suppressing a legitimately recommendable SKU (Q4 revisit), or (c) tie-break preferring tighter fit in a case where over-provisioning is actually desirable (re-open Q on tertiary).
- If `unitMsrp` ends up unused by consumers, drop it from the candidate type. Currently retained as an audit field — sales can reconcile `units × unitMsrp = totalCostUsd` at a glance.
