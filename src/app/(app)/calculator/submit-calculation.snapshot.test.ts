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
// Needs --experimental-test-module-mocks (set in the `test` script).
// Refresh the fixtures (only on a commit whose partner path is the reference):
//   UPDATE_SUBMIT_SNAPSHOTS=1 npx tsx --test --experimental-test-module-mocks \
//     "src/app/(app)/calculator/submit-calculation.snapshot.test.ts"

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

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

function newInsertId(): string {
  insertCounter += 1;
  return `aaaaaaaa-aaaa-4aaa-8aaa-${String(insertCounter).padStart(12, "0")}`;
}

// PostgREST filter subset: `col=eq.value` and `col=ilike.pattern` narrow; every
// other operator (gte, order, limit) is ignored, since the fixture rows already
// satisfy them. `select=a,b` projects plain column lists.
function queryRows(table: string, params: URLSearchParams): Row[] {
  let rows = tables[table] ?? [];
  for (const [key, value] of params) {
    if (["select", "order", "limit", "offset", "columns"].includes(key)) continue;
    if (value.startsWith("eq.")) {
      const want = value.slice(3);
      rows = rows.filter((r) => String(r[key]) === want);
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
      return postgrestResponse(project(queryRows(table, url.searchParams), select), accept);
    }
    if (method === "POST") {
      const parsed = JSON.parse(body ?? "{}") as Row | Row[];
      const inserted = (Array.isArray(parsed) ? parsed : [parsed]).map((r) => ({ id: newInsertId(), ...r }));
      (tables[table] ??= []).push(...inserted);
      return postgrestResponse(project(inserted, select), accept, 201);
    }
    if (method === "PATCH") {
      const patch = JSON.parse(body ?? "{}") as Row;
      const hit = queryRows(table, url.searchParams);
      for (const r of hit) Object.assign(r, patch);
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

before(async () => {
  mock.timers.enable({ apis: ["Date"], now: FROZEN_NOW });
  globalThis.fetch = fakeFetch as typeof fetch;

  mock.module("server-only", { namedExports: {} });

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
});

after(() => {
  mock.timers.reset();
  mock.restoreAll();
});

beforeEach(() => {
  tables = seedTables();
  insertCounter = 0;
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

const SCENARIOS: Record<string, { userId: string; payload: unknown }> = {
  "partner-full-calculator-fresh": { userId: PARTNER_ID, payload: FULL_CALC_PAYLOAD },
  "partner-quick-calc-fresh": { userId: PARTNER_ID, payload: QUICK_CALC_PAYLOAD },
  "partner-sends-project-fields": {
    userId: PARTNER_ID,
    payload: { ...FULL_CALC_PAYLOAD, ...PROJECT_FIELDS },
  },
  "partner-revision-source-with-deal": {
    userId: PARTNER_ID,
    payload: { ...FULL_CALC_PAYLOAD, isRevision: true, sourceSubmissionId: SOURCE_WITH_DEAL_ID },
  },
  "partner-revision-source-without-deal": {
    userId: PARTNER_ID,
    payload: { ...FULL_CALC_PAYLOAD, isRevision: true, sourceSubmissionId: SOURCE_NO_DEAL_ID },
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
      };
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
