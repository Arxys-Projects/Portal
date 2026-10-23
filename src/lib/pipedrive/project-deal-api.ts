// Pipedrive v2 calls for portal-built project deals (Project Portal Step 5,
// ADR 0170). The only writer is src/lib/projects/project-deal.ts. Every call is
// v2 (the v1 deal and product endpoints are out of support since 2026-08-01).
//
// Shapes checked against the v2 reference (2026-10-23):
//   * POST /api/v2/deals takes `owner_id` (v1 said user_id) and custom fields
//     inside a `custom_fields` object keyed by the field's hashed code.
//   * POST /api/v2/deals/{id}/products requires product_id, item_price and
//     quantity. item_price has no default (the product's price is NOT used when
//     it is left out), so the portal always sends the product's own price.
//     `comments` is a free-text string; the line's role goes there.
//   * GET /api/v2/deals/{id}/products is cursor-paged, 500 at most per page.
//   * GET /api/v2/dealFields, /pipelines and /stages are cursor-paged lists.
//
// Pipeline and stage resolve by exact name on every call, uncached and apart
// from lookups.ts. Project deals go into the same "Project Pipeline" / "New
// Lead" the partner path uses (Andy, 2026-10-23: there is no separate project
// pipeline), but they never touch resolveStageId's cache, which holds one stage
// id whatever pipeline it is asked about.

import { listAllV2, postJsonV2 } from "./company-api";

export const PROJECT_PIPELINE_NAME = "Project Pipeline";
export const PROJECT_STAGE_NAME = "New Lead";
// Created once, by hand, in Step 5 Phase B. Deliberately NOT in CUSTOM_FIELDS
// (lookups.ts), which would create it on the partner path's next deal write.
export const PROJECT_ID_FIELD_NAME = "arxys_project_id";

// One deal line as GET /api/v2/deals/{id}/products returns it. Only the fields
// read here; the product code is not on the line (it lives on the product).
export type PdV2DealProduct = {
  id: number;
  product_id: number;
  item_price?: number | null;
  quantity?: number | null;
  comments?: string | null;
  sum?: number | null;
  name?: string | null;
  // Read by the Step 6 pricing gate and the Project Quote (ADR 0176). Names
  // from the v2 reference's request body (2026-10-23); the response is read
  // defensively until a live read confirms them.
  discount?: number | null;
  discount_type?: string | null;
  tax?: number | null;
  currency?: string | null;
  order_nr?: number | null;
};

type PdV2Pipeline = { id: number; name: string };
type PdV2Stage = { id: number; name: string; pipeline_id: number };
type PdV2DealField = { field_code?: string; key?: string; field_name?: string; name?: string };

export type ProjectDealRouting =
  | { ok: true; pipelineId: number; stageId: number }
  | { ok: false; reason: "no-pipeline" | "no-stage"; message: string };

export async function resolveProjectPipelineStage(token: string): Promise<ProjectDealRouting> {
  const pipelines = await listAllV2<PdV2Pipeline>(token, "/pipelines");
  const pipeline = pipelines.filter((p) => p.name === PROJECT_PIPELINE_NAME);
  if (pipeline.length !== 1) {
    return {
      ok: false,
      reason: "no-pipeline",
      message: `Pipedrive pipeline "${PROJECT_PIPELINE_NAME}" ${pipeline.length === 0 ? "was not found" : "exists more than once"}.`,
    };
  }
  const stages = await listAllV2<PdV2Stage>(token, "/stages", { pipeline_id: String(pipeline[0].id) });
  const stage = stages.filter((s) => s.name === PROJECT_STAGE_NAME && s.pipeline_id === pipeline[0].id);
  if (stage.length !== 1) {
    return {
      ok: false,
      reason: "no-stage",
      message: `Pipedrive stage "${PROJECT_STAGE_NAME}" ${stage.length === 0 ? "was not found" : "exists more than once"} in "${PROJECT_PIPELINE_NAME}".`,
    };
  }
  return { ok: true, pipelineId: pipeline[0].id, stageId: stage[0].id };
}

// The hashed code of a deal field, found by exact name, or null. v2 names the
// properties field_code / field_name; v1's key / name are read too, so a shape
// change cannot silently resolve nothing.
export async function findDealFieldCode(token: string, fieldName: string): Promise<string | null> {
  const fields = await listAllV2<PdV2DealField>(token, "/dealFields");
  const matches = fields.filter((f) => (f.field_name ?? f.name) === fieldName);
  if (matches.length !== 1) return null;
  return matches[0].field_code ?? matches[0].key ?? null;
}

export type CreateProjectDealBody = {
  title: string;
  owner_id: number;
  org_id: number;
  person_id: number;
  pipeline_id: number;
  stage_id: number;
  // Always "USD". There is no `value`: Pipedrive computes it from the lines.
  currency: "USD";
  custom_fields: Record<string, string>;
};

export async function createDealV2(token: string, body: CreateProjectDealBody): Promise<number> {
  const deal = await postJsonV2<{ id: number }>(token, "/deals", body);
  return deal.id;
}

export type AddDealProductBody = {
  product_id: number;
  item_price: number;
  quantity: number;
  comments: string;
};

// Returns the deal-product attachment id.
export async function addDealProductV2(token: string, dealId: number, body: AddDealProductBody): Promise<number> {
  const line = await postJsonV2<{ id: number }>(token, `/deals/${dealId}/products`, body);
  return line.id;
}

// Every page. `params` adds query parameters (the quote gate passes
// sort_by=order_nr so the PDF keeps the rep's order).
export function listDealProductsV2(token: string, dealId: number, params: Record<string, string> = {}): Promise<PdV2DealProduct[]> {
  return listAllV2<PdV2DealProduct>(token, `/deals/${dealId}/products`, params);
}
