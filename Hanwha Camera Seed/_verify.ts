// Post-load verification, read-only. Confirms every intended row landed, the
// alias strips took, and nothing outside the intended set changed.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const DIR = "/Users/andynewbom/Developer/Arxys Portal/Hanwha Camera Seed";
const env = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY!,
};

async function main() {
const admin = createClient(env.url, env.key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await admin
  .from("camera_specs")
  .select("model, model_aliases, sensor_count, max_width, max_height, currently_shipping")
  .eq("vendor", "Hanwha");
if (error) throw new Error(error.message);
const live = new Map(
  (data ?? []).map((r) => [String(r.model), r as Record<string, unknown>]),
);
console.log(`live Hanwha rows: ${live.size}`);

const built = [
  ...JSON.parse(readFileSync(`${DIR}/_candidate-single.json`, "utf-8")),
  ...JSON.parse(readFileSync(`${DIR}/_candidate-multisensor.json`, "utf-8")),
] as Array<{ model: string; max_width: number; max_height: number; sensor_count: number }>;

let ok = 0;
const bad: string[] = [];
for (const b of built) {
  const l = live.get(b.model);
  if (!l) {
    bad.push(`${b.model}: MISSING from table`);
    continue;
  }
  if (
    l.max_width !== b.max_width ||
    l.max_height !== b.max_height ||
    l.sensor_count !== b.sensor_count
  ) {
    bad.push(
      `${b.model}: table ${l.max_width}x${l.max_height} s=${l.sensor_count} != built ${b.max_width}x${b.max_height} s=${b.sensor_count}`,
    );
    continue;
  }
  ok++;
}
console.log(`built rows verified in table: ${ok}/${built.length}`);
if (bad.length) {
  console.log("MISMATCHES:");
  for (const b of bad) console.log(`  ${b}`);
}

// Alias strips must have taken effect.
const STRIP: Record<string, string> = {
  "XNO-8082R": "XNO-8083R",
  "XNO-9083R": "XNO-9082R",
  "XNV-8083R": "XNV-8083RZ",
  "XNV-9083R": "XNV-9083RZ",
};
console.log("\nalias strips:");
for (const [owner, gone] of Object.entries(STRIP)) {
  const l = live.get(owner);
  const aliases = ((l?.model_aliases as string[]) ?? []).map((a) => a.toUpperCase());
  const stillThere = aliases.includes(gone.toUpperCase());
  const ownRow = live.has(gone);
  console.log(
    `  ${owner}: alias "${gone}" removed=${!stillThere}, "${gone}" has own row=${ownRow}`,
  );
}

// The deferred 8K model must NOT be present.
console.log(`\nTNB-9000 present (should be false): ${live.has("TNB-9000")}`);

// Nothing should have been deleted: the 5 EOL + 5 out-of-scope rows still exist.
const mustExist = [
  "PNM-7002VD", "PNM-9020V", "PNM-9022V", "PNM-9322VQP", "TNV-8010C",
  "QNO-6083R", "QNV-6083R", "QNV-C6083R", "XNO-6083R", "XNV-6083R",
];
const missing = mustExist.filter((m) => !live.has(m));
console.log(
  `\npre-existing EOL/out-of-scope rows retained: ${mustExist.length - missing.length}/${mustExist.length}${missing.length ? ` MISSING: ${missing.join(", ")}` : ""}`,
);

// currently_shipping must be untouched apart from the pre-existing PNM-9020V.
const notShipping = [...live.entries()]
  .filter(([, r]) => !r.currently_shipping)
  .map(([m]) => m);
console.log(`currently_shipping=false: ${notShipping.join(", ") || "(none)"}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
