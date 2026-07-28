import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseSpecForm, specFormSchema, specInputFromFormData } from "./schema";
import {
  initialValuesFromRow,
  SPEC_FIELD_NAMES,
  specRuleViolations,
  specWarnings,
  toNumberOrNull,
} from "./fields";

// A row shaped like production (VX5-V500-192: 12 bays, 12 drives, RAID 6).
// Both input shapes the schema must accept are derived from it: this object is
// the "row out of Postgres" shape, and asFormShape() below is the "every value is
// a string" shape the browser posts.
function validRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "VX5-V500-192",
    model_name: "VideoX V500 192TB 2U 12Bay",
    form_factor: "2U Rackmount",
    rack_units: "2U",
    notes: null,
    cpu_model: "AMD EPYC 9005 Series",
    cpu_model_full: "AMD EPYC 9005 3.3Ghz 16/32 Core",
    cpu_cores_threads: "16C/32T",
    cores_threads: "16C/32T",
    cpu_base_ghz: 3.3,
    cpu_turbo_ghz: "3.3 Ghz",
    cpu_passmark: 48936,
    cpu_cache: "64MB",
    mem_bandwidth: "614 GB/s",
    avx_512: "Yes",
    workload_affinity: "Yes",
    chiplet_arch: "Yes",
    infinity_guard: "Yes",
    ram_gb: 32,
    ram_spec: "32GB ECC DDR5",
    storage_raw_tb: 192,
    drive_bays: 12,
    hdd_count: 12,
    hdd_mtbf: "2.5 Million",
    raid_support: "RAID 0/1/5/6/10",
    raid_level_display: "6",
    raid_level_alt_display: null,
    battery_raid: "YES",
    os_ssd_type: "2x Enterprise SSD",
    os_redundancy: "Mirrored, hot-swap",
    max_cameras: 200,
    max_cameras_h265: 200,
    max_bandwidth_mbps: 2000,
    network: "4 × 10GbE + 1 IPMI",
    gbe_1_ports: 0,
    gbe_10_ports: 4,
    sfp_addon: "Optional",
    hotswap_power: "Yes",
    os: "Windows Server 2022 / 2025 IoT",
    os_edition: "Windows Server 2022 OR 2025 LTSC",
    warranty: "5yr NBD, Advanced Replacement",
    vms_certified: "Milestone XProtect, Avigilon ACC, Genetec",
    avigilon_gpu: "Optional",
    ...overrides,
  };
}

/** The same row as the browser would post it: every value a string, null as "". */
function asFormShape(row: Record<string, unknown>): Record<string, string> {
  return initialValuesFromRow(row);
}

function expectOk(input: unknown) {
  const result = parseSpecForm(input);
  assert.equal(
    result.ok,
    true,
    result.ok ? "" : `expected parse to succeed, got ${JSON.stringify(result.fieldErrors)}`,
  );
  return result.ok ? result.values : {};
}

function expectFieldError(input: unknown, field: string) {
  const result = parseSpecForm(input);
  assert.equal(result.ok, false, `expected parse to fail on '${field}'`);
  if (result.ok) return "";
  assert.ok(
    result.fieldErrors[field]?.length,
    `expected an error on '${field}', got ${JSON.stringify(result.fieldErrors)}`,
  );
  return result.fieldErrors[field][0];
}

describe("specFormSchema — field coverage", () => {
  it("validates exactly the 65 fields the form renders", () => {
    assert.equal(SPEC_FIELD_NAMES.length, 65);
    const shapeKeys = Object.keys(specFormSchema.shape).sort();
    assert.deepEqual(shapeKeys, [...SPEC_FIELD_NAMES].sort());
  });

  it("strips the columns the form deliberately does not own", () => {
    // product_sku is dead; updated_at / updated_by belong to the database
    // trigger. All three arrive on a `select *` row and must be dropped, not
    // rejected — that is what lets a raw production row be parsed whole, and it
    // is what keeps the action from fighting the trigger.
    const values = expectOk(
      validRow({
        product_sku: "VX5-V500-192",
        updated_at: "2026-07-27T19:16:20.362297+00:00",
        updated_by: "3f0d0c1e-0000-4000-8000-000000000000",
      }),
    );
    assert.equal("product_sku" in values, false);
    assert.equal("updated_at" in values, false);
    assert.equal("updated_by" in values, false);
  });
});

