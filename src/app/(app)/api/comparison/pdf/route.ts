import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  renderComparisonPdfBuffer,
  comparisonPdfFilename,
  type ComparisonPdfInput,
} from "@/lib/pdf/comparison-template";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PdfRequestBody = Omit<ComparisonPdfInput, "generatedAt">;

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PdfRequestBody;
  try {
    body = (await request.json()) as PdfRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const generatedAt = new Date();
  const buffer = await renderComparisonPdfBuffer({ ...body, generatedAt });
  const filename = comparisonPdfFilename(generatedAt);

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
