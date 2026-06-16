import type { DealQuote, QuoteError } from "@/lib/pipedrive/quote";
import type { SubmissionPdfGroup, SubmissionPdfServerSpec } from "@/lib/pdf/types";

// ===========================================================================
// Project Quote snapshot shape (Phase 10 Step 5a).
//
// The frozen, self-contained record a Project Quote re-renders from. Step 5b
// renders the four-page document from this shape ALONE: it never re-pulls the
// deal, re-reads the submission, or re-resolves the catalog or terms.
// Everything the document needs is frozen here at generation, so an old quote
// reproduces deterministically even after the deal, the catalog, or the T&Cs
// change. Completeness of this shape is the integrity premise of the feature.
//
// Binding rules encoded here (locked 2026-06-15; see ADR 0059 / 0060 / 0061):
//   - Prices flow Pipedrive to portal and are stored RAW. No derived price
//     (for example partner-price-each = lineAmount / quantity) is ever stored;
//     5b derives display values from the frozen raw data at render time.
//   - Resolved DISPLAY values are frozen, never lookup-table indices, so a
//     later table reorder cannot corrupt an old quote (mirrors groups_payload).
//   - "Current" is derived (max version per submission), never a stored flag.
// ===========================================================================

// Schema version of the snapshot envelope itself (not the per-submission quote
// version). Bump when the frozen shape changes in a way 5b's renderer must
// branch on, the way INPUT_STATE_VERSION guards the submission input shape.
// Existing rows keep their stored value; the renderer reads it to pick a path.
export const PROJECT_QUOTE_SNAPSHOT_VERSION = 1;

// ---------------------------------------------------------------------------
// Part 2 — SIZING (resolved from the submission)
// ---------------------------------------------------------------------------

// One camera-schedule row. The System Estimate's SubmissionPdfGroup fields
// (page-1 parity) PLUS the Phase 10 camera-model fields the reworked schedule
// shows. The current System Estimate view model does not yet carry the Phase 10
// fields (that convergence is part of 5b's PDF rework), so they are added here,
// frozen from groups_payload. cameraVendor / cameraModel null = the
// manual-entry (no-model) marker; `cameras` is the resolved stream count for
// the row (units x sensorsPerCamera as banked, never recomputed).
export type ProjectQuoteCameraRow = SubmissionPdfGroup & {
  cameraVendor: string | null;
  cameraModel: string | null;
  units: number;
  sensorsPerCamera: number;
  cameraModelModified: boolean;
};

// Resolved primary-server hardware spec, reused verbatim from the System
// Estimate view model so page 1 renders the same hero / spec block.
export type ProjectQuoteServerSpec = SubmissionPdfServerSpec;

export type ProjectQuoteSizing = {
  // Project parameters block.
  projectName: string | null;
  // The VMS selection, frozen as the resolved label. The submission stores a
  // single VMS name (for example "Milestone"); there is no separate "edition"
  // field on the submission today (see the Step 5a report flag).
  vms: string | null;
  retentionDays: number;
  // Aggregate totals frozen off the submission row (consistent with what was
  // emailed and saved), not re-summed from the rows at render.
  totals: {
    cameras: number;
    bandwidthMbps: number;
    storageGb: number;
  };
  storageTb: number;
  bandwidthMbps: number;
  // Camera schedule, one row per group: resolved labels plus Phase 10 fields.
  cameraSchedule: ProjectQuoteCameraRow[];
  // Recommended primary server summary (drives the capacity bars and hero).
  recommendation: {
    units: number;
    modelCode: string;
    productDescription: string;
    coveredCameras: number;
    coveredStorageTb: number;
    warnings: string[];
  };
  // Resolved hardware spec for the recommended server, or null for a legacy
  // submission whose recommended_product_id no longer resolves.
  serverSpec: ProjectQuoteServerSpec | null;
  // Resolved /public hero-image path for the recommended server's family (for
  // example "/price-book/v700-v800-hero.png"); null when no family or hero
  // matches. The PATH is frozen, not the PNG bytes: the asset is a
  // version-controlled repo file, not external mutating state, so freezing
  // bytes would bloat the row for no integrity gain (ADR 0060 scope). 5b
  // re-loads the bytes from this path at render.
  primaryServerHeroImagePath: string | null;
  // Reseller identity from the partners table, frozen for the document's
  // "prepared by" / partner block. This is the channel partner who owns the
  // submission, NOT the deal's end customer (that is on
  // commercial.organization / commercial.person). No partner email is frozen:
  // the System Estimate sources its partner email from the live auth session,
  // which here is the internal generator, not the partner; the contactable
  // address is commercial.person.email.
  partner: {
    companyName: string;
    contactName: string;
  };
};

// ---------------------------------------------------------------------------
// Part 3 — SHOWCASE (page 2)
// ---------------------------------------------------------------------------