describe("specFormSchema — both input shapes", () => {
  it("accepts a production row as-is", () => {
    const values = expectOk(validRow());
    assert.equal(values.storage_raw_tb, 192);
    assert.equal(values.hdd_count, 12);
    assert.equal(values.raid_level_display, "6");
    assert.equal(values.notes, null);
  });

  it("accepts the same row posted as form strings, and produces identical output", () => {
    const fromRow = expectOk(validRow());
    const fromForm = expectOk(asFormShape(validRow()));
    assert.deepEqual(fromForm, fromRow);
    // Specifically: strings became numbers and "" became null, not "".
    assert.equal(typeof fromForm.storage_raw_tb, "number");
    assert.equal(typeof fromForm.cpu_passmark, "number");
    assert.equal(fromForm.notes, null);
    assert.equal(fromForm.raid_level_alt_display, null);
  });

  it("trims text rather than storing padded values", () => {
    const values = expectOk(validRow({ model_name: "  VideoX V500  " }));
    assert.equal(values.model_name, "VideoX V500");
  });

  it("treats a whitespace-only optional field as null", () => {
    const values = expectOk(validRow({ notes: "   " }));
    assert.equal(values.notes, null);
  });
});

describe("specFormSchema — NOT NULL and CHECK (> 0) columns", () => {
  it("requires every NOT NULL text column", () => {
    for (const field of [
      "model_name",
      "form_factor",
      "cpu_model",
      "cpu_cores_threads",
      "raid_support",
      "network",
      "os",
      "warranty",
      "vms_certified",
    ]) {
      const message = expectFieldError(validRow({ [field]: "" }), field);
      assert.match(message, /is required/);
    }
  });

  it("requires the primary key", () => {
    expectFieldError(validRow({ id: "" }), "id");
  });

  it("refuses zero or negative values on the CHECK (> 0) columns", () => {
    for (const field of [
      "storage_raw_tb",
      "cpu_base_ghz",
      "cpu_passmark",
      "ram_gb",
      "max_cameras",
      "max_cameras_h265",
    ]) {
      assert.match(
        expectFieldError(validRow({ [field]: 0 }), field),
        /greater than 0/,
      );
      expectFieldError(validRow({ [field]: -1 }), field);
      expectFieldError(validRow({ [field]: "" }), field);
    }
  });

  it("refuses a decimal where the column is an integer", () => {
    assert.match(
      expectFieldError(validRow({ hdd_count: 2.5 }), "hdd_count"),
      /whole number/,
    );
    expectFieldError(validRow({ cpu_passmark: 48936.5 }), "cpu_passmark");
  });

  it("accepts a decimal where the column is numeric", () => {
    assert.equal(expectOk(validRow({ cpu_base_ghz: 4.25 })).cpu_base_ghz, 4.25);
    assert.equal(expectOk(validRow({ storage_raw_tb: 62.5 })).storage_raw_tb, 62.5);
  });

  it("reports non-numeric text with a readable message, not zod's raw NaN default", () => {
    // Regression guard: z.number()'s default here is "Invalid input: expected
    // number, received NaN", which tells an editor who typed "twelve" nothing.
    assert.equal(
      expectFieldError(validRow({ hdd_count: "twelve" }), "hdd_count"),
      "HDD count must be a number.",
    );
    assert.equal(
      expectFieldError(validRow({ storage_raw_tb: "lots" }), "storage_raw_tb"),
      "Raw storage (TB) must be a number.",
    );
    // A blank required number is "required", not "must be a number" — the two
    // cases are distinguished so the message matches what the editor did.
    assert.equal(
      expectFieldError(validRow({ storage_raw_tb: "" }), "storage_raw_tb"),
      "Raw storage (TB) is required.",
    );
  });

  it("accepts 0 on a nullable count column and refuses a negative one", () => {
    // gbe_10_ports is 0 on the 1U models, so 0 must not be treated as absent.
    assert.equal(expectOk(validRow({ gbe_10_ports: 0 })).gbe_10_ports, 0);
    assert.match(
      expectFieldError(validRow({ gbe_10_ports: -1 }), "gbe_10_ports"),
      /cannot be negative/,
    );
  });

  it("leaves every nullable column nullable", () => {
    const values = expectOk(
      validRow({
        rack_units: null,
        notes: null,
        cpu_model_full: null,
        cores_threads: null,
        cpu_turbo_ghz: null,
        cpu_cache: null,
        mem_bandwidth: null,
        avx_512: null,
        workload_affinity: null,
        chiplet_arch: null,
        infinity_guard: null,
        ram_spec: null,
        drive_bays: null,
        hdd_count: null,
        hdd_mtbf: null,
        raid_level_alt_display: null,
        battery_raid: null,
        os_ssd_type: null,
        os_redundancy: null,
        max_bandwidth_mbps: null,
        gbe_1_ports: null,
        gbe_10_ports: null,
        sfp_addon: null,
        hotswap_power: null,
        os_edition: null,
        avigilon_gpu: null,
      }),
    );
    assert.equal(values.hdd_count, null);
    assert.equal(values.drive_bays, null);
    assert.equal(values.avigilon_gpu, null);
  });
});

