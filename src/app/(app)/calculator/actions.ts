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

  const { data: specRows, error: specError } = await supabase
    .from("server_specs")
    .select("product_id, model_code, max_cameras, max_storage_tb, products!inner(list_price_usd)")
    .eq("active", true);
  if (specError) {
    return { status: "error", error: `Failed to load server specs: ${specError.message}` };
  }
  if (!specRows || specRows.length === 0) {
    return { status: "error", error: "No active server specs are seeded. Contact an administrator." };
  }

  const specs: ServerSpec[] = specRows.map((row) => {
    const product = Array.isArray(row.products) ? row.products[0] : row.products;
    return {
      productId: row.product_id,
      modelCode: row.model_code,
      maxCameras: row.max_cameras,
      maxStorageTb: Number(row.max_storage_tb),
      listPriceUsd: Number(product?.list_price_usd ?? 0),
    };
  });

  const recommendation = recommend(
    { totalCameras: totals.cameras, totalStorageGb: totals.storageGb },
    specs,
  );

  // Primary group = the one with the most cameras (canonical resolution/codec/complexity).
  const primary = [...computed].sort((a, b) => b.input.cameras - a.input.cameras)[0];

  const submissionRow = {
    partner_id: user.id,
    project_name: input.projectName?.trim() || null,
    cameras_count: totals.cameras,
    resolution_code: RESOLUTIONS[primary.input.resolutionIdx].label,
    codec: CODECS[primary.input.codecIdx].value,
    complexity: COMPLEXITIES[primary.input.complexityIdx].tier,
    vms: input.vms || null,
    retention_days: input.retentionDays,
    bandwidth_mbps: Number(totals.bandwidthMbps.toFixed(2)),
    storage_tb: Number((totals.storageGb / GB_PER_TB).toFixed(2)),
    recommended_product_id: recommendation.winner.productId,
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
