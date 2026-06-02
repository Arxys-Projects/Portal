// VideoX QuickCompare — model-family-level view assembled from product_specs.
// One QuickCompareModel per V5 family (V100…V800). See ADR 0044.

export type QuickCompareModel = {
  modelFamily: string; // 'V100', 'V200', … (derived from product_specs.id)

  // Overview
  maxCameras: number;
  maxBandwidthMbps: number | null;
  rackUnits: string | null;
  driveBays: number | null;
  warranty: string;

  // System
  osEdition: string | null;
  ramSpec: string | null;
  cpuModelFull: string | null;
  cpuTurboGhz: string | null;
  coresThreads: string | null;
  cpuCache: string | null;
  memBandwidth: string | null;
  avx512: string | null;
  workloadAffinity: string | null;
  chipletArch: string | null;
  infinityGuard: string | null;
  hotswapPower: string | null;

  // Storage
  hddCount: number | null;
  hddMtbf: string | null;
  raidLevelDisplay: string | null;
  batteryRaid: string | null;
  osSsdType: string | null;
  osRedundancy: string | null;

  // Networking
  gbe1Ports: number | null;
  gbe10Ports: number | null;
  sfpAddon: string | null;
  avigilonGpu: string | null;
};

// A spec is keyed by the QuickCompareModel field it renders. `integer` fields
// are formatted as locale numbers; everything else is shown verbatim.
export type QuickCompareFieldKey = Exclude<keyof QuickCompareModel, "modelFamily">;

export type QuickCompareSection = "overview" | "system" | "storage" | "networking";

export type QuickCompareSpec = {
  key: QuickCompareFieldKey;
  label: string;
  section: QuickCompareSection;
  type: "text" | "integer";
  tooltip?: string;
};
