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
import { INPUT_STATE_VERSION } from "@/lib/calculator/rehydrate";
import { recommend } from "@/lib/recommend/algorithm";
import { GB_PER_TB, type ServerSpec, type RecommendationResult } from "@/lib/recommend/types";
import { sendSubmissionNotification } from "@/lib/email/submission-notification";
import { buildServerSpec, pdfFilename, renderSubmissionPdfBuffer } from "@/lib/pdf/render";
import { loadHeroDataUri, loadLogoDataUri } from "@/lib/pdf/assets";
import type { SubmissionPdfInput } from "@/lib/pdf/types";
import { createDealFromSubmission, updateDealFromRevision } from "@/lib/pipedrive/deal";
import { PipedriveError } from "@/lib/pipedrive/client";
import { dbError } from "@/lib/errors/safe-message";

const groupSchema = z.object({
  name: z.string().trim().max(80).default(""),
  cameras: z.number().int().min(1).max(9999),
  resolutionIdx: z.number().int().min(0).max(RESOLUTIONS.length - 1),
  codecIdx: z.number().int().min(0).max(CODECS.length - 1),
  complexityIdx: z.number().int().min(0).max(COMPLEXITIES.length - 1),
  fps: z.number().int().min(1).max(60),
  // Recording mode: Constant (24/7 at full event rate) vs Motion-only (records
  // full hours but at a reduced bitrate during quiet periods). The client
  // resolves motionPercent from this (Constant ⇒ 100); old rows default here.
  recordingMode: z.enum(["constant", "motion"]).default("constant"),
  // Operation Hours, encoded as a percent of the day = (hours / 24) × 100.
  recordingPercent: z.number().int().min(1).max(100),
  // Motion/Event % — clamped 20–100 at the UI; the 0.2 idle floor in
  // applyMotionAdjustment is the math-side safety net if a bad value slips in.
  motionPercent: z.number().int().min(20).max(100),
});

