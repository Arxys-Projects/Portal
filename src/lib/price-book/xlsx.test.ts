import { describe, it } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  generatePriceBookXlsx,
  priceBookFilename,
  type PriceBookRow,
} from "./xlsx";

const FIXTURE: PriceBookRow[] = [
  {
    sku: "VX5-V800-720",
    product_name: "VideoX V800 720TB NVR",
    product_group: "V800",
    msrp: 74048,
    price_type: "numeric",
  },
  {
    sku: "VX5-RAM-32GB",
    product_name: "VideoX RAM 32GB Upgrade",
    product_group: "RAM",
    msrp: null,
    price_type: "market",
  },
  {
    sku: "VX5-SW30-300",
    product_name: "VideoX SW30 300-Channel Switch",
    product_group: "SW30",
    msrp: null,
    price_type: "call_for_quote",
  },
];

describe("generatePriceBookXlsx", () => {
  it("produces a valid workbook with title, header, and data rows", async () => {
    const buf = await generatePriceBookXlsx(
      FIXTURE,
      new Date("2026-05-22T15:30:00Z"),
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet("Price List")!;

    assert.equal(ws.getCell("A1").value, "Arxys VideoX Price List");
    assert.ok(
      String(ws.getCell("A2").value).includes("2026-05-22"),
      "generated timestamp should include date",
    );

    // Header row at row 4
    assert.equal(ws.getCell("A4").value, "SKU");
    assert.equal(ws.getCell("B4").value, "Product Name");
    assert.equal(ws.getCell("C4").value, "Product Group");
    assert.equal(ws.getCell("D4").value, "MSRP");

    // Numeric row: MSRP cell holds the number, not a string.
    assert.equal(ws.getCell("A5").value, "VX5-V800-720");
    assert.equal(ws.getCell("D5").value, 74048);

    // MKT row.
    assert.equal(ws.getCell("D6").value, "Market Price");

    // CFQ row.
    assert.equal(ws.getCell("D7").value, "Call for Quote");
  });
});

describe("priceBookFilename", () => {
  it("produces a date-stamped filename with no spaces", () => {
    const name = priceBookFilename(new Date("2026-05-22T15:30:00Z"));
    assert.match(name, /^Arxys-Price-List-2026-05-22\.xlsx$/);
    assert.ok(!name.includes(" "), "filename must not contain spaces");
  });
});
