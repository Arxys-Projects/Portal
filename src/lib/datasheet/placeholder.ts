import type { DatasheetContent, OrderableRow, VsrRow } from "./types";

// PLACEHOLDER DATA for the 3-page layout mockup. Not a seed, not a fixture the
// build depends on — it exists so the template can be looked at before the
// spec-table adapter is written, and it should be deleted once that adapter
// lands.
//
// Values are the real V800 figures, taken from the Phase 2 design handoff and
// from datasheets/datasheet-phase2-step6-entry-reference.md §A7 (which is
// itself transcribed from the shipping V800 factsheet). The two exceptions the
// handoff flags as not-yet-real are marked inline.

// ── Derivations the design specifies ─────────────────────────────────────

/** 8MP carries double the pixels per frame, so it costs ~45% of the streams. */
export const streamsAt8Mp = (baseline: number): number => Math.round(baseline * 0.55);

/**
 * Usable capacity by RAID level. The handoff calls the RAID level "a template
 * variable, not a constant" and names it the single most important gotcha —
 * V800 is RAID 60 at 83.3%, V400 is RAID 6 at 75%, and the level appears in
 * both the column header and the caption.
 */
const RAID_EFFICIENCY: Record<string, number> = {
  "RAID 6": 0.75,
  "RAID 60": 5 / 6,
};

/** Part numbers follow VX5-{MODEL}-{RAW_TB}; drive capacities are 16/20/24 TB. */
export function orderableRows(
  model: string,
  bays: number,
  raidLevel: string,
  capacitiesTb: number[] = [16, 20, 24],
): OrderableRow[] {
  const efficiency = RAID_EFFICIENCY[raidLevel] ?? 1;
  return capacitiesTb.map((cap) => {
    const raw = bays * cap;
    return {
      partNumber: `VX5-${model}-${raw}`,
      driveConfig: `${bays} × ${cap}TB enterprise HDD`,
      raw: `${raw} TB`,
      usable: `${Math.round(raw * efficiency)} TB`,
    };
  });
}

function vsrRows(baseline: number): VsrRow[] {
  return [
    {
      resolution: "4MP · 2560×1440 (16:9)",
      codec: "H.265-20",
      streams: baseline,
      comparison: "Baseline VSR",
    },
    {
      resolution: "8MP · 3840×2160",
      codec: "H.265-20",
      streams: streamsAt8Mp(baseline),
      comparison: "−45% — 2× the pixels per frame",
    },
  ];
}

// The four feature blocks are line-level boilerplate off the shipping
// factsheets, shared by every VideoX server sheet — not per-SKU copy.
const VIDEOX_ENTERPRISE_FEATURES = [
  {
    title: "Lower deployment costs — hardware accelerated H.265",
    body: "V5 micro-architecture acceleration delivers up to 2.3× H.265 stream processing per server, and 30–50% storage and bandwidth savings versus H.264 — fewer servers, higher camera density, longer retention, same budget.",
  },
  {
    title: "Flexible & scalable tier-1 enterprise storage",
    body: "Scale to petabytes of tier-1 capacity and tailor retention per project. Enterprise-class HDDs and SSDs throughout, for tier-1 availability and performance.",
  },
  {
    title: "High data availability",
    body: "RAID 6/60 redundancy tolerates up to 6 hard drive failures depending on model and configuration, with hardware XOR, CacheVault protection and patrol read repairs.",
  },
  {
    title: "Strengthen cybersecurity",
    body: "A built-in TPM 2.0 module supports hardware Root of Trust authentication and data encryption. All VideoX are fully NDAA compliant.",
  },
];

