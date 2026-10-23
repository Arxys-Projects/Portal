import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { PipedriveWriteError } from "@/lib/pipedrive/company-api";
import { sanitizeTitlePart } from "@/lib/pipedrive/deal";
import { resolveOwnerIdForCreator } from "@/lib/pipedrive/lookups";
import { listPipedriveProducts } from "@/lib/pipedrive/product-api";
import type { PdProduct } from "@/lib/pipedrive/product-sync";
import {
  addDealProductV2,
  createDealV2,
  findDealFieldCode,
  listDealProductsV2,
  PROJECT_ID_FIELD_NAME,
  resolveProjectPipelineStage,
  type PdV2DealProduct,
} from "@/lib/pipedrive/project-deal-api";
import type { ServerRole } from "@/lib/system-design/rules";
import { readProjectLink } from "./calc-save";
import { RELEASE_MIN_AGE_MS } from "./claim-resolution";
import {
  diffBomAgainstDeal,
  parseBankedBom,
  planDealLines,
  roleComment,
  roleFromComment,
  type BomLineIn,
  type DealLinesDiff,
  type LineRefusal,
  type PreviewLine,
} from "./deal-lines";
import { sameLineItems } from "./line-items";
import type { DealLineFingerprint } from "./types";

// Project Portal Step 5 (ADR 0170): the portal builds a project calc's
// Pipedrive deal with product lines. These four functions are the only writers
// of project_deal_claims and, with them, of deal_line_syncs.
//
// * Behind PROJECT_DEAL_PRODUCTS ("true" turns it on; default off).
// * Every function takes the acting user (a partners.id) and checks it itself:
//   an active internal user or an active admin. A server action passes the
//   session's user; a script passes the rep Andy names.
// * `admin` is the service-role client. Every database write here is service
//   role, the deal link on submissions included (ADR 0167).
// * The BOM comes only from the banked design (ADR 0165). Lines, prices and
//   SKUs are never taken from the caller; prices are the Pipedrive products'
//   own, passed through verbatim (deal-lines.ts).
// * One deal per project and per revision lineage, guarded by a claim taken
//   before POST /api/v2/deals. A create that may have reached Pipedrive is
//   never retried by the portal.
// * Lines go on one at a time through the deal_line_syncs ledger: a row is
//   claimed (pending / failed to sending) before its POST and marked added or
//   failed after. A retry always reads the deal first and never posts a line
//   the deal already has.

export type ProjectDealDeps = {
  admin: SupabaseClient;
  pipedriveToken: string;
  now?: () => Date;
};

export type RefusalReason =
  | "flag-off"
  | "bad-input"
  | "not-allowed"
  | "not-in-project"
  | "no-design"
  | "bad-bom"
  | "superseded"
  | "lines-refused"
  | "fingerprint-mismatch"
  | "no-org"
  | "no-person"
  | "no-pipeline"
  | "no-stage"
  | "no-project-field"
  | "already-has-deal"
  | "claim-unresolved"
  | "create-refused"
  | "create-unknown"
  | "not-portal-deal"
  | "wrong-project"
  | "pipedrive-error"
  | "db-error"
  // Step 6 (ADRs 0176, 0177): the pricing gate and the Quote ready email.
  | "lines-pending"
  | "empty-deal"
  | "deal-differs"
  | "no-confirmation"
  | "pricing-changed"
  | "no-recipient"
  | "already-sent"
  | "send-blocked"
  | "send-failed";

export type Refusal = {
  ok: false;
  reason: RefusalReason;
  message: string;
  refusals?: LineRefusal[];
  dealId?: number;
};

export type LineOutcome = { sku: string; role: ServerRole; status: "pending" | "sending" | "added" | "failed"; error?: string | null };

export type DealLinesRun = {
  ok: true;
  dealId: number;
  lines: LineOutcome[];
  // Lines not on the deal yet (pending, failed, or still sending elsewhere).
  linesPending: number;
  // The deal read back after the writes; null when that read failed.
  diff: DealLinesDiff | null;
  warnings: string[];
};

export const PROJECT_DEAL_FLAG = "PROJECT_DEAL_PRODUCTS";
// A ledger row left in 'sending' this long belongs to a call that stopped.
// syncLines renews a row's fence right before its POST, so this only has to
// outlast ONE line post: up to six 30 s attempts and five 429 waits of at most
// 30 s, 5.5 minutes. Taking over a row a live call still holds is what posts a
// line twice, so this errs long.
export const STALE_SENDING_MS = 8 * 60 * 1000;
// A claim with no deal id younger than this is most likely a create still in
// flight (the other half of a double click), not a stuck one. The same age
// Andy's script requires before it will release a claim.
export const CLAIM_IN_FLIGHT_MS = RELEASE_MIN_AGE_MS;
const MAX_LINEAGE_DEPTH = 200;

