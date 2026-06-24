export type ProductSpec = {
  id: string;
  model_name: string;
  form_factor: string;
  storage_raw_tb: number;
  cpu_model: string;
  cpu_cores_threads: string;
  cpu_base_ghz: number;
  cpu_passmark: number;
  ram_gb: number;
  max_cameras: number;
  max_cameras_h265: number;
  network: string;
  raid_support: string;
  os: string;
  warranty: string;
  vms_certified: string;
  msrp: number;
  notes: string | null;
  product_sku: string | null;
  // Competitor-only OEM platform column (see ADR 0073). Arxys rows leave this
  // null; included here so hw_platform is a key of both ProductSpec and
  // CompetitorProduct (SharedSpecKey requires keyof both).
  hw_platform?: string | null;
  // QuickCompare columns (Phase 6 Step 1 — see ADR 0044). All nullable; only
  // the /videox-compare tool reads these. The comparison/calculator tools
  // ignore them (DISPLAY_SPECS references only SharedSpecKey fields).
  rack_units?: string | null;
  drive_bays?: number | null;
  max_bandwidth_mbps?: number | null;
  os_edition?: string | null;
  ram_spec?: string | null;
  cpu_model_full?: string | null;
  cpu_turbo_ghz?: string | null;
  cores_threads?: string | null;
  cpu_cache?: string | null;
  mem_bandwidth?: string | null;
  avx_512?: string | null;
  workload_affinity?: string | null;
  chiplet_arch?: string | null;
  infinity_guard?: string | null;
  hotswap_power?: string | null;
  hdd_count?: number | null;
  hdd_mtbf?: string | null;
  raid_level_display?: string | null;
  battery_raid?: string | null;
  os_ssd_type?: string | null;
  os_redundancy?: string | null;
  gbe_1_ports?: number | null;
  gbe_10_ports?: number | null;
  sfp_addon?: string | null;
  avigilon_gpu?: string | null;
};

export type CompetitorProduct = {
  id: string;
  vendor: "milestone" | "avigilon" | "genetec";
  brand_name: string;
  product_line: string;
  model_name: string;
  sku: string;
  form_factor: string;
  hw_platform: string | null;
  storage_raw_tb: number;
  cpu_model: string;
  cpu_cores_threads: string;
  cpu_base_ghz: number;
  cpu_passmark: number;
  ram_gb: number;
  max_cameras: number;
  max_cameras_h265: number;
  network: string;
  raid_support: string;
  os: string;
  warranty: string;
  vms_certified: string;
  arxys_match_id: string;
  msrp_current: number | null;
};

// Spec keys shared between ProductSpec and CompetitorProduct that appear in
// the comparison table. Must be a keyof both types.
export type SharedSpecKey =
  | "model_name"
  | "max_cameras"
  | "max_cameras_h265"
  | "cpu_model"
  | "cpu_cores_threads"
  | "cpu_base_ghz"
  | "cpu_passmark"
  | "ram_gb"
  | "storage_raw_tb"
  | "network"
  | "raid_support"
  | "warranty"
  | "vms_certified"
  | "hw_platform";

// Numeric keys where higher = Arxys advantage (delta/percentage is meaningful).
export type NumericSpecKey = Extract<
  SharedSpecKey,
  | "max_cameras"
  | "max_cameras_h265"
  | "cpu_base_ghz"
  | "cpu_passmark"
  | "ram_gb"
  | "storage_raw_tb"
>;

export type DisplaySpec = {
  spec_key: SharedSpecKey;
  display_label: string;
  highlight_if_better: boolean;
  is_numeric: boolean;
  display_order: number;
};

export type ComparisonMessage = {
  message_key: string;
  message_text: string;
};
