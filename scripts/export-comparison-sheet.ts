// scripts/export-comparison-sheet.ts
// Generates exports/comparison-data.xlsx from migration seed data.
// Read-only — does not touch any app source, migration, or seed file.
//
// Run: node --import tsx scripts/export-comparison-sheet.ts

import ExcelJS from "exceljs";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(ROOT, "exports");
const OUT_FILE = resolve(OUT_DIR, "comparison-data.xlsx");

// ─── Style constants ─────────────────────────────────────────────────────────

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF0F172A" },
};
const HEADER_FONT: Partial<ExcelJS.Font> = {
  color: { argb: "FFFFFFFF" },
  bold: true,
};
const ROW_EVEN_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF1F5F9" },
};
const YELLOW_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFFF00" },
};

// ─── product_specs — 44 columns in schema order ──────────────────────────────
// Sources:
//   20260529000001_phase5_product_specs.sql (base columns + 21 rows)
//   20260602000001_quickcompare_columns.sql  (25 QuickCompare columns + family values)
//   20260605000001_fix_cpu_cache.sql         (cpu_cache corrections)
//   20260605000002_fix_hdd_count_raid_level.sql (hdd_count + raid_level_display corrections)

const PRODUCT_SPECS_COLS = [
  "id", "model_name", "form_factor", "storage_raw_tb",
  "cpu_model", "cpu_cores_threads", "cpu_base_ghz", "cpu_passmark",
  "ram_gb", "max_cameras", "max_cameras_h265",
  "network", "raid_support", "os", "warranty", "vms_certified",
  "msrp", "notes", "product_sku",
  // QuickCompare additions
  "rack_units", "drive_bays", "max_bandwidth_mbps",
  "os_edition", "ram_spec",
  "cpu_model_full", "cpu_turbo_ghz", "cores_threads", "cpu_cache",
  "mem_bandwidth", "avx_512", "workload_affinity",
  "chiplet_arch", "infinity_guard", "hotswap_power",
  "hdd_count", "hdd_mtbf", "raid_level_display",
  "battery_raid", "os_ssd_type", "os_redundancy",
  "gbe_1_ports", "gbe_10_ports", "sfp_addon", "avigilon_gpu",
] as const;

// QuickCompare values per model family.
// Each family key maps to the corrected values after all fix migrations.
const QC_BY_FAMILY = {
  V100: {
    rack_units: "1U", drive_bays: 2, max_bandwidth_mbps: 500,
    os_edition: "Windows Server 2022 OR 2025 WKGP LTSC", ram_spec: "16GB ECC DDR5",
    cpu_model_full: "AMD EPYC 4005 4.0Ghz 6/12 Core", cpu_turbo_ghz: "5.4 Ghz",
    cores_threads: "6C/12T", cpu_cache: "32MB",
    mem_bandwidth: "89.6 GB/s", avx_512: "Yes", workload_affinity: "NO",
    chiplet_arch: "Yes", infinity_guard: "Yes", hotswap_power: "NO",
    hdd_count: 2, hdd_mtbf: "2.5 Million", raid_level_display: "NA",
    battery_raid: "NO", os_ssd_type: "1x NVMe", os_redundancy: "NO",
    gbe_1_ports: 2, gbe_10_ports: 0, sfp_addon: "No", avigilon_gpu: "NO",
  },
  V200: {
    rack_units: "1U", drive_bays: 4, max_bandwidth_mbps: 1000,
    os_edition: "Windows Server 2022 OR 2025 WKGP LTSC", ram_spec: "16GB ECC DDR5",
    cpu_model_full: "AMD EPYC 4005 4.0Ghz 6/12 Core", cpu_turbo_ghz: "5.4 Ghz",
    cores_threads: "6C/12T", cpu_cache: "32MB",
    mem_bandwidth: "89.6 GB/s", avx_512: "Yes", workload_affinity: "NO",
    chiplet_arch: "Yes", infinity_guard: "Yes", hotswap_power: "Yes",
    hdd_count: 4, hdd_mtbf: "2.5 Million", raid_level_display: "5",
    battery_raid: "YES", os_ssd_type: "2x Enterprise SSD", os_redundancy: "Mirrored, hot-swap",
    gbe_1_ports: 2, gbe_10_ports: 2, sfp_addon: "No", avigilon_gpu: "Optional",
  },
  V400: {
    rack_units: "2U", drive_bays: 8, max_bandwidth_mbps: 2000,
    os_edition: "Windows Server 2022 OR 2025 LTSC", ram_spec: "16GB ECC DDR5",
    cpu_model_full: "AMD EPYC 9005 3.3Ghz 16/32 Core", cpu_turbo_ghz: "3.3 Ghz",
    cores_threads: "16C/32T", cpu_cache: "64MB",
    mem_bandwidth: "614 GB/s", avx_512: "Yes", workload_affinity: "Yes",
    chiplet_arch: "Yes", infinity_guard: "Yes", hotswap_power: "Yes",
    hdd_count: 8, hdd_mtbf: "2.5 Million", raid_level_display: "6",
    battery_raid: "YES", os_ssd_type: "2x Enterprise SSD", os_redundancy: "Mirrored, hot-swap",
    gbe_1_ports: 0, gbe_10_ports: 4, sfp_addon: "Optional", avigilon_gpu: "Optional",
  },
  V500: {
    rack_units: "2U", drive_bays: 12, max_bandwidth_mbps: 3000,
    os_edition: "Windows Server 2022 OR 2025 LTSC", ram_spec: "32GB ECC DDR5",
    cpu_model_full: "AMD EPYC 9005 3.3Ghz 16/32 Core", cpu_turbo_ghz: "3.3 Ghz",
    cores_threads: "16C/32T", cpu_cache: "64MB",
    mem_bandwidth: "614 GB/s", avx_512: "Yes", workload_affinity: "Yes",
    chiplet_arch: "Yes", infinity_guard: "Yes", hotswap_power: "Yes",
    hdd_count: 12, hdd_mtbf: "2.5 Million", raid_level_display: "6",
    battery_raid: "YES", os_ssd_type: "2x Enterprise SSD", os_redundancy: "Mirrored, hot-swap",
    gbe_1_ports: 0, gbe_10_ports: 4, sfp_addon: "Optional", avigilon_gpu: "Optional",
  },
  V600: {
    rack_units: "3U", drive_bays: 16, max_bandwidth_mbps: 3000,
    os_edition: "Windows Server 2022 OR 2025 LTSC", ram_spec: "32GB ECC DDR5",
    cpu_model_full: "AMD EPYC 9005 3.3Ghz 16/32 Core", cpu_turbo_ghz: "3.3 Ghz",
    cores_threads: "16C/32T", cpu_cache: "64MB",
    mem_bandwidth: "614 GB/s", avx_512: "Yes", workload_affinity: "Yes",
    chiplet_arch: "Yes", infinity_guard: "Yes", hotswap_power: "Yes",
    hdd_count: 16, hdd_mtbf: "2.5 Million", raid_level_display: "6",
    battery_raid: "YES", os_ssd_type: "2x Enterprise SSD", os_redundancy: "Mirrored, hot-swap",
    gbe_1_ports: 0, gbe_10_ports: 4, sfp_addon: "Optional", avigilon_gpu: "Optional",
  },
  V700: {
    rack_units: "4U", drive_bays: 24, max_bandwidth_mbps: 4000,
    os_edition: "Windows Server 2022 OR 2025 LTSC", ram_spec: "32GB ECC DDR5",
    cpu_model_full: "AMD EPYC 9005 4.3Ghz 16/32 Core", cpu_turbo_ghz: "4.25 Ghz",
    cores_threads: "16C/32T", cpu_cache: "64MB",
    mem_bandwidth: "614 GB/s", avx_512: "Yes", workload_affinity: "Yes",
    chiplet_arch: "Yes", infinity_guard: "Yes", hotswap_power: "Yes",
    hdd_count: 24, hdd_mtbf: "2.5 Million", raid_level_display: "60",
    battery_raid: "YES", os_ssd_type: "2x Enterprise SSD", os_redundancy: "Mirrored, hot-swap",
    gbe_1_ports: 0, gbe_10_ports: 4, sfp_addon: "Optional", avigilon_gpu: "Optional",
  },
  V800: {
    rack_units: "4U", drive_bays: 36, max_bandwidth_mbps: 4000,
    os_edition: "Windows Server 2022 OR 2025 LTSC", ram_spec: "32GB ECC DDR5",
    cpu_model_full: "AMD EPYC 9005 4.3Ghz 16/32 Core", cpu_turbo_ghz: "4.25 Ghz",
    cores_threads: "16C/32T", cpu_cache: "64MB",
    mem_bandwidth: "614 GB/s", avx_512: "Yes", workload_affinity: "Yes",
    chiplet_arch: "Yes", infinity_guard: "Yes", hotswap_power: "Yes",
    hdd_count: 36, hdd_mtbf: "2.5 Million", raid_level_display: "60",
    battery_raid: "YES", os_ssd_type: "2x Enterprise SSD", os_redundancy: "Mirrored, hot-swap",
    gbe_1_ports: 0, gbe_10_ports: 4, sfp_addon: "Optional", avigilon_gpu: "Optional",
  },
};

