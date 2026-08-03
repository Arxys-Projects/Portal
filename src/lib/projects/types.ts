// The `/projects` data contract — the internal sales surface's row shape.
//
// This module is the boundary between the query/service layer (this phase) and
// the page (a later phase). Every field the design spec's `## Data contract`
// section lists appears here with that exact name, plus the small set of
// deliberate additions called out below. The page renders these fields and
// derives nothing further; anything subtle — "which quote is current", expiry,
// line-item drift, archive semantics, which action each slot offers — is
// computed here so there is one place to test it and one place to get it wrong.
//
// No framework, Supabase or server-only imports: the derivation is pure and runs
// under plain Node in rows.test.ts. The I/O lives in queue.ts.
//
// ---------------------------------------------------------------------------
// Additions to the spec's field list, and why each one is here
// ---------------------------------------------------------------------------
//
//   row_state                — the spec's "Row states to implement" table is a
//                              set of mutually exclusive CARD treatments chosen
//                              by exactly the logic this layer owns. Deriving it
//                              in the page would put the precedence rules (does
//                              archived beat expired? does drift beat expiry?) in
//                              JSX where they cannot be unit-tested.
//   available_actions        — required by the brief; the spec's own contract
//                              lists it as "computed server side".
//   partner_contact_name     — the By-partner group header renders
//                              "0 projects · 0 contacts", which needs a contact
//                              per row to count distinctly.
//   internal_archived_by_name — the archived-row strip reads "Archived today at
//                              9:51 AM by you"; the uuid alone cannot render the
//                              not-you case.
//   deal_line_items_changed_at,
//   line_item_drift_count    — the spec asks for these directly, in the sentence
//                              after the field list ("Line-item drift detection
//                              needs one addition").
//   portal_list_price_usd    — never rendered on a row. The By-partner group
//                              totals are pinned by their own footnote to
//                              "open-deal list prices (ADR 0081)", which is the
//                              portal figure, not the Pipedrive one.
//
// Nothing else was added. In particular there is no camera count, storage,
// retention, bandwidth, created-by-column, version history or revision count:
// the spec's "Never on the row" list is enforced by this type's absence of them.

import type { PartnerRow, SubmissionRow } from "@/lib/pipeline/forecast";

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

// The portal-only lifecycle status (ADR 0081), read straight off
// submissions.status. Never synced to Pipedrive, and deliberately NOT the same
// thing as PipedriveDealStatus below — the two can disagree and the row shows
// both.
export type ProjectPortalStatus = "open" | "won" | "lost";

// Pipedrive's own deal status, from the cached live read. 'deleted' is what
// Pipedrive returns for a deal in the bin.
export type PipedriveDealStatus = "open" | "won" | "lost" | "deleted";

export type DealLinkState = "linked" | "missing";

// "Quoted" = the frozen project_quotes snapshot. "Recommended" = calculator
// output with no proposal generated yet. The spec is emphatic that these must
// never read the same, because confusing them puts a wrong product list in
// front of a customer. products_source is "quoted" exactly when the project has
// a current Project Proposal.
export type ProductsSource = "quoted" | "recommended";

// The card treatment for a row. Mutually exclusive by construction, resolved in
// the documented precedence order in rows.ts.
//
// The spec's state table lists nine entries; three of them are not card states
// and so are not here:
//   * "Superseded" and "Pipedrive read failed" are additive CHIPS in a separate
//     tray and can co-occur with any state — they are `is_superseded` and
//     `pipedrive_read_ok` below.
//   * "Keyboard focused" is a focus ring the page owns.
// The remaining six expand to eight, because "Deal linked, zero line items" and
// the ordinary "no proposal yet on a deal that does have line items" are
// different rows with different primary actions.
export type ProjectRowState =
  // Dashed border, desaturated type, grey strip, Undo on the row. Only rendered
  // when the "Show archived" chip is on.
  | "archived"
  // 2px red card border. No quote can be generated; the Pipedrive slot is
  // disabled and the value cell reads "Value unavailable".
  | "no_deal_link"
  // Green top strip: "✓ Project Proposal v4 generated today at 9:47 AM by you".
  // Persistent across reloads (acceptance check 4), never a toast.
  | "proposal_just_generated"
  // Amber top strip: the deal's line items no longer match the current
  // proposal's frozen snapshot.
  | "line_items_drifted"
  // 2px amber card border, amber dot: the current proposal was generated
  // before the portal's most recent price update, on a deal still open.
  | "quote_needs_price_update"
  // Green dot: current proposal, inside its validity window.
  | "quote_current"
  // Grey dot, "No quote yet" / "Deal has 0 line items". The primary action is
  // "Add line items ↗", which is the guard that stops a wrong PDF being made.
  | "deal_zero_line_items"
  // Grey dot, "No quote yet". Deal is linked and has (or may have) line items.
  | "no_quote_yet";

