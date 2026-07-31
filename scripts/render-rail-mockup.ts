// Render the single-page "Rail" workstation datasheet to a PDF on disk, from
// LIVE appliance_specs data, for review.
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
// COPY is authored here and marked AUTHORED: the headline sentence, the matrix
// caption, the footer note and the compliance pill labels. Those are
// mockup quality and want a marketing pass before anything ships. Everything
// marked DB comes from the row.
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
import type { RailContent, RailSpecRow, StreamRow } from "../src/lib/datasheet/rail-types";

type MatrixRow = {
  resolution: string;
  codec: string;
  cameras: number;
  fps: number;
  bandwidth_mbps: number;
};

/** Spec sheets were transcribed with CRLFs and bullet dashes in the long text
 *  columns; the datasheet wants one flowing run per row. */
function clean(value: unknown): string {
  return String(value)
    .replace(/\r/g, "")
    .replace(/\s*\n\s*-\s*/g, " · ")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*\.\s*$/, "")
    .trim();
}

/** Only emit a spec row when the column actually has a value. SW10 has empty
 *  raid_support, cooling, remote_mgmt, storage_temp, regulatory_emissions and
 *  security_features — its own `notes` column records that the source factsheet
 *  lacks those blocks. A shorter table is correct; inventing rows is not, and a
 *  TPM/encryption claim it never made would be worse than either. */
function row(label: string, value: unknown): RailSpecRow[] {
  if (value === null || value === undefined || String(value).trim() === "") return [];
  const text = clean(value);
  return text === "" ? [] : [{ label, value: text }];
}

/** Resolution labels. The pixel dimensions are the workstation factsheet's own
 *  — note 4MP is 2592×1944 here, NOT the Ledger sheet's 2560×1440. */
const RESOLUTION_LABEL: Record<string, string> = {
  "4MP": "4MP (2592×1944)",
  "8MP": "8MP (3840×2160)",
};

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

