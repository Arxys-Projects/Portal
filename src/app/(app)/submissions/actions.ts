"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NOT_ACTIVE_MESSAGE, requireActive } from "@/lib/auth/viewer";
import { SUBMISSION_STATUSES, type SubmissionStatus } from "./status";
import { dbError } from "@/lib/errors/safe-message";

export type ActionResult = { ok: true } | { ok: false; error: string };

const statusSchema = z.enum(SUBMISSION_STATUSES);

// All three actions rely on RLS for authorization:
//   - submissions_update_authorized enforces partner_id = auth.uid() on UPDATE.
//   - submissions_delete_authorized additionally enforces status = 'open' on
//     DELETE (Won/Lost are protected — ADR 0081 replaces the old draft/NULL guard).
// Here we confirm the caller is an active partner (ADR 0164); the database
// does the row-level work, and an UPDATE/DELETE that matches no row (wrong
// owner, or a non-open delete) returns zero rows rather than an error, which
// we surface to the caller.

const SESSION_EXPIRED = "Your session has expired. Sign in and try again.";

async function requireActiveSession() {
  const gate = await requireActive();
  if (!gate.ok) {
    return {
      supabase: null,
      error: gate.reason === "unauthenticated" ? SESSION_EXPIRED : NOT_ACTIVE_MESSAGE,
    } as const;
  }
  return { supabase: await createSupabaseServerClient(), error: null } as const;
}

const NOT_YOURS = "Submission not found, or it is not yours to edit.";
const STAFF_ONLY_REOPEN =
  "This quote is marked Won or Lost. Only Arxys staff can change that. Contact your Arxys rep.";

export async function updateSubmissionStatus(
  submissionId: string,
  status: SubmissionStatus,
): Promise<ActionResult> {
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, error: "Invalid status value." };

  const { supabase, error: gateError } = await requireActiveSession();
  if (!supabase) return { ok: false, error: gateError };

  const { data, error } = await supabase
    .from("submissions")
    .update({ status: parsed.data })
    .eq("id", submissionId)
    .select("id");
  // ADR 0167: the submissions guard keeps Won and Lost where they are unless
  // the caller is Arxys staff, and refuses with 42501.
  if (error?.code === "42501") return { ok: false, error: STAFF_ONLY_REOPEN };
  if (error) return { ok: false, error: dbError(error, "update submission status") };
  if (!data || data.length === 0) return { ok: false, error: NOT_YOURS };

  revalidatePath("/submissions");
  return { ok: true };
}

export async function togglePreferred(submissionId: string): Promise<ActionResult> {
  const { supabase, error: gateError } = await requireActiveSession();
  if (!supabase) return { ok: false, error: gateError };

  // RLS scopes this read to the caller's own rows.
  const { data: target, error: loadError } = await supabase
    .from("submissions")
    .select("id, project_name, is_preferred")
    .eq("id", submissionId)
    .maybeSingle<{ id: string; project_name: string | null; is_preferred: boolean }>();
  if (loadError) return { ok: false, error: dbError(loadError, "load submission") };
  if (!target) return { ok: false, error: NOT_YOURS };

  // Already preferred → un-prefer. Single toggle, no project-wide work.
  if (target.is_preferred) {
    const { error } = await supabase
      .from("submissions")
      .update({ is_preferred: false })
      .eq("id", submissionId)
      .select("id");
    if (error) return { ok: false, error: dbError(error, "toggle preferred unset") };
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
  if (setError) return { ok: false, error: dbError(setError, "toggle preferred set") };
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
  const { supabase, error: gateError } = await requireActiveSession();
  if (!supabase) return { ok: false, error: gateError };

  // submissions_delete_authorized enforces ownership AND the status='open' guard
  // at the DB level. A blocked delete returns zero rows, not an error.
  const { data, error } = await supabase
    .from("submissions")
    .delete()
    .eq("id", submissionId)
    .select("id");
  if (error) return { ok: false, error: dbError(error, "delete submission") };
  if (!data || data.length === 0) {
    return {
      ok: false,
      error: "This submission cannot be deleted because it is marked Won or Lost.",
    };
  }

  revalidatePath("/submissions");
  return { ok: true };
}
