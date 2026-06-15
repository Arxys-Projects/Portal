# 0058 — Option C: size all sensors at the model's highest-MP sensor; round pixel-bucket up on overlap

- **Status**: Accepted
- **Date**: 2026-06-15

## Context

A multi-sensor camera model may carry sensors at different resolutions, yet the calculator resolves a single RESOLUTIONS bucket per camera group. A sizing rule is needed to collapse a model's sensors to one bucket. Separately, the RESOLUTIONS table holds several MP tiers that map to two distinct buckets at different native pixel counts (e.g. two "4MP" entries at 2560x1440 and 2688x1520, two "5MP" entries, two "8MP" entries), so a tiebreak is needed when a model's native pixels fall between buckets. The store records native `max_width` x `max_height` rather than a marketing megapixel value, so the mapping is by pixel count.

## Options considered

- **Option A — mean sensor resolution.** Averages away the worst case; can under-size storage and bandwidth for the high-res sensor. Rejected as not conservative.
- **Option B — per-sensor rows and per-sensor group entries.** Most precise, but forces per-sensor granularity through the whole UI and persistence path for marginal phase-1 benefit. Held in reserve via the nullable `sensor_detail` jsonb column.
- **Option C — size every sensor at the model's highest-MP sensor (chosen).** Conservative; sizes the deployment at the upper bound; one bucket per model with no UI change.
- **Bucket tiebreak — round down vs round up.** Round up is the conservative choice and the only one consistent with not under-sizing.

## Decision

Option C: every sensor on a model is sized at that model's highest-MP sensor, regardless of individual sensor tier. Resolution maps by native pixel count (`max_width` x `max_height`), not marketing MP. When a pixel count falls between two buckets it rounds UP to the next-higher-pixel bucket; an exact match takes that bucket. A pixel count exceeding the largest bucket (29MP / 6576x4384) maps to no bucket and is flagged for manual review rather than silently clamped. Option B's per-sensor detail is stored in `sensor_detail` but unused by phase-1 math.

The mapping is implemented once in `src/lib/calculator/camera-resolution.ts` (`mapPixelsToBucket`), which reads RESOLUTIONS from `tables.ts` read-only. Both `scripts/validate-camera-specs.ts` (which gates every seed row) and the Step-3 loader import that single function, so the seed-time check and the runtime lookup can never diverge.

## Consequences

**Positive:** conservative sizing that never under-provisions; one bucket per model keeps the UI and persistence unchanged; a single shared mapping function means validation and runtime agree by construction; out-of-range cameras are surfaced, not hidden.

**Negative:** Option C over-sizes mixed-resolution models (intended); the round-up rule can push a model one bucket higher than a marketing-MP reading would suggest; `sensor_detail` is collected but not yet used, a small acquisition cost paid forward.

**When to revisit:** if a customer needs per-sensor accuracy for mixed-resolution multisensor models, promoting `sensor_detail` (Option B) from stored-but-unused to active in the math.
