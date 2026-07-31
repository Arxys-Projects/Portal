// appliance_specs -> DatasheetContent. The management-server adapter.
//
// Takes ALREADY-FETCHED rows and returns content. No Supabase import, no
// react-pdf, no `server-only` — same contract as the other two adapters, so the
// mapping is unit testable without a network.
//
// ONE SHEET PER sheet_group, NOT PER SKU. This is the difference that makes this
// a third adapter rather than a second caller of the Rail one. V250 and V255 are
// one chassis in two CPU/RAM tiers and both carry `sheet_group = 'V250'`; the
// sheet is titled "V250 / V255" and its ordering table has one row per variant.
// Compare the workstations, where SW10 and SW20 are genuinely different boxes
// and each is its own sheet_group and its own sheet.
//
// WHICH TEMPLATE. Ledger, not a third one. The sheet shares page 1, page 3 and
// every styling rule with the NVR sheet and differs in exactly two page-2
// blocks — see ADR 0111 for why that is a variant where Rail (ADR 0109) is not.
//
// MERGING TWO SKUs INTO ONE SPEC VALUE is this adapter's central problem, and it
// is the opposite of the NVR one. from-product-specs.ts picks a canonical row
// and discards the siblings, because three drive capacities of one NVR really do
// share every non-capacity column and the disagreements are transcription
// noise. Here the disagreements are the PRODUCT: the whole reason both SKUs
// exist is that their CPU, cache and RAM differ. So nothing is discarded —
// `variantValue()` states a shared value once and composes a differing one as
// "V250 = … · V255 = …", which is exactly how the source factsheet prints it.
//
// NOTHING IS INVENTED. Two figures on the design mockup — 1,000 Mbit/s of
// throughput and "250 / 250+" cameras managed — are on the mockup only; the
// phase-2 transcription of the real factsheet records no bandwidth block on any
// server sheet and no camera count for either variant. They are read from
// `max_bandwidth_mbps` and the two `cameras_managed_*` columns, and where those
// are null the sheet says so with an em dash. A capacity or throughput claim is
// the last thing a renderer should guess at.

import * as copy from "./copy";
import type { ApplianceSpecRow } from "./from-appliance-specs";
import { LEDGER_USAGE_MAX_CHARS } from "./from-product-specs";
import { clean, isYes, joinParts, specRow, thousands } from "./spec-text";
import { PAGE1_PHOTO_HEIGHT } from "./tokens";
import type {
  CapacityRow,
  DatasheetContent,
  LadderCell,
  OrderableTable,
  SpecRow,
} from "./types";

/** Warranty seal graphics, keyed by term in years. Never index this by anything else. */
const SEAL_BY_TERM: Record<number, string> = {
  3: "/price-book/3_year_warranty-circle.png",
  5: "/price-book/5_year_warranty-circle-2.png",
};

/** Rows on one sheet, in the order their variants should be listed. */
export function sheetRows(
  sheetGroup: string,
  allRows: ApplianceSpecRow[],
): ApplianceSpecRow[] {
  return allRows
    .filter((r) => r.sheet_group === sheetGroup)
    .sort((a, b) => a.product_group.localeCompare(b.product_group));
}

// ── Cameras managed ───────────────────────────────────────────────────────
//
// One fact, four phrasings, all derived from the same pair of bounds so they
// cannot drift apart. The bounds carry the semantics the sheet states: the V250
// is a CEILING ("up to 250") and the V255 is a FLOOR ("250 and above").

/** The ordering-table and capacity-table phrasing: "Up to 250", "250 and above". */
export function camerasPhrase(row: ApplianceSpecRow): string {
  const { cameras_managed_min: min, cameras_managed_max: max } = row;
  if (min != null && max != null) {
    return min === max ? thousands(min) : `${thousands(min)}–${thousands(max)}`;
  }
  if (max != null) return `Up to ${thousands(max)}`;
  if (min != null) return `${thousands(min)} and above`;
  return "—";
}

