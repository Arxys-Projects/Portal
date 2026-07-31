// Which models have a datasheet, which template renders them, and — for the ones
// that do not — why not, stated in words.
//
// Pure: takes fetched rows, returns a list. Shared by the route (to decide what
// it will render, and to refuse the rest with a reason rather than a 404) and by
// the admin picker (to show the whole range, including the models with no sheet).
//
// A MODEL WITH NO SHEET IS LISTED, NOT OMITTED. Silently dropping the three ACM
// rows from the picker would read as "these products do not exist"; the honest
// surface says they exist and explains what is missing.
//
//   ACM (V150, V260, V265) — no template has been DESIGNED. The design handoff
//   puts the ACM line explicitly out of scope: the ACM names appear in the V250
//   sheet's model strip for positioning, and no ACM-specific field (door counts,
//   certified-platform lists) is drawn anywhere. Rendering an ACM row through
//   Ledger would produce a video server sheet wearing access-control figures,
//   which is the exact failure ADR 0109 was written about.
//
// ADR 0110 deferred the management servers here too, for a different reason —
// designed but not built. ADR 0111 builds them, so that half is gone and only
// the ACM reason remains, exactly as 0110 said would happen.
//
// ONE ENTRY PER SHEET, NOT PER ROW. The NVRs already worked this way (three SKUs
// of a model are the rows of one sheet's ordering table), and the management
// rows now do too: V250 and V255 share `sheet_group = 'V250'` and render as one
// "V250 / V255" sheet. So V255 has no entry of its own — it is an ALIAS on the
// V250 entry, which keeps a search or a URL for "V255" landing on the sheet that
// actually covers it instead of 404ing. Every other appliance row is its own
// sheet group and so its own entry.

import type { ApplianceSpecRow } from "./from-appliance-specs";
import { managementGaps, managementWarnings } from "./from-management-specs";
import {
  groupByModel,
  ledgerGaps,
  ledgerWarnings,
  type ProductSpecRow,
} from "./from-product-specs";

export type DatasheetTemplate = "ledger" | "rail";

export type CatalogueEntry = {
  /**
   * The key the sheet is addressed by — the model for an NVR or workstation
   * ("V800", "SW10"), the sheet group for a multi-SKU sheet ("V250"). This is
   * the URL segment, so it stays a bare alphanumeric.
   */
  model: string;
  /**
   * How the sheet names itself: "V800", or "V250 / V255" where one sheet covers
   * two SKUs. Used for the picker card and the download filename, never as a
   * lookup key.
   */
  displayName: string;
  /**
   * Other model keys that resolve to this sheet — ["V255"] on the V250 entry.
   * Without them a URL or a search for a real product answers 404 because its
   * sibling happens to name the sheet.
   */
  aliases: string[];
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

/** Why an appliance family that is neither workstation nor management has no sheet. */
function applianceUnavailableReason(familyType: string | null): string {
  if (familyType === "acm") return ACM_REASON;
  return `No template covers family type "${familyType ?? "unset"}".`;
}

/** Which builder a renderable appliance sheet goes through. */
export type ApplianceSheetKind = "rail" | "management";

function sheetKind(familyType: string | null): ApplianceSheetKind | null {
  if (familyType === "workstation") return "rail";
  if (familyType === "management") return "management";
  return null;
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
      displayName: model,
      aliases: [],
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

  // ONE ENTRY PER SHEET GROUP. Iterating rows would give V250 and V255 an entry
  // each and two identical downloads of the same sheet; iterating groups gives
  // one entry naming both. The group is keyed by its first row's product_group
  // so the URL segment stays what it always was.
  const bySheet = new Map<string, ApplianceSpecRow[]>();
  for (const row of [...applianceRows].sort((a, b) =>
    a.product_group.localeCompare(b.product_group),
  )) {
    const list = bySheet.get(row.sheet_group);
    if (list) list.push(row);
    else bySheet.set(row.sheet_group, [row]);
  }

  for (const [group, rows] of [...bySheet.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const first = rows[0];
    const kind = sheetKind(first.family_type);
    const groups = rows.map((r) => r.product_group);
    entries.push({
      // The sheet group is the address, but a group whose rows do not include it
      // would be unreachable, so fall back to the first row's own group.
      model: groups.includes(group) ? group : groups[0],
      displayName: groups.join(" / "),
      aliases: groups.filter((g) => g !== (groups.includes(group) ? group : groups[0])),
      source: "appliance_specs",
      description:
        kind === "management"
          ? `${rows.length === 1 ? "Management" : `${rows.length} variants`} · ${
              first.rack_units ?? "rack"
            } management / directory server`
          : first.model_name?.replace(/^VideoX V5\s+/, "").replace(`${first.product_group} `, "") ??
            (first.family_type ?? "appliance"),
      // Management renders through LEDGER, not a template of its own (ADR 0111).
      template: kind === null ? null : kind === "rail" ? "rail" : "ledger",
      unavailableReason: kind === null ? applianceUnavailableReason(first.family_type) : null,
      gaps:
        kind === "management"
          ? managementGaps(group, applianceRows)
          : kind === "rail"
            ? railGaps(first)
            : [],
      // Rail has no length constraint of its own: its usage paragraph sits in a
      // content column with the photo below it, not beside the attributes. The
      // management sheet reuses Ledger's page 1, so it reuses Ledger's limit.
      warnings: kind === "management" ? managementWarnings(group, applianceRows) : [],
      skus: rows.map((r) => r.id),
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

/**
 * Look up one model. Returns undefined for a model that is not in either table.
 *
 * Aliases are matched after the primary keys, never interleaved: a model that
 * names a sheet must win over one that merely appears on it, so a future group
 * whose alias collides with another sheet's name cannot hijack it.
 */
export function findCatalogueEntry(
  catalogue: CatalogueEntry[],
  model: string,
): CatalogueEntry | undefined {
  const wanted = model.trim().toUpperCase();
  return (
    catalogue.find((e) => e.model.toUpperCase() === wanted) ??
    catalogue.find((e) => e.aliases.some((a) => a.toUpperCase() === wanted))
  );
}
