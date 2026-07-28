import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildSpecSchema,
  blankToNull,
  blankToNumber,
  flattenSpecFields,
  initialValuesFromRow,
  isEnumField,
  isNumericKind,
  isRequiredKind,
  isWideKind,
  parseSpecInput,
  specInputFromFormData,
  toNumberOrNull,
  type SpecField,
  type SpecSection,
} from "./index";

// The kit's own tests. The product_specs surface's tests
// (src/app/(app)/admin/specs/schema.test.ts) remain the proof that the kinds
// behave as the shipped form needs them to, against that table's real field
// list; these cover the machinery on a small synthetic table, and specifically
// the generalised enum kind, whose only production instance today is the RAID
// select.

const COLOUR_OPTIONS = [
  { value: "red", label: "Red" },
  { value: "blue", label: "Blue" },
] as const;

const SECTIONS: SpecSection[] = [
  {
    title: "Identity",
    fields: [
      { name: "id", label: "Id", kind: "id", maxLength: 64 },
      { name: "name", label: "Name", kind: "text-required", maxLength: 20 },
      { name: "note", label: "Note", kind: "textarea-optional", maxLength: 100 },
    ],
  },
  {
    title: "Numbers and choices",
    fields: [
      { name: "count", label: "Count", kind: "int-required-positive" },
      { name: "ports", label: "Ports", kind: "int-optional" },
      { name: "ratio", label: "Ratio", kind: "num-required-positive" },
      { name: "asOf", label: "As of", kind: "date-optional" },
      { name: "tags", label: "Tags", kind: "string-list", maxLength: 20 },
      {
        name: "colour",
        label: "Colour",
        kind: "enum-required",
        options: COLOUR_OPTIONS,
        emptyOptionLabel: "— select a colour —",
        invalidMessage: "Pick a colour from the list.",
      },
      {
        name: "accent",
        label: "Accent",
        kind: "enum-optional",
        options: COLOUR_OPTIONS,
        emptyOptionLabel: "— none —",
        invalidMessage: "Pick an accent from the list.",
      },
    ],
  },
];

const FIELDS = flattenSpecFields(SECTIONS);
const FIELD_NAMES = FIELDS.map((f) => f.name);

const schema = buildSpecSchema(FIELDS);

function validRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "THING-1",
    name: "Thing",
    note: null,
    count: 4,
    ports: 0,
    ratio: 1.5,
    asOf: null,
    tags: [],
    colour: "red",
    accent: null,
    ...overrides,
  };
}

function expectOk(input: unknown, s = schema) {
  const result = parseSpecInput(s, input);
  assert.equal(
    result.ok,
    true,
    result.ok ? "" : `expected parse to succeed, got ${JSON.stringify(result.fieldErrors)}`,
  );
  return result.ok ? result.values : {};
}

function expectFieldError(input: unknown, field: string, s = schema) {
  const result = parseSpecInput(s, input);
  assert.equal(result.ok, false, `expected parse to fail on '${field}'`);
  if (result.ok) return "";
  assert.ok(
    result.fieldErrors[field]?.length,
    `expected an error on '${field}', got ${JSON.stringify(result.fieldErrors)}`,
  );
  return result.fieldErrors[field][0];
}

describe("buildSpecSchema", () => {
  it("builds one entry per field, in the flattened section order", () => {
    assert.deepEqual(FIELD_NAMES, [
      "id",
      "name",
      "note",
      "count",
      "ports",
      "ratio",
      "asOf",
      "tags",
      "colour",
      "accent",
    ]);
    assert.deepEqual(Object.keys(schema.shape).sort(), [...FIELD_NAMES].sort());
  });

  it("strips keys the field list does not own, rather than rejecting them", () => {
    // This is what lets a raw `select *` row — provenance columns and all — be
    // fed to the parser whole.
    const values = expectOk(validRow({ updated_at: "2026-07-28T00:00:00Z" }));
    assert.equal("updated_at" in values, false);
  });

  it("accepts a Postgres row and the same row as form strings identically", () => {
    const fromRow = expectOk(validRow());
    const fromForm = expectOk(initialValuesFromRow(FIELD_NAMES, validRow()));
    assert.deepEqual(fromForm, fromRow);
    assert.equal(typeof fromForm.count, "number");
    assert.equal(fromForm.note, null);
    assert.equal(fromForm.accent, null);
  });

  it("wires a cross-field rule into per-field issues", () => {
    const withRule = buildSpecSchema(FIELDS, (values) =>
      Number(values.ports) > Number(values.count)
        ? [{ field: "ports", message: "Ports cannot exceed count." }]
        : [],
    );
    assert.equal(
      expectFieldError(validRow({ count: 2, ports: 3 }), "ports", withRule),
      "Ports cannot exceed count.",
    );
    expectOk(validRow({ count: 4, ports: 4 }), withRule);
  });

  it("parses with no rules at all", () => {
    expectOk(validRow(), buildSpecSchema(FIELDS));
  });
});

