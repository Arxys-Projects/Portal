import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  findUnlabeledNameTwins,
  isTestAccountName,
  normalizeCompanyName,
  planCompanies,
  proposeLoginLinks,
  proposeNameMapping,
  selectCompanyOrgs,
  toContactRow,
  type ContactRow,
} from "./sync";
import { findLabelOptionId, waitMsFor429 } from "../pipedrive/company-api";

const LABEL = 73;

describe("selectCompanyOrgs", () => {
  it("takes labeled orgs and include-list orgs, label first", () => {
    const { selected, includesNotFound } = selectCompanyOrgs(
      [
        { id: 1, name: "Labeled ", label_ids: [5, LABEL] },
        { id: 2, name: "Listed", label_ids: [] },
        { id: 3, name: "Neither", label_ids: [5] },
        { id: 4, name: "Both", label_ids: [LABEL] },
      ],
      LABEL,
      [2, 4, 99],
    );
    assert.deepEqual(selected, [
      { orgId: 4, name: "Both", via: "label" },
      { orgId: 1, name: "Labeled", via: "label" },
      { orgId: 2, name: "Listed", via: "include_list" },
    ]);
    assert.deepEqual(includesNotFound, [99]);
  });
});

describe("toContactRow", () => {
  it("takes the primary email (lowercased) and phone, v2 or v1 shape", () => {
    const v2 = toContactRow({ id: 7, name: " Kay ", emails: [{ value: "a@x.com" }, { value: "B@X.com", primary: true }], phones: [{ value: "555" }] }, 1);
    assert.deepEqual(v2, { pipedrivePersonId: 7, orgId: 1, name: "Kay", email: "b@x.com", phone: "555" });
    const v1 = toContactRow({ id: 8, name: "", email: [{ value: "" }], phone: null }, 1);
    assert.deepEqual(v1, { pipedrivePersonId: 8, orgId: 1, name: "Person 8", email: null, phone: null });
  });
});

describe("planCompanies", () => {
  it("splits inserts, renames, reactivations and deactivations", () => {
    const plan = planCompanies(
      [
        { orgId: 1, name: "New Co", via: "label" },
        { orgId: 2, name: "Renamed", via: "label" },
        { orgId: 3, name: "Back", via: "include_list" },
        { orgId: 4, name: "Same", via: "label" },
      ],
      [
        { id: "b", pipedriveOrgId: 2, name: "Old Name", active: true },
        { id: "c", pipedriveOrgId: 3, name: "Back", active: false },
        { id: "d", pipedriveOrgId: 4, name: "Same", active: true },
        { id: "e", pipedriveOrgId: 5, name: "Gone", active: true },
        { id: "f", pipedriveOrgId: 6, name: "Already off", active: false },
      ],
    );
    assert.deepEqual(plan.insert.map((s) => s.orgId), [1]);
    assert.deepEqual(plan.rename, [{ orgId: 2, from: "Old Name", to: "Renamed" }]);
    assert.deepEqual(plan.reactivate, [3]);
    assert.deepEqual(plan.deactivate.map((c) => c.pipedriveOrgId), [5]);
    assert.equal(plan.unchanged, 1);
  });
});

describe("normalizeCompanyName", () => {
  it("drops punctuation, case and trailing legal suffixes", () => {
    assert.equal(normalizeCompanyName("Digital Provisions, Inc."), "digital provisions");
    assert.equal(normalizeCompanyName("LiquidPC, LLC"), "liquidpc");
    assert.equal(normalizeCompanyName("Smith & Sons Co"), "smith and sons");
    assert.equal(normalizeCompanyName("Co"), "co");
  });
});

describe("proposeNameMapping", () => {
  const companies = [
    { orgId: 10, name: "Digital Provisions" },
    { orgId: 20, name: "Cornerstone Security HQ" },
    { orgId: 30, name: "Twin" },
    { orgId: 31, name: "Twin, Inc." },
  ];
  it("matches exact, alias, normalized; flags ambiguous, none, Arxys; skips test accounts", () => {
    const { proposals, skipped } = proposeNameMapping(
      [
        { name: "digital provisions", source: "partner_company_name", count: 3 },
        { name: "Digital Provisions, Inc.", source: "on_behalf_company_name", count: 1 },
        { name: "Cornerstone HQ", source: "partner_company_name", count: 2 },
        { name: "Twin LLC", source: "partner_company_name", count: 1 },
        { name: "Nobody", source: "partner_company_name", count: 1 },
        { name: "Arxys", source: "partner_company_name", count: 1 },
        { name: "RLS Test Co A", source: "partner_company_name", count: 9 },
        { name: "Evil Corp", source: "partner_company_name", count: 1 },
      ],
      companies,
      [{ alias: "cornerstone hq", orgId: 20 }],
    );
    const by = Object.fromEntries(proposals.map((p) => [p.name, p]));
    assert.equal(by["digital provisions"].match, "exact");
    assert.equal(by["Digital Provisions, Inc."].match, "normalized");
    assert.equal(by["Digital Provisions, Inc."].orgId, 10);
    assert.equal(by["Cornerstone HQ"].match, "alias");
    assert.equal(by["Cornerstone HQ"].orgId, 20);
    assert.equal(by["Twin LLC"].match, "ambiguous");
    assert.deepEqual(by["Twin LLC"].candidates?.map((c) => c.orgId), [30, 31]);
    assert.equal(by["Nobody"].match, "none");
    assert.match(by["Arxys"].note ?? "", /Arxys/);
    assert.deepEqual(skipped.map((s) => s.name), ["RLS Test Co A", "Evil Corp"]);
  });

  it("an alias outranks a normalized guess but not an exact name", () => {
    const { proposals } = proposeNameMapping(
      [
        { name: "Digital Provisions, Inc.", source: "partner_company_name", count: 1 },
        { name: "Twin", source: "partner_company_name", count: 1 },
      ],
      companies,
      [{ alias: "Digital Provisions, Inc.", orgId: 20 }, { alias: "twin", orgId: 20 }],
    );
    assert.equal(proposals.find((p) => p.name === "Digital Provisions, Inc.")?.orgId, 20);
    assert.equal(proposals.find((p) => p.name === "Twin")?.match, "exact");
  });
});

