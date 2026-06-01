"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SUBMISSION_STATUSES, type SubmissionStatus } from "@/app/(app)/submissions/status";

export type ActionResult = { ok: true } | { ok: false; error: string };

const statusSchema = z.enum(SUBMISSION_STATUSES).nullable();

const SESSION_EXPIRED = "Your session has expired. Sign in and try again.";
const NOT_ADMIN = "You do not have permission to perform this action.";

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, isAdmin: false };
  const { data: partner } = await supabase
    .from("partners")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string }>();
  return { supabase, user, isAdmin: partner?.role === "admin" };
}

export async function adminUpdateStatus(
  submissionId: string,
  status: SubmissionStatus | null,
): Promise<ActionResult> {
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, error: "Invalid status value." };

  const { supabase, user, isAdmin } = await requireAdmin();
  if (!user) return { ok: false, error: SESSION_EXPIRED };
  if (!isAdmin) return { ok: false, error: NOT_ADMIN };

  const { error } = await supabase
    .from("submissions")
    .update({ status: parsed.data })
    .eq("id", submissionId);
  if (error) return { ok: false, error: `Failed to update status: ${error.message}` };

  revalidatePath("/admin/submissions");
  return { ok: true };
}

export async function adminDeleteSubmission(
  submissionId: string,
): Promise<ActionResult> {
  const { supabase, user, isAdmin } = await requireAdmin();
  if (!user) return { ok: false, error: SESSION_EXPIRED };
  if (!isAdmin) return { ok: false, error: NOT_ADMIN };

  const { error } = await supabase
    .from("submissions")
    .delete()
    .eq("id", submissionId);
  if (error) return { ok: false, error: `Failed to delete: ${error.message}` };

  revalidatePath("/admin/submissions");
  return { ok: true };
}
