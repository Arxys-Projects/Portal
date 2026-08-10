"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminOrInternal } from "@/lib/auth/require-admin-or-internal";
import { dbError } from "@/lib/errors/safe-message";
import { uploadPartnerLogo as uploadLogoToStorage } from "@/lib/storage/partner-logo";

const inviteSchema = z.object({
  email: z.email().max(254),
  contactName: z.string().trim().min(1).max(120),
  companyName: z.string().trim().min(1).max(120),
});

export type InviteState =
  | { status: "idle" }
  | { status: "error"; error: string; fieldErrors?: Record<string, string[]> }
  | { status: "ok"; message: string };

export type SimpleActionState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "ok"; message: string };

async function requireAdmin(): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not authenticated." };
  }
  const { data: partner } = await supabase
    .from("partners")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();
  if (partner?.role !== "admin" || partner.status !== "active") {
    return { ok: false, error: "Not authorized." };
  }
  return { ok: true, userId: user.id };
}

async function inviteRedirectUrl(): Promise<string> {
  const h = await headers();
  const origin =
    h.get("origin") ??
    (h.get("host")
      ? `https://${h.get("host")}`
      : "https://portal.arxys.com");
  // /auth/confirm handles type=invite and redirects to ?next= after verifyOtp.
  return `${origin}/auth/confirm?next=/reset-password`;
}

export async function invitePartner(
  _prev: InviteState | null,
  formData: FormData,
): Promise<InviteState> {
  // Phase 8 Step C — internal users may also invite partners. Only admins may
  // flip the is_internal flag on the new partner; for non-admin callers we
  // force it false on the server regardless of what the client sends.
  const gate = await requireAdminOrInternal();
  if (!gate.ok) return { status: "error", error: gate.error };

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    contactName: formData.get("contactName"),
    companyName: formData.get("companyName"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_form";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return {
      status: "error",
      error: "Fix the highlighted fields and try again.",
      fieldErrors,
    };
  }
  const { email, contactName, companyName } = parsed.data;
  // Phase 7 Step 1 — internal Arxys users can run calcs on behalf of partners.
  // Checkboxes are absent from FormData when unchecked.
  // Phase 8 Step C — only admins may set is_internal at invite time.
  const isInternal =
    gate.isAdmin && formData.get("isInternal") === "on";

  const admin = createSupabaseAdminClient();
  const redirectTo = await inviteRedirectUrl();

  const invite = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { contactName, companyName },
  });
  if (invite.error || !invite.data.user) {
    const msg = invite.error?.message ?? "Unknown error";
    if (/already.*exists|registered/i.test(msg)) {
      return {
        status: "error",
        error:
          "A user with that email already exists. Use 'Resend sign-in link' from the partners list if their status is still 'invited'.",
      };
    }
    return { status: "error", error: dbError(invite.error, "invite user") };
  }
  const authUserId = invite.data.user.id;

  const insert = await admin.from("partners").insert({
    id: authUserId,
    company_name: companyName,
    contact_name: contactName,
    role: "partner",
    status: "invited",
    is_internal: isInternal,
  });
  if (insert.error) {
    // Roll back the auth user so a retry isn't blocked by a half-state.
    const rollback = await admin.auth.admin.deleteUser(authUserId);
    if (rollback.error) {
      console.error("invite rollback failed", {
        authUserId,
        error: rollback.error.message,
      });
    }
    return {
      status: "error",
      error: dbError(insert.error, "invite insert partner"),
    };
  }

  // Approve → convert an access request (ADR 0077). Only stamp on a fully
  // successful invite (auth user + partners row created), so a failed invite
  // never silently marks a request approved. The requestId is optional — plain
  // invites (not started from a request) omit it. Guard on status='pending' so
  // a re-approve can't overwrite an already-converted row's converted_at.
  const requestId = String(formData.get("requestId") ?? "");
  if (requestId && z.uuid().safeParse(requestId).success) {
    const { error: convertErr } = await admin
      .from("access_requests")
      .update({ status: "approved", converted_at: new Date().toISOString() })
      .eq("id", requestId)
      .eq("status", "pending");
    if (convertErr) {
      // Non-fatal: the invite already succeeded. Log so an admin can reconcile
      // the request row manually; do not fail the action.
      console.error("access_request conversion failed", {
        requestId,
        error: convertErr.message,
      });
    }
    revalidatePath("/admin/requests");
  }

  revalidatePath("/admin/partners");
  return {
    status: "ok",
    message: `Invite sent to ${email}.`,
  };
}

