import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { groupProjectRowsByPartner } from "./by-partner";
import type { ProjectQueueRow } from "./types";

// Only the fields the grouping reads are meaningful here; the rest are filled in
// so the fixture is a real ProjectQueueRow and the test breaks if the contract
// changes shape underneath it.
function row(o: Partial<ProjectQueueRow> & { submission_id: string }): ProjectQueueRow {
  return {
    project_name: "A Project",
    partner_company_name: "Riverside Security",
    partner_contact_name: "Ann Adams",
    created_by_user_name: "Ann Adams",
    created_by_is_internal: false,
    created_by_partner_id: "p1",
    created_at: "2026-07-01T09:00:00Z",
    portal_status: "open",
    portal_status_editable: false,
    internal_archived_at: null,
    internal_archived_by: null,
    internal_archived_by_name: null,
    pipedrive_deal_id: 5001,
    pipedrive_deal_url: "https://app.pipedrive.com/deal/5001",
    deal_link_state: "linked",
    pipedrive_deal_status: "open",
    pipedrive_status_as_of: "2026-08-03T09:42:00Z",
    pipedrive_read_ok: true,
    pipedrive_deal_value: 250_000,
    portal_list_price_usd: 100_000,
    deal_line_item_count: 3,
    products_display: "2 × VX5-V800",
    products_source: "recommended",
    current_quote_version: null,
    current_quote_generated_at: null,
    needs_price_update: false,
    project_quote_version_count: 0,
    is_superseded: false,
    project_key: "a project",
    parent_submission_id: null,
    deal_line_items_changed_at: null,
    line_item_drift_count: 0,
    row_state: "no_quote_yet",
    available_actions: {
      task: { kind: "generate_proposal", label: "Make Project Proposal", next_version: 1 },
      pipedrive: {
        kind: "open_deal",
        label: "Pipedrive ↗",
        url: "https://app.pipedrive.com/deal/5001",
        enabled: true,
      },
      archive: { kind: "archive", label: "Archive" },
    },
    ...o,
  };
}

describe("groupProjectRowsByPartner", () => {
  it("counts projects and DISTINCT contacts separately", () => {
    // The header reads "0 projects · 0 contacts", and a company with several
    // people filing projects is the normal case (ADR 0099).
    const groups = groupProjectRowsByPartner([
      row({ submission_id: "s1", partner_contact_name: "Ann Adams" }),
      row({ submission_id: "s2", partner_contact_name: "Cal Chen" }),
      row({ submission_id: "s3", partner_contact_name: "Ann Adams" }),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].project_count, 3);
    assert.equal(groups[0].contact_count, 2);
  });

  it("counts a free-typed on-behalf project as a project with no contact", () => {
    const groups = groupProjectRowsByPartner([
      row({ submission_id: "s1", partner_company_name: "Harbor Systems", partner_contact_name: null }),
    ]);
    assert.equal(groups[0].project_count, 1);
    assert.equal(groups[0].contact_count, 0);
  });

  it("sums open pipeline and won from PORTAL list prices, per the view's own footnote", () => {
    // ADR 0081. Deliberately not the cached Pipedrive value, which is a different
    // number from a different source and belongs to Band C.
    const groups = groupProjectRowsByPartner([
      row({ submission_id: "s1", portal_status: "open", portal_list_price_usd: 100_000 }),
      row({ submission_id: "s2", portal_status: "open", portal_list_price_usd: 50_000 }),
      row({ submission_id: "s3", portal_status: "won", portal_list_price_usd: 400_000 }),
      // Lost contributes to neither.
      row({ submission_id: "s4", portal_status: "lost", portal_list_price_usd: 999_000 }),
    ]);
    assert.equal(groups[0].open_pipeline_usd, 150_000);
    assert.equal(groups[0].won_usd, 400_000);
  });

  it("treats a missing list price as zero rather than dropping the project", () => {
    const groups = groupProjectRowsByPartner([
      row({ submission_id: "s1", portal_list_price_usd: null }),
    ]);
    assert.equal(groups[0].project_count, 1);
    assert.equal(groups[0].open_pipeline_usd, 0);
  });

  it("counts the two warning pills", () => {
    const groups = groupProjectRowsByPartner([
      row({ submission_id: "s1", needs_price_update: true }),
      row({ submission_id: "s2", deal_link_state: "missing", pipedrive_deal_id: null }),
      row({ submission_id: "s3" }),
    ]);
    assert.equal(groups[0].needs_price_update_count, 1);
    assert.equal(groups[0].missing_deal_link_count, 1);
  });

  it("merges case and whitespace variants of one company name", () => {
    const groups = groupProjectRowsByPartner([
      row({ submission_id: "s1", partner_company_name: "Intelli-Tec" }),
      row({ submission_id: "s2", partner_company_name: "Intelli-tec" }),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].company_key, "intelli-tec");
  });

  it("keeps deliberately distinct legal-suffix variants apart", () => {
    // Matching forecast.ts: suffix variants need the partner records reconciled,
    // and regional entities correctly stay separate.
    const groups = groupProjectRowsByPartner([
      row({ submission_id: "s1", partner_company_name: "Digital Provisions" }),
      row({ submission_id: "s2", partner_company_name: "Digital Provisions Inc" }),
    ]);
    assert.equal(groups.length, 2);
  });

  it("orders by open pipeline descending, then by name", () => {
    const groups = groupProjectRowsByPartner([
      row({ submission_id: "s1", partner_company_name: "Small Co", portal_list_price_usd: 10_000 }),
      row({ submission_id: "s2", partner_company_name: "Big Co", portal_list_price_usd: 900_000 }),
      row({ submission_id: "s3", partner_company_name: "Also Small", portal_list_price_usd: 10_000 }),
    ]);
    assert.deepEqual(
      groups.map((g) => g.company_name),
      ["Big Co", "Also Small", "Small Co"],
    );
  });

  it("preserves the queue's row order inside each group", () => {
    const groups = groupProjectRowsByPartner([
      row({ submission_id: "s1" }),
      row({ submission_id: "s2" }),
      row({ submission_id: "s3" }),
    ]);
    assert.deepEqual(
      groups[0].rows.map((r) => r.submission_id),
      ["s1", "s2", "s3"],
    );
  });

  it("groups nothing into nothing", () => {
    assert.deepEqual(groupProjectRowsByPartner([]), []);
  });
});
