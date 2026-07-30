// Render the 3-page datasheet layout mockup to a PDF on disk, for review.
//
// Run with:
//   node --import tsx scripts/render-datasheet-mockup.ts [outPath]
//
// No database, no network — the content comes from src/lib/datasheet/placeholder.ts
// (real V800 figures, hand-assembled) so the layout can be looked at before the
// spec-table adapter exists. Delete this script once the datasheet renders from
// product_specs / appliance_specs through a route.
//
// WHY .ts AND NOT .mts, unlike its neighbours in this directory. tsx loads
// `.mts` as ESM and plain `.ts` as CJS (package.json has no "type": "module").
// A `.mts` entry point therefore gets the ESM copy of @react-pdf/renderer while
// src/lib/datasheet/*.ts get the CJS copy — two module instances, two separate
// font stores, and Font.register() writing to the one the renderer never reads
// ("Font family not registered: Montserrat", from a call that plainly ran).
// Keeping the whole chain CJS is what src/lib/project-quote/render.test.ts does
// for the same reason. The cost is no top-level await, hence main().

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { DatasheetPdf } from "../src/lib/datasheet/DatasheetPdf";
import { V800_PLACEHOLDER } from "../src/lib/datasheet/placeholder";
import { registerDatasheetFonts } from "../src/lib/datasheet/tokens";

async function main(): Promise<void> {
  const out = resolve(process.argv[2] ?? "datasheets/v800-3page-mockup.pdf");

  // Layout resolves the font families before the component body runs, so
  // registering inside DatasheetPdf alone is too late for the first render.
  registerDatasheetFonts();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = createElement(DatasheetPdf, { data: V800_PLACEHOLDER }) as any;
  const buffer = await renderToBuffer(element);
  writeFileSync(out, buffer);

  console.log(`Wrote ${out} — ${(buffer.length / 1024).toFixed(0)} KB`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
