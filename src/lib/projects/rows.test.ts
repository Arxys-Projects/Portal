import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ACTION_LABELS, buildProjectQueue, isCacheReadOk, pickCurrentQuote } from "./rows";
import type {
  BuildProjectQueueInput,
  DealLineFingerprint,
  ProjectQueueRow,
  QueueArchiveRow,
  QueueDealCacheRow,
  QueuePartnerRow,
  QueueQuoteRow,
  QueueSubmissionRow,
} from "./types";

// The viewer is the one internal sales user; VIEWER is his partners.id.
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
    project_name: "Riverside Campus",
    status: "open",
    is_preferred: false,
    total_list_price_usd: 100_000,
    pipedrive_deal_id: "5001",
    created_at: "2026-07-01T09:00:00Z",
    recommended_product_id: "VX5-V800",
    recommended_units: 2,
    ...o,
  };
}

function line(o: Partial<DealLineFingerprint> & { product_id: number }): DealLineFingerprint {
  return {
    product_id: o.product_id,
    code: o.code ?? `SKU-${o.product_id}`,
    name: o.name ?? null,
    quantity: o.quantity ?? 1,
    unit_price: o.unit_price ?? 1000,
    line_amount: o.line_amount ?? 1000,
  };
}

function quote(o: Partial<QueueQuoteRow> & { submission_id: string; version: number }): QueueQuoteRow {
  return {
    pipedrive_deal_id: 5001,
    generated_at: "2026-08-01T10:00:00Z",
    generated_by: VIEWER,
    line_items: [line({ product_id: 1 })],
    ...o,
  };
}

function cache(o: Partial<QueueDealCacheRow> & { pipedrive_deal_id: number }): QueueDealCacheRow {
  return {
    deal_status: "open",
    deal_value: 250_000,
    currency: "USD",
    line_item_count: 1,
    line_items: [line({ product_id: 1 })],
    deal_update_time: "2026-08-01T09:00:00Z",
    line_items_changed_at: null,
    read_at: "2026-08-03T09:42:00Z",
    last_failed_at: null,
    last_error: null,
    ...o,
  };
}

