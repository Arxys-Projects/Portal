// Stage 1 (read-only): diff the August 2026 Hanwha roster against live camera_specs.
// No writes. Emits hanwha-delta.json.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
const SEED_DIR = "/Users/andynewbom/Developer/Arxys Portal/Hanwha Camera Seed";

const env = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
};
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("missing Supabase env vars");
}

// Uppercase and drop every non-alphanumeric char. Superset of the brief's
// "uppercase + strip hyphens": also collapses the space-separated aliases
// ("PNM C16083RVQ") onto the hyphenated model, so alias coverage is not missed.
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

// Four live August-2026 SKUs are named as aliases on sibling rows, so the
// naive alias union suppresses them as "already covered". They are distinct
// cameras (the RZ pair are motorised-zoom variants), so they are forced into
// the new-row buckets and the stray alias is stripped from the owning row.
// Decision 2026-08-11: unmask.
const UNMASK: Record<string, string> = {
  "XNO-8083R": "XNO-8082R",
  "XNO-9082R": "XNO-9083R",
  "XNV-8083RZ": "XNV-8083R",
  "XNV-9083RZ": "XNV-9083R",
};

// Already-seeded rows that fall outside the roster's 3MP+ scope. Absent from
// the active roster because the 2MP band was excluded from the roster build,
// NOT because they are discontinued — all five are absent from the EOL map.
// Must not be reported as discontinued.
const OUT_OF_SCOPE_2MP = new Set([
  "QNO-6083R",
  "QNV-6083R",
  "QNV-C6083R",
  "XNO-6083R",
  "XNV-6083R",
]);

