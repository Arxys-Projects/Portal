import "server-only";
import { requireAdminOrInternal } from "@/lib/auth/require-admin-or-internal";

// WHO MAY DOWNLOAD A DATASHEET — the one place that decides, so widening it is a
// single edit rather than a hunt through a route and a page (ADR 0110).
//
// Today: admin AND internal. Datasheets are marketing collateral and the
// long-term intent is that any signed-in partner can pull one from the Price
// Book — but the authored copy in copy.ts has never had a marketing pass, so the
// gate stays inside the building until the sheets are reviewed. This is a
// deliberate step-1 restriction on an eventually-public document, not a security
// boundary around sensitive data.
//
// TO WIDEN TO ALL SIGNED-IN PARTNERS, replace the body with an active-partner
// check and drop the `isAdmin || isInternal` test. Do NOT also relax the admin
// picker at /admin/datasheets — that page belongs with the other spec-admin
// surfaces regardless of who may download the PDF.

export type DatasheetGate = { ok: true } | { ok: false; status: 401 | 403 };

export async function requireDatasheetAccess(): Promise<DatasheetGate> {
  const gate = await requireAdminOrInternal();
  if (!gate.ok) {
    // requireAdminOrInternal collapses "not signed in" and "not authorized" into
    // one shape; distinguish them so an expired session gets a 401 the client can
    // act on rather than a flat 403.
    return { ok: false, status: gate.error === "Not authenticated." ? 401 : 403 };
  }
  return { ok: true };
}
