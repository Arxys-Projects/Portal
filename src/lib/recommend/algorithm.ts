import {
  GB_PER_TB,
  type RecommendationCandidate,
  type RecommendationInput,
  type RecommendationResult,
  type ServerSpec,
} from "./types";

// Multi-unit packer per ADR 0003, bandwidth gate removed per ADR 0012.
//
// For each active SKU:
//   units_for_cameras = ceil(cameras / max_cameras)
//   units_for_storage = ceil(storage_tb / max_storage_tb)
//   units             = max(1, units_for_cameras, units_for_storage)
//   total_cost        = units * list_price_usd
// Winner is the (sku, units) pair with the lowest total_cost. Ties break on
// the smaller per-unit list_price_usd, then on alphabetical model_code so the
// ordering is deterministic.

function evaluate(spec: ServerSpec, input: RecommendationInput): RecommendationCandidate {
  const storageTb = input.totalStorageGb / GB_PER_TB;
  const unitsForCameras = Math.max(1, Math.ceil(input.totalCameras / spec.maxCameras));
  const unitsForStorage = Math.max(1, Math.ceil(storageTb / spec.maxStorageTb));
  const units = Math.max(1, unitsForCameras, unitsForStorage);
  const driverDimension: "cameras" | "storage" =
    unitsForStorage > unitsForCameras ? "storage" : "cameras";
  return {
    productId: spec.productId,
    modelCode: spec.modelCode,
    units,
    totalCostUsd: units * spec.listPriceUsd,
    coveredCameras: units * spec.maxCameras,
    coveredStorageTb: units * spec.maxStorageTb,
    driverDimension,
  };
}

function compareCandidates(
  a: RecommendationCandidate & { unitPrice: number },
  b: RecommendationCandidate & { unitPrice: number },
): number {
  if (a.totalCostUsd !== b.totalCostUsd) return a.totalCostUsd - b.totalCostUsd;
  if (a.unitPrice !== b.unitPrice) return a.unitPrice - b.unitPrice;
  return a.modelCode.localeCompare(b.modelCode);
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

  const evaluated = specs.map((spec) => ({
    ...evaluate(spec, input),
    unitPrice: spec.listPriceUsd,
  }));
  evaluated.sort(compareCandidates);

  const [winnerWithPrice, ...restWithPrice] = evaluated;
  const stripPrice = ({
    unitPrice: _unitPrice,
    ...rest
  }: (typeof evaluated)[number]): RecommendationCandidate => rest;
  const winner = stripPrice(winnerWithPrice);
  const alternatives = restWithPrice.map(stripPrice);

  const warnings: string[] = [];
  if (winner.units > 1) {
    warnings.push(
      `Workload exceeds a single ${winner.modelCode}; recommendation stacks ${winner.units} units.`,
    );
  }
  const storageTb = input.totalStorageGb / GB_PER_TB;
  const maxSingleStorage = Math.max(...specs.map((s) => s.maxStorageTb));
  const maxSingleCameras = Math.max(...specs.map((s) => s.maxCameras));
  if (storageTb > maxSingleStorage || input.totalCameras > maxSingleCameras) {
    warnings.push(
      "Workload exceeds the largest single VideoX unit on at least one dimension. Sales engineering should review before quoting.",
    );
  }

  return { winner, alternatives, warnings };
}