const uuid = z.string().uuid();
const fingerprintSchema = z
  .array(
    z.strictObject({
      product_id: z.number(),
      code: z.string().max(100).nullable(),
      name: z.string().max(500).nullable(),
      quantity: z.number().nullable(),
      unit_price: z.number().nullable(),
      line_amount: z.number().nullable(),
    }),
  )
  .max(200);

export function projectDealsEnabled(): boolean {
  return process.env[PROJECT_DEAL_FLAG] === "true";
}

export const refuse = (reason: RefusalReason, message: string, extra: Partial<Refusal> = {}): Refusal => ({
  ok: false,
  reason,
  message,
  ...extra,
});

export function dbRefusal(context: string, error: unknown, dealId?: number): Refusal {
  console.error(`[project deal: ${context}]`, error);
  return refuse("db-error", `Could not ${context}. Try again, or ask an admin.`, dealId ? { dealId } : {});
}

export function pipedriveRefusal(context: string, error: unknown, dealId?: number): Refusal {
  console.error(`[project deal: ${context}]`, error);
  const detail = error instanceof Error ? error.message : String(error);
  return refuse("pipedrive-error", `Pipedrive did not answer while trying to ${context}: ${detail}`, dealId ? { dealId } : {});
}

// ---------------------------------------------------------------------------
// Shared reads
// ---------------------------------------------------------------------------

type Actor = { id: string; pipedriveUserId: number | null };

export async function checkActor(admin: SupabaseClient, actorId: string): Promise<Actor | Refusal> {
  if (!uuid.safeParse(actorId).success) return refuse("bad-input", "Invalid user id.");
  const { data, error } = await admin
    .from("partners")
    .select("id, status, role, is_internal, pipedrive_user_id")
    .eq("id", actorId)
    .maybeSingle();
  if (error) return dbRefusal("check the user", error);
  const allowed = !!data && data.status === "active" && (data.is_internal === true || data.role === "admin");
  if (!allowed) return refuse("not-allowed", "Only an active Arxys user can build a project deal.");
  const pd = data.pipedrive_user_id as number | null;
  return { id: data.id as string, pipedriveUserId: typeof pd === "number" ? pd : null };
}

export type CalcContext = { submissionId: string; projectId: string; bom: BomLineIn[] };

// A project calc with its banked BOM. Only a calc linked in project_submissions
// counts (Step 4 note S-3), and a linked calc with no design row is a failed
// save (note N-1). `requireLeaf` refuses a calc a later revision supersedes.
export async function loadCalc(admin: SupabaseClient, submissionId: string, requireLeaf: boolean): Promise<CalcContext | Refusal> {
  if (!uuid.safeParse(submissionId).success) return refuse("bad-input", "Invalid calc id.");
  const link = await readProjectLink(admin, submissionId);
  if (link.status === "db-error") return dbRefusal("load the calc's project", link.error);
  if (!link.projectId) return refuse("not-in-project", "This calc is not part of a project.");

  const { data: design, error } = await admin
    .from("submission_system_designs")
    .select("bom")
    .eq("submission_id", submissionId)
    .maybeSingle();
  if (error) return dbRefusal("load the calc's system design", error);
  if (!design) {
    return refuse("no-design", "This project calc has no saved system design, so its save did not finish. Save the calc again.");
  }
  const parsed = parseBankedBom(design.bom);
  if (!parsed.ok) return refuse("bad-bom", parsed.message);

  if (requireLeaf) {
    // Only a child linked in project_submissions is a revision of a project
    // calc. A contact login can insert a bare child row over REST (Step 4 note
    // S-3); that must not block the deal.
    const { data: children, error: childError } = await admin
      .from("submissions")
      .select("id")
      .eq("parent_submission_id", submissionId);
    if (childError) return dbRefusal("check for later revisions", childError);
    const childIds = (children ?? []).map((c) => c.id as string);
    if (childIds.length > 0) {
      const { data: linked, error: linkedError } = await admin
        .from("project_submissions")
        .select("submission_id")
        .in("submission_id", childIds)
        .limit(1);
      if (linkedError) return dbRefusal("check for later revisions", linkedError);
      if ((linked ?? []).length > 0) {
        return refuse("superseded", "A later revision replaces this calc. Build the deal from the latest revision.");
      }
    }
  }
  return { submissionId, projectId: link.projectId, bom: parsed.bom };
}

type Preview = { lines: PreviewLine[]; fingerprint: DealLineFingerprint[]; products: PdProduct[] };

async function readPreview(token: string, bom: readonly BomLineIn[]): Promise<Preview | Refusal> {
  let products: PdProduct[];
  try {
    products = await listPipedriveProducts(token);
  } catch (err) {
    return pipedriveRefusal("read the product list", err);
  }
  const plan = planDealLines(bom, products);
  if (!plan.ok) {
    return refuse("lines-refused", "Some lines cannot go on a deal as they are. Fix them in Pipedrive, then preview again.", {
      refusals: plan.refusals,
    });
  }
  return { lines: plan.lines, fingerprint: plan.fingerprint, products };
}

