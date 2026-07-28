// The product_specs admin form's zod schema — the single parser every write
// goes through, and the one the live round-trip script exercises against all 21
// production rows (design §6, scripts/roundtrip-product-specs.mts).
//
// Assembly only. The coercion, the per-kind builders and the cross-field
// plumbing moved to @/lib/spec-form in ADR 0097 decision 4, shared with the
// appliance_specs form; what stays here is which fields this table has and
// which rules apply to it. Both halves are still driven by ./fields.ts, so a
// column added there is validated here automatically. See that file for why the
// list is shared.
//
// The two input shapes this schema must accept — browser FormData strings and a
// raw Postgres row — and why accepting both is what makes the live round-trip
// possible, are documented on the kit's builders.

import {
  buildSpecSchema,
  parseSpecInput,
  specInputFromFormData as inputForFields,
  type SpecFormValues,
  type SpecParseResult,
} from "@/lib/spec-form";
import {
  SPEC_FIELDS,
  SPEC_FIELD_NAMES,
  specRuleViolations,
  type SpecRuleValues,
} from "./fields";

/** The 43 columns the form owns, all coerced. Values are `string | number | null`. */
export type { SpecFormValues, SpecParseResult };

/**
 * The form's parser. Cross-field rules (design §4c) come from ./fields.ts so
 * the form can show the editor the same refusal live, before submitting,
 * without a second copy of the logic.
 */
export const specFormSchema = buildSpecSchema(SPEC_FIELDS, (values) =>
  specRuleViolations(values as SpecRuleValues),
);

export function parseSpecForm(input: unknown): SpecParseResult {
  return parseSpecInput(specFormSchema, input);
}

/** Pull exactly the form's own columns out of a submitted FormData. */
export function specInputFromFormData(formData: FormData): Record<string, unknown> {
  return inputForFields(SPEC_FIELD_NAMES, formData);
}
