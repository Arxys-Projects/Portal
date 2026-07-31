// Which models have a datasheet, which template renders them, and — for the ones
// that do not — why not, stated in words.
//
// Pure: takes fetched rows, returns a list. Shared by the route (to decide what
// it will render, and to refuse the rest with a reason rather than a 404) and by
// the admin picker (to show the whole range, including the models with no sheet).
//
// A MODEL WITH NO SHEET IS LISTED, NOT OMITTED. Silently dropping the three ACM
// rows and the two management rows from the picker would read as "these products
// do not exist"; the honest surface says they exist and explains what is missing.
// The two reasons are genuinely different and are not collapsed into one:
//
//   ACM (V150, V260, V265) — no template has been DESIGNED. The design handoff
//   puts the ACM line explicitly out of scope: the ACM names appear in the V250
//   sheet's model strip for positioning, and no ACM-specific field (door counts,
//   certified-platform lists) is drawn anywhere. Rendering an ACM row through
//   Ledger would produce a video server sheet wearing access-control figures,
//   which is the exact failure ADR 0109 was written about.
//
//   Management (V250, V255) — the template IS designed (handoff screenshots 03
//   and 04) but is not BUILT. It needs section shapes Ledger does not have: a
//   Management Capacity table in place of the VSR table with different columns
//   and no parameter strip, an orderable table of Part Number / Model /
//   Configuration / Cameras Managed, and merged two-SKU spec values. Its
//   throughput and cameras-managed figures are also not in appliance_specs, so
//   they would have to be authored rather than read. Deferred deliberately —
//   ADR 0110.

import type { ApplianceSpecRow } from "./from-appliance-specs";
import {
  groupByModel,
  ledgerGaps,
  ledgerWarnings,
  type ProductSpecRow,
} from "./from-product-specs";

export type DatasheetTemplate = "ledger" | "rail";

export type CatalogueEntry = {
  /** The model the sheet is for, e.g. "V800" or "SW10". One sheet per model. */
  model: string;
  /** Which spec table the sheet reads. */
  source: "product_specs" | "appliance_specs";
  /** How the sheet is described in the picker, e.g. "8 bay · 2U NVR". */
  description: string;
  /** null when no sheet can be generated. */
  template: DatasheetTemplate | null;
  /** Stated in words when `template` is null. Never empty in that case. */
  unavailableReason: string | null;
  /** Columns missing from an otherwise-renderable sheet. Empty when complete. */
  gaps: string[];
  /**
   * Problems that make the emitted PDF DEFECTIVE rather than merely incomplete —
   * today, a usage paragraph long enough to push the footer onto a fourth page.
   * Kept separate from `gaps` because a gap is an honest omission and a warning
   * is a bug the reader should not ship to a customer.
   */
  warnings: string[];
  /** Part numbers that appear in the sheet's orderable table. */
  skus: string[];
};

const ACM_REASON =
  "No datasheet template has been designed for the access control line. " +
  "The design handoff puts ACM explicitly out of scope, and no ACM field — door counts, " +
  "certified platform lists — is drawn anywhere. Rendering it through the video server " +
  "template would produce a sheet with the wrong sections.";

const MANAGEMENT_REASON =
  "The management server sheet is designed but not yet built. It needs a Management " +
  "Capacity table in place of the video stream rate table, a differently-shaped ordering " +
  "table, and merged V250/V255 spec values — and its throughput and cameras-managed " +
  "figures are not in the spec table yet.";

/** Why a non-workstation appliance family has no sheet. */
function applianceUnavailableReason(familyType: string | null): string {
  if (familyType === "acm") return ACM_REASON;
  if (familyType === "management") return MANAGEMENT_REASON;
  return `No template covers family type "${familyType ?? "unset"}".`;
}

/**
 * The full datasheet catalogue: 7 NVR models from product_specs, plus every
 * appliance_specs product group.
 *
 * Sorted so the renderable sheets come first and the unavailable ones sit
 * together at the end, which is what the picker wants — but the unavailable ones
 * are still in the list.
 */
export function datasheetCatalogue(
  productRows: ProductSpecRow[],
  applianceRows: ApplianceSpecRow[],
): CatalogueEntry[] {
  const entries: CatalogueEntry[] = [];

  const groups = groupByModel(productRows);
  const nvrModels = [...groups.entries()].sort(
    (a, b) => (a[1][0].drive_bays ?? 0) - (b[1][0].drive_bays ?? 0),
  );
  for (const [model, rows] of nvrModels) {
    const spec = rows[rows.length - 1];
    entries.push({
      model,
      source: "product_specs",
      description: [
        spec.drive_bays ? `${spec.drive_bays} bay` : null,
        spec.rack_units,
        "NVR",
      ]
        .filter(Boolean)
        .join(" · "),
      template: "ledger",
      unavailableReason: null,
      gaps: ledgerGaps(model, productRows),
      warnings: ledgerWarnings(model, productRows),
      skus: rows.map((r) => r.id),
    });
  }

  // One entry per product_group. Two management rows share a sheet_group, but
  // they are listed separately here because neither renders — collapsing them
  // would hide V255 from the picker entirely.
  const appliances = [...applianceRows].sort((a, b) =>
    a.product_group.localeCompare(b.product_group),
  );
  for (const row of appliances) {
    const isWorkstation = row.family_type === "workstation";
    entries.push({
      model: row.product_group,
      source: "appliance_specs",
      description:
        row.model_name?.replace(/^VideoX V5\s+/, "").replace(`${row.product_group} `, "") ??
        (row.family_type ?? "appliance"),
      template: isWorkstation ? "rail" : null,
      unavailableReason: isWorkstation ? null : applianceUnavailableReason(row.family_type),
      gaps: isWorkstation ? railGaps(row) : [],
      // Rail has no equivalent length constraint: its usage paragraph sits in a
      // content column with the photo below it, not beside the attributes.
      warnings: [],
      skus: [row.id],
    });
  }

  return entries;
}

/** The visible gaps in a workstation sheet. Same intent as ledgerGaps(). */
export function railGaps(row: ApplianceSpecRow): string[] {
  const gaps: string[] = [];
  if (!row.usage_paragraph) gaps.push("recommended-usage paragraph");
  if (!row.warranty_years) gaps.push("warranty term");
  if (!row.product_photo_path) gaps.push("front photo");
  if (!row.camera_matrix || row.camera_matrix.length === 0) {
    gaps.push("camera stream matrix — the table renders empty");
  }
  return gaps;
}

/** Look up one model. Returns undefined for a model that is not in either table. */
export function findCatalogueEntry(
  catalogue: CatalogueEntry[],
  model: string,
): CatalogueEntry | undefined {
  const wanted = model.trim().toUpperCase();
  return catalogue.find((e) => e.model.toUpperCase() === wanted);
}
