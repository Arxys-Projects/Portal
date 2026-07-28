// Live-data round-trip for the appliance_specs admin form's zod schema.
// Design: datasheets/datasheet-phase2-admin-surface-design.md §6 (build step 5).
//
// Run with:
//   node --env-file=.env.local --import tsx scripts/roundtrip-appliance-specs.mts
//
// READ-ONLY. A single SELECT, nothing written. It must stay that way: a write
// from a script bypasses the form's validation and lands in
// appliance_specs_audit as an unattributed change (changed_by null, because a
// service_role connection has no auth.uid()).
//
// The sibling of scripts/roundtrip-product-specs.mts, and the same three
// assertions against real production rows:
//
//   1. PARSES     — every row passes the form's own parser. A validation rule
//                   that rejects live data fails here, and fixtures structurally
//                   cannot catch that: they are written to match the schema.
//   2. PRESERVES  — the parsed output equals the input, column by column, with
//                   deep equality for the two non-scalars (camera_matrix jsonb,
//                   security_features text[]). A coercion bug would let a row
//                   parse and still be corrupted by a save that changed nothing.
//   3. COVERS     — every live column is reachable through the form. The
//                   26-migration-only-columns failure mode (ADR 0096's stated
//                   negative) caught mechanically rather than by audit.
//
// THE EMPTY-TABLE WINDOW. appliance_specs ships empty: all seven rows are typed
// in through /admin/appliance-specs/new (ADR 0097 §8, build step 6). Until the
// first one lands there is nothing to parse, so the script reports that plainly
// and exits 0 — a zero-row table is the expected state at build step 5, not a
// failure. COVERAGE still cannot run in that window (it reads the column list
// off a returned row), and the script says so rather than reporting a pass it
// did not make.
//
// The `.mts` extension is load-bearing: tsx transforms plain `.ts` as CommonJS
// and rejects top-level await.

import { createClient } from "@supabase/supabase-js";
import { env } from "../src/lib/env";
import {
  applianceWarnings,
  APPLIANCE_FIELD_NAMES,
  type ApplianceRuleValues,
} from "../src/app/(app)/admin/appliance-specs/fields";
import { parseApplianceForm } from "../src/app/(app)/admin/appliance-specs/schema";

// Columns that exist on appliance_specs and are deliberately NOT form fields.
// Each absence is a decision, recorded here so an unexplained new column shows
// up as a coverage failure rather than being quietly tolerated.
const INTENTIONALLY_UNSURFACED: Record<string, string> = {
  updated_at:
    "maintained by the appliance_specs_stamp_updated BEFORE trigger; an action writing it would fight the trigger (ADR 0097 decision 1).",
  updated_by:
    "maintained by the same trigger from auth.uid(); null for migration and service_role writes.",
};

// The seven rows of ADR 0097 §8. Not a failure while entry is in progress — the
// count is printed so a half-finished table is visible as such.
const EXPECTED_ROW_COUNT = 7;

let failures = 0;
const fail = (message: string) => {
  failures += 1;
  console.error(`  FAIL  ${message}`);
};

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

console.log("appliance_specs live round-trip — form schema vs production data\n");

const { data, error } = await supabase.from("appliance_specs").select("*").order("id");
if (error) {
  console.error(`Could not read appliance_specs: ${error.message}`);
  process.exit(1);
}
const rows = (data ?? []) as Record<string, unknown>[];

if (rows.length === 0) {
  console.log(
    "0 rows — nothing to round-trip yet, coverage unchecked.\n" +
      "appliance_specs is entered by hand through /admin/appliance-specs/new " +
      `(ADR 0097 §8); this becomes the acceptance check once the ${EXPECTED_ROW_COUNT} rows land.`,
  );
  process.exit(0);
}

console.log(`Read ${rows.length} rows.`);
if (rows.length !== EXPECTED_ROW_COUNT) {
  console.log(
    `NOTE  expected ${EXPECTED_ROW_COUNT} once entry is complete; the table currently has ${rows.length}.`,
  );
}

// ---------------------------------------------------------------------------
// 3. COVERAGE — is every live column reachable through the form?
// ---------------------------------------------------------------------------

