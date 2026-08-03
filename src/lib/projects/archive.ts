// Archiving and restoring a project (ADR 0112).
//
// The service half of the archive gesture. The dialog and the row's Undo button
// are the page's job; what belongs here is the part that is easy to get subtly
// wrong: WHICH rows get stamped.
//
// A /projects row is a PROJECT — a bucket of submissions keyed on (company,
// project name) and merged by revision lineage — and a project has no row of its
// own anywhere. So the archive is stored per submission and every submission in
// the bucket is stamped. Archiving only the representative would lose the state
// the moment representative selection moved (a star toggled, a revision filed),
// and the project would silently reappear for no reason the user did anything to
// cause.
//
// A project reads as archived when its REPRESENTATIVE submission is archived
// (rows.ts). Combined with stamping the whole bucket, that gives the behaviour
// worth having: representative churn inside an existing bucket keeps the project
// hidden, while a genuinely NEW submission — an unstamped row that becomes the
// new lineage leaf — brings the project back. New activity resurfacing an
// archived project is the right default for a queue.
//
// What this never touches: Pipedrive, project_quotes, versions, the deal link,
// submissions.status, or anything a partner can see. Nothing is deleted, and
// restore is a DELETE of the archive rows and nothing else.

import type { SupabaseClient } from "@supabase/supabase-js";
import { groupIntoDeals } from "@/lib/pipeline/forecast";
import type { QueuePartnerRow, QueueSubmissionRow } from "./types";

const TABLE = "submission_internal_archives";

export type ArchiveResult = { ok: true; submissionIds: string[] } | { ok: false; error: string };

// User-facing copy. House rules: no em dashes, no "not X but Y".
export const ARCHIVE_MESSAGES = {
  not_found: "That project could not be found.",
  archive_failed: "The project could not be archived. Try again.",
  restore_failed: "The project could not be restored. Try again.",
} as const;

// Every submission in the same project bucket as `submissionId`, including it.
//
// Resolved through groupIntoDeals so the bucket is defined by exactly the same
// rules the queue groups by: company (on-behalf-of aware, normalised name),
// project name (trimmed, lower-cased) and parent_submission_id lineage. Deriving
// the bucket any other way here would let the archive stamp a different set of
// rows than the page thinks it is hiding.
export async function projectSubmissionIds(
  supabase: SupabaseClient,
  submissionId: string,
): Promise<string[] | null> {
  const [{ data: submissionRows, error }, { data: partnerRows }] = await Promise.all([
    supabase
      .from("submissions")
      .select(
        `id, partner_id, project_name, status, is_preferred, total_list_price_usd,
         pipedrive_deal_id, created_at, on_behalf_of_partner_id,
         on_behalf_of_company_name, parent_submission_id`,
      )
      .order("created_at", { ascending: false }),
    supabase.from("partners").select("id, company_name, contact_name"),
  ]);

  if (error || !submissionRows) {
    console.error("[projects archive bucket]", error);
    return null;
  }

  const submissions = submissionRows as unknown as QueueSubmissionRow[];
  const partners = ((partnerRows ?? []) as unknown as QueuePartnerRow[]).map((p) => ({
    id: p.id,
    company_name: p.company_name,
    contact_name: p.contact_name ?? null,
  }));

  const deal = groupIntoDeals(submissions, partners).find((d) =>
    d.all_submission_ids.includes(submissionId),
  );
  return deal ? deal.all_submission_ids : null;
}

// Archive a project. Idempotent: re-archiving an already-archived project
// re-stamps it with the current time and actor, which is why the migration grants
// UPDATE and carries an upsert policy.
export async function archiveProject(
  supabase: SupabaseClient,
  submissionId: string,
  viewerId: string,
  options: { now?: Date } = {},
): Promise<ArchiveResult> {
  const ids = await projectSubmissionIds(supabase, submissionId);
  if (!ids || ids.length === 0) return { ok: false, error: ARCHIVE_MESSAGES.not_found };

  const archivedAt = (options.now ?? new Date()).toISOString();
  const { error } = await supabase.from(TABLE).upsert(
    ids.map((id) => ({
      submission_id: id,
      archived_at: archivedAt,
      // Must be the acting user: the RLS with-check asserts the same thing, so a
      // forged attribution is rejected by the database as well as here.
      archived_by: viewerId,
    })),
    { onConflict: "submission_id" },
  );

  if (error) {
    console.error("[projects archive]", error);
    return { ok: false, error: ARCHIVE_MESSAGES.archive_failed };
  }
  return { ok: true, submissionIds: ids };
}

// Restore a project to the queue. Deletes the archive rows for the whole bucket,
// which is the entire undo: nothing else was ever changed.
//
// Not scoped to the user who archived it. The archive is global (ADR 0112), so
// restricting undo to the original archiver would leave rows nobody present could
// bring back.
export async function restoreProject(
  supabase: SupabaseClient,
  submissionId: string,
): Promise<ArchiveResult> {
  const ids = await projectSubmissionIds(supabase, submissionId);
  if (!ids || ids.length === 0) return { ok: false, error: ARCHIVE_MESSAGES.not_found };

  const { error } = await supabase.from(TABLE).delete().in("submission_id", ids);
  if (error) {
    console.error("[projects restore]", error);
    return { ok: false, error: ARCHIVE_MESSAGES.restore_failed };
  }
  return { ok: true, submissionIds: ids };
}
