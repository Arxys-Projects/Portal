import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AdminOrInternalGate =
  | {
      ok: true;
      userId: string;
      isAdmin: boolean;
      isInternal: boolean;
    }
  | { ok: false; error: string };

// Phase 8 Step C — middle-tier gate. is_internal partners can read across all
// partners' submissions (RLS policy submissions_select_internal) and invite
// new partners (without flipping is_internal themselves — admin-only).
// Mutating actions and the XLSX export still gate on isAdmin specifically.
export async function requireAdminOrInternal(): Promise<AdminOrInternalGate> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not authenticated." };
  }
  const { data: partner } = await supabase
    .from("partners")
    .select("role, status, is_internal")
    .eq("id", user.id)
    .maybeSingle<{
      role: string | null;
      status: string | null;
      is_internal: boolean | null;
    }>();
  if (!partner || partner.status !== "active") {
    return { ok: false, error: "Not authorized." };
  }
  const isAdmin = partner.role === "admin";
  const isInternal = Boolean(partner.is_internal);
  if (!isAdmin && !isInternal) {
    return { ok: false, error: "Not authorized." };
  }
  return { ok: true, userId: user.id, isAdmin, isInternal };
}