export const isRefusal = (v: unknown): v is Refusal => typeof v === "object" && v !== null && (v as Refusal).ok === false;

export const codeMap = (products: readonly PdProduct[]) =>
  new Map(products.filter((p) => p.code).map((p) => [p.id, p.code as string]));

export type ClaimRow = {
  id: number;
  project_id: string;
  submission_id: string;
  pipedrive_deal_id: number | null;
  confirmed_fingerprint: unknown;
  claimed_at: string;
};

const CLAIM_COLUMNS = "id, project_id, submission_id, pipedrive_deal_id, confirmed_fingerprint, claimed_at";

// ---------------------------------------------------------------------------
// previewDealLines
// ---------------------------------------------------------------------------

export async function previewDealLines(
  deps: ProjectDealDeps,
  submissionId: string,
  actorId: string,
): Promise<{ ok: true; lines: PreviewLine[]; fingerprint: DealLineFingerprint[] } | Refusal> {
  if (!projectDealsEnabled()) return refuse("flag-off", "Project deals are turned off.");
  const actor = await checkActor(deps.admin, actorId);
  if (isRefusal(actor)) return actor;
  const calc = await loadCalc(deps.admin, submissionId, true);
  if (isRefusal(calc)) return calc;
  const preview = await readPreview(deps.pipedriveToken, calc.bom);
  if (isRefusal(preview)) return preview;
  return { ok: true, lines: preview.lines, fingerprint: preview.fingerprint };
}

// ---------------------------------------------------------------------------
// createProjectDeal
// ---------------------------------------------------------------------------

export async function createProjectDeal(
  deps: ProjectDealDeps,
  submissionId: string,
  previewFingerprint: unknown,
  actorId: string,
): Promise<DealLinesRun | Refusal> {
  const { admin, pipedriveToken: token } = deps;
  if (!projectDealsEnabled()) return refuse("flag-off", "Project deals are turned off.");
  const actor = await checkActor(admin, actorId);
  if (isRefusal(actor)) return actor;
  const confirmed = fingerprintSchema.safeParse(previewFingerprint);
  if (!confirmed.success) return refuse("bad-input", "The confirmed preview is unreadable. Preview the lines again.");
  const calc = await loadCalc(admin, submissionId, true);
  if (isRefusal(calc)) return calc;

  // Re-run the preview: a price or product changed in Pipedrive after the rep
  // confirmed must not slip through.
  const preview = await readPreview(token, calc.bom);
  if (isRefusal(preview)) return preview;
  if (!sameLineItems(preview.fingerprint, confirmed.data)) {
    return refuse("fingerprint-mismatch", "The lines changed in Pipedrive since you confirmed them. Preview and confirm again.");
  }

  // Org, person and title parts, by Pipedrive id. No name-based upsert.
  const parties = await loadParties(admin, calc);
  if (isRefusal(parties)) return parties;

  const root = await lineageRoot(admin, submissionId);
  if (isRefusal(root)) return root;

  // A cheap read first, so a second click is refused before any Pipedrive
  // call. The insert below is what actually guards a race.
  const existing = await findClaim(admin, calc.projectId, root);
  if (isRefusal(existing)) return existing;
  if (existing) return claimRefusal(existing, nowMs(deps));

  // Routing, the project field and the owner: read-only, before the claim, so
  // a missing piece refuses without leaving a claim behind.
  let routing: Awaited<ReturnType<typeof resolveProjectPipelineStage>>;
  let fieldCode: string | null;
  let ownerId: number;
  try {
    [routing, fieldCode, ownerId] = await Promise.all([
      resolveProjectPipelineStage(token),
      findDealFieldCode(token, PROJECT_ID_FIELD_NAME),
      resolveOwnerIdForCreator(actor.pipedriveUserId),
    ]);
  } catch (err) {
    return pipedriveRefusal("resolve the pipeline, the project field and the owner", err);
  }
  if (!routing.ok) return refuse(routing.reason, routing.message);
  if (!fieldCode) {
    return refuse("no-project-field", `The "${PROJECT_ID_FIELD_NAME}" deal field does not exist in Pipedrive (or exists twice). Ask Andy to create it.`);
  }

  // The claim. A unique violation is a double click or a second calc of the
  // same project that got here at the same moment.
  const { data: claimed, error: claimError } = await admin
    .from("project_deal_claims")
    .insert({
      project_id: calc.projectId,
      lineage_root_submission_id: root,
      submission_id: submissionId,
      confirmed_fingerprint: preview.fingerprint,
      claimed_by: actor.id,
    })
    .select("id")
    .single();
  if (claimError) {
    if ((claimError as { code?: string }).code === "23505") {
      const winner = await findClaim(admin, calc.projectId, root);
      if (isRefusal(winner)) return winner;
      if (winner) return claimRefusal(winner, nowMs(deps));
    }
    return dbRefusal("claim the project's deal", claimError);
  }
  const claimId = claimed.id as number;

  let dealId: number;
  try {
    dealId = await createDealV2(token, {
      title: parties.title,
      owner_id: ownerId,
      org_id: parties.orgId,
      person_id: parties.personId,
      pipeline_id: routing.pipelineId,
      stage_id: routing.stageId,
      currency: "USD",
      custom_fields: { [fieldCode]: calc.projectId },
    });
  } catch (err) {
    if (err instanceof PipedriveWriteError && !err.ambiguous) {
      // Pipedrive refused: nothing was created, so the claim goes and the rep
      // can try again once the cause is fixed.
      const { error: releaseError } = await admin
        .from("project_deal_claims")
        .delete()
        .eq("id", claimId)
        .is("pipedrive_deal_id", null);
      if (releaseError) {
        console.error("[project deal: release claim]", releaseError);
        return refuse(
          "create-refused",
          `Pipedrive refused the deal (${err.message}), so none was created, but the portal could not clear its claim. Ask Andy to release it (nothing exists to attach).`,
        );
      }
      return refuse("create-refused", `Pipedrive refused the deal: ${err.message}`);
    }
    console.error("[project deal: create deal, outcome unknown]", { submissionId, claimId, err });
    return refuse(
      "create-unknown",
      "Pipedrive did not confirm the deal, so a deal may already exist. Check Pipedrive before doing anything else, then ask Andy to resolve the claim.",
    );
  }

  const { data: linked, error: linkError } = await admin
    .from("project_deal_claims")
    .update({ pipedrive_deal_id: dealId, deal_linked_at: (deps.now?.() ?? new Date()).toISOString() })
    .eq("id", claimId)
    .is("pipedrive_deal_id", null)
    .select("id");
  if (linkError || (linked ?? []).length !== 1) {
    console.error("[project deal: record deal id on claim]", { dealId, claimId, linkError });
    return refuse(
      "db-error",
      `Pipedrive deal #${dealId} was created but the portal could not record it. Do not create it again; ask Andy to attach deal #${dealId} to the claim.`,
      { dealId },
    );
  }

  const warnings: string[] = [];
  const subLink = await linkSubmission(admin, submissionId, dealId);
  if (subLink) warnings.push(subLink);

  // One ledger row per line, pending, before any line POST.
  const { error: ledgerError } = await admin.from("deal_line_syncs").insert(
    preview.lines.map((l) => ({
      pipedrive_deal_id: dealId,
      submission_id: submissionId,
      sku: l.sku,
      role: l.role,
      qty: l.qty,
      pipedrive_product_id: l.pipedriveProductId,
      item_price_sent: l.unitPrice,
      status: "pending",
      created_by: actor.id,
    })),
  );
  if (ledgerError) {
    console.error("[project deal: write line ledger]", { dealId, ledgerError });
    warnings.push(`Deal #${dealId} was created with no lines yet. Run "retry missing lines" to add them.`);
    return {
      ok: true,
      dealId,
      lines: preview.lines.map((l) => ({ sku: l.sku, role: l.role, status: "pending" })),
      linesPending: preview.lines.length,
      diff: null,
      warnings,
    };
  }

  const expected = new Map(
    preview.lines.map((l) => [`${l.sku}|${l.role}`, { productId: l.pipedriveProductId, qty: l.qty, price: l.unitPrice }]),
  );
  return syncLines(deps, dealId, calc.bom, preview.products, expected, warnings);
}

