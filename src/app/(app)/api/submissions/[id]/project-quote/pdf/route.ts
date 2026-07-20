import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  loadCurrentProjectQuote,
  loadProjectQuoteVersion,
} from "@/lib/project-quote/assemble";
import {
  projectQuotePdfFilename,
  renderProjectQuotePdfBuffer,
} from "@/lib/project-quote/render";

// @react-pdf/renderer needs the Node runtime (node:zlib and friends), same as
// the System Estimate PDF route.
export const runtime = "nodejs";

// ADR 0083 — partner-facing download of the partner's OWN Project Quote,
// re-rendered deterministically from the stored snapshot (never a live pull,
// ADR 0060). `?version=N` selects a specific revision; default is current.
//
// Gated twice, mirroring the admin route:
//   1. This handler verifies the caller is an active partner who OWNS the
//      submission (creator or on-behalf target) — or is internal/admin.
//   2. project_quotes RLS (20260720000001, ADR 0083) enforces the same
//      boundary at the row level, so even a handler bug reads null for a
//      non-owner. Until that migration is applied, partners get 404 here.
//
// Partner pricing appears only inside the rendered PDF — this route returns
// the document, never JSON pricing data (ADR 0083 constraint).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { data: caller } = await supabase
    .from("partners")
    .select("role, status, is_internal")
    .eq("id", user.id)
    .maybeSingle<{ role: string; status: string; is_internal: boolean }>();
  if (caller?.status !== "active") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // Ownership check (defense-in-depth on top of RLS): the submission read is
  // RLS-scoped, so a foreign id reads null; we additionally require the caller
  // to be the creator, the on-behalf target, or internal/admin.
  const { data: submission } = await supabase
    .from("submissions")
    .select("id, partner_id, on_behalf_of_partner_id")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      partner_id: string;
      on_behalf_of_partner_id: string | null;
    }>();
  const isInternalOrAdmin = caller.is_internal === true || caller.role === "admin";
  const ownsSubmission =
    submission !== null &&
    (submission.partner_id === user.id ||
      submission.on_behalf_of_partner_id === user.id);
  if (!submission || (!ownsSubmission && !isInternalOrAdmin)) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Optional specific revision; default = derived current (max version).
  const url = new URL(request.url);
  const versionParam = url.searchParams.get("version");
  let quote;
  if (versionParam !== null) {
    const version = Number.parseInt(versionParam, 10);
    if (!Number.isInteger(version) || version < 1) {
      return new NextResponse("Invalid version", { status: 400 });
    }
    quote = await loadProjectQuoteVersion(id, version, supabase);
  } else {
    quote = await loadCurrentProjectQuote(id, supabase);
  }
  if (!quote) return new NextResponse("Not found", { status: 404 });

  const buffer = await renderProjectQuotePdfBuffer(quote.snapshot);
  const filename = projectQuotePdfFilename(quote.snapshot);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
