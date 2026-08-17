// Source-of-truth lookup tables for the calculator. Ported verbatim from
// reference/Arxys-React-calculator.clean.html so quotes generated here match
// the historical PHP calculator quotes for identical inputs.

export type Resolution = { label: string; width: number; height: number };
export type CodecValue = "h265" | "h265smart" | "h264" | "smart";
export type Codec = {
  label: string;
  value: CodecValue;
  note: string;
  // Retired codecs are still resolvable by the engine and still render on
  // already-banked submissions, but the picker hides them from new work.
  // See ADR 0124 (D1).
  retired?: true;
};
export type Complexity = {
  label: string;
  multiplier: number;
  tier: "low" | "med" | "high";
  example: string;
};

export const RESOLUTIONS: readonly Resolution[] = [
  { label: "QVGA (320×240)", width: 320, height: 240 },
  { label: "CIF PAL (352×288)", width: 352, height: 288 },
  { label: "CIF NTSC (352×240)", width: 352, height: 240 },
  { label: "2CIF (704×288)", width: 704, height: 288 },
  { label: "4CIF PAL (704×576)", width: 704, height: 576 },
  { label: "VGA (640×480)", width: 640, height: 480 },
  { label: "SVGA (800×600)", width: 800, height: 600 },
  { label: "960H (960×576)", width: 960, height: 576 },
  { label: "720p HD (1280×720)", width: 1280, height: 720 },
  { label: "960p (1280×960)", width: 1280, height: 960 },
  { label: "1.3MP (1280×1024)", width: 1280, height: 1024 },
  { label: "1080p Full HD (1920×1080)", width: 1920, height: 1080 },
  { label: "2MP (1600×1200)", width: 1600, height: 1200 },
  { label: "3MP (2048×1536)", width: 2048, height: 1536 },
  // The bitrate anchor's reference resolution (ADR 0123, D5). Milestone
  // Solution Designer moved its own "4MP" bucket to 2592×1520 (3.94 Mpx) in
  // 2026, but the published Arxys VSR stream ratings are defined at 2560×1440
  // — adopting MSD's bucket would desync the camera floor's rating basis from
  // the storage math. Documented, deliberately not adopted. See audit §8.
  { label: "4MP (2560×1440)", width: 2560, height: 1440 },
  { label: "4MP (2688×1520)", width: 2688, height: 1520 },
  { label: "5MP (2592×1944)", width: 2592, height: 1944 },
  { label: "5MP (3072×1728)", width: 3072, height: 1728 },
  { label: "6MP (3072×2048)", width: 3072, height: 2048 },
  { label: "4K/8MP (3840×2160)", width: 3840, height: 2160 },
  { label: "8MP (3296×2472)", width: 3296, height: 2472 },
  { label: "10MP (3648×2752)", width: 3648, height: 2752 },
  { label: "12MP (4000×3000)", width: 4000, height: 3000 },
  { label: "16MP (4864×3248)", width: 4864, height: 3248 },
  { label: "20MP (5120×3840)", width: 5120, height: 3840 },
  { label: "29MP (6576×4384)", width: 6576, height: 4384 },
];

// Codec list. `CODECS` is the persistence + resolution index space: a stored
// `codecIdx` indexes THIS array, and rehydration resolves by the banked `value`
// first (see rehydrate.ts resolveCodecIdx), so the order below is not load
// bearing for already-banked rows. The picker renders only the non-retired
// entries — plus the group's own codec when that codec is retired, so a revived
// old quote shows what it was actually quoted on instead of silently switching.
//
// ADR 0124 (D1): `h265smart` is a NEW key, not a redefinition of `smart`.
// `smart` was H.264-Smart (0.70 × H.264) and sat 20% ABOVE plain H.265, so
// picking it added storage. It is persisted per group in groups_payload, and
// redefining it in place would make every already-banked row read as
// H.265+Smart when it was quoted as H.264-Smart. It is retired, not reused.
export const CODECS: readonly Codec[] = [
  { label: "H.265 (HEVC)", value: "h265", note: "30–50% more efficient than H.264" },
  {
    label: "H.265 + Smart Codec",
    value: "h265smart",
    note: "H.265 with Zipstream / WiseStream / H.265+ — 20% below plain H.265",
  },
  { label: "H.264 (AVC)", value: "h264", note: "Standard codec" },
  {
    label: "H.264-Smart (retired)",
    value: "smart",
    note: "Retired — pick H.265 + Smart Codec. Kept so older quotes still read correctly.",
    retired: true,
  },
];

// The codecs a user may choose for new work.
export const SELECTABLE_CODECS: readonly Codec[] = CODECS.filter((c) => !c.retired);