type Parties = { orgId: number; personId: number; title: string };

async function loadParties(admin: SupabaseClient, calc: CalcContext): Promise<Parties | Refusal> {
  const { data: project, error } = await admin
    .from("projects")
    .select("id, name, company_id, primary_contact_id")
    .eq("id", calc.projectId)
    .maybeSingle();
  if (error) return dbRefusal("load the project", error);
  if (!project) return refuse("not-in-project", "The calc's project was not found.");

  const { data: company, error: companyError } = await admin
    .from("companies")
    .select("name, pipedrive_org_id")
    .eq("id", project.company_id)
    .maybeSingle();
  if (companyError) return dbRefusal("load the project's company", companyError);
  if (!company?.pipedrive_org_id) return refuse("no-org", "The project's company has no Pipedrive organization.");

  if (!project.primary_contact_id) return refuse("no-person", "The project has no primary contact. Set one, then try again.");
  const { data: contact, error: contactError } = await admin
    .from("contacts")
    .select("pipedrive_person_id, company_id, active")
    .eq("id", project.primary_contact_id)
    .maybeSingle();
  if (contactError) return dbRefusal("load the project's contact", contactError);
  if (!contact?.pipedrive_person_id || contact.active !== true || contact.company_id !== project.company_id) {
    return refuse("no-person", "The project's primary contact is inactive, has left the company, or has no Pipedrive person.");
  }

  const { data: sub, error: subError } = await admin
    .from("submissions")
    .select("project_name, created_at")
    .eq("id", calc.submissionId)
    .maybeSingle();
  if (subError || !sub) return dbRefusal("load the calc", subError);

  // The existing title pattern (deal.ts): Arxys Quote - {company} - {project} - {date}.
  const projectName = ((sub.project_name as string | null)?.trim() || (project.name as string)).trim();
  const title = [
    "Arxys Quote",
    sanitizeTitlePart(company.name as string) || "Unknown Company",
    sanitizeTitlePart(projectName || "Untitled Project"),
    String(sub.created_at).slice(0, 10),
  ].join(" - ");

  return { orgId: Number(company.pipedrive_org_id), personId: Number(contact.pipedrive_person_id), title };
}

