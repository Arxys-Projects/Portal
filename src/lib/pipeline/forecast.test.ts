import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  groupIntoDeals,
  computeWeightedForecast,
  STAGE_PROBABILITY,
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
    status: "sent",
    is_preferred: false,
    total_list_price_usd: 10000,
    pipedrive_deal_id: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("STAGE_PROBABILITY", () => {
  it("has correct weights", () => {
    assert.equal(STAGE_PROBABILITY["on-hold"], 0.2);
    assert.equal(STAGE_PROBABILITY.sent, 0.4);
    assert.equal(STAGE_PROBABILITY.won, 1.0);
    assert.equal(STAGE_PROBABILITY.lost, 0.0);
  });
});

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

describe("computeWeightedForecast — weighted sum", () => {
  it("computes correct weighted totals for a mix of statuses", () => {
    const deals = groupIntoDeals(
      [
        sub({ id: "s1", status: "sent", total_list_price_usd: 10000 }),
        sub({ id: "s2", partner_id: "p2", status: "on-hold", total_list_price_usd: 20000 }),
        sub({ id: "s3", project_name: "B", status: "won", total_list_price_usd: 5000 }),
        sub({ id: "s4", project_name: "C", status: "lost", total_list_price_usd: 8000 }),
      ],
      PARTNERS,
    );
    const { totalOpenPipeline, weightedForecast } = computeWeightedForecast(deals);
    // totalOpenPipeline = 10000 + 20000 + 5000 + 8000 = 43000
    assert.equal(totalOpenPipeline, 43000);
    // weightedForecast = 10000*0.4 + 20000*0.2 + 5000*1.0 + 8000*0.0
    //                  = 4000 + 4000 + 5000 + 0 = 13000
    assert.equal(weightedForecast, 13000);
  });
});

describe("computeWeightedForecast — drafts excluded", () => {
  it("excludes draft submissions from pipeline dollars and weighted forecast", () => {
    const deals = groupIntoDeals(
      [
        sub({ id: "active", status: "sent", total_list_price_usd: 10000 }),
        sub({ id: "draft-deal", project_name: "Draft Project", status: "draft", total_list_price_usd: 99999 }),
      ],
      PARTNERS,
    );
    const { totalOpenPipeline, weightedForecast } = computeWeightedForecast(deals);
    assert.equal(totalOpenPipeline, 10000);
    assert.equal(weightedForecast, 4000);
  });

  it("excludes null-status submissions from pipeline dollars and weighted forecast", () => {
    const deals = groupIntoDeals(
      [
        sub({ id: "active", status: "won", total_list_price_usd: 5000 }),
        sub({ id: "null-status", project_name: "No Status", status: null, total_list_price_usd: 50000 }),
      ],
      PARTNERS,
    );
    const { totalOpenPipeline, weightedForecast } = computeWeightedForecast(deals);
    assert.equal(totalOpenPipeline, 5000);
    assert.equal(weightedForecast, 5000);
  });
});
