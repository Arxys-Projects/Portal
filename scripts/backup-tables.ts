// Dump four core tables (products, server_specs, submissions, partners) to a
// single JSON file under backups/. Used as the recoverable-backup gate before
// destructive migrations (Phase 2 Step 3+4 onwards). The Supabase free plan
// doesn't include dashboard snapshots; this script is the substitute.
//
// Restore counterpart: scripts/restore-tables.ts (replays the JSON via the
// same service-role client).
//
// Run: node --env-file=.env.local --import tsx scripts/backup-tables.ts

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { env } from "../src/lib/env";

const TABLES = ["products", "server_specs", "submissions", "partners"] as const;

async function dumpTable(admin: SupabaseClient, name: string): Promise<unknown[]> {
  // Service-role bypasses RLS. Use `range()` to be explicit about no row cap;
  // the supabase-js default `limit` is 1000 which is plenty for current data
  // volumes but we'll page just in case a future table grows.
  const out: unknown[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from(name)
      .select("*")
      .range(from, from + PAGE - 1);
    if (error) {
      throw new Error(`SELECT * from ${name} failed: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

async function main() {
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const tag = process.argv[2] || "manual";
  const filename = `${tag}-${timestamp}.json`;
  const outDir = resolve(process.cwd(), "backups");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, filename);

  const dump: Record<string, unknown> = {
    meta: {
      tag,
      timestamp,
      supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
      tables: [...TABLES],
    },
  };

  for (const t of TABLES) {
    const rows = await dumpTable(admin, t);
    dump[t] = rows;
    console.log(`[OK] ${t}: ${rows.length} row(s)`);
  }

  writeFileSync(outPath, JSON.stringify(dump, null, 2), "utf8");
  console.log(`\nBackup written to: ${outPath}`);
}

main().catch((err) => {
  console.error("backup-tables failed:", err);
  process.exit(1);
});
