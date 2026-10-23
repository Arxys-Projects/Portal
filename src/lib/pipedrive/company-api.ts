// Pipedrive v2 reads for the company sync (scripts/sync-pipedrive-companies.mts,
// Project Portal brief Step 2). The sync only reads. postJsonV2 is the one
// write path, added for Step 5's project deals (project-deal-api.ts) so both
// share the 429 handling below.
//
// Like product-api.ts, the token is a parameter so the caller decides where
// credentials come from.
//
// Step 0 findings this follows (brief, "Step 0 results" item 1):
//   * GET /api/v2/organizations has no label filter (label_id / label_ids → 400),
//     so the sync pages every org (cursor, 500 per page) and filters on
//     label_ids in code. Saved filter #44 is not usable.
//   * Persons come from GET /api/v2/persons?org_id=.
//   * Rate limit observed: 80 requests per 2 seconds. A 429 carries
//     x-ratelimit-reset and no Retry-After.

const PD_V2_BASE = "https://api.pipedrive.com/api/v2";
const PD_V1_BASE = "https://api.pipedrive.com/v1";
const MAX_429_RETRIES = 5;

export type PdV2Organization = {
  id: number;
  name: string;
  label_ids?: number[] | null;
};

export type PdV2ContactValue = { value: string; primary?: boolean; label?: string };

export type PdV2Person = {
  id: number;
  name: string;
  org_id?: number | null;
  // v2 names these `emails` / `phones`; v1 used `email` / `phone`. Both are
  // read so a shape change does not silently drop every address.
  emails?: PdV2ContactValue[] | null;
  phones?: PdV2ContactValue[] | null;
  email?: PdV2ContactValue[] | null;
  phone?: PdV2ContactValue[] | null;
};

type FieldOption = { id: number; label: string };
type OrgField = {
  key?: string;
  field_code?: string;
  name?: string;
  field_name?: string;
  options?: FieldOption[] | null;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// How long to wait after a 429. x-ratelimit-reset is read as seconds until the
// window resets, or as an epoch timestamp if it is that large.
export function waitMsFor429(resetHeader: string | null, nowMs = Date.now()): number {
  const n = Number(resetHeader);
  if (!Number.isFinite(n) || n <= 0) return 2000;
  const ms = n > 1e9 ? n * 1000 - nowMs : n * 1000;
  return Math.min(Math.max(ms, 500), 30_000);
}

async function getJson<T>(token: string, url: URL): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url.toString(), { headers: { "x-api-token": token } });
    if (res.status === 429 && attempt < MAX_429_RETRIES) {
      await sleep(waitMsFor429(res.headers.get("x-ratelimit-reset")));
      continue;
    }
    const path = url.pathname + (url.search ? url.search.replace(/cursor=[^&]+/, "cursor=…") : "");
    if (!res.ok) throw new Error(`Pipedrive GET ${path} failed (${res.status})`);
    const json = (await res.json()) as { success: boolean; error?: string } & T;
    if (!json.success) throw new Error(`Pipedrive GET ${path}: ${json.error}`);
    return json;
  }
}

export async function listAllV2<T>(token: string, path: string, params: Record<string, string> = {}): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | null = null;
  for (;;) {
    const url = new URL(`${PD_V2_BASE}${path}`);
    url.searchParams.set("limit", "500");
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    if (cursor) url.searchParams.set("cursor", cursor);
    const json = await getJson<{ data: T[] | null; additional_data?: { next_cursor?: string | null } }>(token, url);
    out.push(...(json.data ?? []));
    cursor = json.additional_data?.next_cursor ?? null;
    if (!cursor) return out;
  }
}

// A v2 POST that did not succeed. `ambiguous` is true when Pipedrive may have
// processed it anyway (no response, a timeout, a 5xx), so the caller must not
// repeat it blindly; false when Pipedrive answered with a refusal (4xx, or a
// 429 that outlasted the retries), so nothing was written.
export class PipedriveWriteError extends Error {
  readonly status: number | null;
  readonly ambiguous: boolean;
  constructor(message: string, status: number | null, ambiguous: boolean) {
    super(message);
    this.name = "PipedriveWriteError";
    this.status = status;
    this.ambiguous = ambiguous;
  }
}

const POST_TIMEOUT_MS = 30_000;

// POST to a v2 endpoint (Project Portal Step 5's deal writes). Retrying after a
// 429 is safe: the request was not processed. Nothing else is retried here.
// The error body may be Cloudflare HTML after repeated 429s, so JSON is optional.
export async function postJsonV2<T>(token: string, path: string, body: unknown): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${PD_V2_BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-token": token },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(POST_TIMEOUT_MS),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new PipedriveWriteError(`Pipedrive POST ${path}: no response (${reason})`, null, true);
    }
    if (res.status === 429 && attempt < MAX_429_RETRIES) {
      await sleep(waitMsFor429(res.headers.get("x-ratelimit-reset")));
      continue;
    }
    let json: { success?: boolean; error?: string; data?: T } | null = null;
    try {
      json = (await res.json()) as { success?: boolean; error?: string; data?: T };
    } catch {
      json = null;
    }
    if (res.ok && json?.success !== false && json?.data !== undefined) return json.data as T;
    const ambiguous = res.ok || res.status >= 500;
    throw new PipedriveWriteError(
      `Pipedrive POST ${path} failed (${res.status})${json?.error ? `: ${json.error}` : ""}`,
      res.status,
      ambiguous,
    );
  }
}

// Find an option id on the org `label_ids` field by its label, ignoring case
// (Pipedrive stores "ARXYS SECURITY PARTNER"; option id 73 at Step 0).
export function findLabelOptionId(fields: OrgField[], label: string): number | null {
  const field = fields.find((f) => (f.field_code ?? f.key) === "label_ids")
    ?? fields.find((f) => (f.field_code ?? f.key) === "label");
  const want = label.trim().toLowerCase();
  const option = field?.options?.find((o) => o.label.trim().toLowerCase() === want);
  return option?.id ?? null;
}

// Reads the org fields from v2, falling back to v1 organizationFields (not on
// the 2026-08-01 deprecation list) if the v2 call fails.
export async function resolveOrgLabelId(token: string, label: string): Promise<number> {
  let fields: OrgField[];
  try {
    fields = await listAllV2<OrgField>(token, "/organizationFields");
  } catch {
    const url = new URL(`${PD_V1_BASE}/organizationFields`);
    url.searchParams.set("limit", "500");
    url.searchParams.set("api_token", token);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Pipedrive GET /v1/organizationFields failed (${res.status})`);
    fields = ((await res.json()) as { data: OrgField[] | null }).data ?? [];
  }
  const id = findLabelOptionId(fields, label);
  if (id === null) throw new Error(`No "${label}" option on the organization label field`);
  return id;
}

export function listAllOrganizations(token: string): Promise<PdV2Organization[]> {
  return listAllV2<PdV2Organization>(token, "/organizations");
}

export function listPersonsForOrg(token: string, orgId: number): Promise<PdV2Person[]> {
  return listAllV2<PdV2Person>(token, "/persons", { org_id: String(orgId) });
}
