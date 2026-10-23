import { describe, it, before, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

process.env.PIPEDRIVE_API_TOKEN ??= "test-token";
delete process.env.PIPEDRIVE_DEAL_OWNER_ID;

import { FakeDb, FakePipedrive, type PdProductFixture } from "./project-deal.test-fixtures";
import type * as ProjectDeal from "./project-deal";
import type * as PricingGate from "./pricing-gate";
import type * as QuoteInputs from "@/lib/project-quote/quote-inputs";
import type * as Lookups from "@/lib/pipedrive/lookups";
import type { PdDealProduct } from "@/lib/pipedrive/client";
import type { GetDealForQuoteResult } from "@/lib/pipedrive/quote";

// Step 6 (ADR 0176): confirmDealPricing and the pricing gate in front of
// Project Quote generation, against an in-memory database and a fake Pipedrive.
// The deal is built by the real Step 5 createProjectDeal first.

let pd: typeof ProjectDeal;
let gate: typeof PricingGate;
let inputs: typeof QuoteInputs;
let lookups: typeof Lookups;
before(async () => {
  mock.module("server-only", { namedExports: {} });
  pd = await import("./project-deal");
  gate = await import("./pricing-gate");
  inputs = await import("@/lib/project-quote/quote-inputs");
  lookups = await import("@/lib/pipedrive/lookups");
});

const ANDY = "11111111-1111-4111-8111-000000000001";
const ADMIN = "11111111-1111-4111-8111-000000000004";
const PARTNER = "11111111-1111-4111-8111-000000000005";
const COMPANY = "22222222-2222-4222-8222-000000000001";
const CONTACT = "33333333-3333-4333-8333-000000000001";
const PROJECT = "44444444-4444-4444-8444-000000000001";
const S1 = "55555555-5555-4555-8555-000000000001";
const S2 = "55555555-5555-4555-8555-000000000002";
const LEGACY = "55555555-5555-4555-8555-000000000009";
const LEGACY_DEAL = 4822;

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
let deps: { admin: ReturnType<FakeDb["client"]>; pipedriveToken: string };
let dealId: number;

const calcRow = (id: string, parent: string | null, created = "2026-10-22T15:00:00Z") => ({
  id,
  parent_submission_id: parent,
  project_name: "Escambia West",
  created_at: created,
  pipedrive_deal_id: null as number | null,
  on_behalf_of_partner_id: null,
});

function seed() {
  db = new FakeDb();
  db.tables.partners = [
    { id: ANDY, status: "active", role: "partner", is_internal: true, pipedrive_user_id: 13 },
    { id: ADMIN, status: "active", role: "admin", is_internal: false, pipedrive_user_id: null },
    { id: PARTNER, status: "active", role: "partner", is_internal: false, pipedrive_user_id: null },
  ];
  db.tables.companies = [{ id: COMPANY, name: "Escambia Integrators", pipedrive_org_id: 101 }];
  db.tables.contacts = [{ id: CONTACT, pipedrive_person_id: 201, company_id: COMPANY, active: true, name: "Ken Fuller", email: "Ken.Fuller@Example.com" }];
  db.tables.projects = [{ id: PROJECT, name: "West Wing", company_id: COMPANY, primary_contact_id: CONTACT }];
  db.tables.submissions = [calcRow(S1, null), { ...calcRow(LEGACY, null), pipedrive_deal_id: LEGACY_DEAL }];
  db.tables.project_submissions = [{ submission_id: S1, project_id: PROJECT }];
  db.tables.submission_system_designs = [{ submission_id: S1, bom: BOM }];

  pipedrive = new FakePipedrive();
  pipedrive.products = [
    productFixture(1501, "VX5-V800-864", 117054.37),
    productFixture(1416, "VX5-GPU-A1000", 1706),
    productFixture(1433, "VX5-V250-MGM", 14020),
  ];
  pipedrive.install();
  deps = { admin: db.client(), pipedriveToken: "test-token" };
}

async function buildDeal(): Promise<number> {
  const preview = await pd.previewDealLines({ ...deps }, S1, ANDY);
  assert.ok(preview.ok, JSON.stringify(preview));
  const created = await pd.createProjectDeal({ ...deps }, S1, preview.fingerprint, ANDY);
  assert.ok(created.ok, JSON.stringify(created));
  assert.equal(created.linesPending, 0);
  return created.dealId;
}

const lines = () => pipedrive.deals.get(dealId)!.lines;
const linesReads = () => pipedrive.calls.filter((c) => c.method === "GET" && c.path.startsWith(`/v2/deals/${dealId}/products`)).length;

async function confirmNow(actor = ANDY) {
  const shown = await gate.readDealPricing(deps, dealId, actor);
  assert.ok(shown.ok, JSON.stringify(shown));
  return gate.confirmDealPricing(deps, dealId, shown.fingerprint, actor);
}

// A readDeal stub that records the lines it was handed.
function recordingReader() {
  const seen: (PdDealProduct[] | undefined)[] = [];
  const read = async (id: number, given?: PdDealProduct[]): Promise<GetDealForQuoteResult> => {
    seen.push(given);
    return { ok: true, deal: { dealId: id, lineItems: [], isEmpty: false } as never };
  };
  return { seen, read };
}

beforeEach(async () => {
  process.env.PROJECT_DEAL_PRODUCTS = "true";
  process.env.PROJECT_QUOTE_GATE = "true";
  lookups.__resetLookupCache();
  seed();
  dealId = await buildDeal();
  pipedrive.calls = [];
});

describe("confirmDealPricing", () => {
  it("records the fingerprint and the exact lines it was read from", async () => {
    const r = await confirmNow();
    assert.ok(r.ok, JSON.stringify(r));
    const [row] = db.rows("quote_pricing_confirmations");
    assert.equal(row.pipedrive_deal_id, dealId);
    assert.equal(row.confirmed_by, ANDY);
    assert.equal(row.submission_id, S1);
    assert.deepEqual(row.deal_lines, lines());
    assert.equal((row.deal_lines_fingerprint as unknown[]).length, 4);
    // The fingerprint carries role and discount, so either change shows.
    assert.deepEqual(
      (row.deal_lines_fingerprint as { role: string }[]).map((f) => f.role).sort(),
      ["failover", "mgmt", "recorder", "recorder"],
    );
  });

  it("refuses when the deal changed after the rep reviewed it", async () => {
    const shown = await gate.readDealPricing(deps, dealId, ANDY);
    assert.ok(shown.ok);
    lines()[0].discount = 5;
    lines()[0].discount_type = "percentage";
    const r = await gate.confirmDealPricing(deps, dealId, shown.fingerprint, ANDY);
    assert.equal(!r.ok && r.reason, "fingerprint-mismatch");
    assert.equal(db.rows("quote_pricing_confirmations").length, 0);
  });

  it("refuses a partner, and with the flag off before any read; an admin may confirm", async () => {
    const shown = await gate.readDealPricing(deps, dealId, ANDY);
    assert.ok(shown.ok);
    const partner = await gate.confirmDealPricing(deps, dealId, shown.fingerprint, PARTNER);
    assert.equal(!partner.ok && partner.reason, "not-allowed");
    process.env.PROJECT_QUOTE_GATE = "false";
    pipedrive.calls = [];
    const off = await gate.confirmDealPricing(deps, dealId, shown.fingerprint, ANDY);
    assert.equal(!off.ok && off.reason, "flag-off");
    assert.equal(pipedrive.calls.length, 0);
    process.env.PROJECT_QUOTE_GATE = "true";
    assert.ok((await gate.confirmDealPricing(deps, dealId, shown.fingerprint, ADMIN)).ok);
  });

  it("refuses a shown fingerprint it cannot read", async () => {
    const r = await gate.confirmDealPricing(deps, dealId, [{ product_id: "x" }], ANDY);
    assert.equal(!r.ok && r.reason, "bad-input");
  });

  it("refuses while a ledger row is not added (a partial sync is never confirmed)", async () => {
    const shown = await gate.readDealPricing(deps, dealId, ANDY);
    assert.ok(shown.ok);
    db.rows("deal_line_syncs")[1].status = "failed";
    const r = await gate.confirmDealPricing(deps, dealId, shown.fingerprint, ANDY);
    assert.equal(!r.ok && r.reason, "lines-pending");
  });

  it("refuses a deal with no lines, and a deal that differs from the calc's design", async () => {
    pipedrive.deals.get(dealId)!.lines = [];
    let r = await gate.readDealPricing(deps, dealId, ANDY);
    assert.equal(!r.ok && r.reason, "empty-deal");
    seed();
    dealId = await buildDeal();
    lines()[0].quantity = 17;
    r = await gate.readDealPricing(deps, dealId, ANDY);
    assert.equal(!r.ok && r.reason, "deal-differs");
  });

  it("refuses a deal the portal did not build", async () => {
    const r = await gate.readDealPricing(deps, LEGACY_DEAL, ANDY);
    assert.equal(!r.ok && r.reason, "not-portal-deal");
  });

  it("checks the deal against its latest revision (ADR 0173), not the calc that built it", async () => {
    // The revision drops the failover GPUs, and the rep removed that line by hand.
    const revisedBom = BOM.filter((l) => l.role !== "failover");
    db.rows("submissions").push({ ...calcRow(S2, S1, "2026-10-23T09:00:00Z"), pipedrive_deal_id: dealId });
    db.rows("project_submissions").push({ submission_id: S2, project_id: PROJECT });
    db.rows("submission_system_designs").push({ submission_id: S2, bom: revisedBom });
    pipedrive.deals.get(dealId)!.lines = lines().filter((l) => !/failover/.test(l.comments ?? ""));
    const r = await confirmNow();
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(db.rows("quote_pricing_confirmations")[0].submission_id, S2);
  });
});

describe("the gate in Project Quote generation", () => {
  it("refuses a portal-built deal with no confirmation", async () => {
    const g = await gate.checkQuoteGate(deps, dealId, S1);
    assert.equal("kind" in g ? g.kind : g.reason, "no-confirmation");
  });

  it("passes a matching confirmation and hands the quote the lines it checked, read once", async () => {
    assert.ok((await confirmNow()).ok);
    pipedrive.calls = [];
    const reader = recordingReader();
    const r = await inputs.readQuoteInputs(deps, S1, dealId, reader.read);
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(linesReads(), 1);
    assert.equal(reader.seen.length, 1);
    assert.deepEqual(reader.seen[0]?.map((l) => l.id), lines().map((l) => l.id));
    assert.equal(r.pricingGate?.confirmationId, db.rows("quote_pricing_confirmations")[0].id);
  });

  it("a line changing after the check cannot reach the quote (single read)", async () => {
    assert.ok((await confirmNow()).ok);
    const reader = recordingReader();
    const checkedPrice = lines()[0].item_price;
    const read = async (id: number, given?: PdDealProduct[]) => {
      // Pipedrive changes between the gate's read and the quote read.
      lines()[0].item_price = 1;
      return reader.read(id, given);
    };
    pipedrive.calls = [];
    const r = await inputs.readQuoteInputs(deps, S1, dealId, read);
    assert.ok(r.ok);
    assert.equal(reader.seen[0]?.find((l) => l.id === lines()[0].id)?.item_price, checkedPrice);
    assert.equal(linesReads(), 1);
  });

  it("refuses after a price edit, and after a discount edit, until a second confirmation", async () => {
    assert.ok((await confirmNow()).ok);
    lines()[0].item_price = 99999;
    let g = await gate.checkQuoteGate(deps, dealId, S1);
    assert.equal("kind" in g ? g.kind : g.reason, "pricing-changed");

    assert.ok((await confirmNow()).ok);
    g = await gate.checkQuoteGate(deps, dealId, S1);
    assert.equal("kind" in g && g.kind, "gated");

    lines()[1].discount = 10;
    lines()[1].discount_type = "percentage";
    g = await gate.checkQuoteGate(deps, dealId, S1);
    assert.equal("kind" in g ? g.kind : g.reason, "pricing-changed");

    assert.ok((await confirmNow()).ok);
    g = await gate.checkQuoteGate(deps, dealId, S1);
    assert.ok("kind" in g && g.kind === "gated");
    // The latest of three confirmations is the one that counts.
    assert.equal(g.confirmationId, Math.max(...db.rows("quote_pricing_confirmations").map((c) => Number(c.id))));
  });

  it("refuses a calc the latest confirmation was not made for (revisions share a deal)", async () => {
    // S2 revises S1 on the same deal; confirm records the newest calc, S2.
    db.rows("submissions").push({ ...calcRow(S2, S1, "2026-10-23T09:00:00Z"), pipedrive_deal_id: dealId });
    db.rows("project_submissions").push({ submission_id: S2, project_id: PROJECT });
    db.rows("submission_system_designs").push({ submission_id: S2, bom: BOM });
    assert.ok((await confirmNow()).ok);
    const old = await gate.checkQuoteGate(deps, dealId, S1);
    assert.equal("kind" in old ? old.kind : old.reason, "no-confirmation");
    assert.match("kind" in old ? "" : old.message, /another version of this calc/);
    const latest = await gate.checkQuoteGate(deps, dealId, S2);
    assert.equal("kind" in latest && latest.kind, "gated");
  });

  it("ignores a confirmation row with no lines (one a session wrote before the lockdown)", async () => {
    db.rows("quote_pricing_confirmations").push({
      id: 999, pipedrive_deal_id: dealId, submission_id: S1, confirmed_by: ANDY,
      confirmed_at: "2027-01-01T00:00:00Z", deal_lines_fingerprint: [], deal_lines: null,
    });
    const g = await gate.checkQuoteGate(deps, dealId, S1);
    assert.equal("kind" in g ? g.kind : g.reason, "no-confirmation");
  });

  it("refuses after a line's name or currency changes", async () => {
    assert.ok((await confirmNow()).ok);
    (lines()[0] as { currency?: string }).currency = "EUR";
    let g = await gate.checkQuoteGate(deps, dealId, S1);
    assert.equal("kind" in g ? g.kind : g.reason, "pricing-changed");
    delete (lines()[0] as { currency?: string }).currency;
    (lines()[0] as { name?: string }).name = "Renamed line";
    g = await gate.checkQuoteGate(deps, dealId, S1);
    assert.equal("kind" in g ? g.kind : g.reason, "pricing-changed");
  });

  it("refuses a line it could not fingerprint (no product id) instead of printing it unchecked", async () => {
    assert.ok((await confirmNow()).ok);
    for (const missing of [undefined, null]) {
      (lines()[0] as { product_id: unknown }).product_id = missing;
      const g = await gate.checkQuoteGate(deps, dealId, S1);
      assert.ok(!("kind" in g), String(missing));
      assert.match(g.message, /could not be read/, String(missing));
      const c = await gate.readDealPricing(deps, dealId, ANDY);
      assert.ok(!c.ok);
      assert.match(c.message, /could not be read/, String(missing));
    }
  });

  it("refuses an emptied deal and a deal with a failed ledger row", async () => {
    assert.ok((await confirmNow()).ok);
    pipedrive.deals.get(dealId)!.lines = [];
    let g = await gate.checkQuoteGate(deps, dealId, S1);
    assert.equal("kind" in g ? g.kind : g.reason, "pricing-changed");

    seed();
    dealId = await buildDeal();
    db.rows("deal_line_syncs")[0].status = "failed";
    const confirm = await gate.readDealPricing(deps, dealId, ANDY);
    assert.equal(!confirm.ok && confirm.reason, "lines-pending");
    g = await gate.checkQuoteGate(deps, dealId, S1);
    assert.equal("kind" in g ? g.kind : g.reason, "no-confirmation");
  });

  it("reads every page of the deal's lines", async () => {
    assert.ok((await confirmNow()).ok);
    pipedrive.linePageSize = 3;
    pipedrive.calls = [];
    const g = await gate.checkQuoteGate(deps, dealId, S1);
    assert.ok("kind" in g && g.kind === "gated");
    assert.equal(g.lines.length, 4);
    assert.equal(linesReads(), 2);
    // A second page dropped would be a different deal.
    pipedrive.linePageSize = null;
    lines().pop();
    const short = await gate.checkQuoteGate(deps, dealId, S1);
    assert.equal("kind" in short ? short.kind : short.reason, "pricing-changed");
  });

  it("refuses when Pipedrive cannot be read, and when the claim or ledger read fails", async () => {
    assert.ok((await confirmNow()).ok);
    pipedrive.onGet = (path) => (path.endsWith("/products") ? 502 : null);
    let g = await gate.checkQuoteGate(deps, dealId, S1);
    assert.equal("kind" in g ? g.kind : g.reason, "pipedrive-error");
    pipedrive.onGet = () => null;

    for (const table of ["project_deal_claims", "deal_line_syncs"]) {
      db.failOn = (t, op) => (t === table && op === "select" ? { message: "boom" } : null);
      g = await gate.checkQuoteGate(deps, dealId, S1);
      assert.equal("kind" in g ? g.kind : g.reason, "db-error", table);
      // Never the legacy path.
      const r = await inputs.readQuoteInputs(deps, S1, dealId, recordingReader().read);
      assert.equal(!r.ok && r.reason, "pricing_gate");
    }
  });

  it("leaves legacy and partner deals as they are, flag on or off", async () => {
    for (const flag of ["true", "false"]) {
      process.env.PROJECT_QUOTE_GATE = flag;
      const reader = recordingReader();
      pipedrive.calls = [];
      const r = await inputs.readQuoteInputs(deps, LEGACY, LEGACY_DEAL, reader.read);
      assert.ok(r.ok);
      assert.deepEqual(reader.seen, [undefined], flag);
      assert.equal(r.pricingGate, null);
      assert.equal(r.preparedFor, null);
      assert.equal(pipedrive.calls.length, 0);
    }
  });

  it("with the flag off, a portal-built deal is read as before, with no gate read", async () => {
    process.env.PROJECT_QUOTE_GATE = "false";
    db.failOn = (t) => (t === "project_deal_claims" || t === "deal_line_syncs" || t === "quote_pricing_confirmations" ? { message: "should not be read" } : null);
    const reader = recordingReader();
    const r = await inputs.readQuoteInputs(deps, S1, dealId, reader.read);
    assert.ok(r.ok);
    assert.deepEqual(reader.seen, [undefined]);
    assert.equal(r.pricingGate, null);
  });
});

describe("Prepared for", () => {
  it("a project calc takes the project's company and primary contact, by id", async () => {
    process.env.PROJECT_QUOTE_GATE = "false";
    const r = await inputs.readQuoteInputs(deps, S1, dealId, recordingReader().read);
    assert.ok(r.ok);
    assert.deepEqual(r.preparedFor, {
      projectId: PROJECT,
      companyId: COMPANY,
      companyName: "Escambia Integrators",
      contactId: CONTACT,
      contactName: "Ken Fuller",
      contactEmail: "Ken.Fuller@Example.com",
      contactActive: true,
    });
  });

  it("a legacy calc keeps the old resolver (no project read result)", async () => {
    const r = await inputs.readQuoteInputs(deps, LEGACY, LEGACY_DEAL, recordingReader().read);
    assert.ok(r.ok);
    assert.equal(r.preparedFor, null);
  });

  it("an inactive primary contact, or one moved to another company, is marked so", async () => {
    process.env.PROJECT_QUOTE_GATE = "false";
    db.rows("contacts")[0].active = false;
    let r = await inputs.readQuoteInputs(deps, S1, dealId, recordingReader().read);
    assert.ok(r.ok);
    assert.equal(r.preparedFor?.contactActive, false);
    db.rows("contacts")[0].active = true;
    db.rows("contacts")[0].company_id = "22222222-2222-4222-8222-000000000099";
    r = await inputs.readQuoteInputs(deps, S1, dealId, recordingReader().read);
    assert.ok(r.ok);
    assert.equal(r.preparedFor?.contactActive, false);
  });

  it("a failed project read refuses instead of falling back to the old resolver", async () => {
    process.env.PROJECT_QUOTE_GATE = "false";
    db.failOn = (t, op) => (t === "companies" && op === "select" ? { message: "boom" } : null);
    const r = await inputs.readQuoteInputs(deps, S1, dealId, recordingReader().read);
    assert.equal(!r.ok && r.reason, "project_read_error");
  });
});
