// Stage 5: append the built candidate rows to the two Hanwha seed files, and
// strip the four cross-model aliases that were masking live SKUs.
// Formatting matches the existing files exactly: 2-space indent, one key per
// line, but model_aliases and sensor_detail rendered INLINE.
import { readFileSync, writeFileSync } from "node:fs";

const DIR = "/Users/andynewbom/Developer/Arxys Portal/Hanwha Camera Seed";
const DATA = "/Users/andynewbom/Developer/Arxys Portal/data";

const KEYS = [
  "vendor",
  "model",
  "model_aliases",
  "sensor_count",
  "max_width",
  "max_height",
  "sensor_detail",
  "currently_shipping",
  "source_url",
  "as_of_date",
] as const;

// Aliases that name a DIFFERENT live SKU. Once that SKU has its own row the
// alias only creates a duplicate match on one search term, so it is removed.
const STRIP_ALIAS: Record<string, string> = {
  "XNO-8082R": "XNO-8083R",
  "XNO-9083R": "XNO-9082R",
  "XNV-8083R": "XNV-8083RZ",
  "XNV-9083R": "XNV-9083RZ",
};

type Row = Record<string, unknown>;

// Inline renderer matching the existing files byte-for-byte: ", " between
// array/object members and ": " after object keys (JSON.stringify emits no
// spaces, which would rewrite every pre-existing alias line as diff noise).
function inline(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(inline).join(", ")}]`;
  if (typeof v === "object" && v !== null) {
    return `{${Object.entries(v)
      .map(([k, val]) => `${JSON.stringify(k)}: ${inline(val)}`)
      .join(", ")}}`;
  }
  return JSON.stringify(v);
}

function render(rows: Row[]): string {
  const body = rows
    .map((r) => {
      const lines = KEYS.filter((k) => k in r).map(
        (k) => `    ${JSON.stringify(k)}: ${inline(r[k])}`,
      );
      return `  {\n${lines.join(",\n")}\n  }`;
    })
    .join(",\n");
  return `[\n${body}\n]\n`;
}

function load(p: string): Row[] {
  return JSON.parse(readFileSync(p, "utf-8"));
}

for (const [file, candidate] of [
  ["hanwha-camera-specs.json", "_candidate-single.json"],
  ["hanwha-camera-specs-multisensor.json", "_candidate-multisensor.json"],
] as const) {
  const existing = load(`${DATA}/${file}`);
  const incoming = load(`${DIR}/${candidate}`);

  // Guard: never append a model that already has a row in this file.
  const have = new Set(existing.map((r) => String(r.model)));
  const dupes = incoming.filter((r) => have.has(String(r.model)));
  if (dupes.length) {
    console.error(
      `ABORT ${file}: ${dupes.length} incoming model(s) already present: ${dupes
        .map((d) => d.model)
        .join(", ")}`,
    );
    process.exit(1);
  }

  // Strip the masking aliases from the owning rows.
  let stripped = 0;
  for (const r of existing) {
    const bad = STRIP_ALIAS[String(r.model)];
    if (!bad) continue;
    const before = (r.model_aliases as string[]) ?? [];
    const after = before.filter((a) => a.toUpperCase() !== bad.toUpperCase());
    if (after.length !== before.length) {
      r.model_aliases = after;
      stripped++;
      console.log(`  ${file}: stripped alias "${bad}" from ${r.model}`);
    }
  }

  const merged = [...existing, ...incoming];
  writeFileSync(`${DATA}/${file}`, render(merged));
  console.log(
    `${file}: ${existing.length} -> ${merged.length} (+${incoming.length}), ${stripped} alias fix(es)`,
  );
}
