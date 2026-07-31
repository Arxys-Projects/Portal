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

/** One row of a `json-rows` field, as it is stored in the jsonb column. */
export type SpecJsonRow = Record<string, string | number>;

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
  | "enum-optional"
  /**
   * A nullable `jsonb` column holding an array of flat records — rendered as an
   * editable table of rows with a fixed set of typed columns, serialised into
   * one hidden input. See SpecJsonRowsField.
   */
  | "json-rows";

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

/** One column of a `json-rows` field's row shape. */
export type SpecJsonColumn = {
  /** The key inside each stored row object. */
  key: string;
  label: string;
  kind: "text" | "int-positive" | "enum";
  /** Required — and only read — when `kind` is "enum". */
  options?: readonly SpecFieldOption[];
  /** Max characters, "text" columns only. */
  maxLength?: number;
  placeholder?: string;
};

/**
 * A nullable `jsonb` column holding an array of flat records with a KNOWN row
 * shape, edited as a table rather than as raw JSON.
 *
 * Its first instance is `appliance_specs.camera_matrix` (ADR 0097 §4d), whose
 * five keys the datasheet template reads by name. ADR 0090 logged "the camera
 * matrix's internal shape is unvalidated JSONB" as a negative; a JSON textarea
 * would have left it that way — a missing key or a fps typed as "30 " reaches
 * the template as silently wrong output, and the form is the only write path,
 * so this kind is where that closes.
 *
 * The kit owns the *mechanism* (a table of typed cells, add/remove row, one
 * hidden input, a zod array-of-objects built from `columns`). The per-table
 * field list owns which columns exist and what they are called — the same split
 * as every other kind here.
 */
export type SpecJsonRowsField = {
  name: string;
  label: string;
  /** Shown under the editor. */
  hint?: string;
  kind: "json-rows";
  columns: readonly SpecJsonColumn[];
  /** Label for the add-row button, e.g. "Add a matrix row". */
  addRowLabel: string;
  /** Shown in place of the table when there are no rows. */
  emptyLabel: string;
};

/** Every other kind: free text and numbers. */
export type SpecPlainField = {
  name: string;
  label: string;
  /** Shown under the input. Reserved for the fields that carry real risk. */
  hint?: string;
  kind: Exclude<
    SpecFieldKind,
    "enum-required" | "enum-optional" | "json-rows"
  >;
  /** Max characters for text kinds. */
  maxLength?: number;
};

export type SpecField = SpecPlainField | SpecEnumField | SpecJsonRowsField;

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

export function isJsonRowsField(field: SpecField): field is SpecJsonRowsField {
  return field.kind === "json-rows";
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
  return (
    field.kind === "textarea-optional" ||
    field.kind === "string-list" ||
    // A row editor is a table; half a grid column is never the right width.
    field.kind === "json-rows"
  );
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
 *
 * A `jsonb` array-of-objects (the `json-rows` kind) arrives as an array too,
 * and is serialised back to JSON — the string its hidden input carries and its
 * zod builder re-parses. Joining THAT with newlines would render
 * "[object Object]" per row, so the two array shapes are told apart by their
 * elements rather than by the kind: this helper is bound to a list of field
 * NAMES, not fields, so that the product_specs surface's existing binding keeps
 * working untouched.
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
      // An empty array renders as "" whichever kind it belongs to: `string-list`
      // coerces blank back to [], and `json-rows` coerces it to null — the form
      // never writes an empty matrix as [], so a stored [] would show up as
      // round-trip drift rather than being silently rewritten.
      if (value.length === 0) values[name] = "";
      else if (value.every((v) => typeof v === "string")) values[name] = value.join("\n");
      else values[name] = JSON.stringify(value);
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

/**
 * Warn about a datasheet photo path that will not resolve.
 *
 * Both spec tables carry `product_photo_path` / `rear_io_photo_path` holding a
 * path under `public/` (ADR 0107). A path that is merely *wrong* fails in the
 * quietest possible way: the loader catches the read, returns null, and the
 * datasheet holds an empty frame — which is exactly what it does when no photo
 * exists at all. Nothing distinguishes "not shot yet" from "typo", so the form
 * has to say it at entry time.
 *
 * It WARNS rather than refuses, matching how both tables treat everything else
 * that is unfinished rather than illegal: nothing here can prove a file exists
 * (the form runs in the browser, the file lives on the server's disk), so a
 * refusal would be guessing with a hard stop.
 *
 * Shared by both forms so the same column cannot behave differently depending
 * on which archetype the editor happens to be on.
 */
export function photoPathWarnings(values: Record<string, unknown>): string[] {
  const warnings: string[] = [];
  const labels: Record<string, string> = {
    product_photo_path: "Product photo path",
    rear_io_photo_path: "Rear I/O photo path",
  };
  for (const [name, label] of Object.entries(labels)) {
    const raw = values[name];
    if (typeof raw !== "string") continue;
    const path = raw.trim();
    if (path === "") continue;
    if (/^https?:\/\//i.test(path)) {
      warnings.push(
        `${label} is a URL. The datasheet reads files from public/ on disk at render time and never fetches over the network — use a path like /price-book/v700-v800-hero.png.`,
      );
    } else if (!path.startsWith("/")) {
      warnings.push(
        `${label} does not start with "/". Paths are resolved under public/, so it needs a leading slash — e.g. /price-book/v700-v800-hero.png.`,
      );
    }
    if (path !== "" && !/\.png$/i.test(path)) {
      warnings.push(
        `${label} does not end in .png. The PDF asset loader reads PNG only — a JPEG or AVIF will silently render as an empty frame.`,
      );
    }
  }
  return warnings;
}
