// Refresh competitor_products from data/server-specs.json (or a path you
// supply). Idempotent — safe to re-run after spreadsheet updates.
//
// Run:      node --env-file=.env.local --import tsx scripts/update-competitor-data.ts
// Custom:   node --env-file=.env.local --import tsx scripts/update-competitor-data.ts --path /path/to/server-specs.json
// Dry-run:  ... --dry-run
//
// This script used to refresh product_specs from the JSON's `arxys.models` too,
// which made the repo file a co-authority that could silently overwrite admin
// edits. ADR 0096 made product_specs the canonical, admin-editable source, so
// that upsert is gone and `arxys.models` is frozen in the JSON as a provenance
// record of the original import — read by nothing. Arxys specs are now edited in
// the portal admin form; there is deliberately no reseed flag back into the DB.
//
// competitor_products keeps its JSON-plus-script path (out of scope per ADR
// 0091) and is all this script now does.

import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { env } from "../src/lib/env";

// ---------------------------------------------------------------------------
// JSON shape (subset used by this script)
// ---------------------------------------------------------------------------

type JsonCompetitorModel = {
  id: string;
  model_name: string;
  sku: string;
  form_factor: string;
  hw_platform?: string | null;
  storage_raw_tb: number;
  cpu_model: string;
  cpu_cores_threads: string;
  cpu_base_ghz: number;
  cpu_architecture: number;
  ram_gb: number;
  max_cameras: number;
  max_cameras_h265: number;
  network: string;
  raid_support: string;
  os: string;
  warranty: string;
  vms_certified: string;
  arxys_match_id: string;
  msrp_current?: number;
};

type JsonVmsVendor = {
  brand_name: string;
  product_line: string;
  models: JsonCompetitorModel[];
};

// The file also carries `arxys`, `display_specs`, `spec_labels` and `messages`.
// None is read here — `arxys.models` is frozen provenance (see the header) and
// the other three were hand-copied into src/lib/comparison/display-specs.ts.
type ServerSpecsJson = {
  vms_vendors: Record<string, JsonVmsVendor>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseArgs(): { path: string; isDryRun: boolean } {
  const args = process.argv.slice(2);
  const pathIdx = args.indexOf("--path");
  const rawPath =
    pathIdx !== -1 && args[pathIdx + 1]
      ? args[pathIdx + 1]
      : "data/server-specs.json";
  return {
    path: resolve(process.cwd(), rawPath),
    isDryRun: args.includes("--dry-run"),
  };
}

function loadJson(filePath: string): ServerSpecsJson {
  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as ServerSpecsJson;
  } catch (err) {
    console.error(`Failed to read ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

function toCompetitorProductRow(
  vendor: string,
  meta: JsonVmsVendor,
  m: JsonCompetitorModel,
) {
  return {
    id: m.id,
    vendor,
    brand_name: meta.brand_name,
    product_line: meta.product_line,
    model_name: m.model_name,
    sku: m.sku,
    form_factor: m.form_factor,
    hw_platform: m.hw_platform ?? null,
    storage_raw_tb: m.storage_raw_tb,
    cpu_model: m.cpu_model,
    cpu_cores_threads: m.cpu_cores_threads,
    cpu_base_ghz: m.cpu_base_ghz,
    cpu_passmark: m.cpu_architecture,
    ram_gb: m.ram_gb,
    max_cameras: m.max_cameras,
    max_cameras_h265: m.max_cameras_h265,
    network: m.network,
    raid_support: m.raid_support,
    os: m.os,
    warranty: m.warranty,
    vms_certified: m.vms_certified,
    arxys_match_id: m.arxys_match_id,
    msrp_current: m.msrp_current ?? null,
  };
}

async function promptConfirm(): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout });
    rl.question(
      "\nReview the counts above. Type CONFIRM to push or CANCEL to exit: ",
      (answer) => {
        rl.close();
        resolve(answer.trim() === "CONFIRM");
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { path: filePath, isDryRun } = parseArgs();

  console.log(
    `=== update-competitor-data.ts${isDryRun ? " [DRY RUN]" : ""} ===\n`,
  );
  console.log(`Source: ${filePath}\n`);

  const data = loadJson(filePath);

  const competitorRows = Object.entries(data.vms_vendors).flatMap(
    ([vendor, meta]) => meta.models.map((m) => toCompetitorProductRow(vendor, meta, m)),
  );

  console.log(`competitor_products rows: ${competitorRows.length}`);
  console.log(
    `  breakdown: ${Object.entries(data.vms_vendors)
      .map(([_v, meta]) => `${meta.brand_name} ${meta.product_line} ×${meta.models.length}`)
      .join(", ")}`,
  );

  if (isDryRun) {
    console.log("\n[DRY RUN] No writes performed.");
    process.exit(0);
  }

  const confirmed = await promptConfirm();
  if (!confirmed) {
    console.log("Cancelled. No changes made.");
    process.exit(0);
  }

  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  console.log("\nUpserting competitor_products...");
  const { error: compErr } = await admin
    .from("competitor_products")
    .upsert(competitorRows as unknown as never[], { onConflict: "id" });
  if (compErr) {
    console.error(`  ERROR: ${compErr.message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${competitorRows.length} row(s) upserted`);

  console.log("\n=== Complete ===");
}

main().catch((err) => {
  console.error("update-competitor-data failed:", err);
  process.exit(1);
});
