import "server-only";
import { type DocumentProps, renderToBuffer } from "@react-pdf/renderer";
import { type ReactElement, createElement } from "react";
import { SubmissionPdf } from "./SubmissionPdf";
import type { SubmissionPdfGroup, SubmissionPdfInput } from "./types";
import { GB_PER_TB } from "@/lib/recommend/types";
import type { SupabaseClient } from "@supabase/supabase-js";

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

export function pdfFilename(input: { generatedAt: Date; submissionId: string }): string {
  const yyyy = input.generatedAt.getFullYear();
  const mm = String(input.generatedAt.getMonth() + 1).padStart(2, "0");
  const dd = String(input.generatedAt.getDate()).padStart(2, "0");
  return `Arxys-Report-${yyyy}-${mm}-${dd}-${input.submissionId}.pdf`;
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

  const [{ data: partnerRow }, productLookup, warnings] = await Promise.all([
    supabase
      .from("partners")
      .select("company_name, contact_name")
      .eq("id", submission.partner_id)
      .maybeSingle(),
    submission.recommended_product_id
      ? loadProductBySku(supabase, submission.recommended_product_id)
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
  const coveredCameras = productLookup?.product?.max_cameras
    ? recommendedUnits * productLookup.product.max_cameras
    : 0;
  const coveredStorageTb = productLookup?.product?.max_storage_tb
    ? recommendedUnits * productLookup.product.max_storage_tb
    : Number(submission.storage_tb);

  // groups_payload only has the per-group inputs; totals come straight off
  // the row to stay consistent with what was emailed/saved.
  const totalsStorageGb = Number(submission.storage_tb) * GB_PER_TB;

  return {
    generatedAt,
    submissionId: submission.id,
    partner: {
      companyName: partnerRow?.company_name ?? "(unknown)",
      contactName: partnerRow?.contact_name ?? "(unknown)",
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
    recommendation: {
      units: recommendedUnits,
      modelCode: productLookup?.product?.product_group ?? (isLegacy ? "(legacy)" : "(unknown)"),
      productDescription,
      coveredCameras,
      coveredStorageTb,
      warnings,
    },
  };
}

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
    fps?: number;
    recordingPercent?: number;
    motionPercent?: number;
    computed?: { bandwidthMbps?: number; storageGb?: number };
  }>;
  warnings?: string[];
};

function mapGroups(payload: GroupsPayload | null): SubmissionPdfGroup[] {
  if (!payload?.groups) return [];
  return payload.groups.map((g) => ({
    name: g.name ?? "Group",
    cameras: g.cameras ?? 0,
    resolutionLabel: g.resolutionLabel ?? "—",
    codec: g.codec ?? "—",
    fps: g.fps ?? 0,
    complexity: g.complexity ?? "Medium",
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

// Phase 2 Step 3+4: products is now SKU-PK with inline max_cameras +
// max_storage_tb. server_specs is gone. Legacy UUID-shaped values resolve to
// null (caller renders "(legacy data)" via the isLegacy branch).
async function loadProductBySku(
  supabase: SupabaseClient,
  sku: string,
): Promise<{
  product: {
    sku: string;
    product_name: string;
    product_group: string;
    max_cameras: number | null;
    max_storage_tb: number | null;
  };
} | null> {
  const { data: product } = await supabase
    .from("products")
    .select("sku, product_name, product_group, max_cameras, max_storage_tb")
    .eq("sku", sku)
    .maybeSingle();
  if (!product) return null;
  return {
    product: {
      sku: product.sku,
      product_name: product.product_name,
      product_group: product.product_group,
      max_cameras: product.max_cameras,
      max_storage_tb: product.max_storage_tb === null ? null : Number(product.max_storage_tb),
    },
  };
}
