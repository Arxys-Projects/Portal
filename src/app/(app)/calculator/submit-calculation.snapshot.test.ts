// Snapshot harness for submitCalculation (Project Portal Step 4, Phase A).
//
// Captures every observable effect of a save on the paths that exist today
// (partner full calculator, Quick Calc, partner revisions, internal on-behalf)
// and compares it with fixtures captured on the unmodified HEAD before Step 4
// touched submitCalculation. The partner path must stay byte-identical, so the
// comparison is exact:
//   * every Supabase request (method, path and query, Prefer header, which key
//     sent it, and the raw body string), which includes the `submissions` row;
//   * every Pipedrive request (method, path and query with the token redacted,
//     and the raw JSON body);
//   * the arguments of the PDF render and of sendSubmissionNotification;
//   * console.warn / console.error first arguments, and the returned state.
//
// Real supabase-js and the real Pipedrive client run against a fake fetch, so
// the recorded bodies are the bytes the libraries actually serialize. The clock
// is frozen and every id comes from the fake database, so a run is
// deterministic.
//
// Phase B's project-calc tests run on the same fakes, in their own describe
// block at the end. They assert behavior and use no fixtures.
//
// Needs --experimental-test-module-mocks (set in the `test` script).
// Refresh the fixtures (only on a commit whose partner path is the reference):
//   UPDATE_SUBMIT_SNAPSHOTS=1 npx tsx --test --experimental-test-module-mocks \
//     "src/app/(app)/calculator/submit-calculation.snapshot.test.ts"

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { seedBomRules, seedSystemDesignRules } from "@/lib/system-design/seed-rules.test-fixtures";

process.env.TZ = "UTC";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
process.env.PIPEDRIVE_API_TOKEN = "pipedrive-token";
process.env.SMTP_HOST = "smtp.test";
process.env.SMTP_PORT = "587";
process.env.SMTP_USER = "smtp-user@arxys.test";
process.env.SMTP_PASS = "smtp-pass";
process.env.SMTP_FROM = "Arxys Partner Portal <sales@arxys.com>";
process.env.INTERNAL_NOTIFICATION_EMAIL = "sales@arxys.com";
delete process.env.PIPEDRIVE_DEAL_OWNER_ID;

const FROZEN_NOW = new Date("2026-10-22T17:00:00.000Z");
const FIXTURE_DIR = path.join(process.cwd(), "src/app/(app)/calculator/__snapshots__");
const FIXTURE_FILE = path.join(FIXTURE_DIR, "submit-calculation.json");
const UPDATE = process.env.UPDATE_SUBMIT_SNAPSHOTS === "1";

// ---------------------------------------------------------------------------
// Fake database
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

const PARTNER_ID = "11111111-1111-4111-8111-111111111111";
const INTERNAL_ID = "22222222-2222-4222-8222-222222222222";
const TARGET_ID = "33333333-3333-4333-8333-333333333333";
const SOURCE_WITH_DEAL_ID = "44444444-4444-4444-8444-444444444444";
const SOURCE_NO_DEAL_ID = "55555555-5555-4555-8555-555555555555";
const OPEN_FOR_TARGET_ID = "66666666-6666-4666-8666-666666666666";
const OPEN_FOR_COMPANY_ID = "88888888-8888-4888-8888-888888888888";

const AUTH_EMAILS: Record<string, string> = {
  [PARTNER_ID]: "pat.partner@acme-security.test",
  [INTERNAL_ID]: "rep@arxys.test",
  [TARGET_ID]: "terry.target@target-integrators.test",
};

function seedTables(): Record<string, Row[]> {
  return {
    partners: [
      {
        id: PARTNER_ID,
        status: "active",
        is_internal: false,
        pipedrive_user_id: null,
        company_name: "Acme Security",
        contact_name: "Pat Partner",
      },
      {
        id: INTERNAL_ID,
        status: "active",
        is_internal: true,
        pipedrive_user_id: 4242,
        company_name: "Arxys",
        contact_name: "Rita Rep",
      },
      {
        id: TARGET_ID,
        status: "active",
        is_internal: false,
        pipedrive_user_id: null,
        company_name: "Target Integrators",
        contact_name: "Terry Target",
      },
    ],
    submissions: [
      { id: SOURCE_WITH_DEAL_ID, partner_id: PARTNER_ID, pipedrive_deal_id: 8001, status: "open" },
      { id: SOURCE_NO_DEAL_ID, partner_id: PARTNER_ID, pipedrive_deal_id: null, status: "open" },
      {
        id: OPEN_FOR_TARGET_ID,
        partner_id: INTERNAL_ID,
        on_behalf_of_partner_id: TARGET_ID,
        project_name: "Earlier Target Quote",
        created_at: "2026-10-20T12:00:00.000Z",
        status: "open",
      },
      {
        id: OPEN_FOR_COMPANY_ID,
        partner_id: INTERNAL_ID,
        on_behalf_of_company_name: "not yet onboarded llc",
        project_name: null,
        created_at: "2026-10-21T12:00:00.000Z",
        status: "open",
      },
    ],
    current_products: [
      { sku: "VX5-V200-64", product_name: "VideoX V200 64TB", product_group: "V200", msrp: 20470, price_type: "numeric", active: true, hidden_from_catalog: false },
      { sku: "VX5-V400-128", product_name: "VideoX V400 128TB", product_group: "V400", msrp: 39950, price_type: "numeric", active: true, hidden_from_catalog: false },
      { sku: "VX5-V500-192", product_name: "VideoX V500 192TB", product_group: "V500", msrp: 52950, price_type: "numeric", active: true, hidden_from_catalog: false },
      { sku: "VX5-V800-864", product_name: "VideoX V800 864TB", product_group: "V800", msrp: 117054, price_type: "numeric", active: true, hidden_from_catalog: false },
    ],
    product_specs: [
      { id: "VX5-V200-64", model_name: "V200", form_factor: "1U", storage_raw_tb: 64, max_cameras: 100, max_bandwidth_mbps: 500, drive_bays: 4, cpu_model_full: "CPU A", ram_spec: "32GB", os_edition: "Win IoT", hdd_count: 4, raid_level_display: "RAID 5", rack_units: "1U", sfp_addon: "No" },
      { id: "VX5-V400-128", model_name: "V400", form_factor: "2U", storage_raw_tb: 128, max_cameras: 200, max_bandwidth_mbps: 800, drive_bays: 8, cpu_model_full: "CPU B", ram_spec: "64GB", os_edition: "Win Server", hdd_count: 8, raid_level_display: "RAID 6", rack_units: "2U", sfp_addon: "Yes" },
      { id: "VX5-V500-192", model_name: "V500", form_factor: "2U", storage_raw_tb: 192, max_cameras: 300, max_bandwidth_mbps: 1200, drive_bays: 12, cpu_model_full: "CPU C", ram_spec: "64GB", os_edition: "Win Server", hdd_count: 12, raid_level_display: "RAID 6", rack_units: "2U", sfp_addon: "Yes" },
      { id: "VX5-V800-864", model_name: "V800", form_factor: "4U", storage_raw_tb: 864, max_cameras: 600, max_bandwidth_mbps: 3000, drive_bays: 36, cpu_model_full: "CPU D", ram_spec: "128GB", os_edition: "Win Server", hdd_count: 36, raid_level_display: "RAID 60", rack_units: "4U", sfp_addon: "Yes" },
    ],
  };
}

let tables: Record<string, Row[]> = seedTables();
let insertCounter = 0;
let failInsertInto = new Set<string>();
let failReadFrom = new Set<string>();
let failDeleteFrom = new Set<string>();
let failPatchOn = new Set<string>();