describe("the generalised enum kind (ADR 0097 decision 4)", () => {
  it("accepts every value in the field's own option list", () => {
    for (const option of COLOUR_OPTIONS) {
      assert.equal(expectOk(validRow({ colour: option.value })).colour, option.value);
    }
  });

  it("refuses anything outside the list, with the field's own message", () => {
    // The whole reason the kind exists: downstream code matches these strings
    // exactly, and a near-miss ('Red', 'red ', 'crimson') fails quietly rather
    // than loudly. Each field states its own message, so a second surface
    // cannot inherit product_specs' RAID wording by accident.
    for (const bad of ["Red", "crimson", "RED", "red2"]) {
      assert.equal(
        expectFieldError(validRow({ colour: bad }), "colour"),
        "Pick a colour from the list.",
      );
    }
    assert.equal(
      expectFieldError(validRow({ accent: "crimson" }), "accent"),
      "Pick an accent from the list.",
    );
  });

  it("trims a padded value instead of letting it fall through as unrecognised", () => {
    assert.equal(expectOk(validRow({ colour: " red " })).colour, "red");
  });

  it("requires enum-required and refuses blank, null and missing alike", () => {
    for (const blank of ["", "   ", null, undefined]) {
      expectFieldError(validRow({ colour: blank }), "colour");
    }
  });

  it("lets enum-optional be blank, and stores blank as null rather than ''", () => {
    for (const blank of ["", "   ", null]) {
      assert.equal(expectOk(validRow({ accent: blank })).accent, null);
    }
    assert.equal(expectOk(validRow({ accent: "blue" })).accent, "blue");
  });

  it("is recognised by the predicates the renderer keys on", () => {
    const colour = FIELDS.find((f) => f.name === "colour") as SpecField;
    const accent = FIELDS.find((f) => f.name === "accent") as SpecField;
    const name = FIELDS.find((f) => f.name === "name") as SpecField;
    // The shell reads options/emptyOptionLabel off the field only after this
    // guard, and marks the input required and asterisked from isRequiredKind.
    assert.equal(isEnumField(colour), true);
    assert.equal(isEnumField(name), false);
    assert.equal(isRequiredKind(colour), true);
    assert.equal(isRequiredKind(accent), false);
    assert.equal(isNumericKind(colour), false);
  });
});

describe("date-optional", () => {
  it("round-trips the YYYY-MM-DD shape Postgres and <input type=\"date\"> both use", () => {
    // The two input shapes agree here without conversion, which is why the
    // column is read as an ISO string rather than parsed into a Date.
    assert.equal(expectOk(validRow({ asOf: "2026-07-28" })).asOf, "2026-07-28");
  });

  it("treats blank as null rather than as an invalid date", () => {
    for (const blank of ["", "   ", null, undefined]) {
      assert.equal(expectOk(validRow({ asOf: blank })).asOf, null);
    }
  });

  it("refuses shapes that are not an ISO date, with the field's own label", () => {
    for (const bad of ["28/07/2026", "2026-13-01", "July 28 2026", "2026-07-28T00:00:00Z"]) {
      assert.equal(
        expectFieldError(validRow({ asOf: bad }), "asOf"),
        "As of must be a date (YYYY-MM-DD).",
      );
    }
  });
});

describe("string-list", () => {
  it("coerces a blank list to [] and NEVER to null", () => {
    // The column this kind exists for is NOT NULL DEFAULT '{}'. A null would be
    // refused by Postgres at the only supported write path, so an editor
    // clearing the last line would get a database error instead of an empty
    // list. This is the single most important property of the kind.
    for (const blank of ["", "   ", "\n\n", null, undefined]) {
      assert.deepEqual(expectOk(validRow({ tags: blank })).tags, []);
    }
  });

  it("splits one item per line, trimming each", () => {
    assert.deepEqual(expectOk(validRow({ tags: "SEV\nSecure Boot" })).tags, [
      "SEV",
      "Secure Boot",
    ]);
    assert.deepEqual(expectOk(validRow({ tags: "  SEV  \n  SME  " })).tags, ["SEV", "SME"]);
  });

  it("drops empty and whitespace-only lines rather than storing them", () => {
    // Trailing newlines are what a textarea produces most often; they must not
    // become empty list entries.
    assert.deepEqual(expectOk(validRow({ tags: "SEV\n\n  \nSME\n" })).tags, ["SEV", "SME"]);
  });

  it("accepts an array unchanged, so a Postgres row parses as-is", () => {
    assert.deepEqual(expectOk(validRow({ tags: ["SEV", "SME"] })).tags, ["SEV", "SME"]);
  });

  it("caps each entry, not the list as a whole", () => {
    assert.match(
      expectFieldError(validRow({ tags: "x".repeat(21) }), "tags.0"),
      /must be 20 characters or fewer/,
    );
    // Many short entries are fine — the limit is per item.
    assert.deepEqual(
      expectOk(validRow({ tags: Array(50).fill("SEV").join("\n") })).tags,
      Array(50).fill("SEV"),
    );
  });

  it("renders back to one-per-line text, so a saved list re-edits cleanly", () => {
    // String(["a","b"]) would give "a,b", which would re-parse as ONE item.
    const values = initialValuesFromRow(FIELD_NAMES, validRow({ tags: ["SEV", "SME"] }));
    assert.equal(values.tags, "SEV\nSME");
    assert.deepEqual(expectOk(values).tags, ["SEV", "SME"]);
  });

  it("is not a required kind — a blank list is a legitimate value", () => {
    const tags = FIELDS.find((f) => f.name === "tags") as SpecField;
    assert.equal(isRequiredKind(tags), false);
    assert.equal(isWideKind(tags), true);
  });
});