console.log("\nColumn coverage");
const liveColumns = Object.keys(rows[0]).sort();
const formFields = new Set(APPLIANCE_FIELD_NAMES);
const unreachable = liveColumns.filter(
  (c) => !formFields.has(c) && !(c in INTENTIONALLY_UNSURFACED),
);
const phantom = APPLIANCE_FIELD_NAMES.filter((f) => !liveColumns.includes(f));

console.log(
  `  ${liveColumns.length} live columns, ${APPLIANCE_FIELD_NAMES.length} form fields, ` +
    `${Object.keys(INTENTIONALLY_UNSURFACED).length} intentionally unsurfaced.`,
);
for (const column of unreachable) {
  fail(
    `column '${column}' exists on appliance_specs but is not a form field and is not listed as intentionally unsurfaced — it is unreachable through the only supported write path.`,
  );
}
for (const field of phantom) {
  fail(
    `form field '${field}' has no matching column on appliance_specs — a save would be rejected by Postgres.`,
  );
}
if (unreachable.length === 0 && phantom.length === 0) {
  console.log("  OK    every live column is either a form field or a recorded exception.");
}

// ---------------------------------------------------------------------------
// 1. PARSES and 2. PRESERVES, per row
// ---------------------------------------------------------------------------

/**
 * Deep equality for the two non-scalar columns.
 *
 * `camera_matrix` is jsonb — an array of row objects that the parser rebuilds,
 * so `===` is false for every row even when nothing changed, and a shallow
 * comparison would miss a cell that changed type (the string "15" stored where
 * the number 15 belongs is exactly the drift this catches).
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as object).sort();
    const kb = Object.keys(b as object).sort();
    if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
    return ka.every((k) =>
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
    );
  }
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
  return false;
}

console.log("\nPer-row parse and value preservation");
const warningsByRow: Array<{ id: string; warnings: string[] }> = [];

for (const row of rows) {
  const id = String(row.id);
  const parsed = parseApplianceForm(row);

  if (!parsed.ok) {
    for (const [field, messages] of Object.entries(parsed.fieldErrors)) {
      fail(`${id}: ${field} — ${messages.join(" / ")}`);
    }
    continue;
  }

  const drifted: string[] = [];
  for (const field of APPLIANCE_FIELD_NAMES) {
    const before = row[field] ?? null;
    const after = parsed.values[field] ?? null;
    if (!deepEqual(before, after)) {
      drifted.push(`${field}: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
    }
  }
  if (drifted.length > 0) {
    fail(`${id}: parsed clean but values changed — ${drifted.join("; ")}`);
    continue;
  }

  const rowWarnings = applianceWarnings(parsed.values as ApplianceRuleValues);
  if (rowWarnings.length > 0) warningsByRow.push({ id, warnings: rowWarnings });
  console.log(
    `  OK    ${id.padEnd(14)} ${APPLIANCE_FIELD_NAMES.length}/${APPLIANCE_FIELD_NAMES.length} fields preserved`,
  );
}

// ---------------------------------------------------------------------------
// The cross-row sheet_group check, which no single row can see (design §4b)
// ---------------------------------------------------------------------------

console.log("\nSheet groups");
const groups = new Map<string, { id: string; family_type: string | null }[]>();
for (const row of rows) {
  const group = String(row.sheet_group ?? "");
  const entry = { id: String(row.id), family_type: (row.family_type as string) ?? null };
  const list = groups.get(group);
  if (list) list.push(entry);
  else groups.set(group, [entry]);
}
for (const [group, members] of [...groups.entries()].sort()) {
  console.log(`  ${group.padEnd(8)} ${members.map((m) => m.id).join(", ")}`);
}

// ---------------------------------------------------------------------------
// Warnings are informational — they must NOT fail the run
// ---------------------------------------------------------------------------

if (warningsByRow.length > 0) {
  console.log(
    `\nWarnings on ${warningsByRow.length} row(s) — these do not block a save (design §4e):`,
  );
  for (const { id, warnings } of warningsByRow) {
    for (const warning of warnings) console.log(`  WARN  ${id}: ${warning}`);
  }
}

console.log("");
if (failures > 0) {
  console.error(`${failures} failure(s). The schema and production data disagree.`);
  process.exit(1);
}
console.log(
  `All ${rows.length} live rows parse clean through the form's own schema, preserve every value, and every live column is reachable.`,
);