export async function suspendPartner(
  _prev: SimpleActionState | null,
  formData: FormData,
): Promise<SimpleActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { status: "error", error: gate.error };
  const targetId = String(formData.get("id") ?? "");
  if (!targetId) return { status: "error", error: "Missing partner id." };

  if (targetId === gate.userId) {
    return {
      status: "error",
      error:
        "You cannot suspend yourself. Ask another admin if you need to revoke your own access.",
    };
  }

  const admin = createSupabaseAdminClient();

  const { data: target, error: targetErr } = await admin
    .from("partners")
    .select("id, role, status")
    .eq("id", targetId)
    .maybeSingle();
  if (targetErr) return { status: "error", error: dbError(targetErr, "suspend load partner") };
  if (!target) return { status: "error", error: "Partner not found." };

  if (target.role === "admin" && target.status === "active") {
    const { count, error: countErr } = await admin
      .from("partners")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("status", "active");
    if (countErr) return { status: "error", error: dbError(countErr, "suspend count admins") };
    if ((count ?? 0) <= 1) {
      return {
        status: "error",
        error:
          "Cannot suspend the last active admin. Promote another admin first (via the bootstrap script).",
      };
    }
  }

  const { error: updateErr } = await admin
    .from("partners")
    .update({ status: "suspended" })
    .eq("id", targetId);
  if (updateErr) return { status: "error", error: dbError(updateErr, "suspend update partner") };

  revalidatePath("/admin/partners");
  return { status: "ok", message: "Partner suspended." };
}

export async function reactivatePartner(
  _prev: SimpleActionState | null,
  formData: FormData,
): Promise<SimpleActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { status: "error", error: gate.error };
  const targetId = String(formData.get("id") ?? "");
  if (!targetId) return { status: "error", error: "Missing partner id." };

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("partners")
    .update({ status: "active" })
    .eq("id", targetId);
  if (error) return { status: "error", error: dbError(error, "reactivate partner") };

  revalidatePath("/admin/partners");
  return { status: "ok", message: "Partner reactivated." };
}

export async function resendInvite(
  _prev: SimpleActionState | null,
  formData: FormData,
): Promise<SimpleActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { status: "error", error: gate.error };
  const targetId = String(formData.get("id") ?? "");
  if (!targetId) return { status: "error", error: "Missing partner id." };

  const admin = createSupabaseAdminClient();

  // TOCTOU re-check: refuse if status changed between page render and submit.
  const { data: target, error: targetErr } = await admin
    .from("partners")
    .select("status")
    .eq("id", targetId)
    .maybeSingle();
  if (targetErr) return { status: "error", error: dbError(targetErr, "resend invite load partner") };
  if (!target) return { status: "error", error: "Partner not found." };
  if (target.status !== "invited") {
    return {
      status: "error",
      error: `Cannot resend invite — partner status is '${target.status}'.`,
    };
  }

  const userLookup = await admin.auth.admin.getUserById(targetId);
  if (userLookup.error || !userLookup.data.user?.email) {
    return {
      status: "error",
      error: dbError(userLookup.error, "resend invite get user"),
    };
  }
  const email = userLookup.data.user.email;
  const redirectTo = await inviteRedirectUrl();

  // We cannot re-run inviteUserByEmail here: Supabase rejects it with "a user
  // with this email address has already been registered" because the invite
  // already created the auth user. Instead send a recovery email, which works
  // for any existing user (confirmed or not) and lands them on the same
  // create-password screen. The branded "Reset Password" template covers both
  // first-time and returning users. See ADR 0051.
  const supabase = await createSupabaseServerClient();
  const { error: recoverErr } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  if (recoverErr) {
    return { status: "error", error: dbError(recoverErr, "resend invite recovery email") };
  }

  revalidatePath("/admin/partners");
  return { status: "ok", message: `A fresh sign-in link was sent to ${email}.` };
}

const nameFieldSchema = z.string().trim().min(1).max(120);

// Admin-only edit of a partner's display name fields. Used to correct test
// records and align names with the matching Pipedrive organization/contact.
// The partners table is the source of truth the portal reads everywhere
// (calculator, submissions, PDF), so updating it here is sufficient — the
// names copied into auth user_metadata at invite time are never read after the
// invite.
async function updatePartnerNameField(
  formData: FormData,
  column: "company_name" | "contact_name",
  formField: string,
  label: string,
): Promise<SimpleActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { status: "error", error: gate.error };
  const targetId = String(formData.get("id") ?? "");
  if (!targetId) return { status: "error", error: "Missing partner id." };

  const parsed = nameFieldSchema.safeParse(formData.get(formField));
  if (!parsed.success) {
    return {
      status: "error",
      error: `${label} must be between 1 and 120 characters.`,
    };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("partners")
    .update({ [column]: parsed.data })
    .eq("id", targetId);
  if (error) return { status: "error", error: dbError(error, "update partner name field") };

  revalidatePath("/admin/partners");
  return { status: "ok", message: `${label} updated.` };
}

