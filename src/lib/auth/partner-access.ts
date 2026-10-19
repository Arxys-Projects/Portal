// Suspension ends access (ADR 0164, supersedes ADR 0021). Suspend bans the
// Auth user so they cannot sign in or refresh a session; reactivate lifts it.
// Kept free of `server-only` and Next imports so the ordering can be unit
// tested with a fake client; the server actions in admin/partners pass the
// service-role client.

import { dbError } from "@/lib/errors/safe-message";

// 100 years: Supabase's ban_duration takes a Go duration, with no "forever".
export const BAN_FOREVER = "876000h";

type AccessResult = { ok: true } | { ok: false; error: string };

// The slice of the service-role client these two steps use.
export type PartnerAccessClient = {
  auth: {
    admin: {
      updateUserById(
        uid: string,
        attributes: { ban_duration: string },
      ): PromiseLike<{ error: unknown }>;
    };
  };
  from(table: "partners"): {
    update(values: { status: "active" | "suspended" }): {
      eq(column: "id", value: string): PromiseLike<{ error: unknown }> & {
        // Reactivate's conditional write: only a row still suspended flips.
        eq(column: "status", value: "suspended"): {
          select(columns: "id"): PromiseLike<{ data: unknown[] | null; error: unknown }>;
        };
      };
    };
  };
};

// Ban first, then mark suspended. If the ban fails nothing changes and the
// action fails. If the status write fails, the ban already stops new
// sign-ins and refreshes, but a live session still passes requireActive()
// until its token expires; the row still shows Suspend, so the admin retries.
export async function suspendPartnerAccess(
  admin: PartnerAccessClient,
  targetId: string,
): Promise<AccessResult> {
  const ban = await admin.auth.admin.updateUserById(targetId, {
    ban_duration: BAN_FOREVER,
  });
  if (ban.error) {
    return { ok: false, error: dbError(ban.error, "suspend ban auth user") };
  }
  const { error } = await admin
    .from("partners")
    .update({ status: "suspended" })
    .eq("id", targetId);
  if (error) {
    return { ok: false, error: dbError(error, "suspend update partner") };
  }
  return { ok: true };
}

// Mark active, then lift the ban. If the unban fails, re-assert the ban (an
// error such as a timeout may hide an unban that did apply) and put the
// status back to suspended, so the row stays consistent (banned and
// suspended) and still shows Reactivate for a retry. Unbanning first would
// leave a half-state where the user can sign in again and read partner-tier
// data over REST. The status write is conditional on the row still being
// suspended, so a row that changed since the caller's check (or was never
// suspended) is refused atomically and its Auth user is never unbanned.
export async function reactivatePartnerAccess(
  admin: PartnerAccessClient,
  targetId: string,
): Promise<AccessResult> {
  const { data, error } = await admin
    .from("partners")
    .update({ status: "active" })
    .eq("id", targetId)
    .eq("status", "suspended")
    .select("id");
  if (error) {
    return { ok: false, error: dbError(error, "reactivate partner") };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Cannot reactivate — partner is no longer suspended." };
  }
  const unban = await admin.auth.admin.updateUserById(targetId, {
    ban_duration: "none",
  });
  if (unban.error) {
    const message = dbError(unban.error, "reactivate unban auth user");
    const reban = await admin.auth.admin.updateUserById(targetId, {
      ban_duration: BAN_FOREVER,
    });
    if (reban.error) console.error("[reactivate re-ban]", reban.error);
    const revert = await admin
      .from("partners")
      .update({ status: "suspended" })
      .eq("id", targetId);
    if (revert.error) {
      // Still banned, so still locked out; Suspend then Reactivate recovers.
      console.error("[reactivate revert status]", revert.error);
    }
    return { ok: false, error: message };
  }
  return { ok: true };
}
