// Render the 3-page datasheet layout mockup to a PDF on disk, for review.
//
// Run with:
//   node --import tsx scripts/render-datasheet-mockup.ts [outPath]
//
// To check newly-landed photography in the two frames (ADR 0108), point it at a
// model — this substitutes /datasheet/{model}-front.png and -rear.png into the
// placeholder's photo slots, which are otherwise null and render as held frames:
//   node --import tsx scripts/render-datasheet-mockup.ts --model v400
//   node --import tsx scripts/render-datasheet-mockup.ts --model v400 out.pdf
//
// Or name the files directly, when they do not follow the convention yet:
//   node --import tsx scripts/render-datasheet-mockup.ts --front /datasheet/x.png
//
// Everything except the two photos stays V800 placeholder copy — `--model v400`
// renders V400 *images* inside a V800 *sheet*. It is an asset check, not a V400
// datasheet, and the figures on it are wrong for any other purpose.
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

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { DatasheetPdf } from "../src/lib/datasheet/DatasheetPdf";
import { V800_PLACEHOLDER } from "../src/lib/datasheet/placeholder";
import { registerDatasheetFonts } from "../src/lib/datasheet/tokens";

/** `--flag value` and `--flag=value` both, plus the first bare arg as outPath. */
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
    } else {
      // A bare `--front` with no value would otherwise silently swallow outPath.
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new Error(`${arg} needs a value — e.g. ${arg} /datasheet/v400-front.png`);
      }
      flags[arg.slice(2)] = next;
      i++;
    }
  }
  return { flags, positional };
}

async function main(): Promise<void> {
  const { flags, positional } = parseArgs(process.argv.slice(2));

  const known = new Set(["model", "front", "rear"]);
  const unknown = Object.keys(flags).filter((k) => !known.has(k));
  if (unknown.length > 0) {
    throw new Error(`unknown flag(s): ${unknown.map((k) => `--${k}`).join(", ")}`);
  }

  const model = flags.model?.trim().toLowerCase();
  // An explicit --front/--rear wins over the --model shorthand, so one frame can
  // be overridden without spelling out both.
  const front = flags.front ?? (model ? `/datasheet/${model}-front.png` : null);
  const rear = flags.rear ?? (model ? `/datasheet/${model}-rear.png` : null);

  // A photo-check render carries V800 figures next to another model's images, so it
  // must not land in datasheets/ — that folder is the tracked design handoff, and a
  // stray `v400-3page-mockup.pdf` there would read as a V400 datasheet by its
  // filename alone. staging/ is gitignored, which is what a throwaway wants.
  const isPhotoCheck = front !== null || rear !== null;
  const defaultOut = isPhotoCheck
    ? `staging/${model ?? "photo"}-photo-check.pdf`
    : "datasheets/v800-3page-mockup.pdf";
  const out = resolve(positional[0] ?? defaultOut);
  mkdirSync(dirname(out), { recursive: true });

  const data = {
    ...V800_PLACEHOLDER,
    productPhoto: front
      ? { ...V800_PLACEHOLDER.productPhoto, path: front }
      : V800_PLACEHOLDER.productPhoto,
    rearIo: rear ? { ...V800_PLACEHOLDER.rearIo, path: rear } : V800_PLACEHOLDER.rearIo,
  };

  // loadPng resolves against process.cwd() + "public", swallows any read error and
  // returns null — so a typo'd path renders an empty frame that looks exactly like
  // "not shot yet". Check the files here, where it can still be said out loud.
  for (const [label, path] of [
    ["--front", front],
    ["--rear", rear],
  ] as const) {
    if (!path) continue;
    if (!existsSync(resolve(process.cwd(), "public", path.replace(/^\//, "")))) {
      throw new Error(
        `${label} ${path} does not exist under public/ — the frame would render empty. ` +
          `Run from the repo root; loadPng resolves against the working directory.`,
      );
    }
  }

  // Layout resolves the font families before the component body runs, so
  // registering inside DatasheetPdf alone is too late for the first render.
  registerDatasheetFonts();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = createElement(DatasheetPdf, { data }) as any;
  const buffer = await renderToBuffer(element);
  writeFileSync(out, buffer);

  console.log(`Wrote ${out} — ${(buffer.length / 1024).toFixed(0)} KB`);
  console.log(`  page 1 hero: ${front ?? "held frame (no photo)"}`);
  console.log(`  page 2 rear: ${rear ?? "held frame (no photo)"}`);
  if (model) {
    console.log("  NOTE: V800 placeholder copy — only the two photos are per-model.");
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
