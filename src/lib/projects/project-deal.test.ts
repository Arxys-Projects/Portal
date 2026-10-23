import { describe, it, before, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

process.env.PIPEDRIVE_API_TOKEN ??= "test-token";
delete process.env.PIPEDRIVE_DEAL_OWNER_ID;

import { roleComment } from "./deal-lines";
import { FakeDb, FakePipedrive, type PdProductFixture } from "./project-deal.test-fixtures";
import type * as ProjectDeal from "./project-deal";
import type * as Lookups from "@/lib/pipedrive/lookups";

// Step 5 (ADR 0170): createProjectDeal, retryMissingLines, diffDealLines and
// previewDealLines against an in-memory database and a fake Pipedrive. The SQL
// itself (claim keys, the trigger, the ledger CHECK) runs in PGlite.

let pd: typeof ProjectDeal;
let lookups: typeof Lookups;
before(async () => {
  mock.module("server-only", { namedExports: {} });
  pd = await import("./project-deal");
  lookups = await import("@/lib/pipedrive/lookups");
});

const ANDY = "11111111-1111-4111-8111-000000000001";
const RICHARD = "11111111-1111-4111-8111-000000000002";
const MARCOS = "11111111-1111-4111-8111-000000000003";
const ADMIN = "11111111-1111-4111-8111-000000000004";
const PARTNER = "11111111-1111-4111-8111-000000000005";
const SUSPENDED = "11111111-1111-4111-8111-000000000006";
const COMPANY = "22222222-2222-4222-8222-000000000001";
const CONTACT = "33333333-3333-4333-8333-000000000001";
const PROJECT = "44444444-4444-4444-8444-000000000001";
const S1 = "55555555-5555-4555-8555-000000000001";
const S2 = "55555555-5555-4555-8555-000000000002";
const S3 = "55555555-5555-4555-8555-000000000003";
const LOOSE = "55555555-5555-4555-8555-000000000009";

const BOM = [
  { sku: "VX5-V800-864", qty: 18, role: "recorder", ruleId: null },
  { sku: "VX5-GPU-A1000", qty: 18, role: "recorder", ruleId: 4 },
  { sku: "VX5-GPU-A1000", qty: 9, role: "failover", ruleId: 4 },
  { sku: "VX5-V250-MGM", qty: 1, role: "mgmt", ruleId: null },
];

const productFixture = (id: number, code: string, price: number): PdProductFixture => ({
  id,
  name: `Arxys ${code}`,
  code,
  is_linkable: true,
  prices: [{ price, currency: "USD" }],
});

let db: FakeDb;
let pipedrive: FakePipedrive;
let deps: ProjectDeal.ProjectDealDeps;

function seed() {
  db = new FakeDb();
  db.tables.partners = [
    { id: ANDY, status: "active", role: "partner", is_internal: true, pipedrive_user_id: 13 },
    { id: RICHARD, status: "active", role: "partner", is_internal: true, pipedrive_user_id: 14 },
    { id: MARCOS, status: "active", role: "partner", is_internal: true, pipedrive_user_id: null },
    { id: ADMIN, status: "active", role: "admin", is_internal: false, pipedrive_user_id: null },
    { id: PARTNER, status: "active", role: "partner", is_internal: false, pipedrive_user_id: null },
    { id: SUSPENDED, status: "suspended", role: "partner", is_internal: true, pipedrive_user_id: null },
  ];
  db.tables.companies = [{ id: COMPANY, name: "Escambia Integrators", pipedrive_org_id: 101 }];
  db.tables.contacts = [{ id: CONTACT, pipedrive_person_id: 201, company_id: COMPANY, active: true }];
  db.tables.projects = [{ id: PROJECT, name: "West Wing", company_id: COMPANY, primary_contact_id: CONTACT }];
  db.tables.submissions = [calcRow(S1, null), { ...calcRow(LOOSE, null) }];
  db.tables.project_submissions = [{ submission_id: S1, project_id: PROJECT }];
  db.tables.submission_system_designs = [{ submission_id: S1, bom: BOM }];

  pipedrive = new FakePipedrive();
  pipedrive.products = [
    productFixture(1501, "VX5-V800-864", 117054.37),
    productFixture(1416, "VX5-GPU-A1000", 1706),
    productFixture(1433, "VX5-V250-MGM", 14020),
    productFixture(1415, "VX5-NIC-SFP28", 670),
  ];
  pipedrive.install();
  deps = { admin: db.client(), pipedriveToken: "test-token", now: () => new Date("2026-10-23T12:00:00Z") };
}

function calcRow(id: string, parent: string | null) {
  return { id, parent_submission_id: parent, project_name: "Escambia West", created_at: "2026-10-22T15:00:00Z", pipedrive_deal_id: null };
}

// A revision of `parent`, linked to the project, with its own banked BOM.
function addRevision(id: string, parent: string, bom = BOM) {
  db.rows("submissions").push(calcRow(id, parent));
  db.rows("project_submissions").push({ submission_id: id, project_id: PROJECT });
  db.rows("submission_system_designs").push({ submission_id: id, bom });
}

async function confirmedFingerprint(submissionId = S1, actor = ANDY) {
  const preview = await pd.previewDealLines(deps, submissionId, actor);
  assert.ok(preview.ok, JSON.stringify(preview));
  return preview.fingerprint;
}

async function create(submissionId = S1, actor = ANDY) {
  return pd.createProjectDeal(deps, submissionId, await confirmedFingerprint(submissionId, actor), actor);
}

const ledger = () => db.rows("deal_line_syncs");
const failNthLinePost = (n: number) => {
  let seen = 0;
  pipedrive.onPost = (path) => (/\/products$/.test(path) && ++seen === n ? "refuse" : null);
};

beforeEach(() => {
  process.env.PROJECT_DEAL_PRODUCTS = "true";
  lookups.__resetLookupCache();
  seed();
});

describe("previewDealLines", () => {
  it("returns the lines and the fingerprint from the banked BOM", async () => {
    const preview = await pd.previewDealLines(deps, S1, ANDY);
    assert.ok(preview.ok);
    assert.equal(preview.lines.length, 4);
    assert.ok(preview.fingerprint.every((f) => f.line_amount === null));
  });

  it("refuses with the flag off, before any read", async () => {
    process.env.PROJECT_DEAL_PRODUCTS = "false";
    const preview = await pd.previewDealLines(deps, S1, ANDY);
    assert.equal(!preview.ok && preview.reason, "flag-off");
    assert.equal(pipedrive.calls.length, 0);
  });

  it("refuses a partner, a suspended internal user and an unknown id; allows an admin", async () => {
    for (const actor of [PARTNER, SUSPENDED, "11111111-1111-4111-8111-00000000ffff"]) {
      const r = await pd.previewDealLines(deps, S1, actor);
      assert.equal(!r.ok && r.reason, "not-allowed", actor);
    }
    assert.ok((await pd.previewDealLines(deps, S1, ADMIN)).ok);
  });

  it("refuses a calc not linked to a project, and a linked calc with no design row", async () => {
    let r = await pd.previewDealLines(deps, LOOSE, ANDY);
    assert.equal(!r.ok && r.reason, "not-in-project");
    db.tables.submission_system_designs = [];
    r = await pd.previewDealLines(deps, S1, ANDY);
    assert.equal(!r.ok && r.reason, "no-design");
  });

  it("refuses with every offending line listed", async () => {
    pipedrive.products = pipedrive.products.filter((p) => p.code !== "VX5-V250-MGM");
    pipedrive.products.push({ ...productFixture(1600, "VX5-GPU-A1000", 1706) });
    const r = await pd.previewDealLines(deps, S1, ANDY);
    assert.ok(!r.ok);
    assert.equal(r.reason, "lines-refused");
    assert.deepEqual(r.refusals?.map((x) => `${x.sku}|${x.role}|${x.reason}`).sort(), [
      "VX5-GPU-A1000|failover|duplicate-code",
      "VX5-GPU-A1000|recorder|duplicate-code",
      "VX5-V250-MGM|mgmt|missing",
    ]);
  });
});

describe("createProjectDeal", () => {
  it("creates the deal by Pipedrive id with USD, no value, the role comments and a clean read-back", async () => {
    const r = await create();
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.dealId, 501);
    assert.equal(r.linesPending, 0);
    assert.equal(r.diff?.clean, true);

    const [dealPost] = pipedrive.postsTo(/^\/v2\/deals$/);
    assert.deepEqual(dealPost.body, {
      title: "Arxys Quote - Escambia Integrators - Escambia West - 2026-10-22",
      owner_id: 13,
      org_id: 101,
      person_id: 201,
      pipeline_id: 7,
      stage_id: 71,
      currency: "USD",
      custom_fields: { abc123projectfield: PROJECT },
    });
    assert.equal("value" in (dealPost.body as object), false);

    const linePosts = pipedrive.postsTo(/^\/v2\/deals\/501\/products$/).map((c) => c.body as Record<string, unknown>);
    assert.equal(linePosts.length, 4);
    for (const body of linePosts) {
      const product = pipedrive.products.find((p) => p.id === body.product_id)!;
      // No price math: the price sent is the product's, string for string.
      assert.equal(String(body.item_price), String(product.prices[0].price));
      assert.match(String(body.comments), /^Arxys role: (recorder|failover|mgmt)$/);
    }
    assert.ok(linePosts.some((b) => b.product_id === 1416 && b.comments === roleComment("failover") && b.quantity === 9));

    const claim = db.rows("project_deal_claims")[0];
    assert.equal(claim.pipedrive_deal_id, 501);
    assert.equal(claim.lineage_root_submission_id, S1);
    assert.equal(db.rows("submissions").find((s) => s.id === S1)?.pipedrive_deal_id, 501);
    assert.deepEqual(ledger().map((l) => l.status), ["added", "added", "added", "added"]);
    assert.ok(ledger().every((l) => typeof l.pipedrive_deal_product_id === "number" && l.created_by === ANDY));
  });

  it("owns the deal by the actor's Pipedrive user, or the default for anyone else", async () => {
    assert.ok((await create(S1, RICHARD)).ok);
    assert.equal((pipedrive.postsTo(/^\/v2\/deals$/)[0].body as { owner_id: number }).owner_id, 14);
    seed();
    lookups.__resetLookupCache();
    assert.ok((await create(S1, MARCOS)).ok);
    assert.equal((pipedrive.postsTo(/^\/v2\/deals$/)[0].body as { owner_id: number }).owner_id, 999);
  });

  it("refuses when a price changed in Pipedrive after the rep confirmed", async () => {
    const fingerprint = await confirmedFingerprint();
    pipedrive.products[2] = productFixture(1433, "VX5-V250-MGM", 14100);
    const r = await pd.createProjectDeal(deps, S1, fingerprint, ANDY);
    assert.equal(!r.ok && r.reason, "fingerprint-mismatch");
    assert.equal(pipedrive.postsTo(/./).length, 0);
    assert.equal(db.rows("project_deal_claims").length, 0);
  });

  it("refuses a caller-supplied fingerprint that is not the preview's", async () => {
    const r = await pd.createProjectDeal(deps, S1, [{ product_id: 1, code: "X", name: null, quantity: 1, unit_price: 1, line_amount: null }], ANDY);
    assert.equal(!r.ok && r.reason, "fingerprint-mismatch");
    const bad = await pd.createProjectDeal(deps, S1, "lines", ANDY);
    assert.equal(!bad.ok && bad.reason, "bad-input");
  });

  it("refuses a non-internal actor, an unlinked calc, a calc with no design, and the flag off", async () => {
    const fingerprint = await confirmedFingerprint();
    let r = await pd.createProjectDeal(deps, S1, fingerprint, PARTNER);
    assert.equal(!r.ok && r.reason, "not-allowed");
    r = await pd.createProjectDeal(deps, LOOSE, fingerprint, ANDY);
    assert.equal(!r.ok && r.reason, "not-in-project");
    process.env.PROJECT_DEAL_PRODUCTS = "";
    r = await pd.createProjectDeal(deps, S1, fingerprint, ANDY);
    assert.equal(!r.ok && r.reason, "flag-off");
    process.env.PROJECT_DEAL_PRODUCTS = "true";
    db.tables.submission_system_designs = [];
    r = await pd.createProjectDeal(deps, S1, fingerprint, ANDY);
    assert.equal(!r.ok && r.reason, "no-design");
    assert.equal(pipedrive.postsTo(/./).length, 0);
  });

  it("refuses when the project field, the pipeline or the stage is missing, leaving no claim", async () => {
    const fingerprint = await confirmedFingerprint();
    pipedrive.dealFields = [];
    let r = await pd.createProjectDeal(deps, S1, fingerprint, ANDY);
    assert.equal(!r.ok && r.reason, "no-project-field");

    seed();
    pipedrive.pipelines = pipedrive.pipelines.filter((p) => p.name !== "Partner Projects");
    r = await pd.createProjectDeal(deps, S1, fingerprint, ANDY);
    assert.equal(!r.ok && r.reason, "no-pipeline");

    seed();
    pipedrive.stages = pipedrive.stages.filter((s) => s.name !== "New Deal");
    r = await pd.createProjectDeal(deps, S1, fingerprint, ANDY);
    assert.equal(!r.ok && r.reason, "no-stage");

    assert.equal(pipedrive.postsTo(/./).length, 0);
    assert.equal(db.rows("project_deal_claims").length, 0);
  });

  it("refuses a project with no org, or a contact who left the company", async () => {
    const fingerprint = await confirmedFingerprint();
    db.tables.contacts[0].company_id = "22222222-2222-4222-8222-0000000000ff";
    let r = await pd.createProjectDeal(deps, S1, fingerprint, ANDY);
    assert.equal(!r.ok && r.reason, "no-person");
    seed();
    db.tables.companies[0].pipedrive_org_id = null;
    r = await pd.createProjectDeal(deps, S1, fingerprint, ANDY);
    assert.equal(!r.ok && r.reason, "no-org");
  });

  it("leaves the partner path's stage cache alone", async () => {
    assert.ok((await create()).ok);
    assert.equal(pipedrive.calls.filter((c) => c.path.startsWith("/v1/stages")).length, 0);
    // The partner lookup still resolves its own stage in its own pipeline.
    assert.equal(await lookups.resolveStageId(1), 11);
  });

  for (const [label, n] of [["first", 1], ["middle", 2], ["last", 4]] as const) {
    it(`keeps the deal and reports lines pending when the ${label} line fails`, async () => {
      failNthLinePost(n);
      const r = await create();
      assert.ok(r.ok, JSON.stringify(r));
      assert.equal(r.linesPending, 1);
      assert.equal(r.lines.filter((l) => l.status === "failed").length, 1);
      assert.equal(r.diff?.missing.length, 1);
      assert.equal(pipedrive.deals.get(501)?.lines.length, 3);
      assert.ok(r.warnings.some((w) => /retry missing lines/.test(w)));
    });
  }

  it("waits out a 429 mid-run and adds the line", async () => {
    let seen = 0;
    pipedrive.onPost = (path) => (/\/products$/.test(path) && ++seen === 2 ? "rate-limited" : null);
    const r = await create();
    assert.ok(r.ok);
    assert.equal(r.linesPending, 0);
    assert.equal(pipedrive.postsTo(/\/products$/).length, 5);
    assert.equal(pipedrive.deals.get(501)?.lines.length, 4);
  });

  it("a double click creates one deal", async () => {
    const fingerprint = await confirmedFingerprint();
    const [a, b] = await Promise.all([
      pd.createProjectDeal(deps, S1, fingerprint, ANDY),
      pd.createProjectDeal(deps, S1, fingerprint, ANDY),
    ]);
    assert.equal(pipedrive.postsTo(/^\/v2\/deals$/).length, 1);
    assert.equal([a, b].filter((x) => x.ok).length, 1);
    const loser = [a, b].find((x) => !x.ok);
    assert.ok(loser && !loser.ok && ["already-has-deal", "claim-unresolved"].includes(loser.reason));
  });

  it("a revision of the same lineage cannot create a second deal", async () => {
    assert.ok((await create()).ok);
    addRevision(S2, S1);
    const r = await create(S2);
    assert.equal(!r.ok && r.reason, "already-has-deal");
    assert.equal(!r.ok && r.dealId, 501);
    assert.equal(pipedrive.postsTo(/^\/v2\/deals$/).length, 1);
  });

  it("a revision split off by deleting the middle one is refused by the project key", async () => {
    assert.ok((await create()).ok);
    addRevision(S2, S1);
    addRevision(S3, S2);
    // parent_submission_id is on delete set null.
    db.tables.submissions = db.rows("submissions").filter((s) => s.id !== S2);
    db.rows("submissions").find((s) => s.id === S3)!.parent_submission_id = null;
    const r = await create(S3);
    assert.equal(!r.ok && r.reason, "already-has-deal");
    assert.equal(pipedrive.postsTo(/^\/v2\/deals$/).length, 1);
  });

  it("refuses a superseded calc", async () => {
    addRevision(S2, S1);
    const fingerprint = await confirmedFingerprint(S2);
    const r = await pd.createProjectDeal(deps, S1, fingerprint, ANDY);
    assert.equal(!r.ok && r.reason, "superseded");
  });

  it("a bare child row a contact login planted does not supersede the calc", async () => {
    // Step 4 note S-3: a child with no project_submissions link.
    db.rows("submissions").push(calcRow(S2, S1));
    const r = await create();
    assert.ok(r.ok, JSON.stringify(r));
  });

  it("refuses, and never posts, while a claim has no deal id", async () => {
    db.rows("project_deal_claims").push({
      id: 77, project_id: PROJECT, lineage_root_submission_id: S1, submission_id: S1, pipedrive_deal_id: null,
      confirmed_fingerprint: [], claimed_at: "2026-10-23T09:00:00.000Z",
    });
    const r = await create();
    assert.ok(!r.ok);
    assert.equal(r.reason, "claim-unresolved");
    assert.match(r.message, /ask Andy to resolve the claim/);
    assert.equal(pipedrive.postsTo(/./).length, 0);
  });

  it("tells the rep a claim minutes old is a create still running", async () => {
    db.rows("project_deal_claims").push({
      id: 78, project_id: PROJECT, lineage_root_submission_id: S1, submission_id: S1, pipedrive_deal_id: null,
      confirmed_fingerprint: [], claimed_at: "2026-10-23T11:57:00.000Z",
    });
    const r = await create();
    assert.ok(!r.ok);
    assert.match(r.message, /being created right now/);
    assert.doesNotMatch(r.message, /Andy/);
  });

  it("a create Pipedrive may have done keeps the claim and is never retried", async () => {
    pipedrive.onPost = (path) => (path === "/v2/deals" ? "written-then-no-response" : null);
    const r = await create();
    assert.equal(!r.ok && r.reason, "create-unknown");
    assert.equal(db.rows("project_deal_claims")[0].pipedrive_deal_id, null);
    pipedrive.onPost = () => null;
    const again = await create();
    assert.equal(!again.ok && again.reason, "claim-unresolved");
    assert.equal(pipedrive.postsTo(/^\/v2\/deals$/).length, 1);
  });

  it("a refused create whose claim could not be cleared says so", async () => {
    pipedrive.onPost = (path) => (path === "/v2/deals" ? "refuse" : null);
    db.failOn = (table, op) => (table === "project_deal_claims" && op === "delete" ? { message: "boom" } : null);
    const r = await create();
    assert.ok(!r.ok);
    assert.equal(r.reason, "create-refused");
    assert.match(r.message, /could not clear its claim/);
  });

  it("a create Pipedrive refused releases the claim so the rep can try again", async () => {
    pipedrive.onPost = (path) => (path === "/v2/deals" ? "refuse" : null);
    const r = await create();
    assert.equal(!r.ok && r.reason, "create-refused");
    assert.equal(db.rows("project_deal_claims").length, 0);
    pipedrive.onPost = () => null;
    assert.ok((await create()).ok);
  });

  it("a 5xx on create is treated as maybe-created", async () => {
    pipedrive.onPost = (path) => (path === "/v2/deals" ? "server-error" : null);
    const r = await create();
    assert.equal(!r.ok && r.reason, "create-unknown");
    assert.equal(db.rows("project_deal_claims").length, 1);
  });

  it("a deal created but not recorded on the claim says so and keeps the claim", async () => {
    db.failOn = (table, op) => (table === "project_deal_claims" && op === "update" ? { message: "boom" } : null);
    const r = await create();
    assert.ok(!r.ok);
    assert.equal(r.reason, "db-error");
    assert.equal(r.dealId, 501);
    assert.match(r.message, /Do not create it again/);
  });
});

