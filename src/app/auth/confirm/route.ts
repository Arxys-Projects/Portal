import { type NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Handles the link clicked from Supabase email templates (invite, recovery,
// signup confirmation, email change). The token_hash + type are exchanged
// for a session; the user is then redirected to `next` (default /dashboard).

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";

  const redirectTo = request.nextUrl.clone();
  redirectTo.pathname = next.startsWith("/") ? next : "/dashboard";
  redirectTo.search = "";

  if (!token_hash || !type) {
    redirectTo.pathname = "/login";
    redirectTo.searchParams.set("error", "missing_token");
    return NextResponse.redirect(redirectTo);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });
  if (error) {
    redirectTo.pathname = "/login";
    redirectTo.searchParams.set("error", "expired_or_invalid");
    return NextResponse.redirect(redirectTo);
  }

  return NextResponse.redirect(redirectTo);
}
