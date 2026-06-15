// Single source of truth for mapping a camera's native pixel dimensions to a
// RESOLUTIONS bucket. Both scripts/validate-camera-specs.ts (seed gating) and
// the Phase 10 Step-3 loader resolve buckets through mapPixelsToBucket below,
// so the round-up rule has exactly one definition. Reads RESOLUTIONS from
// tables.ts; defines no new resolution data. See ADR 0058.

import { RESOLUTIONS, type Resolution } from "./tables";

// RESOLUTIONS ordered ascending by native pixel count (width x height). Built
// once at module load.
const BUCKETS_BY_PIXELS: readonly Resolution[] = [...RESOLUTIONS].sort(
  (a, b) => a.width * a.height - b.width * b.height,
);

// The highest-pixel bucket (29MP / 6576x4384). A camera whose native pixel
// count exceeds this maps to no bucket.
export const LARGEST_BUCKET: Resolution =
  BUCKETS_BY_PIXELS[BUCKETS_BY_PIXELS.length - 1];

export type BucketMatch = {
  bucket: Resolution;
  // true when the camera's pixel count equals the bucket's exactly; false when
  // it was rounded up to the next-higher-pixel bucket.
  exact: boolean;
};

/**
 * Map a camera's native pixel dimensions to a RESOLUTIONS bucket under the
 * Option C round-up rule (ADR 0058): pick the smallest bucket whose native
 * pixel count is greater than or equal to the camera's pixel count. A pixel
 * count between two buckets rounds UP to the higher-pixel bucket; an exact
 * match returns that bucket. Returns null when the pixel count exceeds the
 * largest bucket, so the caller flags it for manual review rather than
 * silently clamping.
 */
export function mapPixelsToBucket(
  width: number,
  height: number,
): BucketMatch | null {
  const pixels = width * height;
  for (const bucket of BUCKETS_BY_PIXELS) {
    const bucketPixels = bucket.width * bucket.height;
    if (bucketPixels >= pixels) {
      return { bucket, exact: bucketPixels === pixels };
    }
  }
  return null;
}
