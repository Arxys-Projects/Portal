import {
  GB_PER_TB,
  type RecommendationCandidate,
  type RecommendationInput,
  type RecommendationResult,
  type ServerSpec,
} from "./types";

// Phase 2 Step 4 — SKU-level recommendation.
//
// Per-SKU evaluation:
//   units_for_cameras = ceil(cameras / max_cameras)
//   units_for_storage = ceil(storage_tb / max_storage_tb)
//   units             = max(1, units_for_cameras, units_for_storage)
//   total_cost        = units * msrp
//
// MKT / CFQ SKUs are filtered out per Q4(a) in
// docs/phase-2/step-3-and-4-schema-and-algorithm.md. The caller is expected
// to pre-filter to `price_type='numeric'`, but the algorithm enforces it
// defensively too.
//
// Tie-break (after totalCost ASC):
//   1. units ASC — fewer boxes wins.
//   2. excess capacity in driver dimension ASC — tighter fit wins. This
//      reads as "less over-provisioning preferred" per the brief; the brief's
//      "capacity utilization ascending" wording is taken to mean "ASC on
//      excess" not "ASC on utilization ratio" — see ADR 0032.
//   3. sku ASC — alphabetical for determinism.

type EvalCandidate = RecommendationCandidate & { excess: number };

function evaluate(spec: ServerSpec, input: RecommendationInput): EvalCandidate {
  const storageTb = input.totalStorageGb / GB_PER_TB;
  const unitsForCameras = Math.max(1, Math.ceil(input.totalCameras / spec.maxCameras));
  const unitsForStorage = Math.max(1, Math.ceil(storageTb / spec.maxStorageTb));
  const units = Math.max(1, unitsForCameras, unitsForStorage);
  const driverDimension: "cameras" | "storage" =
    unitsForStorage > unitsForCameras ? "storage" : "cameras";
  const coveredCameras = units * spec.maxCameras;
  const coveredStorageTb = units * spec.maxStorageTb;
  const excess =
    driverDimension === "storage"
      ? coveredStorageTb - storageTb
      : coveredCameras - input.totalCameras;
  return {
    sku: spec.sku,
    productGroup: spec.productGroup,
    productName: spec.productName,
    units,
    unitMsrp: spec.msrp,
    totalCostUsd: units * spec.msrp,
    coveredCameras,
    coveredStorageTb,
    driverDimension,
    excess,
  };
}

function compare(a: EvalCandidate, b: EvalCandidate): number {
  if (a.totalCostUsd !== b.totalCostUsd) return a.totalCostUsd - b.totalCostUsd;
  if (a.units !== b.units) return a.units - b.units;
  if (a.excess !== b.excess) return a.excess - b.excess;
  return a.sku.localeCompare(b.sku);
}

function strip({ excess: _excess, ...rest }: EvalCandidate): RecommendationCandidate {
  return rest;
}

export function recommend(
  input: RecommendationInput,
  specs: readonly ServerSpec[],
): RecommendationResult {
  if (specs.length === 0) {
    throw new Error("recommend(): specs list is empty");
  }
  if (input.totalCameras <= 0) {
    throw new Error("recommend(): totalCameras must be > 0");
  }
  if (input.totalStorageGb < 0) {
    throw new Error("recommend(): totalStorageGb must be >= 0");
  }

  // Defensive numeric-only filter; the calculator action also filters at the
  // query level, but the algorithm must never recommend an MKT/CFQ SKU.
  const numericSpecs = specs.filter((s) => s.priceType === "numeric");
  if (numericSpecs.length === 0) {
    throw new Error("recommend(): no numeric-priced SKUs in pool (all MKT/CFQ)");
  }

  const evaluated = numericSpecs.map((spec) => evaluate(spec, input));
  evaluated.sort(compare);

  const [winner, ...rest] = evaluated;

  const warnings: string[] = [];
  if (winner.units > 1) {
    warnings.push(
      `Workload exceeds a single ${winner.productGroup}; recommendation stacks ${winner.units} units of ${winner.sku}.`,
    );
  }
  const storageTb = input.totalStorageGb / GB_PER_TB;
  const maxSingleStorage = Math.max(...numericSpecs.map((s) => s.maxStorageTb));
  const maxSingleCameras = Math.max(...numericSpecs.map((s) => s.maxCameras));
  if (storageTb > maxSingleStorage || input.totalCameras > maxSingleCameras) {
    warnings.push(
      "Workload exceeds the largest single VideoX SKU on at least one dimension. Sales engineering should review before quoting.",
    );
  }

  return {
    winner: strip(winner),
    alternatives: rest.map(strip),
    warnings,
  };
}