// ---------------------------------------------------------------------------
// The three action slots (plus archive)
// ---------------------------------------------------------------------------
//
// Every action carries its own `label`, composed here rather than in the page.
// The spec's rule is that "Every action label names the specific thing that will
// happen, including the version number" — a version number is data, so the only
// way to guarantee the label and the version agree is to build them together and
// test them together. The page switches on `kind` for the visual variant (filled
// / outlined / split / disabled) and prints `label` verbatim.

export type TaskAction =
  // Unlinked row. Filled navy. Rebuilds the deal from the stored submission
  // (ADR 0093 step 3, src/lib/pipedrive/relink.ts).
  | { kind: "retry_pipedrive_link"; label: string }
  // Archived row. Outlined — the only action an archived row offers.
  | { kind: "restore_from_archive"; label: string }
  // Deal linked with a KNOWN zero line items. Outlined navy, opens Pipedrive,
  // does NOT generate. This guard is the point: generating early burns a version
  // number and produces a wrong PDF.
  | { kind: "add_line_items"; label: string; url: string }
  // Line items present, no proposal yet. Filled navy.
  | { kind: "generate_proposal"; label: string; next_version: number }
  // A proposal exists. Filled navy, naming the version it will create.
  | { kind: "generate_next_proposal"; label: string; next_version: number }
  // A proposal was generated today by the viewer: slot 1 IS the download.
  // Filled navy split-button.
  | {
      kind: "download_proposal";
      label: string;
      version: number;
      // The submission that owns the proposal, which is not necessarily the row's
      // submission_id — see `current_quote_version` below.
      proposal_submission_id: string;
    };

export type PipedriveAction =
  | { kind: "open_deal"; label: string; url: string; enabled: true }
  // Present but disabled on an unlinked row: the slot never disappears, because
  // a slot that moves costs more than a slot that repeats.
  | { kind: "no_deal"; label: string; url: null; enabled: false };

export type ArchiveAction =
  | { kind: "archive"; label: string }
  // The `Undo` on an archived row's grey strip.
  | { kind: "restore"; label: string };

export type AvailableActions = {
  task: TaskAction;
  pipedrive: PipedriveAction;
  archive: ArchiveAction;
};

// ---------------------------------------------------------------------------
// A normalised deal line, used on both sides of the drift comparison
// ---------------------------------------------------------------------------

// The comparison basis for line-item drift. Produced from a live/cached
// Pipedrive read on one side and from the frozen
// project_quotes.snapshot.commercial.lineItems on the other, so the two are
// diffable field-for-field.
//
// Deliberately a reduction, not the raw payload: order_nr, discount shape and
// currency are excluded because a re-ordered or re-labelled discount is not a
// change to what the customer is being quoted, and including them would fire
// drift on noise. The authoritative frozen record of a quote's contents remains
// project_quotes.snapshot; this is only ever a fingerprint.
export type DealLineFingerprint = {
  product_id: number;
  code: string | null;
  name: string | null;
  quantity: number | null;
  unit_price: number | null;
  line_amount: number | null;
};

// ---------------------------------------------------------------------------
// The row
// ---------------------------------------------------------------------------

