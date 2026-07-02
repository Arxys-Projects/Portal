import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors/safe-message";
import {
  generatePriceBookXlsx,
  priceBookFilename,
  type PriceBookRow,
} from "@/lib/price-book/xlsx";

// exceljs uses Node.js streams internally.
export const runtime = "nodejs";

// Always freshly query products; never serve a cached XLSX.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // RLS constrains this read: active=true rows only for non-admins.
  const { data, error } = await supabase
    .from("current_products")
    .select("sku, product_name, product_group, msrp, price_type")
    .eq("active", true)
    .order("sort_order");
  if (error) {
    return NextResponse.json({ error: dbError(error, "price-book load products") }, { status: 500 });
  }

  const rows = (data ?? []) as PriceBookRow[];
  const generatedAt = new Date();
  const buffer = await generatePriceBookXlsx(rows, generatedAt);

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${priceBookFilename(generatedAt)}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