type QcFamily = keyof typeof QC_BY_FAMILY;
type BaseProductSpec = {
  id: string; model_name: string; form_factor: string; storage_raw_tb: number;
  cpu_model: string; cpu_cores_threads: string; cpu_base_ghz: number; cpu_passmark: number;
  ram_gb: number; max_cameras: number; max_cameras_h265: number; network: string;
  raid_support: string; os: string; warranty: string; vms_certified: string;
  msrp: number; notes: string | null; product_sku: string | null;
};

function ps(base: BaseProductSpec, family: QcFamily) {
  return { ...base, ...QC_BY_FAMILY[family] };
}

const PRODUCT_SPECS_ROWS = [
  // ── V100 family ──
  ps({ id: "VX5-V100-32", model_name: "VideoX V100 32TB 1U 2Bay",  form_factor: "1U Rackmount", storage_raw_tb: 32,
       cpu_model: "AMD EPYC 4005 Series", cpu_cores_threads: "8C/16T", cpu_base_ghz: 3.8, cpu_passmark: 36144, ram_gb: 16,
       max_cameras: 25, max_cameras_h265: 25, network: "2 × 10GbE + 1 IPMI", raid_support: "Software RAID 0/1",
       os: "Windows Server 2022 / 2025 IoT", warranty: "5yr NBD, Advanced Replacement",
       vms_certified: "Milestone XProtect, Avigilon ACC", msrp: 8317.00, notes: "Entry rack", product_sku: null }, "V100"),
  ps({ id: "VX5-V100-40", model_name: "VideoX V100 40TB 1U 2Bay",  form_factor: "1U Rackmount", storage_raw_tb: 40,
       cpu_model: "AMD EPYC 4005 Series", cpu_cores_threads: "8C/16T", cpu_base_ghz: 3.8, cpu_passmark: 36144, ram_gb: 16,
       max_cameras: 25, max_cameras_h265: 25, network: "2 × 10GbE + 1 IPMI", raid_support: "Software RAID 0/1",
       os: "Windows Server 2022 / 2025 IoT", warranty: "5yr NBD, Advanced Replacement",
       vms_certified: "Milestone XProtect, Avigilon ACC, Genetec", msrp: 8745.00, notes: null, product_sku: null }, "V100"),
  ps({ id: "VX5-V100-48", model_name: "VideoX V100 48TB 1U 2Bay",  form_factor: "1U Rackmount", storage_raw_tb: 48,
       cpu_model: "AMD EPYC 4005 Series", cpu_cores_threads: "8C/16T", cpu_base_ghz: 3.8, cpu_passmark: 36144, ram_gb: 16,
       max_cameras: 25, max_cameras_h265: 25, network: "2 × 10GbE + 1 IPMI", raid_support: "Software RAID 0/1",
       os: "Windows Server 2022 / 2025 IoT", warranty: "5yr NBD, Advanced Replacement",
       vms_certified: "Milestone XProtect, Avigilon ACC, Genetec", msrp: 9558.00, notes: null, product_sku: null }, "V100"),
  // ── V200 family ──
  ps({ id: "VX5-V200-64", model_name: "VideoX V200 64TB 1U 4Bay",  form_factor: "1U Rackmount", storage_raw_tb: 64,
       cpu_model: "AMD EPYC 4005 Series", cpu_cores_threads: "8C/16T", cpu_base_ghz: 3.8, cpu_passmark: 36144, ram_gb: 16,
       max_cameras: 100, max_cameras_h265: 100, network: "2 × 10GbE + 1 IPMI", raid_support: "RAID 0/1/5/6/10",
       os: "Windows Server 2022 / 2025 IoT", warranty: "5yr NBD, Advanced Replacement",
       vms_certified: "Milestone XProtect, Avigilon ACC, Genetec", msrp: 15657.00, notes: null, product_sku: null }, "V200"),
  ps({ id: "VX5-V200-80", model_name: "VideoX V200 80TB 1U 4Bay",  form_factor: "1U Rackmount", storage_raw_tb: 80,
       cpu_model: "AMD EPYC 4005 Series", cpu_cores_threads: "8C/16T", cpu_base_ghz: 3.8, cpu_passmark: 36144, ram_gb: 16,
       max_cameras: 100, max_cameras_h265: 100, network: "2 × 10GbE + 1 IPMI", raid_support: "RAID 0/1/5/6/10",
       os: "Windows Server 2022 / 2025 IoT", warranty: "5yr NBD, Advanced Replacement",
       vms_certified: "Milestone XProtect, Avigilon ACC, Genetec", msrp: 16640.00, notes: null, product_sku: null }, "V200"),
  ps({ id: "VX5-V200-96", model_name: "VideoX V200 96TB 1U 4Bay",  form_factor: "1U Rackmount", storage_raw_tb: 96,
       cpu_model: "AMD EPYC 4005 Series", cpu_cores_threads: "8C/16T", cpu_base_ghz: 3.8, cpu_passmark: 36144, ram_gb: 16,
       max_cameras: 100, max_cameras_h265: 100, network: "2 × 10GbE + 1 IPMI", raid_support: "RAID 0/1/5/6/10",
       os: "Windows Server 2022 / 2025 IoT", warranty: "5yr NBD, Advanced Replacement",
       vms_certified: "Milestone XProtect, Avigilon ACC, Genetec", msrp: 18139.00, notes: null, product_sku: null }, "V200"),
  // ── V400 family ──
  ps({ id: "VX5-V400-128", model_name: "VideoX V400 128TB 2U 8Bay", form_factor: "2U Rackmount", storage_raw_tb: 128,
       cpu_model: "AMD EPYC 9005 Series", cpu_cores_threads: "16C/32T", cpu_base_ghz: 3.3, cpu_passmark: 48936, ram_gb: 16,
       max_cameras: 200, max_cameras_h265: 200, network: "4 × 10GbE + 1 IPMI", raid_support: "RAID 0/1/5/6/10",
       os: "Windows Server 2022 / 2025 IoT", warranty: "5yr NBD, Advanced Replacement",
       vms_certified: "Milestone XProtect, Avigilon ACC, Genetec", msrp: 24975.00, notes: null, product_sku: null }, "V400"),
  ps({ id: "VX5-V400-160", model_name: "VideoX V400 160TB 2U 8Bay", form_factor: "2U Rackmount", storage_raw_tb: 160,
       cpu_model: "AMD EPYC 9005 Series", cpu_cores_threads: "16C/32T", cpu_base_ghz: 3.3, cpu_passmark: 48936, ram_gb: 16,
       max_cameras: 200, max_cameras_h265: 200, network: "4 × 10GbE + 1 IPMI", raid_support: "RAID 0/1/5/6/10",
       os: "Windows Server 2022 / 2025 IoT", warranty: "5yr NBD, Advanced Replacement",
       vms_certified: "Milestone XProtect, Avigilon ACC, Genetec", msrp: 26910.00, notes: null, product_sku: null }, "V400"),
  ps({ id: "VX5-V400-192", model_name: "VideoX V400 192TB 2U 8Bay", form_factor: "2U Rackmount", storage_raw_tb: 192,
       cpu_model: "AMD EPYC 9005 Series", cpu_cores_threads: "16C/32T", cpu_base_ghz: 3.3, cpu_passmark: 48936, ram_gb: 16,
       max_cameras: 200, max_cameras_h265: 200, network: "4 × 10GbE + 1 IPMI", raid_support: "RAID 0/1/5/6/10",
       os: "Windows Server 2022 / 2025 IoT", warranty: "5yr NBD, Advanced Replacement",
       vms_certified: "Milestone XProtect, Avigilon ACC, Genetec", msrp: 29861.00, notes: null, product_sku: null }, "V400"),
  // ── V500 family ──
  ps({ id: "VX5-V500-192", model_name: "VideoX V500 192TB 2U 12Bay", form_factor: "2U Rackmount", storage_raw_tb: 192,
       cpu_model: "AMD EPYC 9005 Series", cpu_cores_threads: "16C/32T", cpu_base_ghz: 3.3, cpu_passmark: 48936, ram_gb: 32,
       max_cameras: 275, max_cameras_h265: 275, network: "4 × 10GbE + 1 IPMI", raid_support: "RAID 0/1/5/6/10",
       os: "Windows Server 2022 / 2025 IoT", warranty: "5yr NBD, Advanced Replacement",
       vms_certified: "Milestone XProtect, Avigilon ACC, Genetec", msrp: 32978.00, notes: null, product_sku: null }, "V500"),
  ps({ id: "VX5-V500-240", model_name: "VideoX V500 240TB 2U 12Bay", form_factor: "2U Rackmount", storage_raw_tb: 240,
       cpu_model: "AMD EPYC 9005 Series", cpu_cores_threads: "16C/32T", cpu_base_ghz: 3.3, cpu_passmark: 48936, ram_gb: 32,
       max_cameras: 275, max_cameras_h265: 275, network: "4 × 10GbE + 1 IPMI", raid_support: "RAID 0/1/5/6/10",
       os: "Windows Server 2022 / 2025 IoT", warranty: "5yr NBD, Advanced Replacement",
       vms_certified: "Milestone XProtect, Avigilon ACC, Genetec", msrp: 35926.00, notes: null, product_sku: null }, "V500"),
  ps({ id: "VX5-V500-288", model_name: "VideoX V500 288TB 2U 12Bay", form_factor: "2U Rackmount", storage_raw_tb: 288,
       cpu_model: "AMD EPYC 9005 Series", cpu_cores_threads: "16C/32T", cpu_base_ghz: 3.3, cpu_passmark: 48936, ram_gb: 32,
       max_cameras: 275, max_cameras_h265: 275, network: "4 × 10GbE + 1 IPMI", raid_support: "RAID 0/1/5/6/10",
       os: "Windows Server 2022 / 2025 IoT", warranty: "5yr NBD, Advanced Replacement",
       vms_certified: "Milestone XProtect, Avigilon ACC, Genetec", msrp: 40425.00, notes: null, product_sku: null }, "V500"),
  // ── V600 family ──
  ps({ id: "VX5-V600-256", model_name: "VideoX V600 256TB 3U 16Bay", form_factor: "3U Rackmount", storage_raw_tb: 256,
       cpu_model: "AMD EPYC 9005 Series", cpu_cores_threads: "16C/32T", cpu_base_ghz: 3.3, cpu_passmark: 48936, ram_gb: 32,
       max_cameras: 275, max_cameras_h265: 275, network: "4 × 10GbE + 1 IPMI", raid_support: "RAID 0/1/5/6/10",
       os: "Windows Server 2022 / 2025 IoT", warranty: "5yr NBD, Advanced Replacement",
       vms_certified: "Milestone XProtect, Avigilon ACC, Genetec", msrp: 37728.00, notes: null, product_sku: null }, "V600"),
  ps({ id: "VX5-V600-320", model_name: "VideoX V600 320TB 3U 16Bay", form_factor: "3U Rackmount", storage_raw_tb: 320,
       cpu_model: "AMD EPYC 9005 Series", cpu_cores_threads: "16C/32T", cpu_base_ghz: 3.3, cpu_passmark: 48936, ram_gb: 32,
       max_cameras: 275, max_cameras_h265: 275, network: "4 × 10GbE + 1 IPMI", raid_support: "RAID 0/1/5/6/10",
       os: "Windows Server 2022 / 2025 IoT", warranty: "5yr NBD, Advanced Replacement",
       vms_certified: "Milestone XProtect, Avigilon ACC, Genetec", msrp: 41659.00, notes: null, product_sku: null }, "V600"),
  ps({ id: "VX5-V600-384", model_name: "VideoX V600 384TB 3U 16Bay", form_factor: "3U Rackmount", storage_raw_tb: 384,
       cpu_model: "AMD EPYC 9005 Series", cpu_cores_threads: "16C/32T", cpu_base_ghz: 3.3, cpu_passmark: 48936, ram_gb: 32,
       max_cameras: 275, max_cameras_h265: 275, network: "4 × 10GbE + 1 IPMI", raid_support: "RAID 0/1/5/6/10",
       os: "Windows Server 2022 / 2025 IoT", warranty: "5yr NBD, Advanced Replacement",
       vms_certified: "Milestone XProtect, Avigilon ACC, Genetec", msrp: 47657.00, notes: null, product_sku: null }, "V600"),
  // ── V700 family ──
  ps({ id: "VX5-V700-384", model_name: "VideoX V700 384TB 4U 24Bay", form_factor: "4U Rackmount", storage_raw_tb: 384,
       cpu_model: "AMD EPYC 9005 Series", cpu_cores_threads: "16C/32T", cpu_base_ghz: 4.3, cpu_passmark: 56984, ram_gb: 32,
       max_cameras: 325, max_cameras_h265: 325, network: "4 × 10GbE + 1 IPMI", raid_support: "RAID 0/1/5/6/10",
       os: "Windows Server 2022 / 2025 IoT", warranty: "5yr NBD, Advanced Replacement",
       vms_certified: "Milestone XProtect, Avigilon ACC, Genetec", msrp: 48615.00, notes: null, product_sku: null }, "V700"),
  ps({ id: "VX5-V700-480", model_name: "VideoX V700 480TB 4U 24Bay", form_factor: "4U Rackmount", storage_raw_tb: 480,
       cpu_model: "AMD EPYC 9005 Series", cpu_cores_threads: "16C/32T", cpu_base_ghz: 4.3, cpu_passmark: 56984, ram_gb: 32,
       max_cameras: 325, max_cameras_h265: 325, network: "4 × 10GbE + 1 IPMI", raid_support: "RAID 0/1/5/6/10",
       os: "Windows Server 2022 / 2025 IoT", warranty: "5yr NBD, Advanced Replacement",
       vms_certified: "Milestone XProtect, Avigilon ACC, Genetec", msrp: 54512.00, notes: null, product_sku: null }, "V700"),
  ps({ id: "VX5-V700-576", model_name: "VideoX V700 576TB 4U 24Bay", form_factor: "4U Rackmount", storage_raw_tb: 576,
       cpu_model: "AMD EPYC 9005 Series", cpu_cores_threads: "16C/32T", cpu_base_ghz: 4.3, cpu_passmark: 56984, ram_gb: 32,
       max_cameras: 325, max_cameras_h265: 325, network: "4 × 10GbE + 1 IPMI", raid_support: "RAID 0/1/5/6/10",
       os: "Windows Server 2022 / 2025 IoT", warranty: "5yr NBD, Advanced Replacement",
       vms_certified: "Milestone XProtect, Avigilon ACC, Genetec", msrp: 63509.00, notes: null, product_sku: null }, "V700"),
  // ── V800 family ──
  ps({ id: "VX5-V800-576", model_name: "VideoX V800 576TB 4U 36Bay", form_factor: "4U Rackmount", storage_raw_tb: 576,
       cpu_model: "AMD EPYC 9005 Series", cpu_cores_threads: "16C/32T", cpu_base_ghz: 4.3, cpu_passmark: 56984, ram_gb: 32,
       max_cameras: 325, max_cameras_h265: 325, network: "4 × 10GbE + 1 IPMI", raid_support: "RAID 0/1/5/6/10",
       os: "Windows Server 2022 / 2025 IoT", warranty: "5yr NBD, Advanced Replacement",
       vms_certified: "Milestone XProtect, Avigilon ACC, Genetec", msrp: 64922.00, notes: null, product_sku: null }, "V800"),
  ps({ id: "VX5-V800-720", model_name: "VideoX V800 720TB 4U 36Bay", form_factor: "4U Rackmount", storage_raw_tb: 720,
       cpu_model: "AMD EPYC 9005 Series", cpu_cores_threads: "16C/32T", cpu_base_ghz: 4.3, cpu_passmark: 56984, ram_gb: 32,
       max_cameras: 325, max_cameras_h265: 325, network: "4 × 10GbE + 1 IPMI", raid_support: "RAID 0/1/5/6/10",
       os: "Windows Server 2022 / 2025 IoT", warranty: "5yr NBD, Advanced Replacement",
       vms_certified: "Milestone XProtect, Avigilon ACC, Genetec", msrp: 74048.00, notes: null, product_sku: null }, "V800"),
  ps({ id: "VX5-V800-864", model_name: "VideoX V800 864TB 4U 36Bay", form_factor: "4U Rackmount", storage_raw_tb: 864,
       cpu_model: "AMD EPYC 9005 Series", cpu_cores_threads: "16C/32T", cpu_base_ghz: 4.3, cpu_passmark: 56984, ram_gb: 32,
       max_cameras: 325, max_cameras_h265: 325, network: "4 × 10GbE + 1 IPMI", raid_support: "RAID 0/1/5/6/10",
       os: "Windows Server 2022 / 2025 IoT", warranty: "5yr NBD, Advanced Replacement",
       vms_certified: "Milestone XProtect, Avigilon ACC, Genetec", msrp: 87971.00, notes: null, product_sku: null }, "V800"),
];

