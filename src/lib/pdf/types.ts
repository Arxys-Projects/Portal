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
  // Full descriptive scene label (e.g. "Medium detail, high motion"), banked
  // as complexityLabel since the 2026-06 six-level rework. Legacy rows that
  // stored only a tier word ("low"/"med"/"high") fall back to a coarse label
  // in render.ts.
  complexityLabel: string;
  // "constant" = continuous 24/7 recording; "motion" = event-triggered. Rows
  // that predate the Recording-mode field default to "constant" in render.ts.
  recordingMode: "constant" | "motion";
  hoursPerDay: number;
  motionPercent: number;
  // Event-peak network load for the group, decimal Mbit/s (ADR 0125).
  bandwidthMbps: number;
  // Required decimal RAID-net capacity for the group. On a calc_version 1 row
  // this is the old raw-video × 1.2 figure — banked, never recomputed.
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
  // Phase A of the calculator math rework (ADRs 0123–0128).
  //
  // `calcVersion` 1 = a submission sized before Phase A; 2 = sized after. On a
  // version-1 row the two fields below are null, because that model had no
  // user-visible buffer and never separated footage from capacity-to-buy. The
  // template must render them as not recorded rather than assuming the current
  // default — an old quote never promised a 90% cap.
  calcVersion: number;
  // Recorded footage in decimal TB, before the buffer and the binary charge.
  // The figure to set beside a Milestone or Genetec proposal.
  recordedStorageTb: number | null;
  // Max disk utilization the quote was sized at, 60–90 (ADR 0126).
  maxDiskUtilizationPct: number | null;
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
