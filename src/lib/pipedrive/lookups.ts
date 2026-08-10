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

// `arxys_*` custom-field definitions, in display order. We own these — if
// they're missing in Pipedrive we create them on first run.
export const CUSTOM_FIELDS = [
  { name: "arxys_submission_id", field_type: "varchar" as const },
  { name: "arxys_total_cameras", field_type: "double" as const },
  { name: "arxys_bandwidth_mbps", field_type: "double" as const },
  { name: "arxys_storage_gb", field_type: "double" as const },
  { name: "arxys_recommended_models", field_type: "varchar" as const },
  { name: "arxys_portal_url", field_type: "varchar" as const },
];

// Pre-existing Pipedrive deal fields the calculator maps to. We do NOT create
// these — they're admin-curated and have option taxonomies (set/enum) tied to
// specific Pipedrive option IDs. If one is missing at lookup time we log and
// skip it; the deal still saves with whatever fields we did resolve.
export const CALCULATOR_FIELD_NAMES = [
  "Project Name",
  "VMS",
  "Camera Streams",
  "Recording New",
  "Motion Activity Est. %",
  "Frame Rate",
  "Resolution",
  "Retention Days",
  "CODEC New",
  "Total Storage",
  "Complexity Scene-Motion",
  "Recording hours",
  "Recommended Server",
] as const;

export type CalculatorFieldName = (typeof CALCULATOR_FIELD_NAMES)[number];
export type CustomFieldKeyMap = Record<string, string>;

type Cache = {
  pipelineId?: Promise<number>;
  stageId?: Promise<number>;
  ownerId?: Promise<number>;
  dealFields?: Promise<PdDealField[]>;
  customFieldKeys?: Promise<CustomFieldKeyMap>;
  calculatorFieldKeys?: Promise<Partial<Record<CalculatorFieldName, string>>>;
};

const cache: Cache = {};

// Test-only: clear caches between runs. Not exported from the package barrel.
export function __resetLookupCache(): void {
  cache.pipelineId = undefined;
  cache.stageId = undefined;
  cache.ownerId = undefined;
  cache.dealFields = undefined;
  cache.customFieldKeys = undefined;
  cache.calculatorFieldKeys = undefined;
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

// ADR 0118 — per-creator owner routing. Andy and Richard are the only two
// portal users who are also real Pipedrive users; their numeric Pipedrive
// user ids are stored on their own `partners.pipedrive_user_id` row (admin-set
// via /admin/partners). When the caller creating a deal has one, use it
// directly — no Pipedrive lookup needed, the id is already what /v1/deals
// wants for `user_id`. Anyone without a stored id (every external partner,
// and any other internal user such as Marcos) falls back to the existing
// single-owner default below, unchanged.
export function resolveOwnerIdForCreator(
  creatorPipedriveUserId: number | null | undefined,
): Promise<number> {
  if (
    typeof creatorPipedriveUserId === "number" &&
    Number.isFinite(creatorPipedriveUserId) &&
    creatorPipedriveUserId > 0
  ) {
    return Promise.resolve(creatorPipedriveUserId);
  }
  return resolveOwnerId();
}

// Shared single fetch of /dealFields so both `ensureCustomFields` (creates
// missing arxys_* fields) and `resolveCalculatorFieldKeys` (read-only on the
// admin-curated calculator fields) hit the API once.
function getDealFieldsCached(): Promise<PdDealField[]> {
  if (!cache.dealFields) {
    cache.dealFields = pipedriveClient.getDealFields().catch((err) => {
      cache.dealFields = undefined;
      throw err;
    });
  }
  return cache.dealFields;
}

// Reads dealFields, finds the six arxys_* fields by name, creates any that
// are missing, and returns a map { friendly_name: hashed_key }. The hashed
// key is what POST /deals expects when writing a custom value.
export function ensureCustomFields(): Promise<CustomFieldKeyMap> {
  if (!cache.customFieldKeys) {
    cache.customFieldKeys = (async () => {
      const existing = await getDealFieldsCached();
      const byName = new Map<string, PdDealField>();
      for (const f of existing) byName.set(f.name, f);

      const result: CustomFieldKeyMap = {};
      let createdAny = false;
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
        createdAny = true;
      }
      if (createdAny) {
        // The dealFields list we cached is now stale relative to what we
        // just created. Bust it so the next caller (e.g.
        // resolveCalculatorFieldKeys in the same invocation) re-reads.
        cache.dealFields = undefined;
      }
      return result;
    })().catch((err) => {
      cache.customFieldKeys = undefined;
      throw err;
    });
  }
  return cache.customFieldKeys;
}

// Read-only lookup for the admin-curated calculator fields. Returns a partial
// map — missing fields are logged but do not throw, so a Pipedrive admin
// renaming one field doesn't block the deal create for everything else.
export function resolveCalculatorFieldKeys(): Promise<
  Partial<Record<CalculatorFieldName, string>>
> {
  if (!cache.calculatorFieldKeys) {
    cache.calculatorFieldKeys = (async () => {
      const existing = await getDealFieldsCached();
      const byName = new Map<string, PdDealField>();
      for (const f of existing) byName.set(f.name, f);

      const result: Partial<Record<CalculatorFieldName, string>> = {};
      const missing: string[] = [];
      for (const name of CALCULATOR_FIELD_NAMES) {
        const found = byName.get(name);
        if (found) {
          result[name] = found.key;
        } else {
          missing.push(name);
        }
      }
      if (missing.length > 0) {
        console.warn("pipedrive calculator field(s) not found by name", { missing });
      }
      return result;
    })().catch((err) => {
      cache.calculatorFieldKeys = undefined;
      throw err;
    });
  }
  return cache.calculatorFieldKeys;
}