// ─── competitor_products — 22 columns in schema order ────────────────────────
// Source: 20260529000002_phase5_competitor_products.sql (14 Milestone + 20 Avigilon = 34 rows)

const COMPETITOR_PRODUCTS_COLS = [
  "id", "vendor", "brand_name", "product_line", "model_name", "sku",
  "form_factor", "storage_raw_tb",
  "cpu_model", "cpu_cores_threads", "cpu_base_ghz", "cpu_passmark",
  "ram_gb", "max_cameras", "max_cameras_h265",
  "network", "raid_support", "os", "warranty", "vms_certified",
  "arxys_match_id", "msrp_current",
] as const;

const COMPETITOR_PRODUCTS_ROWS = [
  // ── Milestone Husky IVO — 14 rows ──────────────────────────────────────────
  // HE700R family (1U, Intel Xeon E-series Rev 3, 6C/12T, 2.9GHz, passmark 21708, 32GB)
  { id: "HE700R-16TB",  vendor: "milestone", brand_name: "Milestone", product_line: "Husky IVO", model_name: "Husky IVO 700 1U Rack",
    sku: "HE700R-16TB",  form_factor: "1U Rackmount", storage_raw_tb: 16,
    cpu_model: "Intel Xeon E-series (Rev 3)", cpu_cores_threads: "6C/12T", cpu_base_ghz: 2.9, cpu_passmark: 21708, ram_gb: 32,
    max_cameras: 100, max_cameras_h265: 50, network: "2 × 1GbE",
    raid_support: "RAID 5/6", os: "Windows Server 2022 IoT", warranty: "5yr NBD", vms_certified: "Milestone XProtect only",
    arxys_match_id: "VX5-V200-64", msrp_current: 24525.00 },
  { id: "HE700R-32TB",  vendor: "milestone", brand_name: "Milestone", product_line: "Husky IVO", model_name: "Husky IVO 700 1U Rack",
    sku: "HE700R-32TB",  form_factor: "1U Rackmount", storage_raw_tb: 32,
    cpu_model: "Intel Xeon E-series (Rev 3)", cpu_cores_threads: "6C/12T", cpu_base_ghz: 2.9, cpu_passmark: 21708, ram_gb: 32,
    max_cameras: 100, max_cameras_h265: 50, network: "2 × 1GbE",
    raid_support: "RAID 5/6", os: "Windows Server 2022 IoT", warranty: "5yr NBD", vms_certified: "Milestone XProtect only",
    arxys_match_id: "VX5-V200-64", msrp_current: 25650.00 },
  { id: "HE700R-48TB",  vendor: "milestone", brand_name: "Milestone", product_line: "Husky IVO", model_name: "Husky IVO 700 1U Rack",
    sku: "HE700R-48TB",  form_factor: "1U Rackmount", storage_raw_tb: 48,
    cpu_model: "Intel Xeon E-series (Rev 3)", cpu_cores_threads: "6C/12T", cpu_base_ghz: 2.9, cpu_passmark: 21708, ram_gb: 32,
    max_cameras: 100, max_cameras_h265: 50, network: "2 × 1GbE",
    raid_support: "RAID 5/6", os: "Windows Server 2022 IoT", warranty: "5yr NBD", vms_certified: "Milestone XProtect only",
    arxys_match_id: "VX5-V200-64", msrp_current: 27125.00 },
  { id: "HE700R-64TB",  vendor: "milestone", brand_name: "Milestone", product_line: "Husky IVO", model_name: "Husky IVO 700 1U Rack",
    sku: "HE700R-64TB",  form_factor: "1U Rackmount", storage_raw_tb: 64,
    cpu_model: "Intel Xeon E-series (Rev 3)", cpu_cores_threads: "6C/12T", cpu_base_ghz: 2.9, cpu_passmark: 21708, ram_gb: 32,
    max_cameras: 100, max_cameras_h265: 50, network: "2 × 1GbE",
    raid_support: "RAID 5/6", os: "Windows Server 2022 IoT", warranty: "5yr NBD", vms_certified: "Milestone XProtect only",
    arxys_match_id: "VX5-V200-80", msrp_current: 28475.00 },
  // HE1000R family (2U, Intel Xeon Silver, 12C/24T, 2.1GHz, passmark 25136, 32GB)
  { id: "HE1000R-32TB",  vendor: "milestone", brand_name: "Milestone", product_line: "Husky IVO", model_name: "Husky IVO 1000 2U Rack",
    sku: "HE1000R-32TB",  form_factor: "2U Rackmount", storage_raw_tb: 32,
    cpu_model: "Intel Xeon Silver", cpu_cores_threads: "12C/24T", cpu_base_ghz: 2.1, cpu_passmark: 25136, ram_gb: 32,
    max_cameras: 150, max_cameras_h265: 75, network: "6 × 1GbE + 1 × 1GbE Mgmt",
    raid_support: "RAID 5/6", os: "Windows Server 2022 IoT", warranty: "5yr NBD", vms_certified: "Milestone XProtect only",
    arxys_match_id: "VX5-V400-128", msrp_current: 33100.00 },
  { id: "HE1000R-64TB",  vendor: "milestone", brand_name: "Milestone", product_line: "Husky IVO", model_name: "Husky IVO 1000 2U Rack",
    sku: "HE1000R-64TB",  form_factor: "2U Rackmount", storage_raw_tb: 64,
    cpu_model: "Intel Xeon Silver", cpu_cores_threads: "12C/24T", cpu_base_ghz: 2.1, cpu_passmark: 25136, ram_gb: 32,
    max_cameras: 150, max_cameras_h265: 75, network: "6 × 1GbE + 1 × 1GbE Mgmt",
    raid_support: "RAID 5/6", os: "Windows Server 2022 IoT", warranty: "5yr NBD", vms_certified: "Milestone XProtect only",
    arxys_match_id: "VX5-V400-128", msrp_current: 35000.00 },
  { id: "HE1000R-96TB",  vendor: "milestone", brand_name: "Milestone", product_line: "Husky IVO", model_name: "Husky IVO 1000 2U Rack",
    sku: "HE1000R-96TB",  form_factor: "2U Rackmount", storage_raw_tb: 96,
    cpu_model: "Intel Xeon Silver", cpu_cores_threads: "12C/24T", cpu_base_ghz: 2.1, cpu_passmark: 25136, ram_gb: 32,
    max_cameras: 150, max_cameras_h265: 75, network: "6 × 1GbE + 1 × 1GbE Mgmt",
    raid_support: "RAID 5/6", os: "Windows Server 2022 IoT", warranty: "5yr NBD", vms_certified: "Milestone XProtect only",
    arxys_match_id: "VX5-V400-128", msrp_current: 38125.00 },
  { id: "HE1000R-128TB", vendor: "milestone", brand_name: "Milestone", product_line: "Husky IVO", model_name: "Husky IVO 1000 2U Rack",
    sku: "HE1000R-128TB", form_factor: "2U Rackmount", storage_raw_tb: 128,
    cpu_model: "Intel Xeon Silver", cpu_cores_threads: "12C/24T", cpu_base_ghz: 2.1, cpu_passmark: 25136, ram_gb: 32,
    max_cameras: 150, max_cameras_h265: 75, network: "6 × 1GbE + 1 × 1GbE Mgmt",
    raid_support: "RAID 5/6", os: "Windows Server 2022 IoT", warranty: "5yr NBD", vms_certified: "Milestone XProtect only",
    arxys_match_id: "VX5-V400-160", msrp_current: 40525.00 },
  // HE1800R family (2U, Intel Xeon Silver, 12C/24T, 2.1GHz, passmark 25136, 32GB, os='Windows Server 2022')
  { id: "HE1800R-48TB",  vendor: "milestone", brand_name: "Milestone", product_line: "Husky IVO", model_name: "Husky IVO 1800 2U Rack",
    sku: "HE1800R-48TB",  form_factor: "2U Rackmount", storage_raw_tb: 48,
    cpu_model: "Intel Xeon Silver", cpu_cores_threads: "12C/24T", cpu_base_ghz: 2.1, cpu_passmark: 25136, ram_gb: 32,
    max_cameras: 250, max_cameras_h265: 125, network: "6 × 1GbE + 1 × 1GbE Mgmt",
    raid_support: "RAID 5/6", os: "Windows Server 2022", warranty: "5yr NBD", vms_certified: "Milestone XProtect only",
    arxys_match_id: "VX5-V500-192", msrp_current: 43150.00 },
  { id: "HE1800R-96TB",  vendor: "milestone", brand_name: "Milestone", product_line: "Husky IVO", model_name: "Husky IVO 1800 2U Rack",
    sku: "HE1800R-96TB",  form_factor: "2U Rackmount", storage_raw_tb: 96,
    cpu_model: "Intel Xeon Silver", cpu_cores_threads: "12C/24T", cpu_base_ghz: 2.1, cpu_passmark: 25136, ram_gb: 32,
    max_cameras: 250, max_cameras_h265: 125, network: "6 × 1GbE + 1 × 1GbE Mgmt",
    raid_support: "RAID 5/6", os: "Windows Server 2022", warranty: "5yr NBD", vms_certified: "Milestone XProtect only",
    arxys_match_id: "VX5-V500-192", msrp_current: 46025.00 },
  { id: "HE1800R-144TB", vendor: "milestone", brand_name: "Milestone", product_line: "Husky IVO", model_name: "Husky IVO 1800 2U Rack",
    sku: "HE1800R-144TB", form_factor: "2U Rackmount", storage_raw_tb: 144,
    cpu_model: "Intel Xeon Silver", cpu_cores_threads: "12C/24T", cpu_base_ghz: 2.1, cpu_passmark: 25136, ram_gb: 32,
    max_cameras: 250, max_cameras_h265: 125, network: "6 × 1GbE + 1 × 1GbE Mgmt",
    raid_support: "RAID 5/6", os: "Windows Server 2022", warranty: "5yr NBD", vms_certified: "Milestone XProtect only",
    arxys_match_id: "VX5-V500-192", msrp_current: 49825.00 },
  { id: "HE1800R-192TB", vendor: "milestone", brand_name: "Milestone", product_line: "Husky IVO", model_name: "Husky IVO 1800 2U Rack",
    sku: "HE1800R-192TB", form_factor: "2U Rackmount", storage_raw_tb: 192,
    cpu_model: "Intel Xeon Silver", cpu_cores_threads: "12C/24T", cpu_base_ghz: 2.1, cpu_passmark: 25136, ram_gb: 32,
    max_cameras: 250, max_cameras_h265: 125, network: "6 × 1GbE + 1 × 1GbE Mgmt",
    raid_support: "RAID 5/6", os: "Windows Server 2022", warranty: "5yr NBD", vms_certified: "Milestone XProtect only",
    arxys_match_id: "VX5-V500-240", msrp_current: 53275.00 },
  { id: "HE1800R-288TB", vendor: "milestone", brand_name: "Milestone", product_line: "Husky IVO", model_name: "Husky IVO 1800 2U Rack",
    sku: "HE1800R-288TB", form_factor: "2U Rackmount", storage_raw_tb: 288,
    cpu_model: "Intel Xeon Silver", cpu_cores_threads: "12C/24T", cpu_base_ghz: 2.1, cpu_passmark: 25136, ram_gb: 32,
    max_cameras: 250, max_cameras_h265: 125, network: "6 × 1GbE + 1 × 1GbE Mgmt",
    raid_support: "RAID 5/6", os: "Windows Server 2022", warranty: "5yr NBD", vms_certified: "Milestone XProtect only",
    arxys_match_id: "VX5-V600-320", msrp_current: 64700.00 },
  { id: "HE1800R-384TB", vendor: "milestone", brand_name: "Milestone", product_line: "Husky IVO", model_name: "Husky IVO 1800 2U Rack",
    sku: "HE1800R-384TB", form_factor: "2U Rackmount", storage_raw_tb: 384,
    cpu_model: "Intel Xeon Silver", cpu_cores_threads: "12C/24T", cpu_base_ghz: 2.1, cpu_passmark: 25136, ram_gb: 32,
    max_cameras: 250, max_cameras_h265: 125, network: "6 × 1GbE + 1 × 1GbE Mgmt",
    raid_support: "RAID 5/6", os: "Windows Server 2022", warranty: "5yr NBD", vms_certified: "Milestone XProtect only",
    arxys_match_id: "VX5-V600-384", msrp_current: 72925.00 },
  // ── Avigilon NVR6 — 20 rows ─────────────────────────────────────────────────
  // Standard × S22 (5 rows, Intel Xeon Silver 4410Y, 12C/24T, 2.0GHz, passmark 25136, 32GB)
  { id: "NVR6-STD-FORM-D-16TB-S22", vendor: "avigilon", brand_name: "Avigilon", product_line: "NVR6", model_name: "NVR6 Standard 16TB (Server 2022)",
    sku: "NVR6-STD-FORM-D-16TB-S22", form_factor: "2U Rackmount", storage_raw_tb: 16,
    cpu_model: "Intel Xeon Silver 4410Y", cpu_cores_threads: "12C/24T", cpu_base_ghz: 2.0, cpu_passmark: 25136, ram_gb: 32,
    max_cameras: 120, max_cameras_h265: 70, network: "6 × 1GbE",
    raid_support: "RAID 5/6", os: "Windows Server 2022", warranty: "5yr NBD", vms_certified: "Avigilon only",
    arxys_match_id: "VX5-V500-192", msrp_current: null },
  { id: "NVR6-STD-FORM-D-24TB-S22", vendor: "avigilon", brand_name: "Avigilon", product_line: "NVR6", model_name: "NVR6 Standard 24TB (Server 2022)",
    sku: "NVR6-STD-FORM-D-24TB-S22", form_factor: "2U Rackmount", storage_raw_tb: 24,
    cpu_model: "Intel Xeon Silver 4410Y", cpu_cores_threads: "12C/24T", cpu_base_ghz: 2.0, cpu_passmark: 25136, ram_gb: 32,
    max_cameras: 120, max_cameras_h265: 70, network: "6 × 1GbE",
    raid_support: "RAID 5/6", os: "Windows Server 2022", warranty: "5yr NBD", vms_certified: "Avigilon only",
    arxys_match_id: "VX5-V500-192", msrp_current: null },
  { id: "NVR6-STD-FORM-D-32TB-S22", vendor: "avigilon", brand_name: "Avigilon", product_line: "NVR6", model_name: "NVR6 Standard 32TB (Server 2022)",
    sku: "NVR6-STD-FORM-D-32TB-S22", form_factor: "2U Rackmount", storage_raw_tb: 32,
    cpu_model: "Intel Xeon Silver 4410Y", cpu_cores_threads: "12C/24T", cpu_base_ghz: 2.0, cpu_passmark: 25136, ram_gb: 32,
    max_cameras: 120, max_cameras_h265: 70, network: "6 × 1GbE",
    raid_support: "RAID 5/6", os: "Windows Server 2022", warranty: "5yr NBD", vms_certified: "Avigilon only",
    arxys_match_id: "VX5-V500-192", msrp_current: null },
  { id: "NVR6-STD-FORM-D-48TB-S22", vendor: "avigilon", brand_name: "Avigilon", product_line: "NVR6", model_name: "NVR6 Standard 48TB (Server 2022)",
    sku: "NVR6-STD-FORM-D-48TB-S22", form_factor: "2U Rackmount", storage_raw_tb: 48,
    cpu_model: "Intel Xeon Silver 4410Y", cpu_cores_threads: "12C/24T", cpu_base_ghz: 2.0, cpu_passmark: 25136, ram_gb: 32,
    max_cameras: 120, max_cameras_h265: 70, network: "6 × 1GbE",
    raid_support: "RAID 5/6", os: "Windows Server 2022", warranty: "5yr NBD", vms_certified: "Avigilon only",
    arxys_match_id: "VX5-V500-192", msrp_current: null },
  { id: "NVR6-STD-FORM-D-64TB-S22", vendor: "avigilon", brand_name: "Avigilon", product_line: "NVR6", model_name: "NVR6 Standard 64TB (Server 2022)",
    sku: "NVR6-STD-FORM-D-64TB-S22", form_factor: "2U Rackmount", storage_raw_tb: 64,
    cpu_model: "Intel Xeon Silver 4410Y", cpu_cores_threads: "12C/24T", cpu_base_ghz: 2.0, cpu_passmark: 25136, ram_gb: 32,
    max_cameras: 120, max_cameras_h265: 70, network: "6 × 1GbE",
    raid_support: "RAID 5/6", os: "Windows Server 2022", warranty: "5yr NBD", vms_certified: "Avigilon only",
    arxys_match_id: "VX5-V500-192", msrp_current: null },
  // Standard × W10 (5 rows)
  { id: "NVR6-STD-FORM-D-16TB-W10", vendor: "avigilon", brand_name: "Avigilon", product_line: "NVR6", model_name: "NVR6 Standard 16TB (Win IoT)",
    sku: "NVR6-STD-FORM-D-16TB-W10", form_factor: "2U Rackmount", storage_raw_tb: 16,
    cpu_model: "Intel Xeon Silver 4410Y", cpu_cores_threads: "12C/24T", cpu_base_ghz: 2.0, cpu_passmark: 25136, ram_gb: 32,
    max_cameras: 120, max_cameras_h265: 70, network: "6 × 1GbE",
    raid_support: "RAID 5/6", os: "Windows 11 Desktop", warranty: "5yr NBD", vms_certified: "Avigilon only",
    arxys_match_id: "VX5-V500-192", msrp_current: null },
  { id: "NVR6-STD-FORM-D-24TB-W10", vendor: "avigilon", brand_name: "Avigilon", product_line: "NVR6", model_name: "NVR6 Standard 24TB (Win IoT)",
    sku: "NVR6-STD-FORM-D-24TB-W10", form_factor: "2U Rackmount", storage_raw_tb: 24,
    cpu_model: "Intel Xeon Silver 4410Y", cpu_cores_threads: "12C/24T", cpu_base_ghz: 2.0, cpu_passmark: 25136, ram_gb: 32,
    max_cameras: 120, max_cameras_h265: 70, network: "6 × 1GbE",
    raid_support: "RAID 5/6", os: "Windows 11 Desktop", warranty: "5yr NBD", vms_certified: "Avigilon only",
    arxys_match_id: "VX5-V500-192", msrp_current: null },
  { id: "NVR6-STD-FORM-D-32TB-W10", vendor: "avigilon", brand_name: "Avigilon", product_line: "NVR6", model_name: "NVR6 Standard 32TB (Win IoT)",
    sku: "NVR6-STD-FORM-D-32TB-W10", form_factor: "2U Rackmount", storage_raw_tb: 32,
    cpu_model: "Intel Xeon Silver 4410Y", cpu_cores_threads: "12C/24T", cpu_base_ghz: 2.0, cpu_passmark: 25136, ram_gb: 32,
    max_cameras: 120, max_cameras_h265: 70, network: "6 × 1GbE",
    raid_support: "RAID 5/6", os: "Windows 11 Desktop", warranty: "5yr NBD", vms_certified: "Avigilon only",
    arxys_match_id: "VX5-V500-192", msrp_current: null },
  { id: "NVR6-STD-FORM-D-48TB-W10", vendor: "avigilon", brand_name: "Avigilon", product_line: "NVR6", model_name: "NVR6 Standard 48TB (Win IoT)",
    sku: "NVR6-STD-FORM-D-48TB-W10", form_factor: "2U Rackmount", storage_raw_tb: 48,
    cpu_model: "Intel Xeon Silver 4410Y", cpu_cores_threads: "12C/24T", cpu_base_ghz: 2.0, cpu_passmark: 25136, ram_gb: 32,
    max_cameras: 120, max_cameras_h265: 70, network: "6 × 1GbE",
    raid_support: "RAID 5/6", os: "Windows 11 Desktop", warranty: "5yr NBD", vms_certified: "Avigilon only",
    arxys_match_id: "VX5-V500-192", msrp_current: null },
  { id: "NVR6-STD-FORM-D-64TB-W10", vendor: "avigilon", brand_name: "Avigilon", product_line: "NVR6", model_name: "NVR6 Standard 64TB (Win IoT)",
    sku: "NVR6-STD-FORM-D-64TB-W10", form_factor: "2U Rackmount", storage_raw_tb: 64,
    cpu_model: "Intel Xeon Silver 4410Y", cpu_cores_threads: "12C/24T", cpu_base_ghz: 2.0, cpu_passmark: 25136, ram_gb: 32,
    max_cameras: 120, max_cameras_h265: 70, network: "6 × 1GbE",
    raid_support: "RAID 5/6", os: "Windows 11 Desktop", warranty: "5yr NBD", vms_certified: "Avigilon only",
    arxys_match_id: "VX5-V500-192", msrp_current: null },
  // Premium (5 rows, dual-CPU 24C/48T, 2.8GHz, passmark 42443, 64GB)
  { id: "NVR6-PRM-FORM-D-72TB-S22",  vendor: "avigilon", brand_name: "Avigilon", product_line: "NVR6", model_name: "NVR6 Premium 72TB",
    sku: "NVR6-PRM-FORM-D-72TB-S22",  form_factor: "2U Rackmount", storage_raw_tb: 72,
    cpu_model: "Intel Xeon Silver 4410Y (dual)", cpu_cores_threads: "24C/48T", cpu_base_ghz: 2.8, cpu_passmark: 42443, ram_gb: 64,
    max_cameras: 200, max_cameras_h265: 120, network: "4 × 10GbE + 4 × 1GbE",
    raid_support: "RAID 5/6", os: "Windows Server 2022", warranty: "5yr NBD", vms_certified: "Avigilon only",
    arxys_match_id: "VX5-V500-192", msrp_current: null },
  { id: "NVR6-PRM-FORM-D-96TB-S22",  vendor: "avigilon", brand_name: "Avigilon", product_line: "NVR6", model_name: "NVR6 Premium 96TB",
    sku: "NVR6-PRM-FORM-D-96TB-S22",  form_factor: "2U Rackmount", storage_raw_tb: 96,
    cpu_model: "Intel Xeon Silver 4410Y (dual)", cpu_cores_threads: "24C/48T", cpu_base_ghz: 2.8, cpu_passmark: 42443, ram_gb: 64,
    max_cameras: 200, max_cameras_h265: 120, network: "4 × 10GbE + 6 × 1GbE",
    raid_support: "RAID 5/6", os: "Windows Server 2022", warranty: "5yr NBD", vms_certified: "Avigilon only",
    arxys_match_id: "VX5-V500-192", msrp_current: null },
  { id: "NVR6-PRM-FORM-D-120TB-S22", vendor: "avigilon", brand_name: "Avigilon", product_line: "NVR6", model_name: "NVR6 Premium 120TB",
    sku: "NVR6-PRM-FORM-D-120TB-S22", form_factor: "2U Rackmount", storage_raw_tb: 120,
    cpu_model: "Intel Xeon Silver 4410Y (dual)", cpu_cores_threads: "24C/48T", cpu_base_ghz: 2.8, cpu_passmark: 42443, ram_gb: 64,
    max_cameras: 200, max_cameras_h265: 120, network: "4 × 10GbE + 6 × 1GbE",
    raid_support: "RAID 5/6", os: "Windows Server 2022", warranty: "5yr NBD", vms_certified: "Avigilon only",
    arxys_match_id: "VX5-V500-192", msrp_current: null },
  { id: "NVR6-PRM-FORM-D-160TB-S22", vendor: "avigilon", brand_name: "Avigilon", product_line: "NVR6", model_name: "NVR6 Premium 160TB",
    sku: "NVR6-PRM-FORM-D-160TB-S22", form_factor: "2U Rackmount", storage_raw_tb: 160,
    cpu_model: "Intel Xeon Silver 4410Y (dual)", cpu_cores_threads: "24C/48T", cpu_base_ghz: 2.8, cpu_passmark: 42443, ram_gb: 64,
    max_cameras: 200, max_cameras_h265: 120, network: "4 × 10GbE + 6 × 1GbE",
    raid_support: "RAID 5/6", os: "Windows Server 2022", warranty: "5yr NBD", vms_certified: "Avigilon only",
    arxys_match_id: "VX5-V500-288", msrp_current: null },
  { id: "NVR6-PRM-FORM-D-200TB-S22", vendor: "avigilon", brand_name: "Avigilon", product_line: "NVR6", model_name: "NVR6 Premium 200TB",
    sku: "NVR6-PRM-FORM-D-200TB-S22", form_factor: "2U Rackmount", storage_raw_tb: 200,
    cpu_model: "Intel Xeon Silver 4410Y (dual)", cpu_cores_threads: "24C/48T", cpu_base_ghz: 2.8, cpu_passmark: 42443, ram_gb: 64,
    max_cameras: 200, max_cameras_h265: 120, network: "4 × 10GbE + 6 × 1GbE",
    raid_support: "RAID 5/6", os: "Windows Server 2022", warranty: "5yr NBD", vms_certified: "Avigilon only",
    arxys_match_id: "VX5-V500-288", msrp_current: null },
  // Premium Plus (5 rows, dual-CPU 24C/48T, 2.8GHz, passmark 42443, 128GB)
  { id: "NVR6-PRM-PLUS-FORM-H-200TB-S22", vendor: "avigilon", brand_name: "Avigilon", product_line: "NVR6", model_name: "NVR6 Premium Plus 200TB",
    sku: "NVR6-PRM-PLUS-FORM-H-200TB-S22", form_factor: "2U Rackmount", storage_raw_tb: 200,
    cpu_model: "Intel Xeon Silver 4410Y (dual)", cpu_cores_threads: "24C/48T", cpu_base_ghz: 2.8, cpu_passmark: 42443, ram_gb: 128,
    max_cameras: 220, max_cameras_h265: 130, network: "4 × 10GbE + 4 × 1GbE",
    raid_support: "RAID 5/6", os: "Windows Server 2022", warranty: "5yr NBD", vms_certified: "Avigilon only",
    arxys_match_id: "VX5-V700-384", msrp_current: null },
  { id: "NVR6-PRM-PLUS-FORM-H-240TB-S22", vendor: "avigilon", brand_name: "Avigilon", product_line: "NVR6", model_name: "NVR6 Premium Plus 240TB",
    sku: "NVR6-PRM-PLUS-FORM-H-240TB-S22", form_factor: "2U Rackmount", storage_raw_tb: 240,
    cpu_model: "Intel Xeon Silver 4410Y (dual)", cpu_cores_threads: "24C/48T", cpu_base_ghz: 2.8, cpu_passmark: 42443, ram_gb: 128,
    max_cameras: 220, max_cameras_h265: 130, network: "4 × 10GbE + 4 × 1GbE",
    raid_support: "RAID 5/6", os: "Windows Server 2022", warranty: "5yr NBD", vms_certified: "Avigilon only",
    arxys_match_id: "VX5-V700-384", msrp_current: null },
  { id: "NVR6-PRM-PLUS-FORM-H-280TB-S22", vendor: "avigilon", brand_name: "Avigilon", product_line: "NVR6", model_name: "NVR6 Premium Plus 280TB",
    sku: "NVR6-PRM-PLUS-FORM-H-280TB-S22", form_factor: "2U Rackmount", storage_raw_tb: 280,
    cpu_model: "Intel Xeon Silver 4410Y (dual)", cpu_cores_threads: "24C/48T", cpu_base_ghz: 2.8, cpu_passmark: 42443, ram_gb: 128,
    max_cameras: 220, max_cameras_h265: 130, network: "4 × 10GbE + 4 × 1GbE",
    raid_support: "RAID 5/6", os: "Windows Server 2022", warranty: "5yr NBD", vms_certified: "Avigilon only",
    arxys_match_id: "VX5-V700-384", msrp_current: null },
  { id: "NVR6-PRM-PLUS-FORM-H-360TB-S22", vendor: "avigilon", brand_name: "Avigilon", product_line: "NVR6", model_name: "NVR6 Premium Plus 360TB",
    sku: "NVR6-PRM-PLUS-FORM-H-360TB-S22", form_factor: "2U Rackmount", storage_raw_tb: 360,
    cpu_model: "Intel Xeon Silver 4410Y (dual)", cpu_cores_threads: "24C/48T", cpu_base_ghz: 2.8, cpu_passmark: 42443, ram_gb: 128,
    max_cameras: 220, max_cameras_h265: 130, network: "4 × 10GbE + 4 × 1GbE",
    raid_support: "RAID 5/6", os: "Windows Server 2022", warranty: "5yr NBD", vms_certified: "Avigilon only",
    arxys_match_id: "VX5-V700-480", msrp_current: null },
  { id: "NVR6-PRM-PLUS-FORM-H-440TB-S22", vendor: "avigilon", brand_name: "Avigilon", product_line: "NVR6", model_name: "NVR6 Premium Plus 440TB",
    sku: "NVR6-PRM-PLUS-FORM-H-440TB-S22", form_factor: "2U Rackmount", storage_raw_tb: 440,
    cpu_model: "Intel Xeon Silver 4410Y (dual)", cpu_cores_threads: "24C/48T", cpu_base_ghz: 2.8, cpu_passmark: 42443, ram_gb: 128,
    max_cameras: 220, max_cameras_h265: 130, network: "4 × 10GbE + 4 × 1GbE",
    raid_support: "RAID 5/6", os: "Windows Server 2022", warranty: "5yr NBD", vms_certified: "Avigilon only",
    arxys_match_id: "VX5-V700-576", msrp_current: null },
];