describe("findUnlabeledNameTwins", () => {
  it("lists unlabeled orgs named exactly like a portal string", () => {
    const { proposals } = proposeNameMapping(
      [{ name: "Cornerstone HQ", source: "partner_company_name", count: 2 }],
      [{ orgId: 20, name: "Cornerstone HQ" }],
      [],
    );
    const twins = findUnlabeledNameTwins(
      [{ id: 20, name: "Cornerstone HQ" }, { id: 21, name: "cornerstone hq" }, { id: 22, name: "Other" }],
      new Set([20]),
      proposals,
    );
    assert.deepEqual(twins, [{ orgId: 21, orgName: "cornerstone hq", portalName: "Cornerstone HQ", proposedOrgId: 20, proposedCompany: "Cornerstone HQ" }]);
  });
});

describe("proposeLoginLinks", () => {
  const contacts: ContactRow[] = [
    { pipedrivePersonId: 1, orgId: 10, name: "A", email: "a@x.com", phone: null },
    { pipedrivePersonId: 2, orgId: 20, name: "B", email: "b@x.com", phone: null },
    { pipedrivePersonId: 3, orgId: 10, name: "D1", email: "dup@x.com", phone: null },
    { pipedrivePersonId: 4, orgId: 20, name: "D2", email: "dup@x.com", phone: null },
  ];
  const names = new Map([[10, "Ten"], [20, "Twenty"]]);
  const { proposals } = proposeNameMapping(
    [{ name: "Ten", source: "partner_company_name", count: 1 }],
    [{ orgId: 10, name: "Ten" }, { orgId: 20, name: "Twenty" }],
    [],
  );
  it("matches by email and flags mismatch, ambiguity, no contact, no email", () => {
    const links = proposeLoginLinks(
      [
        { partnerId: "p1", email: "A@x.com", companyName: "Ten", contactName: "", status: "active" },
        { partnerId: "p2", email: "b@x.com", companyName: "Ten", contactName: "", status: "active" },
        { partnerId: "p3", email: "dup@x.com", companyName: "Ten", contactName: "", status: "active" },
        { partnerId: "p4", email: "none@x.com", companyName: "Ten", contactName: "", status: "invited" },
        { partnerId: "p5", email: null, companyName: "Ten", contactName: "", status: "active" },
        { partnerId: "p6", email: "a@x.com", companyName: "RLS Test Co A", contactName: "", status: "active" },
        { partnerId: "p7", email: "rls-test-a-1@arxys-rls-test.invalid", companyName: "Somebody", contactName: "", status: "active" },
      ],
      contacts,
      names,
      proposals,
    );
    const by = Object.fromEntries(links.map((l) => [l.partnerId, l]));
    assert.equal(by.p1.result, "match");
    assert.equal(by.p1.pipedrivePersonId, 1);
    assert.equal(by.p2.result, "company_mismatch");
    assert.equal(by.p2.contactCompany, "Twenty");
    assert.equal(by.p3.result, "ambiguous");
    assert.equal(by.p4.result, "no_contact");
    assert.equal(by.p5.result, "no_email");
    assert.equal(by.p6, undefined);
    assert.equal(by.p7, undefined);
  });
});

describe("company-api helpers", () => {
  it("finds the label option case-insensitively on label_ids", () => {
    const fields = [
      { key: "name" },
      { field_code: "label_ids", options: [{ id: 72, label: "Customer" }, { id: 73, label: "ARXYS SECURITY PARTNER" }] },
    ];
    assert.equal(findLabelOptionId(fields, "Arxys Security Partner"), 73);
    assert.equal(findLabelOptionId(fields, "Missing"), null);
  });
  it("reads x-ratelimit-reset as seconds or epoch, clamped", () => {
    assert.equal(waitMsFor429("2"), 2000);
    assert.equal(waitMsFor429(null), 2000);
    assert.equal(waitMsFor429("1700000005", 1700000000000), 5000);
    assert.equal(waitMsFor429("999"), 30000);
  });
});

describe("isTestAccountName", () => {
  it("knows the brief's test accounts", () => {
    assert.ok(isTestAccountName("Gate Test Co suspended"));
    assert.ok(isTestAccountName("Big Corp, inc"));
    assert.ok(isTestAccountName("RLS Hijack Co"));
    assert.ok(isTestAccountName("RLS Test Co INT"));
    assert.ok(!isTestAccountName("Real Co"));
  });
});