export type ProjectQueueRow = {
  // The project's REPRESENTATIVE submission (groupIntoDeals picks it: the
  // starred row if any, else the newest lineage leaf). A /projects row is a
  // project, and a project has no row of its own anywhere — it is a bucket of
  // submissions keyed on (company, project name) and merged by
  // parent_submission_id. This is the id every per-row action targets.
  submission_id: string;
  project_name: string | null;
  partner_company_name: string;
  // The contact on the representative submission, on-behalf-of aware. Display
  // and the By-partner header's contact count only; never a grouping key.
  partner_contact_name: string | null;

  // created_by drives the "Projects I created" filter chip, not a column.
  created_by_user_name: string | null;
  created_by_is_internal: boolean;
  created_at: string;

  portal_status: ProjectPortalStatus;
  // Always false on this page: the pill is read-only for internal users. Typed
  // as the literal so the page cannot accidentally render an editable control.
  portal_status_editable: false;

  // Internal only, never visible to partners — enforced by RLS on
  // submission_internal_archives, not by omitting it from a select (ADR 0112).
  internal_archived_at: string | null;
  internal_archived_by: string | null;
  internal_archived_by_name: string | null;

  pipedrive_deal_id: number | null;
  pipedrive_deal_url: string | null;
  deal_link_state: DealLinkState;

  // Last known values from the cached Pipedrive read (ADR 0113). All null when
  // the deal has never been read successfully, or when there is no deal.
  pipedrive_deal_status: PipedriveDealStatus | null;
  // The timestamp of the read these values came from, rendered to the user as
  // "Read today at 9:42 AM" / "Read 00 Mon at 9:42 AM".
  pipedrive_status_as_of: string | null;
  // False means: a read was attempted more recently than the last successful
  // one, so the values above are stale and the row must show the
  // "Pipedrive unreachable · read 00 Mon" chip alongside them — never blank
  // them, never zero them (acceptance check 9).
  //
  // True on an UNLINKED row: no read was possible and none failed. The absence
  // of a deal is carried by deal_link_state / row_state, which is what the spec
  // renders (a red border), not by a staleness chip.
  pipedrive_read_ok: boolean;
  // The deal's list price, display only, never recomputed. This is the row's
  // value cell — which is why an unlinked row reads "Value unavailable" rather
  // than falling back to the portal figure below.
  pipedrive_deal_value: number | null;
  // The PORTAL's own list price (submissions.total_list_price_usd), which is a
  // different number from the Pipedrive value above and is never rendered on the
  // row. It exists solely for the By-partner group totals, whose footnote pins
  // them to "the straight sum of open-deal list prices (ADR 0081)" — the
  // semantics the Partner Pipeline page this view replaces already had.
  portal_list_price_usd: number | null;
  // Gates the primary action. null = never successfully read; the page must not
  // present that as zero. A KNOWN zero is what triggers the generate guard.
  deal_line_item_count: number | null;

  // One truncated line that counts what it hid ("2 × V800 · 1 × SW10 +3 more").
  // Never a bare ellipsis, never blank.
  products_display: string;
  products_source: ProductsSource;

  // Project-scoped: the most recently generated proposal across EVERY submission
  // in this project's lineage, not just the representative's. The version
  // reported is that quote row's own project_quotes.version, so this number
  // always matches the version printed inside the PDF.
  //
  // Caveat worth knowing (ADR 0113): assemble.ts numbers versions per
  // submission, so on a project whose newest revision has no proposals yet, the
  // next version generated will restart at 1 while this still reads 3. The
  // generate label reports what will ACTUALLY be created rather than
  // current + 1, so it is never a lie — see next_version on TaskAction.
  current_quote_version: number | null;
  current_quote_generated_at: string | null;
  // True when the current proposal was generated before the portal's most
  // recent price update (max effective_date across `products`) AND the last
  // known Pipedrive deal status is open. A stale-priced proposal on a won or
  // lost deal is not something to chase, matching the same rule the old
  // date-based expiry used.
  needs_price_update: boolean;
  // Total proposals across the project's whole lineage.
  project_quote_version_count: number;

  // The representative submission was revised by a later one. Normally false,
  // because the representative is the lineage leaf; it goes true when a starred
  // (is_preferred) row was subsequently revised. Renders as the dashed grey
  // "Superseded by a newer submission" chip.
  is_superseded: boolean;

  // trim(lower(project_name)), derived in code by forecast.ts — not a column,
  // and deliberately not becoming one.
  project_key: string;
  parent_submission_id: string | null;

  // Drift. `deal_line_items_changed_at` is when WE first observed the deal's
  // lines differ from the previously cached fingerprint, which is the only
  // reliable signal available (ADR 0113 explains why Pipedrive cannot supply the
  // real one). `line_item_drift_count` is the number of lines that differ
  // between the deal as last read and the current proposal's frozen snapshot —
  // that is the authoritative "v2 no longer matches the deal" number, and it is
  // 0 whenever there is no current proposal or no cached read to compare.
  deal_line_items_changed_at: string | null;
  line_item_drift_count: number;

  row_state: ProjectRowState;
  available_actions: AvailableActions;
};

// ---------------------------------------------------------------------------
// Band B (attention) and Band C (the three numbers)
// ---------------------------------------------------------------------------

// Band B renders only when it has contents and has no empty state — it is
// absent, not empty (acceptance check 2), so the page checks these arrays'
// lengths. Both exclude archived projects: an archived row is out of the queue,
// so it must not drive a banner that says "Show these 4 →" and then shows three.
export type ProjectAttention = {
  // Rows whose current proposal predates the last price update, on a still-open deal.
  needs_price_update_submission_ids: string[];
  // Rows with no Pipedrive deal link, which therefore cannot be quoted.
  missing_deal_link_submission_ids: string[];
};

