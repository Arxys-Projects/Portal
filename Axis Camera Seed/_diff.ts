// Stage 1 (read-only): diff the Q3 2026 Axis extraction against live camera_specs.
// No writes. Emits axis-delta.json. Mirrors Hanwha Camera Seed/_diff.ts.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import {
  mapPixelsToBucket,
  LARGEST_BUCKET,
} from "../src/lib/calculator/camera-resolution";

const SEED_DIR = "/Users/andynewbom/Developer/Arxys Portal/Axis Camera Seed";

const env = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
};
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("missing Supabase env vars");
}

// Extracted models always carry an "AXIS " brand prefix ("AXIS Q1728-LE");
// existing camera_specs rows mostly do not ("Q1728-LE"), though a handful of
// their aliases do carry it ("AXIS Q3839-PVE"). Strip a leading AXIS token
// before collapsing, so both sides normalize to the same key regardless of
// which form either side happens to use.
const norm = (s: string) =>
  s
    .toUpperCase()
    .replace(/^\s*AXIS\s+/, "")
    .replace(/[^A-Z0-9]/g, "");

// Categories in scope per axis_seed_refresh_brief.md section 2.
const IN_SCOPE_CATEGORIES = new Set([
  "Box cameras",
  "Bullet cameras",
  "Modular cameras",
  "Dome cameras",
  "Panoramic cameras",
  "Pan/tilt/zoom cameras",
]);
// Thermal cameras (7 rows) deliberately deferred this pass — see ADR 0134.
// Explosion-protected devices and Canon network cameras are out of scope per
// the brief and use an entirely different column schema (verified separately).

type ExtractedRow = {
  model: string;
  category: string;
  series?: string;
  page?: number;
  max_video_resolution?: string;
  sensor_lens_fov?: string;
  [k: string]: unknown;
};

// Parse the first WxH pixel pair out of a max_video_resolution string. Several
// rows bundle multiple sensors/modes ("Visual: 1920x1080 ... Thermal: ...");
// callers must decide which pair is authoritative per-row, not assume position.
function parseResolutions(s: string): Array<{ w: number; h: number }> {
  const out: Array<{ w: number; h: number }> = [];
  const re = /(\d{3,5})\s*x\s*(\d{3,5})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    out.push({ w: parseInt(m[1], 10), h: parseInt(m[2], 10) });
  }
  return out;
}

// Multisensor detection: sensor_lens_fov strings for true simultaneous
// multi-stream cameras start with an explicit "Nx" sensor-count prefix (e.g.
// "4x 1/2.3\", 5.05 mm F1.7, 180°"). Dual-LENS-VARIANT models (pick-one-lens
// at purchase, e.g. Q1728-LE "13 mm: ... 48 mm: ...") are NOT multisensor —
// precedent: Q1728-LE is already seeded as sensor_count=1 (data/axis-camera-specs.json).
function detectSensorCount(fov: string | undefined): number {
  if (!fov) return 1;
  const m = /^\s*(\d+)\s*x\s/i.exec(fov);
  return m ? parseInt(m[1], 10) : 1;
}

