import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDealForQuote } from "@/lib/pipedrive/quote";
import { PROJECT_QUOTE_VALIDITY_DAYS } from "./config";
import { getProjectQuoteTerms } from "./terms";
import {
  buildProjectQuoteSnapshot,
  buildShowcaseSpecHighlights,
  buildSizingFromSubmission,
  type ShowcaseCatalogRecord,
  type SizingProductRow,
  type SizingProductSpecRow,
  type SizingSubmissionRow,
} from "./snapshot";
import type { AssembleSnapshotResult, ProjectQuoteSnapshot } from "./types";

// ===========================================================================
// Project Quote — assembly orchestrator (Phase 10 Step 5a).
//
// Thin server-only glue: it loads the submission, reads the linked deal live
// from Pipedrive (Step 4), resolves the sizing joins and the showcase catalog,
// reads the prior version, stamps terms and meta, and hands raw inputs to the
// pure buildProjectQuoteSnapshot. It does NOT insert: it returns the typed
// AssembleSnapshotResult ready for Step 6 to guard on and persist. The pure
// assembly + freezing logic lives in snapshot.ts and is what the unit tests
// exercise; this file is the I/O wiring.
// ===========================================================================

// Columns the sizing half needs. Mirrors loadSubmissionPdfInput plus the
// pipedrive_deal_id link and the partner_id for the reseller block.
const SUBMISSION_COLUMNS = [
  "id",
  "partner_id",
  "pipedrive_deal_id",
  "project_name",
  "vms",
  "retention_days",
  "cameras_count",
  "bandwidth_mbps",
  "storage_tb",
  "recommended_product_id",
  "recommended_units",
  "groups_payload",
].join(",");

const PRODUCT_SPEC_COLUMNS = [
  "id",
  "model_name",
  "form_factor",
  "rack_units",
  "storage_raw_tb",
  "max_cameras",
  "max_bandwidth_mbps",
  "drive_bays",
  "cpu_model_full",
  "ram_spec",
  "os_edition",
  "hdd_count",
  "raid_level_display",
].join(",");

type SubmissionRow = SizingSubmissionRow & {
  partner_id: string;
  pipedrive_deal_id: number | null;
};

type ProductSpecRow = NonNullable<SizingProductSpecRow> & { id: string };

function numericOrNull(value: unknown): number | null {
  return value == null ? null : Number(value);
}

// Normalize a product_specs row (numeric columns arrive as strings over the
// wire) into the SizingProductSpecRow shape the builders expect.
function normalizeSpecRow(row: ProductSpecRow): NonNullable<SizingProductSpecRow> {
  return {
    model_name: row.model_name,
    form_factor: row.form_factor,
    rack_units: row.rack_units,
    storage_raw_tb: numericOrNull(row.storage_raw_tb),
    max_cameras: row.max_cameras,
    max_bandwidth_mbps: row.max_bandwidth_mbps,
    drive_bays: row.drive_bays,
    cpu_model_full: row.cpu_model_full,
    ram_spec: row.ram_spec,
    os_edition: row.os_edition,
    hdd_count: row.hdd_count,
    raid_level_display: row.raid_level_display,
  };
}

// Resolve the catalog for the deal's distinct line-item SKUs: a products row
// (the catalog record, required for the showcase) joined to its product_specs
// row (the spec highlights, optional). SKUs with no products row are simply
// absent from the map, so the showcase builder drops them.
async function loadShowcaseCatalog(
  supabase: SupabaseClient,
  skus: string[],
): Promise<Map<string, ShowcaseCatalogRecord>> {
  const map = new Map<string, ShowcaseCatalogRecord>();
  if (skus.length === 0) return map;

  const [{ data: products }, { data: specs }] = await Promise.all([
    supabase.from("current_products").select("sku, product_name, product_group, price_type, msrp").in("sku", skus),
    supabase.from("product_specs").select(PRODUCT_SPEC_COLUMNS).in("id", skus),
  ]);

  const specBySku = new Map<string, NonNullable<SizingProductSpecRow>>();
  for (const raw of (specs ?? []) as unknown as ProductSpecRow[]) {
    specBySku.set(raw.id, normalizeSpecRow(raw));
  }

  type ProductRow = {
    sku: string;
    product_name: string;
    product_group: string;
    price_type: string;
    msrp: number | string | null;
  };
  for (const product of (products ?? []) as unknown as ProductRow[]) {
    map.set(product.sku, {
      sku: product.sku,
      productName: product.product_name,
      productGroup: product.product_group,
      priceType: product.price_type,
      msrp: numericOrNull(product.msrp),
      specHighlights: buildShowcaseSpecHighlights(specBySku.get(product.sku) ?? null),
    });
  }
  return map;
}

