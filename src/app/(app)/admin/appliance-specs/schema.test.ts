import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applianceFormSchema,
  applianceInputFromFormData,
  parseApplianceForm,
} from "./schema";
import {
  applianceWarnings,
  filledPrefillFields,
  initialValuesFromRow,
  prefillInitialValues,
  sheetGroupWarnings,
  APPLIANCE_FIELD_NAMES,
  APPLIANCE_PREFILL_FIELD_NAMES,
  FAMILY_TYPE_OPTIONS,
  type ApplianceRuleValues,
} from "./fields";

// Two rows shaped like the sheets this table is entered from: the V250
// management server (no HDD array, storage_summary literally 'NA') and the SW10
// workstation (GPU block + the four-row camera matrix). The table is EMPTY in
// production until build step 6, so unlike the product_specs tests these
// fixtures are read off the factsheets rather than off live rows — which is
// exactly why scripts/roundtrip-appliance-specs.mts exists as the acceptance
// check once real rows land.

function managementRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "VX5-V250-MGM",
    model_name: "VideoX V250 Management Server",
    product_group: "V250",
    family_type: "management",
    sheet_group: "V250",
    cpu_model: "Intel Xeon E-2456",
    cores_threads: "6C/12T",
    cpu_cache: "18MB",
    cpu_base_ghz: "3.3",
    cpu_turbo_ghz: "5.1",
    ram_spec: "32GB DDR5 ECC",
    os_edition: "Windows Server 2022 IoT LTSC",
    storage_summary: "NA",
    os_drive_desc: "2× 480GB SSD, mirrored",
    db_drive_desc: "2× 960GB NVMe",
    drive_bays: null,
    raid_support: "Hardware RAID 5 Fault Tolerance",
    raid_level_display: "5",
    battery_raid: "NO",
    os_redundancy: "Mirrored, hot-swap",
    hotswap_power: "Yes",
    network: "2× 1GbE + 1 IPMI",
    gbe_1_ports: 2,
    gbe_10_ports: 0,
    sfp_addon: null,
    max_bandwidth_mbps: null,
    remote_mgmt: "1× Dedicated IPMI 2.0 out-of-band port",
    display_ports: "VGA (rear)",
    form_factor: "1U Rackmount",
    rack_units: "1U",
    power_wattage: "2× 800W",
    power_redundancy: "2× hot-swap redundant",
    power_max_consumption: "800W",
    power_ac_input: "100–240V AC, 50/60 Hz",
    power_dc_input: "-48V DC",
    cooling: "5 x 40x40x56mm (29,700rpm)",
    dimensions_mm: "437 W × 647 D × 44 H mm",
    dimensions_in: null,
    shipping_weight: "18 kg (39.7 lb)",
    warranty_years: 5,
    warranty_terms: "NBD advanced parts replacement",
    operating_temp: "10°C to 35°C",
    storage_temp: "-40°C to 70°C",
    humidity: "8% to 90% non-condensing",
    regulatory_safety: "UL 62368-1, CE, UKCA",
    regulatory_emissions: "FCC Part 15 Class A, RCM, BSMI",
    ndaa_text: "NDAA Section 889 compliant.",
    security_features: ["Secure Boot", "Signed firmware"],
    gpu_model: null,
    gpu_count: null,
    gpu_vram: null,
    gpu_cuda_cores: null,
    gpu_tensor_cores: null,
    gpu_rt_cores: null,
    gpu_encoders: null,
    gpu_decoders: null,
    monitor_support: null,
    front_io: null,
    rear_io: null,
    camera_matrix: null,
    revision_date: "2026-07-28",
    notes: null,
    ...overrides,
  };
}

const SW10_MATRIX = [
  { resolution: "1080p", codec: "H.265", fps: 15, cameras: 64, bandwidth_mbps: 125 },
  { resolution: "4MP", codec: "H.265", fps: 15, cameras: 32, bandwidth_mbps: 125 },
];

