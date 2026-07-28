import { pipedriveClient, PipedriveError } from "./client";
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
import { GB_PER_TB, type RecommendationResult } from "@/lib/recommend/types";

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
  ExacqVision: 40,
  Other: 18,
};

// CODEC (text field in Pipedrive — NOT an enum/set, so send human-readable
// labels rather than option IDs; sending option IDs causes Pipedrive to
// display the raw number instead of the codec name).
const CODEC_LABELS: Record<string, string> = {
  h265: "H.265",
  h264: "H.264",
  smart: "Smart",
};

// Scene Complexity (text field in Pipedrive — same caveat as CODEC_LABELS).
// Ordered low → med → high so multi-group lists print in severity order.
const COMPLEXITY_LABELS: Record<string, string> = {
  low: "Low",
  med: "Medium",
  high: "High",
};
const COMPLEXITY_ORDER = ["low", "med", "high"] as const;

// Recording labels (text field in Pipedrive — same caveat as CODEC_LABELS; send
// human-readable strings, not option IDs, or Pipedrive shows the raw number).
const RECORDING_LABEL_CONTINUOUS = "24 Hour Continuous";
const RECORDING_LABEL_ON_MOTION = "Record Only On Motion";

// One camera group as it matters to the deal's per-stream fields. The
// calculator form accepts multiple groups; rather than collapse to a single
// "primary" group (which hid the other groups' values), we aggregate ACROSS
// all groups onto each Pipedrive field — see buildDealFields.
export type DealGroup = {
  resolutionLabel: string;
  codec: string;
  complexity: string;
  fps: number;
  recordingPercent: number;
  motionPercent: number;
  cameras: number;
};

export type DealSubmissionInput = {
  submissionId: string;
  // Submission date as YYYY-MM-DD (local), supplied by the caller so the deal
  // title and the PDF filename share one date.
  submissionDate: string;
  projectName: string | null;
  vms: string | null;
  retentionDays: number;
  totals: { cameras: number; bandwidthMbps: number; storageGb: number };
  groups: DealGroup[];
  addOnFailoverRecorder?: boolean;
  addOnManagementServer?: boolean;
};

