"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SUBMISSION_STATUSES, type SubmissionStatus } from "./status";

export type ActionResult = { ok: true } | { ok: false; error: string };

const statusSchema = z.enum(SUBMISSION_STATUSES).nullable();

// All three actions rely on RLS for authorization:
//   - submissions_update_own enforces partner_id = auth.uid() on UPDATE.
//   - submissions_delete_own_draft additionally enforces status draft/NULL on DELETE.
// We only confirm a live session here; the database does the row-level work,
// and an UPDATE/DELETE that matches no row (wrong owner, or a non-draft delete)
// returns zero rows rather than an error, which we surface to the caller.

async function requireSession() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

const SESSION_EXPIRED = "Your session has expired. Sign in and try again.";
const NOT_YOURS = "Submission not found, or it is not yours to edit.";

export async function updateSubmissionStatus(
  submissionId: string,
  status: SubmissionStatus | null,
): Promise<ActionResult> {
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, error: "Invalid status value." };

  const { supabase, user } = await requireSession();
  if (!user) return { ok: false, error: SESSION_EXPIRED };

  const { data, error } = await supabase
    .from("submissions")
    .update({ status: parsed.data })
    .eq("id", submissionId)
    .select("id");
  if (error) return { ok: false, error: `Failed to update status: ${error.message}` };
  if (!data || data.length === 0) return { ok: false, error: NOT_YOURS };

  revalidatePath("/submissions");
  return { ok: true };
}

export async function togglePreferred(submissionId: string): Promise<ActionResult> {
  const { supabase, user } = await requireSession();
  if (!user) return { ok: false, error: SESSION_EXPIRED };

  // RLS scopes this read to the caller's own rows.
  const { data: target, error: loadError } = await supabase
    .from("submissions")
    .select("id, project_name, is_preferred")
    .eq("id", submissionId)
    .maybeSingle<{ id: string; project_name: string | null; is_preferred: boolean }>();
  if (loadError) return { ok: false, error: `Failed to load submission: ${loadError.message}` };
  if (!target) return { ok: false, error: NOT_YOURS };

  // Already preferred → un-prefer. Single toggle, no project-wide work.
  if (target.is_preferred) {
    const { error } = await supabase
      .from("submissions")
      .update({ is_preferred: false })
      .eq("id", submissionId)
      .select("id");
    if (error) return { ok: false, error: `Failed to update: ${error.message}` };
    revalidatePath("/submissions");
    return { ok: true };
  }

  // Marking preferred. Set the target FIRST: if clearing the previous preferred
  // then fails, the partner is left with two preferred (which the next toggle
  // corrects) rather than zero — the failure mode the brief asks us to avoid.
  const { data: setData, error: setError } = await supabase
    .from("submissions")
    .update({ is_preferred: true })
    .eq("id", submissionId)
    .select("id");
  if (setError) return { ok: false, error: `Failed to update: ${setError.message}` };
  if (!setData || setData.length === 0) return { ok: false, error: NOT_YOURS };

  // Clear any other preferred in the same project (case-insensitive). NULL/empty
  // project names don't group, so an ungrouped submission is preferred on its
  // own and clears nothing — a degenerate but harmless case (Q3).
  const projectName = target.project_name?.trim();
  if (projectName) {
    const { data: others } = await supabase
      .from("submissions")
      .select("id, project_name")
      .eq("is_preferred", true);
    const toClear = (others ?? [])
      .filter(
        (r) =>
          r.id !== submissionId &&
          (r.project_name?.trim().toLowerCase() ?? "") === projectName.toLowerCase(),
      )
      .map((r) => r.id);
    if (toClear.length > 0) {
      await supabase.from("submissions").update({ is_preferred: false }).in("id", toClear);
    }
  }

  revalidatePath("/submissions");
  return { ok: true };
}

export async function deleteSubmission(submissionId: string): Promise<ActionResult> {
  const { supabase, user } = await requireSession();
  if (!user) return { ok: false, error: SESSION_EXPIRED };

  // submissions_delete_own_draft enforces ownership AND the draft/NULL guard at
  // the DB level. A blocked delete returns zero rows, not an error.
  const { data, error } = await supabase
    .from("submissions")
    .delete()
    .eq("id", submissionId)
    .select("id");
  if (error) return { ok: false, error: `Failed to delete: ${error.message}` };
  if (!data || data.length === 0) {
    return {
      ok: false,
      error: "This submission cannot be deleted because it has a status other than draft.",
    };
  }

  revalidatePath("/submissions");
  return { ok: true };
}
