import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildProjectQueue } from "@/lib/projects/rows";
import type {
  BuildProjectQueueInput,
  ProjectQueueRow,
  QueuePartnerRow,
  QueueSubmissionRow,
} from "@/lib/projects/types";
import {
  DEFAULT_FILTERS,
  applyFilters,
  archivedMatches,
  attentionIdSets,
  closestMatch,
  filtersToSearch,
  highlightSegments,
  matchesQuery,
  parseFiltersFromRecord,
  parseFiltersFromSearch,
  type ProjectsFilterState,
} from "./filter";

const VIEWER = "u-internal";
const NOW = new Date("2026-08-03T17:00:00Z");

const PARTNERS: QueuePartnerRow[] = [
  { id: "p1", company_name: "Riverside Security", contact_name: "Ann Adams", is_internal: false },
  { id: "p2", company_name: "Beta LLC", contact_name: "Bob Boyle", is_internal: false },
  { id: VIEWER, company_name: "Arxys", contact_name: "Ivan Internal", is_internal: true },
];

function sub(o: Partial<QueueSubmissionRow> & { id: string }): QueueSubmissionRow {
  return {
    partner_id: "p1",
    project_name: "Untitled",
    status: "open",
    is_preferred: false,
    total_list_price_usd: 100_000,
    pipedrive_deal_id: null,
    created_at: "2026-07-01T09:00:00Z",
    recommended_product_id: "VX5-V800",
    recommended_units: 2,
    ...o,
  };
}

function buildRows(o: Partial<BuildProjectQueueInput>): ProjectQueueRow[] {
  return buildProjectQueue({
    submissions: [],
    partners: PARTNERS,
    quotes: [],
    archives: [],
    dealCache: [],
    viewerId: VIEWER,
    now: NOW,
    latestPriceEffectiveDate: null,
    ...o,
  }).rows;
}

// Fixture: A + D created by the viewer, B by someone else, C archived (also
// by the viewer). Names are chosen so search/closest-match tests read clearly.
const rows = buildRows({
  submissions: [
    sub({ id: "a", partner_id: VIEWER, project_name: "Riverside Campus", status: "open" }),
    sub({ id: "b", partner_id: "p2", project_name: "Beta Warehouse", status: "open" }),
    sub({ id: "c", partner_id: VIEWER, project_name: "Old Campus", status: "open" }),
    sub({ id: "d", partner_id: VIEWER, project_name: "Lost Deal", status: "lost" }),
  ],
  archives: [{ submission_id: "c", archived_at: "2026-08-02T09:51:00Z", archived_by: VIEWER }],
});
const attention = attentionIdSets({
  needs_price_update_submission_ids: [],
  missing_deal_link_submission_ids: [],
});

function ids(list: ProjectQueueRow[]): string[] {
  return list.map((r) => r.submission_id).sort();
}

describe("parseFilters / filtersToSearch round trip", () => {
  it("defaults match DEFAULT_FILTERS from an empty record", () => {
    assert.deepEqual(parseFiltersFromRecord({}), DEFAULT_FILTERS);
  });

  it("round-trips a non-default state through the URL string", () => {
    const state: ProjectsFilterState = {
      q: "riverside",
      mine: true,
      status: "open",
      archived: true,
      view: "partner",
      attention: "needs_price_update",
    };
    const search = filtersToSearch(state);
    assert.deepEqual(parseFiltersFromSearch(search), state);
  });

  it("an explicit mine=1 survives (default is mine=false, not absent=true)", () => {
    assert.equal(parseFiltersFromRecord({ mine: "1" }).mine, true);
    assert.equal(parseFiltersFromRecord({}).mine, false);
  });

  it("filtersToSearch omits every param at its default", () => {
    assert.equal(filtersToSearch(DEFAULT_FILTERS), "");
  });

  it("ignores garbage status/attention/view values", () => {
    const state = parseFiltersFromRecord({ status: "bogus", attention: "nope", view: "grid" });
    assert.equal(state.status, null);
    assert.equal(state.attention, null);
    assert.equal(state.view, "recent");
  });
});

describe("matchesQuery / highlightSegments", () => {
  it("matches project name or partner company, case-insensitively", () => {
    assert.equal(matchesQuery({ project_name: "Riverside Campus", partner_company_name: "X" }, "campus"), true);
    assert.equal(matchesQuery({ project_name: "X", partner_company_name: "Riverside Security" }, "RIVER"), true);
    assert.equal(matchesQuery({ project_name: "X", partner_company_name: "Y" }, "campus"), false);
  });

  it("an empty query matches everything", () => {
    assert.equal(matchesQuery({ project_name: null, partner_company_name: "Y" }, "  "), true);
  });

  it("highlights every case-insensitive occurrence", () => {
    const segs = highlightSegments("Appliance Appliance", "app");
    assert.deepEqual(
      segs.map((s) => [s.text, s.match]),
      [
        ["App", true],
        ["liance ", false],
        ["App", true],
        ["liance", false],
      ],
    );
  });

  it("returns one unmatched segment for an empty query", () => {
    assert.deepEqual(highlightSegments("Riverside", ""), [{ text: "Riverside", match: false }]);
  });
});

describe("applyFilters", () => {
  it("default filters (mine=false, archived=false) show everyone's live rows", () => {
    assert.deepEqual(ids(applyFilters(rows, DEFAULT_FILTERS, VIEWER, attention)), ["a", "b", "d"]);
  });

  it("mine=true narrows to rows the viewer's own id filed", () => {
    const filters: ProjectsFilterState = { ...DEFAULT_FILTERS, mine: true };
    assert.deepEqual(ids(applyFilters(rows, filters, VIEWER, attention)), ["a", "d"]);
  });

  it("archived=true brings the archived row back, still subject to other filters", () => {
    const filters: ProjectsFilterState = { ...DEFAULT_FILTERS, archived: true };
    assert.deepEqual(ids(applyFilters(rows, filters, VIEWER, attention)), ["a", "b", "c", "d"]);
  });

  it("status narrows within the scoped set", () => {
    const filters: ProjectsFilterState = { ...DEFAULT_FILTERS, status: "lost" };
    assert.deepEqual(ids(applyFilters(rows, filters, VIEWER, attention)), ["d"]);
  });

  it("search narrows the already-scoped set", () => {
    const filters: ProjectsFilterState = { ...DEFAULT_FILTERS, q: "beta" };
    assert.deepEqual(ids(applyFilters(rows, filters, VIEWER, attention)), ["b"]);
  });
});

describe("archivedMatches", () => {
  it("finds an archived row matching the query when the archived chip is off", () => {
    const filters: ProjectsFilterState = { ...DEFAULT_FILTERS, q: "campus" };
    assert.deepEqual(ids(archivedMatches(rows, filters, VIEWER, attention)), ["c"]);
  });

  it("is empty once the archived chip is already on", () => {
    const filters: ProjectsFilterState = { ...DEFAULT_FILTERS, q: "campus", archived: true };
    assert.deepEqual(archivedMatches(rows, filters, VIEWER, attention), []);
  });

  it("is empty with no active query", () => {
    assert.deepEqual(archivedMatches(rows, DEFAULT_FILTERS, VIEWER, attention), []);
  });
});

describe("closestMatch", () => {
  it("picks the smallest-edit-distance candidate", () => {
    assert.equal(closestMatch("riverzide", ["Riverside", "Beta LLC", "Acme Corp"]), "Riverside");
  });

  it("returns null for an empty query or no candidates", () => {
    assert.equal(closestMatch("", ["Riverside"]), null);
    assert.equal(closestMatch("riverside", []), null);
  });
});
