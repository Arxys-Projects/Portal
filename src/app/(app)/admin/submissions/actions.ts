"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, requireStaff } from "@/lib/auth/viewer";
import { dbError } from "@/lib/errors/safe-message";
import { SUBMISSION_STATUSES, type SubmissionStatus } from "@/app/(app)/submissions/status";
import { buildRelinkInputs, type RelinkSubmissionRow } from "@/lib/pipedrive/relink";
import { readProjectLink } from "@/lib/projects/calc-save";
import {
  createDealFromSubmission,
  updateDealFromRevision,
  isDealUneditableError,
} from "@/lib/pipedrive/deal";
import { PipedriveError } from "@/lib/pipedrive/client";
import { resolveSubmissionPartner } from "@/lib/pdf/partner-resolution";

export type ActionResult = { ok: true } | { ok: false; error: string };

const statusSchema = z.enum(SUBMISSION_STATUSES);

const SESSION_EXPIRED = "Your session has expired. Sign in and try again.";
const NOT_ADMIN = "You do not have permission to perform this action.";

// Session expired reads differently from a signed-in non-admin.
function refusal(reason: "unauthenticated" | "forbidden"): string {
  return reason === "unauthenticated" ? SESSION_EXPIRED : NOT_ADMIN;
}

export async function adminUpdateStatus(
  submissionId: string,
  status: SubmissionStatus,
): Promise<ActionResult> {
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, error: "Invalid status value." };

  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: refusal(gate.reason) };
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("submissions")
    .update({ status: parsed.data })
    .eq("id", submissionId);
  if (error) return { ok: false, error: dbError(error, "admin update submission status") };

  revalidatePath("/admin/submissions");
  return { ok: true };
}

export async function adminDeleteSubmission(
  submissionId: string,
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: refusal(gate.reason) };
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("submissions")
    .delete()
    .eq("id", submissionId)
    .select("id");
  if (error) {
    // 23503 = foreign_key_violation. project_quotes.submission_id is `on
    // delete restrict`, so a submission with a generated quote raises this
    // instead of deleting — surface the real reason instead of a generic one.
    if (error.code === "23503") {
      return {
        ok: false,
        error: "This submission can't be deleted because a quote has been generated from it.",
      };
    }
    return { ok: false, error: dbError(error, "admin delete submission") };
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      error: "This submission could not be deleted — it may have already been removed.",
    };
  }

  revalidatePath("/admin/submissions");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// ADR 0093 step 3 — manual "Retry Pipedrive link".
//
// Recovery path for a submission whose Pipedrive sync failed at submit time,
// leaving pipedrive_deal_id null. Before this existed there was no way to
// recover: the failure was logged server-side and swallowed, and 10 production
// submissions (back to 2026-06-17, incl. two Dallas revisions at $614k/$1.13M)
// silently never reached the CRM.
//
// Internal-or-admin, matching generateProjectQuote — the other action on this
// page that writes to Pipedrive — rather than admin-only, because internal reps
// own the CRM relationship for the quotes they file.
// ---------------------------------------------------------------------------

export type RelinkResult =
  // valueUpdateSkipped: the deal was updated, but Pipedrive refused its `value`
  // because line items are attached — the admin needs to fix the products by hand.
  | { ok: true; dealId: number; inherited: boolean; valueUpdateSkipped: boolean }
  | { ok: false; error: string };

