// Source-of-truth lookup tables for the calculator. Ported verbatim from
// reference/Arxys-React-calculator.clean.html so quotes generated here match
// the historical PHP calculator quotes for identical inputs.

export type Resolution = { label: string; width: number; height: number };
export type Codec = { label: string; value: "h265" | "h264" | "smart"; note: string };
export type Complexity = { label: string; multiplier: number; tier: "low" | "med" | "high" };

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

export const CODECS: readonly Codec[] = [
  { label: "H.265 (HEVC)", value: "h265", note: "30–50% more efficient" },
  { label: "H.264 (AVC)", value: "h264", note: "Standard codec" },
  { label: "H.264-Smart", value: "smart", note: "Axis Zipstream / Avigilon HDSM" },
];

export const COMPLEXITIES: readonly Complexity[] = [
  { label: "Low (office)", multiplier: 0.5, tier: "low" },
  { label: "Medium (retail)", multiplier: 1.0, tier: "med" },
  { label: "High (outdoor)", multiplier: 1.5, tier: "high" },
];

export const VMS_OPTIONS: readonly string[] = [
  "Milestone",
  "Avigilon",
  "Genetec",
  "Hanwha",
  "NX Witness",
  "Other",
];

// Storage overhead factor (database, indexes, filesystem). Applied once to
// raw computed storage to produce the figure quoted to partners.
export const STORAGE_OVERHEAD = 1.2;
