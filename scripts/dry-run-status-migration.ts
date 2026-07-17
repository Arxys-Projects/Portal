// ADR 0081 — READ-ONLY dry-run for the pipeline status model reduction.
// Prints the before distribution, the exact number of rows the data UPDATE
// would rewrite to 'open', and the simulated after distribution. Writes
// NOTHING. Run:
//   node --env-file=.env.local --import tsx scripts/dry-run-status-migration.ts
import { createClient } from "@supabase/supabase-js";
import { env } from "../src/lib/env";

const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const TERMINAL = new Set(["won", "lost"]);

function tally(rows: { status: string | null }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = r.status === null ? "(null)" : r.status;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function printDist(title: string, counts: Map<string, number>) {
  console.log(title);
  for (const [status, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${status.padEnd(12)} ${n}`);
  }
}

async function main() {
  const rows: { status: string | null }[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("submissions")
      .select("status")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  console.log(`Total submissions rows: ${rows.length}\n`);
  printDist("BEFORE — raw status distribution:", tally(rows));

  const wouldRewrite = rows.filter((r) => !TERMINAL.has(r.status ?? "")).length;
  console.log(
    `\nUPDATE ... set status = 'open' where status not in ('won','lost')` +
      `\n  rows affected: ${wouldRewrite}`,
  );

  // Simulate the post-migration distribution.
  const after = rows.map((r) => ({
    status: TERMINAL.has(r.status ?? "") ? r.status : "open",
  }));
  console.log("");
  printDist("AFTER (simulated) — status distribution:", tally(after));

  // Guards the real migration relies on.
  const nullsAfter = after.filter((r) => r.status === null).length;
  const outOfDomain = after.filter(
    (r) => !["open", "won", "lost"].includes(r.status ?? ""),
  ).length;
  console.log(
    `\nNOT NULL safety — nulls remaining after fold: ${nullsAfter} (must be 0)` +
      `\nDomain safety — values outside open/won/lost: ${outOfDomain} (must be 0)`,
  );
  console.log("\nNo rows were written. This was a dry-run.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
