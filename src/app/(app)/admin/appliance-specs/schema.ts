// The appliance_specs admin form's zod schema — the single parser every write
// goes through, and the one scripts/roundtrip-appliance-specs.mts exercises
// against production rows.
//
// Assembly only: the coercion and the per-kind builders are the shared kit's
// (@/lib/spec-form), and which fields this table has is ./fields.ts's. Both
// halves read the same list, so a column added there is validated here
// automatically.
//
// NO cross-field rule function is passed. Nothing on this table can be refused
// from a single row: every archetype-specific column is nullable by design (ADR
// 0090), and the one invariant that could be violated — the sheet_group pairing
// — spans rows, which single-row zod cannot see. It is checked by the action
// and warned about instead (fields.ts, design §4b).

import {
  buildSpecSchema,
  parseSpecInput,
  specInputFromFormData as inputForFields,
  type SpecFormValues,
  type SpecParseResult,
} from "@/lib/spec-form";
import { APPLIANCE_FIELDS, APPLIANCE_FIELD_NAMES } from "./fields";

/** The 62 columns the form owns, all coerced. */
export type { SpecFormValues, SpecParseResult };

export const applianceFormSchema = buildSpecSchema(APPLIANCE_FIELDS);

export function parseApplianceForm(input: unknown): SpecParseResult {
  return parseSpecInput(applianceFormSchema, input);
}

/** Pull exactly the form's own columns out of a submitted FormData. */
export function applianceInputFromFormData(
  formData: FormData,
): Record<string, unknown> {
  return inputForFields(APPLIANCE_FIELD_NAMES, formData);
}