function newInsertId(): string {
  insertCounter += 1;
  return `aaaaaaaa-aaaa-4aaa-8aaa-${String(insertCounter).padStart(12, "0")}`;
}

// PostgREST filter subset: `col=eq.value`, `col=in.(a,b)` and
// `col=ilike.pattern` narrow; every other operator (gte, order, limit) is
// ignored, since the fixture rows already satisfy them. `select=a,b` projects
// plain column lists. (`in` was added for Phase B; no partner path sends it.)
function queryRows(table: string, params: URLSearchParams): Row[] {
  let rows = tables[table] ?? [];
  for (const [key, value] of params) {
    if (["select", "order", "limit", "offset", "columns"].includes(key)) continue;
    if (value.startsWith("eq.")) {
      const want = value.slice(3);
      rows = rows.filter((r) => String(r[key]) === want);
    } else if (value.startsWith("in.(") && value.endsWith(")")) {
      const want = new Set(value.slice(4, -1).split(",").map((v) => v.replace(/^"|"$/g, "")));
      rows = rows.filter((r) => want.has(String(r[key])));
    } else if (value === "is.null") {
      rows = rows.filter((r) => r[key] === null || r[key] === undefined);
    } else if (value.startsWith("ilike.")) {
      const escaped = value.slice(6).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/[%*]/g, ".*");
      const re = new RegExp(`^${escaped}$`, "i");
      rows = rows.filter((r) => typeof r[key] === "string" && re.test(r[key] as string));
    }
  }
  return rows;
}

function project(rows: Row[], select: string | null): Row[] {
  if (!select || select === "*") return rows;
  const cols = select.split(",").map((c) => c.trim());
  return rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? null])));
}

