import {
  PipedriveError,
  pipedriveClient,
  type PdDealField,
} from "./client";

// Name-resolved IDs for the entities Step 8 writes against. Each lookup runs
// once per process and caches its result; subsequent calls are free. The Step 8
// brief locks these names — hardcoded IDs would break the moment somebody
// renamed or recreated the entity in Pipedrive.

export const PIPELINE_NAME = "Project Pipeline";
export const STAGE_NAME = "New Lead";
export const OWNER_NAME = "Andy Newbom";

// Custom field definitions, in display order.
export const CUSTOM_FIELDS = [
  { name: "arxys_submission_id", field_type: "varchar" as const },
  { name: "arxys_total_cameras", field_type: "double" as const },
  { name: "arxys_bandwidth_mbps", field_type: "double" as const },
  { name: "arxys_storage_gb", field_type: "double" as const },
  { name: "arxys_recommended_models", field_type: "varchar" as const },
  { name: "arxys_portal_url", field_type: "varchar" as const },
];

export type CustomFieldKeyMap = Record<string, string>;

type Cache = {
  pipelineId?: Promise<number>;
  stageId?: Promise<number>;
  ownerId?: Promise<number>;
  customFieldKeys?: Promise<CustomFieldKeyMap>;
};

const cache: Cache = {};

// Test-only: clear caches between runs. Not exported from the package barrel.
export function __resetLookupCache(): void {
  cache.pipelineId = undefined;
  cache.stageId = undefined;
  cache.ownerId = undefined;
  cache.customFieldKeys = undefined;
}

export function resolvePipelineId(): Promise<number> {
  if (!cache.pipelineId) {
    cache.pipelineId = (async () => {
      const pipelines = await pipedriveClient.getPipelines();
      const match = pipelines.find((p) => p.name === PIPELINE_NAME);
      if (!match) {
        throw new PipedriveError(
          404,
          `Pipedrive pipeline "${PIPELINE_NAME}" not found. Create it in Pipedrive or update PIPELINE_NAME.`,
          { pipelines },
        );
      }
      return match.id;
    })().catch((err) => {
      cache.pipelineId = undefined;
      throw err;
    });
  }
  return cache.pipelineId;
}

export function resolveStageId(pipelineId: number): Promise<number> {
  if (!cache.stageId) {
    cache.stageId = (async () => {
      const stages = await pipedriveClient.getStages(pipelineId);
      const match = stages.find((s) => s.name === STAGE_NAME);
      if (!match) {
        throw new PipedriveError(
          404,
          `Pipedrive stage "${STAGE_NAME}" not found in pipeline ${pipelineId}.`,
          { stages },
        );
      }
      return match.id;
    })().catch((err) => {
      cache.stageId = undefined;
      throw err;
    });
  }
  return cache.stageId;
}

export function resolveOwnerId(): Promise<number> {
  if (!cache.ownerId) {
    cache.ownerId = (async () => {
      // Manual override wins over name lookup. Keeps the deploy unblocked if
      // Andy is renamed/deactivated in Pipedrive.
      const override = process.env.PIPEDRIVE_DEAL_OWNER_ID;
      if (override) {
        const parsed = Number.parseInt(override, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          throw new PipedriveError(
            500,
            `PIPEDRIVE_DEAL_OWNER_ID is set but not a positive integer: ${override}`,
            null,
          );
        }
        return parsed;
      }
      const users = await pipedriveClient.searchUsers(OWNER_NAME);
      const match = users.find((u) => u.name === OWNER_NAME);
      if (!match) {
        throw new PipedriveError(
          404,
          `Pipedrive user "${OWNER_NAME}" not found. Set PIPEDRIVE_DEAL_OWNER_ID in env to override.`,
          { users },
        );
      }
      return match.id;
    })().catch((err) => {
      cache.ownerId = undefined;
      throw err;
    });
  }
  return cache.ownerId;
}

// Reads the dealFields list, finds the six arxys_* fields by `name`, creates
// any that are missing, and returns a map of friendly name → hashed Pipedrive
// key. The hashed key is what /v1/deals expects on POST when writing a custom
// value. Idempotent: subsequent calls return the cached map.
export function ensureCustomFields(): Promise<CustomFieldKeyMap> {
  if (!cache.customFieldKeys) {
    cache.customFieldKeys = (async () => {
      const existing = await pipedriveClient.getDealFields();
      const byName = new Map<string, PdDealField>();
      for (const f of existing) byName.set(f.name, f);

      const result: CustomFieldKeyMap = {};
      for (const spec of CUSTOM_FIELDS) {
        const found = byName.get(spec.name);
        if (found) {
          result[spec.name] = found.key;
          continue;
        }
        const created = await pipedriveClient.createDealField({
          name: spec.name,
          field_type: spec.field_type,
        });
        result[spec.name] = created.key;
      }
      return result;
    })().catch((err) => {
      cache.customFieldKeys = undefined;
      throw err;
    });
  }
  return cache.customFieldKeys;
}
