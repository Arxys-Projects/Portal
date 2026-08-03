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

// ---------------------------------------------------------------------------
// Read shapes for the Project Quote read path (Phase 10 Step 4).
//
// These mirror the live `/v1/deals/{id}`, `/v1/deals/{id}/products`, and
// `/v1/products/{id}` response shapes confirmed against a real deal on
// 2026-06-16. Only the fields the quote reads are typed; every money/text
// field is nullable because Pipedrive omits or nulls them on incomplete deals.
// The deal detail INLINES the linked person/org/owner (no extra traversal
// needed): user_id/person_id/org_id come back as expanded objects.
// ---------------------------------------------------------------------------

// A {value,label,primary} contact entry as it appears in person_id.email /
// person_id.phone arrays on the deal detail.
export type PdContactValue = { value: string; primary?: boolean; label?: string };

export type PdDealOwnerRef = { id: number; name: string | null; email?: string | null };

export type PdDealPersonRef = {
  value: number;
  name: string | null;
  email?: PdContactValue[] | null;
  phone?: PdContactValue[] | null;
};

export type PdDealOrgRef = {
  value: number;
  name: string | null;
  address?: string | null;
};

// GET /v1/deals/{id}. Custom-field values arrive under their hashed keys, hence
// the index signature alongside the named fields.
export type PdDealDetail = {
  id: number;
  title: string | null;
  value: number | null;
  currency: string | null;
  // Pipedrive's own deal status. Distinct from submissions.status, which is the
  // portal-only open/won/lost of ADR 0081 and is never synced to Pipedrive; the
  // two can legitimately disagree and /projects renders both. 'deleted' is
  // returned for a deal in the bin.
  status: "open" | "won" | "lost" | "deleted" | null;
  update_time: string | null;
  user_id: PdDealOwnerRef | null;
  person_id: PdDealPersonRef | null;
  org_id: PdDealOrgRef | null;
  products_count?: number | null;
} & Record<string, unknown>;

// One item from GET /v1/deals/{id}/products. `item_price` is the unit price
// (MSRP), `sum` is the discounted line amount, `discount` is the discount value
// interpreted by `discount_type` ("percentage" | "amount"). The product `code`
// is NOT here — it lives on the product record (PdProduct).
export type PdDealProduct = {
  id: number;
  product_id: number;
  name: string | null;
  item_price: number | null;
  discount: number | null;
  discount_type?: string | null;
  quantity: number | null;
  sum: number | null;
  currency?: string | null;
  order_nr: number | null;
};

// GET /v1/products/{id} — read only for the product code.
export type PdProduct = { id: number; code: string | null; name: string | null };

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

// Update payload for a revision. Deliberately has NO pipeline_id / stage_id /
// user_id: a revision must not touch deal routing or ownership that sales may
// have changed. The index signature carries the hashed custom-field keys plus
// the deal `value`. Callers build this via buildDealFields() in deal.ts, which
// never emits routing fields.
export type UpdateDealPayload = {
  value?: number;
} & Record<string, string | number | undefined>;

export type CreateNotePayload = {
  content: string;
  deal_id: number;
  pinned_to_deal_flag?: 0 | 1;
};

export type PdNote = { id: number };

// GET/POST /v1/files. The Project Quote delivery path (Phase 10 Step 6) uploads
// the rendered PDF and links it to the deal; only the fields we read back are
// typed. `deal_id` is echoed by Pipedrive when the file is linked to a deal.
export type PdFile = {
  id: number;
  name: string | null;
  deal_id?: number | null;
};

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
  method: "GET" | "POST" | "PUT",
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
  updateDeal(id: number, payload: UpdateDealPayload): Promise<PdDeal> {
    return request<PdDeal>("PUT", `/deals/${id}`, { body: payload });
  },
  createNote(payload: CreateNotePayload): Promise<PdNote> {
    return request<PdNote>("POST", "/notes", { body: payload });
  },
  // Read path (Phase 10 Step 4). Read-only GETs against a single deal.
  getDeal(id: number): Promise<PdDealDetail> {
    return request<PdDealDetail>("GET", `/deals/${id}`);
  },
  getDealProducts(id: number): Promise<PdDealProduct[] | null> {
    // `data` comes back null (not []) when a deal has no products attached.
    return request<PdDealProduct[] | null>("GET", `/deals/${id}/products`);
  },
  getProduct(id: number): Promise<PdProduct> {
    return request<PdProduct>("GET", `/products/${id}`);
  },
  // Write path (Phase 10 Step 6) — attach a rendered file to a deal via the
  // Files API. POST /v1/files takes a multipart form, NOT JSON, so it cannot go
  // through request() (which always JSON-encodes the body). It reuses the same
  // token-appending URL builder and the same PipedriveError surface via the
  // requestUpload helper below — no second auth path, no second error type.
  addDealFile(dealId: number, filename: string, buffer: Uint8Array): Promise<PdFile> {
    const form = new FormData();
    // Copy into a fresh ArrayBuffer-backed view: a Node Buffer is
    // Uint8Array<ArrayBufferLike>, which Blob's BlobPart type rejects (it could
    // be SharedArrayBuffer-backed). The copy is a one-time cost on a PDF-sized
    // payload. Let fetch set the multipart Content-Type (with boundary); never
    // set it by hand or the boundary is lost and Pipedrive rejects the body.
    form.append("file", new Blob([new Uint8Array(buffer)], { type: "application/pdf" }), filename);
    form.append("deal_id", String(dealId));
    return requestUpload<PdFile>("/files", form);
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

// Multipart upload sibling of request()/requestSearch(): same withToken() auth
// path and same PipedriveError surface, but sends a FormData body (no JSON
// encoding, no hand-set Content-Type) for the Files API.
async function requestUpload<T>(path: string, form: FormData): Promise<T> {
  const url = withToken(path);
  const res = await fetch(url, { method: "POST", body: form });
  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    throw new PipedriveError(res.status, `Pipedrive POST ${path} returned non-JSON`, null);
  }
  const envelope = parsed as { success?: boolean; error?: string; error_info?: string; data?: unknown };
  if (!res.ok || envelope.success === false) {
    const message = envelope.error || `Pipedrive POST ${path} failed (${res.status})`;
    throw new PipedriveError(res.status, message, parsed, envelope.error_info);
  }
  return envelope.data as T;
}

export type PipedriveClient = typeof pipedriveClient;
