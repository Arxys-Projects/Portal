import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  groupIntoDeals,
  computePipelineTotals,
  type SubmissionRow,
  type PartnerRow,
} from "./forecast";

const PARTNERS: PartnerRow[] = [
  { id: "p1", company_name: "Acme Corp" },
  { id: "p2", company_name: "Beta LLC" },
];

function sub(
  overrides: Partial<SubmissionRow> & { id: string },
): SubmissionRow {
  return {
    partner_id: "p1",
    project_name: "Alpha Project",
    status: "open",
    is_preferred: false,
    total_list_price_usd: 10000,
    pipedrive_deal_id: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("groupIntoDeals — dedup", () => {
  it("collapses multiple submissions for the same (partner, project) into one deal", () => {
    const subs = [
      sub({ id: "s1", created_at: "2026-01-01T00:00:00Z" }),
      sub({ id: "s2", created_at: "2026-01-02T00:00:00Z" }),
    ];
    const deals = groupIntoDeals(subs, PARTNERS);
    assert.equal(deals.length, 1);
    assert.equal(deals[0].all_submission_ids.length, 2);
  });

  it("treats project names case-insensitively and trims whitespace", () => {
    const subs = [
      sub({ id: "s1", project_name: "  Alpha Project  " }),
      sub({ id: "s2", project_name: "alpha project" }),
    ];
    const deals = groupIntoDeals(subs, PARTNERS);
    assert.equal(deals.length, 1);
  });

  it("keeps deals separate for different partners on the same project name", () => {
    const subs = [
      sub({ id: "s1", partner_id: "p1" }),
      sub({ id: "s2", partner_id: "p2" }),
    ];
    const deals = groupIntoDeals(subs, PARTNERS);
    assert.equal(deals.length, 2);
  });
});

describe("groupIntoDeals — preferred-over-latest", () => {
  it("picks the is_preferred submission over the most-recent one", () => {
    const subs = [
      sub({ id: "older-preferred", is_preferred: true, total_list_price_usd: 5000, created_at: "2026-01-01T00:00:00Z" }),
      sub({ id: "newer-not-preferred", is_preferred: false, total_list_price_usd: 9999, created_at: "2026-02-01T00:00:00Z" }),
    ];
    const deals = groupIntoDeals(subs, PARTNERS);
    assert.equal(deals.length, 1);
    assert.equal(deals[0].representative_id, "older-preferred");
    assert.equal(deals[0].total_list_price_usd, 5000);
  });

  it("falls back to the most-recent submission when none is preferred", () => {
    const subs = [
      sub({ id: "older", created_at: "2026-01-01T00:00:00Z" }),
      sub({ id: "newer", created_at: "2026-02-01T00:00:00Z" }),
    ];
    const deals = groupIntoDeals(subs, PARTNERS);
    assert.equal(deals[0].representative_id, "newer");
  });
});

describe("groupIntoDeals — null project_name", () => {
  it("groups null project_names together under the same partner", () => {
    const subs = [
      sub({ id: "s1", project_name: null }),
      sub({ id: "s2", project_name: null }),
    ];
    const deals = groupIntoDeals(subs, PARTNERS);
    assert.equal(deals.length, 1);
    assert.equal(deals[0].project_name, null);
  });

  it("does not throw on null project_name", () => {
    assert.doesNotThrow(() =>
      groupIntoDeals([sub({ id: "s1", project_name: null })], PARTNERS),
    );
  });
});

describe("groupIntoDeals — on-behalf-of (Phase 7 Step 1)", () => {
  it("rolls an on-behalf-of-partner submission up to the target, not the creator", () => {
    // Creator p1 (internal rep) runs a calc on behalf of partner p2. Only the
    // FK is set (mutual-exclusion invariant); the name resolves from PARTNERS.
    const subs = [
      sub({ id: "s1", partner_id: "p1", on_behalf_of_partner_id: "p2" }),
    ];
    const deals = groupIntoDeals(subs, PARTNERS);
    assert.equal(deals.length, 1);
    assert.equal(deals[0].partner_id, "p2");
    assert.equal(deals[0].partner_name, "Beta LLC");
  });

  it("groups an on-behalf submission with the target partner's own submission", () => {
    const subs = [
      sub({ id: "self", partner_id: "p2" }),
      sub({ id: "on-behalf", partner_id: "p1", on_behalf_of_partner_id: "p2" }),
    ];
    const deals = groupIntoDeals(subs, PARTNERS);
    assert.equal(deals.length, 1);
    assert.equal(deals[0].all_submission_ids.length, 2);
    assert.equal(deals[0].partner_id, "p2");
  });

  it("groups free-typed on-behalf companies by normalised name and labels them", () => {
    const subs = [
      sub({
        id: "s1",
        partner_id: "p1",
        on_behalf_of_company_name: "  Gamma Security  ",
      }),
      sub({
        id: "s2",
        partner_id: "p2",
        on_behalf_of_company_name: "gamma security",
      }),
    ];
    const deals = groupIntoDeals(subs, PARTNERS);
    assert.equal(deals.length, 1);
    assert.equal(deals[0].all_submission_ids.length, 2);
    assert.equal(deals[0].partner_name, "Gamma Security");
  });

  it("leaves normal self-serve submissions grouped by their creator", () => {
    const subs = [sub({ id: "s1", partner_id: "p1" })];
    const deals = groupIntoDeals(subs, PARTNERS);
    assert.equal(deals[0].partner_id, "p1");
    assert.equal(deals[0].partner_name, "Acme Corp");
  });
});

describe("computePipelineTotals — open pipeline and won total (ADR 0081)", () => {
  it("sums open deals into openPipeline and won deals into wonTotal; lost excluded", () => {
    const deals = groupIntoDeals(
      [
        sub({ id: "s1", status: "open", total_list_price_usd: 10000 }),
        sub({ id: "s2", partner_id: "p2", status: "open", total_list_price_usd: 20000 }),
        sub({ id: "s3", project_name: "B", status: "won", total_list_price_usd: 5000 }),
        sub({ id: "s4", project_name: "C", status: "lost", total_list_price_usd: 8000 }),
      ],
      PARTNERS,
    );
    const { openPipeline, wonTotal } = computePipelineTotals(deals);
    assert.equal(openPipeline, 30000); // 10000 + 20000; won/lost excluded
    assert.equal(wonTotal, 5000);
  });

  it("excludes lost deals from both totals", () => {
    const deals = groupIntoDeals(
      [
        sub({ id: "s1", status: "open", total_list_price_usd: 10000 }),
        sub({ id: "s2", project_name: "B", status: "lost", total_list_price_usd: 50000 }),
      ],
      PARTNERS,
    );
    const { openPipeline, wonTotal } = computePipelineTotals(deals);
    assert.equal(openPipeline, 10000);
    assert.equal(wonTotal, 0);
  });

  it("treats a null list price as 0", () => {
    const deals = groupIntoDeals(
      [sub({ id: "s1", status: "open", total_list_price_usd: null })],
      PARTNERS,
    );
    const { openPipeline } = computePipelineTotals(deals);
    assert.equal(openPipeline, 0);
  });
});
