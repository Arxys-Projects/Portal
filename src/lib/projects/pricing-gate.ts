import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { listPipedriveProducts } from "@/lib/pipedrive/product-api";
import type { PdProduct } from "@/lib/pipedrive/product-sync";
import { listDealProductsV2, type PdV2DealProduct } from "@/lib/pipedrive/project-deal-api";
import { diffBomAgainstDeal, fingerprintGateLines, sameGateLines, type DealLinesDiff } from "./deal-lines";
import {
  checkActor,
  claimForDeal,
  codeMap,
  dbRefusal,
  isRefusal,
  loadCalc,
  pipedriveRefusal,
  refuse,
  type CalcContext,
  type Refusal,
} from "./project-deal";
import type { DealLineFingerprint } from "./types";

// Project Portal Step 6 (ADR 0176): the rep confirms a portal-built deal's
// pricing, and Project Quote generation for that deal checks the confirmation
// against the deal's lines as they are now.
//
// * Behind PROJECT_QUOTE_GATE ("true" turns it on; default off). Off, nothing
//   here runs and generation behaves as before.
// * "Portal-built" comes only from the portal's own records: a
//   project_deal_claims row or deal_line_syncs rows for the deal. Never a
//   Pipedrive field or a title. A failed read refuses; it never falls through
//   to the legacy behavior.
// * Every read and write is service role (`admin`), so RLS cannot hide a claim
//   and make a portal-built deal look legacy. Confirmations are written only
//   here (the table is server-written, ADR 0175).
// * The portal does no price math. A rep confirming means the rep set the
//   discounts in Pipedrive first; the fingerprint records Pipedrive's values.

export const PROJECT_QUOTE_GATE_FLAG = "PROJECT_QUOTE_GATE";

export function quoteGateEnabled(): boolean {
  return process.env[PROJECT_QUOTE_GATE_FLAG] === "true";
}

export type PricingGateDeps = {
  admin: SupabaseClient;
  pipedriveToken: string;
  // Step 6 Phase C live test only: confirm a deal whose lines differ from its
  // calc's design (Andy, 2026-10-23: test deal #5589 was rebuilt by hand during
  // development). Constructed only in scripts/; app code never sets it, and a
  // unit test fails if any app file mentions it. Every other check still runs.
  designCheckOverride?: "phase-c-test";
};

// The gate fingerprint, as stored on a confirmation or shown to the rep.
export const gateFingerprintSchema = z
  .array(
    z.strictObject({
      product_id: z.number(),
      code: z.string().max(100).nullable(),
      name: z.string().max(500).nullable(),
      quantity: z.number().nullable(),
      unit_price: z.number().nullable(),
      line_amount: z.number().nullable(),
      discount: z.number().nullable(),
      discount_type: z.string().max(40).nullable(),
      role: z.string().max(40).nullable(),
      currency: z.string().max(10).nullable(),
    }),
  )
  .max(200);

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type PortalBuilt = { status: "ok"; portalBuilt: boolean } | { status: "error"; error: unknown };

/** Whether the portal built this deal: a claim or ledger rows for it. */
export async function readPortalBuilt(admin: SupabaseClient, dealId: number): Promise<PortalBuilt> {
  const [claim, ledger] = await Promise.all([
    admin.from("project_deal_claims").select("id").eq("pipedrive_deal_id", dealId).limit(1),
    admin.from("deal_line_syncs").select("id").eq("pipedrive_deal_id", dealId).limit(1),
  ]);
  if (claim.error) return { status: "error", error: claim.error };
  if (ledger.error) return { status: "error", error: ledger.error };
  return { status: "ok", portalBuilt: (claim.data ?? []).length > 0 || (ledger.data ?? []).length > 0 };
}

/** The deal's lines, every page, in the rep's order. Throws on any failure. */
export function readDealLines(token: string, dealId: number): Promise<PdV2DealProduct[]> {
  return listDealProductsV2(token, dealId, { sort_by: "order_nr" });
}

export type LatestConfirmation = { id: number; submissionId: string | null; fingerprint: DealLineFingerprint[] };