function build(o: Partial<BuildProjectQueueInput>): ProjectQueueRow[] {
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

function only(o: Partial<BuildProjectQueueInput>): ProjectQueueRow {
  const rows = build(o);
  assert.equal(rows.length, 1, "expected exactly one project row");
  return rows[0];
}

function archive(o: Partial<QueueArchiveRow> & { submission_id: string }): QueueArchiveRow {
  return { archived_at: "2026-08-03T09:51:00Z", archived_by: VIEWER, ...o };
}

// ===========================================================================
// The nine row states from the spec's state table.
//
// Six of them are card treatments; "Superseded" and "Pipedrive read failed" are
// additive chips that can co-occur with any state, and "Keyboard focused" is a
// focus ring the page owns. See ProjectRowState in types.ts.
// ===========================================================================

describe("row state 1 — proposal just generated", () => {
  it("holds the green strip, and slot 1 becomes the download naming the version", () => {
    const row = only({
      submissions: [sub({ id: "s1" })],
      quotes: [quote({ submission_id: "s1", version: 4, generated_at: "2026-08-03T09:47:00Z" })],
      dealCache: [cache({ pipedrive_deal_id: 5001 })],
    });
    assert.equal(row.row_state, "proposal_just_generated");
    assert.equal(row.available_actions.task.kind, "download_proposal");
    assert.equal(row.available_actions.task.label, "Download Proposal v4");
  });

  it("is scoped to the viewer — somebody else's proposal is not 'by you'", () => {
    const row = only({
      submissions: [sub({ id: "s1" })],
      quotes: [
        quote({
          submission_id: "s1",
          version: 4,
          generated_at: "2026-08-03T09:47:00Z",
          generated_by: "someone-else",
        }),
      ],
      dealCache: [cache({ pipedrive_deal_id: 5001 })],
    });
    assert.equal(row.row_state, "quote_current");
  });

  it("survives a reload — the state comes from stored data, not from a session flag", () => {
    // Acceptance check 4: "Generating a proposal leaves a permanent timestamped
    // line on the row after a reload." A second identical build is a reload.
    const input = {
      submissions: [sub({ id: "s1" })],
      quotes: [quote({ submission_id: "s1", version: 4, generated_at: "2026-08-03T09:47:00Z" })],
      dealCache: [cache({ pipedrive_deal_id: 5001 })],
    };
    assert.equal(only(input).row_state, "proposal_just_generated");
    assert.equal(only(input).row_state, "proposal_just_generated");
    assert.equal(only(input).current_quote_generated_at, "2026-08-03T09:47:00Z");
  });
});

describe("row state 2 — quote current, no price update pending", () => {
  it("offers the download as the primary action when nothing has changed", () => {
    const row = only({
      submissions: [sub({ id: "s1" })],
      quotes: [quote({ submission_id: "s1", version: 3 })],
      dealCache: [cache({ pipedrive_deal_id: 5001 })],
    });
    assert.equal(row.row_state, "quote_current");
    assert.equal(row.current_quote_version, 3);
    assert.equal(row.needs_price_update, false);
    assert.equal(row.available_actions.task.kind, "download_proposal");
    assert.equal(row.available_actions.task.label, "Download Proposal v3");
  });

  it("is not flagged when no price update has ever been recorded", () => {
    const row = only({
      submissions: [sub({ id: "s1" })],
      quotes: [quote({ submission_id: "s1", version: 1, generated_at: "2026-01-01T10:00:00Z" })],
      dealCache: [cache({ pipedrive_deal_id: 5001 })],
      latestPriceEffectiveDate: null,
    });
    assert.equal(row.needs_price_update, false);
  });

  it("is not flagged when the last price update predates the quote", () => {
    const row = only({
      submissions: [sub({ id: "s1" })],
      quotes: [quote({ submission_id: "s1", version: 1, generated_at: "2026-08-01T10:00:00Z" })],
      dealCache: [cache({ pipedrive_deal_id: 5001 })],
      latestPriceEffectiveDate: "2026-07-01",
    });
    assert.equal(row.needs_price_update, false);
    assert.equal(row.row_state, "quote_current");
  });
});

describe("row state 3 — quote needs a price update on an open deal", () => {
  it("flags a quote generated before the portal's last price update", () => {
    const row = only({
      submissions: [sub({ id: "s1" })],
      quotes: [quote({ submission_id: "s1", version: 1, generated_at: "2026-07-20T10:00:00Z" })],
      dealCache: [cache({ pipedrive_deal_id: 5001, deal_status: "open" })],
      latestPriceEffectiveDate: "2026-07-25",
    });
    assert.equal(row.row_state, "quote_needs_price_update");
    assert.equal(row.needs_price_update, true);
    assert.equal(row.available_actions.task.kind, "generate_next_proposal");
    assert.equal(row.available_actions.task.label, "Update Project Pricing");
  });

  it("does NOT flag on a won or lost deal", () => {
    // A stale-priced proposal on a closed deal is not something to chase.
    for (const status of ["won", "lost", "deleted"] as const) {
      const row = only({
        submissions: [sub({ id: "s1" })],
        quotes: [quote({ submission_id: "s1", version: 1, generated_at: "2026-07-20T10:00:00Z" })],
        dealCache: [cache({ pipedrive_deal_id: 5001, deal_status: status })],
        latestPriceEffectiveDate: "2026-07-25",
      });
      assert.equal(row.needs_price_update, false, `${status} deal must not read as needing a price update`);
      assert.equal(row.row_state, "quote_current");
    }
  });

  it("does NOT flag when the deal status has never been read", () => {
    const row = only({
      submissions: [sub({ id: "s1" })],
      quotes: [quote({ submission_id: "s1", version: 1, generated_at: "2026-07-20T10:00:00Z" })],
      dealCache: [],
      latestPriceEffectiveDate: "2026-07-25",
    });
    assert.equal(row.needs_price_update, false);
    assert.equal(row.pipedrive_read_ok, false);
  });
});

describe("row state 4 — line items changed since the quote", () => {
  it("reports the differing-line count and the observed change timestamp", () => {
    const row = only({
      submissions: [sub({ id: "s1" })],
      quotes: [
        quote({
          submission_id: "s1",
          version: 2,
          line_items: [line({ product_id: 1, quantity: 1 }), line({ product_id: 2 })],
        }),
      ],
      dealCache: [
        cache({
          pipedrive_deal_id: 5001,
          line_item_count: 1,
          line_items: [line({ product_id: 1, quantity: 4 })],
          line_items_changed_at: "2026-08-02T14:00:00Z",
        }),
      ],
    });
    assert.equal(row.row_state, "line_items_drifted");
    // One quantity edit and one deleted line.
    assert.equal(row.line_item_drift_count, 2);
    assert.equal(row.deal_line_items_changed_at, "2026-08-02T14:00:00Z");
    // Slot 1 still offers the fix, which is to generate the next version.
    assert.equal(row.available_actions.task.kind, "generate_next_proposal");
  });

  it("beats a stale price, because a wrong document matters more than a stale-priced one", () => {
    const row = only({
      submissions: [sub({ id: "s1" })],
      quotes: [
        quote({
          submission_id: "s1",
          version: 1,
          generated_at: "2026-07-20T10:00:00Z",
          line_items: [line({ product_id: 1, quantity: 1 })],
        }),
      ],
      dealCache: [
        cache({ pipedrive_deal_id: 5001, line_items: [line({ product_id: 1, quantity: 7 })] }),
      ],
      latestPriceEffectiveDate: "2026-07-25",
    });
    assert.equal(row.needs_price_update, true);
    assert.equal(row.row_state, "line_items_drifted");
  });

  it("reports no drift against a deal the proposal was never built from", () => {
    // A relink can repoint a submission at a different deal (ADR 0093 step 3).
    // Diffing across that boundary would flag every line on the row.
    const row = only({
      submissions: [sub({ id: "s1", pipedrive_deal_id: "6002" })],
      quotes: [quote({ submission_id: "s1", version: 1, pipedrive_deal_id: 5001 })],
      dealCache: [
        cache({ pipedrive_deal_id: 6002, line_items: [line({ product_id: 99, quantity: 3 })] }),
      ],
    });
    assert.equal(row.line_item_drift_count, 0);
    assert.equal(row.row_state, "quote_current");
  });

  it("reports no drift when the deal has never been read", () => {
    const row = only({
      submissions: [sub({ id: "s1" })],
      quotes: [quote({ submission_id: "s1", version: 1 })],
      dealCache: [cache({ pipedrive_deal_id: 5001, line_items: null, read_at: null })],
    });
    assert.equal(row.line_item_drift_count, 0);
  });
});

describe("row state 5 — deal linked, zero line items", () => {
  it("refuses to offer generation and sends him to Pipedrive instead", () => {
    // Acceptance check 5: zero line items makes generation impossible from this
    // page. Generating early burns a version number and produces a wrong PDF.
    const row = only({
      submissions: [sub({ id: "s1" })],
      dealCache: [cache({ pipedrive_deal_id: 5001, line_item_count: 0, line_items: [] })],
    });
    assert.equal(row.row_state, "deal_zero_line_items");
    assert.equal(row.deal_line_item_count, 0);
    assert.equal(row.available_actions.task.kind, "add_line_items");
    assert.equal(row.available_actions.task.label, "Add line items ↗");
    assert.equal(
      row.available_actions.task.kind === "add_line_items" && row.available_actions.task.url,
      "https://app.pipedrive.com/deal/5001",
    );
  });

  it("does not claim zero when the count is merely unknown", () => {
    // A never-read deal must not be presented as empty. assemble.ts's own
    // empty_deal refusal is the backstop if it really is.
    const row = only({ submissions: [sub({ id: "s1" })], dealCache: [] });
    assert.equal(row.deal_line_item_count, null);
    assert.notEqual(row.row_state, "deal_zero_line_items");
    assert.equal(row.available_actions.task.kind, "generate_proposal");
  });
});

describe("row state 6 — no Pipedrive deal link", () => {
  it("cannot be quoted, and keeps the Pipedrive slot present but disabled", () => {
    const row = only({ submissions: [sub({ id: "s1", pipedrive_deal_id: null })] });
    assert.equal(row.row_state, "no_deal_link");
    assert.equal(row.deal_link_state, "missing");
    assert.equal(row.pipedrive_deal_id, null);
    assert.equal(row.pipedrive_deal_url, null);
    // The value cell has nothing to show: the page renders "Value unavailable".
    assert.equal(row.pipedrive_deal_value, null);
    assert.equal(row.available_actions.task.kind, "retry_pipedrive_link");
    assert.equal(row.available_actions.pipedrive.kind, "no_deal");
    assert.equal(row.available_actions.pipedrive.enabled, false);
    assert.equal(row.available_actions.pipedrive.label, "No deal to open");
  });

  it("does not raise a staleness chip — the red border already says why", () => {
    const row = only({ submissions: [sub({ id: "s1", pipedrive_deal_id: null })] });
    assert.equal(row.pipedrive_read_ok, true);
  });

  it("borrows the deal from an older submission rather than calling the project unlinked", () => {
    // A revision filed before its deal sync completed has no id of its own while
    // the project plainly has a deal.
    const row = only({
      submissions: [
        sub({ id: "s-old", pipedrive_deal_id: "5001", created_at: "2026-07-01T09:00:00Z" }),
        sub({
          id: "s-new",
          pipedrive_deal_id: null,
          parent_submission_id: "s-old",
          created_at: "2026-07-05T09:00:00Z",
        }),
      ],
      dealCache: [cache({ pipedrive_deal_id: 5001 })],
    });
    assert.equal(row.submission_id, "s-new");
    assert.equal(row.deal_link_state, "linked");
    assert.equal(row.pipedrive_deal_id, 5001);
  });
});

describe("row state 7 — the additive chips: superseded, and a failed Pipedrive read", () => {
  it("flags a starred row that was later revised as superseded", () => {
    const row = only({
      submissions: [
        sub({ id: "s-star", is_preferred: true, created_at: "2026-07-01T09:00:00Z" }),
        sub({ id: "s-rev", parent_submission_id: "s-star", created_at: "2026-07-09T09:00:00Z" }),
      ],
      dealCache: [cache({ pipedrive_deal_id: 5001 })],
    });
    // The star pins representative selection, so the representative here is the
    // superseded row — the only way this chip is reachable.
    assert.equal(row.submission_id, "s-star");
    assert.equal(row.is_superseded, true);
    assert.equal(row.parent_submission_id, null);
  });

  it("keeps the last known values when the most recent read failed", () => {
    // Acceptance check 9: never blank, never zero.
    const row = only({
      submissions: [sub({ id: "s1" })],
      dealCache: [
        cache({
          pipedrive_deal_id: 5001,
          deal_status: "open",
          deal_value: 6_545_821,
          line_item_count: 9,
          read_at: "2026-08-01T09:42:00Z",
          last_failed_at: "2026-08-03T09:42:00Z",
          last_error: "429 rate limited",
        }),
      ],
    });
    assert.equal(row.pipedrive_read_ok, false);
    assert.equal(row.pipedrive_deal_value, 6_545_821);
    assert.equal(row.pipedrive_deal_status, "open");
    assert.equal(row.deal_line_item_count, 9);
    // The stale marker's timestamp is the last SUCCESSFUL read, not the failure.
    assert.equal(row.pipedrive_status_as_of, "2026-08-01T09:42:00Z");
  });

  it("does not let a stale count of zero be mistaken for a fresh one", () => {
    // A stale zero still gates generation, which is the safe direction: the guard
    // errs toward Pipedrive rather than toward a wrong PDF.
    const row = only({
      submissions: [sub({ id: "s1" })],
      dealCache: [
        cache({
          pipedrive_deal_id: 5001,
          line_item_count: 0,
          line_items: [],
          read_at: "2026-08-01T09:42:00Z",
          last_failed_at: "2026-08-03T09:42:00Z",
        }),
      ],
    });
    assert.equal(row.available_actions.task.kind, "add_line_items");
    assert.equal(row.pipedrive_read_ok, false);
  });

  it("reads as fresh again once a later read succeeds", () => {
    const row = only({
      submissions: [sub({ id: "s1" })],
      dealCache: [
        cache({
          pipedrive_deal_id: 5001,
          read_at: "2026-08-03T10:00:00Z",
          last_failed_at: "2026-08-03T09:00:00Z",
          last_error: "429 rate limited",
        }),
      ],
    });
    assert.equal(row.pipedrive_read_ok, true);
  });

  it("co-occurs with any card state rather than becoming one", () => {
    const row = only({
      submissions: [sub({ id: "s1" })],
      quotes: [quote({ submission_id: "s1", version: 3 })],
      dealCache: [
        cache({
          pipedrive_deal_id: 5001,
          read_at: "2026-08-01T09:42:00Z",
          last_failed_at: "2026-08-03T09:42:00Z",
        }),
      ],
    });
    assert.equal(row.pipedrive_read_ok, false);
    assert.equal(row.row_state, "quote_current");
  });
});

describe("row state 8 — archived", () => {
  it("offers only restore, and nothing was deleted", () => {
    const row = only({
      submissions: [sub({ id: "s1" })],
      quotes: [quote({ submission_id: "s1", version: 3 })],
      dealCache: [cache({ pipedrive_deal_id: 5001 })],
      archives: [archive({ submission_id: "s1" })],
    });
    assert.equal(row.row_state, "archived");
    assert.equal(row.internal_archived_at, "2026-08-03T09:51:00Z");
    assert.equal(row.internal_archived_by, VIEWER);
    assert.equal(row.internal_archived_by_name, "Ivan Internal");
    assert.equal(row.available_actions.task.kind, "restore_from_archive");
    assert.equal(row.available_actions.task.label, "Restore to my queue");
    assert.equal(row.available_actions.archive.kind, "restore");
    assert.equal(row.available_actions.archive.label, "Undo");
    // Untouched: the proposal, its version and the deal link are all still there.
    assert.equal(row.current_quote_version, 3);
    assert.equal(row.pipedrive_deal_id, 5001);
    assert.equal(row.project_quote_version_count, 1);
  });

  it("is archivable while the deal is open — archiving is never blocked", () => {
    const row = only({
      submissions: [sub({ id: "s1", status: "open" })],
      dealCache: [cache({ pipedrive_deal_id: 5001, deal_status: "open" })],
      archives: [archive({ submission_id: "s1" })],
    });
    assert.equal(row.row_state, "archived");
    assert.equal(row.portal_status, "open");
    assert.equal(row.pipedrive_deal_status, "open");
  });

  it("outranks every other card state, including the unlinked red border", () => {
    const row = only({
      submissions: [sub({ id: "s1", pipedrive_deal_id: null })],
      archives: [archive({ submission_id: "s1" })],
    });
    assert.equal(row.row_state, "archived");
  });

  it("resurfaces the project when a genuinely new revision arrives", () => {
    // The archive stamps every submission in the bucket, so representative churn
    // keeps a project hidden; an unstamped NEW leaf brings it back.
    const rows = build({
      submissions: [
        sub({ id: "s-old", created_at: "2026-07-01T09:00:00Z" }),
        sub({ id: "s-new", parent_submission_id: "s-old", created_at: "2026-08-02T09:00:00Z" }),
      ],
      archives: [archive({ submission_id: "s-old" })],
      dealCache: [cache({ pipedrive_deal_id: 5001 })],
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].submission_id, "s-new");
    assert.equal(rows[0].internal_archived_at, null);
    assert.notEqual(rows[0].row_state, "archived");
  });
});

describe("row state 9 — no quote yet on a deal that has line items", () => {
  it("offers the first proposal without naming a version it is replacing", () => {
    const row = only({
      submissions: [sub({ id: "s1" })],
      dealCache: [cache({ pipedrive_deal_id: 5001, line_item_count: 3 })],
    });
    assert.equal(row.row_state, "no_quote_yet");
    assert.equal(row.current_quote_version, null);
    assert.equal(row.project_quote_version_count, 0);
    assert.equal(row.available_actions.task.kind, "generate_proposal");
    assert.equal(row.available_actions.task.label, "Make Project Proposal");
    assert.equal(
      row.available_actions.task.kind === "generate_proposal" &&
        row.available_actions.task.next_version,
      1,
    );
  });
});

// ===========================================================================
// Quoted vs Recommended — the distinction the spec says must never read the same
// ===========================================================================

describe("products line", () => {
  it("reads Quoted off the frozen snapshot, not off the live deal", () => {
    const row = only({
      submissions: [sub({ id: "s1" })],
      quotes: [
        quote({
          submission_id: "s1",
          version: 2,
          line_items: [
            line({ product_id: 1, code: "VX5-V800", quantity: 2 }),
            line({ product_id: 2, code: "SW10" }),
            line({ product_id: 3, code: "NIC-10G" }),
          ],
        }),
      ],
      // The deal has since been rewritten; the products line must still describe
      // the DOCUMENT he would send.
      dealCache: [
        cache({ pipedrive_deal_id: 5001, line_items: [line({ product_id: 77, code: null })] }),
      ],
    });
    assert.equal(row.products_source, "quoted");
    assert.equal(row.products_display, "2 × VX5-V800 · 1 × SW10 +1 more");
    assert.equal(row.row_state, "line_items_drifted");
  });

  it("reads Recommended off the calculator output when no proposal exists", () => {
    const row = only({
      submissions: [sub({ id: "s1", recommended_product_id: "VX5-V255", recommended_units: 3 })],
      dealCache: [cache({ pipedrive_deal_id: 5001 })],
    });
    assert.equal(row.products_source, "recommended");
    assert.equal(row.products_display, "3 × VX5-V255");
  });

  it("never falls back to the recommendation on a Quoted row", () => {
    // Showing a calculator recommendation on a Quoted row is how a wrong product
    // list reaches a customer, so an unreadable snapshot says so instead.
    const row = only({
      submissions: [sub({ id: "s1", recommended_product_id: "VX5-V255", recommended_units: 3 })],
      quotes: [quote({ submission_id: "s1", version: 1, line_items: null })],
      dealCache: [cache({ pipedrive_deal_id: 5001 })],
    });
    assert.equal(row.products_source, "quoted");
    assert.equal(row.products_display, "Quoted line items unavailable");
  });
});

// ===========================================================================
// Grouping — the forecast.ts behaviours this layer wraps and must not regress
// ===========================================================================

describe("grouping — on-behalf-of", () => {
  it("rolls an on-behalf row up to the target partner's company, not the rep's", () => {
    const row = only({
      submissions: [sub({ id: "s1", partner_id: VIEWER, on_behalf_of_partner_id: "p1" })],
      dealCache: [cache({ pipedrive_deal_id: 5001 })],
    });
    assert.equal(row.partner_company_name, "Riverside Security");
    assert.equal(row.partner_contact_name, "Ann Adams");
    // created_by is the internal rep who filed it, which drives the "Projects I
    // created" chip and is deliberately not the company.
    assert.equal(row.created_by_user_name, "Ivan Internal");
    assert.equal(row.created_by_is_internal, true);
  });

  it("names a free-typed on-behalf company with no contact behind it", () => {
    const row = only({
      submissions: [
        sub({ id: "s1", partner_id: VIEWER, on_behalf_of_company_name: "Harbor Systems" }),
      ],
      dealCache: [cache({ pipedrive_deal_id: 5001 })],
    });
    assert.equal(row.partner_company_name, "Harbor Systems");
    // Not the internal rep: they work somewhere else entirely.
    assert.equal(row.partner_contact_name, null);
  });

  it("merges two people at the same company into one project", () => {
    const rows = build({
      submissions: [sub({ id: "s1", partner_id: "p1" }), sub({ id: "s2", partner_id: "p1" })],
      dealCache: [cache({ pipedrive_deal_id: 5001 })],
    });
    assert.equal(rows.length, 1);
  });

  it("keeps different companies apart on the same project name", () => {
    const rows = build({
      submissions: [sub({ id: "s1", partner_id: "p1" }), sub({ id: "s2", partner_id: "p2" })],
      dealCache: [cache({ pipedrive_deal_id: 5001 })],
    });
    assert.equal(rows.length, 2);
  });
});

describe("grouping — revision lineage", () => {
  it("merges a renamed revision into its source project via parent_submission_id", () => {
    const rows = build({
      submissions: [
        sub({ id: "s1", project_name: "Riverside Campus", created_at: "2026-07-01T09:00:00Z" }),
        sub({
          id: "s2",
          project_name: "Riverside Campus Phase 2",
          parent_submission_id: "s1",
          created_at: "2026-07-10T09:00:00Z",
        }),
      ],
      dealCache: [cache({ pipedrive_deal_id: 5001 })],
    });
    assert.equal(rows.length, 1);
    // The leaf represents the project, and the project key follows its name.
    assert.equal(rows[0].submission_id, "s2");
    assert.equal(rows[0].project_key, "riverside campus phase 2");
    assert.equal(rows[0].parent_submission_id, "s1");
  });

  it("never lets a superseded row represent a project on clock skew alone", () => {
    const rows = build({
      submissions: [
        // The source claims a LATER created_at than the revision that replaced it.
        sub({ id: "s1", created_at: "2026-07-20T09:00:00Z" }),
        sub({ id: "s2", parent_submission_id: "s1", created_at: "2026-07-10T09:00:00Z" }),
      ],
      dealCache: [cache({ pipedrive_deal_id: 5001 })],
    });
    assert.equal(rows[0].submission_id, "s2");
  });

  it("counts proposals across the whole lineage, not just the representative's", () => {
    const row = only({
      submissions: [
        sub({ id: "s1", created_at: "2026-07-01T09:00:00Z" }),
        sub({ id: "s2", parent_submission_id: "s1", created_at: "2026-07-10T09:00:00Z" }),
      ],
      quotes: [
        quote({ submission_id: "s1", version: 1, generated_at: "2026-07-02T09:00:00Z" }),
        quote({ submission_id: "s1", version: 2, generated_at: "2026-07-03T09:00:00Z" }),
        quote({ submission_id: "s2", version: 1, generated_at: "2026-07-11T09:00:00Z" }),
      ],
      dealCache: [cache({ pipedrive_deal_id: 5001 })],
    });
    assert.equal(row.project_quote_version_count, 3);
  });
});

describe("current quote derivation", () => {
  it("picks the most recently GENERATED proposal across the project, not the highest version", () => {
    // Versions are numbered per submission (assemble.ts), so they are not
    // comparable across a project's lineage: sub A's v2 and sub B's v1 can both
    // exist and B's can be the newer document.
    const row = only({
      submissions: [
        sub({ id: "s1", created_at: "2026-07-01T09:00:00Z" }),
        sub({ id: "s2", parent_submission_id: "s1", created_at: "2026-07-10T09:00:00Z" }),
      ],
      quotes: [
        quote({ submission_id: "s1", version: 2, generated_at: "2026-07-03T09:00:00Z" }),
        quote({ submission_id: "s2", version: 1, generated_at: "2026-08-01T09:00:00Z" }),
      ],
      dealCache: [cache({ pipedrive_deal_id: 5001 })],
    });
    assert.equal(row.current_quote_version, 1);
    assert.equal(row.current_quote_generated_at, "2026-08-01T09:00:00Z");
    // The version reported is the quote row's own, so the row and the PDF agree.
    assert.equal(row.available_actions.task.kind, "download_proposal");
    assert.equal(
      row.available_actions.task.kind === "download_proposal" &&
        row.available_actions.task.proposal_submission_id,
      "s2",
    );
  });

  it("names the version generation will ACTUALLY create, even when it restarts", () => {
    // Known wrinkle, documented in ADR 0113: assemble.ts numbers per submission,
    // so a revision with no proposals of its own starts again at 1. The label
    // reports the truth rather than current + 1. Forced into the
    // generate_next_proposal branch via drift, since an ordinary current quote's
    // primary action is now the download rather than a new version.
    const row = only({
      submissions: [
        sub({ id: "s1", created_at: "2026-07-01T09:00:00Z" }),
        sub({ id: "s2", parent_submission_id: "s1", created_at: "2026-07-10T09:00:00Z" }),
      ],
      quotes: [
        quote({
          submission_id: "s1",
          version: 3,
          generated_at: "2026-08-01T09:00:00Z",
          line_items: [line({ product_id: 1, quantity: 1 })],
        }),
      ],
      dealCache: [
        cache({ pipedrive_deal_id: 5001, line_items: [line({ product_id: 1, quantity: 9 })] }),
      ],
    });
    assert.equal(row.submission_id, "s2");
    assert.equal(row.current_quote_version, 3);
    assert.equal(row.row_state, "line_items_drifted");
    assert.equal(row.available_actions.task.label, "New Project Proposal v1");
  });

  it("breaks a generated_at tie deterministically", () => {
    const at = "2026-08-01T09:00:00Z";
    const picked = pickCurrentQuote([
      quote({ submission_id: "s1", version: 1, generated_at: at }),
      quote({ submission_id: "s1", version: 2, generated_at: at }),
    ]);
    assert.equal(picked?.version, 2);
    assert.equal(pickCurrentQuote([]), null);
  });
});

// ===========================================================================
// Band B, Band C, and ordering
// ===========================================================================

describe("Band B — attention", () => {
  it("lists stale-priced quotes on open deals and projects with no deal link", () => {
    const result = buildProjectQueue({
      submissions: [
        sub({ id: "s-stale", project_name: "Stale One" }),
        sub({ id: "s-unlinked", project_name: "Unlinked One", pipedrive_deal_id: null }),
        sub({ id: "s-fine", project_name: "Fine One" }),
      ],
      partners: PARTNERS,
      quotes: [
        quote({ submission_id: "s-stale", version: 1, generated_at: "2026-07-20T10:00:00Z" }),
        quote({ submission_id: "s-fine", version: 1 }),
      ],
      archives: [],
      dealCache: [cache({ pipedrive_deal_id: 5001 })],
      viewerId: VIEWER,
      now: NOW,
      latestPriceEffectiveDate: "2026-07-25",
    });
    assert.deepEqual(result.attention.needs_price_update_submission_ids, ["s-stale"]);
    assert.deepEqual(result.attention.missing_deal_link_submission_ids, ["s-unlinked"]);
  });

  it("excludes archived projects, so 'Show these 4' cannot reveal three", () => {
    const result = buildProjectQueue({
      submissions: [
        sub({ id: "s-stale", project_name: "Stale One" }),
        sub({ id: "s-unlinked", project_name: "Unlinked One", pipedrive_deal_id: null }),
      ],
      partners: PARTNERS,
      quotes: [quote({ submission_id: "s-stale", version: 1, generated_at: "2026-07-20T10:00:00Z" })],
      archives: [archive({ submission_id: "s-stale" }), archive({ submission_id: "s-unlinked" })],
      dealCache: [cache({ pipedrive_deal_id: 5001 })],
      viewerId: VIEWER,
      now: NOW,
      latestPriceEffectiveDate: "2026-07-25",
    });
    assert.deepEqual(result.attention.needs_price_update_submission_ids, []);
    assert.deepEqual(result.attention.missing_deal_link_submission_ids, []);
    // The rows are still returned: the page needs them for the archived chip and
    // the "also matches" strip.
    assert.equal(result.rows.length, 2);
  });
});

describe("Band C — the three numbers", () => {
  it("sums cached Pipedrive value across open deals and dates it to the oldest read", () => {
    const result = buildProjectQueue({
      submissions: [
        sub({ id: "s1", project_name: "One", pipedrive_deal_id: "5001", status: "open" }),
        sub({ id: "s2", project_name: "Two", pipedrive_deal_id: "5002", status: "open" }),
        sub({ id: "s3", project_name: "Three", pipedrive_deal_id: "5003", status: "won" }),
      ],
      partners: PARTNERS,
      quotes: [],
      archives: [],
      dealCache: [
        cache({ pipedrive_deal_id: 5001, deal_value: 200_000, read_at: "2026-08-03T09:42:00Z" }),
        cache({ pipedrive_deal_id: 5002, deal_value: 300_000, read_at: "2026-08-02T08:00:00Z" }),
        // Won in Pipedrive: contributes to neither the sum nor its timestamp.
        cache({
          pipedrive_deal_id: 5003,
          deal_status: "won",
          deal_value: 900_000,
          read_at: "2026-07-01T08:00:00Z",
        }),
      ],
      viewerId: VIEWER,
      now: NOW,
      latestPriceEffectiveDate: null,
    });
    assert.equal(result.totals.open_pipeline_usd, 500_000);
    assert.equal(result.totals.open_pipeline_deal_count, 2);
    assert.equal(result.totals.open_pipeline_as_of, "2026-08-02T08:00:00.000Z");
    assert.equal(result.totals.open_pipeline_stale_deal_count, 0);
    // Portal status, which is what the "Open" chip filters on. ADR 0081.
    assert.equal(result.totals.open_project_count, 2);
  });

  it("counts how many contributing deals are on a stale read", () => {
    const result = buildProjectQueue({
      submissions: [sub({ id: "s1" })],
      partners: PARTNERS,
      quotes: [],
      archives: [],
      dealCache: [
        cache({
          pipedrive_deal_id: 5001,
          deal_value: 200_000,
          read_at: "2026-08-01T09:42:00Z",
          last_failed_at: "2026-08-03T09:42:00Z",
        }),
      ],
      viewerId: VIEWER,
      now: NOW,
      latestPriceEffectiveDate: null,
    });
    // The last known value still counts toward the sum — dropping it would zero
    // the pipeline figure on a Pipedrive outage.
    assert.equal(result.totals.open_pipeline_usd, 200_000);
    assert.equal(result.totals.open_pipeline_stale_deal_count, 1);
  });

  it("counts proposals inside the 30-day window, excluding archived projects", () => {
    const result = buildProjectQueue({
      submissions: [
        sub({ id: "s1", project_name: "One" }),
        sub({ id: "s2", project_name: "Two" }),
      ],
      partners: PARTNERS,
      quotes: [
        quote({ submission_id: "s1", version: 1, generated_at: "2026-08-01T09:00:00Z" }),
        quote({ submission_id: "s1", version: 2, generated_at: "2026-08-02T09:00:00Z" }),
        // Older than 30 days.
        quote({ submission_id: "s1", version: 3, generated_at: "2026-06-01T09:00:00Z" }),
        // On an archived project.
        quote({ submission_id: "s2", version: 1, generated_at: "2026-08-02T09:00:00Z" }),
      ],
      archives: [archive({ submission_id: "s2" })],
      dealCache: [cache({ pipedrive_deal_id: 5001 })],
      viewerId: VIEWER,
      now: NOW,
      latestPriceEffectiveDate: null,
    });
    assert.equal(result.totals.quotes_last_30_days, 2);
  });

  it("has no numbers to report on an empty queue rather than failing", () => {
    const result = buildProjectQueue({
      submissions: [],
      partners: PARTNERS,
      quotes: [],
      archives: [],
      dealCache: [],
      viewerId: VIEWER,
      now: NOW,
      latestPriceEffectiveDate: null,
    });
    assert.deepEqual(result.rows, []);
    assert.equal(result.totals.open_pipeline_usd, 0);
    assert.equal(result.totals.open_pipeline_as_of, null);
    assert.equal(result.totals.open_project_count, 0);
  });
});

describe("ordering", () => {
  it("sorts by most recent activity, which includes a proposal being generated", () => {
    const rows = build({
      submissions: [
        sub({ id: "s-old", project_name: "Old Project", created_at: "2026-07-01T09:00:00Z" }),
        sub({ id: "s-new", project_name: "New Project", created_at: "2026-07-15T09:00:00Z" }),
      ],
      // A proposal on the older project makes it the more recently active one.
      quotes: [quote({ submission_id: "s-old", version: 1, generated_at: "2026-08-02T09:00:00Z" })],
      dealCache: [cache({ pipedrive_deal_id: 5001 })],
    });
    assert.deepEqual(
      rows.map((r) => r.project_name),
      ["Old Project", "New Project"],
    );
  });
});

// ===========================================================================
// The two visible slots are always present, and the status pill is read-only
// ===========================================================================

describe("the action slots", () => {
  it("fills task, pipedrive and archive on every row, whatever its state", () => {
    const inputs: Array<Partial<BuildProjectQueueInput>> = [
      { submissions: [sub({ id: "s1", pipedrive_deal_id: null })] },
      { submissions: [sub({ id: "s1" })], dealCache: [cache({ pipedrive_deal_id: 5001 })] },
      {
        submissions: [sub({ id: "s1" })],
        dealCache: [cache({ pipedrive_deal_id: 5001, line_item_count: 0, line_items: [] })],
      },
      {
        submissions: [sub({ id: "s1" })],
        quotes: [quote({ submission_id: "s1", version: 3 })],
        dealCache: [cache({ pipedrive_deal_id: 5001 })],
      },
      {
        submissions: [sub({ id: "s1" })],
        archives: [archive({ submission_id: "s1" })],
      },
    ];
    for (const input of inputs) {
      const actions = only(input).available_actions;
      assert.ok(actions.task.label.length > 0);
      assert.ok(actions.pipedrive.label.length > 0);
      assert.ok(actions.archive.label.length > 0);
    }
  });

  it("keeps the status pill read-only for internal users", () => {
    const row = only({
      submissions: [sub({ id: "s1", status: "won" })],
      dealCache: [cache({ pipedrive_deal_id: 5001 })],
    });
    assert.equal(row.portal_status, "won");
    assert.equal(row.portal_status_editable, false);
  });

  it("models the portal status and the Pipedrive status separately", () => {
    // ADR 0081: submissions.status is portal-only and never synced, so the two
    // can legitimately disagree and both are shown.
    const row = only({
      submissions: [sub({ id: "s1", status: "open" })],
      dealCache: [cache({ pipedrive_deal_id: 5001, deal_status: "won" })],
    });
    assert.equal(row.portal_status, "open");
    assert.equal(row.pipedrive_deal_status, "won");
  });

  it("exposes the exact action copy as one testable table", () => {
    assert.equal(ACTION_LABELS.generate_first, "Make Project Proposal");
    assert.equal(ACTION_LABELS.generate_next(4), "New Project Proposal v4");
    assert.equal(ACTION_LABELS.update_pricing, "Update Project Pricing");
    assert.equal(ACTION_LABELS.download_generated(4), "Download Proposal v4");
  });
});

describe("isCacheReadOk", () => {
  it("is false with no row and with a row that has never succeeded", () => {
    assert.equal(isCacheReadOk(null), false);
    assert.equal(isCacheReadOk(cache({ pipedrive_deal_id: 1, read_at: null })), false);
  });

  it("compares the two timestamps rather than storing a flag", () => {
    assert.equal(
      isCacheReadOk(cache({ pipedrive_deal_id: 1, read_at: "2026-08-03T10:00:00Z", last_failed_at: null })),
      true,
    );
    assert.equal(
      isCacheReadOk(
        cache({
          pipedrive_deal_id: 1,
          read_at: "2026-08-03T10:00:00Z",
          last_failed_at: "2026-08-03T11:00:00Z",
        }),
      ),
      false,
    );
  });
});
