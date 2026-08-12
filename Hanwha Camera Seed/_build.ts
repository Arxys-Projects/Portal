// Stage 3/4 prep: turn scraped official resolutions into seed rows.
// Runs the REAL mapPixelsToBucket during prep (not at load time) so any
// out-of-range camera surfaces here, and cross-checks family siblings for
// divergent dimensions. Writes nothing into data/ — emits candidate files for
// review.
import { readFileSync, writeFileSync } from "node:fs";
import {
  mapPixelsToBucket,
  LARGEST_BUCKET,
} from "../src/lib/calculator/camera-resolution";

const DIR = "/Users/andynewbom/Developer/Arxys Portal/Hanwha Camera Seed";
const DATA = "/Users/andynewbom/Developer/Arxys Portal/data";
const AS_OF = "2026-08-11";

type Spec = {
  model: string;
  ok: boolean;
  error?: string;
  max_width?: number;
  max_height?: number;
  mp?: number;
  channel_count?: number;
  title?: string | null;
  source_url?: string;
};

type DeltaEntry = {
  model: string;
  item_type: string;
  mp_band: string;
  sensor_hint: number | null;
  seed_file: "single" | "multisensor";
  model_aliases: string[];
  unmasked_from?: string;
};

// Stage 4 judgment. sensor_count and sensor_detail are decided here, never
// parsed from the price-list string. Only NEW rows appear; existing rows are
// not touched in this pass.
const MULTISENSOR: Record<
  string,
  { sensors: number; note: string }
> = {
  // Genuine dual-imager BCR cameras. Datasheet (DataSheet_TNS-90x0IBC_250325_EN)
  // Imaging Device: "Global Shutter Mono 1\" CMOS" + "Global Shutter Color 1\"
  // CMOS"; Resolution row: "Mono: Max 4096x2160" / "Color: Max 4096x2160".
  // Both imagers equal, so ADR 0058 Option C sizes at 4096x2160 x2.
  "TNS-9040IBC": { sensors: 2, note: "Dual global-shutter imagers (mono for barcode reading + color for video monitoring), both 4096x2160" },
  "TNS-9050IBC": { sensors: 2, note: "Dual global-shutter imagers (mono for barcode reading + color for video monitoring), both 4096x2160" },
  "TNS-9060IBC": { sensors: 2, note: "Dual global-shutter imagers (mono for barcode reading + color for video monitoring), both 4096x2160" },
};

// Models the US product page does not serve a spec table for. Values read from
// the official Hanwha source named in `via` — never a reseller listing.
const OVERRIDES: Record<
  string,
  { width: number; height: number; url: string; via: string }
> = {
  // No US product page (soft 404); spec table served on the global site.
  "XNV-A8084RS": {
    width: 2560,
    height: 1920,
    url: "https://www.hanwhavision.com/global/products/product-details/xnv-a8084rs",
    via: "global product page Resolution row",
  },
  // No US product page (soft 404); spec table served on the UK site.
  "ANO-L7082R": {
    width: 2560,
    height: 1440,
    url: "https://www.hanwhavision.com/uk/products/product-details/ano-l7082r",
    via: "UK product page Resolution row",
  },
  // US page exists but publishes no spec table; read from the official datasheet PDF.
  "TNS-9040IBC": {
    width: 4096,
    height: 2160,
    url: "https://hvsgmpprdstorage.blob.core.windows.net/pim/CDB/TNS-9040IBC/DataSheet_TNS-9040IBC_250325_EN.pdf",
    via: "official datasheet PDF Resolution row",
  },
  "TNS-9050IBC": {
    width: 4096,
    height: 2160,
    url: "https://hvsgmpprdstorage.blob.core.windows.net/pim/CDB/TNS-9050IBC/DataSheet_TNS-9050IBC_250325_EN.pdf",
    via: "official datasheet PDF Resolution row",
  },
  "TNS-9060IBC": {
    width: 4096,
    height: 2160,
    url: "https://hvsgmpprdstorage.blob.core.windows.net/pim/CDB/TNS-9060IBC/DataSheet_TNS-9060IBC_250325_EN.pdf",
    via: "official datasheet PDF Resolution row",
  },
};

