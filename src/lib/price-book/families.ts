export type SkuColumn =
  | "sku"
  | "product"
  | "netStorage"
  | "ssdStorage"
  | "bandwidth"
  | "monitors"
  | "msrp";

export const COLUMN_HEADERS: Record<SkuColumn, string> = {
  sku: "SKU",
  product: "Product",
  netStorage: "Net Usable Storage",
  ssdStorage: "SSD Storage",
  bandwidth: "Max Camera Bandwidth",
  monitors: "Max Monitors",
  msrp: "MSRP",
};

export const RIGHT_ALIGNED_COLUMNS: ReadonlySet<SkuColumn> = new Set([
  "netStorage",
  "ssdStorage",
  "bandwidth",
  "monitors",
  "msrp",
]);

export type FamilyKpi = {
  label: string;
  value: string;
  unit: string;
  vsrTooltip?: boolean;
};

export type FamilyTierSection = {
  title: string;
  productGroups: string[];
  columns: SkuColumn[];
  caption?: string;
};

export type DatasheetButton = {
  label: string;
  url: string;
  /**
   * True for a PDF hosted on arxys.com, false for the portal's own live route.
   * The two want different link behaviour — an outbound PDF opens in a tab, a
   * same-origin `Content-Disposition: attachment` response downloads in place
   * and would otherwise flash a blank tab open and shut.
   */
  external: boolean;
};

export type Family = {
  slug: string;
  displayName: string;
  eyebrow: string;
  cardEyebrow: string;
  shortName: string;
  tagline: string;
  greatFor: string;
  keyFeatures: string[];
  technicalSpecs: string[];
  kpis: FamilyKpi[];
  productGroups: string[];
  skuTableColumns: SkuColumn[];
  tierSections: FamilyTierSection[];
  upgradeSkus: string[];
  heroImage: string | null;
  /**
   * Model keys the LIVE datasheet route serves for this family, in button order.
   * `/api/datasheet/{model}` renders these from today's spec rows (ADR 0110), so
   * they are preferred over any static PDF and are what most families carry.
   *
   * A key here is a datasheet catalogue key, NOT a SKU and not necessarily this
   * family's slug: one sheet covers every capacity of a model, the V250 sheet
   * covers V250 and V255 under the single key "V250", and the SW family is two
   * separate sheets ("SW10", "SW20") because two workstations were never one
   * sheet. Every key must resolve in `datasheetCatalogue()` with a non-null
   * template — an unrenderable key answers 409, which is worse than the static
   * PDF it replaced. See ADR 0116.
   *
   * Empty when no live sheet exists. Today that is the ACM line only.
   */
  datasheetModels: string[];
  /**
   * The arxys.com PDF, kept ONLY where no live sheet can be generated. A family
   * with a live sheet sets this null: two link targets for one document is how
   * the stale one gets clicked.
   */
  datasheetUrl: string | null;
  category: "nvr-mgmt-acm" | "nvr-analytics" | "high-density" | "workstations";
  sortOrder: number;
  skuExtraData?: Record<string, Partial<Record<SkuColumn, string>>>;
};

/**
 * The Documentation buttons for one family — live route where a sheet exists,
 * the static PDF where one does not, and an empty list where neither does.
 *
 * Lives here rather than in the page because it is the rule about which document
 * is authoritative, not a rendering detail.
 */
export function datasheetButtonsFor(family: Family): DatasheetButton[] {
  if (family.datasheetModels.length > 0) {
    // One button needs no disambiguation; two do, and "Download Datasheet"
    // twice in a row tells a reader nothing about which is which.
    const single = family.datasheetModels.length === 1;
    return family.datasheetModels.map((model) => ({
      label: single ? "Download Datasheet" : `${model} Datasheet`,
      url: `/api/datasheet/${encodeURIComponent(model)}`,
      external: false,
    }));
  }
  if (family.datasheetUrl) {
    return [{ label: "Download Datasheet", url: family.datasheetUrl, external: true }];
  }
  return [];
}

export const FAMILY_CATEGORIES: Record<
  Family["category"],
  { label: string; warranty: string }
