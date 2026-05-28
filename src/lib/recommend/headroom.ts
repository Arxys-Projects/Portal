import type { RecommendationCandidate } from "./types";

// Returns the cheapest alternative whose coveredCameras AND coveredStorageTb
// both strictly exceed the winner's, preferring fewer units on cost ties.
// Returns null if no such alternative exists.
export function pickHeadroomOption(
  winner: RecommendationCandidate,
  alternatives: RecommendationCandidate[],
): RecommendationCandidate | null {
  const candidates = alternatives.filter(
    (a) =>
      a.coveredCameras > winner.coveredCameras &&
      a.coveredStorageTb > winner.coveredStorageTb,
  );
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) =>
    a.totalCostUsd !== b.totalCostUsd
      ? a.totalCostUsd - b.totalCostUsd
      : a.units - b.units,
  )[0];
}
