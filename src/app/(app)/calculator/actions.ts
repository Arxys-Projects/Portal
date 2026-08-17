"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  CODECS,
  COMPLEXITIES,
  RESOLUTIONS,
  UTILIZATION_DEFAULT_PCT,
  UTILIZATION_MAX_PCT,
  UTILIZATION_MIN_PCT,
  VMS_OPTIONS,
} from "@/lib/calculator/tables";
import {
  CALC_VERSION,
  computeGroup,
  retentionSummary,
  vsrLoad,
  type GroupInput,
} from "@/lib/calculator/compute";
import { INPUT_STATE_VERSION } from "@/lib/calculator/rehydrate";
import { recommend } from "@/lib/recommend/algorithm";
import { loadCandidateSpecs } from "@/lib/recommend/candidates";
import { GB_PER_TB, type ServerSpec, type RecommendationResult } from "@/lib/recommend/types";
import { sendSubmissionNotification } from "@/lib/email/submission-notification";
import { buildServerSpec, pdfFilename, renderSubmissionPdfBuffer } from "@/lib/pdf/render";
import { loadHeroDataUri, loadLogoDataUri } from "@/lib/pdf/assets";
import type { SubmissionPdfInput } from "@/lib/pdf/types";
import {
  createDealFromSubmission,
  updateDealFromRevision,
  isDealUneditableError,
} from "@/lib/pipedrive/deal";
import { dbError } from "@/lib/errors/safe-message";