function buildContent(sw: Record<string, unknown>): RailContent {
  const bandwidth = Number(sw.max_bandwidth_mbps); // DB
  const gpuCount = Number(sw.gpu_count); // DB
  const model = String(sw.product_group); // DB, e.g. "SW10"
  const monitorSupport = String(sw.monitor_support ?? "");
  const monitors = monitorSupport.match(/Up to (\d+)x/)?.[1] ?? "—"; // DB
  // "8 GB GDDR6 with ECC - 128-bit - 192 GB/sec" → the headline half only; the
  // full string still appears verbatim in the GPU spec row.
  const vramShort = String(sw.gpu_vram ?? "").split(" - ")[0].trim();

  const matrix: StreamRow[] = ((sw.camera_matrix ?? []) as MatrixRow[])
    // Sorted rather than left in insertion order so two SKUs never present the
    // same four rows in a different sequence.
    .slice()
    .sort((a, b) => a.resolution.localeCompare(b.resolution) || a.codec.localeCompare(b.codec))
    .map((m) => ({
      resolution: RESOLUTION_LABEL[m.resolution] ?? m.resolution,
      codec: m.codec,
      streams: m.cameras,
      bandwidth: `${m.bandwidth_mbps} Mbit/s`,
    }));
  const fps = ((sw.camera_matrix ?? []) as MatrixRow[])[0]?.fps ?? 15; // DB

  return {
    model,
    runningMark: "VIDEOX V5",
    // DB — "Performance Tower, with enhanced cooling, ..." and
    // "VideoX V5 SW10 Security Workstation" respectively.
    productClass: [
      String(sw.form_factor ?? "").split(",")[0].trim(),
      String(sw.model_name ?? "").split(`${model} `)[1] ?? "Security Workstation",
    ],
    partNumber: String(sw.id), // DB

    attributesHeading: "Key attributes",
    // All seven are DB values, reworded only for length.
    attributes: [
      `Up to ${bandwidth} Mbit/s decode bandwidth`,
      `${gpuCount}× ${sw.gpu_model} GPU, ${vramShort}`,
      `${sw.cpu_model}, ${sw.cores_threads}, ${sw.cpu_turbo_ghz}`,
      `${sw.ram_spec} RAM`,
      `${sw.gbe_10_ports}× 10Gb Ethernet connectivity`,
      `Up to ${monitors} monitors supported`,
      String(sw.os_edition).replace("Microsoft ", ""),
    ],

    // The 3-year seal graphic DOES NOT EXIST — the handoff says one needs
    // producing. sealPath stays null so the template holds a 62px circle. The
    // repo's only seal asset reads FIVE YEAR; pointing at it would print a
    // false warranty claim on a customer-facing document.
    warranty: {
      years: Number(sw.warranty_years), // DB
      title: `${sw.warranty_years}-Year NBD Warranty`,
      // DB terms, plus the handoff's statement of the upgrade policy.
      body: `${clean(sw.warranty_terms)}. Optional 5-year upgrade must be purchased with the unit.`,
      sealPath: null,
    },

    complianceHeading: "Compliance",
    // AUTHORED labels, condensed from the DB's regulatory_safety
    // ("BSMI, CE, FCC(Class B), Energy Star.") and ndaa_text. Three pills is
    // what the rail's 170px inner measure holds without wrapping.
    compliance: ["NDAA", "CE / FCC", "ENERGY STAR"],

    address: ["Arxys · 1810 Gillespie Way", "Suite 108, El Cajon, CA 92020", "619.258.7800 · arxys.com"],

    // AUTHORED — the design handoff's headline sentence for this sheet.
    headline: "Client View workstation for high-density, multi-monitor monitoring",
    usage: clean(sw.usage_paragraph), // DB
    productPhoto: {
      path: (sw.product_photo_path as string | null) || null, // DB
      placeholder: `${model} tower — product photography`,
    },

    matrixHeading: "Camera stream matrix",
    ceilingLine: `Ceiling: ${bandwidth} Mbit/s · ${monitors} monitors`, // DB
    matrix,
    // AUTHORED, except the two figures. "Streams, not cameras" is load-bearing
    // terminology per the handoff — never relabel this column "Cameras".
    matrixCaption:
      "Counts are camera streams, not cameras — a multisensor or multi-head device presents several streams to the VMS. " +
      "Counts are approximations within the limits of maximum supported bandwidth and always VMS dependant. " +
      `Testing performed with ${monitors} monitors at ${fps}fps; connecting additional monitors may reduce total counts. ` +
      "A VMS may require monitors be load balanced across GPUs, or all monitors on one GPU.",

    // Ten rows each. Balanced BY ROW COUNT, not semantics — Bandwidth and
    // Monitors sit on the right purely for balance, exactly as the handoff
    // says, because an unbalanced grid is what overflowed the page in design.
    hardwareHeading: "Hardware",
    hardware: [
      ...row("Form factor", sw.form_factor),
      ...row("CPU", `${sw.cpu_model} · ${sw.cores_threads} · ${sw.cpu_base_ghz}/${sw.cpu_turbo_ghz} · ${sw.cpu_cache}`),
      ...row(
        "GPU",
        `${gpuCount}× ${sw.gpu_model}, ${sw.gpu_vram}, ${sw.gpu_encoders}× encode / ${sw.gpu_decoders}× decode, ` +
          `${sw.gpu_cuda_cores} CUDA, ${sw.gpu_tensor_cores} Tensor, ${sw.gpu_rt_cores} RT`,
      ),
      ...row("RAM", sw.ram_spec),
      ...row("OS", sw.os_edition),
      ...row("VMS / OS drive", sw.os_drive_desc),
      ...row("Network", sw.network),
      ...row("Display", sw.display_ports),
      ...row("Front I/O", sw.front_io),
      ...row("Rear I/O", sw.rear_io),
    ],
    performanceHeading: "Performance & environmental",
    performance: [
      ...row("Bandwidth", `${bandwidth} Mbit/s maximum for video decoding and display — VMS and configuration dependant`),
      ...row("Monitors", sw.monitor_support),
      ...row("Power", `${sw.power_wattage}, ${sw.power_ac_input}`),
      ...row("Max draw", sw.power_max_consumption),
      ...row("Dimensions", `${sw.dimensions_mm} · ${sw.dimensions_in}`),
      ...row("Weight", sw.shipping_weight),
      ...row("Operating temp", sw.operating_temp),
      ...row("Humidity", sw.humidity),
      ...row("Safety", sw.regulatory_safety),
      ...row("Trade", sw.ndaa_text),
    ],

    // AUTHORED.
    footerNote: [
      "VMS licensing and support is not included and is provided by the security partner or customer.",
      "For more information visit arxys.com/videox-appliances",
    ],
  };
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
  const rows = (await res.json()) as Record<string, unknown>[];
  const sw = rows[0];
  // SW25/SW30/SW35 appear in old fixtures but were EOL'd from the Price Book
  // and have no appliance_specs row — only SW10 and SW20 are live.
  if (!sw) throw new Error(`no appliance_specs row for product_group ${group} (live: SW10, SW20)`);
  if (sw.family_type !== "workstation") {
    throw new Error(`${group} is family_type "${sw.family_type}" — the Rail template is for workstations`);
  }

  const content = buildContent(sw);

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
  console.log(`  seal         : HELD FRAME — ${content.warranty.years}yr, and no 3-year seal graphic exists`);
  console.log(`  matrix rows  : ${content.matrix.length}`);
  console.log(`  spec rows    : ${content.hardware.length} hardware / ${content.performance.length} performance`);
  if (pages !== 1) console.error(`  ⚠ OVERFLOW — the Rail template is specced at ONE page, this rendered ${pages}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