describe("specFormSchema — the RAID level is a closed set (design §4a)", () => {
  it("accepts every level usableCapacityTb() understands, plus deprecated NA", () => {
    // 'NA' must round-trip: the three uncorrected V100 rows carry it, and a
    // schema that refused it would lock an admin out of the very rows the form
    // exists to correct.
    for (const level of ["1", "5", "6", "60", "JBOD", "NA"]) {
      const hddCount = level === "60" ? 12 : 2;
      const values = expectOk(
        validRow({ raid_level_display: level, hdd_count: hddCount, drive_bays: 12 }),
      );
      assert.equal(values.raid_level_display, level);
    }
  });

  it("refuses the free-text spellings that would silently overstate capacity", () => {
    // Each of these would fall through usableCapacityTb()'s exact-match chain to
    // the RAID-5 branch (parity = 1), publishing MORE usable capacity than the
    // box delivers. That is the under-spec failure ADR 0092 fixed; a text input
    // would have re-introduced it.
    for (const bad of ["RAID 6", "raid6", "06", "6.0", "60 drives", "R60", "0", "10"]) {
      const message = expectFieldError(validRow({ raid_level_display: bad }), "raid_level_display");
      assert.match(message, /Pick a RAID level/);
    }
  });

  it("normalises a padded level instead of letting it fall through", () => {
    // '6 ' is the specific typo the design names. Trimming turns it into the
    // real level rather than an unrecognised string.
    assert.equal(expectOk(validRow({ raid_level_display: " 6 " })).raid_level_display, "6");
  });

  it("requires the configured level, because a null one silently means RAID 5", () => {
    // The column is nullable in Postgres, but a null level is not neutral:
    // usableCapacityTb() sends it down the RAID-5 branch. Requiring it rejects
    // no live data — all 21 rows carry a value.
    expectFieldError(validRow({ raid_level_display: null }), "raid_level_display");
    expectFieldError(validRow({ raid_level_display: "" }), "raid_level_display");
  });

  it("allows the alternate level to be absent, and validates it when present", () => {
    assert.equal(
      expectOk(validRow({ raid_level_alt_display: "" })).raid_level_alt_display,
      null,
    );
    expectFieldError(
      validRow({ raid_level_alt_display: "RAID 1" }),
      "raid_level_alt_display",
    );
    // The V100 correction that design §7 step 6 will make through the form.
    const v100 = expectOk(
      validRow({
        id: "VX5-V100-32",
        storage_raw_tb: 32,
        drive_bays: 2,
        hdd_count: 2,
        raid_level_display: "1",
        raid_level_alt_display: "JBOD",
      }),
    );
    assert.equal(v100.raid_level_display, "1");
    assert.equal(v100.raid_level_alt_display, "JBOD");
  });
});

