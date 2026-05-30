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
};

export type CompetitorProduct = {
  id: string;
  vendor: "milestone" | "avigilon";
  brand_name: string;
  product_line: string;
  model_name: string;
  sku: string;
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
  | "vms_certified";

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
