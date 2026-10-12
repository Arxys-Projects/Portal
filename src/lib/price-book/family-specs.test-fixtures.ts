// Live product_specs rows for the seven Price Book product_specs families, read
// 2026-10-09 by scripts/audit-price-book-specs.ts and trimmed to literals so the
// derivation tests run with no network. Updated for the 2026-10-12 typo fixes
// (scripts/fix-product-specs-typos-2026-10.ts). One row per model, the canonical
// (highest-capacity) SKU, plus the few siblings a test needs.
//
// Shared by family-specs.test.ts and families.test.ts. Not itself a test file:
// the runner's glob is `*.test.ts`.

import type { FamilySpecRow } from "./family-specs";

export const V800_864: FamilySpecRow = {
  id: "VX5-V800-864",
  model_name: "VideoX V800 864TB 4U 36Bay",
  storage_raw_tb: 864,
  drive_bays: 36,
  rack_units: "4U",
  hdd_count: 36,
  hdd_mtbf: "2.5 Million",
  max_bandwidth_mbps: 4000,
  max_cameras_h265: 275,
  raid_level_display: "60",
  raid_level_alt_display: null,
  raid_support: "RAID 0/1/5/6/10",
  battery_raid: "YES",
  cpu_model_full: "AMD EPYC 9005 3.3Ghz 16/32 Core",
  cpu_turbo_ghz: "3.3 Ghz",
  cores_threads: "16C/32T",
  cpu_cache: "64MB",
  mem_bandwidth: "614 GB/s",
  avx_512: "Yes",
  chiplet_arch: "Yes",
  infinity_guard: "Yes",
  hotswap_power: "Yes",
  ram_spec: "32GB ECC DDR5",
  os_edition: "Windows Server 2022 OR 2025 LTSC",
  os_ssd_type: "2x Enterprise SSD",
  os_redundancy: "Mirrored, hot-swap",
  os_drive_desc: null,
  network: "4 × 10GbE + 1 IPMI",
  gbe_10_ports: 4,
  gbe_1_ports: 0,
  sfp_addon: "Optional",
  display_ports: "VGA (Client View applications not supported on server)",
  remote_mgmt:
    "Out of Band (OOB) Remote Management including: IPMI System Management, KVM Console Redirection",
  security_features: ["TPM 2.0 FIPS, CC-TCG certified"],
  form_factor: "4U Rackmount",
  power_wattage: "1200W 1+1 redundant PSU PMBus 1.2 80+ Platinum",
  power_redundancy: "1+1 redundant, hot swap",
  power_ac_input: "100-127VAC 10A 50-60Hz, 800Watt 200-240VAC 8A, 50-60Hz, 1200Watt",
  power_max_consumption: "1200W up to 80% efficient (Platinum) hot-plug redundant",
  cooling: "6 x 80x38mm PWM & low-power consumption hot swap fans",
  dimensions_mm: "430mm (w) x 680 (d) x 175 H",
  dimensions_in: "16.9 x 26.8 x 6.9",
  shipping_weight: "Ship Weight W/ 36x HDDs = 72k/167lbs",
  warranty_years: 5,
  warranty_terms:
    "Advanced Warranty with NBD Advanced Parts Replacement of Field Replaceable Units (FRUs).",
  operating_temp: "10 - 30 C / 41 - 86 F",
  storage_temp: "-40 - 65 C / -40 - 149 F",
  humidity: "10 – 90% relative humidity (non-condensing)",
  regulatory_safety: "CE (class A), UKCA, FCC, RCM, UL",
  regulatory_emissions: null,
  ndaa_text: "NDAA Compliant, no disclosures",
  revision_date: "2026-07-31",
  product_photo_path: "/datasheet/v800-front.png",
  rear_io_photo_path: "/datasheet/v800-rear.png",
  usage_paragraph: "Designed for campus-wide deployments with centralized management.",
};

export const V700_576: FamilySpecRow = {
  ...V800_864,
  id: "VX5-V700-576",
  model_name: "VideoX V700 576TB 4U 24Bay",
  storage_raw_tb: 576,
  drive_bays: 24,
  hdd_count: 24,
  os_drive_desc: "Enterprise 3D TLC Flash SSD Dedicated for OS/VMS, Hot-swap",
  power_wattage: "1200W 1+1 redundant PSU PMBus 1.2",
  power_redundancy: "1+1 redundant",
};

