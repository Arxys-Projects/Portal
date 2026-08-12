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
  // Per-unit camera capacity, expressed in VSR-reference terms (4MP @ 15fps
  // reference stream). The sizing engine treats this as the per-unit VSR cap.
  maxCameras: number;
  // Raw nameplate storage (TB). Kept for reference/display; NOT used for
  // sizing — sizing uses usableStorageTb. See ADR 0068.
  maxStorageTb: number;
  // RAID net-usable storage per unit (TB). This is what storage sizing divides
  // against, never the raw nameplate. Derived via usableCapacityTb().
  usableStorageTb: number;
  msrp: number;
  priceType: "numeric" | "market" | "call_for_quote";
};

export type RecommendationInput = {
  // Raw camera-stream count — used for warnings and the covered-cameras display
  // line, NOT for the capacity gate (that is totalVsr).
  totalCameras: number;
  // Required net-usable storage in decimal GB — recorded data with the Max disk
  // utilization buffer and the decimal→binary charge already applied
  // (ADR 0126/0127). The recommender adds no further storage multiplier.
  totalStorageGb: number;
  // Resolution-normalized camera load: Σ streamCount × (megapixels / 4). A 4MP
  // stream ≈ 1.0 VSR. This — not the raw camera count — gates the camera check.
  totalVsr: number;
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
