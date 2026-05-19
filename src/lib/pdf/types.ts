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
  recommendation: {
    units: number;
    modelCode: string;
    productDescription: string;
    coveredCameras: number;
    coveredStorageTb: number;
    warnings: string[];
  };
};