function workstationRow(overrides: Record<string, unknown> = {}) {
  return managementRow({
    id: "VX5-SW10-100",
    model_name: "VideoX SW10 Workstation",
    product_group: "SW10",
    family_type: "workstation",
    sheet_group: "SW10",
    form_factor: "Mid-tower",
    rack_units: null,
    db_drive_desc: null,
    raid_support: null,
    raid_level_display: null,
    storage_temp: null,
    max_bandwidth_mbps: 125,
    gpu_model: "NVIDIA RTX A4000",
    gpu_count: 1,
    gpu_vram: "16GB GDDR6",
    gpu_cuda_cores: 6144,
    gpu_tensor_cores: 192,
    gpu_rt_cores: 48,
    gpu_encoders: 1,
    gpu_decoders: 2,
    monitor_support: "Up to 4× via 1× GPU",
    front_io: "2× USB 3.2 Gen 1\n1× headphone",
    rear_io: "4× USB 3.2\n1× RJ45",
    camera_matrix: SW10_MATRIX,
    ...overrides,
  });
}

/** The same row as the browser would post it: every value a string, null as "". */
function asFormShape(row: Record<string, unknown>): Record<string, string> {
  return initialValuesFromRow(row);
}

function expectOk(input: unknown) {
  const result = parseApplianceForm(input);
  assert.equal(
    result.ok,
    true,
    result.ok ? "" : `expected parse to succeed, got ${JSON.stringify(result.fieldErrors)}`,
  );
  return result.ok ? result.values : {};
}

function expectFieldError(input: unknown, field: string) {
  const result = parseApplianceForm(input);
  assert.equal(result.ok, false, `expected parse to fail on '${field}'`);
  if (result.ok) return "";
  assert.ok(
    result.fieldErrors[field]?.length,
    `expected an error on '${field}', got ${JSON.stringify(result.fieldErrors)}`,
  );
  return result.fieldErrors[field][0];
}

describe("applianceFormSchema — field coverage", () => {
  it("validates exactly the 65 fields the form renders", () => {
    // 64 columns minus updated_at / updated_by. A column added to the table
    // without a field here is unreachable through the only supported write path
    // — the failure mode ADR 0096 exists to end, and the round-trip script's
    // COVERS check is the live half of this assertion.
    assert.equal(APPLIANCE_FIELD_NAMES.length, 65);
    assert.deepEqual(
      Object.keys(applianceFormSchema.shape).sort(),
      [...APPLIANCE_FIELD_NAMES].sort(),
    );
  });

  it("strips the trigger-owned provenance columns instead of rejecting them", () => {
    const values = expectOk(
      managementRow({
        updated_at: "2026-07-28T19:16:20.362297+00:00",
        updated_by: "3f0d0c1e-0000-4000-8000-000000000000",
      }),
    );
    assert.equal("updated_at" in values, false);
    assert.equal("updated_by" in values, false);
  });

  it("owns no field the table does not have — every name is snake_case column-shaped", () => {
    for (const name of APPLIANCE_FIELD_NAMES) {
      assert.match(name, /^[a-z][a-z0-9_]*$/, `unexpected field name '${name}'`);
    }
  });
});

describe("applianceFormSchema — both input shapes", () => {
  it("accepts a management row as Postgres hands it back", () => {
    const values = expectOk(managementRow());
    assert.equal(values.family_type, "management");
    assert.equal(values.storage_summary, "NA");
    assert.equal(values.drive_bays, null);
    assert.deepEqual(values.security_features, ["Secure Boot", "Signed firmware"]);
  });

  it("accepts a workstation row, camera matrix and all", () => {
    const values = expectOk(workstationRow());
    assert.deepEqual(values.camera_matrix, SW10_MATRIX);
    assert.equal(values.gpu_cuda_cores, 6144);
    assert.equal(values.rack_units, null);
  });

  it("parses the browser's string shape into the same values as the row", () => {
    // The property the live round-trip depends on: a form submission and a
    // production row must land on identical parsed output, or a save that
    // changed nothing would still rewrite the row.
    for (const row of [managementRow(), workstationRow()]) {
      assert.deepEqual(expectOk(asFormShape(row)), expectOk(row));
    }
  });

  it("reads exactly its own columns out of FormData", () => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(asFormShape(workstationRow()))) {
      formData.set(key, value);
    }
    formData.set("updated_by", "3f0d0c1e-0000-4000-8000-000000000000");
    const input = applianceInputFromFormData(formData);
    assert.deepEqual(Object.keys(input).sort(), [...APPLIANCE_FIELD_NAMES].sort());
    assert.deepEqual(expectOk(input), expectOk(workstationRow()));
  });
});

