// Restore a JSON dump produced by scripts/backup-tables.ts. Intended as the
// rollback gate if a destructive migration goes wrong.
//
// Behavior:
//   - Reads the JSON file passed as argv[2].
//   - For each table in the dump, DELETEs everything then UPSERTs the saved
//     rows via service-role.
//   - Order is fixed to satisfy FK constraints (parents first):
//       partners → products → server_specs → submissions
//   - If a table doesn't exist in the current DB (e.g. server_specs has been
//     dropped by a migration), that table is skipped with a warning.
//
// Run: node --env-file=.env.local --import tsx scripts/restore-tables.ts backups/<file>.json

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { env } from "../src/lib/env";

// Restore order (parents → children).
const TABLE_ORDER = ["partners", "products", "server_specs", "submissions"] as const;

async function tableExists(admin: SupabaseClient, name: string): Promise<boolean> {
  const { error } = await admin.from(name).select("*", { count: "exact", head: true });
  if (!error) return true;
  // PostgREST returns code "PGRST205" / "42P01" for "relation does not exist".
  if (/does not exist/i.test(error.message)) return false;
  // Any other error is unexpected — treat as exists so the caller surfaces it.
  return true;
}

async function restoreTable(
  admin: SupabaseClient,
  name: string,
  rows: unknown[],
): Promise<void> {
  if (!Array.isArray(rows)) {
    console.warn(`[skip] ${name}: not an array in dump`);
    return;
  }
  const exists = await tableExists(admin, name);
  if (!exists) {
    console.warn(`[skip] ${name}: table does not exist in current schema`);
    return;
  }
  // Wipe with neq on `id` to avoid `delete-without-filter` guards.
  // Some tables don't have `id` (the new SKU-PK products won't), so try
  // a couple of common PKs; if none work we surface the error.
  const wipeCandidates = ["id", "sku"];
  let wiped = false;
  for (const col of wipeCandidates) {
    const { error } = await admin.from(name).delete().neq(col, "00000000-0000-0000-0000-000000000000");
    if (!error) {
      wiped = true;
      break;
    }
    if (!/column .* does not exist/i.test(error.message)) {
      throw new Error(`DELETE from ${name} failed: ${error.message}`);
    }
  }
  if (!wiped) {
    throw new Error(`Could not wipe ${name}: tried filters on ${wipeCandidates.join(", ")}`);
  }
  if (rows.length === 0) {
    console.log(`[OK] ${name}: 0 rows in dump; table wiped`);
    return;
  }
  // Insert in chunks to stay under PostgREST's body-size ceiling.
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await admin.from(name).insert(rows.slice(i, i + CHUNK));
    if (error) {
      throw new Error(`INSERT into ${name} (chunk ${i / CHUNK}) failed: ${error.message}`);
    }
  }
  console.log(`[OK] ${name}: restored ${rows.length} row(s)`);
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: tsx scripts/restore-tables.ts <backups/file.json>");
    process.exit(1);
  }
  const path = resolve(process.cwd(), file);
  const raw = readFileSync(path, "utf8");
  const dump = JSON.parse(raw) as Record<string, unknown>;

  console.log(`Restoring from ${path}`);
  console.log(`Dump meta:`, dump.meta);

  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (const t of TABLE_ORDER) {
    const rows = dump[t];
    if (rows === undefined) {
      console.warn(`[skip] ${t}: not present in dump`);
      continue;
    }
    await restoreTable(admin, t, rows as unknown[]);
  }

  console.log("\nRestore complete.");
}

main().catch((err) => {
  console.error("restore-tables failed:", err);
  process.exit(1);
});