/** The ladder-cell phrasing, which has a cell 1/5 of the measure wide: "≤ 250 cameras". */
export function camerasLadderPhrase(row: ApplianceSpecRow): string {
  const { cameras_managed_min: min, cameras_managed_max: max } = row;
  if (min != null && max != null && min !== max) {
    return `${thousands(min)}–${thousands(max)} cameras`;
  }
  if (max != null) return `≤ ${thousands(max)} cameras`;
  if (min != null) return `${thousands(min)}+ cameras`;
  return "—";
}

/** The headline-strip phrasing, merged across the sheet's variants: "250 / 250+". */
export function camerasHeadline(rows: ApplianceSpecRow[]): string {
  const parts = rows.map((row) => {
    const { cameras_managed_min: min, cameras_managed_max: max } = row;
    if (max != null) return thousands(max);
    if (min != null) return `${thousands(min)}+`;
    return null;
  });
  // All or nothing. A strip reading "250 / —" invites the reader to take the
  // dash for a real second figure rather than for a value nobody has entered.
  return parts.every((p) => p !== null) ? parts.join(" / ") : "—";
}

// ── Merging the variants ──────────────────────────────────────────────────

/** Words shared by every string, from the left. "" when the first word differs. */
export function commonPrefixWords(values: string[]): string {
  if (values.length === 0) return "";
  const split = values.map((v) => v.split(" "));
  const shared: string[] = [];
  for (let i = 0; i < split[0].length; i++) {
    const word = split[0][i];
    if (!split.every((words) => words[i] === word)) break;
    shared.push(word);
  }
  // A trailing separator is punctuation attaching the prefix to the tail that
  // was just split off it — "… Dedicated for OS/VMS —" must not keep the dash.
  return shared.join(" ").replace(/[\s·,—-]+$/, "");
}

/**
 * One spec value for a sheet that covers several SKUs.
 *
 * A value every variant agrees on is stated once. A value they disagree on is
 * composed per variant, with any shared leading words hoisted out so the row
 * reads "5th Gen Zen5 AMD EPYC · V250 = 4245, 6C/12T · V255 = 4465, 12C/24T"
 * rather than repeating the family name twice.
 *
 * Never picks a winner. On this table a difference between siblings is the
 * product rather than a transcription slip, which is the opposite of the NVR
 * adapter's canonical-row rule and the reason that rule is not reused here.
 */
export function variantValue(
  rows: ApplianceSpecRow[],
  read: (row: ApplianceSpecRow) => string | null,
): string {
  const values = rows.map((row) => ({ group: row.product_group, text: clean(read(row) ?? "") }));
  const present = values.filter((v) => v.text !== "");
  if (present.length === 0) return "";
  if (new Set(present.map((v) => v.text)).size === 1) return present[0].text;

  const shared = commonPrefixWords(present.map((v) => v.text));
  const parts = present.map(({ group, text }) => {
    const tail = shared === "" ? text : text.slice(shared.length).replace(/^[\s·,—-]+/, "");
    // The transcription already labels some columns per variant in place —
    // os_drive_desc ends "… — V250 = 2x 480GB" — so labelling again would print
    // "V250 = V250 = 2x 480GB".
    return new RegExp(`^${group}\\s*=`, "i").test(tail) ? tail : `${group} = ${tail}`;
  });
  return joinParts([shared, ...parts]);
}

// ── Page 1 ────────────────────────────────────────────────────────────────

/**
 * The three compliance pills, derived from the regulatory columns exactly as
 * the NVR sheet derives its own.
 *
 * Not shared with from-product-specs.ts's `compliancePills()` because that one
 * takes a ProductSpecRow, and the two row types are deliberately separate
 * structural types. The RULE is the one worth keeping identical: a pill is a
 * conformity claim, so only marks a row actually names are printed.
 */
