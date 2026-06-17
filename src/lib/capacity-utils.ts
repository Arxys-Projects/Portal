// Pure capacity-calculation helpers shared by the System Estimate PDF
// (src/lib/pdf/render.ts) and the Project Quote data layer
// (src/lib/project-quote/snapshot.ts). No server-only import, no react-pdf,
// no Supabase — importable from any layer without creating a circular
// dependency or inverting the render -> data direction.

// Net usable TB after RAID parity overhead.
//   RAID 5  -> 1 parity drive  (usable = raw x (n-1)/n)
//   RAID 6  -> 2 parity drives (usable = raw x (n-2)/n)
//   RAID 60 -> 4 parity drives (two RAID 6 spans, usable = raw x (n-4)/n)
// Anything else falls back to RAID 5. Returns raw when the drive count is
// unknown or too small to apply the parity math.
export function usableCapacityTb(
  rawTb: number | null,
  hddCount: number | null,
  raidLevelDisplay: string | null,
): number | null {
  if (rawTb == null) return null;
  const n = hddCount ?? 0;
  const level = (raidLevelDisplay ?? "").trim();
  let parity: number;
  if (level === "6") parity = 2;
  else if (level === "60") parity = 4;
  else parity = 1; // RAID 5 and the documented fallback
  if (n <= parity) return rawTb;
  return (rawTb * (n - parity)) / n;
}