// Strip characters illegal in filenames / deal titles and collapse whitespace.
// Mirrors the sanitizeFilenamePart helper in project-quote/render.ts.
function sanitizeTitlePart(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Distinct values, sorted ascending, comma-separated — the human-readable
// list format for the free-text per-stream fields when groups differ.
function distinctSortedNumberList(values: number[]): string {
  return Array.from(new Set(values))
    .sort((a, b) => a - b)
    .join(", ");
}

// "1080p Full HD (1920×1080)" → 2 (megapixels). Forces every resolution label
// to a uniform MP number so the deal lists "2MP, 4MP, 8MP" rather than mixed
// marketing labels + pixel dimensions. Parses the (W×H) suffix every label
// carries; rounds w·h/1e6, floored at 1MP so sub-megapixel modes don't show 0.
function resolutionLabelToMp(label: string): number {
  const m = label.match(/\((\d+)[×x](\d+)\)/);
  if (!m) return 1;
  return Math.max(1, Math.round((Number(m[1]) * Number(m[2])) / 1_000_000));
}

export type DealPartnerInput = {
  companyName: string;
  // contactName/email are optional for a free-typed on-behalf target (Phase 7
  // Step 1): a company that isn't a portal partner yet has no person to attach,
  // so the deal is created against the organization only. When both are
  // present (self-serve, or an on-behalf target matched to a real partner) the
  // person is upserted and linked as normal.
  contactName?: string | null;
  email?: string | null;
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
  const totalStorageTb = (submission.totals.storageGb / GB_PER_TB).toFixed(2);
  const groups = submission.groups;

  const payload: Record<string, string | number | undefined> = {
    value: winner.totalCostUsd,
    [customFieldKeys["arxys_submission_id"]]: submission.submissionId,
    [customFieldKeys["arxys_total_cameras"]]: submission.totals.cameras,
    [customFieldKeys["arxys_bandwidth_mbps"]]: Number(submission.totals.bandwidthMbps.toFixed(2)),
    // Intentional discrepancy: Pipedrive receives a rounded whole-TB figure for
    // human readability. This will NOT exactly equal storage_tb (two decimals on
    // the row) or the PDF figure. Do not "reconcile" by switching to the precise
    // value — the rounding is deliberate for sales readability.
    [customFieldKeys["arxys_storage_gb"]]: Math.round(submission.totals.storageGb / GB_PER_TB),
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

  // Recording (text field in Pipedrive — not an enum/set, so send human-readable
  // labels). Any group below 100% duty cycle flips the whole deal to On Motion;
  // all-continuous stays Continuous.
  const anyMotion = groups.some((g) => g.recordingPercent < 100);
  set("Recording New", anyMotion ? RECORDING_LABEL_ON_MOTION : RECORDING_LABEL_CONTINUOUS);

  // Free-text per-stream fields: list every distinct value across groups,
  // sorted ascending, rather than surfacing just one group's value.
  set("Motion Activity Est. %", distinctSortedNumberList(groups.map((g) => g.motionPercent)));
  set("Frame Rate", distinctSortedNumberList(groups.map((g) => g.fps)));

  // Resolution → uniform MP, distinct, sorted ascending, e.g. "2MP, 4MP, 8MP".
  const mpList = Array.from(new Set(groups.map((g) => resolutionLabelToMp(g.resolutionLabel))))
    .sort((a, b) => a - b)
    .map((mp) => `${mp}MP`)
    .join(", ");
  set("Resolution", mpList);

  set("Retention Days", String(submission.retentionDays));

  // CODEC (single-select enum): can hold only one option, so send the codec
  // used by the most cameras across all groups. Ties resolve to first-seen.
  const camerasByCodec = new Map<string, number>();
  for (const g of groups) {
    camerasByCodec.set(g.codec, (camerasByCodec.get(g.codec) ?? 0) + g.cameras);
  }
  let dominantCodec: string | undefined;
  let dominantCameras = -1;
  for (const g of groups) {
    const total = camerasByCodec.get(g.codec) ?? 0;
    if (total > dominantCameras) {
      dominantCameras = total;
      dominantCodec = g.codec;
    }
  }
  // CODEC: text label (not option ID — Pipedrive field is text type).
  const codecLabel = dominantCodec ? CODEC_LABELS[dominantCodec] : undefined;
  if (codecLabel) set("CODEC New", codecLabel);

  set("Total Storage", `${totalStorageTb} TB`);

  // Scene Complexity: distinct tiers present across groups, in severity order,
  // comma-separated human-readable labels (text field, not a set/enum).
  const complexityLabels = COMPLEXITY_ORDER
    .filter((k) => groups.some((g) => g.complexity === k))
    .map((k) => COMPLEXITY_LABELS[k]);
  if (complexityLabels.length) set("Complexity Scene-Motion", complexityLabels.join(", "));

  // Recording hours: same label as Recording New (both are text fields).
  set("Recording hours", anyMotion ? RECORDING_LABEL_ON_MOTION : RECORDING_LABEL_CONTINUOUS);
  set("Recommended Server", recommendedModels);

  return payload;
}

export async function createDealFromSubmission(
  submission: DealSubmissionInput,
  recommendation: RecommendationResult,
  partner: DealPartnerInput,
  // Phase 7 Step 1 — when the calc was run on behalf of a partner, this pinned
  // note credits the internal rep (we don't route the Pipedrive owner field;
  // see ADR 0048). Omitted for normal self-serve deals.
  onBehalfNote?: string | null,
): Promise<{ dealId: number }> {
  const [pipelineId, ownerId, customFieldKeys, calcFieldKeys] = await Promise.all([
    resolvePipelineId(),
    resolveOwnerId(),
    ensureCustomFields(),
    resolveCalculatorFieldKeys(),
  ]);
  const stageId = await resolveStageId(pipelineId);

  const orgId = await upsertOrganization({ name: partner.companyName });
  // A free-typed on-behalf target has no email to match/create a person on —
  // creating a placeholder would pollute Pipedrive, so we attach the org only.
  const personId =
    partner.email && partner.contactName
      ? await upsertPerson({
          name: partner.contactName,
          email: partner.email,
          orgId,
        })
      : undefined;

  const title = [
    "Arxys Quote",
    sanitizeTitlePart(partner.companyName) || "Unknown Company",
    sanitizeTitlePart(submission.projectName?.trim() || "Untitled Project"),
    submission.submissionDate,
  ].join(" - ");

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

  // On-behalf attribution note. Failure must not block the deal.
  if (onBehalfNote) {
    try {
      await pipedriveClient.createNote({
        deal_id: deal.id,
        content: onBehalfNote,
        pinned_to_deal_flag: 1,
      });
    } catch (err) {
      console.error("pipedrive on-behalf note creation failed", err);
    }
  }

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

// Is this error Pipedrive telling us the target deal can no longer be edited,
// so the only way forward is a fresh deal?
//
// Two distinct shapes mean the same thing, and BOTH must be handled:
//   * 404 — the deal id is unknown (hard-gone, or never existed).
//   * 400 with code ERR_DEAL_DELETED — the deal was DELETED in Pipedrive.
//     Pipedrive soft-deletes: a deleted deal still resolves on GET (200, with
//     deleted: true), so it never 404s, but any edit is rejected with
//     "Entity is deleted. You must first restore it before you can edit".
//
// The 400 case is the common one in practice and was previously unhandled: the
// revision path re-threw it into a swallow-and-log catch, so revising a quote
// whose deal had been deleted left the new submission with NO deal at all and
// no error surfaced. Deleting redundant deals is routine during duplicate
// cleanup, which made this reproduce on essentially every revise of a
// previously-cleaned-up project (see ADR 0093).
export function isDealUneditableError(err: unknown): boolean {
  if (!(err instanceof PipedriveError)) return false;
  if (err.status === 404) return true;
  const code = (err.body as { code?: unknown } | null | undefined)?.code;
  return code === "ERR_DEAL_DELETED";
}

// Is this error Pipedrive refusing to write `value` because the deal has
// products attached?
//
// Once a deal has line items, Pipedrive treats their sum as the authoritative
// deal value and rejects any PUT carrying `value` with
// 400 "Cannot update deal value, the deal has products attached to it."
// The rejection takes the ENTIRE payload down with it, so a revision also loses
// its arxys_* custom fields and portal URL — not just the price.
//
// This is the normal state of a worked deal, not an edge case: the Project
// Quote path reads a deal's line items, so any deal that's had a quote
// generated is in exactly this condition. Before this was handled, the 400 fell
// past isDealUneditableError() into the callers' swallow-and-log catch, leaving
// every such revision with pipedrive_deal_id = null while reporting success.
//
// Unlike ERR_DEAL_DELETED this response carries no `code`, only the
// human-readable `error` string, so match on status plus wording rather than an
// exact string — Pipedrive has reworded it before.
export function isDealValueLockedError(err: unknown): boolean {
  if (!(err instanceof PipedriveError)) return false;
  if (err.status !== 400) return false;
  return /deal value/i.test(err.message) && /products?/i.test(err.message);
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
): Promise<{ dealId: number; valueUpdateSkipped: boolean }> {
  const [customFieldKeys, calcFieldKeys] = await Promise.all([
    ensureCustomFields(),
    resolveCalculatorFieldKeys(),
  ]);

  const fields = buildDealFields(submission, recommendation, {
    customFieldKeys,
    calcFieldKeys,
  });

  // A deal with products attached rejects `value` — and rejects the whole
  // payload with it (see isDealValueLockedError). Retry without `value` so the
  // calculator fields and portal URL still land; the note below flags the price
  // we could NOT write so sales reconcile the line items by hand rather than
  // trusting a stale figure. We do NOT touch the line items ourselves: sales
  // routinely hand-tune quantities, discounts, and extra SKUs on a worked deal,
  // and silently overwriting that is worse than a stale value.
  let valueUpdateSkipped = false;
  try {
    await pipedriveClient.updateDeal(dealId, fields);
  } catch (err) {
    if (!isDealValueLockedError(err)) throw err;
    const { value: _value, ...fieldsWithoutValue } = fields;
    await pipedriveClient.updateDeal(dealId, fieldsWithoutValue);
    valueUpdateSkipped = true;
    console.warn("pipedrive deal value locked by attached products — updated all other fields", {
      dealId,
      submissionId: submission.submissionId,
    });
  }

  // Revision marker note. Failure must not fail the revision. Add-on status is
  // folded in so sales see the current toggles if they changed in the revision.
  const revisedOn = new Date().toISOString().slice(0, 10);
  const winner = recommendation.winner;
  const lines = [
    `Revised from portal on ${revisedOn}. ` +
      `Add-ons — Failover recorder: ${submission.addOnFailoverRecorder ? "Yes" : "No"} · ` +
      `Management server: ${submission.addOnManagementServer ? "Yes" : "No"}`,
  ];
  if (valueUpdateSkipped) {
    lines.push(
      `ACTION NEEDED — deal value and products were NOT updated. This deal has products attached, ` +
        `so Pipedrive keeps its value locked to the line items and rejects any value we send. ` +
        `This revision sizes to ${winner.units} × ${winner.productGroup} at ` +
        `$${winner.totalCostUsd.toLocaleString("en-US")}. Please review the line items against that figure — ` +
        `the value shown on this deal is from the previous revision.`,
    );
  }
  try {
    await pipedriveClient.createNote({
      deal_id: dealId,
      content: lines.join("\n\n"),
      pinned_to_deal_flag: 1,
    });
  } catch (err) {
    console.error("pipedrive revision note creation failed", err);
  }

  return { dealId, valueUpdateSkipped };
}

// ---------------------------------------------------------------------------
// Phase 5 Step 3 — Comparison deal creation.
//
// Distinguishable from sizing deals by: title prefix "Comparison:" and a
// pinned note containing lead_source="comparison_tool". Does NOT use
// buildDealFields() (which is calculator-specific — requires a
// RecommendationResult). Uses the same pipeline + stage as sizing deals.
// ---------------------------------------------------------------------------

export type ComparisonDealInput = {
  vendorName: string;
  vendorModelName: string;
  arxysModelId: string;
  arxysMsrp: number;
  serverCount: number;
  partner: DealPartnerInput;
};

export async function createComparisonDeal(
  input: ComparisonDealInput,
): Promise<{ dealId: number }> {
  const [pipelineId, ownerId] = await Promise.all([
    resolvePipelineId(),
    resolveOwnerId(),
  ]);
  const stageId = await resolveStageId(pipelineId);

  const orgId = await upsertOrganization({ name: input.partner.companyName });
  const personId =
    input.partner.email && input.partner.contactName
      ? await upsertPerson({
          name: input.partner.contactName,
          email: input.partner.email,
          orgId,
        })
      : undefined;

  const title = `Comparison: ${input.vendorName} ${input.vendorModelName} vs Arxys — ${input.partner.companyName}`;
  const value = input.arxysMsrp * input.serverCount;

  const deal = await pipedriveClient.createDeal({
    title,
    value,
    currency: "USD",
    user_id: ownerId,
    person_id: personId,
    org_id: orgId,
    pipeline_id: pipelineId,
    stage_id: stageId,
  });

  try {
    await pipedriveClient.createNote({
      deal_id: deal.id,
      content: [
        `lead_source: comparison_tool`,
        `Competitor model: ${input.vendorName} ${input.vendorModelName}`,
        `Arxys match: ${input.arxysModelId}`,
        `Server count: ${input.serverCount}`,
        `Arxys MSRP: $${input.arxysMsrp.toLocaleString("en-US")}`,
        `Deal value (MSRP × count): $${value.toLocaleString("en-US")}`,
      ].join("\n"),
      pinned_to_deal_flag: 1,
    });
  } catch (err) {
    console.error("comparison deal note creation failed", err);
  }

  return { dealId: deal.id };
}