> = {
  "nvr-mgmt-acm": {
    label: "NVR, Management & Access Control",
    warranty: "5-year warranty",
  },
  "nvr-analytics": {
    label: "NVR Servers & Analytics",
    warranty: "5-year warranty",
  },
  "high-density": {
    label: "High-Density Video & Analytics",
    warranty: "5-year warranty",
  },
  workstations: {
    label: "Security Workstations — for video surveillance client viewing",
    warranty: "3-year warranty",
  },
};

export const FAMILIES: Family[] = [
  // ── V100 — 1U 2Bay Value Server ─────────────────────────────────────────
  {
    slug: "v100",
    displayName: "V100 — 1U 2Bay Value Server",
    eyebrow: "VideoX V5 · 1U 2-Bay Value NVR Server",
    cardEyebrow: "V100 · 1U Value",
    shortName: "V100",
    tagline:
      "Ideal for smaller sites or satellite locations with lower camera counts.",
    greatFor:
      "Ideal for smaller sites or satellite locations with lower camera counts, this all-in-one recorder and management server delivers great value and innovation. Perfect for access control management or compact deployments, it delivers streamlined performance, simplified setup, and reliable operation in a single, space-saving appliance.",
    keyFeatures: [
      "Windows Server 2022/2025 IoT Workgroup",
      "2x Enterprise HDD's (RAID 1 or JBOD)",
      "500 Mbps max possible throughput",
      "1U Rack mount w/ rails",
      "Max VSR = 25 streams h.265 or h.264",
    ],
    technicalSpecs: [
      "AMD EPYC 4005 4.0GHz 6/12 Core CPU",
      "16GB DDR5 DRAM",
      "1x Enterprise OS SSD",
      "2x 1Gb Ethernet Ports",
      "1x Dedicated Remote Management",
      "1x 80Plus Gold Power Supply",
    ],
    kpis: [
      { label: "Max VSR", value: "25", unit: "streams", vsrTooltip: true },
      { label: "Throughput", value: "500", unit: "Mbps" },
      { label: "Warranty Support", value: "5 Years", unit: "Next Business Day Parts" },
    ],
    productGroups: ["V100"],
    skuTableColumns: ["sku", "product", "netStorage", "msrp"],
    tierSections: [
      {
        title: "V150 ACM — Value Management Server",
        productGroups: ["V150"],
        columns: ["sku", "product", "ssdStorage", "msrp"],
        caption:
          "V150 ACM is an access control and value management server. SSD storage shown.",
      },
    ],
    upgradeSkus: ["VX5-GPU-A1000"],
    heroImage: "/price-book/v100-hero.png",
    // The V150 ACM in the tier section below has no live sheet and never had a
    // button of its own, so nothing here covers it (ADR 0116).
    datasheetModels: ["V100"],
    datasheetUrl: null,
    category: "nvr-mgmt-acm",
    sortOrder: 1,
    skuExtraData: {
      // The V100 is a 2-bay unit sold RAID 1 or JBOD, so both figures are
      // published — a single number misstates one of the two configurations.
      // These stay as overrides (not computed) because usableCapacityTb() takes
      // one RAID level and cannot express a choice. See ADR 0092.
      "VX5-V100-32": { netStorage: "16 TB RAID 1 / 32 TB JBOD" },
      "VX5-V100-40": { netStorage: "20 TB RAID 1 / 40 TB JBOD" },
      "VX5-V100-48": { netStorage: "24 TB RAID 1 / 48 TB JBOD" },
      "VX5-V150-ACM": { ssdStorage: "2x 480GB" },
    },
  },

  // ── V250 — Management / Directory Server ────────────────────────────────
  {
    slug: "v250",
    displayName: "V250 — Management / Directory Server",
    eyebrow: "VideoX V5 · 1U 4-Bay Management Server",
    cardEyebrow: "V250 · Management",
    shortName: "V250",
    tagline:
      "Management / Directory servers for larger deployments with greater management and uptime considerations.",
    greatFor:
      "Management/Directory servers for larger deployments with greater management and uptime considerations. Excellent balance of performance and value to right size your projects.",
    keyFeatures: [
      "Windows Server 2022/2025 IoT Workgroup",
      "Enterprise SSD's — RAID Mirrored",
      "1,000 Mbps max possible throughput",
      "1U Rack mount w/ rails",
      "2x Mirrored Enterprise DB SSDs — Hot Swap",
    ],
    technicalSpecs: [
      "AMD EPYC 4005 4.0GHz 8/16 or 12/24 Core CPU",
      "16–32GB DDR5 DRAM",
      "2x Mirrored Enterprise OS SSD — Hot Swap",
      "2x 10Gb & 2x 1Gb Ethernet Ports",
      "1x Dedicated Remote Management",
      "2x Hot-swap, Redundant Power Supply",
    ],
    kpis: [
      { label: "Throughput", value: "1,000", unit: "Mbps" },
      { label: "DB SSDs", value: "2x", unit: "Hot Swap" },
      { label: "Warranty Support", value: "5 Years", unit: "Next Business Day Parts" },
    ],
    productGroups: ["V250", "V255"],
    skuTableColumns: ["sku", "product", "ssdStorage", "msrp"],
    tierSections: [],
    upgradeSkus: [],
    heroImage: "/price-book/1u-chassis-hero.png",
    // One sheet covers both SKUs and is addressed by "V250"; "V255" is an alias
    // on the same catalogue entry, so a second button would download a duplicate.
    datasheetModels: ["V250"],
    datasheetUrl: null,
    category: "nvr-mgmt-acm",
    sortOrder: 2,
    skuExtraData: {
      "VX5-V250-MGM": { ssdStorage: "2x DB & 2x OS" },
      "VX5-V255-MGM": { ssdStorage: "2x DB & 2x OS" },
    },
  },

  // ── V260 — ACM Server ────────────────────────────────────────────────────
  {
    slug: "v260",
    displayName: "V260 — ACM Access Control Server",
    eyebrow: "VideoX V5 · 1U ACM Server",
    cardEyebrow: "V260 · 1U ACM",
    shortName: "V260",
    tagline:
      "Built for multi-tenant buildings, campus facilities, requiring higher reliability & uptime assurance.",
    greatFor:
      "Built for multi-tenant buildings, campus facilities, requiring higher reliability & uptime assurance. Hardware RAID with cache protection, hot-swap SSDs, and redundant power supplies eliminate single points of failure for critical access control operations. Ideal for healthcare campuses, corporate headquarters, or regional facilities where door authorization downtime impacts hundreds of employees.",
    keyFeatures: [
      "Windows Server 2022/2025 IoT Workgroup",
      "Up to 500 door support",
      "Access Control Optimized",
      "1U Rack mount w/ rails",
      "2x Mirrored Enterprise DB SSDs — Hot Swap",
    ],
    technicalSpecs: [
      "AMD EPYC 4005 4.0GHz 8/16 or 16/32 Core CPU",
      "32–64GB DDR5 DRAM",
      "2x Mirrored Enterprise OS SSD — Hot Swap",
      "2x 10Gb & 2x 1Gb Ethernet Ports",
      "1x Dedicated Remote Management",
      "2x Hot-swap, Redundant Power Supply",
    ],
    kpis: [
      { label: "Door Support", value: "500", unit: "doors" },
      { label: "Redundant PSU", value: "2x", unit: "Hot Swap" },
      { label: "Warranty Support", value: "5 Years", unit: "Next Business Day Parts" },
    ],
    productGroups: ["V260", "V265"],
    skuTableColumns: ["sku", "product", "ssdStorage", "msrp"],
    tierSections: [],
    upgradeSkus: [],
    heroImage: "/price-book/1u-chassis-hero.png",
    // STAYS STATIC. No datasheet template has been designed for the access
    // control line, so /api/datasheet/V260 answers 409 (ADR 0110). The arxys.com
    // PDF is a working link and is not traded for an error page — this is the one
    // family ADR 0116 leaves behind, and it comes back when an ACM template exists.
    datasheetModels: [],
    datasheetUrl:
      "https://www.arxys.com/wp-content/uploads/Arxys-VideoX-Factsheet-V260-V270-ACM-V5.pdf",
    category: "nvr-mgmt-acm",
    sortOrder: 3,
    skuExtraData: {
      "VX5-V260-ACM": { ssdStorage: "2x DB & 2x OS" },
      "VX5-V265-ACM": { ssdStorage: "2x DB & 2x OS" },
    },
  },

  // ── V200 — 1U 4Bay Video Server ──────────────────────────────────────────
  {
    slug: "v200",
    displayName: "V200 — 1U 4Bay Video Server",
    eyebrow: "VideoX V5 · 1U 4-Bay NVR Server",
    cardEyebrow: "V200 · 1U NVR",
    shortName: "V200",
    tagline:
      "Perfect for small to mid-sized deployments, striking the right balance between performance, protection, and cost.",
    greatFor:
      "Perfect for small to mid-sized deployments, this solution strikes the right balance between performance, protection, and cost. It's built to handle mid-range surveillance projects without added complexity — powerful, practical, and ready to scale.",
    keyFeatures: [
      "Windows Server 2022/2025 IoT Workgroup",
      "4x Enterprise HDD's — RAID 5",
      "1,000 Mbps max possible throughput",
      "1U Rack mount w/ rails",
      "Max VSR = 100 streams h.265 or h.264",
    ],
    technicalSpecs: [
      "AMD EPYC 4005 4.0GHz 6/12 Core CPU",
      "16GB DDR5 DRAM",
      "2x Mirrored Enterprise OS SSD — Hot Swap",
      "2x 10Gb & 2x 1Gb Ethernet Ports",
      "1x Dedicated Remote Management",
      "2x Hot-swap, Redundant Power Supply",
    ],
    kpis: [
      { label: "Max VSR", value: "100", unit: "streams", vsrTooltip: true },
      { label: "Throughput", value: "1,000", unit: "Mbps" },
      { label: "Warranty Support", value: "5 Years", unit: "Next Business Day Parts" },
    ],
    productGroups: ["V200"],
    skuTableColumns: ["sku", "product", "netStorage", "msrp"],
    tierSections: [],
    upgradeSkus: ["VX5-GPU-A1000"],
    heroImage: "/price-book/1u-chassis-hero.png",
    datasheetModels: ["V200"],
    datasheetUrl: null,
    category: "nvr-mgmt-acm",
    sortOrder: 4,
    skuExtraData: {
      "VX5-V200-64": { netStorage: "48 TB" },
      "VX5-V200-80": { netStorage: "60 TB" },
      "VX5-V200-96": { netStorage: "72 TB" },
    },
  },

  // ── V400 — 2U 8Bay Video Server ──────────────────────────────────────────
  {
    slug: "v400",
    displayName: "V400 — 2U 8Bay Video Server",
    eyebrow: "VideoX V5 · 2U 8-Bay Video Server",
    cardEyebrow: "V400 · 2U Video",
    shortName: "V400",
    tagline:
      "Strong security and reliable performance for medium to medium-large deployments.",
    greatFor:
      "Designed for medium to medium-large deployments with modest camera counts, this solution delivers strong security and reliable performance. It balances efficient video protection with scalable storage options, making it ideal for organizations with steady but manageable surveillance needs.",
    keyFeatures: [
      "Windows Server 2022/2025 IoT Standard",
      "8x Enterprise HDD's, RAID 5 & Cachevault",
      "2,000 Mbps max possible throughput",
      "2U Rack mount w/ rails",
      "Max VSR = 200 streams h.265 or h.264",
    ],
    technicalSpecs: [
      "AMD EPYC 9005 3.3GHz 16/32 Core CPU",
      "16GB ECC DDR5 DRAM",
      "2x Mirrored Enterprise OS SSD — Hot Swap",
      "4x 10GbE, 1x Dedicated Remote Management",
      "2x Hot-swap, Redundant Power Supply",
    ],
    kpis: [
      { label: "Max VSR", value: "200", unit: "streams", vsrTooltip: true },
      { label: "Throughput", value: "2,000", unit: "Mbps" },
      { label: "Warranty Support", value: "5 Years", unit: "Next Business Day Parts" },
    ],
    productGroups: ["V400"],
    skuTableColumns: ["sku", "product", "netStorage", "msrp"],
    tierSections: [],
    upgradeSkus: [
      "VX5-GPU-A1000",
      "VX5-NIC-SFP28",
      "VX5-NIC-SFP28x10",
      "VX5-NIC-SFP28x25",
    ],
    heroImage: "/price-book/v400-v500-hero.png",
    datasheetModels: ["V400"],
    datasheetUrl: null,
    category: "nvr-analytics",
    sortOrder: 5,
    skuExtraData: {
      "VX5-V400-128": { netStorage: "96 TB" },
      "VX5-V400-160": { netStorage: "120 TB" },
      "VX5-V400-192": { netStorage: "144 TB" },
    },
  },

  // ── V500 — 2U 12Bay Video Server ─────────────────────────────────────────
  {
    slug: "v500",
    displayName: "V500 — 2U 12Bay Video Server",
    eyebrow: "VideoX V5 · 2U 12-Bay Video Server",
    cardEyebrow: "V500 · 2U Video",
    shortName: "V500",
    tagline:
      "Tailored for mid to large-sized deployments with growing camera counts and retention needs.",
    greatFor:
      "Tailored for mid to large-sized deployments with growing camera counts and retention needs, this solution prioritizes security and high performance. It offers robust video protection combined with expanded storage capacity, to meet the demands of evolving surveillance environments.",
    keyFeatures: [
      "Windows Server 2022/2025 IoT Standard",
      "12x Enterprise HDD's, RAID 6 & Cachevault",
      "3,000 Mbps max possible throughput",
      "2U Rack mount w/ rails",
      "Max VSR = 275 streams h.265 or h.264",
    ],
    technicalSpecs: [
      "AMD EPYC 9005 3.3GHz 16/32 Core CPU",
      "32GB ECC DDR5 DRAM",
      "2x Mirrored Enterprise OS SSD — Hot Swap",
      "4x 10GbE, 1x Dedicated Remote Management",
      "2x Hot-swap, Redundant Power Supply",
    ],
    kpis: [
      { label: "Max VSR", value: "275", unit: "streams", vsrTooltip: true },
      { label: "Throughput", value: "3,000", unit: "Mbps" },
      { label: "Warranty Support", value: "5 Years", unit: "Next Business Day Parts" },
    ],
    productGroups: ["V500"],
    skuTableColumns: ["sku", "product", "netStorage", "msrp"],
    tierSections: [],
    upgradeSkus: [
      "VX5-GPU-A1000",
      "VX5-NIC-SFP28",
      "VX5-NIC-SFP28x10",
      "VX5-NIC-SFP28x25",
    ],
    heroImage: "/price-book/v400-v500-hero.png",
    datasheetModels: ["V500"],
    datasheetUrl: null,
    category: "nvr-analytics",
    sortOrder: 6,
    skuExtraData: {
      "VX5-V500-192": { netStorage: "160 TB" },
      "VX5-V500-240": { netStorage: "200 TB" },
      "VX5-V500-288": { netStorage: "240 TB" },
    },
  },

  // ── V600 — 3U 16Bay Video Server ─────────────────────────────────────────
  {
    slug: "v600",
    displayName: "V600 — 3U 16Bay Video Server",
    eyebrow: "VideoX V5 · 3U 16-Bay Video Server",
    cardEyebrow: "V600 · 3U Video",
    shortName: "V600",
    tagline:
      "Mid to large-sized deployments with growing camera counts, extended retention times.",
    greatFor:
      "Tailored for mid to large-sized deployments with growing camera counts and retention needs, this solution prioritizes security and high performance. It offers robust video protection combined with expanded storage capacity, to meet the demands of evolving surveillance environments and extended retention times.",
    keyFeatures: [
      "Windows Server 2022/2025 IoT Standard",
      "16x Enterprise HDD's, RAID 6 & Cachevault",
      "3,000 Mbps max possible throughput",
      "3U Rack mount w/ rails",
      "Max VSR = 275 streams h.265 or h.264",
    ],
    technicalSpecs: [
      "AMD EPYC 9005 3.3GHz 16/32 Core CPU",
      "32GB ECC DDR5 DRAM",
      "2x Mirrored Enterprise OS SSD — Hot Swap",
      "4x 10GbE, 1x Dedicated Remote Management",
      "2x Hot-swap, Redundant Power Supply",
    ],
    kpis: [
      { label: "Max VSR", value: "275", unit: "streams", vsrTooltip: true },
      { label: "Throughput", value: "3,000", unit: "Mbps" },
      { label: "Warranty Support", value: "5 Years", unit: "Next Business Day Parts" },
    ],
    productGroups: ["V600"],
    skuTableColumns: ["sku", "product", "netStorage", "msrp"],
    tierSections: [],
    upgradeSkus: [
      "VX5-GPU-A1000",
      "VX5-NIC-SFP28",
      "VX5-NIC-SFP28x10",
      "VX5-NIC-SFP28x25",
    ],
    heroImage: "/price-book/v600-hero.png",
    datasheetModels: ["V600"],
    datasheetUrl: null,
    category: "nvr-analytics",
    sortOrder: 7,
    skuExtraData: {
      "VX5-V600-256": { netStorage: "224 TB" },
      "VX5-V600-320": { netStorage: "280 TB" },
      "VX5-V600-384": { netStorage: "336 TB" },
    },
  },

  // ── V700 — 4U 24Bay Video Server ─────────────────────────────────────────
  {
    slug: "v700",
    displayName: "V700 — 4U 24Bay Video Server",
    eyebrow: "VideoX V5 · 4U 24-Bay Video Server",
    cardEyebrow: "V700 · 4U Video",
    shortName: "V700",
    tagline:
      "Built for large-scale deployments with advanced video analytics requirements.",
    greatFor:
      "Built for large-scale deployments with advanced video analytics requirements, this platform delivers unmatched protection, performance, and security. It's the perfect foundation for complex surveillance projects demanding high-capacity video processing. Analytics capabilities are fully optimized based on the VMS, ensuring powerful and intelligent monitoring at scale.",
    keyFeatures: [
      "Windows Server 2022/2025 IoT Standard",
      "24x Enterprise HDD's, RAID 60 & Cachevault",
      "4,000 Mbps max possible throughput",
      "4U Rack mount w/ rails",
      "Max VSR = 325 streams h.265 or h.264",
    ],
    technicalSpecs: [
      "AMD EPYC 9005 4.3GHz 16/32 Core CPU",
      "32GB ECC DDR5 DRAM",
      "2x Mirrored Enterprise OS SSD — Hot Swap",
      "4x 10GbE, 1x Dedicated Remote Management",
      "2x Hot-swap, Redundant Power Supply",
    ],
    kpis: [
      { label: "Max VSR", value: "325", unit: "streams", vsrTooltip: true },
      { label: "Throughput", value: "4,000", unit: "Mbps" },
      { label: "Warranty Support", value: "5 Years", unit: "Next Business Day Parts" },
    ],
    productGroups: ["V700"],
    skuTableColumns: ["sku", "product", "netStorage", "msrp"],
    tierSections: [],
    upgradeSkus: [
      "VX5-GPU-A1000",
      "VX5-NIC-SFP28",
      "VX5-NIC-SFP28x10",
      "VX5-NIC-SFP28x25",
    ],
    heroImage: "/price-book/v700-v800-hero.png",
    datasheetModels: ["V700"],
    datasheetUrl: null,
    category: "high-density",
    sortOrder: 8,
    skuExtraData: {
      "VX5-V700-384": { netStorage: "320 TB" },
      "VX5-V700-480": { netStorage: "400 TB" },
      "VX5-V700-576": { netStorage: "480 TB" },
    },
  },

  // ── V800 — 4U 36Bay Video Server ─────────────────────────────────────────
  {
    slug: "v800",
    displayName: "V800 — 4U 36Bay Video Server",
    eyebrow: "VideoX V5 · 4U 36-Bay Video Server",
    cardEyebrow: "V800 · 4U Video",
    shortName: "V800",
    tagline:
      "Designed for campus-wide deployments with centralized management and highest density.",
    greatFor:
      "Designed for campus-wide deployments with centralized management, this solution delivers critical protection, high performance, and top-tier security. It supports high camera density with exceptional reliability, for robust, scalable surveillance across large environments.",
    keyFeatures: [
      "Windows Server 2022/2025 IoT Standard",
      "36x Enterprise HDD's, RAID 60 & Cachevault",
      "4,000 Mbps max possible throughput",
      "4U Rack mount w/ rails",
      "Max VSR = 325 streams h.265 or h.264",
    ],
    technicalSpecs: [
      "AMD EPYC 9005 4.3GHz 16/32 Core CPU",
      "32GB ECC DDR5 DRAM",
      "2x Mirrored Enterprise OS SSD — Hot Swap",
      "4x 10GbE, 1x Dedicated Remote Management",
      "2x Hot-swap, Redundant Power Supply",
    ],
    kpis: [
      { label: "Max VSR", value: "325", unit: "streams", vsrTooltip: true },
      { label: "Throughput", value: "4,000", unit: "Mbps" },
      { label: "Warranty Support", value: "5 Years", unit: "Next Business Day Parts" },
    ],
    productGroups: ["V800"],
    skuTableColumns: ["sku", "product", "netStorage", "msrp"],
    tierSections: [],
    upgradeSkus: [
      "VX5-GPU-A1000",
      "VX5-NIC-SFP28",
      "VX5-NIC-SFP28x10",
      "VX5-NIC-SFP28x25",
    ],
    heroImage: "/price-book/v700-v800-hero.png",
    datasheetModels: ["V800"],
    datasheetUrl: null,
    category: "high-density",
    sortOrder: 9,
    skuExtraData: {
      "VX5-V800-576": { netStorage: "480 TB" },
      "VX5-V800-720": { netStorage: "600 TB" },
      "VX5-V800-864": { netStorage: "720 TB" },
    },
  },

  // ── SW — Security Workstations ───────────────────────────────────────────
  {
    slug: "sw",
    displayName: "Security Workstations",
    eyebrow: "VideoX SW · Security Workstations",
    cardEyebrow: "SW · Workstations",
    shortName: "SW",
    tagline:
      "Powerhouse security workstations engineered for high performance and maximum bandwidth.",
    greatFor:
      "Powerhouse security workstations engineered for high performance and maximum bandwidth, delivering seamless support for large camera counts and multi-monitor setups — built to excel in the most demanding surveillance environments.",
    keyFeatures: [
      "Windows 11 IoT Enterprise",
      "1 to 2x Nvidia GPUs",
      "Up to 325 Mbit/s Camera Bandwidth",
      "High Performance Tower or Rack Mount",
      "Up to 8x monitor support*",
    ],
    technicalSpecs: [
      "AMD Ryzen 9000 5th Gen — 8/16 Core CPU",
      "16GB DDR5 DRAM",
      "1x Dedicated OS SSD",
      "2x 10GbE Network ports",
      "Advanced Cooling System",
    ],
    kpis: [
      { label: "Max Bandwidth", value: "325", unit: "Mbit/s" },
      { label: "Monitor Support", value: "8x", unit: "displays" },
      { label: "Warranty Support", value: "3 Years", unit: "Next Business Day Parts" },
    ],
    productGroups: ["SW10", "SW20"],
    skuTableColumns: ["sku", "product", "bandwidth", "monitors", "msrp"],
    tierSections: [],
    upgradeSkus: ["VX5-PP5-V100"],
    heroImage: "/price-book/sw-hero.png",
    // TWO SHEETS, not one: the family slug is "sw" but no "SW" sheet exists, and
    // the two workstations render through the Rail template separately.
    //
    // These two buttons had never actually appeared. They lived in a
    // `datasheetButtons` array behind a `datasheetUrl ? ...` gate in the page,
    // and this family's datasheetUrl was null — so /price-book/sw read
    // "Documentation coming soon." datasheetButtonsFor() is now the single source
    // of the list, which removes the branch that could disagree with itself.
    datasheetModels: ["SW10", "SW20"],
    datasheetUrl: null,
    category: "workstations",
    sortOrder: 10,
    skuExtraData: {
      "VX5-SW10-100": { bandwidth: "125 Mbit/s", monitors: "4*" },
      "VX5-SW20-200": { bandwidth: "225 Mbit/s", monitors: "8*" },
    },
  },
];

export function familyBySlug(slug: string): Family | undefined {
  return FAMILIES.find((f) => f.slug === slug);
}

/**
 * Map a product group string (e.g. "V500", "SW10") to its Price Book family
 * slug (e.g. "v500", "sw"). Checks primary productGroups plus tier section
 * productGroups on each family. Returns null when no match is found (e.g.
 * legacy data or upgrade-only SKU groups like "GPU", "RAM", "NIC").
 */
export function productGroupToFamilySlug(productGroup: string): string | null {
  const upper = productGroup.toUpperCase();
  for (const family of FAMILIES) {
    if (family.productGroups.some((g) => g.toUpperCase() === upper)) {
      return family.slug;
    }
    for (const tier of family.tierSections) {
      if (tier.productGroups.some((g) => g.toUpperCase() === upper)) {
        return family.slug;
      }
    }
  }
  return null;
}
