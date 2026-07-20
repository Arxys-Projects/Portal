"use server";

// Quick Calc preview (ADR 0082) — computes the recommended configuration for
// the fixed VSR-standard group WITHOUT saving anything. The save path is the
// full calculator's submitCalculation, called with the same fixed group, so
// nothing forks: preview and saved estimate always agree.

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RESOLUTIONS, CODECS, COMPLEXITIES } from "@/lib/calculator/tables";
import { computeGroup, vsrLoad, type GroupInput } from "@/lib/calculator/compute";
import { QUICK_CALC_GROUP } from "@/lib/calculator/quick-calc";
import { recommend } from "@/lib/recommend/algorithm";
import { loadCandidateSpecs } from "@/lib/recommend/candidates";
import { GB_PER_TB } from "@/lib/recommend/types";
import { dbError } from "@/lib/errors/safe-message";

const previewSchema = z.object({
  cameras: z.number().int().min(1).max(9999),
  retentionDays: z.number().int().min(1).max(730),
});

export type QuickCalcPreview =
  | { status: "error"; error: string }
  | {
      status: "ok";
      winner: {
        productGroup: string;
        productName: string;
        units: number;
        totalCostUsd: number;
        coveredCameras: number;
        coveredStorageTb: number;
      };
      totals: { cameras: number; bandwidthMbps: number; storageTb: number };
      warnings: string[];
    };

export async function quickCalcPreview(payload: unknown): Promise<QuickCalcPreview> {
  const parsed = previewSchema.safeParse(payload);
  if (!parsed.success) {
    return { status: "error", error: "Enter a camera-stream count and retention to size the system." };
  }
  const { cameras, retentionDays } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", error: "Your session has expired. Sign in and try again." };
  }

  const resolution = RESOLUTIONS[QUICK_CALC_GROUP.resolutionIdx];
  const gi: GroupInput = {
    cameras,
    resolution,
    codec: CODECS[QUICK_CALC_GROUP.codecIdx],
    complexity: COMPLEXITIES[QUICK_CALC_GROUP.complexityIdx],
    fps: QUICK_CALC_GROUP.fps,
    recordingPercent: QUICK_CALC_GROUP.recordingPercent,
    motionPercent: QUICK_CALC_GROUP.motionPercent,
  };
  const computed = computeGroup(gi, retentionDays);

  const pool = await loadCandidateSpecs(supabase);
  if (pool.status === "db-error") {
    return { status: "error", error: dbError(pool.error, pool.context) };
  }
  if (pool.status === "empty") {
    return { status: "error", error: "No active numeric-priced SKUs are seeded. Contact an administrator." };
  }

  try {
    const recommendation = recommend(
      {
        totalCameras: cameras,
        totalStorageGb: computed.storageGb,
        totalVsr: vsrLoad(cameras, resolution),
      },
      pool.specs,
    );
    const w = recommendation.winner;
    return {
      status: "ok",
      winner: {
        productGroup: w.productGroup,
        productName: w.productName,
        units: w.units,
        totalCostUsd: w.totalCostUsd,
        coveredCameras: w.coveredCameras,
        coveredStorageTb: w.coveredStorageTb,
      },
      totals: {
        cameras,
        bandwidthMbps: computed.bandwidthMbps,
        storageTb: computed.storageGb / GB_PER_TB,
      },
      warnings: recommendation.warnings,
    };
  } catch (err) {
    console.error("[quick-calc preview]", err);
    return {
      status: "error",
      error: "No configuration fits this size — contact Arxys sales for a custom configuration.",
    };
  }
}
