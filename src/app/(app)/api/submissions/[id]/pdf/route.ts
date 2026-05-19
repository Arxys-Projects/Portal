import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  loadSubmissionPdfInput,
  pdfFilename,
  renderSubmissionPdfBuffer,
} from "@/lib/pdf/render";

// @react-pdf/renderer needs the Node runtime — it imports node:zlib and other
// builtins that the Edge runtime doesn't expose.
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // RLS scopes the submission lookup to partner_id = auth.uid() OR is_admin().
  // A partner asking for someone else's submission gets null → 404.
  const input = await loadSubmissionPdfInput(id, supabase);
  if (!input) {
    return new NextResponse("Not found", { status: 404 });
  }

  const buffer = await renderSubmissionPdfBuffer(input);
  const filename = pdfFilename(input);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
