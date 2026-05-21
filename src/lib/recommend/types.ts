// Recommendation algorithm input/output shapes.
// Pure data — no React, no Supabase, no I/O.
//
// Phase 2 Step 3+4: candidates are SKUs (not families). `sku` is the primary
// identifier and replaces the old UUID `productId` + family `modelCode`.
// `productGroup` carries the V-family ("V200", "V800", ...) so consumers
// that want family-friendly text (Pipedrive deal strings, alternative
// rollups) can derive it without a second query.

export type ServerSpec = {
  sku: string;
  productGroup: string;
  productName: string;
  maxCameras: number;
  maxStorageTb: number;
  msrp: number;
  priceType: "numeric" | "market" | "call_for_quote";
};

export type RecommendationInput = {
  totalCameras: number;
  totalStorageGb: number;
};

export type RecommendationCandidate = {
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

export type RecommendationResult = {
  winner: RecommendationCandidate;
  alternatives: RecommendationCandidate[];
  warnings: string[];
};

// 1 TB = 1000 GB (vendor convention, matches drive nameplate capacities).
export const GB_PER_TB = 1000;