// Prior max version for a submission: the basis for version = max+1. "Current"
// is derived the same way (order by version desc limit 1); no stored flag.
async function loadMaxVersion(supabase: SupabaseClient, submissionId: string): Promise<number | null> {
  const { data } = await supabase
    .from("project_quotes")
    .select("version")
    .eq("submission_id", submissionId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<{ version: number }>();
  return data?.version ?? null;
}

// Assemble a Project Quote snapshot for a submission. Loads the submission and
// its linked deal, resolves the sizing and showcase, computes the next version,
// stamps terms and generation meta, and returns the row ready for Step 6 to
// insert. Surfaces the empty-deal and deal-read-error cases as typed results.
// Does NOT insert.
export async function assembleProjectQuoteSnapshot(
  submissionId: string,
  supabase: SupabaseClient,
): Promise<AssembleSnapshotResult> {
  const { data: row, error } = await supabase
    .from("submissions")
    .select(SUBMISSION_COLUMNS)
    .eq("id", submissionId)
    .maybeSingle();
  if (error || !row) {
    return { ok: false, reason: "submission_not_found", submissionId };
  }
  const submission = row as unknown as SubmissionRow;

  if (submission.pipedrive_deal_id == null) {
    return { ok: false, reason: "no_deal_link", submissionId };
  }

  const dealResult = await getDealForQuote(Number(submission.pipedrive_deal_id));
  // Short-circuit the failure paths before doing any sizing / catalog work; the
  // pure builder re-checks and produces the same typed result.
  if (!dealResult.ok) {
    return { ok: false, reason: "deal_read_error", error: dealResult.error };
  }
  if (dealResult.deal.isEmpty) {
    return { ok: false, reason: "empty_deal", deal: dealResult.deal };
  }

  const recommendedSku = submission.recommended_product_id;
  const dealSkus = Array.from(
    new Set(dealResult.deal.lineItems.map((l) => l.productCode).filter((c): c is string => !!c)),
  );

  const [partnerRes, productRes, productSpecRes, catalogBySku, existingMaxVersion, userRes] =
    await Promise.all([
      supabase
        .from("partners")
        .select("company_name, contact_name")
        .eq("id", submission.partner_id)
        .maybeSingle<{ company_name: string | null; contact_name: string | null }>(),
      recommendedSku
        ? supabase
            .from("current_products")
            .select("product_group, product_name, msrp")
            .eq("sku", recommendedSku)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      recommendedSku
        ? supabase.from("product_specs").select(PRODUCT_SPEC_COLUMNS).eq("id", recommendedSku).maybeSingle()
        : Promise.resolve({ data: null }),
      loadShowcaseCatalog(supabase, dealSkus),
      loadMaxVersion(supabase, submissionId),
      supabase.auth.getUser(),
    ]);

  const product = (productRes.data as unknown as SizingProductRow) ?? null;
  const productSpec = productSpecRes.data
    ? normalizeSpecRow(productSpecRes.data as unknown as ProductSpecRow)
    : null;

  const sizing = buildSizingFromSubmission({
    submission,
    partner: partnerRes.data ?? null,
    product,
    productSpec,
  });

  return buildProjectQuoteSnapshot({
    submissionId,
    dealResult,
    sizing,
    catalogBySku,
    terms: getProjectQuoteTerms(),
    existingMaxVersion,
    generatedAt: new Date(),
    generatedByUserId: userRes.data?.user?.id ?? "",
    validityDays: PROJECT_QUOTE_VALIDITY_DAYS,
  });
}

// The stored row of the current (latest-version) Project Quote for a
// submission. "Current" is DERIVED here as max version; there is no is_current
// column to read or maintain.
export type CurrentProjectQuoteRow = {
  id: string;
  version: number;
  snapshot: ProjectQuoteSnapshot;
  terms_version: string;
  generated_at: string;
  validity_days: number;
  generated_by: string;
  created_at: string;
};

// Load the current Project Quote for a submission, or null when none exists.
// This is the canonical derived-current read (Step 5b renders from snapshot;
// Step 6 uses it to show the latest issued quote).
export async function loadCurrentProjectQuote(
  submissionId: string,
  supabase: SupabaseClient,
): Promise<CurrentProjectQuoteRow | null> {
  const { data } = await supabase
    .from("project_quotes")
    .select("id, version, snapshot, terms_version, generated_at, validity_days, generated_by, created_at")
    .eq("submission_id", submissionId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<CurrentProjectQuoteRow>();
  return data ?? null;
}

// Load one specific Project Quote revision for a submission (ADR 0083 — the
// partner-facing download lists revisions, each rendered from its own frozen
// snapshot). RLS scopes visibility exactly like loadCurrentProjectQuote.
export async function loadProjectQuoteVersion(
  submissionId: string,
  version: number,
  supabase: SupabaseClient,
): Promise<CurrentProjectQuoteRow | null> {
  const { data } = await supabase
    .from("project_quotes")
    .select("id, version, snapshot, terms_version, generated_at, validity_days, generated_by, created_at")
    .eq("submission_id", submissionId)
    .eq("version", version)
    .maybeSingle<CurrentProjectQuoteRow>();
  return data ?? null;
}
