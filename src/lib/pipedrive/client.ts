import { env } from "@/lib/env";

// Thin fetch wrapper for Pipedrive REST v1. All methods append api_token from
// env. Response envelope is `{ success, data, ... }` for v1; on failure the
// body usually carries `error` and `error_info`. We surface both via a typed
// error so callers can log/branch without re-parsing the response.
//
// Server-side only: reads env.PIPEDRIVE_API_TOKEN which is not exposed to the
// client (Next.js rejects non-NEXT_PUBLIC vars on the client). The marker
// `import "server-only"` was deliberately omitted so the deal builder can be
// unit-tested under plain Node — see src/lib/pipedrive/deal.test.ts.

const BASE_URL = "https://api.pipedrive.com/v1";

export class PipedriveError extends Error {
  readonly status: number;
  readonly errorInfo: string | undefined;
  readonly body: unknown;
  constructor(status: number, message: string, body: unknown, errorInfo?: string) {
    super(message);
    this.name = "PipedriveError";
    this.status = status;
    this.body = body;
    this.errorInfo = errorInfo;
  }
}

// Common Pipedrive entity shapes — minimal, only the fields we read.

export type PdPipeline = { id: number; name: string };
export type PdStage = { id: number; name: string; pipeline_id: number };
export type PdUser = { id: number; name: string; email?: string };
export type PdPerson = { id: number; name: string };
export type PdOrganization = { id: number; name: string };
export type PdDealField = { id: number; name: string; key: string; field_type: string };
export type PdDeal = { id: number; title: string; value: number };

export type PersonSearchItem = { item: { id: number } };
export type OrgSearchItem = { item: { id: number } };

// Create payloads. Custom field values are merged into the create-deal payload
// under their hashed keys, hence the index signature on CreateDealPayload.
export type CreatePersonPayload = {
  name: string;
  email?: Array<{ value: string; primary?: boolean }>;
  org_id?: number;
};

export type CreateOrgPayload = {
  name: string;
};

export type CreateDealFieldPayload = {
  name: string;
  field_type: "varchar" | "double" | "int" | "text";
};

export type CreateDealPayload = {
  title: string;
  value: number;
  currency?: string;
  user_id?: number;
  person_id?: number;
  org_id?: number;
  pipeline_id: number;
  stage_id: number;
  status?: "open" | "won" | "lost" | "deleted";
} & Record<string, string | number | undefined>;

export type CreateNotePayload = {
  content: string;
  deal_id: number;
  pinned_to_deal_flag?: 0 | 1;
};

export type PdNote = { id: number };

type V1Envelope<T> = {
  success: boolean;
  data: T;
  error?: string;
  error_info?: string;
};

type V1SearchEnvelope<T> = {
  success: boolean;
  data: { items: T[] };
  error?: string;
  error_info?: string;
};

function withToken(path: string, query?: Record<string, string | number | undefined>): string {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("api_token", env.PIPEDRIVE_API_TOKEN);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined) continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function request<T>(
  method: "GET" | "POST",
  path: string,
  options: {
    query?: Record<string, string | number | undefined>;
    body?: unknown;
  } = {},
): Promise<T> {
  const url = withToken(path, options.query);
  const init: RequestInit = { method };
  if (options.body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(options.body);
  }
  const res = await fetch(url, init);
  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    throw new PipedriveError(res.status, `Pipedrive ${method} ${path} returned non-JSON`, null);
  }
  const envelope = parsed as { success?: boolean; error?: string; error_info?: string; data?: unknown };
  if (!res.ok || envelope.success === false) {
    const message = envelope.error || `Pipedrive ${method} ${path} failed (${res.status})`;
    throw new PipedriveError(res.status, message, parsed, envelope.error_info);
  }
  return envelope.data as T;
}

export const pipedriveClient = {
  getPipelines(): Promise<PdPipeline[]> {
    return request<PdPipeline[]>("GET", "/pipelines");
  },
  getStages(pipelineId: number): Promise<PdStage[]> {
    return request<PdStage[]>("GET", "/stages", { query: { pipeline_id: pipelineId } });
  },
  searchUsers(term: string): Promise<PdUser[]> {
    // /v1/users?term=... returns a list directly (not a search envelope).
    return request<PdUser[]>("GET", "/users", { query: { term } });
  },
  async searchPersons(email: string): Promise<PersonSearchItem[]> {
    const data = await requestSearch<PersonSearchItem>("/persons/search", {
      term: email,
      fields: "email",
      exact_match: "true",
    });
    return data;
  },
  async searchOrganizations(name: string): Promise<OrgSearchItem[]> {
    const data = await requestSearch<OrgSearchItem>("/organizations/search", {
      term: name,
      fields: "name",
      exact_match: "true",
    });
    return data;
  },
  createPerson(payload: CreatePersonPayload): Promise<PdPerson> {
    return request<PdPerson>("POST", "/persons", { body: payload });
  },
  createOrganization(payload: CreateOrgPayload): Promise<PdOrganization> {
    return request<PdOrganization>("POST", "/organizations", { body: payload });
  },
  getDealFields(): Promise<PdDealField[]> {
    return request<PdDealField[]>("GET", "/dealFields");
  },
  createDealField(payload: CreateDealFieldPayload): Promise<PdDealField> {
    return request<PdDealField>("POST", "/dealFields", { body: payload });
  },
  createDeal(payload: CreateDealPayload): Promise<PdDeal> {
    return request<PdDeal>("POST", "/deals", { body: payload });
  },
  createNote(payload: CreateNotePayload): Promise<PdNote> {
    return request<PdNote>("POST", "/notes", { body: payload });
  },
};

async function requestSearch<T>(
  path: string,
  query: Record<string, string | number | undefined>,
): Promise<T[]> {
  const url = withToken(path, query);
  const res = await fetch(url, { method: "GET" });
  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    throw new PipedriveError(res.status, `Pipedrive GET ${path} returned non-JSON`, null);
  }
  const envelope = parsed as V1SearchEnvelope<T>;
  if (!res.ok || envelope.success === false) {
    const errorEnv = parsed as V1Envelope<unknown>;
    const message = errorEnv.error || `Pipedrive GET ${path} failed (${res.status})`;
    throw new PipedriveError(res.status, message, parsed, errorEnv.error_info);
  }
  return envelope.data?.items ?? [];
}

export type PipedriveClient = typeof pipedriveClient;