export function compliancePills(rows: ApplianceSpecRow[]): string[] {
  const text = rows
    .map((r) => `${r.regulatory_safety ?? ""} ${r.regulatory_emissions ?? ""}`)
    .join(" ");
  const has = (mark: string) => new RegExp(`\\b${mark}\\b`, "i").test(text);
  const pills: string[] = [];
  if (rows.some((r) => !/^\s*$/.test(r.ndaa_text ?? ""))) pills.push("NDAA");
  const regional = ["CE", "UKCA"].filter(has);
  if (regional.length > 0) pills.push(regional.join(" / "));
  const other = ["FCC", "UL", "RCM", "BSMI"].filter(has);
  if (other.length > 0) pills.push(other.join(" / "));
  return pills;
}

/**
 * The 5-cell management & access control ladder: V150, V250, V255, V260, V265.
 *
 * Every management and ACM row in the table, never merged with the 7-cell NVR
 * ladder — the handoff is explicit that these are two ladders. The ACM cells
 * read "Access control / ACM" because no capacity figure applies to them: they
 * are sized by doors, and no door column exists.
 *
 * BOTH of the sheet's own SKUs get the gold bar, where the handoff's mockup bars
 * only the V250. The mockup predates the merged sheet; a page titled
 * "V250 / V255" that marks one of the two as "where you are" reads as though the
 * other belongs to a different sheet.
 */
export function managementLadder(
  allRows: ApplianceSpecRow[],
  activeGroups: string[],
): LadderCell[] {
  const active = new Set(activeGroups);
  return allRows
    .filter((r) => r.family_type === "management" || r.family_type === "acm")
    .sort((a, b) => a.product_group.localeCompare(b.product_group))
    .map((row) => ({
      model: row.product_group,
      detail: row.family_type === "acm" ? "Access control" : "Management",
      capacity: row.family_type === "acm" ? "ACM" : camerasLadderPhrase(row),
      active: active.has(row.product_group),
    }));
}

/**
 * The page-1 attribute bullets.
 *
 * SHARED FACTS ONLY, with one exception. A bullet is a half-column line at 9px;
 * a value that differs between the variants composes into "V250 = 16GB DRAM DDR5
 * (minimum) · V255 = 32GB DRAM DDR5 (minimum)", which is both too long for the
 * block and the wrong place to say it — page 3's spec grid states every
 * per-variant figure in full, which is where the source factsheet states them
 * too. So `variantValue()` is used only where it collapses to a single value,
 * and a differing column simply drops its bullet.
 *
 * The exception is the CPU, where the shared leading words are themselves a true
 * statement about both variants ("5th Generation Zen5 AMD EPYC"). Generalising
 * to what the variants have in common can only ever say less than the data; it
 * can never say something the data does not support.
 */
function attributes(rows: ApplianceSpecRow[]): string[] {
  const shared = (read: (row: ApplianceSpecRow) => string | null): string | null => {
    const values = rows.map((r) => clean(read(r) ?? "")).filter((v) => v !== "");
    if (values.length !== rows.length) return null;
    return new Set(values).size === 1 ? values[0] : null;
  };
  const cpuFamily = commonPrefixWords(
    rows.map((r) => clean(r.cpu_model ?? "")).filter((v) => v !== ""),
  );

  const bullets: (string | null)[] = [
    shared((r) => r.os_edition)?.replace(/^Microsoft\s+/, "").replace(/\bOR\b/g, "or") ?? null,
    // Three words is the floor for a generalisation that still identifies a
    // part: "5th Generation Zen5 AMD EPYC" qualifies, a bare "AMD" would not.
    cpuFamily.split(" ").length >= 3 ? `${cpuFamily} CPU` : null,
    shared((r) => r.db_drive_desc),
    (() => {
      const redundancy = shared((r) => r.os_redundancy);
      return redundancy && !isNegative(redundancy) ? `${redundancy} OS SSDs` : null;
    })(),
    shared((r) => r.network),
    shared((r) => r.hotswap_power),
    rows.every((r) => (r.security_features ?? []).some((f) => /TPM/i.test(f)))
      ? "TCG 2.0 cybersecurity w/ TPM"
      : null,
  ];
  return bullets.filter((b): b is string => b !== null && b !== "");
}

