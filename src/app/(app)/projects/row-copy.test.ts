import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ProjectQueueRow } from "@/lib/projects/types";
import {
  archivedStripText,
  cardBorder,
  formatDealStatusLabel,
  productsSourceChip,
  stateZoneCopy,
  topStripCopy,
  valueCellText,
} from "./row-copy";

const NOW = "2026-08-03T17:00:00.000Z";
const VIEWER = "u-internal";
// Pins clock-time output deterministically regardless of the test machine's
// local timezone (see format.ts) — production leaves this unset.
const TZ = "UTC";

// A row-copy test operates directly on an already-derived ProjectQueueRow —
// unlike rows.test.ts, it is not re-proving row_state's precedence, only that
// this module prints the right words for a state that is already decided. So
// fixtures here just set the fields stateZoneCopy/topStripCopy/etc. actually
// read, overriding a "quote_current" baseline per test.
function baseRow(overrides: Partial<ProjectQueueRow>): ProjectQueueRow {
  return {
    submission_id: "s1",
    project_name: "Riverside Campus",
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
    portal_list_price_usd: 250_000,
    deal_line_item_count: 3,
    products_display: "2 × V800",
    products_source: "quoted",
    current_quote_version: 3,
    current_quote_generated_at: "2026-08-01T10:00:00Z",
    needs_price_update: false,
    project_quote_version_count: 3,
    is_superseded: false,
    project_key: "riverside campus",
    parent_submission_id: null,
    deal_line_items_changed_at: null,
    line_item_drift_count: 0,
    row_state: "quote_current",
    available_actions: {
      task: { kind: "generate_next_proposal", label: "New Project Proposal v4", next_version: 4 },
      pipedrive: { kind: "open_deal", label: "Pipedrive ↗", url: "https://app.pipedrive.com/deal/5001", enabled: true },
      archive: { kind: "archive", label: "Archive" },
    },
    ...overrides,
  };
}

describe("stateZoneCopy", () => {
  it("quote_current: headline reads 'current', qualifier carries the generated date", () => {
    const copy = stateZoneCopy(baseRow({}), NOW);
    assert.equal(copy.dot, "green");
    assert.equal(copy.tone, "ink");
    assert.equal(copy.headline, "Quote v3 · current");
    assert.equal(copy.qualifier, "Generated 1 Aug");
  });

  it("proposal_just_generated: headline still reads 'current', qualifier forces 'today'", () => {
    const row = baseRow({
      row_state: "proposal_just_generated",
      current_quote_version: 4,
      current_quote_generated_at: "2026-08-03T09:47:00Z",
    });
    const copy = stateZoneCopy(row, NOW);
    assert.equal(copy.dot, "green");
    assert.equal(copy.headline, "Quote v4 · current");
    assert.equal(copy.qualifier, "Generated today");
  });

  it("quote_needs_price_update: the amber headline names why", () => {
    const row = baseRow({
      row_state: "quote_needs_price_update",
      current_quote_version: 1,
      current_quote_generated_at: "2026-07-20T10:00:00Z",
      needs_price_update: true,
    });
    const copy = stateZoneCopy(row, NOW);
    assert.equal(copy.dot, "amber");
    assert.equal(copy.tone, "amber");
    assert.equal(copy.headline, "Quote v1 · pricing changed");
    assert.equal(copy.qualifier, "Generated 20 Jul · deal still open");
  });

  it("line_items_drifted: qualifier reports the differing-line count, pluralized", () => {
    const row = baseRow({
      row_state: "line_items_drifted",
      current_quote_version: 2,
      current_quote_generated_at: "2026-08-01T10:00:00Z",
      line_item_drift_count: 1,
    });
    assert.equal(stateZoneCopy(row, NOW).qualifier, "Generated 1 Aug · 1 line differs");

    const two = baseRow({
      row_state: "line_items_drifted",
      current_quote_version: 2,
      line_item_drift_count: 3,
    });
    assert.match(stateZoneCopy(two, NOW).qualifier, /3 lines differ$/);
  });

  it("deal_zero_line_items: grey dot, ink text, names the empty deal", () => {
    const row = baseRow({
      row_state: "deal_zero_line_items",
      current_quote_version: null,
      current_quote_generated_at: null,
      deal_line_item_count: 0,
      products_source: "recommended",
    });
    const copy = stateZoneCopy(row, NOW);
    assert.equal(copy.dot, "grey");
    assert.equal(copy.tone, "ink");
    assert.equal(copy.headline, "No quote yet");
    assert.equal(copy.qualifier, "Deal has 0 line items");
  });

  it("no_quote_yet: distinguishes a known positive count from an unread deal", () => {
    const known = baseRow({
      row_state: "no_quote_yet",
      current_quote_version: null,
      deal_line_item_count: 5,
    });
    assert.equal(stateZoneCopy(known, NOW).qualifier, "Deal has 5 line items");

    const unread = baseRow({
      row_state: "no_quote_yet",
      current_quote_version: null,
      deal_line_item_count: null,
    });
    assert.equal(stateZoneCopy(unread, NOW).qualifier, "Pipedrive not yet read");
  });

  it("no_deal_link: red dot and red text", () => {
    const row = baseRow({ row_state: "no_deal_link", deal_link_state: "missing", pipedrive_deal_id: null });
    const copy = stateZoneCopy(row, NOW);
    assert.equal(copy.dot, "red");
    assert.equal(copy.tone, "red");
    assert.equal(copy.headline, "No Pipedrive deal linked");
  });

  it("archived: names the kept version when one exists, else 'No quote yet'", () => {
    const withQuote = baseRow({ row_state: "archived", current_quote_version: 2 });
    assert.equal(stateZoneCopy(withQuote, NOW).headline, "Quote v2 kept");
    assert.equal(stateZoneCopy(withQuote, NOW).qualifier, "Hidden from your queue only");

    const withoutQuote = baseRow({ row_state: "archived", current_quote_version: null });
    assert.equal(stateZoneCopy(withoutQuote, NOW).headline, "No quote yet");
  });
});

