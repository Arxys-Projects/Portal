import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  groupIntoDeals,
  computePipelineTotals,
  supersededIds,
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

describe("groupIntoDeals — revision lineage (ADR 0093 step 2)", () => {
  it("merges a revised submission with its source even when the project name changed", () => {
    // This is the exact recurring bug: revise edits the project name, so a
    // pure text match would (and did) leave two separate "Open" deals.
    const subs = [
      sub({
        id: "v1",
        project_name: "North Bergen SD - Grant Quote",
        total_list_price_usd: 171532,
        created_at: "2026-07-24T10:00:00Z",
      }),
      sub({
        id: "v2",
        project_name: "North Bergen SD - Grant Quote Revised",
        parent_submission_id: "v1",
        total_list_price_usd: 225844,
        created_at: "2026-07-24T11:00:00Z",
      }),
    ];
    const deals = groupIntoDeals(subs, PARTNERS);
    assert.equal(deals.length, 1);
    assert.equal(deals[0].all_submission_ids.length, 2);
    assert.equal(deals[0].representative_id, "v2");
    assert.equal(deals[0].total_list_price_usd, 225844);
  });

  it("never lets a superseded (has-a-child) row win representative selection, even if its clock is newer", () => {
    const subs = [
      sub({
        id: "v1",
        parent_submission_id: null,
        created_at: "2026-07-24T12:00:00Z", // clock skew: "later" than v2
        total_list_price_usd: 171532,
      }),
      sub({
        id: "v2",
        parent_submission_id: "v1",
        created_at: "2026-07-24T11:00:00Z",
        total_list_price_usd: 225844,
      }),
    ];
    const deals = groupIntoDeals(subs, PARTNERS);
    assert.equal(deals.length, 1);
    assert.equal(deals[0].representative_id, "v2");
  });

  it("an explicit is_preferred pin still wins over the lineage leaf", () => {
    const subs = [
      sub({ id: "v1", is_preferred: true, total_list_price_usd: 171532 }),
      sub({ id: "v2", parent_submission_id: "v1", total_list_price_usd: 225844 }),
    ];
    const deals = groupIntoDeals(subs, PARTNERS);
    assert.equal(deals[0].representative_id, "v1");
  });

  it("a parent_submission_id pointing outside the given submission set is ignored, not merged or thrown on", () => {
    const subs = [
      sub({ id: "v2", parent_submission_id: "not-in-this-batch" }),
    ];
    assert.doesNotThrow(() => groupIntoDeals(subs, PARTNERS));
    const deals = groupIntoDeals(subs, PARTNERS);
    assert.equal(deals.length, 1);
  });
});

describe("supersededIds (ADR 0093 step 2)", () => {
  it("marks a row superseded once another row's parent_submission_id points to it", () => {
    const subs = [
      sub({ id: "v1" }),
      sub({ id: "v2", parent_submission_id: "v1" }),
    ];
    const ids = supersededIds(subs);
    assert.equal(ids.has("v1"), true);
    assert.equal(ids.has("v2"), false);
  });

  it("returns an empty set when no submission has a parent", () => {
    const ids = supersededIds([sub({ id: "v1" }), sub({ id: "v2" })]);
    assert.equal(ids.size, 0);
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