/** A free-text column holding a negative ("No", "NA", "None") rather than a description. */
function isNegative(value: unknown): boolean {
  return /^\s*(no|n|none|na|n\/a|false)\s*$/i.test(String(value ?? ""));
}

// ── Page 2 ────────────────────────────────────────────────────────────────

/**
 * The Management Capacity table: one row per variant, then the two rows that
 * are true of the sheet rather than of a SKU.
 *
 * The Recording column reads "None" throughout and that is the point of the
 * table, not filler — it is the one question a reader coming from an NVR sheet
 * arrives with. It is stated rather than left blank for the same reason ADR 0109
 * omits a block instead of dashing it: a blank invites a guess.
 */
export function capacityRows(rows: ApplianceSpecRow[]): CapacityRow[] {
  const perVariant: CapacityRow[] = rows.map((row) => ({
    role: `${row.product_group} management server`,
    cameras: camerasPhrase(row),
    recording: "None",
    notes:
      row.cameras_managed_max == null && row.cameras_managed_min != null
        ? `For deployments over ${thousands(row.cameras_managed_min)} cameras`
        : "Directory + management only",
  }));
  return [...perVariant, ...copy.MANAGEMENT_CAPACITY_EXTRA_ROWS];
}

/**
 * The orderable-configurations table. Columns and weights differ from the NVR
 * sheet's, which is why the columns are data (see `OrderableTable`).
 *
 * The Configuration cell is composed from the typed columns that actually
 * differ between the variants — cores/threads, RAM and cache. The design mockup
 * writes it as "Base CPU & RAM, 2x 480GB SSDs", and the SSD capacity was left
 * out on purpose: it exists only inside the free text of `os_drive_desc`, and
 * regex-mining a customer-facing ordering table out of a prose column is exactly
 * what this pipeline avoids elsewhere. Both SSD capacities are stated in full on
 * page 3's "VMS / OS drive" row.
 */
export function orderableTable(rows: ApplianceSpecRow[]): OrderableTable {
  return {
    columns: [
      { header: "Part Number", flex: 1.15, emphasis: "partNumber" },
      { header: "Model", flex: 0.6, emphasis: "strong" },
      { header: "Configuration", flex: 2, emphasis: undefined },
      { header: "Cameras Managed", flex: 1.05, emphasis: "strong" },
    ],
    rows: rows.map((row) => [
      row.id,
      row.product_group,
      joinParts([row.cores_threads, row.ram_spec, row.cpu_cache], ", ") || "—",
      camerasPhrase(row),
    ]),
    caption: copy.managementOrderableCaption(rows.length),
  };
}

// ── Page 3 ────────────────────────────────────────────────────────────────

function hardwareRows(rows: ApplianceSpecRow[]): SpecRow[] {
  const v = (read: (row: ApplianceSpecRow) => string | null) => variantValue(rows, read);

  // The RAID prose on these rows already names CacheVault, so appending the
  // battery flag the way the NVR adapter does would say it twice.
  const raidProse = v((r) => r.raid_support);
  const raid = joinParts([
    raidProse,
    rows.some((r) => isYes(r.battery_raid)) && !/cachevault/i.test(raidProse)
      ? "CacheVault battery protection"
      : null,
  ]);

  // `storage_summary` is literally "NA" on these rows — the sheet's own way of
  // saying there is no recording volume. Printed raw it reads as a missing
  // value rather than as the deliberate statement it is.
  const storageRaw = v((r) => r.storage_summary);
  const storage = isNegative(storageRaw)
    ? "Not applicable — no video recording volume"
    : storageRaw;

  const sfp = v((r) => (isNegative(r.sfp_addon) ? null : r.sfp_addon));

  return [
    ...specRow<SpecRow>(
      "CPU",
      variantValue(rows, (r) =>
        joinParts(
          [
            r.cpu_model,
            r.cores_threads,
            joinParts([r.cpu_base_ghz, r.cpu_turbo_ghz], "/"),
            r.cpu_cache,
          ],
          ", ",
        ),
      ),
    ),
    ...specRow<SpecRow>("RAM", v((r) => r.ram_spec)),
    ...specRow<SpecRow>("Operating system", v((r) => r.os_edition)?.replace(/\bOR\b/g, "or")),
    ...specRow<SpecRow>("VMS / OS drive", v((r) => r.os_drive_desc)),
    ...specRow<SpecRow>("Database drive", v((r) => r.db_drive_desc)),
    ...specRow<SpecRow>("Storage capacity", storage),
    ...specRow<SpecRow>("RAID", raid),
    ...specRow<SpecRow>("Network", joinParts([v((r) => r.network), sfp])),
    ...specRow<SpecRow>("Display", v((r) => r.display_ports)),
    ...specRow<SpecRow>(
      "Encryption",
      variantValue(rows, (r) => (r.security_features ?? []).join(" · ")),
    ),
    ...specRow<SpecRow>("Management", v((r) => r.remote_mgmt)),
  ];
}