describe("required columns", () => {
  it("refuses a blank value for each NOT NULL text column", () => {
    for (const field of [
      "id",
      "model_name",
      "product_group",
      "sheet_group",
      "cpu_model",
      "ram_spec",
      "os_edition",
      "form_factor",
    ]) {
      assert.match(
        expectFieldError(managementRow({ [field]: "   " }), field),
        /is required/,
      );
    }
  });

  it("lets every archetype-specific column be null, on every archetype", () => {
    // ADR 0090: "population is a template concern, not a DB constraint." A
    // half-entered row is a row someone is still working on, and the form must
    // not refuse it — the mismatches are warnings instead.
    expectOk(
      workstationRow({
        gpu_model: null,
        gpu_count: null,
        camera_matrix: null,
        monitor_support: null,
      }),
    );
    expectOk(managementRow({ db_drive_desc: null, raid_level_display: null }));
  });

  it("stores a blank security features list as [] rather than null", () => {
    // The column is NOT NULL DEFAULT '{}': a null would be refused by Postgres
    // at the only supported write path.
    assert.deepEqual(expectOk(managementRow({ security_features: "" })).security_features, []);
    assert.deepEqual(expectOk(managementRow({ security_features: [] })).security_features, []);
  });
});

describe("family_type — the closed select (design §4a)", () => {
  it("accepts exactly the three CHECK-constraint values", () => {
    for (const option of FAMILY_TYPE_OPTIONS) {
      assert.equal(
        expectOk(managementRow({ family_type: option.value })).family_type,
        option.value,
      );
    }
  });

  it("refuses anything else, including near-misses the CHECK would also catch", () => {
    // The CHECK is the backstop; this select exists because the datasheet
    // template dispatches on the exact string and the form's conditional
    // sections key on it, so 'Workstation' would pass a human eye and render
    // the wrong sheet.
    for (const bad of ["Workstation", "work station", "mgmt", "ACM"]) {
      assert.equal(
        expectFieldError(managementRow({ family_type: bad }), "family_type"),
        "Pick an archetype from the list.",
      );
    }
  });

  it("is required — a null archetype has no template to render", () => {
    expectFieldError(managementRow({ family_type: null }), "family_type");
    expectFieldError(managementRow({ family_type: "" }), "family_type");
  });
});

describe("raid_level_display — the shared select minus 'NA' (design §4c)", () => {
  it("accepts the five real levels and blank", () => {
    for (const level of ["1", "5", "6", "60", "JBOD"]) {
      assert.equal(
        expectOk(managementRow({ raid_level_display: level })).raid_level_display,
        level,
      );
    }
    assert.equal(expectOk(managementRow({ raid_level_display: "" })).raid_level_display, null);
  });

  it("refuses 'NA' — that entry exists only for the legacy V100 rows on product_specs", () => {
    expectFieldError(managementRow({ raid_level_display: "NA" }), "raid_level_display");
  });

  it("refuses the strings a free-text field would have let through", () => {
    for (const bad of ["RAID 6", "06", "raid6"]) {
      expectFieldError(managementRow({ raid_level_display: bad }), "raid_level_display");
    }
    // Padding is trimmed rather than refused: "6 " is the level 6, and rejecting
    // it would fail a value the editor plainly meant.
    assert.equal(
      expectOk(managementRow({ raid_level_display: "6 " })).raid_level_display,
      "6",
    );
  });
});

describe("camera_matrix — the structured editor's schema (design §4d)", () => {
  it("accepts the five documented keys and coerces the editor's strings", () => {
    const posted = JSON.stringify([
      { resolution: "1080p", codec: "H.265", fps: "15", cameras: "64", bandwidth_mbps: "125" },
    ]);
    assert.deepEqual(expectOk(workstationRow({ camera_matrix: posted })).camera_matrix, [
      SW10_MATRIX[0],
    ]);
  });

  it("refuses a codec outside H.264 / H.265", () => {
    // The sheet's column header reads "FPS" but holds the codec; entering
    // "30fps" here is the specific mistake that header invites.
    assert.match(
      expectFieldError(
        workstationRow({ camera_matrix: [{ ...SW10_MATRIX[0], codec: "30fps" }] }),
        "camera_matrix",
      ),
      /^Row 1: Codec must be one of: H\.264, H\.265\./,
    );
  });

  it("refuses a missing key, an unknown key, and a non-positive count", () => {
    const { codec: _codec, ...missingCodec } = SW10_MATRIX[0];
    assert.match(
      expectFieldError(workstationRow({ camera_matrix: [missingCodec] }), "camera_matrix"),
      /^Row 1: Codec/,
    );
    assert.match(
      expectFieldError(
        workstationRow({ camera_matrix: [{ ...SW10_MATRIX[0], notes: "x" }] }),
        "camera_matrix",
      ),
      /unexpected key: notes/,
    );
    assert.match(
      expectFieldError(
        workstationRow({ camera_matrix: [SW10_MATRIX[0], { ...SW10_MATRIX[1], cameras: 0 }] }),
        "camera_matrix",
      ),
      /^Row 2: Cameras must be greater than 0\./,
    );
  });

  it("refuses text that is not JSON, rather than storing it as prose", () => {
    assert.match(
      expectFieldError(workstationRow({ camera_matrix: "4 rows, see sheet" }), "camera_matrix"),
      /not valid JSON/,
    );
  });

  it("treats an empty matrix as null", () => {
    assert.equal(expectOk(workstationRow({ camera_matrix: "" })).camera_matrix, null);
  });
});

