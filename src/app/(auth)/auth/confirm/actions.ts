"use server";

import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSafeNext } from "@/lib/auth/safe-next";

// The single-use token from an auth email is only consumed HERE, on an explicit
// POST from the interstitial button — never on the GET that renders the page.
// Email security scanners (Microsoft Safe Links, Mimecast, Proofpoint, …)
// pre-fetch links with GET; doing verifyOtp on GET let those scanners silently
// burn the token before the human clicked, which is why invite/recovery links
// were dying for partners on corporate mail. See ADR 0051.
export async function confirmToken(formData: FormData): Promise<void> {
  const token_hash = String(formData.get("token_hash") ?? "");
  const type = (String(formData.get("type") ?? "") || null) as EmailOtpType | null;
  const nextRaw = String(formData.get("next") ?? "/dashboard");
  const next = isSafeNext(nextRaw) ? nextRaw : "/dashboard";

  if (!token_hash || !type) {
    redirect("/login?error=missing_token");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });
  if (error) {
    redirect("/login?error=expired_or_invalid");
  }

  // First-time invitees have no password yet — send them to the create-password
  // variant of the reset screen. Recovery/returning users keep the plain path.
  if (type === "invite" && next === "/reset-password") {
    redirect("/reset-password?new=1");
  }
  redirect(next);
}