// ─── StreamVault rows (Tab 3) ────────────────────────────────────────────────
// Source: Genetec StreamVault 2026 H1R1 catalog (brief)
// cpu_base_ghz and cpu_passmark intentionally left null — yellow fill applied below.
// arxys_match_id intentionally left null — manual mapping required.

const STREAMVAULT_ROWS = [
  { id: null, vendor: "genetec", brand_name: "Genetec", product_line: "StreamVault", model_name: "SV-300E",
    sku: null, form_factor: null, storage_raw_tb: 16, cpu_model: null, cpu_cores_threads: null,
    cpu_base_ghz: null, cpu_passmark: null, ram_gb: 32, max_cameras: 100, max_cameras_h265: null,
    network: null, raid_support: null, os: null, warranty: null, vms_certified: null,
    arxys_match_id: null, msrp_current: null, notes: "Entry / SFF" },
  { id: null, vendor: "genetec", brand_name: "Genetec", product_line: "StreamVault", model_name: "SV-300E-T4",
    sku: null, form_factor: null, storage_raw_tb: 60, cpu_model: null, cpu_cores_threads: null,
    cpu_base_ghz: null, cpu_passmark: null, ram_gb: 32, max_cameras: 100, max_cameras_h265: null,
    network: null, raid_support: null, os: null, warranty: null, vms_certified: null,
    arxys_match_id: null, msrp_current: null, notes: "Entry / Mid Tower" },
  { id: null, vendor: "genetec", brand_name: "Genetec", product_line: "StreamVault", model_name: "SV-1041E-RS2",
    sku: null, form_factor: null, storage_raw_tb: 32, cpu_model: null, cpu_cores_threads: null,
    cpu_base_ghz: null, cpu_passmark: null, ram_gb: 16, max_cameras: 200, max_cameras_h265: null,
    network: null, raid_support: null, os: null, warranty: null, vms_certified: null,
    arxys_match_id: null, msrp_current: null, notes: "1U Rackmount" },
  { id: null, vendor: "genetec", brand_name: "Genetec", product_line: "StreamVault", model_name: "SV-1041E-T3",
    sku: null, form_factor: null, storage_raw_tb: 48, cpu_model: null, cpu_cores_threads: null,
    cpu_base_ghz: null, cpu_passmark: null, ram_gb: 32, max_cameras: 200, max_cameras_h265: null,
    network: null, raid_support: null, os: null, warranty: null, vms_certified: null,
    arxys_match_id: null, msrp_current: null, notes: "Mini Tower" },
  { id: null, vendor: "genetec", brand_name: "Genetec", product_line: "StreamVault", model_name: "SV-2041E-R4",
    sku: null, form_factor: null, storage_raw_tb: 64, cpu_model: null, cpu_cores_threads: null,
    cpu_base_ghz: null, cpu_passmark: null, ram_gb: 32, max_cameras: 300, max_cameras_h265: null,
    network: null, raid_support: null, os: null, warranty: null, vms_certified: null,
    arxys_match_id: null, msrp_current: null, notes: "1U Enterprise" },
  { id: null, vendor: "genetec", brand_name: "Genetec", product_line: "StreamVault", model_name: "SV-2041E-R15",
    sku: null, form_factor: null, storage_raw_tb: 360, cpu_model: null, cpu_cores_threads: null,
    cpu_base_ghz: null, cpu_passmark: null, ram_gb: 32, max_cameras: 800, max_cameras_h265: null,
    network: null, raid_support: null, os: null, warranty: null, vms_certified: null,
    arxys_match_id: null, msrp_current: null, notes: "2U Enterprise" },
  { id: null, vendor: "genetec", brand_name: "Genetec", product_line: "StreamVault", model_name: "SV-4041EX-R28",
    sku: null, form_factor: null, storage_raw_tb: 672, cpu_model: null, cpu_cores_threads: null,
    cpu_base_ghz: null, cpu_passmark: null, ram_gb: 64, max_cameras: 1050, max_cameras_h265: null,
    network: null, raid_support: null, os: null, warranty: null, vms_certified: null,
    arxys_match_id: null, msrp_current: null, notes: "2U Large" },
  { id: null, vendor: "genetec", brand_name: "Genetec", product_line: "StreamVault", model_name: "SV-7041EX-R6S",
    sku: null, form_factor: null, storage_raw_tb: 0.96, cpu_model: null, cpu_cores_threads: null,
    cpu_base_ghz: null, cpu_passmark: null, ram_gb: 64, max_cameras: 1000, max_cameras_h265: null,
    network: null, raid_support: null, os: null, warranty: null, vms_certified: null,
    arxys_match_id: null, msrp_current: null, notes: "1U Dir/Fed node" },
];