// Physically multi-imager cameras that expose ONE stitched panoramic channel,
// so the VMS records a single stream and sensor_count is 1 for the storage
// math. Recorded so this is not re-litigated from the "Panoramic" marketing
// string. Datasheet evidence: PNM-9031RV's spec table is headed "Panoramic
// channel"; PNM-A13022RV's "3 virtual channel support" are crops of one image.
const STITCHED_PANORAMIC: Record<string, string> = {
  "PNM-9031RV": "Multi-imager camera exposing a single stitched panoramic channel; datasheet spec table is headed \"Panoramic channel\". sensor_count 1 because one stream is recorded.",
  "PNM-A13022RV": "Multi-imager camera exposing a single stitched panoramic channel (up to 3 virtual channels, which are crops of the one image, not separate imagers). sensor_count 1 because one stream is recorded.",
  "PNM-C9022RV": "Multi-imager camera exposing a single stitched panoramic channel. sensor_count 1 because one stream is recorded. Replacement for the EOL PNM-9022V.",
};

// Models whose roster seed_file says "single" and which Stage 4 confirms are
// single-imager despite a multi-sounding Item Type. Recorded so the reasoning
// is not re-derived from the marketing string.
const CONFIRMED_SINGLE = new Set([
  "QNE-C8013RL", // "Dual Light" = IR + white light on one imager
  "QNE-C9013RL",
]);

const specs: Spec[] = JSON.parse(readFileSync(`${DIR}/_specs.json`, "utf-8"));
const delta = JSON.parse(readFileSync(`${DIR}/hanwha-delta.json`, "utf-8")) as {
  new_single: DeltaEntry[];
  new_multisensor: DeltaEntry[];
};
const byModel = new Map(specs.map((s) => [s.model, s]));
const entries = [...delta.new_single, ...delta.new_multisensor];

// Existing rows, for family-sibling comparison.
const existing = [
  ...JSON.parse(readFileSync(`${DATA}/hanwha-camera-specs.json`, "utf-8")),
  ...JSON.parse(
    readFileSync(`${DATA}/hanwha-camera-specs-multisensor.json`, "utf-8"),
  ),
] as Array<{ model: string; max_width: number; max_height: number }>;

// Family core = everything after the first hyphen. XNV-C9083R / XNO-C9083R /
// QNV-C9083R all share core "C9083R", which is the ADR-noted case where
// dimensions must agree across the family.
const core = (m: string) => m.split("-").slice(1).join("-").toUpperCase();

const aliasesFor = (model: string, rosterAliases: string[]) => {
  const set = new Set(rosterAliases ?? []);
  set.add(model.replace(/-/g, ""));
  set.add(`Wisenet ${model}`);
  set.delete(model);
  return [...set];
};

const rowsSingle: unknown[] = [];
const rowsMulti: unknown[] = [];
const failed: Array<{ model: string; reason: string }> = [];
const overBucket: Array<{ model: string; dims: string; mp: number }> = [];
const bandMismatch: Array<{ model: string; band: string; actual: string }> = [];