// The first calc of the revision chain (ADR 0093).
async function lineageRoot(admin: SupabaseClient, submissionId: string): Promise<string | Refusal> {
  let current = submissionId;
  const seen = new Set<string>();
  for (let depth = 0; depth < MAX_LINEAGE_DEPTH; depth++) {
    seen.add(current);
    const { data, error } = await admin
      .from("submissions")
      .select("parent_submission_id")
      .eq("id", current)
      .maybeSingle();
    if (error) return dbRefusal("walk the revision chain", error);
    const parent = (data?.parent_submission_id as string | null) ?? null;
    if (!parent) return current;
    if (seen.has(parent)) return refuse("db-error", "The revision chain loops. Ask an admin.");
    current = parent;
  }
  return refuse("db-error", "The revision chain is too long to follow. Ask an admin.");
}

async function findClaim(admin: SupabaseClient, projectId: string, root: string): Promise<ClaimRow | null | Refusal> {
  // Both come from uuid columns; checked again because they go into a filter string.
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(root).success) {
    return refuse("db-error", "Unexpected project or calc id. Ask an admin.");
  }
  const { data, error } = await admin
    .from("project_deal_claims")
    .select(CLAIM_COLUMNS)
    .or(`project_id.eq.${projectId},lineage_root_submission_id.eq.${root}`)
    .limit(1);
  if (error) return dbRefusal("check the project's existing deal", error);
  return ((data ?? [])[0] as ClaimRow | undefined) ?? null;
}

function claimRefusal(claim: ClaimRow, now: number): Refusal {
  if (claim.pipedrive_deal_id) {
    return refuse(
      "already-has-deal",
      `This project already has Pipedrive deal #${claim.pipedrive_deal_id}. Use the line diff to compare a revision with it.`,
      { dealId: Number(claim.pipedrive_deal_id) },
    );
  }
  if (now - Date.parse(claim.claimed_at) < CLAIM_IN_FLIGHT_MS) {
    return refuse(
      "claim-unresolved",
      "A deal for this project is being created right now. Reload in a few minutes before trying again.",
    );
  }
  return refuse(
    "claim-unresolved",
    "A deal for this project may already exist: an earlier create did not finish. Check Pipedrive, then ask Andy to resolve the claim.",
  );
}

const nowMs = (deps: ProjectDealDeps) => (deps.now?.() ?? new Date()).getTime();

// Links the calc to its deal the way the portal links any submission
// (submissions.pipedrive_deal_id, service role, ADR 0167), so My Pipeline and
// groupIntoDeals treat it like any deal. Returns a warning on failure.
async function linkSubmission(admin: SupabaseClient, submissionId: string, dealId: number): Promise<string | null> {
  const { error } = await admin
    .from("submissions")
    .update({ pipedrive_deal_id: dealId })
    .eq("id", submissionId)
    .is("pipedrive_deal_id", null);
  if (!error) return null;
  console.error("[project deal: link submission]", { submissionId, dealId, error });
  return `Deal #${dealId} is not linked to the calc in the portal yet. "Retry missing lines" links it.`;
}

// ---------------------------------------------------------------------------
// Line sync, shared by create and retry
// ---------------------------------------------------------------------------

type LedgerRow = {
  id: number;
  sku: string;
  role: ServerRole;
  qty: number;
  pipedrive_product_id: number;
  pipedrive_deal_product_id: number | null;
  status: "pending" | "sending" | "added" | "failed";
  error: string | null;
  updated_at: string;
};

const LEDGER_COLUMNS = "id, sku, role, qty, pipedrive_product_id, pipedrive_deal_product_id, status, error, updated_at";

async function readLedger(admin: SupabaseClient, dealId: number): Promise<LedgerRow[] | Refusal> {
  const { data, error } = await admin.from("deal_line_syncs").select(LEDGER_COLUMNS).eq("pipedrive_deal_id", dealId);
  if (error) return dbRefusal("read the deal's line ledger", error, dealId);
  return (data ?? []) as LedgerRow[];
}

