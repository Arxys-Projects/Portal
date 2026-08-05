import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// WHO MAY DOWNLOAD A DATASHEET — the one place that decides, so widening it is a
// single edit rather than a hunt through a route and a page (ADR 0110).
//
// Today: ANY ACTIVE PARTNER. ADR 0110 gated this to admin-and-internal as a
// deliberate step-1 restriction on an eventually-public document, pending a
// marketing pass on the authored copy in copy.ts. ADR 0116 lifts it: the Price
// Book's Documentation buttons now point at this route, and the Price Book is
// visible to every active partner, so an admin-only gate would answer 403 on a
// button that had worked for them. The copy has still not had its marketing
// pass — that is a known and accepted cost of the swap, recorded in ADR 0116,
// not an oversight.
//
// A datasheet is marketing collateral. Nothing here is priced, per-partner, or
// otherwise sensitive: the same figures are already printed on the Price Book
// page that links to it. This is a not-for-the-public gate, not a security
// boundary.
//
// SUSPENDED AND PENDING PARTNERS ARE STILL REFUSED. Status is the line, and it
// is the same line the (app) layout draws for every other signed-in surface.
//
// The admin picker at /admin/datasheets does NOT relax with this — it belongs
// with the other spec-admin surfaces regardless of who may download the PDF, and
// it keeps its own requireAdminOrInternal() call.

export type DatasheetGate = { ok: true } | { ok: false; status: 401 | 403 };

export async function requireDatasheetAccess(): Promise<DatasheetGate> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // An expired session gets a 401 the client can act on, never a flat 403.
  if (!user) return { ok: false, status: 401 };

  const { data: partner } = await supabase
    .from("partners")
    .select("status")
    .eq("id", user.id)
    .maybeSingle<{ status: string | null }>();
  if (partner?.status !== "active") return { ok: false, status: 403 };

  return { ok: true };
}