export const V600_384: FamilySpecRow = {
  ...V800_864,
  id: "VX5-V600-384",
  model_name: "VideoX V600 384TB 3U 16Bay",
  storage_raw_tb: 384,
  drive_bays: 16,
  rack_units: "3U",
  hdd_count: 16,
  max_bandwidth_mbps: 3000,
  raid_level_display: "6",
  form_factor: "3U Rackmount",
  remote_mgmt:
    "Dedicated Out of Band (OOB) Remote Management including: IPMI System Management, KVM Console Redirection",
  power_wattage: "800W",
  power_redundancy: "1+1 redundant PSU PMBus 1.2",
};

export const V500_288: FamilySpecRow = {
  ...V600_384,
  id: "VX5-V500-288",
  model_name: "VideoX V500 288TB 2U 12Bay",
  storage_raw_tb: 288,
  drive_bays: 12,
  rack_units: "2U",
  hdd_count: 12,
  form_factor: "2U Rackmount",
  os_drive_desc: "Enterprise 3D TLC Flash SSD SATA3 Dedicated for OS/VMS",
  remote_mgmt: V800_864.remote_mgmt,
};

export const V400_192: FamilySpecRow = {
  ...V500_288,
  id: "VX5-V400-192",
  model_name: "VideoX V400 192TB 2U 8Bay",
  storage_raw_tb: 192,
  drive_bays: 8,
  hdd_count: 8,
  max_bandwidth_mbps: 2000,
  max_cameras_h265: 150,
  cpu_model_full: "AMD EPYC 9015 3.6Ghz 8/16 Core",
  cpu_turbo_ghz: "4.1 Ghz",
  cores_threads: "8C/16T",
  ram_spec: "16GB ECC DDR5",
  os_drive_desc: "3D TLC Flash SSD SATA3 Dedicated for OS/VMS, Hot-swap",
  remote_mgmt:
    "Dedicated IPMI - 1GbE - Out of Band (OOB) Remote Management including: IPMI System Management, KVM Console Redirection",
  power_redundancy: "1+1 redundant PSU",
  warranty_terms: "Next Business Day, Advanced Parts Replacement of CRU's",
};

export const V200_96: FamilySpecRow = {
  ...V400_192,
  id: "VX5-V200-96",
  model_name: "VideoX V200 96TB 1U 4Bay",
  storage_raw_tb: 96,
  drive_bays: 4,
  rack_units: "1U",
  hdd_count: 4,
  max_bandwidth_mbps: 1000,
  max_cameras_h265: 100,
  raid_level_display: "5",
  cpu_model_full: "AMD EPYC 4005 4.0Ghz 6/12 Core",
  cpu_turbo_ghz: "5.4 Ghz",
  cores_threads: "6C/12T",
  os_edition: "Windows Server 2022 OR 2025 WKGP LTSC",
  os_drive_desc: null,
  network: "2 × 10GbE + 1 IPMI",
  gbe_10_ports: 2,
  gbe_1_ports: 2,
  sfp_addon: "No",
  form_factor: "1U Rackmount",
  remote_mgmt: V800_864.remote_mgmt,
  power_wattage: "800W 1+1 redundant PSU",
  power_redundancy: "1+1 redundant PSU",
  warranty_terms: V800_864.warranty_terms,
};

/** The V100 as it is live: RAID 1 with JBOD as the alternate, one NVMe, no hot-swap power. */
export const V100_48: FamilySpecRow = {
  ...V200_96,
  id: "VX5-V100-48",
  model_name: "VideoX V100 48TB 1U 2Bay",
  storage_raw_tb: 48,
  drive_bays: 2,
  hdd_count: 2,
  max_bandwidth_mbps: 500,
  max_cameras_h265: 25,
  raid_level_display: "1",
  raid_level_alt_display: "JBOD",
  raid_support: "Software RAID 0/1",
  battery_raid: "NO",
  os_ssd_type: "1x NVMe",
  os_redundancy: "NO",
  network: "2 × 1GbE + 1 IPMI",
  gbe_10_ports: 0,
  gbe_1_ports: 2,
  hotswap_power: "NO",
  power_wattage: "Single PSU 400W",
  power_redundancy: "Single PSU 400W",
  warranty_terms: "NBD, Advanced Replacement",
};

/** The canonical row of each product_specs family, keyed by model. */
export const LIVE_TOP_ROWS: Record<string, FamilySpecRow> = {
  V100: V100_48,
  V200: V200_96,
  V400: V400_192,
  V500: V500_288,
  V600: V600_384,
  V700: V700_576,
  V800: V800_864,
};
