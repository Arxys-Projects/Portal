import {
  GB_PER_TB,
  type RecommendationCandidate,
  type RecommendationInput,
  type RecommendationResult,
  type ServerSpec,
} from "./types";

// Storage-first SKU-level recommendation (ADR 0068, replacing the raw-storage +
// camera-count sizing of ADR 0032).
//
// Per-SKU evaluation, two floors — storage takes priority and may change both
// the model/SKU and the unit count:
//
//   Step 1 — storage floor (HARD, ×1.2), on NET-USABLE per unit:
//     units_for_storage = ceil(needed_usable_tb × STORAGE_FLOOR / usable_per_unit)
//
//   Step 2 — VSR camera floor (SOFT, ×1.1), on the per-unit VSR capacity:
//     units_for_vsr = ceil(total_vsr × VSR_FLOOR / max_cameras)
//
//   units      = max(1, units_for_storage, units_for_vsr)
//   total_cost = units × msrp
//
// "Cheapest config across the whole catalog" falls out of sorting every SKU's
// (model × N) by total cost — no compute-tier lock; a larger-storage SKU wins
// whenever it clears both floors more cheaply. 1.1 is the ONLY camera margin
// (no separate VSR safety multiplier — no double-counting); the 1.2 is a
// hardware-headroom margin distinct from the calculator's STORAGE_OVERHEAD
// (which is already baked into needed_usable_tb).
//
// MKT / CFQ SKUs are filtered out per Q4(a) in
// docs/phase-2/step-3-and-4-schema-and-algorithm.md. The caller is expected
// to pre-filter to `price_type='numeric'`, but the algorithm enforces it
// defensively too.
//
// Tie-break (after totalCost ASC):
//   1. units ASC — fewer boxes wins.
//   2. excess capacity in driver dimension ASC — tighter fit wins (see ADR 0032).
//   3. sku ASC — alphabetical for determinism.

// Storage hard floor: chosen net-usable capacity must be ≥ 1.2× the required
// net-usable storage. Camera soft floor: per-unit VSR load kept under ~91% of
// rated VSR capacity.
const STORAGE_FLOOR = 1.2;
const VSR_FLOOR = 1.1;

type EvalCandidate = RecommendationCandidate & { excess: number };

function evaluate(spec: ServerSpec, input: RecommendationInput): EvalCandidate {
  const neededUsableTb = input.totalStorageGb / GB_PER_TB;
  // Step 1 — storage sets the minimum config (net-usable, ×1.2 hard floor).
  const unitsForStorage = Math.max(
    1,
    Math.ceil((neededUsableTb * STORAGE_FLOOR) / spec.usableStorageTb),
  );
  // Step 2 — VSR camera check (×1.1 soft floor) on the per-unit VSR capacity.
  const unitsForVsr = Math.max(
    1,
    Math.ceil((input.totalVsr * VSR_FLOOR) / spec.maxCameras),
  );
  const units = Math.max(1, unitsForStorage, unitsForVsr);
  // Storage takes priority: cameras only "drive" when they strictly demand more
  // boxes than storage does.
  const driverDimension: "cameras" | "storage" =
    unitsForVsr > unitsForStorage ? "cameras" : "storage";
  const coveredCameras = units * spec.maxCameras;
  // Covered storage is NET-USABLE — the same basis every capacity bar divides
  // against — so "storage covered" never overstates what the array can hold.
  const coveredStorageTb = units * spec.usableStorageTb;
  const excess =
    driverDimension === "storage"
      ? coveredStorageTb - neededUsableTb
      : coveredCameras - input.totalVsr;
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
  if (input.totalVsr < 0) {
    throw new Error("recommend(): totalVsr must be >= 0");
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
  const neededUsableTb = input.totalStorageGb / GB_PER_TB;
  const maxSingleUsable = Math.max(...numericSpecs.map((s) => s.usableStorageTb));
  const maxSingleCameras = Math.max(...numericSpecs.map((s) => s.maxCameras));
  if (neededUsableTb > maxSingleUsable || input.totalVsr > maxSingleCameras) {
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
