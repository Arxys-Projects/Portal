import "server-only";
import { type DocumentProps, renderToBuffer } from "@react-pdf/renderer";
import { type ReactElement, createElement } from "react";
import { DatasheetPdf } from "./DatasheetPdf";
import { RailDatasheetPdf } from "./RailDatasheetPdf";
import { registerDatasheetFonts } from "./tokens";
import type { DatasheetTemplate } from "./catalogue";
import type { DatasheetContent } from "./types";
import type { RailContent } from "./rail-types";

// The datasheet render entry point.
//
// `import "server-only"` lives HERE and not on the two template components,
// matching src/lib/project-quote/render.ts. The marker throws under plain Node,
// which would put both templates out of reach of `tsx --test` and of the two
// mockup render scripts. It belongs on the module that loads assets and is
// reached only from a route.
//
// FONTS ARE REGISTERED BEFORE LAYOUT, not only inside the components. Layout
// resolves the font families before a component body runs, so registering inside
// DatasheetPdf alone is too late for the first render of a cold process — the
// symptom is "Font family not registered: Montserrat" from a call that plainly
// ran. Both components still call it (it is idempotent); this is the call that
// actually lands in time.

/** Expected page count per template. Ledger is 3 (ADR 0105), Rail is exactly 1 (ADR 0109 §1). */
export const EXPECTED_PAGES: Record<DatasheetTemplate, number> = {
  ledger: 3,
  rail: 1,
};

/**
 * Count `/Type /Page` objects in an emitted PDF.
 *
 * Both templates are specced at a fixed page count with no slack, so an overflow
 * is a real defect rather than cosmetic drift — a model whose spec values run
 * longer than the ones the layout was checked against can push a footer onto a
 * page of its own. Saying it out loud beats letting a silent spill pass for a
 * successful render, which is what the Rail mockup script already does.
 *
 * `[^s]` excludes `/Type /Pages`, the page-tree node.
 */
export function countPdfPages(buffer: Buffer): number {
  return (buffer.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

export type DatasheetRenderResult = {
  buffer: Buffer;
  /** Pages actually emitted. */
  pages: number;
  /** Pages the template is specced at. */
  expectedPages: number;
  /** True when the two disagree — the caller decides whether to log or refuse. */
  overflowed: boolean;
};

async function render(
  element: ReactElement<DocumentProps>,
  template: DatasheetTemplate,
): Promise<DatasheetRenderResult> {
  registerDatasheetFonts();
  const buffer = await renderToBuffer(element);
  const pages = countPdfPages(buffer);
  const expectedPages = EXPECTED_PAGES[template];
  return { buffer, pages, expectedPages, overflowed: pages !== expectedPages };
}

/** Render the 3-page Ledger sheet for an NVR. */
export function renderLedgerDatasheet(data: DatasheetContent): Promise<DatasheetRenderResult> {
  return render(
    createElement(DatasheetPdf, { data }) as unknown as ReactElement<DocumentProps>,
    "ledger",
  );
}

/** Render the single-page Rail sheet for a workstation. */
export function renderRailDatasheet(data: RailContent): Promise<DatasheetRenderResult> {
  return render(
    createElement(RailDatasheetPdf, { data }) as unknown as ReactElement<DocumentProps>,
    "rail",
  );
}

/**
 * Suggested download filename. The model is enough to identify the sheet —
 * there is one sheet per model, not per SKU.
 */
export function datasheetFilename(model: string): string {
  return `Arxys ${model} Datasheet.pdf`;
}