describe("applianceWarnings — archetype mismatches (design §4e)", () => {
  const warn = (values: ApplianceRuleValues) => applianceWarnings(values);

  it("says nothing about a complete workstation row", () => {
    assert.deepEqual(
      warn({ family_type: "workstation", gpu_model: "RTX A4000", camera_matrix: SW10_MATRIX }),
      [],
    );
  });

  it("flags a workstation with no GPU and an empty matrix", () => {
    const warnings = warn({ family_type: "workstation" });
    assert.equal(warnings.length, 2);
    assert.match(warnings[0], /no GPU model/);
    assert.match(warnings[1], /empty camera matrix/);
  });

  it("flags a database drive on a workstation without refusing it", () => {
    const warnings = warn({
      family_type: "workstation",
      gpu_model: "RTX A4000",
      camera_matrix: SW10_MATRIX,
      db_drive_desc: "2× 960GB NVMe",
    });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /workstation row/);
  });

  it("names the workstation values sitting on a management row, because they are hidden", () => {
    // The Workstation section is collapsed on this archetype but its inputs stay
    // mounted and still submit, so the warning is the only way the editor learns
    // the values are there. Naming them is the point.
    const warnings = warn({
      family_type: "management",
      gpu_model: "RTX A4000",
      camera_matrix: SW10_MATRIX,
    });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /GPU model, Camera matrix are filled on a management row/);
    assert.match(warnings[0], /still be saved/);
  });

  it("stays silent while the archetype has not been picked yet", () => {
    assert.deepEqual(warn({ family_type: null, gpu_model: "RTX A4000" }), []);
  });

  it("reads the same values from a parsed row as from the live form", () => {
    // One definition, two callers: the action passes the parsed row, the form
    // passes coerced live strings. They must agree, or the form would promise
    // something the save does not repeat.
    const parsed = expectOk(managementRow({ gpu_model: "RTX A4000" }));
    assert.equal(warn(parsed as ApplianceRuleValues).length, 1);
  });
});

describe("sheetGroupWarnings — the cross-row check (design §4b)", () => {
  it("says nothing about a normal two-variant sheet", () => {
    assert.deepEqual(
      sheetGroupWarnings("V250", [
        { id: "VX5-V250-MGM", family_type: "management" },
        { id: "VX5-V255-MGM", family_type: "management" },
      ]),
      [],
    );
  });

  it("says nothing about a single-SKU sheet", () => {
    assert.deepEqual(
      sheetGroupWarnings("SW10", [{ id: "VX5-SW10-100", family_type: "workstation" }]),
      [],
    );
  });

  it("flags a third row in one group, naming the SKUs involved", () => {
    const warnings = sheetGroupWarnings("V250", [
      { id: "VX5-V250-MGM", family_type: "management" },
      { id: "VX5-V255-MGM", family_type: "management" },
      { id: "VX5-SW20-200", family_type: "management" },
    ]);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /3 rows \(VX5-V250-MGM, VX5-V255-MGM, VX5-SW20-200\)/);
  });

  it("flags a group whose rows are different archetypes", () => {
    const warnings = sheetGroupWarnings("V250", [
      { id: "VX5-V250-MGM", family_type: "management" },
      { id: "VX5-SW10-100", family_type: "workstation" },
    ]);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /mixes family types \(management, workstation\)/);
  });

  it("warns rather than refuses, on both counts", () => {
    // A third variant on one sheet is unusual, not impossible. Refusing would
    // make a legitimate sheet unenterable, which is why this is a warning and
    // the index page's grouping is its always-on second view.
    const warnings = sheetGroupWarnings("V250", [
      { id: "A", family_type: "management" },
      { id: "B", family_type: "acm" },
      { id: "C", family_type: "workstation" },
    ]);
    assert.equal(warnings.length, 2);
  });
});