export async function adminRelinkPipedriveDeal(submissionId: string): Promise<RelinkResult> {
  if (!z.string().uuid().safeParse(submissionId).success) {
    return { ok: false, error: "Invalid submission id." };
  }

  const gate = await requireStaff();
  if (!gate.ok) return { ok: false, error: NOT_ADMIN };

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  const { data: row, error: loadError } = await supabase
    .from("submissions")
    .select(
      `id, project_name, vms, retention_days, cameras_count, bandwidth_mbps, storage_tb,
       recommended_product_id, recommended_units, total_list_price_usd, created_at,
       groups_payload, input_state, pipedrive_deal_id, parent_submission_id,
       partner_id, on_behalf_of_partner_id, on_behalf_of_company_name`,
    )
    .eq("id", submissionId)
    .maybeSingle();
  if (loadError) return { ok: false, error: dbError(loadError, "load submission for relink") };
  if (!row) return { ok: false, error: "Submission not found." };

  const sub = row as RelinkSubmissionRow & {
    pipedrive_deal_id: number | null;
    parent_submission_id: string | null;
    partner_id: string;
    on_behalf_of_partner_id: string | null;
    on_behalf_of_company_name: string | null;
  };

  // Narrow by design: only ever fills a MISSING link. Re-syncing an already
  // linked deal is a different operation with different blast radius (it would
  // overwrite live CRM values), so it is not offered here.
  if (sub.pipedrive_deal_id) {
    return {
      ok: false,
      error: `Already linked to Pipedrive deal #${sub.pipedrive_deal_id}. Nothing to retry.`,
    };
  }

  // A project calc has no deal on purpose: Step 5 creates it by Pipedrive id.
  // Relinking would make one by name through the partner path (ADR 0169). A
  // row whose parent is a project calc is refused too: relink would inherit
  // the parent's deal, and such a child can only come from a direct insert
  // (the calculator refuses partner revisions of project calcs).
  for (const id of [sub.id, sub.parent_submission_id]) {
    if (!id) continue;
    const projectLink = await readProjectLink(admin, id);
    if (projectLink.status === "db-error") {
      return { ok: false, error: dbError(projectLink.error, "load project link for relink") };
    }
    if (!projectLink.projectId) continue;
    return {
      ok: false,
      error: "This calc belongs to a project, or revises one. Its Pipedrive deal is made from the project, so there is nothing to relink here.",
    };
  }

  // Resolve the SKU's family + display name for the deal value/model strings.
  let productGroup: string | null = null;
  let productName: string | null = null;
  if (sub.recommended_product_id) {
    const { data: product } = await supabase
      .from("current_products")
      .select("product_group, product_name")
      .eq("sku", sub.recommended_product_id)
      .maybeSingle();
    productGroup = (product?.product_group as string | undefined) ?? null;
    productName = (product?.product_name as string | undefined) ?? null;
  }

  const built = buildRelinkInputs(sub, productGroup, productName);
  if (!built.ok) return { ok: false, error: built.error };

  // Partner identity — same three-tier precedence as the PDF and the original
  // submit (on-behalf FK target → free-typed company → creating rep).
  const [{ data: creatingRow }, { data: onBehalfRow }] = await Promise.all([
    admin.from("partners").select("company_name, contact_name").eq("id", sub.partner_id).maybeSingle(),
    sub.on_behalf_of_partner_id
      ? admin
          .from("partners")
          .select("company_name, contact_name")
          .eq("id", sub.on_behalf_of_partner_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const resolved = resolveSubmissionPartner(
    {
      on_behalf_of_partner_id: sub.on_behalf_of_partner_id,
      on_behalf_of_company_name: sub.on_behalf_of_company_name,
    },
    onBehalfRow as { company_name: string; contact_name: string } | null,
    creatingRow as { company_name: string; contact_name: string } | null,
  );

  // Email for the person link: the on-behalf TARGET when set, else the creator.
  // A free-typed company has no portal user, so the deal attaches org-only.
  const identityUserId = sub.on_behalf_of_partner_id ?? sub.partner_id;
  let email: string | null = null;
  if (!sub.on_behalf_of_company_name) {
    try {
      const u = await admin.auth.admin.getUserById(identityUserId);
      email = u.data.user?.email ?? null;
    } catch {
      // No email → org-only deal; never block the relink on this.
    }
  }
  const dealPartner = {
    companyName: resolved.companyName,
    contactName: resolved.contactName,
    email,
  };
  const onBehalfNote =
    sub.on_behalf_of_partner_id || sub.on_behalf_of_company_name
      ? [
          `Created on behalf of: ${resolved.companyName}`,
          `Relinked from the Arxys Portal by an internal user`,
          `Portal submission id: ${sub.id}`,
        ].join("\n")
      : null;

  try {
    let dealId: number | undefined;
    let inherited = false;
    let valueUpdateSkipped = false;

    // If this row is a revision whose PARENT still has a usable deal, update
    // that deal in place instead of creating a second one — creating fresh here
    // would put a duplicate deal in the CRM, which is the very thing ADR 0093
    // is about.
    if (sub.parent_submission_id) {
      const { data: parent } = await supabase
        .from("submissions")
        .select("pipedrive_deal_id")
        .eq("id", sub.parent_submission_id)
        .maybeSingle();
      const parentDealId = parent?.pipedrive_deal_id as number | null | undefined;
      if (parentDealId) {
        try {
          ({ dealId, valueUpdateSkipped } = await updateDealFromRevision(
            parentDealId,
            built.inputs.submission,
            built.inputs.recommendation,
          ));
          inherited = true;
        } catch (err) {
          // Parent's deal is gone/deleted — fall through to a fresh deal.
          if (!isDealUneditableError(err)) throw err;
        }
      }
    }

    if (dealId === undefined) {
      ({ dealId } = await createDealFromSubmission(
        built.inputs.submission,
        built.inputs.recommendation,
        dealPartner,
        onBehalfNote,
      ));
    }

    // ADR 0167: the link is server-written, so service role: the submissions
    // guard refuses pipedrive_deal_id from any non-admin session, and an
    // internal user's session matched no row on another partner's submission
    // anyway. requireStaff() above gates the caller; the row was read above.
    const { error: writeError } = await admin
      .from("submissions")
      .update({ pipedrive_deal_id: dealId })
      .eq("id", sub.id);
    if (writeError) {
      return {
        ok: false,
        error:
          `Pipedrive deal #${dealId} was created, but saving the link to this submission failed ` +
          `(${dbError(writeError, "save pipedrive link")}). Retrying would create a DUPLICATE deal — ` +
          `set the link manually or delete deal #${dealId} in Pipedrive first.`,
      };
    }

    revalidatePath(`/admin/submissions/${sub.id}`);
    revalidatePath("/admin/submissions");
    return { ok: true, dealId, inherited, valueUpdateSkipped };
  } catch (err) {
    console.error("pipedrive relink failed", { submissionId: sub.id, error: err });
    // Surface the REAL Pipedrive message. This is an internal-only surface, and
    // hiding it behind a generic string is what let ERR_DEAL_DELETED stay
    // invisible for over a month.
    if (err instanceof PipedriveError) {
      return { ok: false, error: `Pipedrive rejected the request (${err.status}): ${err.message}` };
    }
    return { ok: false, error: "Could not reach Pipedrive. Try again in a moment." };
  }
}
