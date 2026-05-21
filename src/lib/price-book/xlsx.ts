import ExcelJS from "exceljs";

export type PriceBookRow = {
  sku: string;
  product_name: string;
  product_group: string;
  msrp: number | null;
  price_type: "numeric" | "market" | "call_for_quote";
};

export async function generatePriceBookXlsx(
  rows: PriceBookRow[],
  generatedAt: Date,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Arxys Partner Portal";
  wb.created = generatedAt;

  const ws = wb.addWorksheet("Price List");

  // Title rows
  ws.mergeCells("A1:D1");
  ws.getCell("A1").value = "Arxys VideoX Price List";
  ws.getCell("A1").font = { bold: true, size: 14 };

  ws.mergeCells("A2:D2");
  ws.getCell("A2").value = `Generated ${generatedAt.toISOString().replace("T", " ").slice(0, 16)} UTC`;
  ws.getCell("A2").font = { italic: true, color: { argb: "FF6B7280" } };

  // Header row at row 4
  const headerRow = ws.getRow(4);
  headerRow.values = ["SKU", "Product Name", "Product Group", "MSRP"];
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFBB040" }, // Arxys Gold
    };
  });

  // Data rows start at row 5
  rows.forEach((r, i) => {
    const dataRow = ws.getRow(5 + i);
    dataRow.getCell(1).value = r.sku;
    dataRow.getCell(2).value = r.product_name;
    dataRow.getCell(3).value = r.product_group;
    if (r.price_type === "numeric" && r.msrp !== null) {
      dataRow.getCell(4).value = r.msrp;
      dataRow.getCell(4).numFmt = '"$"#,##0.00';
    } else if (r.price_type === "market") {
      dataRow.getCell(4).value = "Market Price";
    } else if (r.price_type === "call_for_quote") {
      dataRow.getCell(4).value = "Call for Quote";
    }
  });

  // Column widths
  ws.getColumn(1).width = 18;
  ws.getColumn(2).width = 60;
  ws.getColumn(3).width = 14;
  ws.getColumn(4).width = 14;

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}

export function priceBookFilename(generatedAt: Date): string {
  const yyyy = generatedAt.getFullYear();
  const mm = String(generatedAt.getMonth() + 1).padStart(2, "0");
  const dd = String(generatedAt.getDate()).padStart(2, "0");
  return `Arxys-Price-List-${yyyy}-${mm}-${dd}.xlsx`;
}
