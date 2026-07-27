// Live-data round-trip for the product_specs admin form's zod schema.
// Design: datasheets/spec-admin-form-design.md §6 (build sequence step 5).
//
// Run with:
//   node --env-file=.env.local --import tsx scripts/roundtrip-product-specs.mts
//
// READ-ONLY. This script issues a single SELECT and writes nothing. It must stay
// that way: a write to product_specs from a script bypasses the form's
// validation and lands in product_specs_audit as an unattributed change
// (updated_by null, because a service_role connection has no auth.uid()).
//
// WHY THIS EXISTS, and why the unit tests do not replace it.
//
// Brief §1's lesson is that the test suite cannot see a change in *which* rows
// or columns reach a code path, because the fixtures hand-populate the values.
// The same blind spot applies one level up to the schema itself: fixtures are
// written to match the schema, so they can only ever confirm that the schema
// accepts what the schema was designed to accept. They structurally cannot catch
// "the schema rejects data that is already live in production" — a validation
// rule that looks reasonable, passes every test, and locks an admin out of
// saving a row that has been correct on the Price Book for two months.
//
// So this is the acceptance check, not a nice-to-have. It asserts three things
// against real production rows:
//
//   1. PARSES     — every row passes the form's own parser, cross-field rules
//                   included. A rule that rejects live data fails here.
//   2. PRESERVES  — the parsed output equals the input, column by column. A
//                   coercion bug (a numeric read back as a string, a null
//                   flattened to "") would let a row parse and still be
//                   corrupted by a save that changed nothing.
//   3. COVERS     — every live column is reachable through the form. This is the
//                   26-migration-only-columns failure mode (ADR 0096's stated
//                   negative) caught mechanically rather than by audit: a column
//                   added to the table but not to fields.ts is unreachable
//                   through the only supported write path, and silently so.
//
// The `.mts` extension is load-bearing: tsx transforms plain `.ts` as CommonJS
// and rejects top-level await.

import { createClient } from "@supabase/supabase-js";
import { env } from "../src/lib/env";
import {
  SPEC_FIELD_NAMES,
  specWarnings,
  type SpecRuleValues,
} from "../src/app/(app)/admin/specs/fields";
import { parseSpecForm } from "../src/app/(app)/admin/specs/schema";

// Columns that exist on product_specs and are deliberately NOT form fields.
// Each absence is a decision, recorded here so an unexplained new column shows
// up as a coverage failure rather than being quietly tolerated.
const INTENTIONALLY_UNSURFACED: Record<string, string> = {
  product_sku:
    "dead — null in all 21 rows; the products join runs on product_specs.id == products.sku. Drops with the ADR 0095 columns (design §3).",
  updated_at:
    "maintained by the product_specs_stamp_updated BEFORE trigger; an action writing it would fight the trigger (ADR 0096 decision 3).",
  updated_by:
    "maintained by the same trigger from auth.uid(); null for migration and service_role writes.",
};

const EXPECTED_ROW_COUNT = 21;

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

console.log("product_specs live round-trip — form schema vs production data\n");

const { data, error } = await supabase.from("product_specs").select("*").order("id");
if (error) {
  console.error(`Could not read product_specs: ${error.message}`);
  process.exit(1);
}
const rows = (data ?? []) as Record<string, unknown>[];

if (rows.length === 0) {
  console.error("No rows returned — nothing to round-trip.");
  process.exit(1);
}
console.log(`Read ${rows.length} rows.`);
if (rows.length !== EXPECTED_ROW_COUNT) {
  // Not a failure: the whole point of the form is that rows can be added. But an
  // unexpected count is worth seeing, because it means this script's baseline
  // and the design's "21 rows" are no longer the same thing.
  console.log(
    `NOTE  expected ${EXPECTED_ROW_COUNT} (the design's baseline); the table now has ${rows.length}.`,
  );
}

// ---------------------------------------------------------------------------
// 3. COVERAGE — is every live column reachable through the form?
// ---------------------------------------------------------------------------

console.log("\nColumn coverage");
const liveColumns = Object.keys(rows[0]).sort();
const formFields = new Set(SPEC_FIELD_NAMES);
const unreachable = liveColumns.filter(
  (c) => !formFields.has(c) && !(c in INTENTIONALLY_UNSURFACED),
);
const phantom = SPEC_FIELD_NAMES.filter((f) => !liveColumns.includes(f));

console.log(
  `  ${liveColumns.length} live columns, ${SPEC_FIELD_NAMES.length} form fields, ` +
    `${Object.keys(INTENTIONALLY_UNSURFACED).length} intentionally unsurfaced.`,
);
for (const column of unreachable) {
  fail(
    `column '${column}' exists on product_specs but is not a form field and is not listed as intentionally unsurfaced — it is unreachable through the only supported write path.`,
  );
}
for (const field of phantom) {
  fail(
    `form field '${field}' has no matching column on product_specs — a save would be rejected by Postgres.`,
  );
}
if (unreachable.length === 0 && phantom.length === 0) {
  console.log("  OK    every live column is either a form field or a recorded exception.");
}

// ---------------------------------------------------------------------------
// 1. PARSES and 2. PRESERVES, per row
// ---------------------------------------------------------------------------

console.log("\nPer-row parse and value preservation");
const warningsByRow: Array<{ id: string; warnings: string[] }> = [];

for (const row of rows) {
  const id = String(row.id);
  const parsed = parseSpecForm(row);

  if (!parsed.ok) {
    for (const [field, messages] of Object.entries(parsed.fieldErrors)) {
      fail(`${id}: ${field} — ${messages.join(" / ")}`);
    }
    continue;
  }

  const drifted: string[] = [];
  for (const field of SPEC_FIELD_NAMES) {
    const before = row[field] ?? null;
    const after = parsed.values[field] ?? null;
    // Numeric comparison is by value: Postgres `numeric` arrives as a JS number
    // through supabase-js, but comparing numerically rather than strictly keeps
    // this honest if that ever changes to a string.
    const equal =
      typeof before === "number" || typeof after === "number"
        ? Number(before) === Number(after) &&
          (before === null) === (after === null)
        : before === after;
    if (!equal) {
      drifted.push(
        `${field}: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`,
      );
    }
  }
  if (drifted.length > 0) {
    fail(`${id}: parsed clean but values changed — ${drifted.join("; ")}`);
    continue;
  }

  const rowWarnings = specWarnings(parsed.values as SpecRuleValues);
  if (rowWarnings.length > 0) warningsByRow.push({ id, warnings: rowWarnings });
  console.log(`  OK    ${id.padEnd(14)} 43/43 fields preserved`);
}

// ---------------------------------------------------------------------------
// Warnings are informational — they must NOT fail the run
// ---------------------------------------------------------------------------

if (warningsByRow.length > 0) {
  console.log(
    `\nWarnings on ${warningsByRow.length} row(s) — these do not block a save (design §4c):`,
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
