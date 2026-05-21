import { pipedriveClient } from "./client";
import { upsertOrganization, upsertPerson } from "./contacts";
import {
  ensureCustomFields,
  resolveCalculatorFieldKeys,
  resolveOwnerId,
  resolvePipelineId,
  resolveStageId,
} from "./lookups";
import type { RecommendationResult } from "@/lib/recommend/types";

// Phase 1 placeholder URL — the submission-detail route doesn't exist yet.
// When it lands, swap this for a `/submissions/${id}` permalink and record
// the change in an ADR. See ADR 0019 + ADR 0020.
const PORTAL_URL_PLACEHOLDER = "https://portal-arxys.vercel.app/dashboard";

// Phase 1: Deal.value is 0 by design (ADR 0019). Surface the gap as a pinned
// note so anyone browsing Pipedrive understands why.
const PHASE_1_PLACEHOLDER_NOTE =
  "Phase 1 placeholder — real pricing in Phase 2 (see ADR 0019). Deal value = 0 by design.";

// ---------------------------------------------------------------------------
// Calculator → Pipedrive option-ID maps
//
// These map our calculator's enum values to the admin-curated Pipedrive option
// IDs on the matching fields. IDs are stable once created in Pipedrive; if an
// admin recreates an option they'll get a new ID and this map will need an
// update. Pulled from a live `/v1/dealFields` snapshot on 2026-05-19.
// ---------------------------------------------------------------------------

// VMS (set field) — calculator's VMS_OPTIONS → Pipedrive option ID.
// "Hanwha" → Wisenet (Hanwha rebranded its security line; Wisenet is the
// closest match in Pipedrive). Calculator "Other" maps to Pipedrive "Other".
const VMS_OPTION_IDS: Record<string, number> = {
  Milestone: 14,
  Genetec: 15,
  Avigilon: 16,
  Hanwha: 169,
  "NX Witness": 168,
  Other: 18,
};

// CODEC (enum) — calculator codec value → Pipedrive option ID.
const CODEC_OPTION_IDS: Record<string, number> = {
  h265: 139,
  h264: 138,
  smart: 286,
};

// Scene Complexity (set) — calculator complexity tier → Pipedrive option ID.
const COMPLEXITY_OPTION_IDS: Record<string, number> = {
  low: 287,
  med: 288,
  high: 289,
};

// Recording (enum). Pipedrive options: 118 "24 Hour Continuous", 119 "Record
// Only On Motion". Heuristic: 100% recording duty cycle → continuous, anything
// less → motion.
const RECORDING_CONTINUOUS_ID = 118;
const RECORDING_ON_MOTION_ID = 119;

export type DealSubmissionInput = {
  submissionId: string;
  projectName: string | null;
  vms: string | null;
  retentionDays: number;
  totals: { cameras: number; bandwidthMbps: number; storageGb: number };
  // Primary group = the camera group with the most cameras. The calculator
  // form accepts multiple groups; the Pipedrive Deal carries a single row, so
  // we surface the primary group's characteristics on the per-stream fields.
  primaryGroup: {
    resolutionLabel: string;
    codec: string;
    complexity: string;
    fps: number;
    recordingPercent: number;
    motionPercent: number;
  };
};

export type DealPartnerInput = {
  companyName: string;
  contactName: string;
  email: string;
};

