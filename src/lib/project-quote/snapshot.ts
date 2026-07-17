import type { DealQuote, GetDealForQuoteResult, QuoteLineItem } from "@/lib/pipedrive/quote";
import { familyBySlug, productGroupToFamilySlug } from "@/lib/price-book/families";
import { GB_PER_TB } from "@/lib/recommend/types";
import {
  PROJECT_QUOTE_SNAPSHOT_VERSION,
  type AssembleSnapshotResult,
  type ProjectQuoteCameraRow,
  type ProjectQuoteInsert,
  type ProjectQuoteServerSpec,
  type ProjectQuoteShowcaseItem,
  type ProjectQuoteShowcaseSpecHighlights,
  type ProjectQuoteSizing,
  type ProjectQuoteSnapshot,
  type ProjectQuoteTerms,
} from "./types";

// ===========================================================================
// Project Quote — pure assembly logic (Phase 10 Step 5a).
//
// Every function here is pure (no Supabase, no Pipedrive, no @react-pdf, no
// server-only import), so the orchestrator in assemble.ts can resolve the raw
// inputs and these builders deterministically freeze them. That keeps the data
// layer free of the render layer (the dependency direction is render -> data),
// and lets the unit tests exercise the full assembly with plain fixtures and no
// mocks. The functions never recompute a price and never store a derived one.
// ===========================================================================

// ---------------------------------------------------------------------------
// Shared resolvers
// ---------------------------------------------------------------------------

// Converged into src/lib/capacity-utils.ts (Step 5b). Imported for internal
// use in mapServerSpec and re-exported so snapshot.test.ts keeps working.
import { usableCapacityTb } from "@/lib/capacity-utils";
export { usableCapacityTb };

