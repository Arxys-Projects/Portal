// Test fixtures: the recommender pool, with rack units and SFP add-on taken from
// the repo's seeded product specs file. No live database read.
//
// FROZEN_POOL is the golden harness's frozen pool (18 SKUs, V200 to V800,
// captured 2026-08-12). It predates rackUnits / sfpAddon, so those come from
// supabase/migrations/20260602000001_quickcompare_columns.sql, which seeds
// rack_units and sfp_addon once per family (`where id like 'VX5-V200-%'`).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { ServerSpec } from "./types";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(here, "../../..");

export const FROZEN_POOL: ServerSpec[] = JSON.parse(
  readFileSync(path.join(here, "../calculator/__golden__/specs-pool.json"), "utf8"),
).pool;

export const SEED_SPECS_FILE = "supabase/migrations/20260602000001_quickcompare_columns.sql";

export type SeededFamilySpecs = { idPrefix: string; rackUnits: string | null; sfpAddon: string | null };

/** Every `update public.product_specs set ... where id like '<prefix>%';` block in the seed file. */
export function readSeededFamilySpecs(): SeededFamilySpecs[] {
  const sql = readFileSync(path.join(REPO_ROOT, SEED_SPECS_FILE), "utf8");
  const blocks = [...sql.matchAll(/update public\.product_specs set([\s\S]*?)where id like '([^']+)%';/g)];
  return blocks.map(([, body, idPrefix]) => ({
    idPrefix,
    rackUnits: /\brack_units\s*=\s*'([^']*)'/.exec(body)?.[1] ?? null,
    sfpAddon: /\bsfp_addon\s*=\s*'([^']*)'/.exec(body)?.[1] ?? null,
  }));
}

/**
 * The frozen pool with each SKU's rack units and SFP add-on from its family's
 * seed block. A SKU with no block gets nulls, which the agreement test reports.
 */
export function seededPool(): ServerSpec[] {
  const families = readSeededFamilySpecs();
  return FROZEN_POOL.map((s) => {
    const family = families.find((f) => s.sku.startsWith(f.idPrefix));
    return { ...s, rackUnits: family?.rackUnits ?? null, sfpAddon: family?.sfpAddon ?? null };
  });
}