function postgrestResponse(rows: Row[], accept: string | null, status = 200): Response {
  if (accept?.includes("application/vnd.pgrst.object+json")) {
    if (rows.length !== 1) {
      return json({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" }, 406);
    }
    return json(rows[0], status);
  }
  return json(rows, status);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Fake Pipedrive
// ---------------------------------------------------------------------------

const DEAL_FIELD_NAMES = [
  "arxys_submission_id",
  "arxys_total_cameras",
  "arxys_bandwidth_mbps",
  "arxys_storage_gb",
  "arxys_recommended_models",
  "arxys_portal_url",
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
];

function pipedriveRoute(method: string, url: URL): Response {
  const p = url.pathname.replace(/^\/v1/, "");
  const ok = (data: unknown) => json({ success: true, data });
  if (method === "GET" && p === "/pipelines") return ok([{ id: 1, name: "Project Pipeline" }]);
  if (method === "GET" && p === "/stages") return ok([{ id: 11, name: "New Lead", pipeline_id: 1 }]);
  if (method === "GET" && p === "/users") return ok([{ id: 99, name: "Andy Newbom" }]);
  if (method === "GET" && p === "/dealFields") {
    return ok(
      DEAL_FIELD_NAMES.map((name, i) => ({
        id: 100 + i,
        name,
        key: `key_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
        field_type: "varchar",
      })),
    );
  }
  // Organizations exist; persons do not, so person creation is exercised.
  if (method === "GET" && p === "/organizations/search") return ok({ items: [{ item: { id: 500 } }] });
  if (method === "GET" && p === "/persons/search") return ok({ items: [] });
  if (method === "POST" && p === "/persons") return ok({ id: 700, name: "created" });
  if (method === "POST" && p === "/organizations") return ok({ id: 501, name: "created" });
  if (method === "POST" && p === "/deals") return ok({ id: 9001, title: "created", value: 0 });
  if (method === "PUT" && /^\/deals\/\d+$/.test(p)) {
    return ok({ id: Number(p.split("/")[2]), title: "updated", value: 0 });
  }
  if (method === "POST" && p === "/notes") return ok({ id: 1 });
  throw new Error(`fake Pipedrive: unhandled ${method} ${p}`);
}

// ---------------------------------------------------------------------------
// Recording fetch
// ---------------------------------------------------------------------------

type RecordedRequest = {
  service: "supabase" | "pipedrive";
  client?: "anon" | "service";
  method: string;
  url: string;
  prefer?: string;
  body: string | null;
};

let requests: RecordedRequest[] = [];

async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  const body = typeof init?.body === "string" ? init.body : init?.body == null ? null : "[non-string body]";

  if (url.host === "api.pipedrive.com") {
    const redacted = new URL(url.href);
    if (redacted.searchParams.has("api_token")) redacted.searchParams.set("api_token", "REDACTED");
    requests.push({
      service: "pipedrive",
      method,
      url: decodeURIComponent(redacted.pathname + redacted.search),
      body,
    });
    return pipedriveRoute(method, url);
  }

  if (url.host === "supabase.test" && url.pathname.startsWith("/rest/v1/")) {
    const apikey = headers.get("apikey");
    requests.push({
      service: "supabase",
      client: apikey === "service-key" ? "service" : "anon",
      method,
      url: decodeURIComponent(url.pathname + url.search),
      prefer: headers.get("prefer") ?? undefined,
      body,
    });
    const table = url.pathname.slice("/rest/v1/".length);
    const accept = headers.get("accept");
    const select = url.searchParams.get("select");
    if (method === "GET") {
      if (failReadFrom.has(table)) {
        return json({ code: "XX000", message: `fake: read of ${table} failed` }, 500);
      }
      return postgrestResponse(project(queryRows(table, url.searchParams), select), accept);
    }
    if (method === "POST") {
      // Phase B: a write the database would refuse (42501, as PostgREST sends it).
      if (failInsertInto.has(table)) {
        return json({ code: "42501", message: `fake: insert into ${table} refused` }, 403);
      }
      const parsed = JSON.parse(body ?? "{}") as Row | Row[];
      const inserted = (Array.isArray(parsed) ? parsed : [parsed]).map((r) => ({ id: newInsertId(), ...r }));
      (tables[table] ??= []).push(...inserted);
      return postgrestResponse(project(inserted, select), accept, 201);
    }
    if (method === "PATCH") {
      const patch = JSON.parse(body ?? "{}") as Row;
      // Phase B: refuse a PATCH that sets one of these columns.
      if (Object.keys(patch).some((k) => failPatchOn.has(k))) {
        return json({ code: "XX000", message: "fake: update failed" }, 500);
      }
      const hit = queryRows(table, url.searchParams);
      for (const r of hit) Object.assign(r, patch);
      return new Response(null, { status: 204 });
    }
    if (method === "DELETE") {
      if (failDeleteFrom.has(table)) {
        return json({ code: "XX000", message: `fake: delete from ${table} failed` }, 500);
      }
      // Phase B's undo of a half-saved project calc. Both link tables cascade
      // from submissions, as their foreign keys do.
      const hit = new Set(queryRows(table, url.searchParams));
      tables[table] = (tables[table] ?? []).filter((r) => !hit.has(r));
      if (table === "submissions") {
        const gone = new Set([...hit].map((r) => r.id));
        for (const child of ["project_submissions", "submission_system_designs"]) {
          tables[child] = (tables[child] ?? []).filter((r) => !gone.has(r.submission_id));
        }
      }
      return new Response(null, { status: 204 });
    }
  }

  throw new Error(`fake fetch: unhandled ${method} ${url.href}`);
}

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

let currentUserId: string | null = PARTNER_ID;
let pdfRenders: unknown[] = [];
let emails: unknown[] = [];
let logs: { level: string; message: string }[] = [];

function digest(s: string): string {
  return `sha256:${createHash("sha256").update(s).digest("hex").slice(0, 16)} (${s.length} chars)`;
}

// Data URIs are large and come from files on disk; the snapshot keeps a digest.
function scrubPdfInput(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...input };
  for (const k of ["logoDataUri", "heroDataUri"]) {
    if (typeof out[k] === "string") out[k] = digest(out[k] as string);
  }
  if (out.generatedAt instanceof Date) out.generatedAt = out.generatedAt.toISOString();
  return out;
}

type SubmitFn = (prev: { status: "idle" }, payload: unknown) => Promise<unknown>;
let submitCalculation: SubmitFn;
let resetLookupCache: () => void;
let adminRelinkPipedriveDeal: (id: string) => Promise<unknown>;

before(async () => {
  mock.timers.enable({ apis: ["Date"], now: FROZEN_NOW });
  globalThis.fetch = fakeFetch as typeof fetch;

  mock.module("server-only", { namedExports: {} });
  // Only the staff relink calls it (Phase B tests); outside a Next request it throws.
  mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });

  const { createClient } = await import("@supabase/supabase-js");
  const makeClient = (key: string) =>
    createClient("https://supabase.test", key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  mock.module("@/lib/supabase/server", {
    namedExports: {
      createSupabaseServerClient: async () => {
        const client = makeClient("anon-key");
        client.auth.getUser = (async () => ({
          data: { user: currentUserId ? { id: currentUserId, email: AUTH_EMAILS[currentUserId] } : null },
          error: null,
        })) as typeof client.auth.getUser;
        return client;
      },
    },
  });
  mock.module("@/lib/supabase/admin", {
    namedExports: {
      createSupabaseAdminClient: () => {
        const client = makeClient("service-key");
        client.auth.admin.getUserById = (async (id: string) => ({
          data: { user: AUTH_EMAILS[id] ? { id, email: AUTH_EMAILS[id] } : null },
          error: null,
        })) as typeof client.auth.admin.getUserById;
        return client;
      },
    },
  });

  // Keep the real spec loader and filename; stub only the render itself.
  const realRender = await import("@/lib/pdf/render");
  mock.module("@/lib/pdf/render", {
    namedExports: {
      ...realRender,
      renderSubmissionPdfBuffer: async (input: Record<string, unknown>) => {
        pdfRenders.push(scrubPdfInput(input));
        return Buffer.from("PDF-STUB");
      },
    },
  });
  mock.module("@/lib/email/submission-notification", {
    namedExports: {
      sendSubmissionNotification: async (input: Record<string, unknown>) => {
        const pdf = input.pdfBuffer as Buffer | undefined;
        emails.push({ ...input, pdfBuffer: pdf ? pdf.toString("utf8") : undefined });
      },
    },
  });

  ({ submitCalculation } = (await import("@/app/(app)/calculator/actions")) as unknown as {
    submitCalculation: SubmitFn;
  });
  ({ __resetLookupCache: resetLookupCache } = await import("@/lib/pipedrive/lookups"));
  ({ adminRelinkPipedriveDeal } = (await import("@/app/(app)/admin/submissions/actions")) as unknown as {
    adminRelinkPipedriveDeal: (id: string) => Promise<unknown>;
  });
});

after(() => {
  mock.timers.reset();
  mock.restoreAll();
});

beforeEach(() => {
  tables = seedTables();
  insertCounter = 0;
  failInsertInto = new Set();
  failReadFrom = new Set();
  failDeleteFrom = new Set();
  failPatchOn = new Set();
  requests = [];
  pdfRenders = [];
  emails = [];
  logs = [];
  resetLookupCache();
});

async function run(userId: string, payload: unknown) {
  currentUserId = userId;
  const warn = mock.method(console, "warn", (...args: unknown[]) => {
    logs.push({ level: "warn", message: String(args[0]) });
  });
  const error = mock.method(console, "error", (...args: unknown[]) => {
    logs.push({ level: "error", message: String(args[0]) });
  });
  try {
    const result = await submitCalculation({ status: "idle" }, payload);
    return { result, requests, pdfRenders, emails, logs };
  } finally {
    warn.mock.restore();
    error.mock.restore();
  }
}

// ---------------------------------------------------------------------------
// Scenarios (today's paths only; Step 4 adds its own tests elsewhere)
// ---------------------------------------------------------------------------

const FULL_CALC_PAYLOAD = {
  projectName: "Harbor Logistics Yard",
  vms: "Milestone",
  retentionDays: 14,
  utilizationPct: 85,
  groups: [
    {
      name: "Perimeter",
      cameras: 420,
      resolutionIdx: 14,
      codecIdx: 0,
      complexityIdx: 2,
      fps: 15,
      recordingMode: "motion",
      recordingPercent: 100,
      motionPercent: 60,
      retentionDays: 30,
      cameraVendor: "Axis",
      cameraModel: "P1468-LE",
      units: 420,
      sensorsPerCamera: 1,
      cameraModelModified: false,
    },
    {
      name: "Gates",
      cameras: 12,
      resolutionIdx: 10,
      codecIdx: 1,
      complexityIdx: 4,
      fps: 20,
      recordingMode: "constant",
      recordingPercent: 50,
      motionPercent: 40,
    },
  ],
  addOnFailoverRecorder: true,
  addOnManagementServer: false,
  isRevision: false,
  sourceSubmissionId: null,
};

const QUICK_CALC_PAYLOAD = {
  projectName: "Quick Estimate Store 12",
  onBehalfOfPartnerId: null,
  onBehalfOfCompanyName: null,
  vms: null,
  retentionDays: 30,
  utilizationPct: 80,
  groups: [
    {
      name: "Camera streams",
      resolutionIdx: 14,
      codecIdx: 0,
      complexityIdx: 2,
      fps: 15,
      recordingMode: "motion",
      recordingPercent: 100,
      motionPercent: 75,
      cameras: 40,
    },
  ],
  addOnFailoverRecorder: false,
  addOnManagementServer: false,
  isRevision: false,
  sourceSubmissionId: null,
};

// Step 4 fields a partner might send. Today they are stripped by zod; after
// Step 4 they are ignored for a non-internal caller. Either way, the outcome
// must equal the plain partner save.
const PROJECT_FIELDS = {
  projectId: "77777777-7777-4777-8777-777777777777",
  systemDesign: {
    sfp: true,
    gpu: true,
    failover: { enabled: true, days: 30, primariesPerFailover: 2 },
    management: { dedicated: true, failoverPair: false, sku: "VX5-V250-MGMT" },
    workstations: { count: 2, sku: "VX5-SW20" },
  },
};

// Phase B adds exactly one request to a partner revision: the service-role read
// of the source's project link (ADR 0165), which decides whether the source is
// a project calc the partner may not revise. The fixtures stay the HEAD
// reference (ADR 0166 forbids re-recording them for a Step 4 change), so the
// test checks that read is exactly this request, right after the source read,
// removes it, and compares everything else byte for byte.
function withoutProjectLinkRead(recorded: RecordedRequest[], sourceId: string): RecordedRequest[] {
  const expected = {
    service: "supabase",
    client: "service",
    method: "GET",
    url: `/rest/v1/project_submissions?select=project_id&submission_id=eq.${sourceId}`,
    body: null,
  };
  const at = recorded.flatMap((r, i) => (r.url === expected.url ? [i] : []));
  assert.equal(at.length, 1, "expected exactly one project-link read of the revision source");
  assert.deepStrictEqual(recorded[at[0]], expected);
  assert.equal(
    recorded[at[0] - 1]?.url,
    `/rest/v1/submissions?select=id,pipedrive_deal_id&id=eq.${sourceId}`,
    "the project-link read must follow the source read",
  );
  return recorded.filter((_, i) => i !== at[0]);
}

const SCENARIOS: Record<string, { userId: string; payload: unknown; projectLinkReadOf?: string }> = {
  "partner-full-calculator-fresh": { userId: PARTNER_ID, payload: FULL_CALC_PAYLOAD },
  "partner-quick-calc-fresh": { userId: PARTNER_ID, payload: QUICK_CALC_PAYLOAD },
  "partner-sends-project-fields": {
    userId: PARTNER_ID,
    payload: { ...FULL_CALC_PAYLOAD, ...PROJECT_FIELDS },
  },
  "partner-revision-source-with-deal": {
    userId: PARTNER_ID,
    payload: { ...FULL_CALC_PAYLOAD, isRevision: true, sourceSubmissionId: SOURCE_WITH_DEAL_ID },
    projectLinkReadOf: SOURCE_WITH_DEAL_ID,
  },
  "partner-revision-source-without-deal": {
    userId: PARTNER_ID,
    payload: { ...FULL_CALC_PAYLOAD, isRevision: true, sourceSubmissionId: SOURCE_NO_DEAL_ID },
    projectLinkReadOf: SOURCE_NO_DEAL_ID,
  },
  "internal-on-behalf-of-partner": {
    userId: INTERNAL_ID,
    payload: { ...FULL_CALC_PAYLOAD, onBehalfOfPartnerId: TARGET_ID },
  },
  "internal-on-behalf-of-company-name": {
    userId: INTERNAL_ID,
    payload: { ...QUICK_CALC_PAYLOAD, onBehalfOfCompanyName: "Not Yet Onboarded LLC" },
  },
};

// JSON round trip so the comparison sees exactly what the fixture file holds
// (undefined dropped, Dates as ISO strings).
function normalize(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

describe("submitCalculation snapshot (partner path stays byte-identical)", () => {
  const captured: Record<string, unknown> = {};

  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    it(name, async () => {
      const outcome = normalize(await run(scenario.userId, scenario.payload)) as {
        result: { status: string; error?: string };
        requests: RecordedRequest[];
      };
      if (scenario.projectLinkReadOf) {
        outcome.requests = withoutProjectLinkRead(outcome.requests, scenario.projectLinkReadOf);
      }
      captured[name] = outcome;
      // A harness whose fakes break every save would snapshot nothing useful.
      assert.equal(outcome.result.status, "ok", `scenario did not save: ${outcome.result.error ?? ""}`);
      if (UPDATE) return;
      assert.ok(existsSync(FIXTURE_FILE), `missing fixture ${FIXTURE_FILE}; capture it on the reference commit`);
      const fixtures = JSON.parse(readFileSync(FIXTURE_FILE, "utf8")) as Record<string, unknown>;
      assert.ok(name in fixtures, `fixture has no scenario "${name}"`);
      assert.deepStrictEqual(outcome, fixtures[name]);
    });
  }

  it("a partner who sends project fields gets exactly the plain partner save", () => {
    assert.deepStrictEqual(
      captured["partner-sends-project-fields"],
      captured["partner-full-calculator-fresh"],
    );
  });

  after(() => {
    if (!UPDATE) return;
    mkdirSync(FIXTURE_DIR, { recursive: true });
    writeFileSync(FIXTURE_FILE, `${JSON.stringify(captured, null, 2)}\n`);
  });
});

// ---------------------------------------------------------------------------
// Phase B: project calcs (Project Portal Step 4, items 5 to 10)
// ---------------------------------------------------------------------------
//
// The same fakes, with the project tables seeded. These are behavior tests,
// not fixtures: no project calc existed at HEAD to capture.

const COMPANY_ID = "c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0";
const CONTACT_ID = "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1";
const PROJECT_ID = "99999999-9999-4999-8999-999999999999";
const OTHER_PROJECT_ID = "77777777-7777-4777-8777-777777777777";
const PROJECT_CALC_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SUPERSEDED_CALC_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SUSPENDED_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function seedProjectTables(): void {
  tables.partners.push({
    id: SUSPENDED_ID,
    status: "suspended",
    is_internal: false,
    pipedrive_user_id: null,
    company_name: "Escambia Integrators",
    contact_name: "Sam Suspended",
  });
  tables.current_products.push(
    { sku: "VX5-V250-MGM", product_name: "VideoX V250 Management", product_group: "V250", msrp: 14020, price_type: "numeric", active: true, hidden_from_catalog: false },
    { sku: "VX5-V255-MGM", product_name: "VideoX V255 Management", product_group: "V255", msrp: 15734, price_type: "numeric", active: true, hidden_from_catalog: false },
    { sku: "VX5-SW10-100", product_name: "VideoX SW10 Workstation", product_group: "SW10", msrp: 6426, price_type: "numeric", active: true, hidden_from_catalog: false },
    { sku: "VX5-SW20-200", product_name: "VideoX SW20 Workstation", product_group: "SW20", msrp: 7873, price_type: "numeric", active: true, hidden_from_catalog: false },
    { sku: "VX5-SW30-300", product_name: "VideoX SW30 Workstation", product_group: "SW30", msrp: 9999, price_type: "numeric", active: false, hidden_from_catalog: false },
  );
  tables.projects = [
    { id: PROJECT_ID, company_id: COMPANY_ID, primary_contact_id: CONTACT_ID, name: "Escambia County Jail Expansion, Phase Two West Wing", vms: "Avigilon" },
    { id: OTHER_PROJECT_ID, company_id: COMPANY_ID, primary_contact_id: null, name: "Escambia Courthouse", vms: null },
  ];
  tables.contacts = [{ id: CONTACT_ID, company_id: COMPANY_ID, name: "Terry Target", active: true }];
  // One login on the primary contact: the target partner.
  tables.partner_contact_links = [{ partner_id: TARGET_ID, contact_id: CONTACT_ID, company_id: COMPANY_ID }];
  tables.project_submissions = [];
  tables.submission_system_designs = [];
  tables.system_design_rules = seedSystemDesignRules();
  tables.bom_rules = seedBomRules();
}

// An earlier project calc by the rep, prepared for the target's login, and the
// version it revised.
function seedProjectCalc(): void {
  tables.submissions.push(
    {
      id: SUPERSEDED_CALC_ID,
      partner_id: INTERNAL_ID,
      on_behalf_of_partner_id: TARGET_ID,
      project_name: "West Wing v1",
      created_at: "2026-10-19T12:00:00.000Z",
      status: "open",
      parent_submission_id: null,
      pipedrive_deal_id: null,
    },
    {
      id: PROJECT_CALC_ID,
      partner_id: INTERNAL_ID,
      on_behalf_of_partner_id: TARGET_ID,
      project_name: "West Wing v2",
      created_at: "2026-10-21T12:00:00.000Z",
      status: "open",
      parent_submission_id: SUPERSEDED_CALC_ID,
      pipedrive_deal_id: null,
    },
  );
  tables.project_submissions.push(
    { submission_id: SUPERSEDED_CALC_ID, project_id: PROJECT_ID, calc_role: "primary", linked_by: INTERNAL_ID },
    { submission_id: PROJECT_CALC_ID, project_id: PROJECT_ID, calc_role: "primary", linked_by: INTERNAL_ID },
  );
}

const SYSTEM_DESIGN = {
  sfp: false,
  gpu: true,
  failover: { enabled: true },
  management: { dedicated: true, failoverPair: true, sku: "VX5-V255-MGM" },
  workstations: { count: 2, sku: "VX5-SW20-200" },
};

const PROJECT_PAYLOAD = {
  ...QUICK_CALC_PAYLOAD,
  projectName: null,
  // Sent by a stale form; a project calc ignores the picker.
  onBehalfOfCompanyName: "Ignored Company LLC",
  projectId: PROJECT_ID,
  systemDesign: SYSTEM_DESIGN,
};

// Twenty cameras for two weeks: the partner path picks one 1U V200.
const SMALL_GROUPS = [{ ...QUICK_CALC_PAYLOAD.groups[0], cameras: 20 }];

type Outcome = Awaited<ReturnType<typeof run>> & {
  result: {
    status: string;
    error?: string;
    fieldErrors?: Record<string, string[]>;
    submissionId?: string;
    recommendation?: { winner: { sku: string; units: number }; warnings: string[] };
    project?: { projectId: string; failover: { choice: { sku: string } | null } | null; bom: { sku: string; qty: number; role: string }[] };
  };
};

async function runProject(userId: string, payload: unknown): Promise<Outcome> {
  return normalize(await run(userId, payload)) as Outcome;
}

const posted = (o: Outcome, table: string) =>
  o.requests.filter((r) => r.service === "supabase" && r.method === "POST" && r.url.startsWith(`/rest/v1/${table}`));
const postedRow = (o: Outcome, table: string) => {
  const rows = posted(o, table);
  assert.equal(rows.length, 1, `expected one insert into ${table}`);
  return JSON.parse(rows[0].body ?? "null") as Row;
};
const pipedriveCalls = (o: Outcome) => o.requests.filter((r) => r.service === "pipedrive");
// The row as it stands after the save, server-side updates included.
const savedRow = (o: Outcome) => tables.submissions.find((r) => r.id === o.result.submissionId);

describe("submitCalculation project calcs (Phase B)", () => {
  beforeEach(() => {
    seedProjectTables();
  });

  it("an internal project calc saves a v4 row, links it, banks the design, emails sales only and calls no Pipedrive", async () => {
    const o = await runProject(INTERNAL_ID, PROJECT_PAYLOAD);
    assert.equal(o.result.status, "ok", o.result.error);

    const row = postedRow(o, "submissions");
    const sent = posted(o, "submissions")[0];
    assert.equal(sent.client, "anon", "the row is inserted with the rep's session, as today");
    const inputState = row.input_state as Record<string, unknown>;
    assert.equal(inputState.version, 4);
    assert.ok(!("addOnFailoverRecorder" in inputState) && !("addOnManagementServer" in inputState));
    assert.equal(row.on_behalf_of_partner_id, null, "inserted visible to Arxys only");
    assert.equal(savedRow(o)?.on_behalf_of_partner_id, TARGET_ID, "then the primary contact's one login sees it");
    assert.equal(row.on_behalf_of_company_name, null, "never the company name");
    assert.equal(row.parent_submission_id, null);
    assert.equal(row.project_name, "Escambia County Jail Expansion, Phase Two West Win", "the project name, cut to 50");
    assert.equal(row.calc_version, 3, "calc_version is not bumped: the banked figures mean what they did");

    const link = postedRow(o, "project_submissions");
    assert.equal(posted(o, "project_submissions")[0].client, "anon", "the link goes through the internal RLS policy");
    assert.deepStrictEqual(link, {
      submission_id: o.result.submissionId,
      project_id: PROJECT_ID,
      calc_role: "primary",
      linked_by: INTERNAL_ID,
    });

    const banked = postedRow(o, "submission_system_designs");
    assert.equal(posted(o, "submission_system_designs")[0].client, "service");
    assert.equal(banked.submission_id, o.result.submissionId);
    assert.equal(banked.created_by, INTERNAL_ID);
    assert.equal(banked.engine_version, "2026-10-19");
    assert.deepStrictEqual(banked.bom, o.result.project?.bom);
    const design = banked.resolved_design as { gpu: boolean; management: { units: number; sku: string } };
    assert.equal(design.gpu, true);
    assert.deepStrictEqual(design.management, { dedicated: true, units: 2, sku: "VX5-V255-MGM" });
    assert.equal((banked.rules_snapshot as { snapshotVersion: number }).snapshotVersion, 1);

    // The rules and the catalog came from the database, and the pool from the
    // project-only loader.
    const urls = o.requests.map((r) => r.url);
    assert.ok(urls.some((u) => u.startsWith("/rest/v1/system_design_rules?")));
    assert.ok(urls.some((u) => u.startsWith("/rest/v1/bom_rules?")));
    assert.ok(urls.includes("/rest/v1/product_specs?select=id,max_cameras,storage_raw_tb,hdd_count,raid_level_display,rack_units,sfp_addon"));

    const bom = o.result.project!.bom;
    const line = (role: string, sku: string) => bom.find((l) => l.role === role && l.sku === sku);
    assert.ok(line("recorder", o.result.recommendation!.winner.sku));
    assert.equal(line("recorder", "VX5-GPU-A1000")?.qty, o.result.recommendation!.winner.units);
    assert.ok(o.result.project!.failover?.choice, "failover is sized");
    assert.equal(line("mgmt", "VX5-V255-MGM")?.qty, 2);
    assert.equal(line("workstation", "VX5-SW20-200")?.qty, 2);

    assert.equal(pipedriveCalls(o).length, 0, "no Pipedrive call");
    assert.ok(!o.requests.some((r) => r.body?.includes("pipedrive_deal_id")), "no deal link");
    // The grant comes after the link and the design are saved, then the stamp.
    const writes = o.requests.filter((r) => r.method !== "GET").map((r) => `${r.method} ${r.url.split("?")[0]} ${r.client}`);
    assert.deepStrictEqual(writes, [
      "POST /rest/v1/submissions anon",
      "POST /rest/v1/project_submissions anon",
      "POST /rest/v1/submission_system_designs service",
      "PATCH /rest/v1/submissions service",
      "PATCH /rest/v1/submissions service",
    ]);
    const stamps = o.requests.filter((r) => r.method === "PATCH");
    assert.deepStrictEqual(
      stamps.map((r) => [r.client, r.body]),
      [
        ["service", JSON.stringify({ on_behalf_of_partner_id: TARGET_ID })],
        ["service", JSON.stringify({ email_sent_at: FROZEN_NOW.toISOString() })],
      ],
    );

    assert.equal(o.emails.length, 1, "the sales notification is sent");
    const email = o.emails[0] as Record<string, unknown>;
    assert.ok(!("partnerEmail" in email), "no partner copy: sales@ (INTERNAL_NOTIFICATION_EMAIL) only");
    assert.equal(email.submissionId, o.result.submissionId);
    assert.equal(email.pdfBuffer, "PDF-STUB", "with the PDF, as today");
    assert.equal(o.pdfRenders.length, 1);
  });

  it("a partner who sends project fields touches no project table", async () => {
    const o = await runProject(PARTNER_ID, { ...FULL_CALC_PAYLOAD, ...PROJECT_FIELDS, projectId: PROJECT_ID });
    assert.equal(o.result.status, "ok");
    const touched = o.requests.filter((r) =>
      /\/rest\/v1\/(projects|project_submissions|partner_contact_links|submission_system_designs|system_design_rules|bom_rules)\b/.test(r.url),
    );
    assert.deepStrictEqual(touched, []);
    assert.equal((postedRow(o, "submissions").input_state as { version: number }).version, 3);
    assert.ok(pipedriveCalls(o).length > 0, "the partner path still makes its deal");
  });

  it("refuses a project that does not exist, before writing anything", async () => {
    const o = await runProject(INTERNAL_ID, { ...PROJECT_PAYLOAD, projectId: "12121212-1212-4212-8212-121212121212" });
    assert.equal(o.result.status, "error");
    assert.equal(o.result.error, "That project was not found. It may have been deleted.");
    assert.equal(o.requests.filter((r) => r.method !== "GET").length, 0);
    assert.equal(o.emails.length, 0);
  });

  it("SFP+ moves a calc that would have picked a 1U V200 onto a 2U server, with the NIC pair on each", async () => {
    const plain = await runProject(INTERNAL_ID, {
      ...PROJECT_PAYLOAD,
      groups: SMALL_GROUPS,
      systemDesign: { sfp: false },
    });
    assert.equal(plain.result.status, "ok", plain.result.error);
    assert.equal(plain.result.recommendation!.winner.sku, "VX5-V200-64");

    const withSfp = await runProject(INTERNAL_ID, {
      ...PROJECT_PAYLOAD,
      groups: SMALL_GROUPS,
      systemDesign: { sfp: true },
    });
    assert.equal(withSfp.result.status, "ok", withSfp.result.error);
    const winner = withSfp.result.recommendation!.winner;
    assert.equal(winner.sku, "VX5-V400-128");
    const bom = withSfp.result.project!.bom;
    for (const sku of ["VX5-NIC-SFP28", "VX5-NIC-SFP28x10"]) {
      assert.equal(bom.find((l) => l.role === "recorder" && l.sku === sku)?.qty, winner.units);
    }
    const row = JSON.parse(posted(withSfp, "submissions").at(-1)!.body!) as Row;
    assert.equal(row.recommended_product_id, "VX5-V400-128");
  });

  describe("the primary contact's logins", () => {
    const cases: [string, () => void, string | null][] = [
      ["none: no visibility grant", () => { tables.partner_contact_links = []; }, null],
      ["one active partner: that login", () => {}, TARGET_ID],
      [
        "several: none of them",
        () => { tables.partner_contact_links.push({ partner_id: PARTNER_ID, contact_id: CONTACT_ID, company_id: COMPANY_ID }); },
        null,
      ],
      [
        "one suspended login: none",
        () => { tables.partner_contact_links = [{ partner_id: SUSPENDED_ID, contact_id: CONTACT_ID, company_id: COMPANY_ID }]; },
        null,
      ],
      [
        "the contact moved to another company: none",
        () => { tables.contacts[0].company_id = "c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2"; },
        null,
      ],
      [
        "the contact is inactive: none",
        () => { tables.contacts[0].active = false; },
        null,
      ],
      [
        "one internal login: none",
        () => { tables.partner_contact_links = [{ partner_id: INTERNAL_ID, contact_id: CONTACT_ID, company_id: COMPANY_ID }]; },
        null,
      ],
    ];
    for (const [name, arrange, expected] of cases) {
      it(name, async () => {
        arrange();
        const o = await runProject(INTERNAL_ID, PROJECT_PAYLOAD);
        assert.equal(o.result.status, "ok", o.result.error);
        assert.equal(savedRow(o)?.on_behalf_of_partner_id, expected);
        assert.equal(savedRow(o)?.on_behalf_of_company_name, null);
        if (expected === null) {
          assert.ok(!o.requests.some((r) => r.method === "PATCH" && r.body?.includes("on_behalf")), "no grant written");
        }
      });
    }
  });

  it("scopes the duplicate guard to the project and ignores earlier versions of a calc", async () => {
    seedProjectCalc();
    tables.submissions.push(
      // In another project: not this project's duplicate.
      { id: "e0e0e0e0-e0e0-4e0e-8e0e-e0e0e0e0e0e0", partner_id: INTERNAL_ID, project_name: "Courthouse", created_at: "2026-10-21T12:00:00.000Z", status: "open", parent_submission_id: null },
      // In this project, but older than 14 days, or lost.
      { id: "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1", partner_id: INTERNAL_ID, project_name: "Old", created_at: "2026-09-01T12:00:00.000Z", status: "open", parent_submission_id: null },
      { id: "e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2", partner_id: INTERNAL_ID, project_name: "Lost", created_at: "2026-10-21T12:00:00.000Z", status: "lost", parent_submission_id: null },
    );
    tables.project_submissions.push(
      { submission_id: "e0e0e0e0-e0e0-4e0e-8e0e-e0e0e0e0e0e0", project_id: OTHER_PROJECT_ID, calc_role: "primary" },
      { submission_id: "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1", project_id: PROJECT_ID, calc_role: "primary" },
      { submission_id: "e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2", project_id: PROJECT_ID, calc_role: "primary" },
    );

    const fresh = await runProject(INTERNAL_ID, PROJECT_PAYLOAD);
    assert.equal(fresh.result.status, "ok", fresh.result.error);
    const dup = fresh.result.recommendation!.warnings.filter((w) => w.startsWith("This project already has"));
    assert.deepStrictEqual(dup, [
      'This project already has 1 other open calc from the last 14 days ("West Wing v2"). Check the project before quoting it twice.',
    ]);
    assert.ok(!fresh.requests.some((r) => r.url.includes("on_behalf_of")), "not the on-behalf guard");
  });

  it("a revision of the project's current calc is not its own duplicate", async () => {
    seedProjectCalc();
    const o = await runProject(INTERNAL_ID, { ...PROJECT_PAYLOAD, projectId: null, isRevision: true, sourceSubmissionId: PROJECT_CALC_ID });
    assert.equal(o.result.status, "ok", o.result.error);
    assert.deepStrictEqual(o.result.recommendation!.warnings.filter((w) => w.startsWith("This project already has")), []);
  });

  it("refuses an oversized SKU at the boundary", async () => {
    const o = await runProject(INTERNAL_ID, {
      ...PROJECT_PAYLOAD,
      systemDesign: { ...SYSTEM_DESIGN, management: { dedicated: true, sku: "X".repeat(41) } },
    });
    assert.equal(o.result.status, "error");
    assert.ok(o.result.fieldErrors?.["systemDesign.management.sku"]);
    assert.ok(
      o.requests.every((r) => r.method === "GET" && r.url.startsWith("/rest/v1/partners?")),
      "nothing ran past the caller's own account reads",
    );
  });

  it("returns the resolver's plain message for a SKU outside the catalog", async () => {
    const o = await runProject(INTERNAL_ID, {
      ...PROJECT_PAYLOAD,
      systemDesign: { ...SYSTEM_DESIGN, workstations: { count: 1, sku: "VX5-SW30-300" } },
    });
    assert.equal(o.result.status, "error");
    assert.deepStrictEqual(o.result.fieldErrors?.systemDesign, ["VX5-SW30-300 is not an active workstation SKU."]);
    assert.equal(posted(o, "submissions").length, 0);
  });

  it("logs a sizing failure and gives the rep a plain message without engine text", async () => {
    for (const spec of tables.product_specs) spec.rack_units = "1U";
    const o = await runProject(INTERNAL_ID, { ...PROJECT_PAYLOAD, systemDesign: { sfp: true } });
    assert.equal(o.result.status, "error");
    assert.equal(
      o.result.error,
      "This system design could not be sized. Check the choices and try again, or ask an admin for help.",
    );
    assert.ok(!o.result.error!.includes("recommend()"));
    assert.ok(o.logs.some((l) => l.level === "error" && l.message === "project calc sizing failed"));
    assert.equal(posted(o, "submissions").length, 0);
  });

  it("an internal revision of a project calc is a new primary calc in the same project, with no Pipedrive call and no email", async () => {
    seedProjectCalc();
    const sourceLink = tables.project_submissions.find((l) => l.submission_id === PROJECT_CALC_ID);
    const before = JSON.stringify(sourceLink);
    const o = await runProject(INTERNAL_ID, {
      ...PROJECT_PAYLOAD,
      projectId: null,
      isRevision: true,
      sourceSubmissionId: PROJECT_CALC_ID,
    });
    assert.equal(o.result.status, "ok", o.result.error);
    assert.equal(o.result.project?.projectId, PROJECT_ID, "the project comes from the source");
    const row = postedRow(o, "submissions");
    assert.equal(row.parent_submission_id, PROJECT_CALC_ID);
    assert.equal((row.input_state as { version: number }).version, 4);
    assert.deepStrictEqual(postedRow(o, "project_submissions"), {
      submission_id: o.result.submissionId,
      project_id: PROJECT_ID,
      calc_role: "primary",
      linked_by: INTERNAL_ID,
    });
    assert.equal(JSON.stringify(sourceLink), before, "the source's link is untouched");
    assert.ok(!o.requests.some((r) => r.method === "DELETE"));
    assert.deepStrictEqual(
      o.requests.filter((r) => r.method === "PATCH").map((r) => r.body),
      [JSON.stringify({ on_behalf_of_partner_id: TARGET_ID })],
      "only the visibility grant: no email stamp, no deal link",
    );
    assert.equal(posted(o, "submission_system_designs").length, 1, "its own banked design");
    assert.equal(pipedriveCalls(o).length, 0);
    assert.equal(o.emails.length, 0);
    assert.equal(o.pdfRenders.length, 0);
  });

  it("refuses a revision whose projectId differs from the source's project", async () => {
    seedProjectCalc();
    const o = await runProject(INTERNAL_ID, {
      ...PROJECT_PAYLOAD,
      projectId: OTHER_PROJECT_ID,
      isRevision: true,
      sourceSubmissionId: PROJECT_CALC_ID,
    });
    assert.equal(o.result.status, "error");
    assert.equal(o.result.error, "This calc belongs to a different project. Open it from its own project and try again.");
    assert.equal(o.requests.filter((r) => r.method !== "GET").length, 0);
  });

  it("refuses to move a calc outside any project into one by revising it", async () => {
    const o = await runProject(INTERNAL_ID, {
      ...PROJECT_PAYLOAD,
      isRevision: true,
      sourceSubmissionId: SOURCE_WITH_DEAL_ID,
    });
    assert.equal(o.result.status, "error");
    assert.match(o.result.error!, /not part of a project/);
    assert.equal(o.requests.filter((r) => r.method !== "GET").length, 0);
    assert.equal(pipedriveCalls(o).length, 0);
  });

  it("refuses a non-internal caller revising a project calc, with no Pipedrive call", async () => {
    seedProjectCalc();
    // A source with a deal: the refusal must come before the design carry and the deal link (ADR 0173).
    tables.submissions.find((r) => r.id === PROJECT_CALC_ID)!.pipedrive_deal_id = 5589;
    // The primary contact's login can see the calc through on_behalf_of_partner_id.
    const o = await runProject(TARGET_ID, {
      ...FULL_CALC_PAYLOAD,
      isRevision: true,
      sourceSubmissionId: PROJECT_CALC_ID,
    });
    assert.equal(o.result.status, "error");
    assert.equal(o.result.error, "Arxys prepared this quote, so only Arxys can revise it. Ask your Arxys rep for a change.");
    assert.equal(o.requests.filter((r) => r.method !== "GET").length, 0);
    assert.ok(!o.requests.some((r) => r.url.includes("submission_system_designs")), "the banked design is never read");
    assert.equal(pipedriveCalls(o).length, 0);
    assert.equal(o.emails.length, 0);
  });

  it("undoes the save when the design cannot be banked", async () => {
    failInsertInto.add("submission_system_designs");
    const before = tables.submissions.length;
    const o = await runProject(INTERNAL_ID, PROJECT_PAYLOAD);
    assert.equal(o.result.status, "error");
    assert.equal(o.result.error, "The calc could not be saved to its project. Please try again.");
    const undo = o.requests.filter((r) => r.method === "DELETE");
    assert.equal(undo.length, 1);
    assert.equal(undo[0].client, "service");
    assert.match(undo[0].url, /^\/rest\/v1\/submissions\?id=eq\./);
    assert.equal(tables.submissions.length, before, "the row is gone");
    assert.equal(tables.project_submissions.length, 0, "and its link with it");
    assert.equal(pipedriveCalls(o).length, 0);
    assert.equal(o.emails.length, 0);
  });

  it("undoes the save when the project link is refused", async () => {
    failInsertInto.add("project_submissions");
    const before = tables.submissions.length;
    const o = await runProject(INTERNAL_ID, PROJECT_PAYLOAD);
    assert.equal(o.result.error, "The calc could not be saved to its project. Please try again.");
    assert.equal(posted(o, "submission_system_designs").length, 0, "no design banked for an unlinked row");
    assert.equal(tables.submissions.length, before);
    assert.ok(o.logs.some((l) => l.message === "[link project calc]"));
  });

  it("leaves a row only Arxys can see when even the undo fails", async () => {
    failInsertInto.add("submission_system_designs");
    failDeleteFrom.add("submissions");
    const o = await runProject(INTERNAL_ID, PROJECT_PAYLOAD);
    assert.equal(o.result.status, "error");
    assert.ok(o.logs.some((l) => l.message === "[undo project calc]"));
    const orphan = tables.submissions.find((r) => (r.input_state as { version?: number } | undefined)?.version === 4);
    assert.ok(orphan, "the row is still there");
    assert.equal(orphan.on_behalf_of_partner_id, null, "and the contact's login cannot see it");
  });

  it("undoes the save when the visibility grant cannot be written", async () => {
    failPatchOn.add("on_behalf_of_partner_id");
    const before = tables.submissions.length;
    const o = await runProject(INTERNAL_ID, PROJECT_PAYLOAD);
    assert.equal(o.result.error, "The calc could not be saved to its project. Please try again.");
    assert.equal(o.requests.filter((r) => r.method === "DELETE").length, 1);
    assert.equal(tables.submissions.length, before);
    assert.equal(tables.submission_system_designs.length, 0, "the banked design cascades away");
    assert.equal(o.emails.length, 0);
  });

  it("refuses a project revision whose source cannot be found", async () => {
    const o = await runProject(INTERNAL_ID, {
      ...PROJECT_PAYLOAD,
      isRevision: true,
      sourceSubmissionId: "abababab-abab-4bab-8bab-abababababab",
    });
    assert.equal(o.result.error, "The calc you are revising was not found. Reload its project and try again.");
    assert.equal(o.requests.filter((r) => r.method !== "GET").length, 0);
  });

  it("staff relink refuses a row whose parent is a project calc", async () => {
    seedProjectCalc();
    // A child only a direct REST insert could make (ADR 0167 residual), with
    // everything relink needs to build a deal.
    const childId = "fafafafa-fafa-4afa-8afa-fafafafafafa";
    const child: Row = {
      id: childId,
      partner_id: TARGET_ID,
      parent_submission_id: SOURCE_NO_DEAL_ID,
      pipedrive_deal_id: null,
      status: "open",
      project_name: "Planted",
      vms: null,
      retention_days: 30,
      cameras_count: 40,
      bandwidth_mbps: 100,
      storage_tb: 60,
      recommended_product_id: "VX5-V400-128",
      recommended_units: 1,
      total_list_price_usd: 39950,
      created_at: "2026-10-22T12:00:00.000Z",
      groups_payload: {
        groups: [
          { resolutionLabel: "4MP (2560×1440)", codec: "h265", complexity: "med", fps: 15, recordingPercent: 100, motionPercent: 100, cameras: 40 },
        ],
      },
      input_state: { version: 3 },
      on_behalf_of_partner_id: null,
      on_behalf_of_company_name: null,
    };
    tables.submissions.push(child);
    currentUserId = INTERNAL_ID;

    // Control: with a parent outside any project, the same row relinks.
    const control = (await adminRelinkPipedriveDeal(childId)) as { ok: boolean; error?: string };
    assert.equal(control.ok, true, control.error);
    assert.ok(requests.some((r) => r.service === "pipedrive"));

    child.pipedrive_deal_id = null;
    child.parent_submission_id = PROJECT_CALC_ID;
    requests = [];
    const refused = await adminRelinkPipedriveDeal(childId);
    assert.deepStrictEqual(refused, {
      ok: false,
      error: "This calc belongs to a project, or revises one. Its Pipedrive deal is made from the project, so there is nothing to relink here.",
    });
    assert.equal(requests.filter((r) => r.service === "pipedrive").length, 0);
    assert.equal(requests.filter((r) => r.method !== "GET").length, 0);
  });

  it("a revision sent with no system design keeps its source's banked design (ADR 0173)", async () => {
    // The source is saved first, so its design is banked the way a real save banks it.
    const first = await runProject(INTERNAL_ID, PROJECT_PAYLOAD);
    assert.equal(first.result.status, "ok", first.result.error);
    const sourceId = first.result.submissionId!;
    const sourceBom = first.result.project!.bom;
    const o = await runProject(INTERNAL_ID, {
      ...PROJECT_PAYLOAD,
      projectId: null,
      systemDesign: undefined,
      isRevision: true,
      sourceSubmissionId: sourceId,
    });
    assert.equal(o.result.status, "ok", o.result.error);
    assert.equal(o.result.project?.projectId, PROJECT_ID);
    assert.deepStrictEqual(o.result.project?.bom, sourceBom, "same groups, same carried design, same BOM");
    const banked = tables.submission_system_designs.find((d) => d.submission_id === o.result.submissionId);
    const source = tables.submission_system_designs.find((d) => d.submission_id === sourceId);
    assert.deepStrictEqual(banked?.resolved_design, source?.resolved_design);
    assert.equal(pipedriveCalls(o).length, 0);
  });

  it("a revision of a project calc that has a deal stays on that deal, with no Pipedrive call (ADR 0173)", async () => {
    const first = await runProject(INTERNAL_ID, PROJECT_PAYLOAD);
    assert.equal(first.result.status, "ok", first.result.error);
    const sourceId = first.result.submissionId!;
    tables.submissions.find((r) => r.id === sourceId)!.pipedrive_deal_id = 5589;
    const emailsBefore = first.emails.length;
    const o = await runProject(INTERNAL_ID, {
      ...PROJECT_PAYLOAD,
      projectId: null,
      systemDesign: undefined,
      isRevision: true,
      sourceSubmissionId: sourceId,
    });
    assert.equal(o.result.status, "ok", o.result.error);
    assert.equal(tables.submissions.find((r) => r.id === o.result.submissionId)?.pipedrive_deal_id, 5589);
    const link = o.requests.find((r) => r.method === "PATCH" && r.body === JSON.stringify({ pipedrive_deal_id: 5589 }));
    assert.ok(link, "the deal link is written");
    assert.equal(link?.client, "service");
    assert.match(link?.url ?? "", /pipedrive_deal_id=is\.null/);
    assert.equal(pipedriveCalls(o).length, 0, "no Pipedrive call: the deal and its lines are not touched");
    assert.equal(o.emails.length, emailsBefore, "a revision sends no email");
    assert.ok(o.result.recommendation?.warnings.some((w) => /deal #5589 still has the lines/.test(w)));
  });

  it("a revision whose deal link fails is still saved, with a warning (ADR 0173)", async () => {
    const first = await runProject(INTERNAL_ID, PROJECT_PAYLOAD);
    const sourceId = first.result.submissionId!;
    tables.submissions.find((r) => r.id === sourceId)!.pipedrive_deal_id = 5589;
    failPatchOn.add("pipedrive_deal_id");
    const o = await runProject(INTERNAL_ID, {
      ...PROJECT_PAYLOAD,
      projectId: null,
      isRevision: true,
      sourceSubmissionId: sourceId,
    });
    assert.equal(o.result.status, "ok", o.result.error);
    assert.ok(o.result.recommendation?.warnings.some((w) => /could not be linked to Pipedrive deal #5589/.test(w)));
    assert.equal(pipedriveCalls(o).length, 0);
  });

  it("refuses a project revision sent with no system design when its source has none banked", async () => {
    seedProjectCalc();
    const o = await runProject(INTERNAL_ID, {
      ...PROJECT_PAYLOAD,
      projectId: null,
      systemDesign: null,
      isRevision: true,
      sourceSubmissionId: PROJECT_CALC_ID,
    });
    assert.equal(o.result.status, "error");
    assert.equal(
      o.result.error,
      "This calc belongs to a project. Open it from its project so its system design is saved with it.",
    );
    assert.equal(o.requests.filter((r) => r.method !== "GET").length, 0);
  });

  it("refuses a partner revision when the project link cannot be read", async () => {
    failReadFrom.add("project_submissions");
    const o = await runProject(PARTNER_ID, { ...FULL_CALC_PAYLOAD, isRevision: true, sourceSubmissionId: SOURCE_WITH_DEAL_ID });
    assert.equal(o.result.status, "error");
    assert.equal(o.result.error, "We could not check the quote you are revising. Please try again.");
    assert.equal(o.requests.filter((r) => r.method !== "GET").length, 0);
    assert.equal(pipedriveCalls(o).length, 0);
  });

  it("an internal on-behalf revision outside any project still revises the source's deal", async () => {
    tables.submissions.push({ id: "f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0", partner_id: INTERNAL_ID, on_behalf_of_partner_id: TARGET_ID, pipedrive_deal_id: 8002, status: "open" });
    const o = await runProject(INTERNAL_ID, {
      ...FULL_CALC_PAYLOAD,
      onBehalfOfPartnerId: TARGET_ID,
      isRevision: true,
      sourceSubmissionId: "f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0",
    });
    assert.equal(o.result.status, "ok", o.result.error);
    const row = postedRow(o, "submissions");
    assert.equal((row.input_state as { version: number }).version, 3);
    assert.equal(row.on_behalf_of_partner_id, TARGET_ID);
    assert.equal(row.parent_submission_id, "f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0");
    assert.ok(pipedriveCalls(o).some((r) => r.method === "PUT" && r.url.startsWith("/v1/deals/8002")));
    assert.equal(posted(o, "project_submissions").length, 0);
  });

  it("staff relink refuses a project calc instead of making a deal by name", async () => {
    seedProjectCalc();
    currentUserId = INTERNAL_ID;
    const result = await adminRelinkPipedriveDeal(PROJECT_CALC_ID);
    assert.deepStrictEqual(result, {
      ok: false,
      error: "This calc belongs to a project, or revises one. Its Pipedrive deal is made from the project, so there is nothing to relink here.",
    });
    assert.equal(requests.filter((r) => r.service === "pipedrive").length, 0);
    assert.equal(requests.filter((r) => r.method !== "GET").length, 0);
  });
});