describe("retryMissingLines", () => {
  it("adds only the lines that failed", async () => {
    failNthLinePost(2);
    const first = await create();
    assert.ok(first.ok && first.linesPending === 1);
    pipedrive.onPost = () => null;
    const before = pipedrive.postsTo(/\/products$/).length;
    const r = await pd.retryMissingLines(deps, 501, ANDY);
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(pipedrive.postsTo(/\/products$/).length - before, 1);
    assert.equal(r.linesPending, 0);
    assert.equal(r.diff?.clean, true);
    assert.equal(pipedrive.deals.get(501)?.lines.length, 4);
  });

  it("records, without posting again, a line that reached Pipedrive before a timeout", async () => {
    let seen = 0;
    pipedrive.onPost = (path) => (/\/products$/.test(path) && ++seen === 3 ? "written-then-no-response" : null);
    const first = await create();
    assert.ok(first.ok && first.linesPending === 1);
    assert.equal(pipedrive.deals.get(501)?.lines.length, 4);
    pipedrive.onPost = () => null;
    const before = pipedrive.postsTo(/\/products$/).length;
    const r = await pd.retryMissingLines(deps, 501, ANDY);
    assert.ok(r.ok);
    assert.equal(pipedrive.postsTo(/\/products$/).length, before);
    assert.equal(r.linesPending, 0);
    assert.equal(r.diff?.clean, true);
  });

  it("records a pending line a stopped process already posted", async () => {
    assert.ok((await create()).ok);
    // As if the process died after the POST and before marking the row.
    const row = ledger().find((l) => l.role === "mgmt")!;
    row.status = "pending";
    row.pipedrive_deal_product_id = null;
    const before = pipedrive.postsTo(/\/products$/).length;
    const r = await pd.retryMissingLines(deps, 501, ANDY);
    assert.ok(r.ok);
    assert.equal(pipedrive.postsTo(/\/products$/).length, before);
    assert.equal(row.status, "added");
  });

  it("two retries at once post each missing line once", async () => {
    failNthLinePost(1);
    const first = await create();
    assert.ok(first.ok);
    // Fail a second line by hand so there are two to retry.
    const second = ledger().find((l) => l.status === "added")!;
    pipedrive.deals.get(501)!.lines = pipedrive.deals.get(501)!.lines.filter((l) => l.id !== second.pipedrive_deal_product_id);
    second.status = "failed";
    second.pipedrive_deal_product_id = null;
    pipedrive.onPost = () => null;
    const before = pipedrive.postsTo(/\/products$/).length;
    const [a, b] = await Promise.all([pd.retryMissingLines(deps, 501, ANDY), pd.retryMissingLines(deps, 501, RICHARD)]);
    assert.ok(a.ok && b.ok);
    assert.equal(pipedrive.postsTo(/\/products$/).length - before, 2);
    assert.equal(pipedrive.deals.get(501)?.lines.length, 4);
    assert.deepEqual(ledger().map((l) => l.status), ["added", "added", "added", "added"]);
  });

  it("leaves a fresh sending row to its owner and takes over a stale one", async () => {
    failNthLinePost(1);
    assert.ok((await create()).ok);
    pipedrive.onPost = () => null;
    const row = ledger().find((l) => l.status === "failed")!;
    row.status = "sending";
    row.updated_at = "2026-10-23T11:58:00.000Z";
    let r = await pd.retryMissingLines(deps, 501, ANDY);
    assert.ok(r.ok);
    assert.equal(row.status, "sending");
    assert.equal(r.linesPending, 1);
    row.updated_at = "2026-10-23T11:40:00.000Z";
    r = await pd.retryMissingLines(deps, 501, ANDY);
    assert.ok(r.ok);
    assert.equal(row.status, "added");
    assert.equal(pipedrive.deals.get(501)?.lines.length, 4);
  });

  it("seeds the ledger when the create stopped before writing it", async () => {
    db.failOn = (table, op) => (table === "deal_line_syncs" && op === "insert" ? { message: "boom" } : null);
    const first = await create();
    assert.ok(first.ok && first.linesPending === 4);
    assert.equal(pipedrive.deals.get(501)?.lines.length, 0);
    db.failOn = () => null;
    const r = await pd.retryMissingLines(deps, 501, ANDY);
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.linesPending, 0);
    assert.equal(r.diff?.clean, true);
  });

  it("will not seed lines once Pipedrive no longer matches the confirmed prices", async () => {
    db.failOn = (table, op) => (table === "deal_line_syncs" && op === "insert" ? { message: "boom" } : null);
    assert.ok((await create()).ok);
    db.failOn = () => null;
    pipedrive.products[2] = productFixture(1433, "VX5-V250-MGM", 14100);
    const r = await pd.retryMissingLines(deps, 501, ANDY);
    assert.equal(!r.ok && r.reason, "fingerprint-mismatch");
  });

  it("re-sends a failed line at the confirmed price", async () => {
    failNthLinePost(3);
    assert.ok((await create()).ok);
    const failed = ledger().find((l) => l.status === "failed")!;
    const confirmedPrice = pipedrive.products.find((p) => p.id === failed.pipedrive_product_id)!.prices[0].price;
    pipedrive.products = pipedrive.products.map((p) => (p.id === failed.pipedrive_product_id ? { ...p, prices: [{ price: 1, currency: "USD" }] } : p));
    pipedrive.onPost = () => null;
    const r = await pd.retryMissingLines(deps, 501, ANDY);
    assert.ok(r.ok);
    const last = pipedrive.postsTo(/\/products$/).at(-1)!.body as { item_price: number };
    assert.equal(last.item_price, confirmedPrice);
    assert.ok(r.warnings.some((w) => /changed in Pipedrive/.test(w)));
  });

  it("never posts a ledger row whose product or quantity differs from what was confirmed", async () => {
    let seen = 0;
    pipedrive.onPost = (path) => (/\/products$/.test(path) && ++seen <= 2 ? "refuse" : null);
    assert.ok((await create()).ok);
    const [swapped, inflated] = ledger().filter((l) => l.status === "failed");
    swapped.pipedrive_product_id = 1415;
    inflated.qty = 999;
    const before = pipedrive.postsTo(/\/products$/).length;
    const r = await pd.retryMissingLines(deps, 501, ANDY);
    assert.ok(r.ok);
    assert.equal(pipedrive.postsTo(/\/products$/).length, before);
    assert.ok([swapped, inflated].every((l) => l.status === "failed" && /does not match the confirmed lines/.test(String(l.error))));
  });

  it("claims the rows before it reads the deal", async () => {
    failNthLinePost(2);
    assert.ok((await create()).ok);
    pipedrive.onPost = () => null;
    const statusesAtRead: string[][] = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (input: Request | string | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if ((init?.method ?? "GET") === "GET" && /\/deals\/501\/products/.test(url)) {
        statusesAtRead.push(ledger().filter((l) => l.status !== "added").map((l) => String(l.status)));
      }
      return real(input, init);
    }) as typeof fetch;
    try {
      assert.ok((await pd.retryMissingLines(deps, 501, ANDY)).ok);
    } finally {
      globalThis.fetch = real;
    }
    // The first read (before posting) already sees the failed row as ours.
    assert.deepEqual(statusesAtRead[0], ["sending"]);
  });

  it("a call whose row was taken over neither posts it nor writes to it", async () => {
    failNthLinePost(2);
    assert.ok((await create()).ok);
    pipedrive.onPost = () => null;
    const row = ledger().find((l) => l.status === "failed")!;
    const real = globalThis.fetch;
    globalThis.fetch = (async (input: Request | string | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if ((init?.method ?? "GET") === "GET" && /\/deals\/501\/products/.test(url) && row.status === "sending") {
        // Another call takes the row over between this call's claim and its post.
        row.updated_at = "2026-10-23T12:30:00.000Z";
      }
      return real(input, init);
    }) as typeof fetch;
    const before = pipedrive.postsTo(/\/products$/).length;
    let r;
    try {
      r = await pd.retryMissingLines(deps, 501, ANDY);
    } finally {
      globalThis.fetch = real;
    }
    assert.ok(r.ok);
    assert.equal(pipedrive.postsTo(/\/products$/).length, before);
    assert.equal(row.status, "sending");
    assert.equal(row.updated_at, "2026-10-23T12:30:00.000Z");
    assert.ok(r.warnings.some((w) => /taken over by another call/.test(w)));
    assert.ok(r.warnings.some((w) => /being added by another call/.test(w)));
  });

  it("refuses a deal the portal did not build, and a non-internal actor", async () => {
    let r = await pd.retryMissingLines(deps, 12345, ANDY);
    assert.equal(!r.ok && r.reason, "not-portal-deal");
    r = await pd.retryMissingLines(deps, 501, PARTNER);
    assert.equal(!r.ok && r.reason, "not-allowed");
  });
});

