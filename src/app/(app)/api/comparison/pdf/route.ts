import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  renderComparisonPdfBuffer,
  comparisonPdfFilename,
} from "@/lib/pdf/comparison-template";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pdfBodySchema = z.object({
  partnerCompanyName: z.string().max(200),
  competitorBrand: z.string().min(1).max(100),
  competitorProductLine: z.string().min(1).max(200),
  competitorModelName: z.string().min(1).max(200),
  arxysModelName: z.string().min(1).max(200),
  arxysModelId: z.string().min(1).max(50),
  specs: z.array(
    z.object({
      label: z.string().max(200),
      competitorVal: z.string().max(500),
      arxysVal: z.string().max(500),
    }),
  ).max(50),
  competitorPriceUsd: z.number().positive().nullable(),
  arxysMsrpUsd: z.number().positive(),
  serverCount: z.number().int().min(1).max(25),
  priceDeltaUsd: z.number().nullable(),
  deploymentSavingsUsd: z.number().nullable(),
  footerText: z.string().max(1000),
  // Market-reality callouts (ADR 0085) — mirrors the on-screen banners.
  callouts: z
    .array(
      z.object({
        label: z.string().min(1).max(40),
        text: z.string().min(1).max(400),
      }),
    )
    .max(5)
    .optional(),
});

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = pdfBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const generatedAt = new Date();
  let buffer: Buffer;
  try {
    buffer = await renderComparisonPdfBuffer({ ...parsed.data, generatedAt });
  } catch (err) {
    console.error("[comparison pdf render]", err);
    return NextResponse.json({ error: "Failed to generate PDF." }, { status: 500 });
  }
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
