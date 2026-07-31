// Field metadata for the appliance_specs admin form (ADR 0097 decision 3;
// design datasheets/datasheet-phase2-admin-surface-design.md §3–§4).
//
// The second instance of the ADR 0096 pattern: ONE declarative list drives the
// zod schema (./schema.ts), the rendered inputs (./_components/appliance-spec-form.tsx)
// and the index page's labels. The kinds, the zod builders and the renderer that
// read this list are the shared kit's (@/lib/spec-form, ADR 0097 decision 4);
// what lives here is what is actually appliance_specs' — sections, labels,
// hints, options and warnings.
//
// No zod, no React, no server-only imports: this module is bundled into the
// client form, imported by the node test runner, and imported by the round-trip
// script.
//
// 65 fields = the table's 67 columns (64 at creation, plus the 3 of migration
// 20260730000001 — photos + usage paragraph, ADR 0107) minus `updated_at` /
// `updated_by`, which MUST stay absent: the appliance_specs_stamp_updated
// BEFORE trigger maintains both, and an action writing them would fight the
// trigger.
//
// WHAT THIS FORM DOES NOT HAVE, deliberately: a net-usable preview. Nothing
// computes from an appliance row — there is no storage_raw_tb and no
// usableCapacityTb() path — so the treatment that carried ADR 0096's safety
// case has nothing to compute here and is not cargo-culted over (ADR 0097 §4f).
// This table's real failure modes are a family_type the template does not
// match, a sheet_group that drifts apart from its pair, and a malformed camera
// matrix; the enum selects, the cross-row check and the row editor are aimed at
// exactly those.

import {
  flattenSpecFields,
  initialValuesFromRow as initialValuesFromRowForFields,
  photoPathWarnings,
  type SpecField,
  type SpecSection,
} from "@/lib/spec-form";

export {
  toNumberOrNull,
  type SpecField,
  type SpecFieldOption,
  type SpecSection,
} from "@/lib/spec-form";

/**
 * The three archetypes, exactly as the CHECK constraint spells them.
 *
 * A closed select rather than free text for the same reason the RAID select is
 * one layer up (design §4a): the CHECK would catch a bad value, but the
 * datasheet template *dispatches* on these exact strings and the form's own
 * conditional sections key on them, so 'Workstation' or 'work station' would
 * pass the database and then quietly render the wrong sheet.
 *
 * The V150's classification is an ENTRY-TIME call made in this select by
 * whoever types the row in — the migration called it a seed-time judgment, and
 * there is no seed (ADR 0097 §8).
 */
export const FAMILY_TYPE_OPTIONS = [
  { value: "management", label: "Management server" },
  { value: "acm", label: "ACM / access control" },
  { value: "workstation", label: "Workstation" },
] as const;

/**
 * The RAID select, minus 'NA'.
 *
 * Same option list as product_specs, declared separately on purpose (design
 * §4c): 'NA' exists there only so the three uncorrected V100 rows round-trip,
 * and appliance rows start clean and never need it. Optional here, because the
 * column is nullable and a tower workstation genuinely has no array — the
 * silent-overstatement risk that makes the product_specs level required does
 * not exist on a table nothing computes from. The value domain still matters:
 * the template derives drive-failure tolerance from the level plus the drive
 * count (ADR 0090 decision 6), and an unrecognised string breaks that quietly.
 */
export const APPLIANCE_RAID_LEVEL_OPTIONS = [
  { value: "1", label: "RAID 1 (mirror)" },
  { value: "5", label: "RAID 5 (1 parity drive)" },
  { value: "6", label: "RAID 6 (2 parity drives)" },
  { value: "60", label: "RAID 60 (2 parity per 12-drive span)" },
  { value: "JBOD", label: "JBOD (no parity)" },
] as const;

/** The codecs the camera matrix's codec column offers. */
export const CAMERA_MATRIX_CODEC_OPTIONS = [
  { value: "H.264", label: "H.264" },
  { value: "H.265", label: "H.265" },
] as const;

