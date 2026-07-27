// The product_specs admin form's zod schema — the single parser every write
// goes through, and the one the live round-trip script exercises against all 21
// production rows (design §6, scripts/roundtrip-product-specs.mts).
//
// Built by walking SPEC_SECTIONS in ./fields.ts, so a column added there is
// validated here automatically. See that file for why the list is shared.
//
// Two input shapes reach this schema and both must parse:
//
//   1. FormData from the browser — every value is a string, and an untouched
//      optional field arrives as "".
//   2. A row straight out of Postgres — numbers are numbers and empty columns
//      are `null`.
//
// Shape 2 is not hypothetical convenience: it is what makes the live round-trip
// check possible. Fixture tests are written to match the schema, so they
// structurally cannot catch "the schema rejects data that is already live." A
// parser that accepts both shapes can be fed production rows directly.

import { z } from "zod";
import {
  RAID_LEVEL_VALUES,
  SPEC_FIELDS,
  SPEC_FIELD_NAMES,
  specRuleViolations,
  type SpecField,
  type SpecRuleValues,
} from "./fields";

// ---------------------------------------------------------------------------
// Coercion — the bridge between the two input shapes above
// ---------------------------------------------------------------------------

/** "" / "   " / undefined / null all mean "no value" and become null. */
function blankToNull(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  return value;
}

/** blankToNull, then string -> number. Non-numeric text becomes NaN. */
function blankToNumber(value: unknown): unknown {
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

function requiredText(field: SpecField) {
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

function optionalText(field: SpecField) {
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

function requiredPositiveInt(field: SpecField) {
  return z.preprocess(
    blankToNumber,
    z
      .number({ error: numberError(field.label) })
      .int({ error: `${field.label} must be a whole number.` })
      .positive({ error: `${field.label} must be greater than 0.` }),
  );
}

function optionalInt(field: SpecField) {
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

function requiredPositiveNumber(field: SpecField) {
  return z.preprocess(
    blankToNumber,
    z
      .number({ error: numberError(field.label) })
      .positive({ error: `${field.label} must be greater than 0.` }),
  );
}

const raidEnum = z.enum(RAID_LEVEL_VALUES as [string, ...string[]], {
  error: "Pick a RAID level from the list.",
});

// raid_level_display is REQUIRED even though the column is nullable. A null
// level is not neutral: usableCapacityTb() sends it down the RAID-5 branch, so
// leaving it unset quietly publishes a RAID-5 capacity figure for a box that may
// not be RAID 5. That is the same silent-overstatement path §4a closes for free
// text, reached by omission instead of by typo. Requiring it rejects no live
// data — all 21 rows carry a value (verified 2026-07-27).
function requiredRaid() {
  return z.preprocess(blankToNull, raidEnum);
}

function optionalRaid() {
  return z.preprocess(blankToNull, raidEnum.nullable());
}

function schemaForField(field: SpecField) {
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
    case "raid-required":
      return requiredRaid();
    case "raid-optional":
      return optionalRaid();
  }
}

// ---------------------------------------------------------------------------
// Cross-field rules that REFUSE the save (design §4c)
//
// The conditions themselves live in ./fields.ts so the form can show the editor
// the same refusal live, before submitting, without a second copy of the logic.
// This function only translates them into zod issues.
// ---------------------------------------------------------------------------

function crossFieldChecks(values: Record<string, unknown>, ctx: z.RefinementCtx) {
  for (const violation of specRuleViolations(values as SpecRuleValues)) {
    ctx.addIssue({
      code: "custom",
      path: [violation.field],
      message: violation.message,
    });
  }
}

// ---------------------------------------------------------------------------
// The schema
// ---------------------------------------------------------------------------

const shape = Object.fromEntries(
  SPEC_FIELDS.map((f) => [f.name, schemaForField(f)]),
) as Record<string, z.ZodType>;

/**
 * The form's parser. `.strip()` is the default in zod: unknown keys (a row's
 * `product_sku`, `updated_at`, `updated_by`) are dropped rather than rejected,
 * which is what lets a raw production row be fed in whole.
 */
export const specFormSchema = z.object(shape).superRefine(crossFieldChecks);

/** The 43 columns the form owns, all coerced. Values are `string | number | null`. */
export type SpecFormValues = Record<string, string | number | null>;

export type SpecParseResult =
  | { ok: true; values: SpecFormValues }
  | { ok: false; fieldErrors: Record<string, string[]> };

export function parseSpecForm(input: unknown): SpecParseResult {
  const parsed = specFormSchema.safeParse(input);
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

/** Pull exactly the form's own columns out of a submitted FormData. */
export function specInputFromFormData(formData: FormData): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const name of SPEC_FIELD_NAMES) {
    const value = formData.get(name);
    input[name] = typeof value === "string" ? value : null;
  }
  return input;
}