// The sibling prefill's copy set (ADR 0103, which reads on ADR 0102). These
// tests guard a boundary, not a convenience: the prefill overwrites whatever it
// names with ANOTHER row's value, so a per-SKU field leaking into this list
// would copy one sibling's CPU, RAM, drive size or GPU block onto another's row
// — silently, and through the same form that is supposed to catch it.

// Every field NOT in the copy set, categorised. Restated as a literal rather
// than derived from APPLIANCE_PREFILL_FIELD_NAMES so the union assertion below
// is a genuine two-sided check: a column added to the form and put in NEITHER
// list fails this test, which is what "no column is silently ungoverned" means.
const APPLIANCE_EXCLUDED_FIELD_NAMES = [
  // identity — per SKU by definition
  "id",
  "model_name",
  "product_group",
  "family_type",
  "sheet_group",
  // compute — the CPU/RAM that distinguish V250/V255/V260/V265
  "cpu_model",
  "cores_threads",
  "cpu_cache",
  "cpu_base_ghz",
  "cpu_turbo_ghz",
  "ram_spec",
  // storage — sizes vary per SKU (V255 OS is 960GB not 480GB)
  "storage_summary",
  "os_drive_desc",
  "db_drive_desc",
  "drive_bays",
  "raid_level_display",
  // ports — display_ports differs SW10/SW20
  "display_ports",
  // the SW block — the whole GPU/matrix/bandwidth surface SW20 adds over SW10
  "max_bandwidth_mbps",
  "monitor_support",
  "gpu_model",
  "gpu_count",
  "gpu_vram",
  "gpu_cuda_cores",
  "gpu_tensor_cores",
  "gpu_rt_cores",
  "gpu_encoders",
  "gpu_decoders",
  "front_io",
  "rear_io",
  "camera_matrix",
  // meta — per SKU
  "revision_date",
  "notes",
  // datasheet content — the rear panel differs where the front does not
  // (SW20 = SW10 + a second GPU), and the usage paragraph is per-model prose
  "rear_io_photo_path",
  "usage_paragraph",
];

describe("APPLIANCE_PREFILL_FIELD_NAMES — the copy-set boundary", () => {
  it("holds the 31 chassis-and-platform fields", () => {
    assert.equal(APPLIANCE_PREFILL_FIELD_NAMES.length, 31);
  });

  it("names only real fields on this form", () => {
    const unknown = APPLIANCE_PREFILL_FIELD_NAMES.filter(
      (name) => !APPLIANCE_FIELD_NAMES.includes(name),
    );
    assert.deepEqual(unknown, []);
  });

  it("has no duplicates", () => {
    assert.equal(
      new Set(APPLIANCE_PREFILL_FIELD_NAMES).size,
      APPLIANCE_PREFILL_FIELD_NAMES.length,
    );
  });

  it("excludes the primary key, so a prefill cannot retarget the save", () => {
    assert.ok(!APPLIANCE_PREFILL_FIELD_NAMES.includes("id"));
  });

  it("excludes every per-SKU and per-archetype field", () => {
    // Copying any of these from a neighbour overwrites a real difference: the
    // CPU/RAM that separate the four V-chassis siblings, the drive sizes, and
    // the whole GPU block SW20 adds over SW10.
    for (const name of [
      "cpu_model",
      "ram_spec",
      "cpu_base_ghz",
      "cpu_turbo_ghz",
      "os_drive_desc",
      "db_drive_desc",
      "storage_summary",
      "drive_bays",
      "raid_level_display",
      "display_ports",
      "max_bandwidth_mbps",
      "monitor_support",
      "gpu_model",
      "camera_matrix",
      "model_name",
    ]) {
      assert.ok(
        !APPLIANCE_PREFILL_FIELD_NAMES.includes(name),
        `${name} is per-SKU or per-archetype and must never be copied between rows`,
      );
    }
  });

  it("partitions the form: copy set and excluded set are disjoint and cover every field", () => {
    // The load-bearing assertion. If a column is added to the form and put in
    // neither list, the union stops equalling APPLIANCE_FIELD_NAMES and this
    // fails — so a new column cannot silently escape the copy/no-copy decision.
    const overlap = APPLIANCE_PREFILL_FIELD_NAMES.filter((name) =>
      APPLIANCE_EXCLUDED_FIELD_NAMES.includes(name),
    );
    assert.deepEqual(overlap, [], "a field is in both the copy set and the excluded set");
    assert.deepEqual(
      [...APPLIANCE_PREFILL_FIELD_NAMES, ...APPLIANCE_EXCLUDED_FIELD_NAMES].sort(),
      [...APPLIANCE_FIELD_NAMES].sort(),
    );
  });
});