/** The section whose fields only apply to `family_type = 'workstation'`. */
export const WORKSTATION_SECTION_TITLE = "Workstation";

/**
 * The workstation-only columns, with the labels the warnings name them by.
 *
 * `db_drive_desc` is the mirror case — a management/ACM column that should be
 * blank on a workstation — and is handled separately below.
 */
export const WORKSTATION_FIELD_LABELS: Record<string, string> = {
  gpu_model: "GPU model",
  gpu_count: "GPU count",
  gpu_vram: "GPU VRAM",
  gpu_cuda_cores: "CUDA cores",
  gpu_tensor_cores: "Tensor cores",
  gpu_rt_cores: "RT cores",
  gpu_encoders: "NVENC encoders",
  gpu_decoders: "NVDEC decoders",
  monitor_support: "Monitor support",
  front_io: "Front I/O",
  rear_io: "Rear I/O",
  camera_matrix: "Camera matrix",
};

/** The twelve sections of design §3, in order. */
export const APPLIANCE_SECTIONS: SpecSection[] = [
  {
    title: "Identity & sheet",
    fields: [
      {
        name: "id",
        label: "SKU / spec id",
        kind: "id",
        maxLength: 64,
        hint: "Must equal products.sku exactly — the two tables are joined on it in process, with no foreign key to catch a mismatch.",
      },
      { name: "model_name", label: "Model name", kind: "text-required", maxLength: 200 },
      {
        name: "product_group",
        label: "Product group",
        kind: "text-required",
        maxLength: 64,
        hint: "The middle SKU segment, and it must match a productGroup in families.ts (V250, SW10 …) or the Price Book family link will not resolve.",
      },
      {
        name: "family_type",
        label: "Family type",
        kind: "enum-required",
        options: FAMILY_TYPE_OPTIONS,
        emptyOptionLabel: "— select an archetype —",
        invalidMessage: "Pick an archetype from the list.",
        hint: "The datasheet template dispatches on this exact string, and the Workstation section below shows or hides with it.",
      },
      {
        name: "sheet_group",
        label: "Sheet group",
        kind: "text-required",
        maxLength: 64,
        hint: "The SKUs that render on ONE physical datasheet share a group: V250 + V255 are both 'V250'. A single-SKU sheet uses its own group ('V150', 'SW10').",
      },
    ],
  },
  {
    title: "Compute",
    note: "The GHz fields are text here, unlike product_specs' numerics: these sheets print ranges like '3.9 / 5.1 GHz' across the two CPU variants.",
    fields: [
      { name: "cpu_model", label: "CPU model", kind: "text-required", maxLength: 200 },
      { name: "cores_threads", label: "Cores / threads", kind: "text-optional", maxLength: 200 },
      { name: "cpu_cache", label: "CPU cache", kind: "text-optional", maxLength: 200 },
      { name: "cpu_base_ghz", label: "CPU base GHz", kind: "text-optional", maxLength: 200 },
      { name: "cpu_turbo_ghz", label: "CPU turbo GHz", kind: "text-optional", maxLength: 200 },
      { name: "ram_spec", label: "RAM spec", kind: "text-required", maxLength: 200 },
    ],
  },
  {
    title: "OS & storage",
    fields: [
      { name: "os_edition", label: "OS edition", kind: "text-required", maxLength: 200 },
      {
        name: "storage_summary",
        label: "Storage summary",
        kind: "text-optional",
        maxLength: 200,
        hint: "May literally be 'NA' — the V250 management server has no HDD array. There is no numeric storage column on this table by design.",
      },
      { name: "os_drive_desc", label: "OS / VMS drive description", kind: "text-optional", maxLength: 200 },
      {
        name: "db_drive_desc",
        label: "Database drive description",
        kind: "text-optional",
        maxLength: 200,
        hint: "Management and ACM rows only; workstations have no database drive.",
      },
      { name: "drive_bays", label: "Drive bays", kind: "int-optional" },
    ],
  },
  {
    title: "Availability & RAID",
    fields: [
      {
        name: "raid_support",
        label: "RAID support (sheet prose)",
        kind: "text-optional",
        maxLength: 200,
        hint: "The sheet's RAID block, verbatim — 'Hardware RAID 6 Double Fault Tolerance w/ HW XOR Engine'. Blank on towers, which have no array.",
      },
      {
        name: "raid_level_display",
        label: "RAID level (as configured)",
        kind: "enum-optional",
        options: APPLIANCE_RAID_LEVEL_OPTIONS,
        emptyOptionLabel: "— none —",
        invalidMessage: "Pick a RAID level from the list.",
        hint: "The template derives drive-failure tolerance from this plus the drive count. Leave blank where there is no array.",
      },
      { name: "battery_raid", label: "Battery-backed RAID", kind: "text-optional", maxLength: 200 },
      { name: "os_redundancy", label: "OS redundancy", kind: "text-optional", maxLength: 200 },
      { name: "hotswap_power", label: "Hot-swap power", kind: "text-optional", maxLength: 200 },
    ],
  },
  {
    title: "Networking & management",
    fields: [
      { name: "network", label: "Network (summary string)", kind: "text-optional", maxLength: 200 },
      { name: "gbe_1_ports", label: "1 GbE ports", kind: "int-optional" },
      { name: "gbe_10_ports", label: "10 GbE ports", kind: "int-optional" },
      { name: "sfp_addon", label: "SFP add-on", kind: "text-optional", maxLength: 200 },
      {
        name: "max_bandwidth_mbps",
        label: "Max bandwidth (Mbps)",
        kind: "int-optional",
        hint: "The SW sheets' Maximum Bandwidth block (SW10 125, SW20 225). Rendered as '125 Mbit/s' — this is where the `bandwidth` Price Book override retires to.",
      },
      { name: "remote_mgmt", label: "Remote management", kind: "text-optional", maxLength: 200 },
      {
        name: "display_ports",
        label: "Display ports",
        kind: "textarea-optional",
        maxLength: 2000,
        hint: "A textarea because the workstation sheets print a multi-line GPU port list here, not a single connector.",
      },
    ],
  },
  {
    title: "Form factor & power",
    fields: [
      { name: "form_factor", label: "Form factor", kind: "text-required", maxLength: 200 },
      {
        name: "rack_units",
        label: "Rack units",
        kind: "text-optional",
        maxLength: 200,
        hint: "Blank for the tower workstations.",
      },
      { name: "power_wattage", label: "Power supply", kind: "text-optional", maxLength: 200 },
      { name: "power_redundancy", label: "Power redundancy", kind: "text-optional", maxLength: 200 },
      { name: "power_max_consumption", label: "Max power consumption", kind: "text-optional", maxLength: 200 },
      { name: "power_ac_input", label: "AC input", kind: "text-optional", maxLength: 200 },
      {
        name: "power_dc_input",
        label: "DC input",
        kind: "text-optional",
        maxLength: 200,
        hint: "Only the V250 sheet prints a DC line alongside AC. Leave blank elsewhere.",
      },
      {
        name: "cooling",
        label: "Cooling",
        kind: "text-optional",
        maxLength: 200,
        hint: "Verbatim from the sheet — '6 x 80x38mm'. The tower sheets print none.",
      },
    ],
  },
  {
    title: "Physical",
    note: "Dimensions are display strings copied from the sheet, not per-axis numbers.",
    fields: [
      { name: "dimensions_mm", label: "Dimensions (mm)", kind: "text-optional", maxLength: 200 },
      { name: "dimensions_in", label: "Dimensions (in)", kind: "text-optional", maxLength: 200 },
      { name: "shipping_weight", label: "Shipping weight", kind: "text-optional", maxLength: 200 },
    ],
  },
  {
    title: "Warranty",
    fields: [
      {
        name: "warranty_years",
        label: "Warranty years",
        kind: "int-optional",
        hint: "Servers 5, workstations 3.",
      },
      { name: "warranty_terms", label: "Warranty terms", kind: "text-optional", maxLength: 200 },
    ],
  },
  {
    title: "Environmental",
    fields: [
      { name: "operating_temp", label: "Operating temperature", kind: "text-optional", maxLength: 200 },
      {
        name: "storage_temp",
        label: "Storage temperature",
        kind: "text-optional",
        maxLength: 200,
        hint: "The SW sheets carry none.",
      },
      { name: "humidity", label: "Humidity", kind: "text-optional", maxLength: 200 },
    ],
  },
  {
    title: "Regulatory & security",
    fields: [
      { name: "regulatory_safety", label: "Safety standards", kind: "text-optional", maxLength: 200 },
      { name: "regulatory_emissions", label: "Emissions standards", kind: "text-optional", maxLength: 200 },
      { name: "ndaa_text", label: "NDAA disclosure", kind: "textarea-optional", maxLength: 2000 },
      {
        name: "security_features",
        label: "Security features",
        kind: "string-list",
        maxLength: 200,
        hint: "One per line — the sheet's Credential & Key Encryption list, split on its '·' separators. A blank list is stored as an empty list, not as null.",
      },
    ],
  },
  {
    title: WORKSTATION_SECTION_TITLE,
    note: "Workstation rows only. This section hides itself on a management or ACM row — anything already filled in it stays filled and still saves, and the warnings above say so.",
    fields: [
      { name: "gpu_model", label: "GPU model", kind: "text-optional", maxLength: 200 },
      { name: "gpu_count", label: "GPU count", kind: "int-optional" },
      { name: "gpu_vram", label: "GPU VRAM", kind: "text-optional", maxLength: 200 },
      { name: "gpu_cuda_cores", label: "CUDA cores", kind: "int-optional" },
      { name: "gpu_tensor_cores", label: "Tensor cores", kind: "int-optional" },
      { name: "gpu_rt_cores", label: "RT cores", kind: "int-optional" },
      { name: "gpu_encoders", label: "NVENC encoders", kind: "int-optional" },
      { name: "gpu_decoders", label: "NVDEC decoders", kind: "int-optional" },
      { name: "monitor_support", label: "Monitor support", kind: "text-optional", maxLength: 200 },
      { name: "front_io", label: "Front I/O", kind: "textarea-optional", maxLength: 2000 },
      { name: "rear_io", label: "Rear I/O", kind: "textarea-optional", maxLength: 2000 },
      {
        name: "camera_matrix",
        label: "Camera matrix",
        kind: "json-rows",
        columns: [
          { key: "resolution", label: "Resolution", kind: "text", maxLength: 40, placeholder: "1080p" },
          { key: "codec", label: "Codec", kind: "enum", options: CAMERA_MATRIX_CODEC_OPTIONS },
          { key: "fps", label: "FPS", kind: "int-positive" },
          { key: "cameras", label: "Cameras", kind: "int-positive" },
          { key: "bandwidth_mbps", label: "Bandwidth (Mbps)", kind: "int-positive" },
        ],
        addRowLabel: "Add a matrix row",
        emptyLabel: "No matrix rows. The workstation sheets print four.",
        hint: "The sheet's resolution table. Its column header reads 'FPS' but holds the codec — the frame rate is in the footnote ('@15fps'), and it goes in the FPS column here.",
      },
    ],
  },
  {
    title: "Datasheet content",
    fields: [
      {
        name: "usage_paragraph",
        label: "Recommended usage",
        kind: "textarea-optional",
        maxLength: 2000,
        hint: "The page-1 paragraph: who this SKU is for and where it fits. Prose, not bullets. Roughly 40–60 words; the datasheet gives it a fixed column and longer copy pushes the page.",
      },
      {
        name: "product_photo_path",
        label: "Product photo path",
        kind: "text-optional",
        maxLength: 200,
        hint: "Path under public/, starting with a slash — e.g. /price-book/sw-hero.png. Leave blank until a photo exists; the sheet holds the frame empty rather than dropping the section.",
      },
      {
        name: "rear_io_photo_path",
        label: "Rear I/O photo path",
        kind: "text-optional",
        maxLength: 200,
        hint: "Path under public/, starting with a slash. Rear-panel photography does not exist for any SKU yet — blank is the expected value.",
      },
    ],
  },
  {
    title: "Meta",
    fields: [
      {
        name: "revision_date",
        label: "Revision date",
        kind: "date-optional",
        hint: "The as-of date printed on the sheet this row's values were taken from.",
      },
      { name: "notes", label: "Notes", kind: "textarea-optional", maxLength: 2000 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Warnings
//
// There are no refusals on this table beyond the per-field ones the kinds
// already enforce. Every archetype-specific column is nullable — ADR 0090's
// "population is a template concern, not a DB constraint" — so a workstation
// with no GPU listed is a row someone has not finished, not an illegal row, and
// the form must not refuse it. What the form CAN do is say what looks wrong,
// which is what these produce (design §4e).
//
// The conditions live here rather than in the schema for the same reason the
// product_specs ones do: the form shows them live as the archetype is switched,
// and the action repeats them in its confirmation, from one definition.
// ---------------------------------------------------------------------------

/** The subset of a row the warnings read. */
export type ApplianceRuleValues = {
  family_type?: string | null;
  db_drive_desc?: string | null;
  camera_matrix?: unknown[] | null;
  sheet_group?: string | null;
} & Record<string, unknown>;

function isSet(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** Things worth a second look that still save (design §4e). */
export function applianceWarnings(values: ApplianceRuleValues): string[] {
  const warnings: string[] = [];
  // Checked before the family_type early return: a photo path is wrong the same
  // way on every archetype, and the archetype is blank on a half-filled new row.
  warnings.push(...photoPathWarnings(values));
  const familyType = values.family_type ?? null;
  if (familyType == null) return warnings;

  if (familyType === "workstation") {
    if (!isSet(values.gpu_model)) {
      warnings.push(
        "This is a workstation row with no GPU model. Every workstation sheet prints a GPU block — check the Workstation section.",
      );
    }
    if (!isSet(values.camera_matrix)) {
      warnings.push(
        "This is a workstation row with an empty camera matrix. The SW sheets print a four-row resolution table.",
      );
    }
    if (isSet(values.db_drive_desc)) {
      warnings.push(
        "Database drive description is filled on a workstation row. That block belongs to the management and ACM sheets — it will be saved as entered.",
      );
    }
    return warnings;
  }

  // Non-workstation: the workstation-only columns should all be blank. They are
  // hidden on this archetype, so naming them is the only way the editor learns
  // a value is sitting out of sight — hidden fields are never silently dropped.
  const filled = Object.keys(WORKSTATION_FIELD_LABELS)
    .filter((name) => isSet(values[name]))
    .map((name) => WORKSTATION_FIELD_LABELS[name]);
  if (filled.length > 0) {
    warnings.push(
      `${filled.join(", ")} ${filled.length === 1 ? "is" : "are"} filled on a ${familyType} row. The Workstation section is hidden for this archetype, and these values will still be saved — clear them if they do not belong.`,
    );
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// The sheet_group cross-ROW check (design §4b)
//
// The pairing rule spans rows — V250 and V255 share the sheet_group 'V250' —
// and a form parses one row at a time, so single-row zod structurally cannot
// see it. The action does one follow-up SELECT of the group after a successful
// save and reports what it finds as a WARNING, never a refusal: a third variant
// on one sheet is unusual, not impossible, and refusing would make a legitimate
// sheet unenterable. The index page's grouping is the second, always-on view of
// the same invariant.
// ---------------------------------------------------------------------------

export type SheetGroupRow = { id: string; family_type: string | null };

export function sheetGroupWarnings(
  sheetGroup: string,
  rows: readonly SheetGroupRow[],
): string[] {
  const warnings: string[] = [];
  if (rows.length > 2) {
    warnings.push(
      `Sheet group '${sheetGroup}' now holds ${rows.length} rows (${rows
        .map((r) => r.id)
        .join(", ")}). A datasheet renders two CPU variants at most — check this is not a typo in one of their sheet groups.`,
    );
  }
  const types = [...new Set(rows.map((r) => r.family_type).filter(Boolean))];
  if (types.length > 1) {
    warnings.push(
      `Sheet group '${sheetGroup}' mixes family types (${types.join(", ")}). Rows on one physical sheet are the same archetype — one of them is probably in the wrong group.`,
    );
  }
  return warnings;
}

/** Every field, flattened — the schema builder and the form both walk this. */
export const APPLIANCE_FIELDS: SpecField[] = flattenSpecFields(APPLIANCE_SECTIONS);

/** Field names in section order. Also the column list the pages select. */
export const APPLIANCE_FIELD_NAMES: string[] = APPLIANCE_FIELDS.map((f) => f.name);

/** The kit's row -> display strings helper, bound to this table's field list. */
export function initialValuesFromRow(
  row: Record<string, unknown> | null,
): Record<string, string> {
  return initialValuesFromRowForFields(APPLIANCE_FIELD_NAMES, row);
}

// ---------------------------------------------------------------------------
// The sibling prefill's copy set (ADR 0103, which reads on ADR 0102)
//
// ADR 0102 built the copy-from-sibling prefill on /admin/specs and its scope
// note excluded this table, on the premise that "its seven rows are seven
// distinct chassis". Verified hardware facts corrected that premise: V250 /
// V255 / V260 / V265 are ONE chassis differing only in CPU, RAM and the two
// drive sizes; SW20 differs from SW10 only in a second GPU, bandwidth, monitor
// count, display ports and camera matrix; V150 shares the platform block but has
// its own power and cooling. So most of a row IS shared across a chassis family,
// and this constant is that shared block.
//
// The boundary is the load-bearing part, exactly as it is one table over. This
// is an ALLOWLIST, not a denylist: a field is in the copy set ONLY if it is
// invariant across the siblings of a chassis family. Everything else is
// hand-entered because it varies between siblings or by archetype —
//   identity     id, model_name, product_group, family_type, sheet_group
//   compute      cpu_model, cores_threads, cpu_cache, cpu_base_ghz,
//                cpu_turbo_ghz, ram_spec
//   storage      storage_summary, os_drive_desc, db_drive_desc (sizes vary,
//                e.g. the V255 OS drive is 960GB not 480GB), drive_bays,
//                raid_level_display
//   ports        display_ports (differs SW10/SW20; excluding it costs one
//                re-typed line on the management rows — the conservative call)
//   SW block     max_bandwidth_mbps, monitor_support, the gpu_* fields,
//                front_io, rear_io, camera_matrix
//   meta         revision_date, notes
//   datasheet    rear_io_photo_path (the SW20's extra GPU changes the rear
//                panel), usage_paragraph (per-model prose)
// — and copying any of those from a neighbour would overwrite a real difference
// with the wrong value, the same failure the product_specs boundary guards
// against (ADR 0092, one layer up). updated_at / updated_by are trigger-owned
// and are not form fields at all.
//
// Not every existing row is a valid source for a given target: an SW10
// workstation and a V250 management server are different chassis, so copying one
// onto the other copies the wrong platform block. The prefill does NOT decide
// that — it labels each candidate with its archetype and its copyable count and
// leaves the choice, and the review-before-Save, to the admin (ADR 0103).
// ---------------------------------------------------------------------------

/**
 * The 31 fields invariant across the siblings of a chassis family — the
 * platform, power, physical, environmental, regulatory and warranty block,
 * plus the front-3/4 product photo.
 *
 * Read by the sibling prefill on the create and edit pages. A literal list
 * rather than a filter over APPLIANCE_SECTIONS: the copy set cuts across
 * sections (it takes `raid_support` from Availability & RAID but not
 * `raid_level_display` beside it, and the port counts but not `display_ports`),
 * so section membership cannot express it. The tests assert every name here is a
 * real field, that `id` is absent, and that this set plus the excluded set is
 * exactly the full field list — so no column is silently ungoverned.
 */
export const APPLIANCE_PREFILL_FIELD_NAMES: readonly string[] = [
  // OS & storage (platform, not per-capacity)
  "os_edition",
  // Availability & RAID (the prose and posture, not the configured level)
  "raid_support",
  "battery_raid",
  "os_redundancy",
  "hotswap_power",
  // Networking & management (port counts, not display_ports)
  "network",
  "gbe_1_ports",
  "gbe_10_ports",
  "sfp_addon",
  "remote_mgmt",
  // Form factor & power
  "form_factor",
  "rack_units",
  "power_wattage",
  "power_redundancy",
  "power_max_consumption",
  "power_ac_input",
  "power_dc_input",
  "cooling",
  // Physical
  "dimensions_mm",
  "dimensions_in",
  "shipping_weight",
  // Warranty
  "warranty_years",
  "warranty_terms",
  // Environmental
  "operating_temp",
  "storage_temp",
  "humidity",
  // Regulatory & security
  "regulatory_safety",
  "regulatory_emissions",
  "ndaa_text",
  "security_features",
  // Datasheet content — the front-3/4 photo only. V250/V255 are one chassis and
  // SW20 is an SW10 with a second GPU, so the front of the box is the same
  // picture. The REAR is not: that second GPU changes the rear panel's display
  // outputs, which is exactly the "overwrite a real difference with a
  // neighbour's value" failure this boundary exists to prevent. And the usage
  // paragraph is per-model prose — V250 and V255 sit at different capacity
  // tiers, which is the whole reason both exist.
  "product_photo_path",
];

/**
 * Field names in APPLIANCE_PREFILL_FIELD_NAMES that carry a value on this row.
 *
 * Labels each candidate on the prefill control, so the editor copies from a
 * filled row rather than discovering afterwards that they copied 30 blanks. An
 * empty `text[]` counts as unfilled: `security_features` is NOT NULL DEFAULT
 * '{}', so treating `{}` as filled would report every fresh row as carrying a
 * value before anything was entered.
 */
export function filledPrefillFields(
  row: Record<string, unknown> | null,
): string[] {
  if (!row) return [];
  return APPLIANCE_PREFILL_FIELD_NAMES.filter((name) => {
    const value = row[name];
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "string") return value.trim() !== "";
    return true;
  });
}

/**
 * Overlay a source row's copyable fields onto a base value set.
 *
 * `base` is the target's own display strings — all blank on the create form, the
 * row's own values on the edit form. The return copies EXACTLY the
 * APPLIANCE_PREFILL_FIELD_NAMES from the source over it and touches nothing
 * else; every excluded field keeps its base value. `id` is not in the copy set,
 * so a prefill can never retarget the save. A null source returns `base`
 * unchanged.
 */
export function prefillInitialValues(
  base: Record<string, string>,
  sourceRow: Record<string, unknown> | null,
): Record<string, string> {
  if (!sourceRow) return base;
  const sourceValues = initialValuesFromRow(sourceRow);
  return {
    ...base,
    ...Object.fromEntries(
      APPLIANCE_PREFILL_FIELD_NAMES.map((name) => [name, sourceValues[name] ?? ""]),
    ),
  };
}
