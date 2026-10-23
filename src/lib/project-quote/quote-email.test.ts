import { describe, it, before, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

process.env.SMTP_FROM = "noreply@arxys.com";
process.env.SMTP_USER = "andy.newbom@arxys.com";
process.env.INTERNAL_NOTIFICATION_EMAIL = "sales@arxys.com";

import { FakeDb } from "@/lib/projects/project-deal.test-fixtures";
import type * as QuoteEmail from "./quote-email";
import type { ProjectQuoteSnapshot } from "./types";

// Step 6 (ADR 0177): sendQuoteReadyEmail against an in-memory database, a fake
// renderer and a fake mailer. The send log's SQL (unique key, CHECKs, grants)
// is proven in PGlite and the live RLS suite.

let qe: typeof QuoteEmail;
before(async () => {
  mock.module("server-only", { namedExports: {} });
  qe = await import("./quote-email");
});

const ANDY = "11111111-1111-4111-8111-000000000001";
const PARTNER = "11111111-1111-4111-8111-000000000005";
const LOGIN1 = "11111111-1111-4111-8111-0000000000a1";
const LOGIN2 = "11111111-1111-4111-8111-0000000000a2";
const COMPANY = "22222222-2222-4222-8222-000000000001";
const CONTACT = "33333333-3333-4333-8333-000000000001";
const PROJECT = "44444444-4444-4444-8444-000000000001";
const OTHER_CONTACT = "33333333-3333-4333-8333-000000000002";
const OTHER_COMPANY = "22222222-2222-4222-8222-000000000002";
const S1 = "55555555-5555-4555-8555-000000000001";
const S_LEGACY = "55555555-5555-4555-8555-000000000002";
const S_UNGATED = "55555555-5555-4555-8555-000000000003";
const S_NO_PROJECT = "55555555-5555-4555-8555-000000000004";
const LINE = { productId: 1501, productCode: "VX5-V800-864", productName: "Arxys VX5-V800-864", unitPrice: 117054, discount: 10, discountType: "percentage", quantity: 18, lineAmount: 1896274.8, currency: "USD", orderNr: 1 };
const FINGERPRINT = [{ product_id: 1501, code: null, name: "Arxys VX5-V800-864", quantity: 18, unit_price: 117054, line_amount: 1896274.8, discount: 10, discount_type: "percentage", role: "recorder", currency: "USD" }];
const Q_LEGACY_DEAL = "66666666-6666-4666-8666-000000000001";
const Q_PORTAL_GATED = "66666666-6666-4666-8666-000000000002";
const Q_PORTAL_UNGATED = "66666666-6666-4666-8666-000000000003";
const Q_NO_PROJECT = "66666666-6666-4666-8666-000000000004";
const PORTAL_DEAL = 5589;

function snapshot(over: Partial<ProjectQuoteSnapshot> = {}): ProjectQuoteSnapshot {
  return {
    snapshotVersion: 1,
    commercial: { lineItems: [LINE] } as unknown as ProjectQuoteSnapshot["commercial"],
    sizing: { projectName: "Escambia Men's Prison" } as ProjectQuoteSnapshot["sizing"],
    showcase: [],
    terms: { version: "v1", text: "t" } as ProjectQuoteSnapshot["terms"],
    generation: {
      version: 2,
      generatedAt: "2026-10-23T18:00:00.000Z",
      validityDays: 30,
      generatedByUserId: ANDY,
      submissionId: S1,
      dealId: PORTAL_DEAL,
      identifier: "5589-V2-2026-10-23",
    },
    preparedFor: {
      projectId: PROJECT,
      companyId: COMPANY,
      companyName: "Cornerstone Detention - HQ",
      contactId: CONTACT,
      contactName: "Ken Fuller",
      contactEmail: "Ken.Fuller@Example.COM",
      contactActive: true,
    },
    ...over,
  };
}

let db: FakeDb;
let sent: QuoteEmail.QuoteReadyMail[];
let failSend: Error | null;
let deps: QuoteEmail.QuoteEmailDeps;

function seed() {
  db = new FakeDb();
  db.tables.partners = [
    { id: ANDY, status: "active", role: "partner", is_internal: true },
    { id: PARTNER, status: "active", role: "partner", is_internal: false },
    { id: LOGIN1, status: "active", role: "partner", is_internal: false },
    { id: LOGIN2, status: "active", role: "partner", is_internal: false },
  ];
  db.tables.companies = [
    { id: COMPANY, name: "Cornerstone Detention - HQ" },
    { id: OTHER_COMPANY, name: "Other Integrator" },
  ];
  db.tables.contacts = [
    { id: CONTACT, company_id: COMPANY, active: true, name: "Ken Fuller", email: "ken.fuller@example.com" },
    { id: OTHER_CONTACT, company_id: OTHER_COMPANY, active: true, name: "Pat Other", email: "pat@other.example" },
  ];
  db.tables.project_submissions = [S1, S_LEGACY, S_UNGATED].map((submission_id) => ({ submission_id, project_id: PROJECT }));
  db.tables.projects = [{ id: PROJECT, name: "Escambia", vms: null, company_id: COMPANY, primary_contact_id: CONTACT }];
  db.tables.submissions = [S1, S_LEGACY, S_UNGATED, S_NO_PROJECT].map((id) => ({ id, on_behalf_of_partner_id: null }));
  db.tables.quote_pricing_confirmations = [
    { id: 7, pipedrive_deal_id: PORTAL_DEAL, submission_id: S1, deal_lines_fingerprint: FINGERPRINT, deal_lines: [{ id: 1 }] },
  ];
  db.tables.partner_contact_links = [];
  db.tables.project_deal_claims = [{ id: 1, project_id: PROJECT, pipedrive_deal_id: PORTAL_DEAL }];
  db.tables.deal_line_syncs = [];
  const gated = snapshot({ pricingGate: { confirmationId: 7, fingerprint: FINGERPRINT } });
  db.tables.project_quotes = [
    { id: Q_LEGACY_DEAL, submission_id: S_LEGACY, version: 1, pipedrive_deal_id: 4822, snapshot: snapshot() },
    { id: Q_PORTAL_GATED, submission_id: S1, version: 2, pipedrive_deal_id: PORTAL_DEAL, snapshot: gated },
    { id: Q_PORTAL_UNGATED, submission_id: S_UNGATED, version: 1, pipedrive_deal_id: PORTAL_DEAL, snapshot: snapshot() },
    { id: Q_NO_PROJECT, submission_id: S_NO_PROJECT, version: 1, pipedrive_deal_id: 4822, snapshot: snapshot({ preparedFor: undefined }) },
  ];
  sent = [];
  failSend = null;
  deps = {
    admin: db.client(),
    render: async () => new Uint8Array([37, 80, 68, 70]),
    filename: () => "Arxys Quote - 5589 - V2.pdf",
    sendMail: async (mail) => {
      if (failSend) throw failSend;
      sent.push(mail);
    },
    now: () => new Date("2026-10-24T09:00:00Z"),
  };
}

const log = () => db.rows("quote_email_sends");

beforeEach(() => {
  process.env.PROJECT_QUOTE_EMAIL = "true";
  seed();
});

describe("sendQuoteReadyEmail", () => {
  it("sends once to the snapshot's contact, lowercased, with the PDF, and logs it", async () => {
    const r = await qe.sendQuoteReadyEmail(deps, Q_PORTAL_GATED, ANDY);
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(sent.length, 1);
    const [mail] = sent;
    // The snapshot's address, lowercased (the live row only has to agree).
    assert.equal(mail.to, "ken.fuller@example.com");
    assert.equal(mail.from, "noreply@arxys.com");
    assert.equal(mail.bcc, "andy.newbom@arxys.com");
    assert.equal(mail.replyTo, "sales@arxys.com");
    assert.equal("cc" in mail, false);
    assert.equal(mail.attachments[0].filename, "Arxys Quote - 5589 - V2.pdf");
    assert.equal(mail.attachments[0].contentType, "application/pdf");
    assert.deepEqual(
      log().map((l) => [l.project_quote_id, l.to_email, l.sent_by, l.status]),
      [[Q_PORTAL_GATED, "ken.fuller@example.com", ANDY, "sent"]],
    );
  });

  it("a second call sends nothing (double click)", async () => {
    assert.ok((await qe.sendQuoteReadyEmail(deps, Q_PORTAL_GATED, ANDY)).ok);
    const again = await qe.sendQuoteReadyEmail(deps, Q_PORTAL_GATED, ANDY);
    assert.equal(!again.ok && again.reason, "already-sent");
    assert.equal(sent.length, 1);
  });

  it("an SMTP failure marks the row failed and is never resent on its own", async () => {
    failSend = new Error("550 mailbox unavailable");
    const r = await qe.sendQuoteReadyEmail(deps, Q_PORTAL_GATED, ANDY);
    assert.equal(!r.ok && r.reason, "send-failed");
    assert.equal(log()[0].status, "failed");
    assert.match(String(log()[0].error), /550/);
    failSend = null;
    const again = await qe.sendQuoteReadyEmail(deps, Q_PORTAL_GATED, ANDY);
    assert.equal(!again.ok && again.reason, "send-blocked");
    assert.equal(sent.length, 0);
  });

  it("refuses with the flag off and for a non-internal actor, sending nothing", async () => {
    process.env.PROJECT_QUOTE_EMAIL = "false";
    let r = await qe.sendQuoteReadyEmail(deps, Q_PORTAL_GATED, ANDY);
    assert.equal(!r.ok && r.reason, "flag-off");
    process.env.PROJECT_QUOTE_EMAIL = "true";
    r = await qe.sendQuoteReadyEmail(deps, Q_PORTAL_GATED, PARTNER);
    assert.equal(!r.ok && r.reason, "not-allowed");
    assert.equal(sent.length + log().length, 0);
  });

  it("refuses a portal-built deal's quote that carries no confirmation", async () => {
    const r = await qe.sendQuoteReadyEmail(deps, Q_PORTAL_UNGATED, ANDY);
    assert.equal(!r.ok && r.reason, "no-confirmation");
    // A deal the portal did not build needs none.
    assert.ok((await qe.sendQuoteReadyEmail(deps, Q_LEGACY_DEAL, ANDY)).ok);
  });

  it("refuses a quote with no project contact, an inactive contact, and a contact with no email", async () => {
    let r = await qe.sendQuoteReadyEmail(deps, Q_NO_PROJECT, ANDY);
    assert.equal(!r.ok && r.reason, "no-recipient");

    db.rows("contacts")[0].active = false;
    r = await qe.sendQuoteReadyEmail(deps, Q_PORTAL_GATED, ANDY);
    assert.equal(!r.ok && r.reason, "no-recipient");
    db.rows("contacts")[0].active = true;

    const q = db.rows("project_quotes").find((x) => x.id === Q_PORTAL_GATED)!;
    const snap = q.snapshot as ProjectQuoteSnapshot;
    q.snapshot = { ...snap, preparedFor: { ...snap.preparedFor!, contactEmail: null } };
    r = await qe.sendQuoteReadyEmail(deps, Q_PORTAL_GATED, ANDY);
    assert.equal(!r.ok && r.reason, "no-recipient");
    q.snapshot = { ...snap, preparedFor: { ...snap.preparedFor!, contactActive: false } };
    r = await qe.sendQuoteReadyEmail(deps, Q_PORTAL_GATED, ANDY);
    assert.equal(!r.ok && r.reason, "no-recipient");
    assert.equal(sent.length + log().length, 0);
  });

  it("links the portal only when the contact's one login sees the calc", async () => {
    const linkOf = async () => {
      const r = await qe.planQuoteReadyEmail(deps, Q_PORTAL_GATED, ANDY);
      assert.ok(r.ok, JSON.stringify(r));
      return r.mail.text.includes("/submissions/") ? "portal" : r.mail.text.includes("/login") ? "request" : "none";
    };
    // No login.
    assert.equal(await linkOf(), "request");
    // Exactly one login, granted on the calc.
    db.tables.partner_contact_links = [{ partner_id: LOGIN1, contact_id: CONTACT, company_id: COMPANY }];
    db.rows("submissions")[0].on_behalf_of_partner_id = LOGIN1;
    assert.equal(await linkOf(), "portal");
    // Several logins.
    db.tables.partner_contact_links.push({ partner_id: LOGIN2, contact_id: CONTACT, company_id: COMPANY });
    assert.equal(await linkOf(), "request");
    // One login, but the calc was saved before it was linked (no grant).
    db.tables.partner_contact_links = [{ partner_id: LOGIN1, contact_id: CONTACT, company_id: COMPANY }];
    db.rows("submissions")[0].on_behalf_of_partner_id = null;
    assert.equal(await linkOf(), "request");
  });

  it("checks a stored snapshot against live rows before sending (review gate S-1)", async () => {
    const q = db.rows("project_quotes").find((x) => x.id === Q_PORTAL_GATED)!;
    const snap = q.snapshot as ProjectQuoteSnapshot;
    const tries: [string, () => void, () => void][] = [
      [
        "the contact's live email differs",
        () => (db.rows("contacts")[0].email = "someone.else@example.com"),
        () => (db.rows("contacts")[0].email = "ken.fuller@example.com"),
      ],
      [
        "a made-up confirmation id",
        () => (q.snapshot = { ...snap, pricingGate: { confirmationId: 999, fingerprint: FINGERPRINT } }),
        () => (q.snapshot = snap),
      ],
      [
        "a confirmation for another calc",
        () => (db.rows("quote_pricing_confirmations")[0].submission_id = S_UNGATED),
        () => (db.rows("quote_pricing_confirmations")[0].submission_id = S1),
      ],
      [
        "a forged line price in the snapshot",
        () => (q.snapshot = { ...snap, commercial: { lineItems: [{ ...LINE, unitPrice: 1 }] } as unknown as ProjectQuoteSnapshot["commercial"] }),
        () => (q.snapshot = snap),
      ],
      [
        "a confirmation row with no lines",
        () => (db.rows("quote_pricing_confirmations")[0].deal_lines = null),
        () => (db.rows("quote_pricing_confirmations")[0].deal_lines = [{ id: 1 }]),
      ],
    ];
    for (const [label, breakIt, restore] of tries) {
      breakIt();
      const r = await qe.sendQuoteReadyEmail(deps, Q_PORTAL_GATED, ANDY);
      assert.equal(r.ok, false, label);
      restore();
    }
    assert.equal(sent.length + log().length, 0);
    assert.ok((await qe.sendQuoteReadyEmail(deps, Q_PORTAL_GATED, ANDY)).ok);
  });

  it("refuses a snapshot naming another company's real, active contact (review gate S-8)", async () => {
    const q = db.rows("project_quotes").find((x) => x.id === Q_PORTAL_GATED)!;
    const snap = q.snapshot as ProjectQuoteSnapshot;
    q.snapshot = {
      ...snap,
      preparedFor: { ...snap.preparedFor!, companyId: OTHER_COMPANY, companyName: "Other Integrator", contactId: OTHER_CONTACT, contactName: "Pat Other", contactEmail: "pat@other.example" },
    };
    const r = await qe.sendQuoteReadyEmail(deps, Q_PORTAL_GATED, ANDY);
    assert.equal(!r.ok && r.reason, "no-recipient");
    assert.equal(sent.length + log().length, 0);
  });

  it("refuses a quote made before the deal's latest confirmation (review A-11)", async () => {
    db.rows("quote_pricing_confirmations").push({ id: 8, pipedrive_deal_id: PORTAL_DEAL, submission_id: S1, deal_lines_fingerprint: FINGERPRINT, deal_lines: [{ id: 1 }], confirmed_at: "2026-10-24T08:00:00Z" });
    db.rows("quote_pricing_confirmations")[0].confirmed_at = "2026-10-23T08:00:00Z";
    const r = await qe.sendQuoteReadyEmail(deps, Q_PORTAL_GATED, ANDY);
    assert.match(!r.ok ? r.message : "", /confirmed again after this quote/);
    assert.equal(sent.length, 0);
  });

  it("sends only the calc's newest quote, and only while it is valid (review gate S-4)", async () => {
    db.rows("project_quotes").push({ id: "66666666-6666-4666-8666-000000000009", submission_id: S1, version: 3, pipedrive_deal_id: PORTAL_DEAL, snapshot: snapshot() });
    let r = await qe.sendQuoteReadyEmail(deps, Q_PORTAL_GATED, ANDY);
    assert.match(!r.ok ? r.message : "", /newer version/);
    seed();
    r = await qe.sendQuoteReadyEmail({ ...deps, now: () => new Date("2026-11-23T00:00:00Z") }, Q_PORTAL_GATED, ANDY);
    assert.match(!r.ok ? r.message : "", /expired on 2026-11-22/);
    assert.equal(sent.length, 0);
  });

  it("the test override replaces the recipient and is what the log records", async () => {
    const r = await qe.sendQuoteReadyEmail({ ...deps, recipientOverride: " Andy.Newbom@Arxys.com " }, Q_PORTAL_GATED, ANDY);
    assert.ok(r.ok);
    assert.equal(sent[0].to, "andy.newbom@arxys.com");
    // Same address as the audit copy: no BCC to itself.
    assert.equal(sent[0].bcc, undefined);
    assert.equal(log()[0].to_email, "andy.newbom@arxys.com");
  });

  it("no app code path sets or reads the recipient override", () => {
    const root = path.resolve(process.cwd(), "src");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) && !full.endsWith(path.join("project-quote", "quote-email.ts"))) {
          if (readFileSync(full, "utf8").includes("recipientOverride")) hits.push(path.relative(root, full));
        }
      }
    };
    walk(root);
    assert.deepEqual(hits, []);
    const own = readFileSync(path.join(root, "lib", "project-quote", "quote-email.ts"), "utf8");
    assert.doesNotMatch(own, /process\.env[^\n]*[Oo]verride|env\.[A-Z_]*OVERRIDE/);
  });
});

