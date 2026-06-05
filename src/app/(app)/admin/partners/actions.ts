"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminOrInternal } from "@/lib/auth/require-admin-or-internal";

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
      : "https://portal-arxys.vercel.app");
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
          "A user with that email already exists. Use Resend Invite from the partners list if their status is still 'invited'.",
      };
    }
    return { status: "error", error: `Invite failed: ${msg}` };
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
      error: `Partner record could not be created: ${insert.error.message}`,
    };
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
  if (targetErr) return { status: "error", error: targetErr.message };
  if (!target) return { status: "error", error: "Partner not found." };

  if (target.role === "admin" && target.status === "active") {
    const { count, error: countErr } = await admin
      .from("partners")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("status", "active");
    if (countErr) return { status: "error", error: countErr.message };
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
  if (updateErr) return { status: "error", error: updateErr.message };

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
  if (error) return { status: "error", error: error.message };

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
  if (targetErr) return { status: "error", error: targetErr.message };
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
      error: `Could not look up partner email: ${userLookup.error?.message ?? "no email on auth user"}`,
    };
  }
  const email = userLookup.data.user.email;
  const redirectTo = await inviteRedirectUrl();

  const invite = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (invite.error) {
    return { status: "error", error: `Resend failed: ${invite.error.message}` };
  }

  revalidatePath("/admin/partners");
  return { status: "ok", message: `Invite re-sent to ${email}.` };
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
  if (error) return { status: "error", error: error.message };

  revalidatePath("/admin/partners");
  return {
    status: "ok",
    message: value ? "Marked as internal." : "Unmarked internal.",
  };
}