const submissionSchema = z.object({
  projectName: z.string().trim().max(50).optional().nullable(),
  // Phase 7 Step 1 / Phase 8 — internal-only on-behalf target. Two mutually
  // exclusive paths, honored server-side only for internal callers (ignored
  // otherwise; the picker never renders for external partners):
  //   * onBehalfOfPartnerId  — a chosen onboarded partner user; binds the FK,
  //     which is what grants that user portal visibility into the row.
  //   * onBehalfOfCompanyName — a not-yet-onboarded company; org-only, no FK,
  //     no visibility. The DB CHECK enforces at most one of the two columns.
  onBehalfOfPartnerId: z.string().uuid().optional().nullable(),
  onBehalfOfCompanyName: z.string().trim().max(120).optional().nullable(),
  vms: z.string().max(40).optional().nullable(),
  retentionDays: z.number().int().min(1).max(730),
  groups: z.array(groupSchema).min(1).max(50),
  addOnFailoverRecorder: z.boolean().optional().default(false),
  addOnManagementServer: z.boolean().optional().default(false),
  // Revision flags (Phase 4 Step 3) — submit-flow control, not banked into
  // input_state. When isRevision is set, the source quote's Pipedrive deal is
  // updated in place rather than a new deal created (see ADR 0040).
  isRevision: z.boolean().optional().default(false),
  sourceSubmissionId: z.string().uuid().optional().nullable(),
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
    .select("status, is_internal")
    .eq("id", user.id)
    .maybeSingle();
  if (!callerStatus || callerStatus.status !== "active") {
    return {
      status: "error",
      error: "Your account is not active. Sign out and back in, or contact your administrator.",
    };
  }

  // Phase 7 Step 1 / Phase 8 — resolve the on-behalf-of target. Authorization is
  // enforced here, server-side: only an internal user (is_internal) can direct a
  // calc at another partner. The picker sends a partner-user id, which binds the
  // FK (granting that user portal visibility and attaching the deal to their
  // person); the not-yet-onboarded fallback sends a company name, banked as
  // free text with the deal created against the org only. The two are mutually
  // exclusive, matching the DB CHECK (at most one column set).
  const admin = createSupabaseAdminClient();
  let onBehalfPartnerId: string | null = null;
  let onBehalfCompanyName: string | null = null;
  // Pipedrive identity to bill the deal against — the target when on-behalf,
  // otherwise (left null) the creator's own partner record, resolved below.
  let dealTarget: { companyName: string; contactName: string | null; email: string | null } | null =
    null;

  if (callerStatus.is_internal && input.onBehalfOfPartnerId) {
    // Picker path: trust the id only after confirming it is a real, active,
    // non-internal partner — the same eligibility the picker filters on. An
    // ineligible or unknown id is dropped silently (no FK bound), so a crafted
    // POST can't bind an arbitrary or stale target.
    const { data: target } = await admin
      .from("partners")
      .select("id, company_name, contact_name, status, is_internal")
      .eq("id", input.onBehalfOfPartnerId)
      .maybeSingle();
    if (target && target.status === "active" && !target.is_internal) {
      // Bind the FK only (the "at most one set" invariant — grouped views
      // resolve the display name from the partners table).
      onBehalfPartnerId = target.id as string;
      let targetEmail: string | null = null;
      try {
        const u = await admin.auth.admin.getUserById(target.id as string);
        targetEmail = u.data.user?.email ?? null;
      } catch {
        // No email → deal attaches the org only; never blocks the submission.
      }
      dealTarget = {
        companyName: target.company_name as string,
        contactName: target.contact_name as string,
        email: targetEmail,
      };
    }
  } else if (callerStatus.is_internal && input.onBehalfOfCompanyName) {
    // Fallback: a company with no portal user yet. Org-only, no FK, no
    // visibility — there is no user to grant it to.
    const name = input.onBehalfOfCompanyName.trim();
    if (name) {
      onBehalfCompanyName = name;
      dealTarget = { companyName: name, contactName: null, email: null };
    }
  }

  // Server-side recompute. Client totals are never trusted.
  //
  // Constant recording always writes at the full event rate, so motion% is
  // pinned to 100 server-side regardless of any value a scripted client sends;
  // only Motion-only honors the entered motion%. The legitimate form already
  // sends 100 under Constant, so this only bites a hand-crafted POST trying to
  // under-size. We normalize input.groups so the banked state, PDF, and
  // Pipedrive sync all agree with the figure the math used.
  for (const g of input.groups) {
    if (g.recordingMode === "constant") g.motionPercent = 100;
  }
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
    return { status: "error", error: dbError(productError, "load products") };
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
    // Bank only the calculator inputs (plus the version stamp) — the revision
    // flags are submit-flow control, not part of the reconstructable state.
    // normalizeInputState() reads `version` to know which defaults to apply.
    input_state: {
      version: INPUT_STATE_VERSION,
      projectName: input.projectName ?? null,
      vms: input.vms ?? null,
      retentionDays: input.retentionDays,
      groups: input.groups,
      addOnFailoverRecorder: input.addOnFailoverRecorder,
      addOnManagementServer: input.addOnManagementServer,
    },
    // Phase 3 Step 5: new submissions start in 'draft' so the partner sees a
    // status badge immediately. Pre-Step-5 rows stay NULL (treated as draft).
    status: "draft",
    // partner_id stays = creator (auth.uid()); the on-behalf columns are what
    // redirect grouping + the Pipedrive deal to the target partner.
    on_behalf_of_partner_id: onBehalfPartnerId,
    on_behalf_of_company_name: onBehalfCompanyName,
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
        // `complexity` stays the tier (low/med/high) for the scalar column and
        // legacy readers; `complexityLabel` is the unique label so rehydration
        // recovers the exact 1-of-6 level (tier alone now collapses 2→1).
        complexity: COMPLEXITIES[r.input.complexityIdx].tier,
        complexityLabel: COMPLEXITIES[r.input.complexityIdx].label,
        fps: r.input.fps,
        recordingMode: r.input.recordingMode,
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
      error: dbError(insertError, "save submission"),
    };
  }

  // Look up partner display fields via the admin client so we don't depend on
  // the user-scoped RLS view returning a row in every edge case.
  let partnerInfo = { companyName: "(unknown)", contactName: "(unknown)" };
  try {
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
  const pdfServerSpec = await buildServerSpec(
    supabase,
    recommendation.winner.sku,
    recommendation.winner.productGroup,
  );
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
    storageTb: totals.storageGb / GB_PER_TB,
    bandwidthMbps: totals.bandwidthMbps,
    groups: computed.map((r) => ({
      name: r.input.name,
      cameras: r.input.cameras,
      resolutionLabel: RESOLUTIONS[r.input.resolutionIdx].label,
      codec: CODECS[r.input.codecIdx].value,
      complexityLabel: COMPLEXITIES[r.input.complexityIdx].label,
      recordingMode: r.input.recordingMode,
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
    serverSpec: pdfServerSpec,
    logoDataUri: loadLogoDataUri(),
    heroDataUri: loadHeroDataUri(recommendation.winner.productGroup),
  };

  // A fresh submit renders the PDF and emails sales. A revision deliberately
  // sends NO new sales-notification email (the deal is updated in place — see
  // ADR 0040), so both the render and the send are skipped for it.
  if (!input.isRevision) {
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
  }

  // Pipedrive Deal sync. Pipedrive failure must not regress submission persist,
  // PDF render, or email send — submission success is already committed to the
  // client by this point. ADR 0020.
  //
  // A revision updates the source quote's deal IN PLACE (ADR 0040) — writing
  // only calculator-derived fields, never stage/owner/pipeline — and links the
  // new submission row to that same deal. A fresh submit (or a revision whose
  // source has no deal / whose deal 404s) creates a new deal instead.
  const dealSubmission = {
    submissionId: inserted.id,
    // Same date the PDF filename uses, so the deal title and the file agree.
    submissionDate: `${pdfInput.generatedAt.getFullYear()}-${String(
      pdfInput.generatedAt.getMonth() + 1,
    ).padStart(2, "0")}-${String(pdfInput.generatedAt.getDate()).padStart(2, "0")}`,
    projectName: submissionRow.project_name,
    vms: submissionRow.vms,
    retentionDays: input.retentionDays,
    totals: {
      cameras: totals.cameras,
      bandwidthMbps: totals.bandwidthMbps,
      storageGb: totals.storageGb,
    },
    groups: computed.map((r) => ({
      resolutionLabel: RESOLUTIONS[r.input.resolutionIdx].label,
      codec: CODECS[r.input.codecIdx].value,
      complexity: COMPLEXITIES[r.input.complexityIdx].tier,
      fps: r.input.fps,
      recordingPercent: r.input.recordingPercent,
      motionPercent: r.input.motionPercent,
      cameras: r.input.cameras,
    })),
    addOnFailoverRecorder: input.addOnFailoverRecorder,
    addOnManagementServer: input.addOnManagementServer,
  };
  // For an on-behalf calc the deal is billed against the TARGET partner; the
  // internal rep who ran it is credited via a pinned note rather than the
  // Pipedrive owner field (ADR 0048). A normal calc uses the creator's record.
  const dealPartner = dealTarget
    ? {
        companyName: dealTarget.companyName,
        contactName: dealTarget.contactName ?? undefined,
        email: dealTarget.email ?? undefined,
      }
    : {
        companyName: partnerInfo.companyName,
        contactName: partnerInfo.contactName,
        email: user.email ?? "(no email on file)",
      };
  const onBehalfNote = dealTarget
    ? [
        `Created on behalf of: ${dealTarget.companyName}`,
        `By Arxys rep: ${partnerInfo.contactName} (${user.email ?? "no email"})`,
        `Portal user id: ${user.id}`,
      ].join("\n")
    : null;

  try {
    let dealId: number | undefined;

    if (input.isRevision && input.sourceSubmissionId) {
      // RLS-scoped read: a partner can only inherit a deal from a quote they
      // own. A forbidden/missing source row yields null → falls through to
      // create, so a guessed id can never attach to someone else's deal.
      const { data: source } = await supabase
        .from("submissions")
        .select("pipedrive_deal_id")
        .eq("id", input.sourceSubmissionId)
        .maybeSingle();
      const sourceDealId = source?.pipedrive_deal_id as number | null | undefined;
      if (sourceDealId) {
        try {
          ({ dealId } = await updateDealFromRevision(sourceDealId, dealSubmission, recommendation));
        } catch (err) {
          // The deal was deleted in Pipedrive since the source quote was filed.
          // Fall back to a fresh deal; re-throw anything else to the outer log.
          if (err instanceof PipedriveError && err.status === 404) {
            ({ dealId } = await createDealFromSubmission(dealSubmission, recommendation, dealPartner, onBehalfNote));
          } else {
            throw err;
          }
        }
      }
    }

    if (dealId === undefined) {
      ({ dealId } = await createDealFromSubmission(dealSubmission, recommendation, dealPartner));
    }

    await supabase
      .from("submissions")
      .update({ pipedrive_deal_id: dealId })
      .eq("id", inserted.id);
  } catch (err) {
    console.error("pipedrive deal sync failed", { submissionId: inserted.id, error: err });
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