describe("specFormSchema — cross-field rules that refuse the save (design §4c)", () => {
  it("refuses more drives than bays, and allows equal or fewer", () => {
    assert.match(
      expectFieldError(validRow({ drive_bays: 12, hdd_count: 13 }), "hdd_count"),
      /cannot exceed drive bays/,
    );
    // Equal is the live case on all 21 rows, so it must pass.
    expectOk(validRow({ drive_bays: 12, hdd_count: 12 }));
    expectOk(validRow({ drive_bays: 12, hdd_count: 8 }));
  });

  it("requires a whole number of 12-drive spans for RAID 60", () => {
    // The live RAID 60 rows: V700 at 24 drives, V800 at 36.
    expectOk(validRow({ raid_level_display: "60", drive_bays: 24, hdd_count: 24 }));
    expectOk(validRow({ raid_level_display: "60", drive_bays: 36, hdd_count: 36 }));
    assert.match(
      expectFieldError(
        validRow({ raid_level_display: "60", drive_bays: 30, hdd_count: 30 }),
        "raid_level_display",
      ),
      /multiple of 12/,
    );
    expectFieldError(
      validRow({ raid_level_display: "60", drive_bays: 12, hdd_count: 10 }),
      "raid_level_display",
    );
  });

  it("requires an even drive count for RAID 1", () => {
    expectOk(validRow({ raid_level_display: "1", drive_bays: 2, hdd_count: 2 }));
    expectOk(validRow({ raid_level_display: "1", drive_bays: 4, hdd_count: 4 }));
    assert.match(
      expectFieldError(
        validRow({ raid_level_display: "1", drive_bays: 4, hdd_count: 3 }),
        "raid_level_display",
      ),
      /even HDD count/,
    );
  });

  it("applies the same parity rules to the alternate level", () => {
    // The alternate level feeds a second usableCapacityTb() call, so a drive
    // count that does not fit it corrupts the alternate figure exactly as it
    // would the primary.
    expectFieldError(
      validRow({
        raid_level_display: "5",
        raid_level_alt_display: "60",
        drive_bays: 30,
        hdd_count: 30,
      }),
      "raid_level_alt_display",
    );
    expectFieldError(
      validRow({
        raid_level_display: "5",
        raid_level_alt_display: "1",
        drive_bays: 4,
        hdd_count: 3,
      }),
      "raid_level_alt_display",
    );
    expectOk(
      validRow({
        raid_level_display: "1",
        raid_level_alt_display: "JBOD",
        drive_bays: 2,
        hdd_count: 2,
      }),
    );
  });

  it("skips the drive-count rules when the count is unknown", () => {
    // hdd_count is nullable; an unknown count must not manufacture a rejection.
    expectOk(validRow({ raid_level_display: "60", hdd_count: null, drive_bays: null }));
    expectOk(validRow({ raid_level_display: "1", hdd_count: null, drive_bays: 4 }));
    expectOk(validRow({ drive_bays: null, hdd_count: 99 }));
  });

  it("reports every violation at once rather than one at a time", () => {
    const result = parseSpecForm(
      validRow({ raid_level_display: "60", drive_bays: 4, hdd_count: 10 }),
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.fieldErrors.hdd_count?.length);
    assert.ok(result.fieldErrors.raid_level_display?.length);
  });
});

describe("specWarnings — surfaced, never enforced (design §4c)", () => {
  it("flags a camera-count mismatch without refusing it", () => {
    const values = expectOk(validRow({ max_cameras: 200, max_cameras_h265: 180 }));
    const warnings = specWarnings(values);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Max cameras \(200\).*\(180\) differ/);
  });

  it("says nothing when the camera counts match, as they do on all 21 rows", () => {
    assert.deepEqual(specWarnings(expectOk(validRow())), []);
  });

  it("flags an alternate level identical to the configured one", () => {
    const values = expectOk(validRow({ raid_level_display: "6", raid_level_alt_display: "6" }));
    assert.match(specWarnings(values)[0], /same as the configured level/);
  });

  it("flags warranty years that contradict the legacy warranty string", () => {
    // Two representations of the same fact now coexist — the legacy NOT NULL
    // string the Price Book prints, and the structured years the datasheet
    // reads. Drift between them is what keeping both invites.
    const values = expectOk(
      validRow({ warranty: "5yr NBD, Advanced Replacement", warranty_years: 3 }),
    );
    assert.match(specWarnings(values).join(" | "), /disagrees with the legacy warranty string/);
  });

  it("says nothing when the warranty years and the legacy string agree", () => {
    assert.deepEqual(
      specWarnings(
        expectOk(validRow({ warranty: "5yr NBD, Advanced Replacement", warranty_years: 5 })),
      ),
      [],
    );
  });

  it("says nothing when only one warranty representation is filled", () => {
    // The live rows carry the legacy string and no structured years, so this
    // must stay silent or every row would warn.
    assert.deepEqual(specWarnings(expectOk(validRow({ warranty_years: null }))), []);
    assert.deepEqual(
      specWarnings(expectOk(validRow({ warranty: "NBD Advanced Replacement", warranty_years: 5 }))),
      [],
    );
  });

  it("flags inches dimensions with no mm, but not the reverse", () => {
    // One-directional on purpose: the live rack sheets print mm only, so a
    // blank inches field is the normal case and must not warn.
    assert.match(
      specWarnings(expectOk(validRow({ dimensions_in: '17.2 x 3.5 x 25.5"', dimensions_mm: null }))).join(" | "),
      /Dimensions \(mm\) is blank/,
    );
    assert.deepEqual(
      specWarnings(expectOk(validRow({ dimensions_mm: "437 x 89 x 648", dimensions_in: null }))),
      [],
    );
    assert.deepEqual(
      specWarnings(
        expectOk(validRow({ dimensions_mm: "437 x 89 x 648", dimensions_in: '17.2 x 3.5 x 25.5"' })),
      ),
      [],
    );
  });

  it("flags the deprecated NA level it still accepts", () => {
    const values = expectOk(
      validRow({ raid_level_display: "NA", drive_bays: 2, hdd_count: 2, storage_raw_tb: 32 }),
    );
    assert.match(specWarnings(values)[0], /'NA' is deprecated/);
  });
});

