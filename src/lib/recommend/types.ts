// Recommendation algorithm input/output shapes.
// Pure data — no React, no Supabase, no I/O.

export type ServerSpec = {
  productId: string;
  modelCode: string;
  maxCameras: number;
  maxStorageTb: number;
  listPriceUsd: number;
};

export type RecommendationInput = {
  totalCameras: number;
  totalStorageGb: number;
};

export type RecommendationCandidate = {
  productId: string;
  modelCode: string;
  units: number;
  totalCostUsd: number;
  coveredCameras: number;
  coveredStorageTb: number;
  driverDimension: "cameras" | "storage";
};

export type RecommendationResult = {
  winner: RecommendationCandidate;
  alternatives: RecommendationCandidate[];
  warnings: string[];
};

// 1 TB = 1000 GB (vendor convention, matches drive nameplate capacities).
export const GB_PER_TB = 1000;
