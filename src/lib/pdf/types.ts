// View model for the submission PDF. Built by callers (Server Action /
// Route Handler) from a submission row + its joins, then handed to
// renderSubmissionPdfBuffer. The renderer is pure: it only knows about
// this shape, never about Supabase or the legacy schema.

export type SubmissionPdfGroup = {
  name: string;
  cameras: number;
  resolutionLabel: string;
  codec: string;
  fps: number;
  complexity: string;
  hoursPerDay: number;
  motionPercent: number;
  bandwidthMbps: number;
  storageGb: number;
};

export type SubmissionPdfInput = {
  generatedAt: Date;
  submissionId: string;
  partner: {
    companyName: string;
    contactName: string;
    email: string;
  };
  projectName: string | null;
  vms: string | null;
  retentionDays: number;
  totals: {
    cameras: number;
    bandwidthMbps: number;
    storageGb: number;
  };
  groups: SubmissionPdfGroup[];
  storageTb: number;
  bandwidthMbps: number;
  recommendation: {
    units: number;
    modelCode: string;
    productDescription: string;
    coveredCameras: number;
    coveredStorageTb: number;
    warnings: string[];
  };
  // Resolved hardware spec for the recommended server, joined from
  // product_specs (id = recommended_product_id). null for legacy submissions
  // whose recommended_product_id no longer resolves. QuickCompare columns are
  // nullable (Phase 6 migration) — the template renders "—" for any null.
  serverSpec: SubmissionPdfServerSpec | null;
  // Base64 PNG data URIs, loaded server-side from public/. null when the asset
  // is missing; the template falls back to text.
  logoDataUri: string | null;
  heroDataUri: string | null;
};

export type SubmissionPdfServerSpec = {
  sku: string;
  modelName: string; // "VideoX V500"
  formFactor: string | null;
  maxCameras: number | null;
  maxBandwidthMbps: number | null;
  driveBays: number | null;
  cpuModelFull: string | null;
  ramSpec: string | null;
  osEdition: string | null;
  warranty: string;
  msrp: number | null;
  // Per-unit usable capacity (TB) computed from storage_raw_tb + RAID config.
  usablePerUnitTb: number | null;
};