export function codecByValue(value: string | null | undefined): Codec | undefined {
  return CODECS.find((c) => c.value === value);
}

// Display label for a banked codec value, including retired ones. Use this
// anywhere a stored submission renders its codec.
export function codecLabel(value: string | null | undefined): string {
  return codecByValue(value)?.label ?? (value ?? "—");
}

// Six descriptive scene levels modeled on Avigilon's example-scene UX, with
// multipliers following Milestone's (steeper, conservative) encoder-bitrate
// curve rather than abstract Low/Medium/High adjectives — users guess wrong on
// adjectives, so concrete example scenes anchor the choice. The codec selector
// (`h265smart`) models the smart-compression damping that flattens the curve on
// real cameras; we deliberately do NOT blend the two vendor curves, and there is
// deliberately no second damping control — see ADR 0125.
// See docs/decisions/0049-milestone-complexity-curve.md.
//
// Unchanged in Phase A. The multipliers are Milestone's own audited curve and
// were re-confirmed against the live tool on 2026-08-12 (audit §8); only the
// UNITS the gate test measures them in changed (ADR 0123).
export const COMPLEXITIES: readonly Complexity[] = [
  { label: "Low detail, low motion",     multiplier: 1.0,   tier: "low",  example: "Reception, stairway, hallway, garages" },
  { label: "Low detail, high motion",    multiplier: 1.5,   tier: "low",  example: "Lobby, main entry" },
  { label: "Medium detail, low motion",  multiplier: 2.25,  tier: "med",  example: "Construction site, parking lots, hospital, museum" },
  { label: "Medium detail, high motion", multiplier: 3.375, tier: "med",  example: "Malls, clothing stores, restaurants, train stations, warehouse" },
  { label: "High detail, low motion",    multiplier: 5.0,   tier: "high", example: "Airport terminals, convenience stores" },
  { label: "High detail, high motion",   multiplier: 7.0,   tier: "high", example: "Concert hall, amusement park, stadium seating" },
];

export const VMS_OPTIONS: readonly string[] = [
  "Milestone",
  "Avigilon",
  "Genetec",
  "Hanwha",
  "NX Witness",
  "ExacqVision",
  "Other",
];

// ---------------------------------------------------------------------------
// Max disk utilization — THE ONE BUFFER (ADR 0126, D3)
// ---------------------------------------------------------------------------
//
// Replaces both ×1.2 constants that used to stack invisibly: the calculator's
// STORAGE_OVERHEAD ("database, indexes, filesystem" — not documentable at 20%
// against any VMS) and the recommender's STORAGE_FLOOR (hardware headroom).
// Together they were ×1.44, in two files, neither stated to the user.
//
// Semantics are Milestone's: a CAP on how full the array is designed to run,
// not an additive margin.
//
//   required_available_capacity = required_recorded_data / (utilization / 100)
//
// So 90% → ÷0.90 = ×1.111. It is NOT ×1.10.
//
// Labeled "Max disk utilization" exactly as Milestone labels it, so the number
// is directly comparable against a Milestone or Genetec proposal set beside it.
//
// The default sits at the CEILING of the range on purpose — the least-margin end.
// Every adjustment a user can make adds margin, never removes it, so the slider
// is one-directional by construction and a partner cannot make a quote more
// aggressive than the default. That property is why MAX and DEFAULT are the same
// number and must stay so; raising MAX above DEFAULT would reopen exactly the
// hole it closes.
//
// 88%, NOT the 90% both reference tools default to (ADR 0131). Milestone defaults
// Max Disk Utilization to 90% on auto-select; Genetec Security Center applies
// 10%, partner-adjustable 10–30% (audit §C5 and §8). The two extra points are
// where the reversed audio/metadata term went: ÷0.88 vs ÷0.90 is ×1.0227, a
// +2.27% storage-only cushion covering general estimate uncertainty. It is
// deliberately NOT a second multiplier — ADR 0126 said the default moves rather
// than a second constant reappearing, and this is that.
//
// The step is 4 so the grid (60·64·68·72·76·80·84·88) lands exactly on the
// default. With the old step of 5 an 88 ceiling would be unreachable by the
// slider, since a range input clamps to the largest step-aligned value at or
// below max — it would have stopped at 85.
export const UTILIZATION_MIN_PCT = 60;
export const UTILIZATION_MAX_PCT = 88;
export const UTILIZATION_DEFAULT_PCT = 88;
export const UTILIZATION_STEP_PCT = 4;

export function clampUtilizationPct(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return UTILIZATION_DEFAULT_PCT;
  return Math.max(UTILIZATION_MIN_PCT, Math.min(UTILIZATION_MAX_PCT, Math.round(n)));
}