async function main() {
  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data, error } = await admin
    .from("camera_specs")
    .select(
      "model, model_aliases, sensor_count, max_width, max_height, currently_shipping, source_url, as_of_date",
    )
    .eq("vendor", "Axis");
  if (error) throw new Error(error.message);

  const table = (data ?? []) as Array<{
    model: string;
    model_aliases: string[] | null;
    sensor_count: number;
    max_width: number;
    max_height: number;
    currently_shipping: boolean;
    source_url: string | null;
    as_of_date: string | null;
  }>;

  console.log(`live Axis rows: ${table.length}`);

  const covered = new Map<
    string,
    { row: string; via: "model" | "alias" }
  >();
  for (const r of table) {
    covered.set(norm(r.model), { row: r.model, via: "model" });
    for (const a of r.model_aliases ?? []) {
      const k = norm(a);
      if (!covered.has(k)) covered.set(k, { row: r.model, via: "alias" });
    }
  }

  const extracted = JSON.parse(
    readFileSync(`${SEED_DIR}/axis-cameras-normalized-2026-q3.json`, "utf-8"),
  ) as ExtractedRow[];

  // Bispectral visual+thermal models hide inside other categories too (e.g.
  // AXIS Q87, AXIS Q6411-LE are both "Pan/tilt/zoom cameras", not "Thermal
  // cameras") — a category-label filter alone misses them. Scan every field
  // for a thermal/bispectral signature and defer those regardless of category
  // (same ADR 0134 decision as the dedicated Thermal cameras category).
  const isHiddenThermal = (r: ExtractedRow) =>
    JSON.stringify(r).toLowerCase().includes("thermal") ||
    JSON.stringify(r).toLowerCase().includes("bispectral");

  // Restrict to the 7 in-scope-per-brief categories plus "Thermal cameras"
  // itself, so an incidental "thermal"/"bispectral" hit inside an
  // already-out-of-scope category (e.g. Q1961-XTE, Explosion-protected
  // devices) doesn't get counted here — it's out of scope for that reason
  // regardless, and double-counting it would misstate the thermal-deferral count.
  const CANDIDATE_CATEGORIES = new Set([
    ...IN_SCOPE_CATEGORIES,
    "Thermal cameras",
  ]);
  const inScope = extracted.filter(
    (r) => IN_SCOPE_CATEGORIES.has(r.category) && !isHiddenThermal(r),
  );
  const thermalDeferred = extracted.filter(
    (r) =>
      CANDIDATE_CATEGORIES.has(r.category) &&
      (r.category === "Thermal cameras" || isHiddenThermal(r)),
  );
  console.log(
    `extracted total: ${extracted.length}, in-scope categories: ${inScope.length}, thermal deferred: ${thermalDeferred.length}`,
  );

  const new_single: unknown[] = [];
  const new_multisensor: unknown[] = [];
  const alias_covered: unknown[] = [];
  const exceeds_ceiling: unknown[] = [];
  const no_standalone_resolution: unknown[] = [];
  const matched_for_drift: unknown[] = [];

  const extractedKeys = new Set<string>();
  for (const r of inScope) extractedKeys.add(norm(r.model));

  for (const r of inScope) {
    const sensorCount = detectSensorCount(r.sensor_lens_fov);
    const resPairs = parseResolutions(r.max_video_resolution ?? "");
    // Highest-pixel-count pair is the sizing candidate (ADR 0071: never average).
    const best = resPairs.sort((a, b) => b.w * b.h - a.w * a.h)[0];

    const hit = covered.get(norm(r.model));

    if (!hit) {
      if (!best) {
        // AXIS F2xxx/F4xxx/F7225-RE modular "sensor unit" heads: no
        // max_video_resolution field at all because the datasheet says
        // "See AXIS F91XX Main Units" — resolution depends entirely on
        // whichever main unit the head is paired with. Not seedable
        // standalone; the paired F91xx main units DO have their own
        // resolution and are diffed normally as separate rows.
        no_standalone_resolution.push({
          model: r.model,
          category: r.category,
          reason: r.max_fps ?? "no max_video_resolution field (modular sensor head, paired with a main unit)",
        });
        continue;
      }
      const bucket = mapPixelsToBucket(best.w, best.h);
      if (bucket === null) {
        exceeds_ceiling.push({
          model: r.model,
          category: r.category,
          native: `${best.w}x${best.h}`,
          pixels: best.w * best.h,
          largest_bucket: `${LARGEST_BUCKET.width}x${LARGEST_BUCKET.height}`,
          reason: "exceeds RESOLUTIONS ceiling — precedent ADR 0121, do not seed this pass",
        });
        continue;
      }
      const entry = {
        model: r.model,
        category: r.category,
        series: r.series,
        page: r.page,
        sensor_count: sensorCount,
        max_width: best.w,
        max_height: best.h,
        max_video_resolution_raw: r.max_video_resolution,
        sensor_lens_fov_raw: r.sensor_lens_fov,
      };
      if (sensorCount > 1) new_multisensor.push(entry);
      else new_single.push(entry);
    } else if (hit.via === "alias") {
      alias_covered.push({ extracted_model: r.model, existing_row: hit.row });
    } else {
      // Already seeded under its own model name — check for resolution/sensor_count drift.
      const existingRow = table.find((t) => norm(t.model) === norm(r.model))!;
      if (best) {
        const bucket = mapPixelsToBucket(best.w, best.h);
        const drift =
          existingRow.max_width !== best.w ||
          existingRow.max_height !== best.h ||
          existingRow.sensor_count !== sensorCount;
        if (drift) {
          matched_for_drift.push({
            model: r.model,
            existing: {
              sensor_count: existingRow.sensor_count,
              max_width: existingRow.max_width,
              max_height: existingRow.max_height,
            },
            extracted: {
              sensor_count: sensorCount,
              max_width: best.w,
              max_height: best.h,
              exceeds_ceiling: bucket === null,
            },
          });
        }
      }
    }
  }

  const delta = {
    generated: "2026-08-17",
    source: "axis-cameras-normalized-2026-q3.json (Axis Q3 2026 Comparison tables PDF)",
    live_axis_rows: table.length,
    extracted_total: extracted.length,
    in_scope: inScope.length,
    thermal_deferred: thermalDeferred.length,
    counts: {
      new_single: new_single.length,
      new_multisensor: new_multisensor.length,
      alias_covered: alias_covered.length,
      exceeds_ceiling: exceeds_ceiling.length,
      no_standalone_resolution: no_standalone_resolution.length,
      matched_for_drift: matched_for_drift.length,
    },
    notes: [
      "Thermal cameras (7 rows) deliberately excluded this pass — no existing precedent for simultaneous visual+thermal streams, resolution model doesn't fit the visible-light RESOLUTIONS buckets. See ADR 0134.",
      "Explosion-protected devices and Canon network cameras were never in scope (different column schema entirely) and are not present in the in-scope filter above.",
      "Rich PDF fields (max_fps, min_illumination_lux, zipstream_codec_support, power, io_ports, etc.) have no column in camera_specs and are not diffed — kept as raw reference on each candidate row only (_raw suffix) for the follow-up session's judgment, never written to the seed JSON as real columns.",
      "sensor_count > 1 only for models whose sensor_lens_fov starts with an explicit 'Nx' prefix (true simultaneous multi-stream). Dual-lens-VARIANT models (pick-one-lens-at-purchase) are sensor_count=1, matching the existing Q1728-LE precedent.",
      "max_width/max_height are the native pixel dimensions of the highest-resolution sensor (never averaged, per ADR 0071), not a RESOLUTIONS bucket value — validated to map within the bucket ceiling via mapPixelsToBucket, but stored raw.",
      "no_standalone_resolution: AXIS F2xxx/F4xxx/F7225-RE modular sensor-unit heads have no max_video_resolution of their own ('See AXIS F91XX Main Units') — resolution is entirely determined by the paired main unit, so these are not seedable as standalone camera_specs rows. The F91xx main units themselves DO have a resolution and are diffed normally.",
    ],
    new_single,
    new_multisensor,
    alias_covered,
    exceeds_ceiling,
    no_standalone_resolution,
    matched_for_drift,
  };

  writeFileSync(
    `${SEED_DIR}/axis-delta.json`,
    JSON.stringify(delta, null, 2) + "\n",
  );

  console.log("\n=== delta ===");
  console.log(JSON.stringify(delta.counts, null, 2));
  console.log("\nexceeds_ceiling:");
  for (const e of exceeds_ceiling as Array<{ model: string }>) {
    console.log(`  ${e.model}`);
  }
  console.log("\nno_standalone_resolution:");
  for (const e of no_standalone_resolution as Array<{ model: string }>) {
    console.log(`  ${e.model}`);
  }
  console.log("\nmatched_for_drift:");
  for (const d of matched_for_drift as Array<{ model: string }>) {
    console.log(`  ${d.model}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
