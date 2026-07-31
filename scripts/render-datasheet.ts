// Render any product datasheet to a PDF on disk from LIVE spec data, for review.
//
// Run from the repo root (loadPng resolves against process.cwd() + "public"):
//   node --env-file=.env.local --import tsx scripts/render-datasheet.ts --model V800
//   node --env-file=.env.local --import tsx scripts/render-datasheet.ts --model SW10
//   node --env-file=.env.local --import tsx scripts/render-datasheet.ts --all
//   node --env-file=.env.local --import tsx scripts/render-datasheet.ts --model V400 out.pdf
//
// This is the local equivalent of GET /api/datasheet/{model}: the SAME adapters,
// the same authored copy, the same template choice by family. It renders what the
// portal renders, which is the point — a mockup that disagreed with the download
// would be worse than no mockup.
//
// It replaces two scripts this supersedes: render-datasheet-mockup.ts, which fed
// the Ledger template a hand-typed V800 object because no adapter existed, and
// the buildContent() copy that used to live in render-rail-mockup.ts. A
// hand-assembled placeholder sitting next to a real adapter is a second set of
// figures that can silently disagree with the database.
//
// SPEC VALUES ARE READ LIVE with a read-only PostgREST GET, so nothing numeric on
// the page can be invented. The admin form is the only write path for both tables
// (ADR 0096) — this script never writes.
//
// WHY .ts AND NOT .mts. tsx loads `.mts` as ESM and plain `.ts` as CJS
// (package.json has no "type": "module"). A `.mts` entry point would get the ESM
// copy of @react-pdf/renderer while src/lib/datasheet/*.ts get the CJS copy — two
// module instances, two font stores, and registerDatasheetFonts() writing to the
// one the renderer never reads ("Font family not registered: Montserrat", from a
// call that plainly ran). Keep the whole chain CJS; the cost is no top-level
// await, hence main().
//
// It also cannot import src/lib/datasheet/render.ts, for the same reason that
// module carries `import "server-only"`: the marker throws under plain Node. The
// render call and the page count are therefore duplicated here deliberately.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { DatasheetPdf } from "../src/lib/datasheet/DatasheetPdf";
import { RailDatasheetPdf } from "../src/lib/datasheet/RailDatasheetPdf";
import { registerDatasheetFonts } from "../src/lib/datasheet/tokens";
import { datasheetCatalogue, findCatalogueEntry } from "../src/lib/datasheet/catalogue";
import { buildLedgerContent } from "../src/lib/datasheet/from-product-specs";
import { buildRailContent } from "../src/lib/datasheet/from-appliance-specs";
import { buildManagementContent } from "../src/lib/datasheet/from-management-specs";
import type { ProductSpecRow } from "../src/lib/datasheet/from-product-specs";
import type { ApplianceSpecRow } from "../src/lib/datasheet/from-appliance-specs";

const EXPECTED_PAGES = { ledger: 3, rail: 1 } as const;

function parseArgs(argv: string[]): { flags: Record<string, string | true>; positional: string[] } {
  const flags: Record<string, string | true> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq !== -1) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    const name = arg.slice(2);
    const next = argv[i + 1];
    // --all is a boolean; --model needs a value.
    if (name === "all") {
      flags.all = true;
      continue;
    }
    if (next === undefined || next.startsWith("--")) {
      throw new Error(`--${name} needs a value — e.g. --${name} V800`);
    }
    flags[name] = next;
    i++;
  }
  return { flags, positional };
}

async function fetchAll(): Promise<{
  productRows: ProductSpecRow[];
  applianceRows: ApplianceSpecRow[];
}> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("need SUPABASE_URL + service key — run with node --env-file=.env.local");
  }
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const get = async (table: string) => {
    const res = await fetch(`${url}/rest/v1/${table}?select=*&order=id`, { headers });
    if (!res.ok) throw new Error(`${table} GET ${res.status}: ${await res.text()}`);
    return res.json();
  };
  const [productRows, applianceRows] = await Promise.all([
    get("product_specs"),
    get("appliance_specs"),
  ]);
  return { productRows, applianceRows };
}

async function renderOne(
  model: string,
  data: { productRows: ProductSpecRow[]; applianceRows: ApplianceSpecRow[] },
  outPath: string | null,
): Promise<boolean> {
  const catalogue = datasheetCatalogue(data.productRows, data.applianceRows);
  const entry = findCatalogueEntry(catalogue, model);
  if (!entry) {
    throw new Error(
      `no such model: ${model} (available: ${catalogue.map((e) => e.model).join(", ")})`,
    );
  }
  if (entry.template === null) {
    console.log(`${entry.model.padEnd(6)} SKIPPED — ${entry.unavailableReason}`);
    return true;
  }

  // Same branching as the route: the template says how it is drawn, `source`
  // says which adapter fills it. Management and NVR sheets share Ledger.
  let element;
  if (entry.template === "rail") {
    const row = data.applianceRows.find((r) => r.product_group === entry.model)!;
    element = createElement(RailDatasheetPdf, { data: buildRailContent(row) });
  } else if (entry.source === "appliance_specs") {
    element = createElement(DatasheetPdf, {
      data: buildManagementContent(entry.model, data.applianceRows),
    });
  } else {
    element = createElement(DatasheetPdf, {
      data: buildLedgerContent(entry.model, data.productRows),
    });
  }

  const out = resolve(outPath ?? `staging/${entry.model.toLowerCase()}-datasheet.pdf`);
  mkdirSync(dirname(out), { recursive: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(element as any);
  writeFileSync(out, buffer);

  // Both templates are specced at a fixed page count with zero slack, so a spill
  // is a real defect. Say so out loud rather than letting it pass for success.
  const pages = (buffer.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  const expected = EXPECTED_PAGES[entry.template];
  const ok = pages === expected;

  console.log(
    `${entry.model.padEnd(6)} ${entry.template.padEnd(7)} ${String(pages)}/${expected} pages  ` +
      `${String(Math.round(buffer.length / 1024)).padStart(4)} KB  ${out}` +
      (entry.gaps.length > 0 ? `\n         gaps: ${entry.gaps.join("; ")}` : ""),
  );
  // A warning means the sheet is defective rather than merely incomplete, so it
  // goes to stderr and fails the run.
  for (const warning of entry.warnings) console.error(`         ⚠ ${warning}`);
  if (!ok) {
    console.error(
      `         ⚠ OVERFLOW — ${entry.template} is specced at ${expected} page(s), this rendered ${pages}`,
    );
  }
  return ok && entry.warnings.length === 0;
}

async function main(): Promise<void> {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const known = new Set(["model", "all"]);
  const unknown = Object.keys(flags).filter((k) => !known.has(k));
  if (unknown.length > 0) {
    throw new Error(`unknown flag(s): ${unknown.map((k) => `--${k}`).join(", ")}`);
  }
  if (!flags.all && !flags.model) {
    throw new Error("pass --model V800 or --all");
  }

  // Layout resolves the font families before a component body runs, so
  // registering inside the templates alone is too late for the first render.
  registerDatasheetFonts();
  const data = await fetchAll();

  if (flags.all) {
    const catalogue = datasheetCatalogue(data.productRows, data.applianceRows);
    let allOk = true;
    for (const entry of catalogue) {
      allOk = (await renderOne(entry.model, data, null)) && allOk;
    }
    if (!allOk) process.exitCode = 1;
    return;
  }

  const ok = await renderOne(
    String(flags.model).toUpperCase(),
    data,
    (positional[0] as string | undefined) ?? null,
  );
  if (!ok) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
