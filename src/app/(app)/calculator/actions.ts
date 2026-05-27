"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  CODECS,
  COMPLEXITIES,
  RESOLUTIONS,
  VMS_OPTIONS,
} from "@/lib/calculator/tables";
import { computeGroup, type GroupInput } from "@/lib/calculator/compute";
import { recommend } from "@/lib/recommend/algorithm";
import { GB_PER_TB, type ServerSpec, type RecommendationResult } from "@/lib/recommend/types";
import { sendSubmissionNotification } from "@/lib/email/submission-notification";
import { pdfFilename, renderSubmissionPdfBuffer } from "@/lib/pdf/render";
import type { SubmissionPdfInput } from "@/lib/pdf/types";
import { createDealFromSubmission } from "@/lib/pipedrive/deal";

const groupSchema = z.object({
  name: z.string().trim().max(80).default(""),
  cameras: z.number().int().min(1).max(9999),
  resolutionIdx: z.number().int().min(0).max(RESOLUTIONS.length - 1),
  codecIdx: z.number().int().min(0).max(CODECS.length - 1),
  complexityIdx: z.number().int().min(0).max(COMPLEXITIES.length - 1),
  fps: z.number().int().min(1).max(60),
  recordingPercent: z.number().int().min(1).max(100),
  motionPercent: z.number().int().min(1).max(100),
});

const submissionSchema = z.object({
  projectName: z.string().trim().max(50).optional().nullable(),
  vms: z.string().max(40).optional().nullable(),
  retentionDays: z.number().int().min(1).max(730),
  groups: z.array(groupSchema).min(1).max(50),
});

export type SubmissionState =
  | { status: "idle" }
  | { status: "error"; error: string; fieldErrors?: Record<string, string[]> }
  | { status: "ok"; recommendation: PublicRecommendation; submissionId: string };

export type PublicRecommendation = {
  winner: RecommendationResult["winner"];
  alternatives: RecommendationResult["alternatives"];
  warnings: string[];
  totals: { cameras: number; bandwidthMbps: number; storageGb: number };
};

