import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth/viewer";
import { loadCurrentProjectQuote } from "@/lib/project-quote/assemble";
import {
  projectQuotePdfFilename,
  renderProjectQuotePdfBuffer,
} from "@/lib/project-quote/render";
import { resolveSubmissionOwnerLogoDataUri } from "@/lib/storage/partner-logo";

// @react-pdf/renderer needs the Node runtime (node:zlib and friends), same as
// the System Estimate PDF route.
export const runtime = "nodejs";

// Internal-only download of the CURRENT Project Quote, re-rendered
// deterministically from the stored snapshot (never a live pull, ADR 0060).
// Gated twice: RLS on project_quotes is internal-only (a partner's client reads
// null), and this handler also checks the caller is an active internal/admin
// user before doing any work.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const gate = await requireStaff();
  if (!gate.ok) {
    return gate.reason === "unauthenticated"
      ? new NextResponse("Unauthorized", { status: 401 })
      : new NextResponse("Forbidden", { status: 403 });
  }
  const supabase = await createSupabaseServerClient();

  // Derived-current read (max version). RLS scopes this to internal callers, so
  // this is null for anyone who slipped past the check above.
  const current = await loadCurrentProjectQuote(id, supabase);
  if (!current) return new NextResponse("Not found", { status: 404 });

  // Partner logo (center header), resolved live from the submission's owning
  // partner (ADR 0089 §5); null renders a blank slot.
  const partnerLogoDataUri = await resolveSubmissionOwnerLogoDataUri(supabase, id);

  const buffer = await renderProjectQuotePdfBuffer(current.snapshot, { partnerLogoDataUri });
  const filename = projectQuotePdfFilename(current.snapshot);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