export async function createDealFromSubmission(
  submission: DealSubmissionInput,
  recommendation: RecommendationResult,
  partner: DealPartnerInput,
): Promise<{ dealId: number }> {
  const [pipelineId, ownerId, customFieldKeys, calcFieldKeys] = await Promise.all([
    resolvePipelineId(),
    resolveOwnerId(),
    ensureCustomFields(),
    resolveCalculatorFieldKeys(),
  ]);
  const stageId = await resolveStageId(pipelineId);

  const orgId = await upsertOrganization({ name: partner.companyName });
  const personId = await upsertPerson({
    name: partner.contactName,
    email: partner.email,
    orgId,
  });

  const winner = recommendation.winner;
  // Phase 2 Step 4 (Q5a): the Pipedrive `arxys_recommended_models` and the
  // admin-curated `Recommended Server` fields stay family-friendly even after
  // the SKU-PK migration. Derive "N × V800" from the winner's productGroup
  // rather than its full SKU. Sales reading the deal card cares about the
  // V-family, not the storage tier (that's a configuration detail to confirm
  // during the sales conversation). The persisted SKU lives on
  // submissions.recommended_product_id for downstream tooling.
  const recommendedModels = `${winner.units} × ${winner.productGroup}`;
  const title =
    submission.projectName?.trim() ||
    `${partner.companyName} — submission ${submission.submissionId}`;

  const totalStorageTb = (submission.totals.storageGb / 1000).toFixed(2);
  const recordingHours = Math.round((submission.primaryGroup.recordingPercent / 100) * 24);

  // Base payload: deal-level + arxys_* custom fields.
  const payload: Record<string, string | number | undefined> = {
    title,
    value: 0,
    currency: "USD",
    user_id: ownerId,
    person_id: personId,
    org_id: orgId,
    pipeline_id: pipelineId,
    stage_id: stageId,
    [customFieldKeys["arxys_submission_id"]]: submission.submissionId,
    [customFieldKeys["arxys_total_cameras"]]: submission.totals.cameras,
    [customFieldKeys["arxys_bandwidth_mbps"]]: Number(submission.totals.bandwidthMbps.toFixed(2)),
    [customFieldKeys["arxys_storage_gb"]]: Number(submission.totals.storageGb.toFixed(2)),
    [customFieldKeys["arxys_recommended_models"]]: recommendedModels,
    [customFieldKeys["arxys_portal_url"]]: PORTAL_URL_PLACEHOLDER,
  };

  // Calculator-matching admin fields. Each only set if the field still
  // resolves by name in Pipedrive — a rename in the admin UI silently skips
  // that field rather than blocking the whole deal create.
  const set = (name: keyof typeof calcFieldKeys, value: string | number | undefined) => {
    if (value === undefined || value === "") return;
    const key = calcFieldKeys[name];
    if (key) payload[key] = value;
  };

  set("Project Name", submission.projectName ?? undefined);
  if (submission.vms) {
    const vmsId = VMS_OPTION_IDS[submission.vms];
    if (vmsId) set("VMS", vmsId);
  }
  set("Camera Streams", submission.totals.cameras);

  const recordingId =
    submission.primaryGroup.recordingPercent >= 100
      ? RECORDING_CONTINUOUS_ID
      : RECORDING_ON_MOTION_ID;
  set("Recording", recordingId);

  set("Motion Activity Est. %", String(submission.primaryGroup.motionPercent));
  set("Frame Rate", String(submission.primaryGroup.fps));
  set("Resolution", submission.primaryGroup.resolutionLabel);
  set("Retention Days", String(submission.retentionDays));

  const codecId = CODEC_OPTION_IDS[submission.primaryGroup.codec];
  if (codecId) set("CODEC", codecId);

  set("Total Storage", `${totalStorageTb} TB`);

  const complexityId = COMPLEXITY_OPTION_IDS[submission.primaryGroup.complexity];
  if (complexityId) set("Scene Complexity", complexityId);

  set("Recording hours", String(recordingHours));
  set("Recommended Server", recommendedModels);

  const deal = await pipedriveClient.createDeal(payload as Parameters<typeof pipedriveClient.createDeal>[0]);

  // Pin a placeholder note explaining the $0 value. Pipedrive Deals have no
  // top-level description; Notes are the canonical "free text on a deal"
  // surface. A note-creation failure here must not invalidate the deal — the
  // deal is already saved with the correct fields. Log and continue.
  try {
    await pipedriveClient.createNote({
      deal_id: deal.id,
      content: PHASE_1_PLACEHOLDER_NOTE,
      pinned_to_deal_flag: 1,
    });
  } catch (err) {
    console.error("pipedrive deal note creation failed", { dealId: deal.id, error: err });
  }

  return { dealId: deal.id };
}
