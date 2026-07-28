// The shared zod layer for the spec admin forms (ADR 0097 decision 4; design
// datasheets/datasheet-phase2-admin-surface-design.md §5).
//
// One builder per field kind, plus buildSpecSchema() to assemble a table's
// fields into the parser its action calls. The per-table `schema.ts` supplies
// the field list and the cross-field rules; nothing table-specific lives here.
//
// TWO INPUT SHAPES reach every schema built here, and both must parse — this is
// the property the live round-trip scripts depend on and the reason the
// coercion below exists:
//
//   1. FormData from the browser — every value is a string, and an untouched
//      optional field arrives as "".
//   2. A row straight out of Postgres — numbers are numbers and empty columns
//      are `null`.
//
// Shape 2 is not hypothetical convenience. Fixture tests are written to match
// the schema, so they structurally cannot catch "the schema rejects data that
// is already live." A parser that accepts both shapes can be fed production
// rows directly.

import { z } from "zod";
import type {
  SpecEnumField,
  SpecField,
  SpecPlainField,
  SpecRuleViolation,
} from "./fields";

// ---------------------------------------------------------------------------
// Coercion — the bridge between the two input shapes above
// ---------------------------------------------------------------------------

/** "" / "   " / undefined / null all mean "no value" and become null. */
export function blankToNull(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  return value;
}

/** blankToNull, then string -> number. Non-numeric text becomes NaN. */
export function blankToNumber(value: unknown): unknown {
  const v = blankToNull(value);
  if (v === null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  return v;
}

/**
 * `z.number()` rejects NaN and Infinity on its own, so no extra refinement is
 * needed — but its default message for both is "expected number, received NaN",
 * which tells an editor who typed "twelve" nothing useful. The error function
 * distinguishes the two cases the preprocessor above produces: `null` means the
 * field was left blank, anything else means it held text that is not a number.
 */
function numberError(label: string) {
  return (issue: { input: unknown }) =>
    issue.input === null ? `${label} is required.` : `${label} must be a number.`;
}

// ---------------------------------------------------------------------------
// One builder per kind
// ---------------------------------------------------------------------------

export function requiredText(field: SpecPlainField) {
  return z.preprocess(
    blankToNull,
    z
      .string({ error: `${field.label} is required.` })
      .min(1, { error: `${field.label} is required.` })
      .max(field.maxLength ?? 200, {
        error: `${field.label} must be ${field.maxLength ?? 200} characters or fewer.`,
      }),
  );
}

export function optionalText(field: SpecPlainField) {
  return z.preprocess(
    blankToNull,
    z
      .string()
      .max(field.maxLength ?? 200, {
        error: `${field.label} must be ${field.maxLength ?? 200} characters or fewer.`,
      })
      .nullable(),
  );
}

export function requiredPositiveInt(field: SpecPlainField) {
  return z.preprocess(
    blankToNumber,
    z
      .number({ error: numberError(field.label) })
      .int({ error: `${field.label} must be a whole number.` })
      .positive({ error: `${field.label} must be greater than 0.` }),
  );
}

export function optionalInt(field: SpecPlainField) {
  return z.preprocess(
    blankToNumber,
    z
      .number({ error: `${field.label} must be a number.` })
      .int({ error: `${field.label} must be a whole number.` })
      // 0 is legitimate here — gbe_10_ports is 0 on the 1U models.
      .min(0, { error: `${field.label} cannot be negative.` })
      .nullable(),
  );
}

export function requiredPositiveNumber(field: SpecPlainField) {
  return z.preprocess(
    blankToNumber,
    z
      .number({ error: numberError(field.label) })
      .positive({ error: `${field.label} must be greater than 0.` }),
  );
}

/**
 * A nullable `date` column. Postgres hands back "YYYY-MM-DD" and
 * `<input type="date">` posts the same shape, so the two input shapes agree
 * here without conversion — which is exactly why the column is read as an ISO
 * date string rather than parsed into a JS Date and formatted back.
 */
export function optionalDate(field: SpecPlainField) {
  return z.preprocess(
    blankToNull,
    z.iso
      .date({ error: `${field.label} must be a date (YYYY-MM-DD).` })
      .nullable(),
  );
}

/**
 * A NOT NULL `text[]` column rendered one item per line.
 *
 * Blank coerces to `[]`, **never null**. That is the whole reason this is its
 * own kind rather than a textarea: the column is `NOT NULL DEFAULT '{}'`, so a
 * null would be refused by Postgres at the only supported write path — an
 * editor clearing the last line of a list would get a database error instead of
 * an empty list. Empty lines are dropped and each item trimmed, so trailing
 * newlines and indentation in the textarea do not become list entries.
 */
export function stringList(field: SpecPlainField) {
  return z.preprocess(
    (value) => {
      if (value === undefined || value === null) return [];
      if (Array.isArray(value)) return value;
      if (typeof value !== "string") return value;
      return value
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "");
    },
    z.array(
      z.string().max(field.maxLength ?? 200, {
        error: `Each ${field.label.toLowerCase()} entry must be ${field.maxLength ?? 200} characters or fewer.`,
      }),
    ),
  );
}

