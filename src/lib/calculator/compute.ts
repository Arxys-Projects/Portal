import {
  type Codec,
  type Complexity,
  type Resolution,
  STORAGE_OVERHEAD,
} from "./tables";

// Bitrate coefficient per codec (bits per pixel, ish). Re-anchored to
// Milestone's XProtect calculator: at the audited reference point — 4MP
// (2560×1440), 15fps, H.265, "Low detail, low motion" (multiplier 1.0), 100%
// motion — h265 lands per-camera bitrate at ~1966 Kbit/s, matching the live
// Milestone tool. H.264 and Smart keep their prior RATIOS to H.265 so the
// codec selector still models smart-compression damping the same way.
// See docs/decisions/0050-codec-bitrate-reanchor.md.
const CODEC_BITRATE: Record<Codec["value"], number> = {
  h265: 0.037,   // audited: lands 4MP/15fps/Low at ~1966 Kbit vs live Milestone tool
  h264: 0.0634,  // 0.037 × (0.12/0.07), preserves prior codec ratio
  smart: 0.0444, // 0.037 × (0.084/0.07), preserves prior codec ratio
};

/**
 * Estimated frame size in KB.
 *
 *   frame_kb = (pixels × bitrate_factor × complexity) / 8 / 1024
 *
 * Mirrors the `eFK` function from the legacy calculator.
 */
export function estimateFrameKb(
  resolution: Resolution,
  codec: Codec["value"],
  complexityMultiplier: number,
): number {
  const pixels = resolution.width * resolution.height;
  const bitrate = CODEC_BITRATE[codec] ?? CODEC_BITRATE.h264;
  return (pixels * bitrate * complexityMultiplier) / 8 / 1024;
}

/**
 * Motion/event bitrate weighting. This is the weighted-average bitrate model
 *
 *   avg = event_rate × (idle_fraction + (1 − idle_fraction) × P)
 *
 * with an idle floor of 20%: at 0% motion the camera still records full hours
 * but writes frames at 20% of the event rate; at 100% it writes at the full
 * event rate; linear in between. (Was a 30% floor — lowered to 20% so quiet
 * scenes size more aggressively against smart-codec idle bitrates.)
 *
 * Applied to all three supported codecs because they all benefit from motion
 * scaling in practice (even non-Smart H.264/H.265 encoders ramp bitrate with
 * motion in real deployments).
 *
 * NOTE: this is bitrate weighting only — it never reduces recorded HOURS. Hours
 * are reduced separately and linearly via `recordingPercent` (Operation Hours).
 */
export function applyMotionAdjustment(frameKb: number, motionPercent: number): number {
  const m = Math.max(0, Math.min(100, motionPercent)) / 100;
  return frameKb * (0.2 + 0.8 * m); // 20% idle floor (was 0.3 + 0.7*m)
}

/**
 * Bandwidth (Mbps) for a single camera group.
 *
 *   bandwidth_mbps = (frame_kb × 1024 × 8 × fps × cameras) / 1e6
 *
 * Mirrors `cBW`. Output is Mbps, not bytes/sec.
 */
export function computeBandwidthMbps(
  frameKb: number,
  fps: number,
  cameras: number,
): number {
  return (frameKb * 1024 * 8 * fps * cameras) / 1e6;
}

/**
 * Raw storage (GB) for a single camera group over `retentionDays`, before
 * the database/filesystem overhead factor is applied.
 *
 *   storage_gb_raw = (frame_kb × 1024 × fps × cameras × days × 24 × 3600 × rec_fraction) / 1e9
 *
 * `recordingPercent` is the percentage of time the cameras are actively
 * recording (100 = continuous, 50 = half day, etc).
 *
 * Mirrors `cST`.
 */
export function computeRawStorageGb(
  frameKb: number,
  fps: number,
  cameras: number,
  retentionDays: number,
  recordingPercent: number,
): number {
  return (
    (frameKb * 1024 * fps * cameras * retentionDays * 24 * 3600 * (recordingPercent / 100)) /
    1e9
  );
}

export type GroupComputed = {
  frameKb: number;
  bandwidthMbps: number;
  rawStorageGb: number;
  storageGb: number;     // after STORAGE_OVERHEAD
  bitrateMbps: number;   // per camera, useful in summary rows
};

export type GroupInput = {
  cameras: number;
  resolution: Resolution;
  codec: Codec;
  complexity: Complexity;
  fps: number;
  recordingPercent: number;  // 0–100
  motionPercent: number;     // 0–100
};

export function computeGroup(input: GroupInput, retentionDays: number): GroupComputed {
  const frameKb = applyMotionAdjustment(
    estimateFrameKb(input.resolution, input.codec.value, input.complexity.multiplier),
    input.motionPercent,
  );
  const bandwidthMbps = computeBandwidthMbps(frameKb, input.fps, input.cameras);
  const rawStorageGb = computeRawStorageGb(
    frameKb,
    input.fps,
    input.cameras,
    retentionDays,
    input.recordingPercent,
  );
  const storageGb = rawStorageGb * STORAGE_OVERHEAD;
  const bitrateMbps = (frameKb * 8 * input.fps) / 1024;
  return { frameKb, bandwidthMbps, rawStorageGb, storageGb, bitrateMbps };
}

// --- Display helpers ---------------------------------------------------

function withThousands(n: number): string {
  return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatNumber(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) return withThousands(n);
  return n.toFixed(decimals);
}

export function formatStorageGb(gb: number): string {
  if (!Number.isFinite(gb)) return "—";
  if (gb >= 1000) return `${formatNumber(gb / 1000)} TB`;
  return `${formatNumber(gb)} GB`;
}

export function formatBandwidthMbps(mbps: number): string {
  if (!Number.isFinite(mbps)) return "—";
  if (mbps >= 1000) return `${formatNumber(mbps / 1000)} Gbps`;
  return `${formatNumber(mbps)} Mbps`;
}
