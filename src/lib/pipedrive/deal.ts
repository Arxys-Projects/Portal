import { pipedriveClient } from "./client";
import { upsertOrganization, upsertPerson } from "./contacts";
import {
  ensureCustomFields,
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

export type DealSubmissionInput = {
  submissionId: string;
  projectName: string | null;
  totals: { cameras: number; bandwidthMbps: number; storageGb: number };
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
  const [pipelineId, ownerId, customFieldKeys] = await Promise.all([
    resolvePipelineId(),
    resolveOwnerId(),
    ensureCustomFields(),
  ]);
  const stageId = await resolveStageId(pipelineId);

  const orgId = await upsertOrganization({ name: partner.companyName });
  const personId = await upsertPerson({
    name: partner.contactName,
    email: partner.email,
    orgId,
  });

  const winner = recommendation.winner;
  const recommendedModels = `${winner.units} × ${winner.modelCode}`;
  const title =
    submission.projectName?.trim() ||
    `${partner.companyName} — submission ${submission.submissionId}`;

  const payload = {
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

  const deal = await pipedriveClient.createDeal(payload);

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