export type ProjectQueueTotals = {
  // Sum of the cached Pipedrive deal value across OPEN linked deals — read from
  // Pipedrive, display only, no cents. This is not the same figure as the
  // By-partner view's open-pipeline totals, which are the straight sum of portal
  // list prices per ADR 0081; the two are different sources and the page labels
  // them differently.
  open_pipeline_usd: number;
  // The OLDEST successful read among the deals contributing to the sum, so the
  // figure is never presented as fresher than its stalest input. Null when no
  // contributing deal has ever been read.
  open_pipeline_as_of: string | null;
  open_pipeline_deal_count: number;
  // How many contributing deals are on a stale read. Lets the page qualify the
  // sum honestly instead of implying every input is current.
  open_pipeline_stale_deal_count: number;
  // Projects whose PORTAL status is open (the "Open" filter chip's population).
  open_project_count: number;
  // Proposals generated in the last 30 days, counted across quote rows.
  quotes_last_30_days: number;
};

export type ProjectQueueResult = {
  // Sorted most-recently-active first: the newest of (any submission's
  // created_at, the current proposal's generated_at). The spec's default sort is
  // "most recently updated", and `submissions` has no updated_at column, so
  // activity is derived. ARCHIVED ROWS ARE INCLUDED — the page filters them out
  // by default via the "Show archived" chip, and needs them present to render
  // the "1 archived project also matches" strip.
  rows: ProjectQueueRow[];
  attention: ProjectAttention;
  totals: ProjectQueueTotals;
};

// ---------------------------------------------------------------------------
// Builder input — the raw rows the pure derivation consumes
// ---------------------------------------------------------------------------

// A submission as /projects needs it: forecast.ts's grouping shape plus the two
// columns the Recommended products line is built from.
export type QueueSubmissionRow = SubmissionRow & {
  // SKU string on modern rows; a UUID on pre-Step-3+4 rows whose FK target was
  // dropped (see the isUuidShaped checks elsewhere in the repo).
  recommended_product_id: string | null;
  recommended_units: number;
};

// A partner as /projects needs it: forecast.ts's grouping shape plus the
// internal flag that drives created_by_is_internal and the internal strip.
export type QueuePartnerRow = PartnerRow & { is_internal: boolean };

// Proposal metadata for one project_quotes row.
export type QueueQuoteRow = {
  submission_id: string;
  version: number;
  // The deal this proposal was snapshotted from. Drift is only meaningful when
  // it matches the deal the project is linked to NOW: a relink can repoint a
  // submission at a different deal (ADR 0093 step 3), and diffing a proposal
  // against a deal it was never built from would report every line as drifted.
  pipedrive_deal_id: number;
  generated_at: string;
  generated_by: string;
  // Normalised fingerprint of snapshot.commercial.lineItems. Loaded ONLY for the
  // quote that is current for its project — drift is only ever measured against
  // the current version, and reading every snapshot to fill this in would pull
  // the full jsonb for the entire quote history.
  line_items: DealLineFingerprint[] | null;
};

export type QueueArchiveRow = {
  submission_id: string;
  archived_at: string;
  archived_by: string;
};

// One row of pipedrive_deal_cache (ADR 0113).
export type QueueDealCacheRow = {
  pipedrive_deal_id: number;
  deal_status: PipedriveDealStatus | null;
  deal_value: number | null;
  currency: string | null;
  line_item_count: number | null;
  line_items: DealLineFingerprint[] | null;
  deal_update_time: string | null;
  line_items_changed_at: string | null;
  // Last SUCCESSFUL read.
  read_at: string | null;
  last_failed_at: string | null;
  last_error: string | null;
};

export type BuildProjectQueueInput = {
  submissions: QueueSubmissionRow[];
  partners: QueuePartnerRow[];
  quotes: QueueQuoteRow[];
  archives: QueueArchiveRow[];
  dealCache: QueueDealCacheRow[];
  // The signed-in internal user. Drives "by you" attribution and the
  // "proposal just generated" state, which is deliberately scoped to the person
  // who generated it.
  viewerId: string;
  // Injected so every derived age and "today" is testable. Callers pass new Date().
  now: Date;
  // max(effective_date) across `current_products` — "when pricing was last
  // updated" as one global date, since a portal price update
  // (scripts/push-prices.ts) stamps every changed SKU in one run with the same
  // effective_date. Null when the products table has never been read/seeded.
  latestPriceEffectiveDate: string | null;
};