// A UUID-shaped recommended_product_id signals a pre-SKU-PK submission whose
// product reference no longer resolves. Mirrors src/lib/pdf/render.ts.
function isUuidShaped(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// Resolve a product group's Price Book family hero image to its /public path
// (for example "V500" -> "/price-book/v400-v500-hero.png"). Mirrors the lookup
// in src/lib/pdf/assets.ts loadHeroDataUri, but returns the PATH (frozen into
// the snapshot) rather than the loaded bytes. null when no family or no hero.
export function resolveHeroImagePath(productGroup: string | null | undefined): string | null {
  if (!productGroup) return null;
  const slug = productGroupToFamilySlug(productGroup);
  if (!slug) return null;
  return familyBySlug(slug)?.heroImage ?? null;
}

// ---------------------------------------------------------------------------
// Showcase (page 2)
// ---------------------------------------------------------------------------

// Showcase eligibility: any product group that resolves to a price-book family
// (productGroupToFamilySlug returns non-null). That covers all V-series servers
// (V100, V150, V200, V250, V255, V260, V270, V400-V800) and all SW workstations
// (SW10-SW35). Add-on cards, NICs, transceivers, and warranty SKUs have no
// price-book family and return null. [MKT] custom lines are excluded upstream
// by the priceType check in buildShowcase.
export function isShowcaseProductGroup(productGroup: string | null | undefined): boolean {
  if (!productGroup) return false;
  return productGroupToFamilySlug(productGroup) !== null;
}

// A resolved catalog record for one SKU, assembled by the orchestrator from the
// products row (required, the "catalog record") and the product_specs row
// (optional, the spec highlights). The pure builder filters and freezes from
// this; a SKU absent from the map has no catalog record and is not showcased.
export type ShowcaseCatalogRecord = {
  sku: string;
  productName: string;
  productGroup: string;
  // products.price_type. "market" lines ([MKT]) are excluded from the showcase.
  priceType: string;
  msrp: number | null;
  specHighlights: ProjectQuoteShowcaseSpecHighlights | null;
};

// Build the page-2 showcase from the deal's line items plus the resolved
// catalog. One card per distinct SKU that (a) resolves to a catalog record,
// (b) is not a [MKT] / market line, and (c) is an eligible showcase group.
// Deterministic order: product group, then SKU. Frozen output, never re-derived
// at render.
export function buildShowcase(
  lineItems: QuoteLineItem[],
  catalogBySku: Map<string, ShowcaseCatalogRecord>,
): ProjectQuoteShowcaseItem[] {
  const seen = new Set<string>();
  const items: ProjectQuoteShowcaseItem[] = [];
  for (const line of lineItems) {
    const sku = line.productCode;
    if (!sku || seen.has(sku)) continue;
    const record = catalogBySku.get(sku);
    if (!record) continue; // no catalog record: stays on the commercial table only
    if (record.priceType === "market") continue; // [MKT] custom line
    if (!isShowcaseProductGroup(record.productGroup)) continue;
    seen.add(sku);
    items.push({
      sku: record.sku,
      productName: record.productName,
      productGroup: record.productGroup,
      msrp: record.msrp,
      heroImagePath: resolveHeroImagePath(record.productGroup),
      specHighlights: record.specHighlights,
    });
  }
  items.sort((a, b) =>
    a.productGroup === b.productGroup
      ? a.sku.localeCompare(b.sku)
      : a.productGroup.localeCompare(b.productGroup),
  );
  return items;
}

// ---------------------------------------------------------------------------
// Sizing (resolved from the submission)
// ---------------------------------------------------------------------------

// Raw rows the orchestrator hands the sizing builder. The shapes match the
// selects in assemble.ts (which mirror loadSubmissionPdfInput's columns plus the
// Phase 10 groups_payload fields and the product_specs QuickCompare columns).
export type SizingSubmissionRow = {
  id: string;
  project_name: string | null;
  vms: string | null;
  retention_days: number;
  cameras_count: number;
  bandwidth_mbps: number;
  storage_tb: number;
  recommended_product_id: string | null;
  recommended_units: number;
  groups_payload: unknown;
};
export type SizingPartnerRow = { company_name: string | null; contact_name: string | null } | null;
export type SizingProductRow = {
  product_group: string;
  product_name: string;
  max_cameras: number | null;
  max_storage_tb: number | null;
  msrp: number | null;
} | null;
export type SizingProductSpecRow = {
  model_name: string | null;
  form_factor: string | null;
  rack_units: string | null;
  storage_raw_tb: number | null;
  max_cameras: number | null;
  max_bandwidth_mbps: number | null;
  drive_bays: number | null;
  cpu_model_full: string | null;
  ram_spec: string | null;
  os_edition: string | null;
  hdd_count: number | null;
  raid_level_display: string | null;
} | null;

type RawGroupsPayload = {
  groups?: Array<{
    name?: string;
    cameras?: number;
    resolutionLabel?: string;
    codec?: string;
    complexity?: string;
    complexityLabel?: string;
    recordingMode?: "constant" | "motion";
    fps?: number;
    recordingPercent?: number;
    motionPercent?: number;
    cameraVendor?: string | null;
    cameraModel?: string | null;
    units?: number;
    sensorsPerCamera?: number;
    cameraModelModified?: boolean;
    computed?: { bandwidthMbps?: number; storageGb?: number };
  }>;
  warnings?: string[];
};

function asGroupsPayload(payload: unknown): RawGroupsPayload {
  return payload && typeof payload === "object" ? (payload as RawGroupsPayload) : {};
}

// Coarse fallback label for legacy rows banked before the six-level rework,
// which stored only a tier word and no complexityLabel. Mirrors render.ts.
function fallbackComplexityLabel(tier: string | undefined): string {
  switch (tier) {
    case "low":
      return "Low detail";
    case "med":
      return "Medium detail";
    case "high":
      return "High detail";
    default:
      return "Standard";
  }
}

// Freeze the camera schedule from groups_payload: the resolved display labels
// (resolutionLabel / codec / complexityLabel banked by actions.ts) plus the
// Phase 10 camera-model fields. Indices are never read, so a later lookup-table
// reorder cannot corrupt an old quote. Missing labels freeze as "" and 5b
// applies its dash placeholder at render (the System Estimate idiom).
function buildCameraSchedule(payload: unknown): ProjectQuoteCameraRow[] {
  const groups = asGroupsPayload(payload).groups ?? [];
  return groups.map((g) => ({
    name: g.name ?? "Group",
    cameras: g.cameras ?? 0,
    resolutionLabel: g.resolutionLabel ?? "",
    codec: g.codec ?? "",
    fps: g.fps ?? 0,
    complexityLabel: g.complexityLabel ?? fallbackComplexityLabel(g.complexity),
    recordingMode: g.recordingMode === "motion" ? "motion" : "constant",
    hoursPerDay: Math.round(((g.recordingPercent ?? 0) / 100) * 24),
    motionPercent: g.motionPercent ?? 0,
    bandwidthMbps: g.computed?.bandwidthMbps ?? 0,
    storageGb: g.computed?.storageGb ?? 0,
    // Phase 10 fields, banked resolved in groups_payload. null vendor / model =
    // manual-entry marker; units / sensors carry the picker inputs.
    cameraVendor: g.cameraVendor ?? null,
    cameraModel: g.cameraModel ?? null,
    units: g.units ?? 0,
    sensorsPerCamera: g.sensorsPerCamera ?? 0,
    cameraModelModified: g.cameraModelModified === true,
  }));
}

// Pure mapping from a product_specs row to the frozen server spec. Mirrors
// src/lib/pdf/render.ts mapServerSpec (kept local for the same reason as
// usableCapacityTb). modelCode is the product group (for example "V800").
// Price (`msrp`) is passed in from the current_products join, NOT read off the
// product_specs spec: product_specs.msrp is a stale reference-table copy the
// price pipeline never updates; current_products is the single price source
// (ADR 0086).
function mapServerSpec(
  spec: NonNullable<SizingProductSpecRow>,
  sku: string,
  modelCode: string,
  msrp: number | null,
): ProjectQuoteServerSpec {
  const isFamilyCoded = modelCode.startsWith("V") || modelCode.startsWith("S");
  return {
    sku,
    modelName: isFamilyCoded ? `VideoX ${modelCode}` : (spec.model_name ?? "(unknown)"),
    formFactor: spec.form_factor,
    maxCameras: spec.max_cameras,
    maxBandwidthMbps: spec.max_bandwidth_mbps,
    driveBays: spec.drive_bays,
    cpuModelFull: spec.cpu_model_full,
    ramSpec: spec.ram_spec,
    osEdition: spec.os_edition,
    warranty: "5yr NBD, Advanced Replacement",
    msrp,
    usablePerUnitTb: usableCapacityTb(spec.storage_raw_tb, spec.hdd_count, spec.raid_level_display),
  };
}

// Build spec highlights for a showcase card from a product_specs row. Exported
// so the orchestrator can attach it to a ShowcaseCatalogRecord; null in / null
// out for SKUs with no product_specs row.
export function buildShowcaseSpecHighlights(
  spec: SizingProductSpecRow,
): ProjectQuoteShowcaseSpecHighlights | null {
  if (!spec) return null;
  return {
    formFactor: spec.form_factor,
    rackUnits: spec.rack_units,
    cpuModelFull: spec.cpu_model_full,
    ramSpec: spec.ram_spec,
    driveBays: spec.drive_bays,
    storageRawTb: spec.storage_raw_tb,
    maxCameras: spec.max_cameras,
    maxBandwidthMbps: spec.max_bandwidth_mbps,
    osEdition: spec.os_edition,
    raidLevelDisplay: spec.raid_level_display,
    hddCount: spec.hdd_count,
  };
}

// Freeze the sizing half from the submission row plus its resolved partner /
// product / product_specs joins. Resolved values only; no index is stored.
export function buildSizingFromSubmission(input: {
  submission: SizingSubmissionRow;
  partner: SizingPartnerRow;
  product: SizingProductRow;
  productSpec: SizingProductSpecRow;
}): ProjectQuoteSizing {
  const { submission, partner, product, productSpec } = input;
  const sku = submission.recommended_product_id;
  const isLegacy = isUuidShaped(sku);
  const units = submission.recommended_units;

  const productName =
    product?.product_name ??
    (isLegacy ? "(legacy data; product details unavailable)" : "Recommended server");
  const modelCode = product?.product_group ?? (isLegacy ? "(legacy)" : "(unknown)");

  const coveredCameras = product?.max_cameras ? units * product.max_cameras : 0;
  const coveredStorageTb = product?.max_storage_tb
    ? units * product.max_storage_tb
    : Number(submission.storage_tb);

  const serverSpec =
    productSpec && sku ? mapServerSpec(productSpec, sku, modelCode, product?.msrp ?? null) : null;

  return {
    projectName: submission.project_name,
    vms: submission.vms,
    retentionDays: submission.retention_days,
    totals: {
      cameras: submission.cameras_count,
      bandwidthMbps: Number(submission.bandwidth_mbps),
      storageGb: Number(submission.storage_tb) * GB_PER_TB,
    },
    storageTb: Number(submission.storage_tb),
    bandwidthMbps: Number(submission.bandwidth_mbps),
    cameraSchedule: buildCameraSchedule(submission.groups_payload),
    recommendation: {
      units,
      modelCode,
      productDescription: productName,
      coveredCameras,
      coveredStorageTb,
      warnings: asGroupsPayload(submission.groups_payload).warnings ?? [],
    },
    serverSpec,
    primaryServerHeroImagePath: resolveHeroImagePath(modelCode),
    partner: {
      companyName: partner?.company_name ?? "(unknown)",
      contactName: partner?.contact_name ?? "(unknown)",
    },
  };
}

// ---------------------------------------------------------------------------
// Generation meta
// ---------------------------------------------------------------------------

// Next version for a submission: max(version)+1, or 1 when none exist.
export function computeNextVersion(existingMaxVersion: number | null): number {
  return (existingMaxVersion ?? 0) + 1;
}

function formatDateUtc(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Self-describing identifier `${dealId}-V${version}-${YYYY-MM-DD}`, the date
// being the UTC date of generatedAt. Computed once and frozen, so the stored
// value is reproducible regardless of server timezone.
export function composeQuoteIdentifier(dealId: number, version: number, generatedAt: Date): string {
  return `${dealId}-V${version}-${formatDateUtc(generatedAt)}`;
}

// ---------------------------------------------------------------------------
// The assembler
// ---------------------------------------------------------------------------

// Everything the pure assembler needs. The orchestrator resolves these (deal
// read, sizing, catalog, prior version, terms, clock, acting user) and hands
// them in; the tests pass fixtures. generatedAt is injected so the result is
// deterministic.
export type SnapshotBuildInput = {
  submissionId: string;
  dealResult: GetDealForQuoteResult;
  sizing: ProjectQuoteSizing;
  catalogBySku: Map<string, ShowcaseCatalogRecord>;
  terms: ProjectQuoteTerms;
  existingMaxVersion: number | null;
  generatedAt: Date;
  generatedByUserId: string;
  validityDays: number;
};

// Assemble the snapshot row, or surface the typed failure. The deal-read-error
// and empty-deal cases short-circuit here (this is the single decision point,
// re-checked even though the orchestrator skips sizing work on those paths), so
// Step 6 can guard on `reason`. The successful DealQuote is stored verbatim as
// `commercial`; no price is recomputed and no derived price is added.
export function buildProjectQuoteSnapshot(input: SnapshotBuildInput): AssembleSnapshotResult {
  const { dealResult } = input;
  if (!dealResult.ok) {
    return { ok: false, reason: "deal_read_error", error: dealResult.error };
  }
  const deal: DealQuote = dealResult.deal;
  if (deal.isEmpty) {
    return { ok: false, reason: "empty_deal", deal };
  }

  const version = computeNextVersion(input.existingMaxVersion);
  const generatedAtIso = input.generatedAt.toISOString();
  const identifier = composeQuoteIdentifier(deal.dealId, version, input.generatedAt);
  const showcase = buildShowcase(deal.lineItems, input.catalogBySku);

  const snapshot: ProjectQuoteSnapshot = {
    snapshotVersion: PROJECT_QUOTE_SNAPSHOT_VERSION,
    commercial: deal,
    sizing: input.sizing,
    showcase,
    terms: input.terms,
    generation: {
      version,
      generatedAt: generatedAtIso,
      validityDays: input.validityDays,
      generatedByUserId: input.generatedByUserId,
      submissionId: input.submissionId,
      dealId: deal.dealId,
      identifier,
    },
  };

  const row: ProjectQuoteInsert = {
    submission_id: input.submissionId,
    pipedrive_deal_id: deal.dealId,
    version,
    snapshot,
    terms_version: input.terms.version,
    generated_at: generatedAtIso,
    validity_days: input.validityDays,
    generated_by: input.generatedByUserId,
  };
  return { ok: true, row };
}