function enumValues(field: SpecEnumField) {
  return z.enum(field.options.map((o) => o.value) as [string, ...string[]], {
    error: field.invalidMessage,
  });
}

/**
 * A closed list, required.
 *
 * Note that on product_specs this is used for `raid_level_display`, whose
 * column is NULLABLE. That is deliberate and the general reason an enum kind
 * gets a required variant at all: a null is not neutral when downstream code
 * matches on the string. `usableCapacityTb()` sends a null level down the
 * RAID-5 branch, so leaving it unset quietly publishes a RAID-5 capacity figure
 * for a box that may not be RAID 5 — the same silent-overstatement path the
 * closed list closes for typos, reached by omission instead.
 */
export function requiredEnum(field: SpecEnumField) {
  return z.preprocess(blankToNull, enumValues(field));
}

export function optionalEnum(field: SpecEnumField) {
  return z.preprocess(blankToNull, enumValues(field).nullable());
}

export function schemaForField(field: SpecField): z.ZodType {
  switch (field.kind) {
    case "id":
    case "text-required":
      return requiredText(field);
    case "text-optional":
    case "textarea-optional":
      return optionalText(field);
    case "int-required-positive":
      return requiredPositiveInt(field);
    case "int-optional":
      return optionalInt(field);
    case "num-required-positive":
      return requiredPositiveNumber(field);
    case "date-optional":
      return optionalDate(field);
    case "string-list":
      return stringList(field);
    case "enum-required":
      return requiredEnum(field);
    case "enum-optional":
      return optionalEnum(field);
  }
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/**
 * Build a table's parser from its flattened field list.
 *
 * `ruleViolations` is the table's cross-field check. The conditions themselves
 * live in the per-table `fields.ts` so the form can show the editor the same
 * refusal live, before submitting, without a second copy of the logic — this
 * only translates them into zod issues.
 *
 * `.strip()` is the default in zod: unknown keys (product_specs' `product_sku`,
 * `updated_at`, `updated_by`) are dropped rather than rejected, which is what
 * lets a raw production row be fed in whole.
 */
export function buildSpecSchema(
  fields: readonly SpecField[],
  ruleViolations?: (values: Record<string, unknown>) => SpecRuleViolation[],
) {
  const shape = Object.fromEntries(
    fields.map((f) => [f.name, schemaForField(f)]),
  ) as Record<string, z.ZodType>;

  // superRefine is applied unconditionally — including with no rules — so the
  // returned schema has one type whichever way it is built, and `.shape` stays
  // reachable for the coverage tests.
  return z.object(shape).superRefine((values, ctx) => {
    if (!ruleViolations) return;
    for (const violation of ruleViolations(values as Record<string, unknown>)) {
      ctx.addIssue({
        code: "custom",
        path: [violation.field],
        message: violation.message,
      });
    }
  });
}

/**
 * A parsed row: every column the form owns, coerced. `string[]` is the
 * `string-list` kind's output — the only non-scalar, and never null.
 */
export type SpecFormValues = Record<string, string | number | string[] | null>;

export type SpecParseResult =
  | { ok: true; values: SpecFormValues }
  | { ok: false; fieldErrors: Record<string, string[]> };

export function parseSpecInput(
  schema: z.ZodType,
  input: unknown,
): SpecParseResult {
  const parsed = schema.safeParse(input);
  if (parsed.success) {
    return { ok: true, values: parsed.data as SpecFormValues };
  }
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join(".") || "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { ok: false, fieldErrors };
}
