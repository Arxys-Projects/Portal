import "server-only";
import { type DocumentProps, renderToBuffer } from "@react-pdf/renderer";
import { type ReactElement, createElement } from "react";
import { SubmissionPdf } from "./SubmissionPdf";
import type {
  SubmissionPdfGroup,
  SubmissionPdfInput,
  SubmissionPdfServerSpec,
} from "./types";
import { loadHeroDataUri, loadLogoDataUri } from "./assets";
import { GB_PER_TB } from "@/lib/recommend/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { coveredCapacity, usableCapacityTb } from "@/lib/capacity-utils";
import { resolveSubmissionPartner } from "./partner-resolution";

export async function renderSubmissionPdfBuffer(
  input: SubmissionPdfInput,
): Promise<Buffer> {
  // SubmissionPdf returns a <Document>, but the wrapper's component-level
  // props type ({ data: SubmissionPdfInput }) does not unify with the
  // DocumentProps signature renderToBuffer expects. Cast through unknown.
  // Runtime is unaffected — react-pdf walks whatever element tree it gets.
  const element = createElement(SubmissionPdf, { data: input }) as unknown as ReactElement<DocumentProps>;
  return renderToBuffer(element);
}

// Strip characters illegal in filenames across Windows/macOS/Linux and collapse
// whitespace, so a company or project name can't break or split the filename.
function sanitizeFilenamePart(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function pdfFilename(
  input: Pick<SubmissionPdfInput, "generatedAt" | "projectName" | "partner">,
): string {
  const yyyy = input.generatedAt.getFullYear();
  const mm = String(input.generatedAt.getMonth() + 1).padStart(2, "0");
  const dd = String(input.generatedAt.getDate()).padStart(2, "0");
  const company = sanitizeFilenamePart(input.partner.companyName) || "Arxys";
  const project = sanitizeFilenamePart(input.projectName ?? "") || "Untitled Project";
  return `${company} - ${project} - ${yyyy}-${mm}-${dd}.pdf`;
}

// Load a persisted submission and assemble its PDF view model. Used by the
// download Route Handler. Server Action callers construct the view model
// from in-memory data instead — no need to re-query.
//
// Authorization comes from the user-scoped Supabase client passed in:
// RLS on submissions limits SELECT to partner_id = auth.uid() OR is_admin().
// Returns null if the submission is not visible to this client.
export async function loadSubmissionPdfInput(
  submissionId: string,
  supabase: SupabaseClient,
): Promise<SubmissionPdfInput | null> {
  const { data: row, error } = await supabase
    .from("submissions")
    .select(
      [
        "id",
        "partner_id",
        "on_behalf_of_partner_id",
        "on_behalf_of_company_name",
        "project_name",
        "cameras_count",
        "bandwidth_mbps",
        "storage_tb",
        "vms",
        "retention_days",
        "recommended_product_id",
        "recommended_units",
        "groups_payload",
      ].join(","),
    )
    .eq("id", submissionId)
    .maybeSingle();
  if (error || !row) return null;

  type SubmissionRow = {
    id: string;
    partner_id: string;
    on_behalf_of_partner_id: string | null;
    on_behalf_of_company_name: string | null;
    project_name: string | null;
    cameras_count: number;
    bandwidth_mbps: number;
    storage_tb: number;
    vms: string | null;
    retention_days: number;
    recommended_product_id: string | null;
    recommended_units: number;
    groups_payload: GroupsPayload | null;
  };
  const submission = row as unknown as SubmissionRow;

  // Tier 1: fetch the on-behalf-of target partner via admin client (bypasses RLS
  // — the viewer may not have SELECT on the target's partner row under their own
  // scope). Only fetched when the FK is set.
  const onBehalfPartnerFetch = submission.on_behalf_of_partner_id
    ? createSupabaseAdminClient()
        .from("partners")
        .select("company_name, contact_name")
        .eq("id", submission.on_behalf_of_partner_id)
        .maybeSingle()
    : Promise.resolve({ data: null });

  const [{ data: partnerRow }, { data: onBehalfPartnerRow }, productLookup, specRow, warnings] =
    await Promise.all([
      supabase
        .from("partners")
        .select("company_name, contact_name")
        .eq("id", submission.partner_id)
        .maybeSingle(),
      onBehalfPartnerFetch,
      submission.recommended_product_id
        ? loadProductBySku(supabase, submission.recommended_product_id)
        : Promise.resolve(null),
      submission.recommended_product_id
        ? loadProductSpec(supabase, submission.recommended_product_id)
        : Promise.resolve(null),
      Promise.resolve(extractWarnings(submission.groups_payload)),
    ]);

  const { data: userRes } = await supabase.auth.getUser();
  const partnerEmail = userRes?.user?.email ?? "(no email on file)";

  const generatedAt = new Date();
  const groups = mapGroups(submission.groups_payload);
  const recommendedUnits = submission.recommended_units;
  // Phase 2 Step 3+4: after the SKU-PK migration, pre-migration submissions
  // carry a UUID-shaped TEXT recommended_product_id that points at no row.
  // Render "(legacy data)" in that case; new submissions resolve cleanly via
  // the SKU.
  const isLegacy = isUuidShaped(submission.recommended_product_id);
  const productName =
    productLookup?.product?.product_name ??
    (isLegacy ? "(legacy data — product details unavailable)" : "Recommended server");
  const productDescription = productName;
  // From product_specs, never the current_products inline capacity columns —
  // see coveredCapacity()'s contract.
  const { coveredCameras, coveredStorageTb } = coveredCapacity(
    recommendedUnits,
    specRow,
    Number(submission.storage_tb),
  );

  // groups_payload only has the per-group inputs; totals come straight off
  // the row to stay consistent with what was emailed/saved.
  const totalsStorageGb = Number(submission.storage_tb) * GB_PER_TB;
  const modelCode = productLookup?.product?.product_group ?? (isLegacy ? "(legacy)" : "(unknown)");

  // Price comes from current_products (the versioned, effective-dated source),
  // NOT product_specs — product_specs.msrp is a stale reference-table copy the
  // price pipeline (push-prices.ts) never updates. See ADR 0086.
  const serverSpec = specRow
    ? mapServerSpec(specRow, modelCode, productLookup?.product?.msrp ?? null)
    : null;

  // Resolve which partner to attribute the PDF to. Uses three-tier precedence:
  // on_behalf_of_partner_id → on_behalf_of_company_name → creating partner.
  // NOTE: partner.email is always the authenticated viewer's email (from
  // auth.getUser()), not the target partner's email. This is a known limitation
  // for on-behalf submissions — fixing it requires auth/identity changes that
  // are out of scope here.
  const resolvedPartner = resolveSubmissionPartner(
    submission,
    onBehalfPartnerRow as { company_name: string; contact_name: string } | null,
    partnerRow as { company_name: string; contact_name: string } | null,
  );

  return {
    generatedAt,
    submissionId: submission.id,
    partner: {
      companyName: resolvedPartner.companyName,
      contactName: resolvedPartner.contactName,
      email: partnerEmail,
    },
    projectName: submission.project_name,
    vms: submission.vms,
    retentionDays: submission.retention_days,
    totals: {
      cameras: submission.cameras_count,
      bandwidthMbps: Number(submission.bandwidth_mbps),
      storageGb: totalsStorageGb,
    },
    groups,
    storageTb: Number(submission.storage_tb),
    bandwidthMbps: Number(submission.bandwidth_mbps),
    recommendation: {
      units: recommendedUnits,
      modelCode,
      productDescription,
      coveredCameras,
      coveredStorageTb,
      warnings,
    },
    serverSpec,
    logoDataUri: loadLogoDataUri(),
    heroDataUri: loadHeroDataUri(modelCode),
  };
}

// Re-exported for callers that import usableCapacityTb from this module.
// The implementation now lives in src/lib/capacity-utils.ts (shared with the
// Project Quote data layer). See Step 5b helper-convergence note in JOURNAL.md.
export { usableCapacityTb };

// A UUID-shaped recommended_product_id signals a pre-Step-3+4 submission whose
// FK target no longer exists. After the migration, new submissions write SKU
// strings (e.g. `VX5-V800-720`), which never match the UUID pattern.
function isUuidShaped(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

type GroupsPayload = {
  retentionDays?: number;
  groups?: Array<{
    name?: string;
    cameras?: number;
    resolutionIdx?: number;
    resolutionLabel?: string;
    codec?: string;
    complexity?: string;
    complexityLabel?: string;
    recordingMode?: "constant" | "motion";
    fps?: number;
    recordingPercent?: number;
    motionPercent?: number;
    computed?: { bandwidthMbps?: number; storageGb?: number };
  }>;
  warnings?: string[];
};

// Coarse fallback label for legacy rows banked before the six-level rework,
// which stored only a tier word and no `complexityLabel`. We never re-derive a
// precise label from the multiplier — the tier is all the old data carries.
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

function mapGroups(payload: GroupsPayload | null): SubmissionPdfGroup[] {
  if (!payload?.groups) return [];
  return payload.groups.map((g) => ({
    name: g.name ?? "Group",
    cameras: g.cameras ?? 0,
    resolutionLabel: g.resolutionLabel ?? "—",
    codec: g.codec ?? "—",
    fps: g.fps ?? 0,
    complexityLabel: g.complexityLabel ?? fallbackComplexityLabel(g.complexity),
    recordingMode: g.recordingMode === "motion" ? "motion" : "constant",
    hoursPerDay: Math.round(((g.recordingPercent ?? 0) / 100) * 24),
    motionPercent: g.motionPercent ?? 0,
    bandwidthMbps: g.computed?.bandwidthMbps ?? 0,
    storageGb: g.computed?.storageGb ?? 0,
  }));
}

function extractWarnings(payload: GroupsPayload | null): string[] {
  // Warnings aren't persisted today (Step 5 wrote them only into the action
  // result + email). For now the PDF Recommended-Hardware section just has
  // its capacity line; future schema work can persist them if needed.
  return payload?.warnings ?? [];
}

// Phase 2 Step 3+4: products is SKU-PK; server_specs is gone. Legacy UUID-shaped
// values resolve to null (caller renders "(legacy data)" via the isLegacy branch).
//
// Deliberately does NOT read products.max_cameras / max_storage_tb. Those are
// populated for only 6 of the 18 pool SKUs, so the PDF's covered-capacity lines
// take cameras and net-usable storage from product_specs via coveredCapacity().
// This loader supplies identity and price only. See ADR 0094 and JOURNAL
// 2026-07-24.
async function loadProductBySku(
  supabase: SupabaseClient,
  sku: string,
): Promise<{
  product: {
    sku: string;
    product_name: string;
    product_group: string;
    msrp: number | null;
  };
} | null> {
  const { data: product } = await supabase
    .from("current_products")
    .select("sku, product_name, product_group, msrp")
    .eq("sku", sku)
    .maybeSingle();
  if (!product) return null;
  return {
    product: {
      sku: product.sku,
      product_name: product.product_name,
      product_group: product.product_group,
      msrp: product.msrp === null ? null : Number(product.msrp),
    },
  };
}

type ProductSpecRow = {
  id: string;
  model_name: string;
  form_factor: string;
  storage_raw_tb: number;
  max_cameras: number;
  max_bandwidth_mbps: number | null;
  drive_bays: number | null;
  cpu_model_full: string | null;
  ram_spec: string | null;
  os_edition: string | null;
  hdd_count: number | null;
  raid_level_display: string | null;
};

// product_specs.id IS the SKU (e.g. "VX5-V500-240"), matching submissions'
// recommended_product_id post-migration. QuickCompare columns (Phase 6) are
// nullable — callers render "—" for nulls. Legacy UUID-shaped ids match no row
// and return null.
async function loadProductSpec(
  supabase: SupabaseClient,
  sku: string,
): Promise<ProductSpecRow | null> {
  const { data } = await supabase
    .from("product_specs")
    .select(
      [
        "id",
        "model_name",
        "form_factor",
        "storage_raw_tb",
        "max_cameras",
        "max_bandwidth_mbps",
        "drive_bays",
        "cpu_model_full",
        "ram_spec",
        "os_edition",
        "hdd_count",
        "raid_level_display",
      ].join(","),
    )
    .eq("id", sku)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as ProductSpecRow;
  return {
    ...row,
    storage_raw_tb: Number(row.storage_raw_tb),
  };
}

// Pure mapping from a product_specs row (spec attributes) + the current_products
// msrp (the price) to the PDF server-spec view model. Price is passed in, not
// read off specRow: product_specs.msrp is a stale reference-table copy the price
// pipeline never updates; current_products is the single price source (ADR 0086).
function mapServerSpec(
  specRow: ProductSpecRow,
  modelCode: string,
  msrp: number | null,
): SubmissionPdfServerSpec {
  return {
    sku: specRow.id,
    // Family-level name ("VideoX V500"), not the per-tier model_name string
    // which embeds the capacity ("VideoX V500 240TB 2U 12Bay").
    modelName:
      modelCode.startsWith("V") || modelCode.startsWith("S")
        ? `VideoX ${modelCode}`
        : specRow.model_name,
    formFactor: specRow.form_factor,
    maxCameras: specRow.max_cameras,
    maxBandwidthMbps: specRow.max_bandwidth_mbps,
    driveBays: specRow.drive_bays,
    cpuModelFull: specRow.cpu_model_full,
    ramSpec: specRow.ram_spec,
    osEdition: specRow.os_edition,
    warranty: "5yr NBD, Advanced Replacement",
    msrp,
    usablePerUnitTb: usableCapacityTb(
      specRow.storage_raw_tb,
      specRow.hdd_count,
      specRow.raid_level_display,
    ),
  };
}

// Fetch + map the recommended server's spec for a SKU. Shared by the download
// Route Handler (via loadSubmissionPdfInput) and the calculator Server Action
// (which assembles the emailed PDF's view model in-memory). `msrp` is the
// current_products price, supplied by the caller (the versioned source of truth).
export async function buildServerSpec(
  supabase: SupabaseClient,
  sku: string | null,
  modelCode: string,
  msrp: number | null,
): Promise<SubmissionPdfServerSpec | null> {
  if (!sku) return null;
  const specRow = await loadProductSpec(supabase, sku);
  return specRow ? mapServerSpec(specRow, modelCode, msrp) : null;
}
