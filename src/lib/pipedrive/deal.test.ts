import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Env vars must exist before the env module materializes them.
process.env.PIPEDRIVE_API_TOKEN ??= "test-token";

// The Pipedrive modules import "server-only", which throws under plain Node.
// `npm test` passes `--conditions=react-server` so the import resolves to the
// empty module — matching the Next.js server runtime where this code actually
// runs.

import type { RecommendationResult } from "@/lib/recommend/types";

type FetchCall = { url: string; method: string; body: unknown };

const calls: FetchCall[] = [];

type Responder = (url: URL, method: string, body: unknown) => unknown;

let responder: Responder = () => ({ success: true, data: {} });

function installFetchMock(): void {
  globalThis.fetch = (async (input: Request | string | URL, init?: RequestInit) => {
    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(urlStr);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url: urlStr, method, body });
    const data = responder(url, method, body);
    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

const PIPELINE_ID = 7;
const STAGE_ID = 42;
const OWNER_ID = 101;
const ORG_ID = 555;
const PERSON_ID = 777;
const DEAL_ID = 9001;
const NOTE_ID = 9101;
// An existing deal id a revision updates in place.
const EXISTING_DEAL_ID = 8800;

const CUSTOM_FIELD_KEYS: Record<string, string> = {
  arxys_submission_id: "key_subid",
  arxys_total_cameras: "key_cams",
  arxys_bandwidth_mbps: "key_bw",
  arxys_storage_gb: "key_storage",
  arxys_recommended_models: "key_models",
  arxys_portal_url: "key_url",
};

// Admin-curated calculator fields. Hashed keys match what `/v1/dealFields`
// returns; the test asserts the deal payload uses these keys when populated.
const CALC_FIELD_KEYS: Record<string, string> = {
  "Project Name": "calc_project_name",
  VMS: "calc_vms",
  "Camera Streams": "calc_cams",
  Recording: "calc_recording",
  "Motion Activity Est. %": "calc_motion",
  "Frame Rate": "calc_fps",
  Resolution: "calc_resolution",
  "Retention Days": "calc_retention",
  CODEC: "calc_codec",
  "Total Storage": "calc_storage",
  "Scene Complexity": "calc_complexity",
  "Recording hours": "calc_hours",
  "Recommended Server": "calc_server",
};

function allDealFields(): Array<{ id: number; name: string; key: string; field_type: string }> {
  const arxys = Object.entries(CUSTOM_FIELD_KEYS).map(([name, key], i) => ({
    id: 1000 + i,
    name,
    key,
    field_type: "varchar" as const,
  }));
  const calc = Object.entries(CALC_FIELD_KEYS).map(([name, key], i) => ({
    id: 2000 + i,
    name,
    key,
    field_type: "varchar" as const,
  }));
  return [...arxys, ...calc];
}

function defaultResponder(url: URL, method: string, body: unknown): unknown {
  const path = url.pathname;
  if (path === "/v1/pipelines" && method === "GET") {
    return [
      { id: 1, name: "Other Pipeline" },
      { id: PIPELINE_ID, name: "Project Pipeline" },
    ];
  }
  if (path === "/v1/stages" && method === "GET") {
    return [
      { id: STAGE_ID, name: "New Lead", pipeline_id: PIPELINE_ID },
      { id: 43, name: "Contacted", pipeline_id: PIPELINE_ID },
    ];
  }
  if (path === "/v1/users" && method === "GET") {
    return [{ id: OWNER_ID, name: "Andy Newbom", email: "andy@arxys.com" }];
  }
  if (path === "/v1/dealFields" && method === "GET") {
    return allDealFields();
  }
  if (path === "/v1/organizations/search" && method === "GET") {
    return { items: [{ item: { id: ORG_ID } }] };
  }
  if (path === "/v1/persons/search" && method === "GET") {
    return { items: [{ item: { id: PERSON_ID } }] };
  }
  if (path === "/v1/deals" && method === "POST") {
    const payload = body as { title: string; value: number };
    return { id: DEAL_ID, title: payload.title, value: payload.value };
  }
  if (path.startsWith("/v1/deals/") && method === "PUT") {
    const payload = body as { value?: number };
    return { id: EXISTING_DEAL_ID, title: "Existing Deal", value: payload.value ?? 0 };
  }
  if (path === "/v1/notes" && method === "POST") {
    return { id: NOTE_ID };
  }
  throw new Error(`Unmocked request: ${method} ${path}`);
}

function fixtureRecommendation(): RecommendationResult {
  return {
    winner: {
      // Phase 2 Step 3+4: new candidate shape — SKU + productGroup + msrp.
      sku: "VX5-V800-720",
      productGroup: "V800",
      productName: "VideoX V800 720TB 4U 36Bay Rack - V5 Video & Analytics Server",
      units: 3,
      unitMsrp: 74048,
      totalCostUsd: 222144,
      coveredCameras: 975,
      coveredStorageTb: 2160,
      driverDimension: "cameras",
    },
    alternatives: [],
    warnings: ["Solution stacks 3 units — verify rack space and power before quoting."],
  };
}

const fixtureSubmission = {
  submissionId: "11111111-2222-3333-4444-555555555555",
  projectName: "Test Campus",
  vms: "Milestone",
  retentionDays: 30,
  totals: { cameras: 900, bandwidthMbps: 3240.5, storageGb: 1500000.789 },
  groups: [
    {
      resolutionLabel: "4MP (2560×1440)",
      codec: "h265",
      complexity: "med",
      fps: 15,
      recordingPercent: 100,
      motionPercent: 35,
      cameras: 900,
    },
  ],
};

const fixturePartner = {
  companyName: "Acme Integrators",
  contactName: "Jane Partner",
  email: "jane@acme.example.com",
};

let createDealFromSubmission: typeof import("./deal").createDealFromSubmission;
let updateDealFromRevision: typeof import("./deal").updateDealFromRevision;
let resetCache: typeof import("./lookups").__resetLookupCache;

before(async () => {
  installFetchMock();
  ({ createDealFromSubmission, updateDealFromRevision } = await import("./deal"));
  ({ __resetLookupCache: resetCache } = await import("./lookups"));
});

beforeEach(() => {
  calls.length = 0;
  responder = defaultResponder;
  resetCache();
});

describe("createDealFromSubmission", () => {
  it("builds the Deal payload with real totalCostUsd value and the expected custom-field keys", async () => {
    const result = await createDealFromSubmission(
      fixtureSubmission,
      fixtureRecommendation(),
      fixturePartner,
    );
    assert.equal(result.dealId, DEAL_ID);

    const dealCall = calls.find((c) => c.url.includes("/v1/deals") && c.method === "POST");
    assert.ok(dealCall, "expected a POST /v1/deals call");
    const body = dealCall.body as Record<string, unknown>;

    assert.equal(body.title, "Test Campus");
    assert.equal(body.value, 222144);
    assert.equal(body.currency, "USD");
    assert.equal(body.pipeline_id, PIPELINE_ID);
    assert.equal(body.stage_id, STAGE_ID);
    assert.equal(body.user_id, OWNER_ID);
    assert.equal(body.person_id, PERSON_ID);
    assert.equal(body.org_id, ORG_ID);
    assert.equal(body[CUSTOM_FIELD_KEYS.arxys_submission_id], fixtureSubmission.submissionId);
    assert.equal(body[CUSTOM_FIELD_KEYS.arxys_total_cameras], 900);
    assert.equal(body[CUSTOM_FIELD_KEYS.arxys_bandwidth_mbps], 3240.5);
    assert.equal(body[CUSTOM_FIELD_KEYS.arxys_storage_gb], 1500000.79);
    assert.equal(body[CUSTOM_FIELD_KEYS.arxys_recommended_models], "3 × V800");
    assert.equal(
      body[CUSTOM_FIELD_KEYS.arxys_portal_url],
      `https://portal-arxys.vercel.app/submissions/${fixtureSubmission.submissionId}`,
    );
  });

  it("falls back to a partner+submission title when projectName is blank", async () => {
    await createDealFromSubmission(
      { ...fixtureSubmission, projectName: null },
      fixtureRecommendation(),
      fixturePartner,
    );
    const dealCall = calls.find((c) => c.url.includes("/v1/deals") && c.method === "POST");
    const body = dealCall!.body as Record<string, unknown>;
    assert.equal(
      body.title,
      `Acme Integrators — submission ${fixtureSubmission.submissionId}`,
    );
  });

  it("caches pipeline/stage/owner/dealFields across invocations", async () => {
    await createDealFromSubmission(
      fixtureSubmission,
      fixtureRecommendation(),
      fixturePartner,
    );
    const firstCallCount = calls.length;
    await createDealFromSubmission(
      fixtureSubmission,
      fixtureRecommendation(),
      fixturePartner,
    );
    const cachedEndpoints = ["/v1/pipelines", "/v1/stages", "/v1/users", "/v1/dealFields"];
    for (const path of cachedEndpoints) {
      const hits = calls.filter((c) => c.url.includes(path)).length;
      assert.equal(hits, 1, `${path} should be called exactly once across both invocations`);
    }
    assert.ok(calls.length > firstCallCount, "second invocation still issued some calls");
  });

  it("reuses an existing Person and Organization via search (idempotent)", async () => {
    await createDealFromSubmission(
      fixtureSubmission,
      fixtureRecommendation(),
      fixturePartner,
    );
    const personSearches = calls.filter((c) => c.url.includes("/v1/persons/search"));
    const orgSearches = calls.filter((c) => c.url.includes("/v1/organizations/search"));
    assert.equal(personSearches.length, 1);
    assert.equal(orgSearches.length, 1);
    assert.equal(
      calls.filter((c) => c.url.includes("/v1/persons") && c.method === "POST").length,
      0,
      "should not POST /v1/persons when search returns a hit",
    );
    assert.equal(
      calls.filter((c) => c.url.includes("/v1/organizations") && c.method === "POST").length,
      0,
      "should not POST /v1/organizations when search returns a hit",
    );
  });

  it("creates Person and Organization when search returns no hits", async () => {
    responder = (url, method, body) => {
      const path = url.pathname;
      if (path === "/v1/persons/search") return { items: [] };
      if (path === "/v1/organizations/search") return { items: [] };
      if (path === "/v1/persons" && method === "POST") {
        return { id: PERSON_ID, name: (body as { name: string }).name };
      }
      if (path === "/v1/organizations" && method === "POST") {
        return { id: ORG_ID, name: (body as { name: string }).name };
      }
      return defaultResponder(url, method, body);
    };

    await createDealFromSubmission(
      fixtureSubmission,
      fixtureRecommendation(),
      fixturePartner,
    );

    const orgCreate = calls.find(
      (c) => c.url.includes("/v1/organizations") && c.method === "POST",
    );
    assert.ok(orgCreate, "expected a POST /v1/organizations");
    assert.equal((orgCreate.body as { name: string }).name, "Acme Integrators");

    const personCreate = calls.find(
      (c) => c.url.includes("/v1/persons") && c.method === "POST",
    );
    assert.ok(personCreate, "expected a POST /v1/persons");
    const personBody = personCreate.body as {
      name: string;
      email: Array<{ value: string }>;
      org_id: number;
    };
    assert.equal(personBody.name, "Jane Partner");
    assert.equal(personBody.email[0].value, "jane@acme.example.com");
    assert.equal(personBody.org_id, ORG_ID);
  });

  it("populates the admin-curated calculator fields with mapped option IDs and strings", async () => {
    await createDealFromSubmission(
      fixtureSubmission,
      fixtureRecommendation(),
      fixturePartner,
    );
    const dealCall = calls.find((c) => c.url.includes("/v1/deals") && c.method === "POST");
    const body = dealCall!.body as Record<string, unknown>;

    assert.equal(body[CALC_FIELD_KEYS["Project Name"]], "Test Campus");
    // VMS "Milestone" → option id 14.
    assert.equal(body[CALC_FIELD_KEYS.VMS], 14);
    assert.equal(body[CALC_FIELD_KEYS["Camera Streams"]], 900);
    // recordingPercent=100 → "24 Hour Continuous" (118).
    assert.equal(body[CALC_FIELD_KEYS.Recording], 118);
    assert.equal(body[CALC_FIELD_KEYS["Motion Activity Est. %"]], "35");
    assert.equal(body[CALC_FIELD_KEYS["Frame Rate"]], "15");
    // Resolution forced to MP: 2560×1440 = 3.69MP → 4MP.
    assert.equal(body[CALC_FIELD_KEYS.Resolution], "4MP");
    assert.equal(body[CALC_FIELD_KEYS["Retention Days"]], "30");
    // codec "h265" → option id 139.
    assert.equal(body[CALC_FIELD_KEYS.CODEC], 139);
    assert.equal(body[CALC_FIELD_KEYS["Total Storage"]], "1500.00 TB");
    // complexity "med" → option id 288, sent as a comma-joined set string.
    assert.equal(body[CALC_FIELD_KEYS["Scene Complexity"]], "288");
    assert.equal(body[CALC_FIELD_KEYS["Recording hours"]], "24");
    assert.equal(body[CALC_FIELD_KEYS["Recommended Server"]], "3 × V800");
  });

  it("flips Recording to 'On Motion' when recordingPercent < 100", async () => {
    await createDealFromSubmission(
      { ...fixtureSubmission, groups: [{ ...fixtureSubmission.groups[0], recordingPercent: 50 }] },
      fixtureRecommendation(),
      fixturePartner,
    );
    const dealCall = calls.find((c) => c.url.includes("/v1/deals") && c.method === "POST");
    const body = dealCall!.body as Record<string, unknown>;
    assert.equal(body[CALC_FIELD_KEYS.Recording], 119);
    // recordingPercent=50 → 12 hours.
    assert.equal(body[CALC_FIELD_KEYS["Recording hours"]], "12");
  });

  it("aggregates per-stream fields across multiple camera groups", async () => {
    await createDealFromSubmission(
      {
        ...fixtureSubmission,
        groups: [
          // h265, 130 cameras total → dominant codec
          { resolutionLabel: "1080p Full HD (1920×1080)", codec: "h265", complexity: "low", fps: 15, recordingPercent: 100, motionPercent: 35, cameras: 100 },
          { resolutionLabel: "4MP (2560×1440)", codec: "h264", complexity: "high", fps: 10, recordingPercent: 50, motionPercent: 20, cameras: 50 },
          { resolutionLabel: "4K/8MP (3840×2160)", codec: "h265", complexity: "low", fps: 20, recordingPercent: 100, motionPercent: 50, cameras: 30 },
        ],
      },
      fixtureRecommendation(),
      fixturePartner,
    );
    const dealCall = calls.find((c) => c.url.includes("/v1/deals") && c.method === "POST");
    const body = dealCall!.body as Record<string, unknown>;

    // Free-text lists: distinct, sorted ascending, comma-separated.
    assert.equal(body[CALC_FIELD_KEYS["Frame Rate"]], "10, 15, 20");
    assert.equal(body[CALC_FIELD_KEYS["Motion Activity Est. %"]], "20, 35, 50");
    // 1920×1080→2MP, 2560×1440→4MP, 3840×2160→8MP.
    assert.equal(body[CALC_FIELD_KEYS.Resolution], "2MP, 4MP, 8MP");
    // recording hours: 24, 12, 24 → distinct {12,24}.
    assert.equal(body[CALC_FIELD_KEYS["Recording hours"]], "12, 24");
    // Scene Complexity set: low(287) + high(289), comma-joined sorted.
    assert.equal(body[CALC_FIELD_KEYS["Scene Complexity"]], "287,289");
    // Any group below 100% → On Motion (119).
    assert.equal(body[CALC_FIELD_KEYS.Recording], 119);
    // Dominant codec by cameras: h265 (130) > h264 (50) → 139.
    assert.equal(body[CALC_FIELD_KEYS.CODEC], 139);
  });

  it("skips calculator fields that aren't found in Pipedrive (rename tolerance)", async () => {
    // Pipedrive returned only the arxys_* fields — no calculator fields exist.
    responder = (url, method, body) => {
      if (url.pathname === "/v1/dealFields" && method === "GET") {
        return Object.entries(CUSTOM_FIELD_KEYS).map(([name, key], i) => ({
          id: 1000 + i,
          name,
          key,
          field_type: "varchar",
        }));
      }
      return defaultResponder(url, method, body);
    };
    const result = await createDealFromSubmission(
      fixtureSubmission,
      fixtureRecommendation(),
      fixturePartner,
    );
    assert.equal(result.dealId, DEAL_ID, "deal must still be created");
    const dealCall = calls.find((c) => c.url.includes("/v1/deals") && c.method === "POST");
    const body = dealCall!.body as Record<string, unknown>;
    for (const key of Object.values(CALC_FIELD_KEYS)) {
      assert.equal(body[key], undefined, `calc field key ${key} should not appear in payload`);
    }
    // arxys_* fields still set.
    assert.equal(body[CUSTOM_FIELD_KEYS.arxys_total_cameras], 900);
  });

  it("creates any missing custom fields and uses the returned hashed key", async () => {
    // Only the first three fields exist; the remaining three must be created.
    const existing = Object.entries(CUSTOM_FIELD_KEYS).slice(0, 3);
    responder = (url, method, body) => {
      if (url.pathname === "/v1/dealFields" && method === "GET") {
        return existing.map(([name, key], i) => ({
          id: 1000 + i,
          name,
          key,
          field_type: "varchar",
        }));
      }
      if (url.pathname === "/v1/dealFields" && method === "POST") {
        const payload = body as { name: string };
        return { id: 2000, name: payload.name, key: `created_${payload.name}`, field_type: "varchar" };
      }
      return defaultResponder(url, method, body);
    };

    await createDealFromSubmission(
      fixtureSubmission,
      fixtureRecommendation(),
      fixturePartner,
    );

    const creates = calls.filter(
      (c) => c.url.includes("/v1/dealFields") && c.method === "POST",
    );
    assert.equal(creates.length, 3, "expected to create the three missing fields");

    const dealCall = calls.find((c) => c.url.includes("/v1/deals") && c.method === "POST");
    const body = dealCall!.body as Record<string, unknown>;
    assert.equal(body["created_arxys_storage_gb"], 1500000.79);
    assert.equal(body["created_arxys_recommended_models"], "3 × V800");
    assert.equal(body["created_arxys_portal_url"], `https://portal-arxys.vercel.app/submissions/${fixtureSubmission.submissionId}`);
  });
});

describe("updateDealFromRevision", () => {
  it("PUTs only calculator-derived fields and NEVER stage_id/user_id/pipeline_id", async () => {
    const result = await updateDealFromRevision(
      EXISTING_DEAL_ID,
      { ...fixtureSubmission, addOnFailoverRecorder: false, addOnManagementServer: false },
      fixtureRecommendation(),
    );
    assert.equal(result.dealId, EXISTING_DEAL_ID);

    const putCall = calls.find(
      (c) => c.url.includes(`/v1/deals/${EXISTING_DEAL_ID}`) && c.method === "PUT",
    );
    assert.ok(putCall, "expected a PUT /v1/deals/{id} call");
    const body = putCall.body as Record<string, unknown>;

    // The whole point of the non-destructive update: routing/ownership/contact
    // fields must NEVER be in the payload — sales may have changed them.
    for (const forbidden of ["stage_id", "user_id", "pipeline_id"]) {
      assert.ok(
        !(forbidden in body),
        `revision update must NOT send ${forbidden} — found ${JSON.stringify(body[forbidden])}`,
      );
    }
    // Title/currency/person/org are create-only and must not be sent either.
    for (const createOnly of ["title", "currency", "person_id", "org_id"]) {
      assert.ok(!(createOnly in body), `revision update must NOT send ${createOnly}`);
    }

    // The calculator-derived fields ARE sent.
    assert.equal(body.value, 222144);
    assert.equal(body[CUSTOM_FIELD_KEYS.arxys_submission_id], fixtureSubmission.submissionId);
    assert.equal(body[CUSTOM_FIELD_KEYS.arxys_total_cameras], 900);
    assert.equal(
      body[CUSTOM_FIELD_KEYS.arxys_portal_url],
      `https://portal-arxys.vercel.app/submissions/${fixtureSubmission.submissionId}`,
    );
    assert.equal(body[CALC_FIELD_KEYS.Resolution], "4MP");
    assert.equal(body[CALC_FIELD_KEYS.CODEC], 139);

    // No deal CREATE happened — this was an in-place update.
    assert.equal(
      calls.filter((c) => c.url.endsWith("/v1/deals") && c.method === "POST").length,
      0,
      "revision must not POST a new deal",
    );
    // It also must not touch pipeline/stage/owner/contact lookups.
    for (const lookup of ["/v1/pipelines", "/v1/stages", "/v1/users", "/v1/persons", "/v1/organizations"]) {
      assert.equal(
        calls.filter((c) => c.url.includes(lookup)).length,
        0,
        `revision must not call ${lookup}`,
      );
    }
  });

  it("posts a 'revised from portal' note that does not block on note failure", async () => {
    await updateDealFromRevision(
      EXISTING_DEAL_ID,
      { ...fixtureSubmission, addOnFailoverRecorder: true, addOnManagementServer: false },
      fixtureRecommendation(),
    );
    const noteCall = calls.find((c) => c.url.includes("/v1/notes") && c.method === "POST");
    assert.ok(noteCall, "expected a POST /v1/notes call");
    const note = noteCall.body as { deal_id: number; content: string };
    assert.equal(note.deal_id, EXISTING_DEAL_ID);
    assert.match(note.content, /Revised from portal/);
    assert.match(note.content, /Failover recorder: Yes/);
  });

  it("does not throw when the note POST fails", async () => {
    responder = (url, method, body) => {
      if (url.pathname === "/v1/notes" && method === "POST") {
        throw new Error("note service down");
      }
      return defaultResponder(url, method, body);
    };
    // The update itself still resolves even though the note POST blew up.
    const result = await updateDealFromRevision(
      EXISTING_DEAL_ID,
      fixtureSubmission,
      fixtureRecommendation(),
    );
    assert.equal(result.dealId, EXISTING_DEAL_ID);
  });
});
