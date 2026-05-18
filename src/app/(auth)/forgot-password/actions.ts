"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({ email: z.email() });

export type ForgotState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "sent" };

export async function requestReset(
  _prev: ForgotState | null,
  formData: FormData,
): Promise<ForgotState> {
  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { status: "error", error: "Enter a valid email." };
  }

  const h = await headers();
  const origin =
    h.get("origin") ?? `https://${h.get("host") ?? "portal.arxys.com"}`;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/confirm?next=/reset-password`,
  });

  if (error) {
    // Do not leak whether the email exists. Log server-side, return generic ok.
    console.error("resetPasswordForEmail failed:", error.message);
  }

  // Always return "sent" to avoid email enumeration.
  return { status: "sent" };
}