// Spec highlights for a showcase card, resolved from product_specs. Every field
// is nullable: the QuickCompare columns are nullable (Phase 6 migration), and a
// SKU with a catalog (products) row but no product_specs row (for example an SW
// workstation not yet in product_specs) yields a card with null highlights.
export type ProjectQuoteShowcaseSpecHighlights = {
  formFactor: string | null;
  rackUnits: string | null;
  cpuModelFull: string | null;
  ramSpec: string | null;
  driveBays: number | null;
  storageRawTb: number | null;
  maxCameras: number | null;
  maxBandwidthMbps: number | null;
  osEdition: string | null;
  raidLevelDisplay: string | null;
  hddCount: number | null;
};

// One showcase product. Built ONLY from deal line items whose product group
// resolves to a price-book family (all V-series servers and SW workstations)
// AND that have a catalog (products) record. Everything else (add-on cards,
// NICs, transceivers, warranties, [MKT] custom lines, SKUs with no catalog
// record) is excluded and remains on the commercial line-item table (part 1).
export type ProjectQuoteShowcaseItem = {
  sku: string;
  productName: string;
  productGroup: string; // for example "V800", "SW10"
  msrp: number | null;
  // Resolved /public family hero-image path (frozen path, not bytes, as above).
  heroImagePath: string | null;
  // null when no product_specs row exists for this SKU (catalog row only).
  specHighlights: ProjectQuoteShowcaseSpecHighlights | null;
};

// ---------------------------------------------------------------------------
// Part 4 — TERMS
// ---------------------------------------------------------------------------

// The in-force T&Cs, frozen in full. `version` is also mirrored to a queryable
// column for auditing which terms went out; `text` is the self-contained legal
// copy; `sha256` is the integrity / dedupe stamp of `text`.
export type ProjectQuoteTerms = {
  version: string;
  text: string;
  sha256: string;
};

// ---------------------------------------------------------------------------
// Part 5 — GENERATION META
// ---------------------------------------------------------------------------

export type ProjectQuoteGeneration = {
  // Monotonic per submission (max(version)+1 at generation). Drives the unique
  // (submission_id, version) constraint and the derived-"current" read.
  version: number;
  // ISO-8601 generation timestamp. Expiry is computed at render as this date
  // plus validityDays; no "expired" flag is stored.
  generatedAt: string;
  // The validity window (days) in force at generation, frozen so shortening the
  // configurable constant later cannot retroactively change this quote.
  validityDays: number;
  // The internal user who generated the quote (partners.id = auth uid).
  generatedByUserId: string;
  // The submission and deal this snapshot was generated from.
  submissionId: string;
  dealId: number;
  // Self-describing identifier `${dealId}-V${version}-${YYYY-MM-DD}`, the date
  // being the UTC date of generatedAt. Frozen as the composed string so the
  // renderer and the email-back step (Step 6) share one stable basis.
  identifier: string;
};

// ---------------------------------------------------------------------------
// The snapshot envelope
// ---------------------------------------------------------------------------

export type ProjectQuoteSnapshot = {
  // = PROJECT_QUOTE_SNAPSHOT_VERSION at generation.
  snapshotVersion: number;
  // Part 1 — the verbatim successful DealQuote from getDealForQuote (Step 4),
  // stored RAW. lineItems keep Pipedrive's returned array order and each carries
  // orderNr; 5b sorts by orderNr at render. No field is recomputed or
  // re-sorted, and no derived price is added.
  commercial: DealQuote;
  // Part 2.
  sizing: ProjectQuoteSizing;
  // Part 3.
  showcase: ProjectQuoteShowcaseItem[];
  // Part 4.
  terms: ProjectQuoteTerms;
  // Part 5.
  generation: ProjectQuoteGeneration;
};

// ---------------------------------------------------------------------------
// The row ready to INSERT (Step 6 performs the insert)
// ---------------------------------------------------------------------------

// `snapshot` is the full frozen shape; the scalar columns mirror selected
// snapshot fields so they are queryable for auditing (which terms / version
// went out, when, by whom, for which deal) without unpacking the jsonb.
export type ProjectQuoteInsert = {
  submission_id: string;
  pipedrive_deal_id: number;
  version: number;
  snapshot: ProjectQuoteSnapshot;
  terms_version: string;
  generated_at: string;
  validity_days: number;
  generated_by: string;
};

// ---------------------------------------------------------------------------
// Assembly result (typed; surfaces empty-deal and read-error, never throws)
// ---------------------------------------------------------------------------

// assembleProjectQuoteSnapshot resolves to one of these. Step 6 guards on
// `reason` (refusing to generate on empty_deal, surfacing deal_read_error to
// the operator, and so on); the OK case carries the row ready to insert. The
// expected failure modes are typed results, mirroring getDealForQuote's
// never-throw contract.
export type AssembleSnapshotResult =
  | { ok: true; row: ProjectQuoteInsert }
  | { ok: false; reason: "submission_not_found"; submissionId: string }
  | { ok: false; reason: "no_deal_link"; submissionId: string }
  | { ok: false; reason: "deal_read_error"; error: QuoteError }
  | { ok: false; reason: "empty_deal"; deal: DealQuote };