// Claims a row for this call: pending / failed to sending, or a stale sending
// row (by its exact updated_at) to sending again. Returns the row's new
// updated_at, the fence markRow checks; null when another call holds it.
async function claimRow(admin: SupabaseClient, row: LedgerRow, staleBefore: number): Promise<string | null> {
  let query = admin.from("deal_line_syncs").update({ status: "sending", error: null }).eq("id", row.id);
  if (row.status === "sending") {
    if (Date.parse(row.updated_at) >= staleBefore) return null;
    query = query.eq("status", "sending").eq("updated_at", row.updated_at);
  } else if (row.status === "pending" || row.status === "failed") {
    query = query.in("status", ["pending", "failed"]);
  } else {
    return null;
  }
  const { data, error } = await query.select("id, updated_at");
  if (error) {
    console.error("[project deal: claim ledger row]", { rowId: row.id, error });
    return null;
  }
  const claimed = (data ?? []) as { updated_at: string }[];
  return claimed.length === 1 ? claimed[0].updated_at : null;
}

// Re-takes a row this call holds, right before its POST, so the stale clock
// covers one post. Returns the new fence, "taken" when another call took the
// row over, or "error"; either way this call then leaves the row alone.
async function renewRow(admin: SupabaseClient, rowId: number, fence: string): Promise<{ fence: string } | "taken" | "error"> {
  const { data, error } = await admin
    .from("deal_line_syncs")
    .update({ status: "sending" })
    .eq("id", rowId)
    .eq("status", "sending")
    .eq("updated_at", fence)
    .select("updated_at");
  if (error) {
    console.error("[project deal: renew ledger row]", { rowId, error });
    return "error";
  }
  const rows = (data ?? []) as { updated_at: string }[];
  return rows.length === 1 ? { fence: rows[0].updated_at } : "taken";
}

// Records a claimed row's outcome, only while this call still holds it (same
// updated_at). Returns a problem to report, or null.
async function markRow(
  admin: SupabaseClient,
  rowId: number,
  fence: string,
  patch: { status: "added"; pipedrive_deal_product_id: number } | { status: "failed"; error: string },
): Promise<string | null> {
  const { data, error } = await admin
    .from("deal_line_syncs")
    .update({ ...patch, ...(patch.status === "added" ? { error: null } : {}) })
    .eq("id", rowId)
    .eq("status", "sending")
    .eq("updated_at", fence)
    .select("id");
  if (error) {
    console.error("[project deal: mark ledger row]", { rowId, patch, error });
    return "the ledger could not be updated";
  }
  if ((data ?? []).length !== 1) {
    console.error("[project deal: ledger row taken over]", { rowId, patch });
    return "another call took the ledger row over";
  }
  return null;
}

// What each line must be, keyed by `${sku}|${role}`: the confirmed product and
// price, and the banked quantity. A ledger row is posted only when it agrees.
type ExpectedLine = { productId: number; qty: number; price: number };

