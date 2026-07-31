// Render the single-page "Rail" workstation datasheet to a PDF on disk, from
// LIVE appliance_specs data, for review.
//
// PREFER scripts/render-datasheet.ts, which does this for either template and
// for any model (`--model SW10`, or `--all`). This script is kept because it
// prints Rail-specific detail — which seal was chosen for the term, matrix and
// spec row counts — that is useful when reviewing a workstation sheet
// specifically. Both call the same adapter, so they cannot disagree.
//
// Run from the repo root (loadPng resolves against process.cwd() + "public"):
//   node --env-file=.env.local --import tsx scripts/render-rail-mockup.ts
//   node --env-file=.env.local --import tsx scripts/render-rail-mockup.ts --model SW20
//   node --env-file=.env.local --import tsx scripts/render-rail-mockup.ts --model SW10 out.pdf
//
// SPEC VALUES ARE READ LIVE from appliance_specs with a read-only PostGREST
// GET, so nothing numeric on the page can be invented. The admin form is the
// only write path for these tables (ADR 0096) — this script never writes.
//
// THE MAPPING NO LONGER LIVES HERE. `buildContent()` moved to
// src/lib/datasheet/from-appliance-specs.ts, where the route uses it too and
// where it has unit tests; the authored copy moved to
// src/lib/datasheet/copy.ts (ADR 0110). This script is now a thin CLI over the
// shared adapter, so a mockup render and a portal download cannot disagree.
//
// WHY .ts AND NOT .mts, like its neighbour render-datasheet-mockup.ts: tsx
// loads `.mts` as ESM and plain `.ts` as CJS (package.json has no "type":
// "module"). A `.mts` entry point would get the ESM copy of
// @react-pdf/renderer while src/lib/datasheet/*.ts get the CJS copy — two
// module instances, two font stores, and registerDatasheetFonts() writing to
// the one the renderer never reads ("Font family not registered: Montserrat",
// from a call that plainly ran). Keep the whole chain CJS.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { RailDatasheetPdf } from "../src/lib/datasheet/RailDatasheetPdf";
import { registerDatasheetFonts } from "../src/lib/datasheet/tokens";
import {
  buildRailContent,
  type ApplianceSpecRow,
} from "../src/lib/datasheet/from-appliance-specs";

function parseArgs(argv: string[]): { flags: Record<string, string>; positional: string[] } {
  const flags: Record<string, string> = {};
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
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      throw new Error(`${arg} needs a value — e.g. ${arg} SW10`);
    }
    flags[arg.slice(2)] = next;
    i++;
  }
  return { flags, positional };
}

async function main(): Promise<void> {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const unknown = Object.keys(flags).filter((k) => k !== "model");
  if (unknown.length > 0) throw new Error(`unknown flag(s): ${unknown.map((k) => `--${k}`).join(", ")}`);
  const group = (flags.model ?? "SW10").toUpperCase();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("need SUPABASE_URL + service key — run with node --env-file=.env.local");
  }

  const res = await fetch(
    `${url}/rest/v1/appliance_specs?select=*&product_group=eq.${encodeURIComponent(group)}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!res.ok) throw new Error(`appliance_specs GET ${res.status}: ${await res.text()}`);
  const rows = (await res.json()) as ApplianceSpecRow[];
  const sw = rows[0];
  // SW25/SW30/SW35 appear in old fixtures but were EOL'd from the Price Book
  // and have no appliance_specs row — only SW10 and SW20 are live.
  if (!sw) throw new Error(`no appliance_specs row for product_group ${group} (live: SW10, SW20)`);
  if (sw.family_type !== "workstation") {
    throw new Error(`${group} is family_type "${sw.family_type}" — the Rail template is for workstations`);
  }

  const content = buildRailContent(sw);

  registerDatasheetFonts();
  const out = resolve(positional[0] ?? `staging/${group.toLowerCase()}-rail-mockup.pdf`);
  mkdirSync(dirname(out), { recursive: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(createElement(RailDatasheetPdf, { data: content }) as any);
  writeFileSync(out, buffer);

  // The sheet is specced at exactly one page with zero slack. Say so out loud
  // rather than letting a silent spill to page 2 pass for a successful render.
  const pages = (buffer.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;

  console.log(`Wrote ${out} — ${(buffer.length / 1024).toFixed(0)} KB, ${pages} page(s)`);
  console.log(`  spec source  : appliance_specs ${sw.id} (updated ${sw.updated_at})`);
  console.log(`  hero photo   : ${content.productPhoto.path ?? "HELD FRAME — none shot"}`);
  console.log(
    `  seal         : ${content.warranty.sealPath ?? "HELD FRAME — no seal graphic for this term"}` +
      ` (${content.warranty.years}-year warranty)`,
  );
  console.log(`  matrix rows  : ${content.matrix.length}`);
  console.log(`  spec rows    : ${content.hardware.length} hardware / ${content.performance.length} performance`);
  if (pages !== 1) console.error(`  ⚠ OVERFLOW — the Rail template is specced at ONE page, this rendered ${pages}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
