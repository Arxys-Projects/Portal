import { NextResponse } from "next/server";
import { findCatalogueEntry } from "@/lib/datasheet/catalogue";
import { buildRailContent, type ApplianceSpecRow } from "@/lib/datasheet/from-appliance-specs";
import { buildManagementContent } from "@/lib/datasheet/from-management-specs";
import { buildLedgerContent } from "@/lib/datasheet/from-product-specs";
import { requireDatasheetAccess } from "@/lib/datasheet/guard";
import { loadDatasheetSpecData } from "@/lib/datasheet/load";
import {
  datasheetFilename,
  renderLedgerDatasheet,
  renderRailDatasheet,
  type DatasheetRenderResult,
} from "@/lib/datasheet/render";

// GET /api/datasheet/{model} -> the product datasheet PDF for one model.
//
// Model in, PDF out. ONE SHEET PER MODEL, not per SKU: `/api/datasheet/V400`
// renders one sheet whose ordering table lists VX5-V400-128, -160 and -192.
// A part number is not a valid path segment here.
//
// The template is chosen by family, never by a query parameter — the NVR models
// render through Ledger and the workstations through Rail, and the caller does
// not get to ask for the wrong one.
//
// Rendered on demand from live spec rows, with no stored snapshot (ADR 0110).
//
// @react-pdf/renderer needs the Node runtime (node:zlib and friends), and the
// asset loader reads PNGs off disk with readFileSync — same as every other PDF
// route in the app.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ model: string }> }) {
  const gate = await requireDatasheetAccess();
  if (!gate.ok) {
    return new NextResponse(gate.status === 401 ? "Unauthorized" : "Forbidden", {
      status: gate.status,
    });
  }

  const { model: rawModel } = await params;
  // Path segments reach a route decoded but unvalidated. Model keys are short
  // alphanumerics ("V800", "SW10"); anything else is not worth a database read.
  const model = decodeURIComponent(rawModel).trim().toUpperCase();
  if (!/^[A-Z0-9]{2,10}$/.test(model)) {
    return new NextResponse("Invalid model", { status: 400 });
  }

  let data;
  try {
    data = await loadDatasheetSpecData();
  } catch (err) {
    console.error("[datasheet spec load]", err);
    return new NextResponse("Failed to load specs.", { status: 500 });
  }

  const entry = findCatalogueEntry(data.catalogue, model);
  if (!entry) return new NextResponse(`No such model: ${model}`, { status: 404 });

  // A model that exists but has no template answers with its REASON, not a bare
  // 404 — the ACM line and the management servers are real products whose sheets
  // are not built, and a caller deserves to be told which.
  if (entry.template === null) {
    return new NextResponse(entry.unavailableReason ?? "No datasheet template for this model.", {
      status: 409,
    });
  }

  // Which ADAPTER to use is not the same question as which template. Both the
  // NVR sheet and the management sheet render through Ledger (ADR 0111); they
  // read different tables to get there, which is what `source` records.
  let result: DatasheetRenderResult;
  try {
    if (entry.template === "rail") {
      const row = data.applianceRows.find((r) => r.product_group === entry.model) as
        | ApplianceSpecRow
        | undefined;
      if (!row) return new NextResponse(`No such model: ${entry.model}`, { status: 404 });
      result = await renderRailDatasheet(buildRailContent(row));
    } else if (entry.source === "appliance_specs") {
      result = await renderLedgerDatasheet(
        buildManagementContent(entry.model, data.applianceRows),
      );
    } else {
      result = await renderLedgerDatasheet(buildLedgerContent(entry.model, data.productRows));
    }
  } catch (err) {
    console.error(`[datasheet render ${model}]`, err);
    return new NextResponse("Failed to generate the datasheet.", { status: 500 });
  }

  // Both templates are specced at a fixed page count with zero slack, so an
  // overflow means a footer has been pushed onto a page of its own. The PDF is
  // still returned — a sheet an admin can look at beats a 500 they cannot — but
  // the spill is logged rather than passing silently for a good render.
  if (result.overflowed) {
    console.error(
      `[datasheet overflow] ${model} rendered ${result.pages} pages, ` +
        `${entry.template} is specced at ${result.expectedPages}`,
    );
  }

  return new NextResponse(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${datasheetFilename(entry.displayName)}"`,
      "Content-Length": String(result.buffer.length),
      // Specs change through the admin form and the sheet is always current, so
      // a cached copy would be exactly the drift on-demand rendering avoids.
      "Cache-Control": "private, no-store",
      "X-Datasheet-Pages": String(result.pages),
    },
  });
}
