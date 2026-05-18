import {
  type Codec,
  type Complexity,
  type Resolution,
  STORAGE_OVERHEAD,
} from "./tables";

// Bitrate coefficient per codec (bits per pixel, ish — empirically tuned).
const CODEC_BITRATE: Record<Codec["value"], number> = {
  h265: 0.07,
  h264: 0.12,
  smart: 0.084,
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
 * Smart-codec motion adjustment. At 0% motion, frame size scales to 30%;
 * at 100% it stays at 100%. Linear in between. Mirrors the inline expression
 * `fk *= .3 + .7*(mot/100)` in the legacy calculator.
 *
 * Applied to all three supported codecs because they all benefit from motion
 * scaling in practice (even non-Smart H.264/H.265 encoders ramp bitrate with
 * motion in real deployments).
 */
export function applyMotionAdjustment(frameKb: number, motionPercent: number): number {
  const m = Math.max(0, Math.min(100, motionPercent)) / 100;
  return frameKb * (0.3 + 0.7 * m);
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
  if (n >= 1000) return withThousands(n).replace(/\.\d+$/, (s) => s.slice(0, 2));
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
