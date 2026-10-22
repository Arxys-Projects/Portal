import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  gateViewer,
  isActive,
  isAdmin,
  isStaff,
  loadViewer,
  type Viewer,
  type ViewerGate,
  type ViewerPartner,
} from "./viewer-core";

export {
  NOT_ACTIVE_MESSAGE,
  gateError,
  isActive,
  isAdmin,
  isInternal,
  isStaff,
  type ActiveViewer,
  type Viewer,
  type ViewerGate,
  type ViewerPartner,
} from "./viewer-core";

// ADR 0164 — the one place that answers "who is this, and are they allowed
// in". Layouts, pages, server actions and route handlers each call a
// require*() themselves: a layout does not run for actions or route handlers,
// so it cannot be the only gate. cache() dedupes the read within one request.
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createSupabaseServerClient();
  return loadViewer({
    getUser: async () => (await supabase.auth.getUser()).data.user,
    loadPartner: async (userId) =>
      await supabase
        .from("partners")
        .select("company_name, contact_name, role, status, is_internal")
        .eq("id", userId)
        .maybeSingle<ViewerPartner>(),
  });
});

export async function requireActive(): Promise<ViewerGate> {
  return gateViewer(await getViewer(), isActive);
}

export async function requireStaff(): Promise<ViewerGate> {
  return gateViewer(await getViewer(), isStaff);
}

export async function requireAdmin(): Promise<ViewerGate> {
  return gateViewer(await getViewer(), isAdmin);
}