describe("cardBorder", () => {
  it("only the four specified states get a special border", () => {
    assert.equal(cardBorder("no_deal_link"), "red-2");
    assert.equal(cardBorder("quote_needs_price_update"), "amber-2");
    assert.equal(cardBorder("archived"), "dashed");
    for (const s of [
      "proposal_just_generated",
      "line_items_drifted",
      "quote_current",
      "deal_zero_line_items",
      "no_quote_yet",
    ] as const) {
      assert.equal(cardBorder(s), "default");
    }
  });
});

describe("topStripCopy", () => {
  it("proposal_just_generated: green strip, always 'by you'", () => {
    const row = baseRow({
      row_state: "proposal_just_generated",
      current_quote_version: 4,
      current_quote_generated_at: "2026-08-03T09:47:00Z",
    });
    const strip = topStripCopy(row, NOW, TZ);
    assert.equal(strip?.tone, "green");
    assert.equal(
      strip?.text,
      "✓ Project Proposal v4 generated today at 9:47 AM by you · Ready to download and send",
    );
  });

  it("line_items_drifted: names the observed change date when known", () => {
    const row = baseRow({
      row_state: "line_items_drifted",
      current_quote_version: 2,
      deal_line_items_changed_at: "2026-08-02T09:00:00Z",
    });
    const strip = topStripCopy(row, NOW, TZ);
    assert.equal(strip?.tone, "amber");
    assert.equal(
      strip?.text,
      "Pipedrive line items changed 2 Aug, after Quote v2 was generated · v2 no longer matches the deal",
    );
  });

  it("line_items_drifted: falls back gracefully when no change was ever observed", () => {
    const row = baseRow({
      row_state: "line_items_drifted",
      current_quote_version: 2,
      deal_line_items_changed_at: null,
    });
    const strip = topStripCopy(row, NOW, TZ);
    assert.equal(
      strip?.text,
      "Pipedrive line items have changed since Quote v2 was generated · v2 no longer matches the deal",
    );
  });

  it("is null for every other state", () => {
    assert.equal(topStripCopy(baseRow({ row_state: "quote_current" }), NOW), null);
    assert.equal(topStripCopy(baseRow({ row_state: "no_deal_link" }), NOW), null);
  });
});

describe("archivedStripText", () => {
  it("reads 'by you' for the viewer's own archive", () => {
    const row = baseRow({
      row_state: "archived",
      internal_archived_at: "2026-08-03T09:51:00Z",
      internal_archived_by: VIEWER,
      internal_archived_by_name: "Ivan Internal",
    });
    assert.equal(
      archivedStripText(row, VIEWER, NOW, TZ),
      "Archived today at 9:51 AM by you · nothing was deleted",
    );
  });

  it("names someone else's archive by their contact name", () => {
    const row = baseRow({
      row_state: "archived",
      internal_archived_at: "2026-07-30T09:51:00Z",
      internal_archived_by: "someone-else",
      internal_archived_by_name: "Priya Patel",
    });
    assert.equal(
      archivedStripText(row, VIEWER, NOW, TZ),
      "Archived 30 Jul at 9:51 AM by Priya Patel · nothing was deleted",
    );
  });

  it("is null for a non-archived row", () => {
    assert.equal(archivedStripText(baseRow({ row_state: "quote_current" }), VIEWER, NOW, TZ), null);
  });
});

describe("valueCellText", () => {
  it("overrides no_deal_link and a linked deal never successfully read", () => {
    assert.equal(valueCellText(baseRow({ row_state: "no_deal_link" })), "Value unavailable");
    assert.equal(
      valueCellText(baseRow({ row_state: "quote_current", pipedrive_deal_value: null })),
      "Value unavailable",
    );
    assert.equal(valueCellText(baseRow({ row_state: "quote_current" })), null);
  });
});

describe("productsSourceChip", () => {
  it("distinguishes Quoted (solid) from Recommended (dashed)", () => {
    assert.deepEqual(productsSourceChip("quoted"), { label: "Quoted", dashed: false });
    assert.deepEqual(productsSourceChip("recommended"), { label: "Recommended", dashed: true });
  });
});

describe("formatDealStatusLabel", () => {
  it("titlecases a known status and falls back for null", () => {
    assert.equal(formatDealStatusLabel("open"), "Open");
    assert.equal(formatDealStatusLabel("deleted"), "Deleted");
    assert.equal(formatDealStatusLabel(null), "Not linked");
  });
});
