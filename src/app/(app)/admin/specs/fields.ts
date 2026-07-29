// Field metadata for the product_specs admin form (ADR 0096; design
// datasheets/spec-admin-form-design.md §3).
//
// ONE declarative list drives three consumers: the zod schema (./schema.ts),
// the form's rendered inputs (./_components/spec-form.tsx), and the index
// page's column labels. That is deliberate. ADR 0096's stated negative is
// "every future column needs a field added or it is silently unreachable
// through the only supported write path — the same failure mode as the 26
// columns, one layer up." Adding a column here validates it AND renders it, so
// the two halves cannot drift apart.
//
// The KINDS, the zod builders and the renderer that read this list now live in
// @/lib/spec-form (ADR 0097 decision 4), shared with the appliance_specs form.
// This file is the product_specs half and stays that way: sections, labels,
// hints, rules and warnings are per-table by design.
//
// No zod, no React, no server-only imports — this module is bundled into the
// client form, so it must stay pure data.
//
// The 43 fields here are the 42 live columns minus `product_sku`, plus
// `raid_level_alt_display` (new in migration 20260727000001).
//
// product_sku is DELIBERATELY NOT SURFACED: null in all 21 rows, the Phase 0
// audit found it dead, and its own migration comment calls it "reserved for
// future join to products.sku" — a join done in-process on
// product_specs.id == products.sku instead. It belongs in the same drop
// migration as the ADR 0095 columns.
//
// updated_at / updated_by are also absent, and MUST stay absent: the
// product_specs_stamp_updated BEFORE trigger maintains both. An action writing
// them would fight the trigger.

import {
  flattenSpecFields,
  initialValuesFromRow as initialValuesFromRowForFields,
  type SpecField,
  type SpecRuleViolation,
  type SpecSection,
} from "@/lib/spec-form";

/**
 * RAID levels the form will accept, in the order they are offered.
 *
 * This list is exactly the set of strings `usableCapacityTb()` matches on, plus
 * 'NA'. That coupling is the point (design §4a): the helper sends every
 * unrecognised string to its documented RAID-5 branch, so a free-text input
 * accepting 'RAID 6', '6 ', or '06' would *silently overstate* net-usable
 * capacity by one drive's worth — the exact under-spec failure ADR 0092 was
 * written to fix, re-introduced one layer up. A closed option list makes that
 * unrepresentable rather than merely unlikely.
 *
 * If a level outside this set ever ships, the select and `usableCapacityTb()`
 * move together (ADR 0096, When to revisit).
 */
export const RAID_LEVEL_OPTIONS = [
  { value: "1", label: "RAID 1 (mirror — usable = raw / 2)" },
  { value: "5", label: "RAID 5 (1 parity drive)" },
  { value: "6", label: "RAID 6 (2 parity drives)" },
  { value: "60", label: "RAID 60 (2 parity per 12-drive span)" },
  { value: "JBOD", label: "JBOD (no parity — usable = raw)" },
  // 'NA' is carried ONLY so the three uncorrected V100 rows round-trip through
  // this form. It is not a RAID level: usableCapacityTb() does not recognise it
  // and falls through to the RAID-5 branch, which returns the correct mirror
  // figure for the V100 only because that box has exactly 2 drives. Correcting
  // those rows to '1' / 'JBOD' is design §7 step 6.
  { value: "NA", label: "NA — deprecated, do not select for new rows" },
] as const;

export const RAID_LEVEL_VALUES = RAID_LEVEL_OPTIONS.map((o) => o.value);

/**
 * The RAID select as the shared `enum-required` / `enum-optional` kind takes
 * it. Spread into both level fields so the two cannot drift apart, and so the
 * appliance form's own list (the same options minus 'NA', ADR 0097 §4c) is a
 * visibly separate declaration rather than an accidental import.
 */
const RAID_SELECT = {
  options: RAID_LEVEL_OPTIONS,
  invalidMessage: "Pick a RAID level from the list.",
} as const;

// The kind vocabulary, the SpecField/SpecSection shapes and the coercion
// helpers are the shared kit's (ADR 0097 decision 4). Re-exported here so the
// three consumers, the tests and the round-trip script keep importing the
// product_specs surface from one place.
export {
  toNumberOrNull,
  type SpecField,
  type SpecFieldKind,
  type SpecFieldOption,
  type SpecRuleViolation,
  type SpecSection,
} from "@/lib/spec-form";

/**
 * The seven sections of design §3, in order, following the groupings the
 * migrations already comment.
 */