describe("specRuleViolations — the shared rule implementation", () => {
  it("returns an empty list for a clean row", () => {
    assert.deepEqual(specRuleViolations({ drive_bays: 12, hdd_count: 12, raid_level_display: "6" }), []);
  });

  it("is safe to call with the partial, string-derived values the form holds", () => {
    // This is how the client calls it: coerced from raw input strings, with
    // fields the user has not reached still absent.
    const violations = specRuleViolations({
      drive_bays: toNumberOrNull("4"),
      hdd_count: toNumberOrNull("10"),
      raid_level_display: "60",
    });
    assert.equal(violations.length, 2);
    assert.deepEqual(
      violations.map((v) => v.field).sort(),
      ["hdd_count", "raid_level_display"],
    );
  });

  it("treats blank and unparseable input as absent rather than as zero", () => {
    // toNumberOrNull returning 0 for "" would make every row look like it had
    // more drives than bays.
    assert.equal(toNumberOrNull(""), null);
    assert.equal(toNumberOrNull("  "), null);
    assert.equal(toNumberOrNull("twelve"), null);
    assert.equal(toNumberOrNull(null), null);
    assert.equal(toNumberOrNull(undefined), null);
    assert.equal(toNumberOrNull(12), 12);
    assert.equal(toNumberOrNull("12"), 12);
    assert.deepEqual(specRuleViolations({ drive_bays: toNumberOrNull(""), hdd_count: 12 }), []);
  });
});

describe("specInputFromFormData", () => {
  it("reads exactly the form's own fields and ignores anything else posted", () => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(asFormShape(validRow()))) {
      formData.set(key, value);
    }
    // Values a caller must never be able to set: the trigger owns these.
    formData.set("updated_by", "3f0d0c1e-0000-4000-8000-000000000000");
    formData.set("updated_at", "1999-01-01T00:00:00Z");
    formData.set("product_sku", "anything");

    const input = specInputFromFormData(formData);
    assert.deepEqual(Object.keys(input).sort(), [...SPEC_FIELD_NAMES].sort());
    assert.equal("updated_by" in input, false);
    assert.equal("updated_at" in input, false);
    assert.equal("product_sku" in input, false);

    const values = expectOk(input);
    assert.deepEqual(values, expectOk(validRow()));
  });

  it("turns a missing field into null rather than the string 'null'", () => {
    const input = specInputFromFormData(new FormData());
    assert.equal(input.model_name, null);
    assert.equal(input.hdd_count, null);
  });
});

describe("initialValuesFromRow", () => {
  it("renders every field as a string, with null as empty", () => {
    const values = initialValuesFromRow(validRow());
    assert.equal(values.storage_raw_tb, "192");
    assert.equal(values.notes, "");
    assert.equal(values.raid_level_alt_display, "");
    assert.equal(Object.keys(values).length, 65);
  });

  it("produces a blank set for the create form", () => {
    const values = initialValuesFromRow(null);
    assert.equal(Object.keys(values).length, 65);
    assert.ok(Object.values(values).every((v) => v === ""));
  });
});