const groupSchema = z.object({
  name: z.string().trim().max(80).default(""),
  cameras: z.number().int().min(1).max(9999),
  resolutionIdx: z.number().int().min(0).max(RESOLUTIONS.length - 1),
  codecIdx: z.number().int().min(0).max(CODECS.length - 1),
  complexityIdx: z.number().int().min(0).max(COMPLEXITIES.length - 1),
  fps: z.number().int().min(1).max(60),
  // Recording mode: Continuous (writes every operating hour) vs Motion-triggered
  // (writes motion% of them). ADR 0125 — the mode IS the duty cycle; Continuous
  // means 1.0 in the math regardless of what motionPercent carries.
  recordingMode: z.enum(["constant", "motion"]).default("constant"),
  // Operation Hours, encoded as a percent of the day = (hours / 24) × 100.
  recordingPercent: z.number().int().min(1).max(100),
  // Motion/Event % — the recording duty cycle, applied EXACTLY with no idle
  // floor (ADR 0125). The 20–100 clamp here and at the UI is now the only limit
  // on how aggressive a user can be: the old 0.2 math-side floor is gone.
  motionPercent: z.number().int().min(20).max(100),
  // ADR 0132 — per-group retention. Optional with NO default: a stale client tab
  // that predates the field sends nothing, and the resolver below falls back to
  // the submission-level value, which is precisely what such a payload meant. A
  // zod default would have to be a constant and would silently override the
  // project's own setting.
  retentionDays: z.number().int().min(1).max(730).optional(),
  // Phase 10 Step 3 — camera-model picker. `cameras` above stays the engine
  // input and equals units × sensorsPerCamera only on the model-loaded path;
  // these five fields are banked for rehydration + display, never read by the
  // engine. All default cleanly on absent, so a pre-feature client payload
  // parses unchanged (no INPUT_STATE_VERSION bump needed). cameraVendor is left
  // a permissive string rather than an enum so a future vendor never hard-fails
  // an otherwise-valid submit.
  cameraVendor: z.string().trim().max(20).nullable().optional().default(null),
  cameraModel: z.string().trim().max(120).nullable().optional().default(null),
  units: z.number().int().min(1).max(9999).optional().default(1),
  sensorsPerCamera: z.number().int().min(1).max(64).optional().default(1),
  cameraModelModified: z.boolean().optional().default(false),
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
  // The PROJECT-level retention. Since ADR 0132 this is the value a group with no
  // retention of its own inherits, not the value the sizing math reads — that is
  // per group. Kept required: it is still the project default the form edits and
  // the fallback every legacy payload relies on.
  retentionDays: z.number().int().min(1).max(730),
  // Max disk utilization % — THE ONE BUFFER (ADR 0126). Per project. Optional so
  // a stale client tab still submits; it lands on the default, which is also the
  // least-margin end of the range, so an omitted value can never quietly inflate
  // a quote.
  utilizationPct: z
    .number()
    .int()
    .min(UTILIZATION_MIN_PCT)
    .max(UTILIZATION_MAX_PCT)
    .optional()
    .default(UTILIZATION_DEFAULT_PCT),
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
  totals: {
    cameras: number;
    bandwidthMbps: number;
    // Required decimal RAID-net capacity — buffer and binary charge included.
    storageGb: number;
    // Recorded data only, the Milestone-comparable figure.
    recordedStorageGb: number;
  };
  // The Max disk utilization the totals above were sized at (ADR 0126).
  utilizationPct: number;
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
  // ADR 0118 — pipedrive_user_id rides along on this same read so the deal
  // owner can be routed to the caller below without a second query.
  const { data: callerStatus } = await supabase
    .from("partners")
    .select("status, is_internal, pipedrive_user_id")
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

  // Internal users must always file a submission against a specific partner or
  // company — a deal with no target attribution is an orphan that sales cannot
  // act on. The on-behalf block above either binds onBehalfPartnerId (picker
  // path) or onBehalfCompanyName (fallback path); if both are still null after
  // resolution (id not found / inactive, or company field blank), refuse here.
  if (callerStatus.is_internal && !onBehalfPartnerId && !onBehalfCompanyName) {
    return {
      status: "error",
      error: "Company name is required for internal submissions.",
    };
  }

  // ADR 0093 step 2 — validated revision source. RLS-scoped read: a caller can
  // only link lineage to a source row they can see, so a guessed/foreign id
  // silently fails to attach rather than leaking or binding cross-partner.
  // Fetched once here and reused below for the Pipedrive-inherit check, so a
  // revision costs one extra query total, not two.
  let sourceSubmission: { id: string; pipedrive_deal_id: number | null } | null = null;
  if (input.isRevision && input.sourceSubmissionId) {
    const { data } = await supabase
      .from("submissions")
      .select("id, pipedrive_deal_id")
      .eq("id", input.sourceSubmissionId)
      .maybeSingle();
    if (data) sourceSubmission = data as { id: string; pipedrive_deal_id: number | null };
  }

  // ADR 0093 guardrail — an on-behalf submission has no lineage tracking
  // (ADR 0039: every revision is a brand-new row), so two internal reps can
  // independently file for the same customer without either seeing the
  // other's row. Warn (never block) when another `open` submission for the
  // same on-behalf target already exists and isn't this submit's declared
  // revision source. Scoped to on-behalf submissions only — a partner's own
  // normal revision flow legitimately leaves its source row open and must not
  // trigger this on every revise.
  let duplicateWarnings: string[] = [];
  if (onBehalfPartnerId || onBehalfCompanyName) {
    const sinceIso = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    let dupQuery = supabase
      .from("submissions")
      .select("id, project_name, created_at")
      .eq("status", "open")
      .gte("created_at", sinceIso);
    dupQuery = onBehalfPartnerId
      ? dupQuery.eq("on_behalf_of_partner_id", onBehalfPartnerId)
      : dupQuery.ilike("on_behalf_of_company_name", onBehalfCompanyName!.trim());
    const { data: existingOpen } = await dupQuery;
    const others = (existingOpen ?? []).filter((r) => r.id !== sourceSubmission?.id);
    if (others.length > 0) {
      const names = others.map((r) => `"${r.project_name ?? "(untitled)"}"`).join(", ");
      duplicateWarnings = [
        `${others.length} other open submission${others.length > 1 ? "s" : ""} already ` +
          `exist${others.length > 1 ? "" : "s"} for this customer from the last 14 days ` +
          `(${names}) — check the admin Grouped view before this creates a second Pipedrive deal.`,
      ];
    }
  }

  // Server-side recompute. Client totals are never trusted.
  //
  // Continuous recording writes every operating hour, so motion% is pinned to
  // 100 server-side regardless of any value a scripted client sends. Under
  // ADR 0125 the pin no longer changes the math (`dutyCycle` returns 1.0 for
  // "constant" whatever motionPercent says) — it is kept so the banked state,
  // PDF, and Pipedrive sync all display the figure the math actually used.
  for (const g of input.groups) {
    if (g.recordingMode === "constant") g.motionPercent = 100;
    // ADR 0132 — resolve each group's retention ONCE, here, before anything
    // computes or banks. A group that sent none inherits the project value, and
    // from this point on `g.retentionDays` is the effective figure the math used,
    // so the engine, groups_payload, input_state, the PDF and the deal all state
    // the same number by construction rather than by three separate `??` chains.
    g.retentionDays ??= input.retentionDays;
  }
  const computed = input.groups.map((g) => {
    const gi: GroupInput = {
      cameras: g.cameras,
      resolution: RESOLUTIONS[g.resolutionIdx],
      codec: CODECS[g.codecIdx],
      complexity: COMPLEXITIES[g.complexityIdx],
      fps: g.fps,
      retentionDays: g.retentionDays!,
      recordingMode: g.recordingMode,
      recordingPercent: g.recordingPercent,
      motionPercent: g.motionPercent,
    };
    return {
      input: g,
      computed: computeGroup(gi, input.utilizationPct),
    };
  });
  const totals = computed.reduce(
    (acc, r) => {
      acc.cameras += r.input.cameras;
      acc.bandwidthMbps += r.computed.bandwidthMbps;
      acc.recordedStorageGb += r.computed.recordedStorageGb;
      acc.storageGb += r.computed.storageGb;
      return acc;
    },
    { cameras: 0, bandwidthMbps: 0, recordedStorageGb: 0, storageGb: 0 },
  );

  // ADR 0132 — what the scalar `retention_days` column means from calc_version 3
  // on: the LONGEST group retention, not the project default. For a uniform
  // project (every row before this change, and most after) the two are the same
  // number. For a mixed one, the max is the only single figure that is never an
  // under-statement of what the system has to hold, which is what the column
  // feeds — the admin list, the Pipedrive "Retention Days" field, and a relink.
  // Per-group values live in groups_payload; surfaces that can show a range do.
  const retention = retentionSummary(input.groups.map((g) => g.retentionDays!));

  // Candidate pool — shared with the Quick Calc preview (ADR 0082) so both
  // tools size against exactly the same SKU set (query filters + net-usable
  // storage derivation live in loadCandidateSpecs; ADR 0068).
  const pool = await loadCandidateSpecs(supabase);
  if (pool.status === "db-error") {
    return { status: "error", error: dbError(pool.error, pool.context) };
  }
  if (pool.status === "empty") {
    return { status: "error", error: "No active numeric-priced SKUs are seeded. Contact an administrator." };
  }
  const specs = pool.specs;
  const specBySku = new Map<string, ServerSpec>(specs.map((s) => [s.sku, s]));

  // Resolution-normalized camera load (VSR) for the camera-capacity check —
  // summed over groups from native resolution, independent of the bandwidth /
  // storage math which stays per-group (ADR 0068).
  const totalVsr = input.groups.reduce(
    (sum, g) => sum + vsrLoad(g.cameras, RESOLUTIONS[g.resolutionIdx]),
    0,
  );

  const recommendation = recommend(
    { totalCameras: totals.cameras, totalStorageGb: totals.storageGb, totalVsr },
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
      utilizationPct: input.utilizationPct,
      groups: input.groups,
      addOnFailoverRecorder: input.addOnFailoverRecorder,
      addOnManagementServer: input.addOnManagementServer,
    },
    // The sizing model this row was produced by (see CALC_VERSION). Version 1 is
    // everything before Phase A; 2 is the re-anchored engine with the single Max
    // disk utilization buffer and a +5% audio/metadata term; 3 drops that term,
    // tightens the buffer default to 88%, and makes retention per group. Both
    // storage_tb and retention_days change MEANING across those boundaries (see
    // below), so neither column is comparable without this stamp.
    calc_version: CALC_VERSION,
    max_disk_utilization_pct: input.utilizationPct,
    // ADR 0081: new submissions start Open (the default state). Won/Lost are
    // set manually. Matches the DB column default; set explicitly for clarity.
    status: "open",
    // ADR 0093 step 2 — revision lineage. Only the validated source (see
    // sourceSubmission above) is trusted, never the raw client-sent id.
    parent_submission_id: sourceSubmission?.id ?? null,
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
    // CHANGED MEANING at calc_version 3 (ADR 0132): the longest group retention,
    // not the project default. Identical on a uniform project. See `retention`
    // above for why max rather than the default.
    retention_days: retention.max,
    bandwidth_mbps: Number(totals.bandwidthMbps.toFixed(2)),
    // CHANGED MEANING at calc_version 2 (ADR 0126/0127). It used to bank raw
    // video × 1.2, with the recommender's second ×1.2 applied later and the
    // decimal→binary conversion never charged at all. It now banks required
    // decimal RAID-net capacity: recorded data with the buffer and the binary
    // charge already in it, which is exactly what the recommender sizes on.
    // Already-issued documents are safe — they render from banked values and
    // nothing recomputes (audit §Q7) — but the column is not comparable across
    // the boundary without calc_version.
    storage_tb: Number((totals.storageGb / GB_PER_TB).toFixed(2)),
    // The Milestone-comparable figure: recorded data, no buffer, no binary
    // charge. Banked so a partner can set it beside a Milestone or Genetec
    // proposal's "Total storage" line without re-deriving it.
    recorded_storage_tb: Number((totals.recordedStorageGb / GB_PER_TB).toFixed(2)),
    recommended_product_id: recommendation.winner.sku,
    recommended_units: recommendation.winner.units,
    total_list_price_usd: Number(recommendation.winner.totalCostUsd.toFixed(2)),
    groups_payload: {
      // The project-level default a new group inherits (ADR 0132). Kept for
      // readers that want the project setting; the per-group `retentionDays`
      // inside each group below is what the math used.
      retentionDays: input.retentionDays,
      // Banked alongside the groups so every document rendered from this row can
      // state the buffer it was sized at without reaching into input_state.
      utilizationPct: input.utilizationPct,
      calcVersion: CALC_VERSION,
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
        // The RESOLVED retention this group was sized at (ADR 0132) — never the
        // project default unless they happen to agree. Every render surface reads
        // it from here.
        retentionDays: r.input.retentionDays,
        recordingMode: r.input.recordingMode,
        recordingPercent: r.input.recordingPercent,
        motionPercent: r.input.motionPercent,
        // Phase 10 Step 3 — resolved camera-model provenance for the display
        // path (PDF / submission view, Step 4) and preferred on rehydration.
        // `cameras` above already carries the derived count; these explain it.
        cameraVendor: r.input.cameraVendor ?? null,
        cameraModel: r.input.cameraModel ?? null,
        units: r.input.units,
        sensorsPerCamera: r.input.sensorsPerCamera,
        cameraModelModified: r.input.cameraModelModified,
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
    recommendation.winner.unitMsrp,
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
    // Matches the banked column: the longest group retention. The template
    // derives its own uniform/range wording from the per-group figures below.
    retentionDays: retention.max,
    totals: {
      cameras: totals.cameras,
      bandwidthMbps: totals.bandwidthMbps,
      storageGb: totals.storageGb,
    },
    storageTb: totals.storageGb / GB_PER_TB,
    bandwidthMbps: totals.bandwidthMbps,
    calcVersion: CALC_VERSION,
    recordedStorageTb: totals.recordedStorageGb / GB_PER_TB,
    maxDiskUtilizationPct: input.utilizationPct,
    groups: computed.map((r) => ({
      name: r.input.name,
      cameras: r.input.cameras,
      resolutionLabel: RESOLUTIONS[r.input.resolutionIdx].label,
      codec: CODECS[r.input.codecIdx].value,
      complexityLabel: COMPLEXITIES[r.input.complexityIdx].label,
      recordingMode: r.input.recordingMode,
      fps: r.input.fps,
      retentionDays: r.input.retentionDays!,
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
        // Net-usable, matching the capacity bar denominator (ADR 0068) — never
        // raw nameplate.
        coveredStorageTb: winnerSpec
          ? recommendation.winner.units * winnerSpec.usableStorageTb
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
          recordedStorageGb: totals.recordedStorageGb,
          // A range on a mixed-retention project ("7–90 days"), a bare figure on
          // a uniform one (ADR 0132) — sales reads this line to size the deal.
          retentionLabel: retention.label,
        },
        utilizationPct: input.utilizationPct,
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
    // The Pipedrive "Retention Days" field is a single number, so it gets the
    // longest group retention — the same value banked on the row, so a relink
    // rebuilt from that column reproduces this deal exactly (ADR 0132).
    retentionDays: retention.max,
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
  // For an on-behalf calc the deal is billed against the TARGET partner (org +
  // person); the internal rep who ran it is credited via a pinned note either
  // way (ADR 0045) and, when they have a stored Pipedrive user id, also as the
  // deal owner (ADR 0118 — see creatorPipedriveUserId below). A normal calc
  // uses the creator's own record.
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
  // ADR 0118 — route the Pipedrive deal owner to whoever is actually logged in
  // and running this calc, when they have a stored Pipedrive user id (today,
  // only Andy and Richard do). Anyone else — Marcos, any other internal user,
  // every external partner — has no stored id and falls through to the
  // existing single-owner default inside resolveOwnerIdForCreator. Applies to
  // every submitter, on-behalf or not; a normal external partner's own calc
  // was already always owned by the default, so this changes nothing for them.
  const creatorPipedriveUserId = callerStatus.pipedrive_user_id ?? null;

  let pipedriveWarnings: string[] = [];
  try {
    let dealId: number | undefined;

    if (input.isRevision && sourceSubmission) {
      // RLS-scoped read already ran above (sourceSubmission): a partner can
      // only inherit a deal from a quote they own. A forbidden/missing source
      // row left sourceSubmission null → falls through to create, so a
      // guessed id can never attach to someone else's deal.
      const sourceDealId = sourceSubmission.pipedrive_deal_id;
      if (sourceDealId) {
        try {
          ({ dealId } = await updateDealFromRevision(sourceDealId, dealSubmission, recommendation));
        } catch (err) {
          // The source deal can no longer be edited — either gone (404) or
          // DELETED in Pipedrive (400 ERR_DEAL_DELETED; soft-deleted deals
          // never 404). Fall back to a fresh deal rather than re-throwing into
          // the outer catch, which used to leave the revision with no deal at
          // all. Anything else is a genuine failure and still propagates.
          if (isDealUneditableError(err)) {
            console.warn("pipedrive source deal uneditable — creating a fresh deal", {
              sourceDealId,
              submissionId: inserted.id,
            });
            ({ dealId } = await createDealFromSubmission(
              dealSubmission,
              recommendation,
              dealPartner,
              onBehalfNote,
              creatorPipedriveUserId,
            ));
          } else {
            throw err;
          }
        }
      }
    }

    if (dealId === undefined) {
      // onBehalfNote must be passed here too — it credits the internal rep on an
      // on-behalf deal (ADR 0045). Omitting it silently dropped that attribution
      // on every fresh on-behalf submission. creatorPipedriveUserId routes the
      // owner (ADR 0118) — independent of onBehalfNote, which stays regardless
      // of who ends up as owner.
      ({ dealId } = await createDealFromSubmission(
        dealSubmission,
        recommendation,
        dealPartner,
        onBehalfNote,
        creatorPipedriveUserId,
      ));
    }

    const { error: linkError } = await supabase
      .from("submissions")
      .update({ pipedrive_deal_id: dealId })
      .eq("id", inserted.id);
    if (linkError) throw linkError;
  } catch (err) {
    // Pipedrive failure must not fail the submission (ADR 0020) — but it must
    // not be INVISIBLE either. Leaving pipedrive_deal_id null with no signal is
    // how revisions silently stopped reaching the CRM; the submitter now gets a
    // warning through the same channel as the duplicate warning.
    console.error("pipedrive deal sync failed", { submissionId: inserted.id, error: err });
    pipedriveWarnings = [
      "This quote was saved, but it could NOT be linked to a Pipedrive deal — " +
        "sales will not see this revision in the CRM. Ask an admin to re-link it.",
    ];
  }

  return {
    status: "ok",
    submissionId: inserted.id,
    recommendation: {
      winner: recommendation.winner,
      alternatives: recommendation.alternatives,
      warnings: [...recommendation.warnings, ...duplicateWarnings, ...pipedriveWarnings],
      totals,
      utilizationPct: input.utilizationPct,
    },
  };
}

// Phase 10 Step 3 — camera-model typeahead. One match row for the picker.
// max_width / max_height are native pixels; the client maps them to a
// RESOLUTIONS bucket via mapPixelsToBucket (the single source of truth) for
// both the result-row label and the on-select fill.
export type CameraModelResult = {
  id: string;
  vendor: string;
  model: string;
  sensorCount: number;
  maxWidth: number;
  maxHeight: number;
};

// Authenticated read of camera_specs scoped to one vendor, matching model AND
// model_aliases as the user types. The alias match runs through the IMMUTABLE
// helper public.camera_aliases_text(model_aliases) inside the search_camera_specs
// RPC so the expression GIN trigram index (20260615000002) is used — a naive
// ILIKE on the array would not be index-backed. SECURITY INVOKER on the RPC
// keeps the read under the caller's RLS (camera_specs SELECT is open to
// authenticated). Matches the app's server-side data-access pattern; the client
// calls this action debounced. A query that fails or returns nothing yields [].
export async function searchCameraModels(
  vendor: string,
  query: string,
): Promise<CameraModelResult[]> {
  const v = (vendor ?? "").trim();
  const q = (query ?? "").trim();
  if (!v || q.length < 1) return [];

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase.rpc("search_camera_specs", {
    p_vendor: v,
    p_query: q,
    p_limit: 12,
  });
  if (error || !data) {
    if (error) console.error("camera model search failed", error);
    return [];
  }

  const rows = data as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id),
    vendor: String(row.vendor),
    model: String(row.model),
    sensorCount: Number(row.sensor_count),
    maxWidth: Number(row.max_width),
    maxHeight: Number(row.max_height),
  }));
}