export const SPEC_SECTIONS: SpecSection[] = [
  {
    title: "Identity",
    fields: [
      {
        name: "id",
        label: "SKU / spec id",
        kind: "id",
        maxLength: 64,
        hint: "Must equal products.sku exactly — the two tables are joined on it in process, with no foreign key to catch a mismatch.",
      },
      { name: "model_name", label: "Model name", kind: "text-required", maxLength: 200 },
      { name: "form_factor", label: "Form factor", kind: "text-required", maxLength: 200 },
      { name: "rack_units", label: "Rack units", kind: "text-optional", maxLength: 200 },
      { name: "notes", label: "Notes", kind: "textarea-optional", maxLength: 2000 },
    ],
  },
  {
    title: "CPU",
    fields: [
      { name: "cpu_model", label: "CPU model", kind: "text-required", maxLength: 200 },
      { name: "cpu_model_full", label: "CPU model (full)", kind: "text-optional", maxLength: 200 },
      { name: "cpu_cores_threads", label: "Cores / threads", kind: "text-required", maxLength: 200 },
      { name: "cores_threads", label: "Cores / threads (QuickCompare)", kind: "text-optional", maxLength: 200 },
      { name: "cpu_base_ghz", label: "CPU base GHz", kind: "num-required-positive" },
      { name: "cpu_turbo_ghz", label: "CPU turbo GHz", kind: "text-optional", maxLength: 200 },
      { name: "cpu_passmark", label: "CPU Passmark", kind: "int-required-positive" },
      { name: "cpu_cache", label: "CPU cache", kind: "text-optional", maxLength: 200 },
      { name: "mem_bandwidth", label: "Memory bandwidth", kind: "text-optional", maxLength: 200 },
      { name: "avx_512", label: "AVX-512", kind: "text-optional", maxLength: 200 },
      { name: "workload_affinity", label: "Workload affinity", kind: "text-optional", maxLength: 200 },
      { name: "chiplet_arch", label: "Chiplet architecture", kind: "text-optional", maxLength: 200 },
      { name: "infinity_guard", label: "Infinity Guard", kind: "text-optional", maxLength: 200 },
    ],
  },
  {
    title: "Memory",
    fields: [
      { name: "ram_gb", label: "RAM (GB)", kind: "int-required-positive" },
      { name: "ram_spec", label: "RAM spec", kind: "text-optional", maxLength: 200 },
    ],
  },
  {
    title: "Storage & RAID",
    note: "storage_raw_tb, hdd_count and the two RAID levels are the inputs to usableCapacityTb(). Every net-usable figure the portal publishes is derived from them — check the preview before saving.",
    fields: [
      {
        name: "storage_raw_tb",
        label: "Raw storage (TB)",
        kind: "num-required-positive",
        hint: "Nameplate total, before parity. Never the net-usable figure.",
      },
      { name: "drive_bays", label: "Drive bays", kind: "int-optional" },
      {
        name: "hdd_count",
        label: "HDD count",
        kind: "int-optional",
        hint: "Populated drives. Cannot exceed drive bays.",
      },
      { name: "hdd_mtbf", label: "HDD MTBF", kind: "text-optional", maxLength: 200 },
      { name: "raid_support", label: "RAID support (marketing string)", kind: "text-required", maxLength: 200 },
      {
        name: "raid_level_display",
        label: "RAID level (as configured)",
        kind: "enum-required",
        ...RAID_SELECT,
        emptyOptionLabel: "— select a level —",
        hint: "Drives the net-usable calculation.",
      },
      {
        name: "raid_level_alt_display",
        label: "Alternate RAID level (optional)",
        kind: "enum-optional",
        ...RAID_SELECT,
        emptyOptionLabel: "— none —",
        hint: "Only for boxes that ship configurable either way — the V100 (RAID 1 or JBOD). Leave blank otherwise.",
      },
      { name: "battery_raid", label: "Battery-backed RAID", kind: "text-optional", maxLength: 200 },
      { name: "os_ssd_type", label: "OS SSD type", kind: "text-optional", maxLength: 200 },
      { name: "os_redundancy", label: "OS redundancy", kind: "text-optional", maxLength: 200 },
      { name: "os_drive_desc", label: "OS / VMS drive description", kind: "text-optional", maxLength: 200 },
    ],
  },
  {
    title: "Capacity & throughput",
    fields: [
      { name: "max_cameras", label: "Max cameras", kind: "int-required-positive" },
      { name: "max_cameras_h265", label: "Max cameras (H.265)", kind: "int-required-positive" },
      { name: "max_bandwidth_mbps", label: "Max bandwidth (Mbps)", kind: "int-optional" },
    ],
  },
  {
    title: "Networking & power",
    fields: [
      { name: "network", label: "Network (summary string)", kind: "text-required", maxLength: 200 },
      { name: "gbe_1_ports", label: "1 GbE ports", kind: "int-optional" },
      { name: "gbe_10_ports", label: "10 GbE ports", kind: "int-optional" },
      { name: "sfp_addon", label: "SFP add-on", kind: "text-optional", maxLength: 200 },
      { name: "hotswap_power", label: "Hot-swap power", kind: "text-optional", maxLength: 200 },
      // display_ports is a physical connector, but it belongs with the other
      // port counts rather than in Physical (which is dimensions and weight):
      // the sheets print it in the same block as the network ports.
      { name: "display_ports", label: "Display ports", kind: "text-optional", maxLength: 200 },
      { name: "remote_mgmt", label: "Remote management", kind: "text-optional", maxLength: 200 },
    ],
  },
  {
    title: "Software & support",
    fields: [
      { name: "os", label: "Operating system", kind: "text-required", maxLength: 200 },
      { name: "os_edition", label: "OS edition", kind: "text-optional", maxLength: 200 },
      {
        name: "warranty",
        label: "Warranty (legacy string)",
        kind: "text-required",
        maxLength: 200,
        hint: "Stays NOT NULL and in use. The two structured fields beside it are what the datasheet reads — keep them consistent with this.",
      },
      { name: "warranty_years", label: "Warranty years", kind: "int-optional" },
      { name: "warranty_terms", label: "Warranty terms", kind: "text-optional", maxLength: 200 },
      { name: "vms_certified", label: "VMS certified", kind: "text-required", maxLength: 200 },
      { name: "avigilon_gpu", label: "Avigilon GPU", kind: "text-optional", maxLength: 200 },
    ],
  },
  // -------------------------------------------------------------------------
  // Sections 8–12: the datasheet columns (migration 20260729000002, applied
  // 2026-07-28; ADR 0097 decision 2 and design §5).
  //
  // Every one of these is nullable, because the 21 live rows carry no value for
  // any of them yet — the values are entered through this form, by hand, from
  // the physical factsheets (design §8 / build step 6). The exception is
  // security_features, which is NOT NULL DEFAULT '{}': its `string-list` kind
  // submits [] for a blank list, never null.
  // -------------------------------------------------------------------------
  {
    title: "Power & cooling",
    fields: [
      { name: "power_wattage", label: "Power supply", kind: "text-optional", maxLength: 200 },
      { name: "power_redundancy", label: "Power redundancy", kind: "text-optional", maxLength: 200 },
      { name: "power_max_consumption", label: "Max power consumption", kind: "text-optional", maxLength: 200 },
      { name: "power_ac_input", label: "AC input", kind: "text-optional", maxLength: 200 },
      {
        name: "power_dc_input",
        label: "DC input",
        kind: "text-optional",
        maxLength: 200,
        hint: "Only the sheets that print a DC line alongside AC — the V100/V200. Leave blank otherwise.",
      },
      { name: "cooling", label: "Cooling", kind: "text-optional", maxLength: 200 },
    ],
  },
  {
    title: "Physical",
    note: "Dimensions are display strings copied from the sheet, not per-axis numbers — the sheets print mm on the rack models, so the inches field is usually blank.",
    fields: [
      { name: "dimensions_mm", label: "Dimensions (mm)", kind: "text-optional", maxLength: 200 },
      { name: "dimensions_in", label: "Dimensions (in)", kind: "text-optional", maxLength: 200 },
      { name: "shipping_weight", label: "Shipping weight", kind: "text-optional", maxLength: 200 },
    ],
  },
  {
    title: "Environmental",
    fields: [
      { name: "operating_temp", label: "Operating temperature", kind: "text-optional", maxLength: 200 },
      { name: "storage_temp", label: "Storage temperature", kind: "text-optional", maxLength: 200 },
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
        hint: "One per line (SEV, SME, Secure Boot, signed firmware …). A blank list is stored as an empty list, not as null.",
      },
    ],
  },
  {
    title: "Datasheet meta",
    fields: [
      {
        name: "revision_date",
        label: "Revision date",
        kind: "date-optional",
        hint: "The as-of date printed on the sheet this row's values were taken from.",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Cross-field rules and warnings
//
// These live HERE, next to the metadata, rather than inside the zod schema,
// because three consumers need the same answer: the schema (to refuse the save),
// the form (to show the editor the refusal as they type, before they submit),
// and the action's confirmation message. Restating the conditions in the client
// would be the same duplication-drift hazard the shared field list exists to
// avoid — with the added sting that a client copy could disagree with the server
// about whether a capacity edit is legal.
//
// Every rule was checked against the live 21 rows before it was written, so none
// rejects data already in production (verified 2026-07-27):
//   - hdd_count == drive_bays on all 21 rows
//   - the six RAID 60 rows carry hdd_count 24 (V700) and 36 (V800)
//   - the three RAID 1 candidates are the V100 at hdd_count 2
//   - max_cameras == max_cameras_h265 on all 21 rows
// ---------------------------------------------------------------------------

/** The subset of a spec row the rules and warnings read. */
export type SpecRuleValues = {
  drive_bays?: number | null;
  hdd_count?: number | null;
  raid_level_display?: string | null;
  raid_level_alt_display?: string | null;
  max_cameras?: number | null;
  max_cameras_h265?: number | null;
  warranty?: string | null;
  warranty_years?: number | null;
  dimensions_mm?: string | null;
  dimensions_in?: string | null;
};

/** Parity rules that depend on the drive count, applied to whichever level column
 *  is being checked. Both columns feed usableCapacityTb(), so a drive count that
 *  does not fit the level corrupts the alternate figure exactly as it does the
 *  primary. */
function levelDriveCountViolation(
  level: string | null | undefined,
  hddCount: number | null | undefined,
  field: string,
  label: string,
): SpecRuleViolation | null {
  if (level == null || hddCount == null) return null;
  // RAID 60 parity is 2 x round(n / 12). A drive count that is not a whole
  // number of spans makes that round() guess, and the published figure is then
  // wrong in one direction or the other.
  if (level === "60" && hddCount % 12 !== 0) {
    return {
      field,
      message: `RAID 60 is built from 12-drive spans, so ${label} requires an HDD count that is a multiple of 12 (currently ${hddCount}).`,
    };
  }
  if (level === "1" && hddCount % 2 !== 0) {
    return {
      field,
      message: `RAID 1 mirrors drives in pairs, so ${label} requires an even HDD count (currently ${hddCount}).`,
    };
  }
  return null;
}

/** Conditions that REFUSE the save (design §4c). Empty array means clean. */
export function specRuleViolations(values: SpecRuleValues): SpecRuleViolation[] {
  const violations: SpecRuleViolation[] = [];
  const { hdd_count: hddCount, drive_bays: driveBays } = values;

  if (hddCount != null && driveBays != null && hddCount > driveBays) {
    violations.push({
      field: "hdd_count",
      message: `HDD count (${hddCount}) cannot exceed drive bays (${driveBays}).`,
    });
  }

  const primary = levelDriveCountViolation(
    values.raid_level_display,
    hddCount,
    "raid_level_display",
    "RAID level",
  );
  if (primary) violations.push(primary);

  const alt = levelDriveCountViolation(
    values.raid_level_alt_display,
    hddCount,
    "raid_level_alt_display",
    "the alternate RAID level",
  );
  if (alt) violations.push(alt);

  return violations;
}

/**
 * Things worth a second look that are explicitly NOT errors (design §4c).
 *
 * The first two conditions hold on all 21 live rows today, so a violation is
 * more likely a typo than a real spec — but neither is impossible, and the form
 * must not refuse a legitimate one.
 */
export function specWarnings(values: SpecRuleValues): string[] {
  const warnings: string[] = [];
  const { max_cameras: cameras, max_cameras_h265: camerasH265 } = values;
  if (cameras != null && camerasH265 != null && cameras !== camerasH265) {
    warnings.push(
      `Max cameras (${cameras}) and max cameras H.265 (${camerasH265}) differ. They are equal on all 21 current models — check this is intentional.`,
    );
  }
  const level = values.raid_level_display;
  const altLevel = values.raid_level_alt_display;
  if (altLevel != null && altLevel === level) {
    warnings.push(
      `The alternate RAID level is the same as the configured level (${level}). An alternate configuration that matches the primary publishes the same figure twice — leave it blank unless the box really ships two ways.`,
    );
  }
  if (level === "NA") {
    warnings.push(
      "RAID level 'NA' is deprecated: usableCapacityTb() does not recognise it and falls through to the RAID-5 branch. Set the level the box actually ships (the V100 is RAID 1 or JBOD).",
    );
  }

  // Two representations of the warranty now coexist: the legacy NOT NULL string
  // the Price Book prints, and the structured years the datasheet reads. Drift
  // between them is exactly what keeping both invites, and neither side can be
  // called wrong from a single row — so this warns rather than refuses.
  const legacyYears = leadingDigits(values.warranty);
  if (
    values.warranty_years != null &&
    legacyYears != null &&
    legacyYears !== values.warranty_years
  ) {
    warnings.push(
      `Warranty years (${values.warranty_years}) disagrees with the legacy warranty string, which starts "${legacyYears}". The datasheet reads the structured field and the Price Book prints the string — make them agree.`,
    );
  }

  // The pairing is deliberately one-directional. The live rack sheets print mm
  // only, so a blank inches field is the normal case and must stay silent; an
  // inches figure with no mm is the half-done one.
  if (values.dimensions_in && !values.dimensions_mm) {
    warnings.push(
      "Dimensions (in) is filled but Dimensions (mm) is blank. The rack sheets print mm, so the mm field is the one the datasheet reads first.",
    );
  }

  return warnings;
}

/** The leading run of digits in a string, e.g. "5yr NBD, Advanced Replacement" -> 5. */
function leadingDigits(value: string | null | undefined): number | null {
  if (value == null) return null;
  const match = /^\s*(\d+)/.exec(value);
  return match ? Number(match[1]) : null;
}

// ---------------------------------------------------------------------------
// The datasheet columns, and why they are a named set (ADR 0102)
//
// These 22 are exactly the columns migration 20260729000002 added: the ones a
// factsheet supplies. That origin is what makes them a coherent group rather
// than an arbitrary slice — a factsheet describes a CHASSIS, so every value in
// this set is identical across the three capacity SKUs of a family. One V400
// sheet covers the 128, 160 and 192.
//
// The other 43 fields are deliberately NOT here, and the boundary matters more
// than the convenience does. `storage_raw_tb`, `hdd_count`, `max_cameras`,
// `max_cameras_h265` and `model_name` all differ per capacity, and copying them
// between siblings would overwrite correct data with a neighbour's — publishing
// a wrong net-usable figure through exactly the path ADR 0092 exists to close.
// The rest (`cpu_model`, `network`, `os`, `warranty` …) happen to match across
// siblings today, but they are populated and correct, so copying them buys
// nothing and risks clobbering a legitimate future difference.
//
// So: this list is the copy set BECAUSE it is the factsheet set, not because
// those columns are currently empty. When a sheet is revised, these are the
// columns that change together, for all three siblings at once — which is the
// same reason the prefill stays useful after build step 6 is done.
// ---------------------------------------------------------------------------

/**
 * The 22 columns a factsheet supplies — per-chassis, not per-capacity.
 *
 * Read by the sibling prefill on the edit page. It is a literal list rather
 * than a filter over SPEC_SECTIONS because five of the 22 live in older
 * sections (`warranty_years`/`warranty_terms` in *Software & support*,
 * `remote_mgmt`/`display_ports` in *Networking & power*, `os_drive_desc` in
 * *Storage & RAID*), so section membership cannot express the set. The tests
 * assert every name here is a real field and that no capacity input leaks in.
 */
export const DATASHEET_FIELD_NAMES: readonly string[] = [
  // Power & cooling
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
  // Environmental
  "operating_temp",
  "storage_temp",
  "humidity",
  // Regulatory & security
  "regulatory_safety",
  "regulatory_emissions",
  "ndaa_text",
  "security_features",
  // Datasheet meta
  "revision_date",
  // Placed into pre-existing sections by design §5
  "warranty_years",
  "warranty_terms",
  "remote_mgmt",
  "os_drive_desc",
  "display_ports",
];

/**
 * Field names in DATASHEET_FIELD_NAMES that carry a value on this row.
 *
 * Used to label each sibling on the prefill control, so the editor can see
 * which neighbour is worth copying from rather than guessing. An empty `text[]`
 * counts as unfilled: `security_features` is NOT NULL DEFAULT '{}', so every
 * row has one, and treating `{}` as filled would report all 21 rows as having
 * a value before anything was entered.
 */
export function filledDatasheetFields(
  row: Record<string, unknown> | null,
): string[] {
  if (!row) return [];
  return DATASHEET_FIELD_NAMES.filter((name) => {
    const value = row[name];
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "string") return value.trim() !== "";
    return true;
  });
}

/** Every field, flattened — the schema builder and the form both walk this. */
export const SPEC_FIELDS: SpecField[] = flattenSpecFields(SPEC_SECTIONS);

/** Field names in section order. Also the column list the pages select. */
export const SPEC_FIELD_NAMES: string[] = SPEC_FIELDS.map((f) => f.name);

export const SPEC_FIELDS_BY_NAME: Record<string, SpecField> = Object.fromEntries(
  SPEC_FIELDS.map((f) => [f.name, f]),
);

/** The kit's row -> display strings helper, bound to this table's field list. */
export function initialValuesFromRow(
  row: Record<string, unknown> | null,
): Record<string, string> {
  return initialValuesFromRowForFields(SPEC_FIELD_NAMES, row);
}
