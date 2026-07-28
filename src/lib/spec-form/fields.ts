// The shared field vocabulary for the spec admin forms (ADR 0097 decision 4;
// design datasheets/datasheet-phase2-admin-surface-design.md §5).
//
// ADR 0096 shipped ONE declarative field list driving three consumers — the zod
// schema, the rendered inputs, and the index page's labels — for product_specs.
// Its stated revisit condition was "a second archetype's form". That has fired:
// appliance_specs needs the same machinery, and a straight copy would duplicate
// the kind vocabulary, the zod builders, the coercion helpers and the
// section-walking renderer, with drift risk in exactly the layer that guards
// published data.
//
// What lives HERE is the machinery only. What stays per-table, and must stay
// per-table, is each surface's own field list: sections, labels, hints, rules
// and warnings. The kit knows what an `int-optional` is; it never knows that
// `gbe_10_ports` exists.
//
// Pure data. No zod, no React, no server-only imports — this module is bundled
// into the client forms, imported by the node test runner, and imported by the
// round-trip scripts, so it must stay importable from all three.

/** One choice in an `enum-required` / `enum-optional` select. */
export type SpecFieldOption = { value: string; label: string };

export type SpecFieldKind =
  /** Primary key. Required, and read-only once the row exists. */
  | "id"
  /** NOT NULL text column. */
  | "text-required"
  /** Nullable text column; blank submits as null. */
  | "text-optional"
  /** Nullable free-form text, rendered as a textarea. */
  | "textarea-optional"
  /** NOT NULL integer with a CHECK (> 0). */
  | "int-required-positive"
  /** Nullable integer; 0 is legitimate (gbe_10_ports is 0 on 1U models). */
  | "int-optional"
  /** NOT NULL numeric with a CHECK (> 0). */
  | "num-required-positive"
  /** Nullable `date` column; blank submits as null. Rendered as <input type="date">. */
  | "date-optional"
  /**
   * NOT NULL `text[]` with a DEFAULT '{}'. Rendered one item per line in a
   * textarea; blank submits as `[]`, NEVER null — see the builder in ./schema.
   */
  | "string-list"
  /** Closed option list, required. See SpecEnumField. */
  | "enum-required"
  /** Closed option list, nullable; blank submits as null. */
  | "enum-optional";

/**
 * A field whose value must come from a closed list.
 *
 * Generalised from the product_specs RAID select (design 0096 §4a), which is
 * its first instance: `usableCapacityTb()` sends every unrecognised string to
 * its RAID-5 branch, so free text would *silently overstate* net-usable
 * capacity. The same shape of failure — a string the downstream code matches
 * exactly, failing quietly when it does not — is why `family_type` and the
 * camera matrix's codec are the next two instances (ADR 0097 §4a, §4d).
 *
 * `options`, `emptyOptionLabel` and `invalidMessage` are all REQUIRED rather
 * than defaulted. A defaulted blank-option label or error message would render
 * plausible-but-wrong copy on a new surface and nothing would catch it; making
 * them mandatory means each field states its own words.
 */
export type SpecEnumField = {
  name: string;
  label: string;
  /** Shown under the input. Reserved for the fields that carry real risk. */
  hint?: string;
  kind: "enum-required" | "enum-optional";
  options: readonly SpecFieldOption[];
  /** The text of the blank first option, e.g. "— select a level —" / "— none —". */
  emptyOptionLabel: string;
  /** The validation message when the value is not in `options`. */
  invalidMessage: string;
};

/** Every other kind: free text and numbers. */
export type SpecPlainField = {
  name: string;
  label: string;
  /** Shown under the input. Reserved for the fields that carry real risk. */
  hint?: string;
  kind: Exclude<SpecFieldKind, "enum-required" | "enum-optional">;
  /** Max characters for text kinds. */
  maxLength?: number;
};

export type SpecField = SpecPlainField | SpecEnumField;

export type SpecSection = {
  title: string;
  /** Rendered above the section's fields when present. */
  note?: string;
  fields: SpecField[];
};

/** A cross-field condition that REFUSES the save. */
export type SpecRuleViolation = { field: string; message: string };

export function isEnumField(field: SpecField): field is SpecEnumField {
  return field.kind === "enum-required" || field.kind === "enum-optional";
}

export function isNumericKind(field: SpecField): boolean {
  return (
    field.kind === "int-required-positive" ||
    field.kind === "int-optional" ||
    field.kind === "num-required-positive"
  );
}

export function isRequiredKind(field: SpecField): boolean {
  return (
    field.kind === "id" ||
    field.kind === "text-required" ||
    field.kind === "int-required-positive" ||
    field.kind === "num-required-positive" ||
    field.kind === "enum-required"
  );
}

/**
 * Kinds whose input spans both grid columns rather than sharing a row: the
 * free-text ones, where a half-width box would be the wrong shape for the
 * content.
 */
export function isWideKind(field: SpecField): boolean {
  return field.kind === "textarea-optional" || field.kind === "string-list";
}

/** Every field of every section, flattened in section order. */
export function flattenSpecFields(sections: readonly SpecSection[]): SpecField[] {
  return sections.flatMap((s) => s.fields);
}

/** "" / null / non-numeric text -> null. Lets the form feed raw input strings in. */
export function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * A database row (or nothing, on the create form) as the display strings the
 * inputs take. Null becomes "" — which specInputFromFormData/blankToNull turns
 * back into null on the way out, so an untouched empty column round-trips
 * unchanged rather than becoming an empty string in the database.
 *
 * A `text[]` column arrives as a real array and is joined one item per line,
 * which is how the `string-list` textarea renders and re-parses it. `String()`
 * on an array would produce "a,b" — comma-joined, and then split back into a
 * single item on the way in.
 */
export function initialValuesFromRow(
  fieldNames: readonly string[],
  row: Record<string, unknown> | null,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const name of fieldNames) {
    const value = row?.[name];
    if (value === null || value === undefined) {
      values[name] = "";
    } else if (Array.isArray(value)) {
      values[name] = value.join("\n");
    } else {
      values[name] = String(value);
    }
  }
  return values;
}

/** Pull exactly the form's own columns out of a submitted FormData. */
export function specInputFromFormData(
  fieldNames: readonly string[],
  formData: FormData,
): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const name of fieldNames) {
    const value = formData.get(name);
    input[name] = typeof value === "string" ? value : null;
  }
  return input;
}