export const V800_PLACEHOLDER: DatasheetContent = {
  model: "V800",
  descriptor: "36 Bay · 4U Rack · V5 Video Server",
  runningMark: "VIDEOX V5",
  productClass: "Enterprise Server for Video Surveillance & Video Analytics",
  compliance: ["NDAA", "CE / UKCA", "FCC / UL / RCM"],

  headline: [
    { key: "Throughput", value: "4,000 Mbit/s" },
    { key: "Max Storage", value: "864 TB" },
    { key: "Drive Bays", value: "36" },
    { key: "Max Camera Streams", value: "325" },
  ],

  ladderHeading: "Where the V800 sits in the VideoX NVR line",
  ladderCaption: "Drive bays · max camera streams",
  // The NVR ladder is 7 cells. V250 is excluded (management server, not an
  // NVR) and V900 is excluded (end of life) — do not merge this with the
  // 5-cell management/ACM ladder.
  ladder: [
    { model: "V100", detail: "2 bay · 1U", capacity: "25", active: false },
    { model: "V200", detail: "4 bay · 1U", capacity: "100", active: false },
    { model: "V400", detail: "8 bay · 2U", capacity: "200", active: false },
    { model: "V500", detail: "12 bay · 2U", capacity: "275", active: false },
    { model: "V600", detail: "16 bay · 3U", capacity: "275", active: false },
    { model: "V700", detail: "24 bay · 4U", capacity: "325", active: false },
    { model: "V800", detail: "36 bay · 4U", capacity: "325", active: true },
  ],

  usageHeading: "Recommended usage",
  // Maps to the usage paragraph that today lives in families.ts `greatFor` —
  // moving to a spec-table column (see the accompanying migration).
  usage: "Designed for campus-wide deployments with centralized management, this solution delivers critical protection, high performance, and top-tier security. It supports high camera density with exceptional reliability, for robust, scalable surveillance across large environments.",

  attributes: [
    "Windows Server 2022 or 2025",
    "AMD EPYC 9005 Zen5 CPU",
    "32GB RAM Registered ECC",
    "Mirrored, hot-swap OS SSDs",
    "RAID 60 data protection",
    "Quad 10Gb Ethernet",
    "N+1 hot-swap power & cooling",
    "TCG 2.0 cybersecurity w/ TPM",
  ],

  productPhoto: { path: null, placeholder: "V800 front 3/4 — product photography" },

  warranty: {
    years: 5,
    title: "5-Year NBD Advanced Parts Warranty",
    body: "5 Years, Next Business Day, Advanced Parts Replacement warranty ensures uptime continuity. Secure remote management & advanced support delivers rapid response & uptime.",
    sealPath: "/price-book/5_year_warranty-circle-2.png",
  },

  featuresHeading: "VideoX enterprise features",
  features: VIDEOX_ENTERPRISE_FEATURES,

  vmsValidated: ["Milestone", "Genetec", "Avigilon", "Hanwha WAVE", "NX Witness", "Exacq"],

  ceilingLine: "4,000 Mbit/s · 864 TB raw · 720 TB usable",

  // NOTE: the handoff flags the V800 per-resolution counts as illustrative —
  // only the 325-stream / 4,000 Mbit/s ceiling is published. Real Price Book
  // figures replace these.
  vsrRows: vsrRows(325),

  vsrParameters: [
    { label: "Resolution", value: "4MP · 2560×1440" },
    { label: "Frame rate", value: "15 fps" },
    { label: "Codec", value: "H.265-20 (Good) · ~3.2 Mbit/s" },
    { label: "Recording", value: "On motion, VMD + metadata" },
    { label: "Motion activity", value: "75% average per day" },
    { label: "Retention", value: "30 days" },
  ],

  vsrCaption: "Max VSR is camera streams, not cameras — a multisensor device presents several streams. If a recording parameter changes, revise the calculation. Validated for Avigilon, Milestone, Hanwha/NXWitness and Genetec; other platforms vary.",

  raidLevel: "RAID 60",
  orderableRows: orderableRows("V800", 36, "RAID 60"),
  orderableCaption:
    "Three drive capacities per NVR — same chassis and performance, different retention. Usable capacity is RAID 60, excluding the mirrored OS SSD pair.",

  hardware: [
    { label: "CPU", value: "5th Gen Zen5 AMD EPYC™ 9135, 4.3GHz max all-core turbo, 16C / 32T, 64MB cache, 200W TDP" },
    { label: "Acceleration", value: "Chiplet microarchitecture · AMD Infinity Architecture & Guard · CXL 2.0 · native 512-bit data paths · H.265 math acceleration" },
    { label: "RAM", value: "32GB ECC Registered DDR5 (minimum)" },
    { label: "Operating system", value: "Microsoft Windows Server Standard 2022 or 2025 (LTSC)" },
    { label: "VMS / OS drive", value: "Mirrored 480GB Enterprise 3D TLC flash SSD, dedicated for OS/VMS, hot-swap" },
    { label: "Hard drives", value: "Up to 36× Enterprise class 7200 RPM 3.5\" HDD, 2.5M MTBF, 600k duty cycle, certified 24/7, tool-less hot-swap" },
    { label: "Storage capacity", value: "Up to 864TB raw capacity" },
    { label: "RAID", value: "Hardware RAID 6 double fault tolerance w/ HW XOR engine, CacheVault protection, patrol read repairs" },
    { label: "Network", value: "4× Enterprise 10Gb Eth RJ45 + 1Gb IPMI (2× 10Gb SFP+ or 2× 25Gb SFP28 upgrade available)" },
    { label: "Display", value: "VGA — Client View applications not supported on server" },
    { label: "Encryption", value: "TPM 2.0 (FIPS, CC-TCG certified) · Silicon Root of Trust · data-at-rest encryption with SEDs · AMD SEV/SME" },
    { label: "Management", value: "Out of Band (OOB) remote management: IPMI system management, KVM console redirection" },
  ],

  environmental: [
    { label: "Form factor", value: "Standard 19\" rackmount w/ rails, 4U height" },
    { label: "Power", value: "1200W 1+1 redundant PSU, PMBus 1.2, 80+ Platinum · 100–127VAC 10A 50-60Hz (800W) · 200–240VAC 8A 50-60Hz (1200W)" },
    { label: "Max draw", value: "1200W, up to 80% efficient (Platinum), hot-plug redundant" },
    { label: "Cooling", value: "6× 80×38mm PWM low-power-consumption hot-swap fans" },
    { label: "Dimensions", value: "430mm (w) × 680mm (d) × 175mm (h)" },
    { label: "Weight", value: "Ship weight w/ 36 HDDs = 72kg / 167lbs" },
    { label: "Operating temp", value: "10–30°C / 41–86°F" },
    { label: "Storage temp", value: "−40–65°C / −40–149°F" },
    { label: "Humidity", value: "10–90% relative humidity, non-condensing" },
    { label: "Safety", value: "CE (class A), UKCA, FCC, RCM, UL" },
    { label: "Trade", value: "NDAA compliant, no disclosures" },
  ],

  rearIo: { path: null, placeholder: "V800 rear I/O panel — product photography" },

  generalInfo: "Systems ship with Microsoft Windows pre-installed without media and not set up; the installer is responsible for setup, VMS installation, and configuration of users, cameras and databases. VMS installers are included but not installed. Milestone and Avigilon best practice is SQL Standard above 300 cameras — optional, not included. Client View application on server is not supported; a dedicated Client View workstation is required.",

  footerAddress: "Arxys · 1810 Gillespie Way, Suite 108, El Cajon, CA 92020 · 619.258.7800 · arxys.com",
  footerNote: "VMS licensing and support is not included and is provided by the security partner or customer.",
  revisionLine: "For more information visit arxys.com/videox-appliances · rev 10/01/2025",
};