// "Latest" is confirmed_at desc, then id desc. Only rows confirmDealPricing
// wrote count: they carry deal_lines (a row a session wrote before the
// lockdown, ADR 0175, has none). A row whose fingerprint does not parse counts
// as no confirmation.
async function latestConfirmation(admin: SupabaseClient, dealId: number): Promise<LatestConfirmation | null | Refusal> {
  const { data, error } = await admin
    .from("quote_pricing_confirmations")
    .select("id, submission_id, deal_lines_fingerprint")
    .eq("pipedrive_deal_id", dealId)
    .not("deal_lines", "is", null)
    .order("confirmed_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1);
  if (error) return dbRefusal("read the deal's pricing confirmation", error, dealId);
  const row = (data ?? [])[0] as { id: number; submission_id: string | null; deal_lines_fingerprint: unknown } | undefined;
  if (!row) return null;
  const parsed = gateFingerprintSchema.safeParse(row.deal_lines_fingerprint);
  if (!parsed.success) return null;
  return { id: Number(row.id), submissionId: row.submission_id, fingerprint: parsed.data };
}

// The deal's current calc: the newest project-linked calc on this deal that no
// other one revises (ADR 0173: revisions keep their source's deal). The deal's
// own calc when nothing revises it.
async function currentCalcForDeal(admin: SupabaseClient, dealId: number, projectId: string, fallback: string): Promise<CalcContext | Refusal> {
  const { data: rows, error } = await admin
    .from("submissions")
    .select("id, parent_submission_id, created_at")
    .eq("pipedrive_deal_id", dealId);
  if (error) return dbRefusal("load the deal's calcs", error, dealId);
  const ids = (rows ?? []).map((r) => r.id as string);
  let linked = new Set<string>();
  if (ids.length > 0) {
    const { data: links, error: linkError } = await admin
      .from("project_submissions")
      .select("submission_id")
      .in("submission_id", ids)
      .eq("project_id", projectId);
    if (linkError) return dbRefusal("load the deal's calcs", linkError, dealId);
    linked = new Set((links ?? []).map((l) => l.submission_id as string));
  }
  const calcs = (rows ?? []).filter((r) => linked.has(r.id as string));
  const parents = new Set(calcs.map((r) => r.parent_submission_id as string | null).filter(Boolean));
  const leaves = calcs
    .filter((r) => !parents.has(r.id as string))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const calc = await loadCalc(admin, (leaves[0]?.id as string | undefined) ?? fallback, false);
  return isRefusal(calc) ? { ...calc, dealId } : calc;
}

export type DealPricing = {
  ok: true;
  dealId: number;
  calcId: string;
  lines: PdV2DealProduct[];
  fingerprint: DealLineFingerprint[];
  diff: DealLinesDiff;
};

// Everything confirmDealPricing checks, read once. Refuses unless the deal is
// portal-built, every ledger row is added, the deal has lines, and the lines
// match the current calc's BOM.
async function readCheckedPricing(deps: PricingGateDeps, dealId: number): Promise<DealPricing | Refusal> {
  const { admin, pipedriveToken: token } = deps;
  const claim = await claimForDeal(admin, dealId);
  if (isRefusal(claim)) return claim;

  const { data: ledger, error } = await admin.from("deal_line_syncs").select("sku, role, status").eq("pipedrive_deal_id", dealId);
  if (error) return dbRefusal("read the deal's line ledger", error, dealId);
  const open = (ledger ?? []).filter((r) => r.status !== "added");
  if ((ledger ?? []).length === 0 || open.length > 0) {
    return refuse(
      "lines-pending",
      `Deal #${dealId} has lines the portal has not finished adding (${open.length || "none recorded"}). Run "retry missing lines" first.`,
      { dealId },
    );
  }

  const calc = await currentCalcForDeal(admin, dealId, claim.project_id, claim.submission_id);
  if (isRefusal(calc)) return calc;

  let lines: PdV2DealProduct[];
  let products: PdProduct[];
  try {
    [lines, products] = await Promise.all([readDealLines(token, dealId), listPipedriveProducts(token)]);
  } catch (err) {
    return pipedriveRefusal("read the deal's lines and the product list", err, dealId);
  }
  if (lines.length === 0) return refuse("empty-deal", `Deal #${dealId} has no lines.`, { dealId });

  if (fingerprintGateLines(lines).length !== lines.length) {
    return refuse("deal-differs", `A line on deal #${dealId} could not be read. Check the deal in Pipedrive.`, { dealId });
  }
  const diff = diffBomAgainstDeal(calc.bom, lines, codeMap(products));
  if (!diff.clean && deps.designCheckOverride !== "phase-c-test") {
    return refuse(
      "deal-differs",
      `Deal #${dealId} does not match the system design of calc ${calc.submissionId} (${diff.missing.length} missing, ${diff.extra.length} extra, ${diff.quantity.length} quantity, ${diff.role.length} role). Fix the lines in Pipedrive first.`,
      { dealId, calcId: calc.submissionId, diff },
    );
  }
  return { ok: true, dealId, calcId: calc.submissionId, lines, fingerprint: fingerprintGateLines(lines), diff };
}

// ---------------------------------------------------------------------------
// Rep actions
// ---------------------------------------------------------------------------

/** Read-only: the lines and fingerprint a rep reviews before confirming. */
export async function readDealPricing(deps: PricingGateDeps, dealId: number, actorId: string): Promise<DealPricing | Refusal> {
  if (!quoteGateEnabled()) return refuse("flag-off", "The pricing gate is turned off.");
  const actor = await checkActor(deps.admin, actorId);
  if (isRefusal(actor)) return actor;
  if (!Number.isSafeInteger(dealId) || dealId <= 0) return refuse("bad-input", "Invalid deal id.");
  return readCheckedPricing(deps, dealId);
}

export type PricingConfirmed = { ok: true; dealId: number; confirmationId: number; fingerprint: DealLineFingerprint[] };

/**
 * The rep confirms the deal's pricing as shown. Refuses when the deal changed
 * since it was shown, so a confirmation always matches what the rep saw.
 */
export async function confirmDealPricing(
  deps: PricingGateDeps,
  dealId: number,
  shownFingerprint: unknown,
  actorId: string,
): Promise<PricingConfirmed | Refusal> {
  const { admin } = deps;
  if (!quoteGateEnabled()) return refuse("flag-off", "The pricing gate is turned off.");
  const actor = await checkActor(admin, actorId);
  if (isRefusal(actor)) return actor;
  if (!Number.isSafeInteger(dealId) || dealId <= 0) return refuse("bad-input", "Invalid deal id.");
  const shown = gateFingerprintSchema.safeParse(shownFingerprint);
  if (!shown.success) return refuse("bad-input", "The pricing you confirmed could not be read. Review the deal again.");

  const pricing = await readCheckedPricing(deps, dealId);
  if (isRefusal(pricing)) return pricing;
  if (!sameGateLines(pricing.fingerprint, shown.data)) {
    return refuse("fingerprint-mismatch", `Deal #${dealId} changed in Pipedrive since you reviewed it. Review it again, then confirm.`, { dealId });
  }

  const { data, error } = await admin
    .from("quote_pricing_confirmations")
    .insert({
      pipedrive_deal_id: dealId,
      submission_id: pricing.calcId,
      confirmed_by: actor.id,
      deal_lines_fingerprint: pricing.fingerprint,
      deal_lines: pricing.lines,
    })
    .select("id")
    .single();
  if (error || !data) return dbRefusal("save the pricing confirmation", error, dealId);
  return { ok: true, dealId, confirmationId: Number((data as { id: number }).id), fingerprint: pricing.fingerprint };
}

// ---------------------------------------------------------------------------
// The gate in Project Quote generation
// ---------------------------------------------------------------------------

export type QuoteGate =
  | { kind: "not-gated" }
  | { kind: "gated"; lines: PdV2DealProduct[]; confirmationId: number; fingerprint: DealLineFingerprint[] }
  | Refusal;

const CONFIRM_AGAIN = "Confirm the deal's pricing again, then generate the quote.";

/**
 * Called once per generation attempt with the quoted calc and its deal id. Off,
 * or for a deal the portal did not build: not gated, and generation reads the
 * deal as before. For a portal-built deal: the latest confirmation must be for
 * this calc (revisions share a deal, so a confirmation made for another
 * revision says nothing about this one's design), then ONE read of the deal's
 * lines, checked against it. The caller renders from `lines`.
 */
export async function checkQuoteGate(deps: PricingGateDeps, dealId: number, submissionId: string): Promise<QuoteGate> {
  if (!quoteGateEnabled()) return { kind: "not-gated" };
  const built = await readPortalBuilt(deps.admin, dealId);
  if (built.status === "error") return dbRefusal("check whether the portal built this deal", built.error, dealId);
  if (!built.portalBuilt) return { kind: "not-gated" };

  const latest = await latestConfirmation(deps.admin, dealId);
  if (isRefusal(latest)) return latest;
  if (!latest) return refuse("no-confirmation", `Deal #${dealId}'s pricing has not been confirmed. ${CONFIRM_AGAIN}`, { dealId });
  if (latest.submissionId !== submissionId) {
    return refuse(
      "no-confirmation",
      `Deal #${dealId}'s pricing was last confirmed for another version of this calc. Generate from the latest version, or confirm the pricing again.`,
      { dealId },
    );
  }

  let lines: PdV2DealProduct[];
  try {
    lines = await readDealLines(deps.pipedriveToken, dealId);
  } catch (err) {
    return pipedriveRefusal("read the deal's lines", err, dealId);
  }
  const fingerprint = fingerprintGateLines(lines);
  // A line the fingerprint could not read (no product id) would print unchecked.
  if (fingerprint.length !== lines.length) {
    return refuse("pricing-changed", `A line on deal #${dealId} could not be read. Check the deal in Pipedrive.`, { dealId });
  }
  if (!sameGateLines(fingerprint, latest.fingerprint)) {
    return refuse("pricing-changed", `Deal #${dealId} changed in Pipedrive after its pricing was confirmed. ${CONFIRM_AGAIN}`, { dealId });
  }
  return { kind: "gated", lines, confirmationId: latest.id, fingerprint };
}
