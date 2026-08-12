// Pure capacity-calculation helpers shared by the System Estimate PDF
// (src/lib/pdf/render.ts) and the Project Quote data layer
// (src/lib/project-quote/snapshot.ts). No server-only import, no react-pdf,
// no Supabase — importable from any layer without creating a circular
// dependency or inverting the render -> data direction.

// RAID 60 is built from 12-drive RAID 6 spans, so its parity cost scales with
// the number of spans — 2 drives per span, NOT a fixed 4. See ADR 0092.
const RAID60_SPAN_DRIVES = 12;

// Net usable TB after RAID parity overhead. No hot spares on any model.
//   RAID 1  -> half the drives are mirrors (usable = raw / 2 at any n)
//   RAID 5  -> 1 parity drive   (usable = raw x (n-1)/n)
//   RAID 6  -> 2 parity drives  (usable = raw x (n-2)/n)
//   RAID 60 -> 2 parity drives per 12-drive span
//              (V700: 24 drives = 2 spans = 4 parity;
//               V800: 36 drives = 3 spans = 6 parity)
//              With 12-drive spans this reduces to raw x 5/6 at any drive count.
//   JBOD    -> no parity at all (usable = raw)
// Anything else falls back to RAID 5. Returns raw when the drive count is
// unknown or too small to apply the parity math.
//
// RAID 1 and JBOD are the V100's two shipping configurations (ADR 0096 §1d).
// They are modelled here rather than hand-typed because the V100's published
// 16 / 20 / 24 TB figures were previously right for the wrong reason: its rows
// carry raid_level_display = 'NA', which falls through to the RAID-5 branch and
// returns raw x (2-1)/2 = raw/2 — the correct mirror figure ONLY because the
// V100 has exactly 2 drives. Adding these two levels moves no published number
// (verified by a live trace over all 21 product_specs rows); it makes the right
// answer arrive for the right reason, and makes the level meaningful the moment
// an admin sets it. 'NA' is deliberately left falling through so existing rows
// are untouched until they are corrected through the admin form.
export function usableCapacityTb(
  rawTb: number | null,
  hddCount: number | null,
  raidLevelDisplay: string | null,
): number | null {
  if (rawTb == null) return null;
  const n = hddCount ?? 0;
  const level = (raidLevelDisplay ?? "").trim();
  let parity: number;
  if (level === "1") {
    // A mirror costs half the spindles whatever n is. Expressed as parity so it
    // shares the formula below; an odd n (which the admin form refuses) still
    // reports raw/2 rather than something arbitrary.
    parity = n / 2;
  } else if (level === "JBOD") parity = 0;
  else if (level === "6") parity = 2;
  else if (level === "60") {
    // At least one span, so a drive count below a full span degrades to RAID 6
    // rather than reporting zero parity.
    parity = 2 * Math.max(1, Math.round(n / RAID60_SPAN_DRIVES));
  } else parity = 1; // RAID 5 and the documented fallback
  if (n <= parity) return rawTb;
  return (rawTb * (n - parity)) / n;
}

// ---------------------------------------------------------------------------
// Decimal → VMS-visible "available" capacity (ADR 0127, D4)
// ---------------------------------------------------------------------------
//
// The engine is decimal end-to-end (ADR 0092) and drives are sold decimal, but
// a VMS sees binary capacity on a formatted filesystem. Until now nothing
// charged that loss, so a quoted 720 TB delivered ~643 TB of VMS-visible space
// and partners closed the gap by hand.
//
// Milestone's exact figure, reversed from two of its own exported proposals and
// confirmed on both (audit §8):
//
//   available = RAID_net_decimal × 0.8931
//
// which decomposes as 0.909495 (decimal TB → binary TiB, 10^12 / 2^40) ×
// 0.9819 (formatting / filesystem reserve allowance, ~1.81%).
//
// Checks against the two proposals:
//   1 × 4 TB   → 4      × 0.8931 = 3.572  TB   (Milestone printed 3.57)
//   8 × 16 TB  → 96     × 0.8931 = 85.738 TB   (Milestone printed 85.73)
//
// This is PHYSICS, not buffer. It is deliberately kept separate from the Max
// disk utilization slider (ADR 0126) in both code and copy — one is what the
// hardware actually gives you, the other is how full you choose to run it.
export const AVAILABLE_CAPACITY_FACTOR = 0.8931;

/**
 * VMS-visible available capacity (TB) for a given decimal RAID-net figure.
 *
 * This is the number to set beside a Milestone proposal's "X TB of Y available"
 * line. `usableCapacityTb()` remains the decimal RAID-net figure the Price Book
 * publishes and the recommender sizes against — this is one step further down.
 */
export function availableCapacityTb(netUsableDecimalTb: number | null): number | null {
  if (netUsableDecimalTb == null) return null;
  return netUsableDecimalTb * AVAILABLE_CAPACITY_FACTOR;
}

// The product_specs slice needed to state delivered capacity.
export type CoveredCapacitySpec = {
  max_cameras: number | null;
  storage_raw_tb: number | null;
  hdd_count: number | null;
  raid_level_display: string | null;
};

/**
 * Delivered capacity for a recommendation of `units` boxes.
 *
 * Derived from the product_specs row, NEVER from the current_products inline
 * max_cameras / max_storage_tb columns. Those are populated for only 6 SKUs (the
 * original Step 3/4 seed) while the recommender's pool is 18 (ADR 0094), so
 * reading them rendered "0 cameras covered" and passed the storage requirement
 * off as delivered capacity on the other 12.
 *
 * Storage is net-usable — the same basis the recommendation was sized on and the
 * same figure `recommend()` reports (ADR 0068) — never the raw nameplate.
 *
 * `fallbackStorageTb` (the submission's required storage) applies only when there
 * is no spec row at all: legacy UUID-keyed submissions predating the SKU-PK
 * migration. Cameras have no meaningful fallback and report 0.
 */
export function coveredCapacity(
  units: number,
  spec: CoveredCapacitySpec | null,
  fallbackStorageTb: number,
): { coveredCameras: number; coveredStorageTb: number } {
  const usablePerUnitTb = spec
    ? usableCapacityTb(spec.storage_raw_tb, spec.hdd_count, spec.raid_level_display)
    : null;
  return {
    coveredCameras: spec?.max_cameras ? units * spec.max_cameras : 0,
    coveredStorageTb: usablePerUnitTb != null ? units * usablePerUnitTb : fallbackStorageTb,
  };
}

// Honest capacity-line note for the System utilization bar. Replaces the old
// hardcoded "20% headroom built in" string, which lied on over-capacity
// systems. At or under 100% it states the ACTUAL remaining headroom; above
// 100% it flags over-capacity rather than asserting headroom that does not
// exist. See ADR 0068.
export function utilizationNote(utilizationPct: number): string {
  if (utilizationPct > 100) return "OVER CAPACITY";
  const headroom = Math.max(0, Math.round(100 - utilizationPct));
  return `${headroom}% headroom`;
}