describe("filledPrefillFields", () => {
  it("counts nothing on a row with no platform values", () => {
    // A fresh row: every copyable column null, except security_features, which
    // is NOT NULL DEFAULT '{}'.
    const row: Record<string, unknown> = {};
    for (const name of APPLIANCE_PREFILL_FIELD_NAMES) row[name] = null;
    row.security_features = [];
    assert.deepEqual(filledPrefillFields(row), []);
  });

  it("counts the copyable fields a real row carries", () => {
    // The management fixture fills 28 of the 30 — sfp_addon and dimensions_in
    // are null on it — which is exactly the "X of 30 copyable" label the offer
    // shows so the editor copies from a filled row of the right chassis.
    const filled = filledPrefillFields(managementRow());
    assert.equal(filled.length, 28);
    assert.ok(!filled.includes("sfp_addon"));
    assert.ok(!filled.includes("dimensions_in"));
    assert.ok(filled.includes("power_wattage"));
    assert.ok(filled.includes("gbe_10_ports")); // 0 is a value, not an absence
  });

  it("does not count an empty text[] as filled, but counts a non-empty one", () => {
    assert.ok(!filledPrefillFields({ security_features: [] }).includes("security_features"));
    assert.ok(
      filledPrefillFields({ security_features: ["SEV"] }).includes("security_features"),
    );
  });

  it("does not count whitespace-only text as filled", () => {
    assert.deepEqual(filledPrefillFields({ cooling: "   " }), []);
    assert.deepEqual(filledPrefillFields({ cooling: "6 x 80x38mm" }), ["cooling"]);
  });

  it("counts a zero warranty_years, which is a value and not an absence", () => {
    assert.deepEqual(filledPrefillFields({ warranty_years: 0 }), ["warranty_years"]);
  });

  it("returns nothing for no row", () => {
    assert.deepEqual(filledPrefillFields(null), []);
  });
});

describe("prefillInitialValues — the overlay", () => {
  it("carries EVERY copyable field from the source and NOTHING else", () => {
    // Blank base = the create form. Only the 30 copyable fields take the
    // source's value; every excluded field stays at its base default ("").
    const base = initialValuesFromRow(null);
    const source = managementRow();
    const result = prefillInitialValues(base, source);
    const sourceStrings = initialValuesFromRow(source);

    for (const name of APPLIANCE_PREFILL_FIELD_NAMES) {
      assert.equal(
        result[name],
        sourceStrings[name],
        `${name} should carry the source's value`,
      );
    }
    for (const name of APPLIANCE_EXCLUDED_FIELD_NAMES) {
      assert.equal(result[name], "", `${name} is excluded and must stay blank`);
    }
  });

  it("never copies the primary key, so it cannot retarget the save", () => {
    const result = prefillInitialValues(initialValuesFromRow(null), managementRow());
    assert.equal(result.id, "");
  });

  it("overlays onto an existing row's own values on the edit form", () => {
    // Edit base = the row being edited. The source's copyable fields overwrite
    // that row's; its excluded fields (its own CPU, drives, id) are untouched.
    const target = workstationRow({
      id: "VX5-SW20-200",
      cpu_model: "Intel Core i9-14900K",
      power_wattage: "1× 1000W",
    });
    const source = managementRow({ power_wattage: "2× 800W" });
    const result = prefillInitialValues(initialValuesFromRow(target), source);

    assert.equal(result.power_wattage, "2× 800W", "copyable field takes the source value");
    assert.equal(result.id, "VX5-SW20-200", "id is the target's, never the source's");
    assert.equal(result.cpu_model, "Intel Core i9-14900K", "excluded field keeps the target's value");
  });

  it("returns the base unchanged when there is no source", () => {
    const base = initialValuesFromRow(managementRow());
    assert.deepEqual(prefillInitialValues(base, null), base);
  });
});