// ADR 0089 — attach a logo to a partner. Admin-only (write access is admin-only,
// per the ADR). The file is validated (PNG/JPG, size) and uploaded to the
// partner-logos bucket via the service-role client (which bypasses RLS; the
// storage.objects policies are defense-in-depth). One logo per partner:
// re-upload replaces in place. The resolved object path is written to logo_path,
// from which the documents and the partner's dashboard resolve the logo live.
export async function uploadPartnerLogo(
  _prev: SimpleActionState | null,
  formData: FormData,
): Promise<SimpleActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { status: "error", error: gate.error };
  const targetId = String(formData.get("id") ?? "");
  if (!targetId) return { status: "error", error: "Missing partner id." };

  const file = formData.get("logo");
  if (!(file instanceof File)) {
    return { status: "error", error: "Choose a PNG or JPG logo file to upload." };
  }

  const admin = createSupabaseAdminClient();
  const uploaded = await uploadLogoToStorage(admin, targetId, file);
  if (!uploaded.ok) return { status: "error", error: uploaded.error };

  const { error } = await admin
    .from("partners")
    .update({ logo_path: uploaded.path })
    .eq("id", targetId);
  if (error) return { status: "error", error: dbError(error, "attach partner logo") };

  revalidatePath("/admin/partners");
  return { status: "ok", message: "Logo uploaded." };
}

export async function updatePartnerCompanyName(
  _prev: SimpleActionState | null,
  formData: FormData,
): Promise<SimpleActionState> {
  return updatePartnerNameField(formData, "company_name", "companyName", "Company name");
}

export async function updatePartnerContactName(
  _prev: SimpleActionState | null,
  formData: FormData,
): Promise<SimpleActionState> {
  return updatePartnerNameField(formData, "contact_name", "contactName", "Contact name");
}

// ADR 0118 — this partner's own numeric Pipedrive user id, used to route the
// owner field on deals THEY create (as themselves or on behalf of a target).
// Empty clears it back to null, which falls back to the existing single-owner
// default — so unsetting a bad or stale id is always safe, never a hard
// failure. Currently only meaningful on Andy's and Richard's own rows; setting
// it on anyone else (or an external partner) is harmless — nothing reads it
// unless that specific partner is ALSO the one submitting the calc.
const pipedriveUserIdFieldSchema = z
  .string()
  .trim()
  .refine((v) => v === "" || (/^\d+$/.test(v) && Number(v) > 0), {
    message: "Pipedrive user id must be a positive whole number, or left empty to clear it.",
  });

export async function updatePartnerPipedriveUserId(
  _prev: SimpleActionState | null,
  formData: FormData,
): Promise<SimpleActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { status: "error", error: gate.error };
  const targetId = String(formData.get("id") ?? "");
  if (!targetId) return { status: "error", error: "Missing partner id." };

  const parsed = pipedriveUserIdFieldSchema.safeParse(formData.get("pipedriveUserId"));
  if (!parsed.success) {
    return {
      status: "error",
      error: "Pipedrive user id must be a positive whole number, or left empty to clear it.",
    };
  }
  const value = parsed.data === "" ? null : Number(parsed.data);

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("partners")
    .update({ pipedrive_user_id: value })
    .eq("id", targetId);
  if (error) return { status: "error", error: dbError(error, "update partner pipedrive user id") };

  revalidatePath("/admin/partners");
  return {
    status: "ok",
    message: value === null ? "Pipedrive user id cleared." : "Pipedrive user id updated.",
  };
}

// Phase 7 Step 1 — mark/unmark a partner as an internal Arxys user. Needed to
// retrofit staff who were invited as plain partners before this flag existed.
// is_internal authorizes running calcs on behalf of other partners.
export async function setPartnerInternal(
  _prev: SimpleActionState | null,
  formData: FormData,
): Promise<SimpleActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { status: "error", error: gate.error };
  const targetId = String(formData.get("id") ?? "");
  if (!targetId) return { status: "error", error: "Missing partner id." };
  const value = formData.get("value") === "true";

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("partners")
    .update({ is_internal: value })
    .eq("id", targetId);
  if (error) return { status: "error", error: dbError(error, "set partner internal") };

  revalidatePath("/admin/partners");
  return {
    status: "ok",
    message: value ? "Marked as internal." : "Unmarked internal.",
  };
}