describe("the plain kinds", () => {
  it("requires the NOT NULL text columns and trims what it stores", () => {
    assert.match(expectFieldError(validRow({ name: "  " }), "name"), /is required/);
    assert.equal(expectOk(validRow({ name: "  Thing  " })).name, "Thing");
  });

  it("enforces maxLength per field", () => {
    assert.match(
      expectFieldError(validRow({ name: "x".repeat(21) }), "name"),
      /20 characters or fewer/,
    );
  });

  it("distinguishes a blank required number from unparseable text", () => {
    assert.equal(expectFieldError(validRow({ ratio: "" }), "ratio"), "Ratio is required.");
    assert.equal(
      expectFieldError(validRow({ ratio: "lots" }), "ratio"),
      "Ratio must be a number.",
    );
  });

  it("treats 0 as a real value on a nullable count and refuses a negative one", () => {
    assert.equal(expectOk(validRow({ ports: 0 })).ports, 0);
    assert.equal(expectOk(validRow({ ports: "" })).ports, null);
    assert.match(expectFieldError(validRow({ ports: -1 }), "ports"), /cannot be negative/);
  });

  it("refuses a decimal on an integer column and allows one on a numeric column", () => {
    assert.match(expectFieldError(validRow({ count: 2.5 }), "count"), /whole number/);
    assert.equal(expectOk(validRow({ ratio: 2.5 })).ratio, 2.5);
  });

  it("refuses zero and negatives on the CHECK (> 0) kinds", () => {
    for (const field of ["count", "ratio"]) {
      assert.match(
        expectFieldError(validRow({ [field]: 0 }), field),
        /greater than 0/,
      );
      expectFieldError(validRow({ [field]: -1 }), field);
    }
  });
});

describe("coercion helpers", () => {
  it("blankToNull treats whitespace as absent and trims the rest", () => {
    assert.equal(blankToNull(""), null);
    assert.equal(blankToNull("   "), null);
    assert.equal(blankToNull(null), null);
    assert.equal(blankToNull(undefined), null);
    assert.equal(blankToNull("  6 "), "6");
    assert.equal(blankToNull(0), 0);
  });

  it("blankToNumber keeps blank as null rather than folding it to 0", () => {
    // A blank folded to 0 would pass a `positive()` check as a rejection rather
    // than as "you left this empty", and would sail through `min(0)` entirely.
    assert.equal(blankToNumber(""), null);
    assert.equal(blankToNumber("   "), null);
    assert.equal(blankToNumber("12"), 12);
    assert.equal(blankToNumber(12), 12);
    assert.ok(Number.isNaN(blankToNumber("twelve")));
  });

  it("toNumberOrNull is the same reading, for the live client-side rules", () => {
    assert.equal(toNumberOrNull(""), null);
    assert.equal(toNumberOrNull("twelve"), null);
    assert.equal(toNumberOrNull("12"), 12);
    assert.equal(toNumberOrNull(12), 12);
    assert.equal(toNumberOrNull(Infinity), null);
  });
});

describe("initialValuesFromRow / specInputFromFormData", () => {
  it("renders a row as display strings, null as empty, for exactly the named fields", () => {
    const values = initialValuesFromRow(FIELD_NAMES, validRow({ updated_by: "someone" }));
    assert.deepEqual(Object.keys(values), FIELD_NAMES);
    assert.equal(values.count, "4");
    assert.equal(values.ports, "0");
    assert.equal(values.note, "");
    assert.equal("updated_by" in values, false);
  });

  it("produces a blank set for the create form", () => {
    const values = initialValuesFromRow(FIELD_NAMES, null);
    assert.equal(Object.keys(values).length, FIELD_NAMES.length);
    assert.ok(Object.values(values).every((v) => v === ""));
  });

  it("reads exactly the named fields out of FormData and ignores anything else posted", () => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(
      initialValuesFromRow(FIELD_NAMES, validRow()),
    )) {
      formData.set(key, value);
    }
    formData.set("updated_by", "3f0d0c1e-0000-4000-8000-000000000000");

    const input = specInputFromFormData(FIELD_NAMES, formData);
    assert.deepEqual(Object.keys(input).sort(), [...FIELD_NAMES].sort());
    assert.equal("updated_by" in input, false);
    assert.deepEqual(expectOk(input), expectOk(validRow()));
  });

  it("turns a missing field into null rather than the string 'null'", () => {
    const input = specInputFromFormData(FIELD_NAMES, new FormData());
    assert.equal(input.name, null);
    assert.equal(input.count, null);
  });
});