function environmentalRows(rows: ApplianceSpecRow[]): SpecRow[] {
  const v = (read: (row: ApplianceSpecRow) => string | null) => variantValue(rows, read);
  return [
    ...specRow<SpecRow>("Form factor", v((r) => r.form_factor)),
    // power_dc_input is read here and not by the NVR adapter because this is the
    // sheet that prints a DC line alongside the AC one.
    ...specRow<SpecRow>(
      "Power",
      joinParts([
        v((r) => r.power_wattage),
        v((r) => r.power_ac_input),
        v((r) => r.power_dc_input),
      ]),
    ),
    ...specRow<SpecRow>("Max draw", v((r) => r.power_max_consumption)),
    ...specRow<SpecRow>("Cooling", v((r) => r.cooling)),
    ...specRow<SpecRow>(
      "Dimensions",
      joinParts([v((r) => r.dimensions_mm), v((r) => r.dimensions_in)]),
    ),
    ...specRow<SpecRow>("Weight", v((r) => r.shipping_weight)),
    ...specRow<SpecRow>("Operating temp", v((r) => r.operating_temp)),
    ...specRow<SpecRow>("Storage temp", v((r) => r.storage_temp)),
    ...specRow<SpecRow>("Humidity", v((r) => r.humidity)),
    ...specRow<SpecRow>(
      "Safety",
      joinParts([v((r) => r.regulatory_safety), v((r) => r.regulatory_emissions)], ", "),
    ),
    ...specRow<SpecRow>("Trade", v((r) => r.ndaa_text)),
  ];
}

// ── The build ─────────────────────────────────────────────────────────────

/**
 * Build the management sheet for one `sheet_group`.
 *
 * `allRows` is every appliance_specs row, not just the group's — the 5-cell
 * ladder needs the ACM rows to show where these two sit.
 *
 * Throws when the group has no rows, rather than rendering a sheet of dashes.
 */