export async function submitCalculation(
  _prev: SubmissionState,
  payload: unknown,
): Promise<SubmissionState> {
  const parsed = submissionSchema.safeParse(payload);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_form";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return {
      status: "error",
      error: "Some inputs are invalid. Adjust the form and try again.",
      fieldErrors,
    };
  }
  const input = parsed.data;
  if (input.vms && !VMS_OPTIONS.includes(input.vms)) {
    return { status: "error", error: `Unknown VMS option: ${input.vms}` };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", error: "Your session has expired. Sign in and try again." };
  }

  // Defense-in-depth: the (app)/layout.tsx gate (ADR 0021) already prevents a
  // suspended partner from reaching the calculator UI; this catches direct
  // POSTs from a stale tab or scripted client.
  const { data: callerStatus } = await supabase
    .from("partners")
    .select("status")
    .eq("id", user.id)
    .maybeSingle();
  if (!callerStatus || callerStatus.status !== "active") {
    return {
      status: "error",
      error: "Your account is not active. Sign out and back in, or contact your administrator.",
    };
  }

  // Server-side recompute. Client totals are never trusted.
  const computed = input.groups.map((g) => {
    const gi: GroupInput = {
      cameras: g.cameras,
      resolution: RESOLUTIONS[g.resolutionIdx],
      codec: CODECS[g.codecIdx],
      complexity: COMPLEXITIES[g.complexityIdx],
      fps: g.fps,
      recordingPercent: g.recordingPercent,
      motionPercent: g.motionPercent,
    };
    return { input: g, computed: computeGroup(gi, input.retentionDays) };
  });
  const totals = computed.reduce(
    (acc, r) => {
      acc.cameras += r.input.cameras;
      acc.bandwidthMbps += r.computed.bandwidthMbps;
      acc.storageGb += r.computed.storageGb;
      return acc;
    },
    { cameras: 0, bandwidthMbps: 0, storageGb: 0 },
  );

  // Phase 2 Step 3+4: products is now SKU-PK with inline max_cameras +
  // max_storage_tb. server_specs is gone. recommend() filters MKT/CFQ
  // defensively but we also filter at the query level to keep the
  // candidate pool tight (Q4(a)).
  const { data: productRows, error: productError } = await supabase
    .from("products")
    .select("sku, product_name, product_group, msrp, price_type, max_cameras, max_storage_tb")
    .eq("active", true)
    .eq("price_type", "numeric")
    .not("max_cameras", "is", null)
    .not("max_storage_tb", "is", null)
    .order("sort_order");
  if (productError) {
    return { status: "error", error: `Failed to load products: ${productError.message}` };
  }
  if (!productRows || productRows.length === 0) {
    return { status: "error", error: "No active numeric-priced SKUs are seeded. Contact an administrator." };
  }

  const specs: ServerSpec[] = productRows.map((row) => ({
    sku: row.sku,
    productGroup: row.product_group,
    productName: row.product_name,
    maxCameras: row.max_cameras as number,
    maxStorageTb: Number(row.max_storage_tb),
    msrp: Number(row.msrp),
    priceType: "numeric" as const,
  }));
  const specBySku = new Map<string, ServerSpec>(specs.map((s) => [s.sku, s]));

  const recommendation = recommend(
    { totalCameras: totals.cameras, totalStorageGb: totals.storageGb },
    specs,
  );

  // Primary group = the one with the most cameras (canonical resolution/codec/complexity).
  const primary = [...computed].sort((a, b) => b.input.cameras - a.input.cameras)[0];

  const submissionRow = {
    partner_id: user.id,
    input_state: parsed.data,
    project_name: input.projectName?.trim() || null,
    cameras_count: totals.cameras,
    resolution_code: RESOLUTIONS[primary.input.resolutionIdx].label,
    codec: CODECS[primary.input.codecIdx].value,
    complexity: COMPLEXITIES[primary.input.complexityIdx].tier,
    vms: input.vms || null,
    retention_days: input.retentionDays,
    bandwidth_mbps: Number(totals.bandwidthMbps.toFixed(2)),
    storage_tb: Number((totals.storageGb / GB_PER_TB).toFixed(2)),
    recommended_product_id: recommendation.winner.sku,
    recommended_units: recommendation.winner.units,
    total_list_price_usd: Number(recommendation.winner.totalCostUsd.toFixed(2)),
    groups_payload: {
      retentionDays: input.retentionDays,
      groups: computed.map((r) => ({
        name: r.input.name,
        cameras: r.input.cameras,
        resolutionIdx: r.input.resolutionIdx,
        resolutionLabel: RESOLUTIONS[r.input.resolutionIdx].label,
        codec: CODECS[r.input.codecIdx].value,
        complexity: COMPLEXITIES[r.input.complexityIdx].tier,
        fps: r.input.fps,
        recordingPercent: r.input.recordingPercent,
        motionPercent: r.input.motionPercent,
        computed: r.computed,
      })),
    },
  };

  const { data: inserted, error: insertError } = await supabase
    .from("submissions")
    .insert(submissionRow)
    .select("id")
    .single();
  if (insertError || !inserted) {
    return {
      status: "error",
      error: `Failed to save submission: ${insertError?.message ?? "unknown error"}`,
    };
  }

  // Look up partner display fields via the admin client so we don't depend on
  // the user-scoped RLS view returning a row in every edge case.
  let partnerInfo = { companyName: "(unknown)", contactName: "(unknown)" };
  try {
    const admin = createSupabaseAdminClient();
    const { data: partnerRow } = await admin
      .from("partners")
      .select("company_name, contact_name")
      .eq("id", user.id)
      .single();
    if (partnerRow) {
      partnerInfo = {
        companyName: partnerRow.company_name,
        contactName: partnerRow.contact_name,
      };
    }
  } catch {
    // Notification lookup failure must not block the submission.
  }

  // Render the PDF in-memory from the data we already have. The Route Handler
  // re-derives this view model from the persisted row; here we skip the
  // round-trip. A PDF render failure must not block submission or the email —
  // sales still gets the plain-text notification, and the partner can fetch
  // the PDF later from the Download button.
  const partnerEmail = user.email ?? undefined;
  const pdfInput: SubmissionPdfInput = {
    generatedAt: new Date(),
    submissionId: inserted.id,
    partner: {
      companyName: partnerInfo.companyName,
      contactName: partnerInfo.contactName,
      email: user.email ?? "(no email on file)",
    },
    projectName: submissionRow.project_name,
    vms: submissionRow.vms,
    retentionDays: input.retentionDays,
    totals: {
      cameras: totals.cameras,
      bandwidthMbps: totals.bandwidthMbps,
      storageGb: totals.storageGb,
    },
    groups: computed.map((r) => ({
      name: r.input.name,
      cameras: r.input.cameras,
      resolutionLabel: RESOLUTIONS[r.input.resolutionIdx].label,
      codec: CODECS[r.input.codecIdx].value,
      complexity: COMPLEXITIES[r.input.complexityIdx].tier,
      fps: r.input.fps,
      hoursPerDay: Math.round((r.input.recordingPercent / 100) * 24),
      motionPercent: r.input.motionPercent,
      bandwidthMbps: r.computed.bandwidthMbps,
      storageGb: r.computed.storageGb,
    })),
    recommendation: (() => {
      // After the SKU-PK migration the winner candidate carries product_name,
      // productGroup, and covered capacity directly — no second lookup needed.
      const winnerSpec = specBySku.get(recommendation.winner.sku);
      return {
        units: recommendation.winner.units,
        modelCode: recommendation.winner.productGroup,
        productDescription: recommendation.winner.productName,
        coveredCameras: winnerSpec
          ? recommendation.winner.units * winnerSpec.maxCameras
          : recommendation.winner.coveredCameras,
        coveredStorageTb: winnerSpec
          ? recommendation.winner.units * winnerSpec.maxStorageTb
          : recommendation.winner.coveredStorageTb,
        warnings: recommendation.warnings,
      };
    })(),
  };

  let pdfBuffer: Buffer | undefined;
  try {
    pdfBuffer = await renderSubmissionPdfBuffer(pdfInput);
  } catch (err) {
    console.error("submission PDF render failed", err);
  }

  try {
    await sendSubmissionNotification({
      partner: { ...partnerInfo, email: user.email ?? "(no email on file)" },
      projectName: submissionRow.project_name,
      totals: {
        cameras: totals.cameras,
        bandwidthMbps: totals.bandwidthMbps,
        storageGb: totals.storageGb,
        retentionDays: input.retentionDays,
      },
      vms: submissionRow.vms,
      recommendation,
      submissionId: inserted.id,
      pdfBuffer,
      pdfFilename: pdfBuffer ? pdfFilename(pdfInput) : undefined,
      partnerEmail,
    });
    await supabase
      .from("submissions")
      .update({ email_sent_at: new Date().toISOString() })
      .eq("id", inserted.id);
  } catch (err) {
    // Sales notification failure is logged on the server but not surfaced to
    // the partner — their submission persisted and admins can re-send later.
    console.error("submission notification failed", err);
  }

  // Pipedrive Deal creation. Pipedrive failure must not regress submission
  // persist, PDF render, or email send — submission success is already
  // committed to the client by this point. ADR 0020.
  try {
    const { dealId } = await createDealFromSubmission(
      {
        submissionId: inserted.id,
        projectName: submissionRow.project_name,
        vms: submissionRow.vms,
        retentionDays: input.retentionDays,
        totals: {
          cameras: totals.cameras,
          bandwidthMbps: totals.bandwidthMbps,
          storageGb: totals.storageGb,
        },
        primaryGroup: {
          resolutionLabel: RESOLUTIONS[primary.input.resolutionIdx].label,
          codec: CODECS[primary.input.codecIdx].value,
          complexity: COMPLEXITIES[primary.input.complexityIdx].tier,
          fps: primary.input.fps,
          recordingPercent: primary.input.recordingPercent,
          motionPercent: primary.input.motionPercent,
        },
      },
      recommendation,
      {
        companyName: partnerInfo.companyName,
        contactName: partnerInfo.contactName,
        email: user.email ?? "(no email on file)",
      },
    );
    await supabase
      .from("submissions")
      .update({ pipedrive_deal_id: dealId })
      .eq("id", inserted.id);
  } catch (err) {
    console.error("pipedrive deal creation failed", { submissionId: inserted.id, error: err });
  }

  return {
    status: "ok",
    submissionId: inserted.id,
    recommendation: {
      winner: recommendation.winner,
      alternatives: recommendation.alternatives,
      warnings: recommendation.warnings,
      totals,
    },
  };
}