// Claim every open line of a deal, then read the deal, then post each claimed
// line the deal does not already carry; then read the deal back and diff it.
async function syncLines(
  deps: ProjectDealDeps,
  dealId: number,
  bom: readonly BomLineIn[],
  products: readonly PdProduct[],
  expected: ReadonlyMap<string, ExpectedLine>,
  warnings: string[],
): Promise<DealLinesRun | Refusal> {
  const { admin, pipedriveToken: token } = deps;
  const ledger = await readLedger(admin, dealId);
  if (isRefusal(ledger)) return ledger;

  const staleBefore = nowMs(deps) - STALE_SENDING_MS;
  const mine: { row: LedgerRow; fence: string }[] = [];
  for (const row of ledger.sort((a, b) => a.id - b.id)) {
    if (row.status === "added") continue;
    const fence = await claimRow(admin, row, staleBefore);
    if (fence) mine.push({ row, fence });
  }

  // Read the deal only after the rows are ours, so no other call can add one
  // of them between this read and the POST.
  let dealLines: PdV2DealProduct[] = [];
  if (mine.length > 0) {
    try {
      dealLines = await listDealProductsV2(token, dealId);
    } catch (err) {
      for (const { row, fence } of mine) {
        await markRow(admin, row.id, fence, { status: "failed", error: "The deal could not be read, so nothing was posted." });
      }
      return pipedriveRefusal("read the deal's lines", err, dealId);
    }
  }

  // Rows this call claimed and could not finish recording: still 'sending',
  // but not another call's.
  const leftBehind = new Set<number>();
  const note = (rowId: number, problem: string | null, message: string) => {
    if (!problem) return;
    leftBehind.add(rowId);
    warnings.push(message.replace("{problem}", problem));
  };

  // Attachment ids the ledger already accounts for: never matched twice.
  const used = new Set(ledger.filter((r) => r.status === "added" && r.pipedrive_deal_product_id).map((r) => Number(r.pipedrive_deal_product_id)));

  for (const claimed of mine) {
    const { row } = claimed;
    let fence = claimed.fence;
    // The ledger is server-written, but its row is checked against what was
    // confirmed before anything is posted from it.
    const want = expected.get(`${row.sku}|${row.role}`);
    if (!want || want.productId !== Number(row.pipedrive_product_id) || want.qty !== row.qty) {
      const err = await markRow(admin, row.id, fence, { status: "failed", error: "This ledger line does not match the confirmed lines; not posted." });
      note(row.id, err, `${row.sku} (${row.role}) does not match the confirmed lines and was not posted, but {problem}.`);
      continue;
    }
    // A line the deal already carries (a post that reached Pipedrive before
    // the process stopped) is recorded, never posted again.
    const onDeal = dealLines.find(
      (l) => !used.has(l.id) && l.product_id === want.productId && roleFromComment(l.comments) === row.role,
    );
    if (onDeal) {
      used.add(onDeal.id);
      const err = await markRow(admin, row.id, fence, { status: "added", pipedrive_deal_product_id: onDeal.id });
      note(row.id, err, `${row.sku} (${row.role}) is on the deal but {problem}.`);
      continue;
    }
    const renewed = await renewRow(admin, row.id, fence);
    if (renewed === "taken") {
      warnings.push(`${row.sku} (${row.role}) was taken over by another call; this one left it alone.`);
      continue;
    }
    if (renewed === "error") {
      leftBehind.add(row.id);
      warnings.push(`${row.sku} (${row.role}) was not posted: the ledger could not be updated.`);
      continue;
    }
    fence = renewed.fence;
    try {
      const attachmentId = await addDealProductV2(token, dealId, {
        product_id: want.productId,
        item_price: want.price,
        quantity: want.qty,
        comments: roleComment(row.role),
      });
      used.add(attachmentId);
      const err = await markRow(admin, row.id, fence, { status: "added", pipedrive_deal_product_id: attachmentId });
      note(row.id, err, `${row.sku} (${row.role}) was added as line #${attachmentId} but {problem}.`);
    } catch (err) {
      const message =
        err instanceof PipedriveWriteError && err.ambiguous
          ? `${err.message}. It may have reached Pipedrive; a retry checks the deal first.`
          : err instanceof Error
            ? err.message
            : String(err);
      console.error("[project deal: add line]", { dealId, sku: row.sku, role: row.role, message });
      const markError = await markRow(admin, row.id, fence, { status: "failed", error: message.slice(0, 500) });
      note(row.id, markError, `${row.sku} (${row.role}) failed (${message.slice(0, 200)}) and {problem}.`);
    }
  }

  const after = await readLedger(admin, dealId);
  if (isRefusal(after)) return after;
  const lines: LineOutcome[] = after
    .sort((a, b) => (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : a.role < b.role ? -1 : 1))
    .map((r) => ({ sku: r.sku, role: r.role, status: r.status, error: r.error }));
  const linesPending = after.filter((r) => r.status !== "added").length;
  const open = after.filter((r) => r.status === "pending" || r.status === "failed").length;
  const mineStuck = after.filter((r) => r.status === "sending" && leftBehind.has(r.id)).length;
  const inFlight = linesPending - open - mineStuck;
  if (mineStuck > 0) {
    warnings.push(
      `${mineStuck} line${mineStuck > 1 ? "s" : ""} could not be recorded. A "retry missing lines" after ${STALE_SENDING_MS / 60000} minutes checks the deal and records ${mineStuck > 1 ? "them" : "it"} without posting twice.`,
    );
  }
  if (open > 0) {
    warnings.push(`${open} line${open > 1 ? "s are" : " is"} not on deal #${dealId} yet. Run "retry missing lines".`);
  }
  if (inFlight > 0) {
    warnings.push(
      `${inFlight} line${inFlight > 1 ? "s are" : " is"} being added by another call. If still not added after ${STALE_SENDING_MS / 60000} minutes, run "retry missing lines".`,
    );
  }

  // Every write checks itself: read the deal back and diff it with the BOM.
  let diff: DealLinesDiff | null = null;
  try {
    diff = diffBomAgainstDeal(bom, await listDealProductsV2(token, dealId), codeMap(products));
  } catch (err) {
    console.error("[project deal: read deal back]", { dealId, err });
    warnings.push(`Deal #${dealId} could not be read back to check its lines.`);
  }
  return { ok: true, dealId, lines, linesPending, diff, warnings };
}

// ---------------------------------------------------------------------------
// retryMissingLines
// ---------------------------------------------------------------------------