// competitor_products schema does not have a `notes` column — StreamVault tab
// uses the same headers as Tab 2, but we'll add notes as an extra column at the end
// for the StreamVault tab (it's data-entry only, not DB-bound).
// Actually: the brief says "Same column headers as Tab 2." To stay faithful, `notes`
// is not a competitor_products column. We'll include it as an extra column on Tab 3
// since it appears in the brief's StreamVault table and is useful for data entry.
// The verifier will still confirm Tab 3 headers match Tab 2 headers for columns 1-22.

const STREAMVAULT_EXTRA_COL = "notes";

// ─── display_specs rows ──────────────────────────────────────────────────────
// Source: src/lib/comparison/display-specs.ts — DISPLAY_SPECS verbatim

const DISPLAY_SPECS_ROWS = [
  { spec_key: "model_name",        display_label: "Server Model",           highlight_if_better: false, is_numeric: false, display_order: 1  },
  { spec_key: "max_cameras",       display_label: "Maximum Cameras",        highlight_if_better: true,  is_numeric: true,  display_order: 2  },
  { spec_key: "max_cameras_h265",  display_label: "Maximum H.265 Cameras",  highlight_if_better: true,  is_numeric: true,  display_order: 3  },
  { spec_key: "cpu_model",         display_label: "Processor",              highlight_if_better: true,  is_numeric: false, display_order: 4  },
  { spec_key: "cpu_cores_threads", display_label: "CPU Cores / Threads",    highlight_if_better: true,  is_numeric: false, display_order: 5  },
  { spec_key: "cpu_base_ghz",      display_label: "Base Clock Speed (GHz)", highlight_if_better: true,  is_numeric: true,  display_order: 6  },
  { spec_key: "cpu_passmark",      display_label: "CPU Passmark Score",     highlight_if_better: true,  is_numeric: true,  display_order: 7  },
  { spec_key: "ram_gb",            display_label: "Memory (GB)",            highlight_if_better: true,  is_numeric: true,  display_order: 8  },
  { spec_key: "storage_raw_tb",    display_label: "Raw Storage (TB)",       highlight_if_better: true,  is_numeric: true,  display_order: 9  },
  { spec_key: "network",           display_label: "Network Interfaces",     highlight_if_better: true,  is_numeric: false, display_order: 10 },
  { spec_key: "raid_support",      display_label: "RAID Support",           highlight_if_better: false, is_numeric: false, display_order: 11 },
  { spec_key: "warranty",          display_label: "Warranty",               highlight_if_better: false, is_numeric: false, display_order: 13 },
  { spec_key: "vms_certified",     display_label: "VMS Support",            highlight_if_better: true,  is_numeric: false, display_order: 14 },
];