export function buildManagementContent(
  sheetGroup: string,
  allRows: ApplianceSpecRow[],
): DatasheetContent {
  const rows = sheetRows(sheetGroup, allRows);
  if (rows.length === 0) {
    const groups = [...new Set(allRows.map((r) => r.sheet_group))].sort().join(", ");
    throw new Error(
      `no appliance_specs rows for sheet group ${sheetGroup} (available: ${groups || "none"})`,
    );
  }

  const first = rows[0];
  const model = rows.map((r) => r.product_group).join(" / ");
  const bandwidth = rows.map((r) => r.max_bandwidth_mbps).find((b) => b != null) ?? null;
  const v = (read: (row: ApplianceSpecRow) => string | null) => variantValue(rows, read);

  // Both variants are one chassis, so the bays and the rack height are the same
  // fact stated twice; variantValue() collapses them and would compose them if
  // a group ever disagreed, which is the signal that something is miskeyed.
  const bays = v((r) => (r.drive_bays == null ? null : String(r.drive_bays)));
  const rackUnits = v((r) => r.rack_units);

  const years = Number(first.warranty_years);
  const warranty = Number.isFinite(years) && years > 0
    ? {
        years,
        title: copy.warrantyTitle(years),
        body: copy.warrantyBody(years, v((r) => r.warranty_terms) || null),
        sealPath: SEAL_BY_TERM[years] ?? null,
      }
    : null;

  return {
    model,
    descriptor: joinParts([
      bays ? `${bays} Bay` : null,
      rackUnits ? `${rackUnits} Rack` : null,
      "Management / Directory Server",
    ]),
    runningMark: copy.RUNNING_MARK,
    productClass: copy.MANAGEMENT_PRODUCT_CLASS,
    compliance: compliancePills(rows),

    // Max Storage and Max Camera Streams are the two NVR labels this sheet
    // swaps out — a management server has neither.
    headline: [
      { key: "Throughput", value: bandwidth != null ? `${thousands(bandwidth)} Mbit/s` : "—" },
      { key: "Cameras Managed", value: camerasHeadline(rows) },
      { key: "Drive Bays", value: bays || "—" },
      { key: "Form Factor", value: rackUnits ? `${rackUnits} Rack` : "—" },
    ],

    // "Where the V250 / V255 SIT", plural, because the sheet covers both. The
    // NVR heading is always singular and hardcodes "sits"; here the verb has to
    // agree with however many variants the group holds.
    ladderHeading: `Where the ${model} ${rows.length > 1 ? "sit" : "sits"} ${
      copy.MANAGEMENT_LADDER_HEADING_SUFFIX
    }`,
    ladderCaption: copy.MANAGEMENT_LADDER_CAPTION,
    ladder: managementLadder(allRows, rows.map((r) => r.product_group)),

    usageHeading: copy.MANAGEMENT_USAGE_HEADING,
    usage: v((r) => r.usage_paragraph),
    attributes: attributes(rows),

    productPhoto: {
      path: first.product_photo_path || null,
      placeholder: copy.managementPhotoPlaceholder(model, rackUnits || null),
    },
    // "Management / Directory Server" does not fit beside the pills, so the
    // descriptor wraps and the frame pays for the second line.
    productPhotoHeight: PAGE1_PHOTO_HEIGHT.twoLineDescriptor,

    warranty,

    featuresHeading: copy.MANAGEMENT_FEATURES_HEADING,
    features: copy.MANAGEMENT_FEATURES,
    vmsValidated: copy.VMS_VALIDATED,

    performance: {
      kind: "capacity",
      heading: copy.MANAGEMENT_CAPACITY_HEADING,
      // "V250 ≤ 250 cameras · V255 250+ · 1,000 Mbit/s" — and each part drops
      // itself rather than printing a dash, because this line sits in the
      // margin above the table where a lone "—" reads as a rendering fault.
      ceilingLine: joinParts([
        ...rows
          .filter((r) => r.cameras_managed_min != null || r.cameras_managed_max != null)
          .map((r) => `${r.product_group} ${camerasLadderPhrase(r).replace(/ cameras$/, "")}`),
        bandwidth != null ? `${thousands(bandwidth)} Mbit/s` : null,
      ]),
      rows: capacityRows(rows),
      caption: copy.MANAGEMENT_CAPACITY_CAPTION,
    },

    orderable: orderableTable(rows),

    hardware: hardwareRows(rows),
    environmental: environmentalRows(rows),

    rearIo: {
      path: first.rear_io_photo_path || null,
      placeholder: copy.managementRearPlaceholder(model),
    },
    generalInfo: copy.MANAGEMENT_GENERAL_INFO,

    footerAddress: copy.FOOTER_ADDRESS,
    footerNote: copy.FOOTER_NOTE,
    revisionLine: copy.revisionLine(first.revision_date),
  };
}