export async function retryMissingLines(
  deps: ProjectDealDeps,
  dealId: number,
  actorId: string,
): Promise<DealLinesRun | Refusal> {
  const { admin, pipedriveToken: token } = deps;
  if (!projectDealsEnabled()) return refuse("flag-off", "Project deals are turned off.");
  const actor = await checkActor(admin, actorId);
  if (isRefusal(actor)) return actor;
  if (!Number.isSafeInteger(dealId) || dealId <= 0) return refuse("bad-input", "Invalid deal id.");

  const claim = await claimForDeal(admin, dealId);
  if (isRefusal(claim)) return claim;
  const confirmed = fingerprintSchema.safeParse(claim.confirmed_fingerprint);
  if (!confirmed.success) return refuse("db-error", "The deal's confirmed lines are unreadable. Ask an admin.", { dealId });

  // The deal's own calc, superseded or not: the retry finishes the deal it made.
  const calc = await loadCalc(admin, claim.submission_id, false);
  if (isRefusal(calc)) return { ...calc, dealId };

  const warnings: string[] = [];
  const subLink = await linkSubmission(admin, claim.submission_id, dealId);
  if (subLink) warnings.push(subLink);

  // Product read: the code map for the diff, and the check below.
  let products: PdProduct[];
  try {
    products = await listPipedriveProducts(token);
  } catch (err) {
    return pipedriveRefusal("read the product list", err, dealId);
  }
  const fresh = planDealLines(calc.bom, products);
  const freshMatches = fresh.ok && sameLineItems(fresh.fingerprint, confirmed.data);

  // Lines go on as the rep confirmed them (the claim's fingerprint: product
  // and price, matched by SKU; one SKU in two roles has one product and one
  // price) at the banked quantity.
  const expected = new Map<string, ExpectedLine>();
  for (const line of calc.bom) {
    const fp = confirmed.data.find((f) => f.code === line.sku);
    if (fp?.unit_price != null) {
      expected.set(`${line.sku}|${line.role}`, { productId: fp.product_id, qty: line.qty, price: fp.unit_price });
    }
  }

  // Seed any line the ledger is missing (the create stopped before writing
  // it). Only when Pipedrive still matches what the rep confirmed.
  const ledger = await readLedger(admin, dealId);
  if (isRefusal(ledger)) return ledger;
  const have = new Set(ledger.map((r) => `${r.sku}|${r.role}`));
  const missing = calc.bom.filter((l) => !have.has(`${l.sku}|${l.role}`));
  if (missing.length > 0) {
    if (!fresh.ok || !freshMatches) {
      return refuse(
        "fingerprint-mismatch",
        `Deal #${dealId} is missing ledger lines, and the products in Pipedrive no longer match what was confirmed. Add the lines by hand, or ask an admin.`,
        { dealId },
      );
    }
    const { error } = await admin.from("deal_line_syncs").upsert(
      fresh.lines
        .filter((l) => !have.has(`${l.sku}|${l.role}`))
        .map((l) => ({
          pipedrive_deal_id: dealId,
          submission_id: claim.submission_id,
          sku: l.sku,
          role: l.role,
          qty: l.qty,
          pipedrive_product_id: l.pipedriveProductId,
          item_price_sent: l.unitPrice,
          status: "pending",
          created_by: actor.id,
        })),
      { onConflict: "pipedrive_deal_id,sku,role", ignoreDuplicates: true },
    );
    if (error) return dbRefusal("write the missing ledger lines", error, dealId);
  } else if (!freshMatches) {
    warnings.push("Products or prices changed in Pipedrive since the lines were confirmed. Missing lines go on at the confirmed prices.");
  }

  // syncLines reads the deal after claiming the rows, before posting any.
  return syncLines(deps, dealId, calc.bom, products, expected, warnings);
}

export async function claimForDeal(admin: SupabaseClient, dealId: number): Promise<ClaimRow | Refusal> {
  const { data, error } = await admin
    .from("project_deal_claims")
    .select(CLAIM_COLUMNS)
    .eq("pipedrive_deal_id", dealId)
    .maybeSingle();
  if (error) return dbRefusal("load the deal's claim", error, dealId);
  if (!data) return refuse("not-portal-deal", `Deal #${dealId} was not built by the portal from a project.`, { dealId });
  return data as ClaimRow;
}

// ---------------------------------------------------------------------------
// diffDealLines
// ---------------------------------------------------------------------------

// Read-only. Compares a calc of the deal's project (the deal's own, or a later
// revision) with the deal's current lines. Used for revisions in place of
// rewriting lines.
export async function diffDealLines(
  deps: ProjectDealDeps,
  dealId: number,
  submissionId: string,
  actorId: string,
): Promise<{ ok: true; dealId: number; diff: DealLinesDiff } | Refusal> {
  const { admin, pipedriveToken: token } = deps;
  if (!projectDealsEnabled()) return refuse("flag-off", "Project deals are turned off.");
  const actor = await checkActor(admin, actorId);
  if (isRefusal(actor)) return actor;
  if (!Number.isSafeInteger(dealId) || dealId <= 0) return refuse("bad-input", "Invalid deal id.");

  const claim = await claimForDeal(admin, dealId);
  if (isRefusal(claim)) return claim;
  const calc = await loadCalc(admin, submissionId, false);
  if (isRefusal(calc)) return calc;
  if (calc.projectId !== claim.project_id) {
    return refuse("wrong-project", `This calc belongs to another project than deal #${dealId}.`, { dealId });
  }

  try {
    const [products, dealLines] = await Promise.all([listPipedriveProducts(token), listDealProductsV2(token, dealId)]);
    return { ok: true, dealId, diff: diffBomAgainstDeal(calc.bom, dealLines, codeMap(products)) };
  } catch (err) {
    return pipedriveRefusal("read the deal and the product list", err, dealId);
  }
}
