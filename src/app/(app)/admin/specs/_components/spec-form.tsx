"use client";

// The 43-field product_specs editor (design §3 sections, §4 safety design).
//
// Since ADR 0097 decision 4 the rendering is the shared kit's <SpecFormShell>:
// the section walk, the input-per-kind switch, the violation and warning
// blocks, the server-state messages and the footer are all identical between
// this form and the appliance_specs one, and a second copy of them would be a
// second thing to keep in step.
//
// What stays here is what is actually product_specs': which fields have to be
// live, how their raw strings coerce into the values the rules read, and the
// net-usable preview that hangs off them. The preview is the extras slot's
// first instance and stays table-local by design — appliance rows feed no
// computation, so ADR 0097 §4f gives that form no preview to cargo-cult.

import { SpecFormShell, type SpecLiveValues } from "@/lib/spec-form/form-shell";
import type { SpecActionState } from "@/lib/spec-form";
import {
  SPEC_SECTIONS,
  specRuleViolations,
  specWarnings,
  toNumberOrNull,
  type SpecRuleValues,
} from "../fields";
import { NetUsablePreview, type CapacityInputs } from "./net-usable-preview";

/**
 * The fields whose values drive the live preview and the live rule checks.
 *
 * The first seven are the capacity inputs (ADR 0096). The last four are the two
 * datasheet warnings added with the additive columns — the warranty pair and
 * the dimensions pair each need both halves live, since either one changing can
 * make the pair disagree.
 */
const LIVE_FIELDS = [
  "storage_raw_tb",
  "hdd_count",
  "drive_bays",
  "raid_level_display",
  "raid_level_alt_display",
  "max_cameras",
  "max_cameras_h265",
  "warranty",
  "warranty_years",
  "dimensions_mm",
  "dimensions_in",
] as const;

/**
 * The three readings the server will take of the submitted values — the rule
 * check, the warnings and the capacity figure — all read the same coercion of
 * the same raw strings.
 */
function ruleValuesFrom(live: SpecLiveValues): SpecRuleValues {
  return {
    drive_bays: toNumberOrNull(live.drive_bays),
    hdd_count: toNumberOrNull(live.hdd_count),
    raid_level_display: live.raid_level_display || null,
    raid_level_alt_display: live.raid_level_alt_display || null,
    max_cameras: toNumberOrNull(live.max_cameras),
    max_cameras_h265: toNumberOrNull(live.max_cameras_h265),
    warranty: live.warranty || null,
    warranty_years: toNumberOrNull(live.warranty_years),
    dimensions_mm: live.dimensions_mm || null,
    dimensions_in: live.dimensions_in || null,
  };
}

export function SpecForm({
  mode,
  action,
  initialValues,
  savedCapacity,
  skuLabel,
}: {
  mode: "create" | "edit";
  action: (
    prev: SpecActionState | null,
    formData: FormData,
  ) => Promise<SpecActionState>;
  /** Every field as a display string; "" for null. */
  initialValues: Record<string, string>;
  /** The persisted capacity inputs, for the preview's "saved" side. Null on create. */
  savedCapacity: CapacityInputs | null;
  skuLabel: string;
}) {
  return (
    <SpecFormShell
      mode={mode}
      action={action}
      sections={SPEC_SECTIONS}
      initialValues={initialValues}
      liveFields={LIVE_FIELDS}
      liveChecks={(live) => {
        const values = ruleValuesFrom(live);
        return {
          violations: specRuleViolations(values),
          warnings: specWarnings(values),
        };
      }}
      extras={(live) => {
        const values = ruleValuesFrom(live);
        const next: CapacityInputs = {
          storage_raw_tb: toNumberOrNull(live.storage_raw_tb),
          hdd_count: values.hdd_count ?? null,
          raid_level_display: values.raid_level_display ?? null,
          raid_level_alt_display: values.raid_level_alt_display ?? null,
        };
        // The preview sits above the fields and stays visible while editing the
        // Storage & RAID section, which is directly below it.
        return <NetUsablePreview saved={savedCapacity} next={next} />;
      }}
      idPlaceholder="VX5-V900-960"
      backHref="/admin/specs"
      backLabel="Back to specs"
      submitLabel={mode === "create" ? "Create spec row" : `Save ${skuLabel}`}
    />
  );
}
