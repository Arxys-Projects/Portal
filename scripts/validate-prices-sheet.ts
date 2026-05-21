// Fetches the Arxys pricing master sheet as CSV, validates every row,
// and prints a structured report. Exit 0 = clean; exit 1 = violations found.
// Run with: node --import tsx scripts/validate-prices-sheet.ts

import { parse } from "csv-parse/sync";

const SHEET_ID = "12zwFhDynV6T4ehxui7y-i6F-8XjEYFRBPgsAicpksmk";
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;

// GROUP segment: uppercase letters and digits only.
// TIER segment: starts with uppercase or digit, then allows mixed case (e.g. SFP28x10, ACM, 32GB).
const SKU_REGEX = /^VX5-[A-Z0-9]+-[A-Z0-9][A-Za-z0-9]*$/;

type Row = {
  sku: string;
  productName: string;
  msrpRaw: string;
};

type GroupStats = {
  count: number;
  msrpMin: number | null;
  msrpMax: number | null;
};

function fmt(n: number): string {
  return "$" + n.toLocaleString("en-US");
}

export async function validateSheet(): Promise<{ violations: string[]; rowCount: number }> {
  const violations: string[] = [];

  // 1. Fetch CSV
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching CSV`);
  const csvText = await res.text();

  // 2. Parse — relax_column_count handles the ragged trailing columns in the header row
  const allRows: string[][] = parse(csvText, { relax_column_count: true });

  // Strip header row (row 0) and any trailing blank rows
  const dataRows = allRows
    .slice(1)
    .filter((r) => r.some((cell) => cell.trim() !== ""));

  console.log(
    `[PASS] Fetch CSV (HTTP 200, ${dataRows.length} data rows + 1 header)`,
  );

  const rows: Row[] = dataRows.map((r) => ({
    sku: (r[0] ?? "").trim(),
    productName: (r[1] ?? "").trim(),
    msrpRaw: (r[2] ?? "").trim(),
  }));

  // 3. SKU non-empty
  const emptySKUs = rows.filter((r) => r.sku === "");
  if (emptySKUs.length === 0) {
    console.log(`[PASS] All ${rows.length} SKUs non-empty`);
  } else {
    console.log(`[FAIL] ${emptySKUs.length} empty SKU(s) in data rows`);
    violations.push(`Empty SKUs: ${emptySKUs.length} row(s)`);
  }

  // 4. SKU format
  const badSKUs = rows.filter((r) => r.sku !== "" && !SKU_REGEX.test(r.sku));
  if (badSKUs.length === 0) {
    console.log(`[PASS] All ${rows.length} SKUs match VX5-<GROUP>-<TIER>`);
  } else {
    console.log(`[FAIL] ${badSKUs.length} SKU(s) violate naming convention:`);
    for (const r of badSKUs) {
      console.log(`       ${r.sku}`);
      violations.push(`SKU naming violation: ${r.sku}`);
    }
  }

  // 5. Duplicate SKUs
  const seen = new Map<string, number>();
  for (const r of rows) seen.set(r.sku, (seen.get(r.sku) ?? 0) + 1);
  const duplicates = [...seen.entries()].filter(([, n]) => n > 1);
  if (duplicates.length === 0) {
    console.log(`[PASS] No duplicate SKUs`);
  } else {
    console.log(`[FAIL] ${duplicates.length} duplicate SKU(s):`);
    for (const [sku, n] of duplicates) {
      console.log(`       ${sku} (${n}×)`);
      violations.push(`Duplicate SKU: ${sku} (${n}×)`);
    }
  }

  // 6. MSRP classification: numeric | "MKT" | "Call for Quote" | empty
  const mktRows: string[] = [];
  const cfqRows: string[] = [];
  const badMSRP: string[] = [];

  for (const r of rows) {
    const v = r.msrpRaw;
    if (v === "" || v === "MKT") {
      if (v === "MKT") mktRows.push(r.sku);
    } else if (v === "Call for Quote") {
      cfqRows.push(r.sku);
    } else if (isNaN(Number(v))) {
      badMSRP.push(`${r.sku} (msrp="${v}")`);
    }
  }

  if (badMSRP.length === 0) {
    console.log(
      `[PASS] All MSRPs are NUMERIC, MKT, "Call for Quote", or empty`,
    );
  } else {
    console.log(`[FAIL] ${badMSRP.length} malformed MSRP value(s):`);
    for (const s of badMSRP) {
      console.log(`       ${s}`);
      violations.push(`Malformed MSRP: ${s}`);
    }
  }

  // 7. Group stats
  const groups = new Map<string, GroupStats>();
  for (const r of rows) {
    const group = r.sku.split("-")[1] ?? "UNKNOWN";
    const g = groups.get(group) ?? { count: 0, msrpMin: null, msrpMax: null };
    g.count++;
    const num = Number(r.msrpRaw);
    if (r.msrpRaw !== "" && !isNaN(num)) {
      g.msrpMin = g.msrpMin === null ? num : Math.min(g.msrpMin, num);
      g.msrpMax = g.msrpMax === null ? num : Math.max(g.msrpMax, num);
    }
    groups.set(group, g);
  }

  const sortedGroups = [...groups.keys()].sort();
  console.log(
    `\n[INFO] Derived Product Groups (${sortedGroups.length}): ${sortedGroups.join(", ")}`,
  );

  const countMap = Object.fromEntries(
    [...groups.entries()].map(([g, s]) => [g, s.count]),
  );
  console.log(`[INFO] Group row counts: ${JSON.stringify(countMap)}`);

  console.log(`[INFO] MSRP ranges per group:`);
  for (const g of sortedGroups) {
    const s = groups.get(g)!;
    if (s.msrpMin !== null && s.msrpMax !== null) {
      const range =
        s.msrpMin === s.msrpMax
          ? fmt(s.msrpMin)
          : `${fmt(s.msrpMin)} – ${fmt(s.msrpMax)}`;
      console.log(`       ${g}: ${range}`);
    } else {
      console.log(`       ${g}: no numeric MSRP`);
    }
  }

  if (mktRows.length > 0) {
    console.log(`[INFO] MKT rows: [${mktRows.join(", ")}]`);
  }
  if (cfqRows.length > 0) {
    console.log(`[INFO] CFQ rows (Call for Quote): [${cfqRows.join(", ")}]`);
  }

  // Absence note for PP5-V100
  const hasPP5 = rows.some((r) => r.sku.startsWith("VX5-PP5-"));
  if (!hasPP5) {
    console.log(`[INFO] VX5-PP5-V100 (5-year warranty) not present in sheet`);
  }

  return { violations, rowCount: rows.length };
}

async function main() {
  console.log("=== Sheet validation ===\n");

  let result: { violations: string[]; rowCount: number };
  try {
    result = await validateSheet();
  } catch (err) {
    console.error(`[FAIL] ${err}`);
    process.exit(1);
  }

  console.log("");

  if (result.violations.length > 0) {
    console.error(
      `${result.violations.length} validation violation(s) — fix in the sheet before proceeding:`,
    );
    for (const v of result.violations) console.error(`  - ${v}`);
    process.exit(1);
  }

  console.log("All Sheet validations passed.");
}

main().catch((err) => {
  console.error("Validator crashed:", err);
  process.exit(2);
});