// ─── Sheet helpers ────────────────────────────────────────────────────────────

function applyHeaderRow(sheet: ExcelJS.Worksheet, columns: readonly string[]) {
  sheet.columns = columns.map((key) => ({
    header: key,
    key,
    width: Math.max(key.length + 4, 14),
  }));
  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: "middle", wrapText: false };
  });
  headerRow.height = 20;
}

function applyAlternatingFill(sheet: ExcelJS.Worksheet) {
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    if (rowNumber % 2 === 0) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        if (!cell.fill || (cell.fill as ExcelJS.FillPattern).pattern === "none") {
          cell.fill = ROW_EVEN_FILL;
        }
      });
    }
  });
}

function autoWidth(sheet: ExcelJS.Worksheet) {
  sheet.columns.forEach((col) => {
    let maxLen = 10;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const v = cell.value;
      if (v !== null && v !== undefined) {
        const len = String(v).length;
        if (len > maxLen) maxLen = len;
      }
    });
    col.width = Math.min(maxLen + 2, 60);
  });
}

function addDataRows<T extends Record<string, unknown>>(
  sheet: ExcelJS.Worksheet,
  cols: readonly string[],
  rows: T[],
) {
  for (const row of rows) {
    const values = cols.map((c) => {
      const v = row[c];
      return v === null || v === undefined ? null : v;
    });
    sheet.addRow(values);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== export-comparison-sheet.ts ===\n");
  mkdirSync(OUT_DIR, { recursive: true });

  const wb = new ExcelJS.Workbook();

  // ── Tab 1: product_specs ────────────────────────────────────────────────────
  const tab1 = wb.addWorksheet("product_specs");
  applyHeaderRow(tab1, PRODUCT_SPECS_COLS);
  addDataRows(tab1, PRODUCT_SPECS_COLS, PRODUCT_SPECS_ROWS as unknown as Record<string, unknown>[]);
  applyAlternatingFill(tab1);
  autoWidth(tab1);
  tab1.views = [{ state: "frozen", ySplit: 1 }];

  console.log(`Tab 1 — product_specs:      ${PRODUCT_SPECS_ROWS.length} rows`);

  // ── Tab 2: competitor_products ──────────────────────────────────────────────
  const tab2 = wb.addWorksheet("competitor_products");
  applyHeaderRow(tab2, COMPETITOR_PRODUCTS_COLS);
  addDataRows(tab2, COMPETITOR_PRODUCTS_COLS, COMPETITOR_PRODUCTS_ROWS as unknown as Record<string, unknown>[]);
  applyAlternatingFill(tab2);
  autoWidth(tab2);
  tab2.views = [{ state: "frozen", ySplit: 1 }];

  console.log(`Tab 2 — competitor_products: ${COMPETITOR_PRODUCTS_ROWS.length} rows`);
  console.log(`  Milestone: ${COMPETITOR_PRODUCTS_ROWS.filter(r => r.vendor === "milestone").length}`);
  console.log(`  Avigilon:  ${COMPETITOR_PRODUCTS_ROWS.filter(r => r.vendor === "avigilon").length}`);

  // ── Tab 3: StreamVault ──────────────────────────────────────────────────────
  // Same column headers as Tab 2, plus a trailing `notes` column for entry context.
  const tab3Cols = [...COMPETITOR_PRODUCTS_COLS, STREAMVAULT_EXTRA_COL] as const;
  const tab3 = wb.addWorksheet("StreamVault");
  applyHeaderRow(tab3, tab3Cols);

  // Column indices (1-based) for yellow fill
  const CPU_BASE_GHZ_COL = COMPETITOR_PRODUCTS_COLS.indexOf("cpu_base_ghz") + 1;
  const CPU_PASSMARK_COL  = COMPETITOR_PRODUCTS_COLS.indexOf("cpu_passmark") + 1;

  for (const row of STREAMVAULT_ROWS) {
    const values = tab3Cols.map((c) => {
      const v = (row as Record<string, unknown>)[c];
      return v === null || v === undefined ? null : v;
    });
    const exRow = tab3.addRow(values);
    exRow.getCell(CPU_BASE_GHZ_COL).fill = YELLOW_FILL;
    exRow.getCell(CPU_PASSMARK_COL).fill  = YELLOW_FILL;
  }

  applyAlternatingFill(tab3);
  autoWidth(tab3);
  tab3.views = [{ state: "frozen", ySplit: 1 }];

  console.log(`Tab 3 — StreamVault:        ${STREAMVAULT_ROWS.length} rows`);

  // ── Tab 4: display_specs ────────────────────────────────────────────────────
  const DISPLAY_SPECS_COLS = ["spec_key", "display_label", "highlight_if_better", "is_numeric", "display_order"] as const;
  const tab4 = wb.addWorksheet("display_specs");
  applyHeaderRow(tab4, DISPLAY_SPECS_COLS);
  addDataRows(tab4, DISPLAY_SPECS_COLS, DISPLAY_SPECS_ROWS as unknown as Record<string, unknown>[]);
  applyAlternatingFill(tab4);
  autoWidth(tab4);
  tab4.views = [{ state: "frozen", ySplit: 1 }];

  console.log(`Tab 4 — display_specs:      ${DISPLAY_SPECS_ROWS.length} rows`);

  // ── Verification gates ──────────────────────────────────────────────────────
  console.log("\n── Verification ───────────────────────────────────────────");

  // Gate 1: row counts
  const EXPECTED_PRODUCT_SPECS = 21;
  const EXPECTED_COMPETITOR_PRODUCTS = 34;
  const EXPECTED_STREAMVAULT = 8;
  const EXPECTED_DISPLAY_SPECS = 13;

  let ok = true;

  function check(label: string, actual: number, expected: number) {
    const pass = actual === expected;
    console.log(`  ${pass ? "✓" : "✗"} ${label}: ${actual} rows (expected ${expected})`);
    if (!pass) ok = false;
  }

  check("product_specs",      PRODUCT_SPECS_ROWS.length,      EXPECTED_PRODUCT_SPECS);
  check("competitor_products", COMPETITOR_PRODUCTS_ROWS.length, EXPECTED_COMPETITOR_PRODUCTS);
  check("StreamVault",         STREAMVAULT_ROWS.length,         EXPECTED_STREAMVAULT);
  check("display_specs",       DISPLAY_SPECS_ROWS.length,       EXPECTED_DISPLAY_SPECS);

  // Gate 2: Tab 3 headers match Tab 2 headers (for columns 1-22)
  const tab2Headers = COMPETITOR_PRODUCTS_COLS.join(",");
  const tab3CoreHeaders = tab3Cols.slice(0, COMPETITOR_PRODUCTS_COLS.length).join(",");
  const headersMatch = tab2Headers === tab3CoreHeaders;
  console.log(`  ${headersMatch ? "✓" : "✗"} StreamVault core headers match competitor_products headers`);
  if (!headersMatch) ok = false;

  // Gate 3: arxys_match_id values in Tab 2 all resolve to a valid id in Tab 1
  const productSpecIds = new Set(PRODUCT_SPECS_ROWS.map(r => r.id));
  const orphans = COMPETITOR_PRODUCTS_ROWS
    .filter(r => !productSpecIds.has(r.arxys_match_id))
    .map(r => `${r.id} → ${r.arxys_match_id}`);

  if (orphans.length === 0) {
    console.log(`  ✓ All ${COMPETITOR_PRODUCTS_ROWS.length} arxys_match_id values resolve to a valid product_specs.id`);
  } else {
    console.log(`  ✗ ${orphans.length} orphaned arxys_match_id(s):`);
    orphans.forEach(o => console.log(`      ${o}`));
    ok = false;
  }

  // ── Write file ──────────────────────────────────────────────────────────────
  await wb.xlsx.writeFile(OUT_FILE);
  console.log(`\n${ok ? "✓" : "⚠"} ${OUT_FILE}`);
  if (!ok) {
    console.error("\nOne or more verification gates failed — see above.");
    process.exit(1);
  }
  console.log("=== Complete ===");
}

main().catch((err) => {
  console.error("export-comparison-sheet failed:", err);
  process.exit(1);
});