for (const e of entries) {
  const ov = OVERRIDES[e.model];
  const scraped = byModel.get(e.model);
  const s: Spec | undefined = ov
    ? {
        model: e.model,
        ok: true,
        max_width: ov.width,
        max_height: ov.height,
        mp: (ov.width * ov.height) / 1e6,
        source_url: ov.url,
      }
    : scraped;

  if (!s || !s.ok || !s.max_width || !s.max_height) {
    failed.push({ model: e.model, reason: scraped?.error ?? "not scraped" });
    continue;
  }

  const bucket = mapPixelsToBucket(s.max_width, s.max_height);
  if (bucket === null) {
    overBucket.push({
      model: e.model,
      dims: `${s.max_width}x${s.max_height}`,
      mp: s.mp ?? 0,
    });
    continue; // must not be seeded: no bucket exists
  }

  // Sanity-check the datasheet value against the price-list band (triage only).
  const mp = (s.max_width * s.max_height) / 1e6;
  const bandMp: Record<string, [number, number]> = {
    "3MP": [2.8, 3.6],
    "4MP": [3.6, 4.6],
    "5MP": [4.6, 5.6],
    "6MP": [5.6, 6.6],
    "4K Cameras & up": [7.4, 13.0],
    "8K": [24, 40],
  };
  const range = bandMp[e.mp_band];
  if (range && (mp < range[0] || mp > range[1])) {
    bandMismatch.push({
      model: e.model,
      band: e.mp_band,
      actual: `${s.max_width}x${s.max_height} = ${mp.toFixed(2)}MP`,
    });
  }

  const ms = MULTISENSOR[e.model];
  const row: Record<string, unknown> = {
    vendor: "Hanwha",
    model: e.model,
    model_aliases: aliasesFor(e.model, e.model_aliases),
    sensor_count: ms ? ms.sensors : 1,
    max_width: s.max_width,
    max_height: s.max_height,
    sensor_detail: ms
      ? {
          sensors: ms.sensors,
          per_sensor: `${s.max_width}x${s.max_height}`,
          per_sensor_mp: Math.round(mp * 100) / 100,
          total_mp: Math.round(mp * ms.sensors * 100) / 100,
          note: ms.note,
        }
      : STITCHED_PANORAMIC[e.model]
        ? { sensors: 1, note: STITCHED_PANORAMIC[e.model] }
        : null,
    currently_shipping: true,
    source_url: s.source_url,
    as_of_date: AS_OF,
  };
  (ms ? rowsMulti : rowsSingle).push(row);
}

// Family-sibling divergence across new rows AND existing rows.
const famMap = new Map<string, Map<string, string[]>>();
for (const r of [
  ...(rowsSingle as Array<Record<string, unknown>>),
  ...(rowsMulti as Array<Record<string, unknown>>),
]) {
  const c = core(r.model as string);
  const dim = `${r.max_width}x${r.max_height}`;
  if (!famMap.has(c)) famMap.set(c, new Map());
  const g = famMap.get(c)!;
  g.set(dim, [...(g.get(dim) ?? []), `${r.model} (new)`]);
}
for (const r of existing) {
  const c = core(r.model);
  if (!famMap.has(c)) continue; // only families touched by this pass
  const dim = `${r.max_width}x${r.max_height}`;
  const g = famMap.get(c)!;
  g.set(dim, [...(g.get(dim) ?? []), `${r.model} (seeded)`]);
}
const familyConflicts = [...famMap.entries()]
  .filter(([, g]) => g.size > 1)
  .map(([c, g]) => ({
    family: c,
    variants: [...g.entries()].map(([dim, models]) => ({ dim, models })),
  }));

writeFileSync(
  `${DIR}/_candidate-single.json`,
  JSON.stringify(rowsSingle, null, 2) + "\n",
);
writeFileSync(
  `${DIR}/_candidate-multisensor.json`,
  JSON.stringify(rowsMulti, null, 2) + "\n",
);

console.log(`built: ${rowsSingle.length} single, ${rowsMulti.length} multisensor`);
console.log(`largest bucket: ${LARGEST_BUCKET.label}`);
console.log(`\nCONFIRMED_SINGLE applied: ${[...CONFIRMED_SINGLE].join(", ")}`);

console.log(`\nover-bucket (CANNOT seed, ${overBucket.length}):`);
for (const o of overBucket) console.log(`  ${o.model}  ${o.dims}  ${o.mp}MP`);

console.log(`\nscrape failures (${failed.length}):`);
for (const f of failed) console.log(`  ${f.model}: ${f.reason}`);

console.log(`\nband mismatch vs price list (${bandMismatch.length}):`);
for (const b of bandMismatch)
  console.log(`  ${b.model}: band=${b.band} actual=${b.actual}`);

console.log(`\nfamily dimension conflicts (${familyConflicts.length}):`);
for (const f of familyConflicts) {
  console.log(`  ${f.family}:`);
  for (const v of f.variants) console.log(`    ${v.dim} -> ${v.models.join(", ")}`);
}
