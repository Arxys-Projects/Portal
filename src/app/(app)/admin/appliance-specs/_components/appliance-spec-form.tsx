"use client";

// The 62-field appliance_specs editor (design §3 sections, §4 archetype
// treatments). Rendering is the shared kit's <SpecFormShell>; what lives here is
// what is actually appliance_specs': which fields have to be live, how their raw
// strings coerce into the values the warnings read, and which parts of the form
// the current archetype hides.
//
// NO EXTRAS SLOT. product_specs puts its net-usable preview there; appliance
// rows compute nothing, so this form passes none (ADR 0097 §4f). The camera
// matrix is not an extra either — it is the `json-rows` kind and renders inside
// the Workstation section with the GPU fields it belongs to (ADR 0100).

import { SpecFormShell, type SpecLiveValues } from "@/lib/spec-form/form-shell";
import type { SpecActionState } from "@/lib/spec-form";
import {
  APPLIANCE_SECTIONS,
  applianceWarnings,
  WORKSTATION_FIELD_LABELS,
  WORKSTATION_SECTION_TITLE,
  type ApplianceRuleValues,
} from "../fields";

/**
 * The fields the warnings and the archetype-conditional layout read as they are
 * typed: `family_type` drives both, and every workstation-only column has to be
 * live so that "this is filled on a management row" appears the moment the
 * archetype is switched — which is exactly when a mis-typed row is still open in
 * front of whoever can fix it.
 */
const LIVE_FIELDS = [
  "family_type",
  "db_drive_desc",
  ...Object.keys(WORKSTATION_FIELD_LABELS),
] as const;

/** The camera matrix reaches the client as the editor's serialised JSON string. */
function matrixFromJson(value: string | undefined): unknown[] | null {
  if (!value || value.trim() === "") return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    // Unreadable JSON is the editor's own amber panel to explain, and the save
    // is refused by the schema. For warning purposes it counts as "something is
    // there" rather than as an empty matrix.
    return [value];
  }
}

/**
 * The live display strings as the warnings read them — the same shape the action
 * passes from the parsed row, so both sides of the form agree on what a filled
 * field is.
 */
function ruleValuesFrom(live: SpecLiveValues): ApplianceRuleValues {
  const values: ApplianceRuleValues = {
    family_type: live.family_type || null,
    db_drive_desc: live.db_drive_desc || null,
    camera_matrix: matrixFromJson(live.camera_matrix),
  };
  for (const name of Object.keys(WORKSTATION_FIELD_LABELS)) {
    if (name === "camera_matrix") continue;
    values[name] = live[name] || null;
  }
  return values;
}

export function ApplianceSpecForm({
  mode,
  action,
  initialValues,
  skuLabel,
}: {
  mode: "create" | "edit";
  action: (
    prev: SpecActionState | null,
    formData: FormData,
  ) => Promise<SpecActionState>;
  /** Every field as a display string; "" for null. */
  initialValues: Record<string, string>;
  skuLabel: string;
}) {
  return (
    <SpecFormShell
      mode={mode}
      action={action}
      sections={APPLIANCE_SECTIONS}
      initialValues={initialValues}
      liveFields={LIVE_FIELDS}
      liveChecks={(live) => ({
        // Nothing on this table can be refused from a single row (schema.ts).
        violations: [],
        warnings: applianceWarnings(ruleValuesFrom(live)),
      })}
      // Hidden, not unmounted: a hidden input still submits, so a value entered
      // under the wrong archetype is preserved and warned about rather than
      // silently blanked on the next save (ADR 0097 §4e).
      hiddenSections={(live) =>
        live.family_type === "workstation" ? [] : [WORKSTATION_SECTION_TITLE]
      }
      hiddenFields={(live) =>
        live.family_type === "workstation" ? ["db_drive_desc"] : []
      }
      idPlaceholder="VX5-V250-MGM"
      backHref="/admin/appliance-specs"
      backLabel="Back to appliance specs"
      submitLabel={mode === "create" ? "Create appliance row" : `Save ${skuLabel}`}
    />
  );
}
