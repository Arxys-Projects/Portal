import type { QuickCompareSection, QuickCompareSpec } from "./types";

// Section display order + labels. The default view renders these as grouped
// dividers in the table.
export const SECTIONS: { key: QuickCompareSection; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "system", label: "System" },
  { key: "storage", label: "Storage" },
  { key: "networking", label: "Networking" },
];

// Verbatim tooltip copy for the technical rows (Phase 6 Step 1 brief).
const TOOLTIPS: Record<string, string> = {
  workloadAffinity:
    "Hardware-level media streaming optimization that offloads video decode from the CPU, enabling higher camera counts with lower CPU utilization.",
  chipletArch:
    "AMD chiplet design where CPU cores, I/O, and cache are separate silicon dies. Enables higher yields, better thermals, and modular scalability.",
  infinityGuard:
    "AMD hardware security features including Secure Memory Encryption (SME), Secure Encrypted Virtualization (SEV), and Shadow Stack for firmware protection.",
  avx512:
    "512-bit wide vector processing instructions. Accelerates video analytics, transcoding, and encryption workloads with double the throughput of AVX2.",
  raidLevelDisplay:
    "RAID 5: single drive failure protection. RAID 6: dual drive failure protection. RAID 60: striped RAID 6 groups for high capacity with dual-failure protection per group.",
  batteryRaid:
    "Battery-backed write cache protects in-flight data during power loss. Cached writes are committed to disk when power returns, preventing data corruption.",
  osRedundancy:
    "Mirrored OS SSDs in a hot-swap carrier. If one SSD fails, the system continues running on the mirror with zero downtime. Failed drive is replaced without shutdown.",
  hotswapPower:
    "Dual redundant power supplies in hot-swap carriers. If one PSU fails, the other sustains full operation. Failed PSU is replaced without shutdown.",
  hddMtbf:
    "Mean Time Between Failures — the manufacturer's statistical reliability rating for enterprise-grade hard drives. 2.5 million hours ≈ 285 years continuous operation.",
  memBandwidth:
    "Maximum data transfer rate between CPU and RAM per socket. Higher bandwidth supports more simultaneous video streams without bottlenecking.",
  cpuTurboGhz:
    "Maximum clock speed when all CPU cores are under load simultaneously. Higher all-core turbo means more sustained throughput for parallel video workloads.",
};

// Row definitions, in display order within each section. The diff highlighter
// and camera filter both key off `key`.
export const QUICK_COMPARE_SPECS: QuickCompareSpec[] = [
  // Overview
  { key: "maxCameras", label: "Max Cameras (H.265/H.264)", section: "overview", type: "integer" },
  { key: "maxBandwidthMbps", label: "Max Bandwidth (Mbit/s)", section: "overview", type: "integer" },
  { key: "rackUnits", label: "Rack Units", section: "overview", type: "text" },
  { key: "driveBays", label: "Drive Bays", section: "overview", type: "integer" },
  { key: "warranty", label: "Warranty", section: "overview", type: "text" },

  // System
  { key: "cpuModelFull", label: "CPU", section: "system", type: "text" },
  { key: "coresThreads", label: "Cores / Threads", section: "system", type: "text" },
  { key: "cpuTurboGhz", label: "Max All-Core Turbo", section: "system", type: "text", tooltip: TOOLTIPS.cpuTurboGhz },
  { key: "cpuCache", label: "CPU Cache", section: "system", type: "text" },
  { key: "memBandwidth", label: "Per-Socket Memory Bandwidth", section: "system", type: "text", tooltip: TOOLTIPS.memBandwidth },
  { key: "ramSpec", label: "RAM", section: "system", type: "text" },
  { key: "osEdition", label: "Operating System", section: "system", type: "text" },
  { key: "avx512", label: "Native 512 AVX Datapath", section: "system", type: "text", tooltip: TOOLTIPS.avx512 },
  { key: "workloadAffinity", label: "Workload Affinity", section: "system", type: "text", tooltip: TOOLTIPS.workloadAffinity },
  { key: "chipletArch", label: "Chiplet Micro-Architecture", section: "system", type: "text", tooltip: TOOLTIPS.chipletArch },
  { key: "infinityGuard", label: "AMD Infinity Guard", section: "system", type: "text", tooltip: TOOLTIPS.infinityGuard },
  { key: "hotswapPower", label: "Hot-swap Redundant Power", section: "system", type: "text", tooltip: TOOLTIPS.hotswapPower },

  // Storage
  { key: "hddCount", label: "Quantity of HDDs", section: "storage", type: "integer" },
  { key: "hddMtbf", label: "HDD MTBF (Hours)", section: "storage", type: "text", tooltip: TOOLTIPS.hddMtbf },
  { key: "raidLevelDisplay", label: "RAID Level", section: "storage", type: "text", tooltip: TOOLTIPS.raidLevelDisplay },
  { key: "batteryRaid", label: "Battery-Backed RAID", section: "storage", type: "text", tooltip: TOOLTIPS.batteryRaid },
  { key: "osSsdType", label: "OS SSD Type", section: "storage", type: "text" },
  { key: "osRedundancy", label: "OS Redundancy", section: "storage", type: "text", tooltip: TOOLTIPS.osRedundancy },

  // Networking
  { key: "gbe1Ports", label: "1GbE Ports", section: "networking", type: "integer" },
  { key: "gbe10Ports", label: "10GbE Ports", section: "networking", type: "integer" },
  { key: "sfpAddon", label: "10GbE / 25GbE SFP+ Add-on", section: "networking", type: "text" },
  { key: "avigilonGpu", label: "Avigilon GPU", section: "networking", type: "text" },
];

export const FOOTNOTE =
  "Primary Camera counts based on: 4MP resolution, 15FPS, h.265, Record on motion with VMD, and is valid for Milestone, Avigilon, Genetec VMS. Other VMS performance will vary. Content and specs subject to change without notice.";