/**
 * The visible gaps in a management sheet. Same intent as `ledgerGaps()`: only
 * things a reader would SEE missing, surfaced in the picker rather than used to
 * refuse a render.
 *
 * The cross-variant disagreements are here for a different reason from the rest.
 * V250 and V255 are one chassis, so a column that differs between them on
 * anything but CPU, cache, RAM and the OS drive is a data-entry slip rather than
 * a product difference — and it will silently render as "V250 = … · V255 = …",
 * which looks deliberate. Naming it is the only way anyone finds out.
 */
export function managementGaps(sheetGroup: string, allRows: ApplianceSpecRow[]): string[] {
  const rows = sheetRows(sheetGroup, allRows);
  if (rows.length === 0) return ["no spec rows at all"];
  const gaps: string[] = [];

  const noCapacity = rows.filter(
    (r) => r.cameras_managed_min == null && r.cameras_managed_max == null,
  );
  if (noCapacity.length > 0) {
    gaps.push(
      `cameras managed on ${noCapacity.map((r) => r.product_group).join(" and ")} — ` +
        "the headline strip, the ladder and both tables show an em dash",
    );
  }
  if (rows.every((r) => r.max_bandwidth_mbps == null)) {
    gaps.push("throughput — the headline strip shows an em dash");
  }
  if (rows.some((r) => !r.usage_paragraph)) gaps.push("recommended-usage paragraph");
  if (rows.every((r) => Number(r.warranty_years) > 0) === false) {
    gaps.push("warranty term — the whole band is omitted");
  }
  if (compliancePills(rows).length === 0) gaps.push("regulatory marks — no compliance pills");
  if (!rows[0].product_photo_path) gaps.push("front photo");
  if (!rows[0].rear_io_photo_path) gaps.push("rear I/O photo");

  // Columns that are a property of the chassis, so the variants must agree.
  const CHASSIS_COLUMNS: [string, (row: ApplianceSpecRow) => unknown][] = [
    ["RAID level", (r) => r.raid_level_display],
    ["network", (r) => r.network],
    ["form factor", (r) => r.form_factor],
    ["drive bays", (r) => r.drive_bays],
    ["cooling", (r) => r.cooling],
    ["dimensions", (r) => r.dimensions_mm],
    ["warranty term", (r) => r.warranty_years],
    ["product photo", (r) => r.product_photo_path],
  ];
  const disagreements = CHASSIS_COLUMNS.filter(
    ([, read]) => new Set(rows.map((r) => String(read(r) ?? ""))).size > 1,
  ).map(([label]) => label);
  if (disagreements.length > 0) {
    gaps.push(
      `${disagreements.join(", ")} ${disagreements.length === 1 ? "differs" : "differ"} between ` +
        `${rows.map((r) => r.product_group).join(" and ")}, which are one chassis — ` +
        "the sheet will print both values as though the difference were deliberate",
    );
  }

  const env = environmentalRows(rows).length;
  if (env < 8) gaps.push(`environmental specs — only ${env} of 11 rows`);
  return gaps;
}

/**
 * Problems that make the sheet render WRONG rather than merely incomplete.
 *
 * The page-1 layout is Ledger's, unchanged, so the measured spill point is
 * Ledger's too — `LEDGER_USAGE_MAX_CHARS`, binary-searched against the real
 * template. Re-using the constant rather than copying the number is the point:
 * the day page 1 changes, both sheets move together.
 */
export function managementWarnings(sheetGroup: string, allRows: ApplianceSpecRow[]): string[] {
  const rows = sheetRows(sheetGroup, allRows);
  if (rows.length === 0) return [];
  const usage = variantValue(rows, (r) => r.usage_paragraph);
  if (usage.length > LEDGER_USAGE_MAX_CHARS) {
    return [
      `The recommended-usage paragraph is ${usage.length} characters. Page 1 holds ` +
        `${LEDGER_USAGE_MAX_CHARS}, so the sheet currently spills onto a fourth page — ` +
        `shorten it by at least ${usage.length - LEDGER_USAGE_MAX_CHARS} characters in Appliance Specs. ` +
        "Note that variants with different paragraphs are composed into one, so both count.",
    ];
  }
  return [];
}