describe("diffDealLines", () => {
  it("is clean right after a create, and shows a revision's changed quantity", async () => {
    assert.ok((await create()).ok);
    let r = await pd.diffDealLines(deps, 501, S1, ANDY);
    assert.ok(r.ok && r.diff.clean);
    addRevision(S2, S1, BOM.map((l) => (l.role === "failover" ? { ...l, qty: 10 } : l)));
    r = await pd.diffDealLines(deps, 501, S2, ANDY);
    assert.ok(r.ok);
    assert.deepEqual(r.diff.quantity.map((q) => [q.sku, q.role, q.expected, q.actual]), [["VX5-GPU-A1000", "failover", 10, 9]]);
    // Read-only: no POST of any kind.
    assert.equal(pipedrive.postsTo(/./).length, 5);
  });

  it("refuses a calc from another project", async () => {
    assert.ok((await create()).ok);
    const OTHER = "44444444-4444-4444-8444-000000000002";
    db.rows("projects").push({ id: OTHER, name: "Other", company_id: COMPANY, primary_contact_id: CONTACT });
    db.rows("submissions").push(calcRow(S3, null));
    db.rows("project_submissions").push({ submission_id: S3, project_id: OTHER });
    db.rows("submission_system_designs").push({ submission_id: S3, bom: BOM });
    const r = await pd.diffDealLines(deps, 501, S3, ANDY);
    assert.equal(!r.ok && r.reason, "wrong-project");
  });
});