async function main() {
  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data, error } = await admin
    .from("camera_specs")
    .select(
      "model, model_aliases, sensor_count, max_width, max_height, currently_shipping",
    )
    .eq("vendor", "Hanwha");
  if (error) throw new Error(error.message);

  const table = (data ?? []) as Array<{
    model: string;
    model_aliases: string[] | null;
    sensor_count: number;
    max_width: number;
    max_height: number;
    currently_shipping: boolean;
  }>;

  console.log(`live Hanwha rows: ${table.length}`);
  console.log(
    `  currently_shipping=false already: ${table.filter((r) => !r.currently_shipping).map((r) => r.model).join(", ") || "(none)"}`,
  );

  // Comparison set: union of model + every alias, normalized. Map back to the
  // owning row so alias hits can be attributed.
  const covered = new Map<string, { row: string; via: "model" | "alias" }>();
  for (const r of table) {
    covered.set(norm(r.model), { row: r.model, via: "model" });
    for (const a of r.model_aliases ?? []) {
      const k = norm(a);
      if (!covered.has(k)) covered.set(k, { row: r.model, via: "alias" });
    }
  }

  const roster = JSON.parse(
    readFileSync(`${SEED_DIR}/hanwha-roster-2026-08.json`, "utf-8"),
  ) as {
    count: number;
    models: Array<{
      model: string;
      item_type: string;
      mp_band: string;
      sensor_hint: number | null;
      seed_file: "single" | "multisensor";
      model_aliases: string[];
      eol_replacement: string | null;
      is_limited_stock: boolean;
    }>;
  };
  console.log(`roster models: ${roster.models.length} (declared ${roster.count})`);

  const eolMap = JSON.parse(
    readFileSync(`${SEED_DIR}/hanwha-eol-map.json`, "utf-8"),
  );

  const new_single: unknown[] = [];
  const new_multisensor: unknown[] = [];
  const alias_covered: unknown[] = [];

  const rosterKeys = new Set<string>();
  for (const m of roster.models) {
    rosterKeys.add(norm(m.model));
    for (const a of m.model_aliases ?? []) rosterKeys.add(norm(a));
  }

  for (const m of roster.models) {
    const hit = UNMASK[m.model] ? undefined : covered.get(norm(m.model));
    if (!hit) {
      const entry = {
        model: m.model,
        item_type: m.item_type,
        mp_band: m.mp_band,
        sensor_hint: m.sensor_hint,
        seed_file: m.seed_file,
        model_aliases: m.model_aliases,
        is_limited_stock: m.is_limited_stock,
        ...(UNMASK[m.model]
          ? { unmasked_from: UNMASK[m.model], strip_alias_from_owner: m.model }
          : {}),
      };
      if (m.seed_file === "multisensor") new_multisensor.push(entry);
      else new_single.push(entry);
    } else if (hit.via === "alias") {
      alias_covered.push({
        roster_model: m.model,
        existing_row: hit.row,
        mp_band: m.mp_band,
        seed_file: m.seed_file,
      });
    }
    // hit.via === "model" => already seeded under its own model, no bucket.
  }

  // In table, absent from active roster. ANNOTATE ONLY — no deletion.
  // Rows absent only because their band was excluded from the roster build are
  // split out; they are active products, not EOL.
  const absentFromRoster = table.filter((r) => !rosterKeys.has(norm(r.model)));

  const out_of_scope_not_eol = absentFromRoster
    .filter((r) => OUT_OF_SCOPE_2MP.has(r.model))
    .map((r) => ({
      model: r.model,
      max_width: r.max_width,
      max_height: r.max_height,
      reason: "2MP band excluded from roster build; absent from EOL map. Active product, not discontinued.",
    }))
    .sort((a, b) => a.model.localeCompare(b.model));

  const discontinued_in_table = absentFromRoster
    .filter((r) => !OUT_OF_SCOPE_2MP.has(r.model))
    .map((r) => ({
      model: r.model,
      sensor_count: r.sensor_count,
      max_width: r.max_width,
      max_height: r.max_height,
      currently_shipping: r.currently_shipping,
      eol_replacement: eolMap[r.model] ?? eolMap[norm(r.model)] ?? null,
    }))
    .sort((a, b) => a.model.localeCompare(b.model));

  const alreadySeededUnderModel = roster.models.filter(
    (m) => covered.get(norm(m.model))?.via === "model",
  ).length;

  const delta = {
    generated: "2026-08-11",
    source_roster: "hanwha-roster-2026-08.json",
    live_hanwha_rows: table.length,
    roster_models: roster.models.length,
    already_seeded_under_model: alreadySeededUnderModel,
    counts: {
      new_single: new_single.length,
      new_multisensor: new_multisensor.length,
      alias_covered: alias_covered.length,
      discontinued_in_table: discontinued_in_table.length,
      out_of_scope_not_eol: out_of_scope_not_eol.length,
    },
    notes: [
      "discontinued_in_table is a flag-and-annotate list, NOT a removal list. No row is deleted in this pass.",
      "Decision 2026-08-11: EOL annotation SKIPPED this pass. No existing row is updated for EOL and no currently_shipping flag is flipped — the search_camera_specs RPC filters on that column, so flipping it would hide models from the partner picker.",
      "OPEN: PNM-9020V already has currently_shipping = false in prod, so it is already absent from the partner picker.",
      "Decision 2026-08-11: 4 models unmasked from sibling-row aliases (see unmasked_from). Their owning rows need the stray alias stripped.",
    ],
    new_single,
    new_multisensor,
    alias_covered,
    discontinued_in_table,
    out_of_scope_not_eol,
  };

  writeFileSync(
    `${SEED_DIR}/hanwha-delta.json`,
    JSON.stringify(delta, null, 2) + "\n",
  );

  console.log("\n=== delta ===");
  console.log(JSON.stringify(delta.counts, null, 2));
  console.log(`already seeded under own model: ${alreadySeededUnderModel}`);
  console.log(
    `\nalias_covered: ${alias_covered.length ? JSON.stringify(alias_covered) : "(none)"}`,
  );
  console.log("\ndiscontinued_in_table:");
  for (const d of discontinued_in_table) {
    console.log(
      `  ${d.model}  shipping=${d.currently_shipping}  repl=${d.eol_replacement ?? "-"}`,
    );
  }

  // Band breakdown for Stage 3 ordering.
  const byBand: Record<string, number> = {};
  for (const e of [...new_single, ...new_multisensor] as Array<{ mp_band: string }>) {
    byBand[e.mp_band] = (byBand[e.mp_band] ?? 0) + 1;
  }
  console.log("\nnew rows by mp_band:", JSON.stringify(byBand));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
