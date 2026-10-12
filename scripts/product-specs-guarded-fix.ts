// The guarded write engine behind the one-off product_specs correction scripts
// (fix-product-specs-*.ts). Each script lists its corrections; this does the
// reading, checking and writing.
//
//   (no flag)    dry run: read every target row, report what would change
//   --apply      write
//   --rollback   write each correction in reverse
//
// GUARDED. Each row is read first and written only when the column still holds
// the exact value the script expects. The PATCH also filters on the row's
// `updated_at`, so an admin edit landing between the read and the write turns
// the write into a no-op. A row that has moved on is reported and left alone, and
// the run exits non-zero. Re-running after an apply reports "already applied".
//
// These scripts bypass the admin form (ADR 0096), so audit rows carry
// `updated_by = null` (a service-role connection has no auth.uid()). Andy runs
// `--apply` from his own terminal: the agent session's permission policy blocks
// production writes.

export type SpecFix = {
  column: string;
  ids: string[];
  from: unknown;
  to: unknown;
  why: string;
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export async function runSpecFixes(fixes: SpecFix[], argv: string[]): Promise<void> {
  const args = new Set(argv);
  const rollback = args.has("--rollback");
  const apply = args.has("--apply") || rollback;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("need SUPABASE_URL + service key; run with node --env-file=.env.local");
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  console.log(`${rollback ? "ROLLBACK" : apply ? "APPLY" : "DRY RUN"}: ${fixes.length} corrections\n`);
  const tally = { written: 0, wouldWrite: 0, already: 0, moved: 0, raced: 0 };

  for (const fix of fixes) {
    const [from, to] = rollback ? [fix.to, fix.from] : [fix.from, fix.to];
    console.log(`${fix.column}: ${fix.why}`);
    for (const id of fix.ids) {
      const res = await fetch(
        `${url}/rest/v1/product_specs?select=id,updated_at,${fix.column}&id=eq.${encodeURIComponent(id)}`,
        { headers },
      );
      if (!res.ok) throw new Error(`${id} read ${res.status}: ${await res.text()}`);
      const [row] = (await res.json()) as Record<string, unknown>[];
      if (!row) throw new Error(`${id}: no such product_specs row`);
      const current = row[fix.column];
      if (same(current, to)) {
        console.log(`  ${id.padEnd(18)} already applied`);
        tally.already++;
        continue;
      }
      if (!same(current, from)) {
        console.log(`  ${id.padEnd(18)} SKIPPED, value has moved on: ${JSON.stringify(current)}`);
        tally.moved++;
        continue;
      }
      if (!apply) {
        console.log(`  ${id.padEnd(18)} would write ${JSON.stringify(current)} -> ${JSON.stringify(to)}`);
        tally.wouldWrite++;
        continue;
      }
      const patch = await fetch(
        `${url}/rest/v1/product_specs?id=eq.${encodeURIComponent(id)}` +
          `&updated_at=eq.${encodeURIComponent(String(row.updated_at))}`,
        {
          method: "PATCH",
          headers: { ...headers, Prefer: "return=representation" },
          body: JSON.stringify({ [fix.column]: to }),
        },
      );
      if (!patch.ok) throw new Error(`${id} write ${patch.status}: ${await patch.text()}`);
      const written = (await patch.json()) as Record<string, unknown>[];
      if (written.length === 1 && same(written[0][fix.column], to)) {
        console.log(`  ${id.padEnd(18)} written`);
        tally.written++;
      } else {
        console.log(`  ${id.padEnd(18)} NOT written, the row changed between read and write`);
        tally.raced++;
      }
    }
  }

  console.log(
    `\nwritten ${tally.written} · would write ${tally.wouldWrite} · already applied ${tally.already}` +
      ` · moved on ${tally.moved} · raced ${tally.raced}`,
  );
  if (tally.moved > 0 || tally.raced > 0) process.exitCode = 1;
}
