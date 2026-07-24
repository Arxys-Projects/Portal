// ADR 0093 step 3 — rebuild Pipedrive deal inputs from a STORED submission row.
//
// `submitCalculation` builds its deal payload from live in-memory calculator
// state. A relink runs long after that state is gone, so this reconstructs the
// same two inputs from the persisted columns alone. Kept free of `server-only`
// and of any Supabase import so it is directly unit-testable.
//
// Deliberately NOT reusing loadSubmissionPdfInput: that produces the PDF's
// shape (partner block, hero image, covered-capacity lines), not the deal's,
// and coupling the CRM payload to the document renderer would mean a PDF layout
// change could silently alter what sales sees in Pipedrive.

import type { DealGroup, DealSubmissionInput } from "./deal";
import { GB_PER_TB, type RecommendationResult } from "@/lib/recommend/types";

// The persisted columns a relink needs. Mirrors the `submissions` row.
export type RelinkSubmissionRow = {
  id: string;
  project_name: string | null;
  vms: string | null;
  retention_days: number;
  cameras_count: number;
  bandwidth_mbps: number | string;
  storage_tb: number | string;
  recommended_product_id: string | null;
  recommended_units: number;
  total_list_price_usd: number | string | null;
  created_at: string;
  groups_payload: unknown;
  input_state: unknown;
};

export type RelinkInputs = {
  submission: DealSubmissionInput;
  recommendation: RecommendationResult;
};

export type RelinkBuildResult =
  | { ok: true; inputs: RelinkInputs }
  | { ok: false; error: string };

function isUuidShaped(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// groups_payload is jsonb — treat every field as untrusted and coerce, rather
// than casting. A row written by an older INPUT_STATE_VERSION may be missing
// any of these.
function mapStoredGroups(payload: unknown): DealGroup[] {
  if (!payload || typeof payload !== "object") return [];
  const raw = (payload as { groups?: unknown }).groups;
  if (!Array.isArray(raw)) return [];
  const groups: DealGroup[] = [];
  for (const g of raw) {
    if (!g || typeof g !== "object") continue;
    const row = g as Record<string, unknown>;
    const cameras = Number(row.cameras);
    if (!Number.isFinite(cameras) || cameras <= 0) continue;
    groups.push({
      resolutionLabel: typeof row.resolutionLabel === "string" ? row.resolutionLabel : "",
      codec: typeof row.codec === "string" ? row.codec : "",
      complexity: typeof row.complexity === "string" ? row.complexity : "",
      fps: Number(row.fps) || 0,
      recordingPercent: Number(row.recordingPercent) || 100,
      // Constant recording banks motionPercent = 100 (see submitCalculation);
      // an absent value predates that normalization, so fall back to 100 rather
      // than 0, which would read as "no motion" and understate the deal.
      motionPercent: Number(row.motionPercent) || 100,
      cameras,
    });
  }
  return groups;
}

function readAddOn(inputState: unknown, key: string): boolean {
  if (!inputState || typeof inputState !== "object") return false;
  return (inputState as Record<string, unknown>)[key] === true;
}

/**
 * Rebuild the deal inputs for a submission that has no Pipedrive deal.
 *
 * @param row          the stored submission row
 * @param productGroup resolved V-family for `recommended_product_id` (e.g. "V800"),
 *                     looked up by the caller from current_products
 * @param productName  display name for the SKU, if known
 */
export function buildRelinkInputs(
  row: RelinkSubmissionRow,
  productGroup: string | null,
  productName: string | null,
): RelinkBuildResult {
  if (!row.recommended_product_id) {
    return { ok: false, error: "This submission has no recommended product, so no deal can be built from it." };
  }
  if (isUuidShaped(row.recommended_product_id)) {
    return {
      ok: false,
      error:
        "This is a pre-migration (legacy) submission — its recommended product no longer resolves, " +
        "so a deal can't be rebuilt automatically. Create the deal in Pipedrive by hand.",
    };
  }
  if (!productGroup) {
    return {
      ok: false,
      error: `Product ${row.recommended_product_id} was not found in the price book, so the deal value and model can't be rebuilt.`,
    };
  }
  const totalCostUsd = row.total_list_price_usd === null ? NaN : Number(row.total_list_price_usd);
  if (!Number.isFinite(totalCostUsd)) {
    return {
      ok: false,
      error: "This submission has no list price (pricing TBD), so there is no deal value to send.",
    };
  }

  const groups = mapStoredGroups(row.groups_payload);
  if (groups.length === 0) {
    return { ok: false, error: "This submission has no stored camera groups, so its deal fields can't be rebuilt." };
  }

  const units = Number(row.recommended_units) || 1;

  const submission: DealSubmissionInput = {
    submissionId: row.id,
    // The ORIGINAL submission date, not today — the deal title must match the
    // submission it represents (and the PDF filename for the same row).
    submissionDate: row.created_at.slice(0, 10),
    projectName: row.project_name,
    vms: row.vms,
    retentionDays: Number(row.retention_days),
    totals: {
      cameras: Number(row.cameras_count),
      bandwidthMbps: Number(row.bandwidth_mbps),
      // storage_tb is the persisted numeric(10,2); the original payload carried
      // full-precision GB. Round-tripping through TB loses sub-10-GB precision,
      // which only affects the deliberately-rounded whole-TB Pipedrive field.
      storageGb: Number(row.storage_tb) * GB_PER_TB,
    },
    groups,
    addOnFailoverRecorder: readAddOn(row.input_state, "addOnFailoverRecorder"),
    addOnManagementServer: readAddOn(row.input_state, "addOnManagementServer"),
  };

  // buildDealFields reads exactly three fields off the winner — units,
  // productGroup, totalCostUsd — for the deal value and the "N × V800" model
  // strings. The rest are reconstructed as faithfully as the row allows and are
  // not sent to Pipedrive; unitMsrp is derived, and the covered-capacity /
  // driver fields are not recoverable from the row at all.
  const recommendation: RecommendationResult = {
    winner: {
      sku: row.recommended_product_id,
      productGroup,
      productName: productName ?? row.recommended_product_id,
      units,
      unitMsrp: units > 0 ? totalCostUsd / units : totalCostUsd,
      totalCostUsd,
      coveredCameras: 0,
      coveredStorageTb: 0,
      driverDimension: "storage",
    },
    alternatives: [],
    warnings: [],
  };

  return { ok: true, inputs: { submission, recommendation } };
}
