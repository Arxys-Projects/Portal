import { pipedriveClient } from "./client";
import { upsertOrganization, upsertPerson } from "./contacts";
import {
  ensureCustomFields,
  resolveCalculatorFieldKeys,
  resolveOwnerId,
  resolvePipelineId,
  resolveStageId,
  type CalculatorFieldName,
  type CustomFieldKeyMap,
} from "./lookups";
import type { RecommendationResult } from "@/lib/recommend/types";

const PORTAL_BASE = "https://portal-arxys.vercel.app";

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
  addOnFailoverRecorder?: boolean;
  addOnManagementServer?: boolean;
};

export type DealPartnerInput = {
  companyName: string;
  contactName: string;
  email: string;
};

type ResolvedFieldKeys = {
  customFieldKeys: CustomFieldKeyMap;
  calcFieldKeys: Partial<Record<CalculatorFieldName, string>>;
};

// Builds the calculator-derived portion of a deal payload: the deal `value`,
// the six arxys_* custom fields (incl. portal URL), and the admin-curated
// calculator fields. Deliberately emits NO routing/ownership/contact fields
// (title, currency, user_id, person_id, org_id, pipeline_id, stage_id) — those
// are create-only. The revision update path (Phase 4 Step 3) reuses this output
// verbatim so a revision can never disturb a deal's stage, owner, or pipeline.
function buildDealFields(
  submission: DealSubmissionInput,
  recommendation: RecommendationResult,
  { customFieldKeys, calcFieldKeys }: ResolvedFieldKeys,
): Record<string, string | number | undefined> {
  const winner = recommendation.winner;
  // Phase 2 Step 4 (Q5a): the Pipedrive `arxys_recommended_models` and the
  // admin-curated `Recommended Server` fields stay family-friendly even after
  // the SKU-PK migration. Derive "N × V800" from the winner's productGroup
  // rather than its full SKU. Sales reading the deal card cares about the
  // V-family, not the storage tier (that's a configuration detail to confirm
  // during the sales conversation). The persisted SKU lives on
  // submissions.recommended_product_id for downstream tooling.
  const recommendedModels = `${winner.units} × ${winner.productGroup}`;
  const totalStorageTb = (submission.totals.storageGb / 1000).toFixed(2);
  const recordingHours = Math.round((submission.primaryGroup.recordingPercent / 100) * 24);

  const payload: Record<string, string | number | undefined> = {
    value: winner.totalCostUsd,
    [customFieldKeys["arxys_submission_id"]]: submission.submissionId,
    [customFieldKeys["arxys_total_cameras"]]: submission.totals.cameras,
    [customFieldKeys["arxys_bandwidth_mbps"]]: Number(submission.totals.bandwidthMbps.toFixed(2)),
    [customFieldKeys["arxys_storage_gb"]]: Number(submission.totals.storageGb.toFixed(2)),
    [customFieldKeys["arxys_recommended_models"]]: recommendedModels,
    [customFieldKeys["arxys_portal_url"]]: `${PORTAL_BASE}/submissions/${submission.submissionId}`,
  };

  // Calculator-matching admin fields. Each only set if the field still
  // resolves by name in Pipedrive — a rename in the admin UI silently skips
  // that field rather than blocking the whole deal write.
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

  return payload;
}

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

  const title =
    submission.projectName?.trim() ||
    `${partner.companyName} — submission ${submission.submissionId}`;

  // Calculator-derived fields + the create-only routing/ownership/contact set.
  const payload: Record<string, string | number | undefined> = {
    ...buildDealFields(submission, recommendation, { customFieldKeys, calcFieldKeys }),
    title,
    currency: "USD",
    user_id: ownerId,
    person_id: personId,
    org_id: orgId,
    pipeline_id: pipelineId,
    stage_id: stageId,
  };

  const deal = await pipedriveClient.createDeal(payload as Parameters<typeof pipedriveClient.createDeal>[0]);

  // Post an add-ons note if either toggle is on. Failure must not block the deal. (Phase 4 Step 2)
  if (submission.addOnFailoverRecorder || submission.addOnManagementServer) {
    try {
      await pipedriveClient.createNote({
        deal_id: deal.id,
        content:
          `Add-ons requested — Failover recorder: ${submission.addOnFailoverRecorder ? "Yes" : "No"} · ` +
          `Management server: ${submission.addOnManagementServer ? "Yes" : "No"}`,
        pinned_to_deal_flag: 1,
      });
    } catch (err) {
      console.error("pipedrive add-on note creation failed", err);
    }
  }

  return { dealId: deal.id };
}

// Phase 4 Step 3 — non-destructive revision update.
//
// Updates an EXISTING deal in place from a new revision submission. It writes
// ONLY the calculator-derived fields (value + arxys_* + admin calculator
// fields) via buildDealFields, then posts a "revised from portal" note. It
// deliberately does NOT resolve or send pipeline_id / stage_id / user_id, and
// does NOT upsert the person/organization — a revision must never disturb the
// deal's stage, owner, pipeline, or linked contacts that sales may have changed
// since the deal was created. The PUT carries exactly buildDealFields()'s
// output, so prohibited routing fields are architecturally impossible to send.
export async function updateDealFromRevision(
  dealId: number,
  submission: DealSubmissionInput,
  recommendation: RecommendationResult,
): Promise<{ dealId: number }> {
  const [customFieldKeys, calcFieldKeys] = await Promise.all([
    ensureCustomFields(),
    resolveCalculatorFieldKeys(),
  ]);

  const fields = buildDealFields(submission, recommendation, {
    customFieldKeys,
    calcFieldKeys,
  });

  await pipedriveClient.updateDeal(dealId, fields);

  // Revision marker note. Failure must not fail the revision. Add-on status is
  // folded in so sales see the current toggles if they changed in the revision.
  const revisedOn = new Date().toISOString().slice(0, 10);
  try {
    await pipedriveClient.createNote({
      deal_id: dealId,
      content:
        `Revised from portal on ${revisedOn}. ` +
        `Add-ons — Failover recorder: ${submission.addOnFailoverRecorder ? "Yes" : "No"} · ` +
        `Management server: ${submission.addOnManagementServer ? "Yes" : "No"}`,
      pinned_to_deal_flag: 1,
    });
  } catch (err) {
    console.error("pipedrive revision note creation failed", err);
  }

  return { dealId };
}