describe("the email copy", () => {
  it("says what is attached and where to find it, with no em dash", () => {
    for (const portalLink of [true, false]) {
      const { subject, text } = qe.buildQuoteReadyText({
        contactName: "Ken Fuller",
        projectName: "Escambia Men's Prison",
        identifier: "5589-V2-2026-10-23",
        validThrough: "2026-11-22",
        submissionId: S1,
        portalLink,
      });
      assert.equal(subject, "Arxys quote for Escambia Men's Prison");
      assert.match(text, /^Hi Ken,/);
      assert.match(text, /is attached \(5589-V2-2026-10-23\)\. It is valid through November 22, 2026\./);
      assert.match(text, portalLink ? new RegExp(`https://portal\\.arxys\\.com/submissions/${S1}`) : /https:\/\/portal\.arxys\.com\/login/);
      assert.doesNotMatch(`${subject}\n${text}`, /—|–/);
      assert.doesNotMatch(text, /\bnot\b[^.]*\bbut\b/i);
    }
  });

  it("caps a long project name", () => {
    const { subject } = qe.buildQuoteReadyText({
      contactName: null,
      projectName: "x".repeat(500),
      identifier: "1-V1-2026-10-23",
      validThrough: "2026-11-22",
      submissionId: S1,
      portalLink: false,
    });
    assert.equal(subject, `Arxys quote for ${"x".repeat(120)}`);
    const { text } = qe.buildQuoteReadyText({
      contactName: null,
      projectName: "Escambia\nPay the invoice at example.com",
      identifier: "1-V1-2026-10-23",
      validThrough: "2026-11-22",
      submissionId: S1,
      portalLink: false,
    });
    assert.match(text, /for Escambia Pay the invoice at example\.com is attached/);
  });
});
