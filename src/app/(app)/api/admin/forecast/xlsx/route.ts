import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors/safe-message";
import {
  groupIntoDeals,
  computeWeightedForecast,
  STAGE_PROBABILITY,
  type SubmissionRow,
  type Deal,
} from "@/lib/pipeline/forecast";

// exceljs uses Node.js streams internally.
export const runtime = "nodejs";

// Always freshly query; never serve a cached XLSX.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin-only: mirror the layout gate (role=admin AND status=active).
  const { data: me } = await supabase
    .from("partners")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();
  if (me?.role !== "admin" || me.status !== "active") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [{ data: subRows, error: subError }, { data: partnerRows }] =
    await Promise.all([
      supabase
        .from("submissions")
        .select(
          `id, partner_id, project_name, status, is_preferred,
           total_list_price_usd, pipedrive_deal_id, created_at,
           on_behalf_of_partner_id, on_behalf_of_company_name`,
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("partners")
        .select("id, company_name")
        .order("company_name"),
    ]);

  if (subError) {
    return NextResponse.json({ error: dbError(subError, "forecast load submissions") }, { status: 500 });
  }

  const submissions = (subRows ?? []) as SubmissionRow[];
  const partners = (partnerRows ?? []).map((p) => ({
    id: p.id,
    company_name: p.company_name,
  }));
  const deals = groupIntoDeals(submissions, partners);
  const { totalOpenPipeline, weightedForecast } =
    computeWeightedForecast(deals);

  const generatedAt = new Date();
  const buffer = await buildXlsx(
    deals,
    totalOpenPipeline,
    weightedForecast,
    generatedAt,
  );

  const yyyy = generatedAt.getFullYear();
  const mm = String(generatedAt.getMonth() + 1).padStart(2, "0");
  const dd = String(generatedAt.getDate()).padStart(2, "0");
  const filename = `Arxys-Partner-Forecast-${yyyy}-${mm}-${dd}.xlsx`;

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}

async function buildXlsx(
  deals: Deal[],
  totalOpenPipeline: number,
  weightedForecast: number,
  generatedAt: Date,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Arxys Partner Portal";
  wb.created = generatedAt;

  const ws = wb.addWorksheet("Partner Forecast");

  // Title
  ws.mergeCells("A1:G1");
  ws.getCell("A1").value = "Arxys Partner Pipeline Forecast";
  ws.getCell("A1").font = { bold: true, size: 14 };

  ws.mergeCells("A2:G2");
  ws.getCell("A2").value = `Generated ${generatedAt.toISOString().replace("T", " ").slice(0, 16)} UTC — Pre-CRM partner activity`;
  ws.getCell("A2").font = { italic: true, color: { argb: "FF6B7280" } };

  ws.mergeCells("A3:G3");
  ws.getCell("A3").value = `Open pipeline: ${fmtUsd(totalOpenPipeline)}   Weighted forecast: ${fmtUsd(weightedForecast)}   Weights: Sent 40% · On Hold 20% · Won 100% · Lost 0% · Draft/unset excluded`;
  ws.getCell("A3").font = { color: { argb: "FF374151" } };

  // Header row at row 5
  const headerRow = ws.getRow(5);
  headerRow.values = [
    "Partner",
    "Project",
    "Status",
    "List Price",
    "Weighted Value",
    "Pipedrive Deal ID",
    "Quote Date",
  ];
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFBB040" }, // Arxys Gold
    };
  });

  // Data rows start at row 6
  let rowIdx = 6;
  for (const deal of deals) {
    const isDraftOrNull = deal.status === null || deal.status === "draft";
    const value = !isDraftOrNull ? (deal.total_list_price_usd ?? 0) : null;
    const prob = !isDraftOrNull
      ? (STAGE_PROBABILITY[deal.status as keyof typeof STAGE_PROBABILITY] ?? 0)
      : 0;
    const weightedValue = value !== null ? value * prob : null;

    const dataRow = ws.getRow(rowIdx++);
    dataRow.getCell(1).value = deal.partner_name;
    dataRow.getCell(2).value = deal.project_name ?? "(untitled)";
    dataRow.getCell(3).value = deal.status ?? "—";

    if (value !== null) {
      dataRow.getCell(4).value = value;
      dataRow.getCell(4).numFmt = '"$"#,##0.00';
    } else {
      dataRow.getCell(4).value = "Draft/unset";
    }

    if (weightedValue !== null) {
      dataRow.getCell(5).value = weightedValue;
      dataRow.getCell(5).numFmt = '"$"#,##0.00';
    } else {
      dataRow.getCell(5).value = "—";
    }

    dataRow.getCell(6).value = deal.pipedrive_deal_id ?? "—";

    const quoteDate = new Date(deal.representative_created_at);
    dataRow.getCell(7).value = quoteDate;
    dataRow.getCell(7).numFmt = "yyyy-mm-dd";
  }

  // Column widths
  ws.getColumn(1).width = 24;
  ws.getColumn(2).width = 30;
  ws.getColumn(3).width = 10;
  ws.getColumn(4).width = 14;
  ws.getColumn(5).width = 16;
  ws.getColumn(6).width = 20;
  ws.getColumn(7).width = 14;

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}

function fmtUsd(n: number): string {
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
