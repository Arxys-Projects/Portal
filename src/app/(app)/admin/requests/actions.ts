"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminOrInternal } from "@/lib/auth/require-admin-or-internal";
import { dbError } from "@/lib/errors/safe-message";

export type RequestActionState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "ok"; message: string };

// Reject a pending access request. Admin AND internal users may act here — the
// admin area is reachable by both, and the RLS UPDATE policy grants the same
// tier. Approve is not a status change: it navigates to the invite form, and
// invitePartner() stamps status='approved' + converted_at only on a successful
// send (see admin/partners/actions.ts).
export async function rejectAccessRequest(
  _prev: RequestActionState | null,
  formData: FormData,
): Promise<RequestActionState> {
  const gate = await requireAdminOrInternal();
  if (!gate.ok) return { status: "error", error: gate.error };

  const id = String(formData.get("id") ?? "");
  if (!z.uuid().safeParse(id).success) {
    return { status: "error", error: "Missing or invalid request id." };
  }

  const admin = createSupabaseAdminClient();
  // Only reject rows still pending — a TOCTOU guard so we don't stomp a row
  // that was approved/rejected between page render and submit.
  const { error } = await admin
    .from("access_requests")
    .update({ status: "rejected" })
    .eq("id", id)
    .eq("status", "pending");
  if (error) return { status: "error", error: dbError(error, "reject access request") };

  revalidatePath("/admin/requests");
  revalidatePath("/admin");
  return { status: "ok", message: "Request rejected." };
}
