// product_specs -> DatasheetContent. The Ledger (NVR) adapter.
//
// Takes ALREADY-FETCHED rows and returns content. No Supabase import, no
// react-pdf, no `server-only` — so the mapping is unit testable without a
// network, and so importing it from a test does not drag the renderer in.
//
// ONE SHEET PER MODEL, NOT PER SKU. product_specs holds 21 rows: 7 NVR models ×
// 3 drive capacities. The three SKUs of a model are not three datasheets — they
// ARE the rows of that sheet's orderable-configurations table. Everything else
// on the sheet is the model's.
//
// THE CANONICAL ROW. The three SKUs of a model disagree on a handful of columns
// where the same fact was transcribed twice in different words — V400-128 says
// "4 × 10GbE + 1 IPMI" where -160 and -192 say "4 × 10GbE RJ45 ports + 1 IPMI".
// Something has to pick. This adapter takes the HIGHEST-CAPACITY SKU as the
// model's spec row, because the sheet's headline storage figure and its page-2
// ceiling line are both the model's maximum, so the top SKU is the configuration
// the sheet is describing. The rule is deterministic, so a sheet does not change
// shape because someone edited a different SKU.
//
// PLUS A PREFIX EXTENSION, because the canonical row is not always the fullest.
// `sfp_addon` is the counter-example, and it runs the other way in all six
// models that have it: the LOWEST-capacity row carries "Optional - 2x 10Gb SFP+
// or 2x 25Gb SFP28 upgrade available" and the higher two are truncated to a bare
// "Optional", which renders as a dangling "· Optional" on the spec row. So when
// the canonical row's value is a strict PREFIX of a sibling SKU's, the longer one
// wins. That only ever extends a value with more of the same sentence — it can
// never substitute a contradicting one, which is what a "longest wins" rule would
// risk. Everything else stays with the canonical row.
//
// WHAT IS DERIVED AND WHAT IS READ. Two figures on this sheet are computed
// rather than stored, and both are published rules rather than guesses:
//   - the 8MP stream count, at round(4MP baseline × 0.55), because 8MP carries
//     double the pixels per frame. product_specs has NO camera_matrix column —
//     unlike appliance_specs, which does — so the VSR table cannot be read.
//     `max_cameras_h265` IS the 4MP baseline.
//   - usable capacity, via the shared usableCapacityTb() from capacity-utils,
//     never a local RAID table. The Calculator and both PDFs already size
//     storage with that function; a second copy here would be a second answer.

import { usableCapacityTb } from "../capacity-utils";
import * as copy from "./copy";
import { clean, isYes, joinParts, specRow, thousands } from "./spec-text";
import type {
  DatasheetContent,
  LadderCell,
  OrderableRow,
  SpecRow,
  VsrRow,
} from "./types";

/**
 * The product_specs columns this adapter reads. Deliberately a narrow structural
 * type rather than a generated database type: it documents the read surface, and
 * a column disappearing becomes a compile error here rather than an `undefined`
 * interpolated into a customer-facing sentence.
 */
export type ProductSpecRow = {
  id: string;
  model_name: string | null;
  storage_raw_tb: number | null;
  drive_bays: number | null;
  rack_units: string | null;
  hdd_count: number | null;
  hdd_mtbf: string | null;
  max_bandwidth_mbps: number | null;
  max_cameras_h265: number | null;
  raid_level_display: string | null;
  raid_level_alt_display: string | null;
  raid_support: string | null;
  battery_raid: string | null;
  cpu_model_full: string | null;
  cpu_turbo_ghz: string | null;
  cores_threads: string | null;
  cpu_cache: string | null;
  mem_bandwidth: string | null;
  avx_512: string | null;
  chiplet_arch: string | null;
  infinity_guard: string | null;
  hotswap_power: string | null;
  ram_spec: string | null;
  os_edition: string | null;
  os_ssd_type: string | null;
  os_redundancy: string | null;
  os_drive_desc: string | null;
  network: string | null;
  gbe_10_ports: number | null;
  sfp_addon: string | null;
  display_ports: string | null;
  remote_mgmt: string | null;
  security_features: string[] | null;
  form_factor: string | null;
  power_wattage: string | null;
  power_redundancy: string | null;
  power_ac_input: string | null;
  power_max_consumption: string | null;
  cooling: string | null;
  dimensions_mm: string | null;
  dimensions_in: string | null;
  shipping_weight: string | null;
  warranty_years: number | string | null;
  warranty_terms: string | null;
  operating_temp: string | null;
  storage_temp: string | null;
  humidity: string | null;
  regulatory_safety: string | null;
  regulatory_emissions: string | null;
  ndaa_text: string | null;
  revision_date: string | null;
  product_photo_path: string | null;
  rear_io_photo_path: string | null;
  usage_paragraph: string | null;
};

/** Part numbers are `VX5-{MODEL}-{RAW_TB}`, so the model is the middle segment. */
export function modelOf(row: Pick<ProductSpecRow, "id">): string {
  return row.id.split("-")[1] ?? row.id;
}

/** Group rows into their models, each sorted by raw capacity ascending. */
export function groupByModel(rows: ProductSpecRow[]): Map<string, ProductSpecRow[]> {
  const groups = new Map<string, ProductSpecRow[]>();
  for (const row of rows) {
    const model = modelOf(row);
    const list = groups.get(model);
    if (list) list.push(row);
    else groups.set(model, [row]);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => (a.storage_raw_tb ?? 0) - (b.storage_raw_tb ?? 0));
  }
  return groups;
}

/**
 * The model's spec row: the highest-capacity SKU, with any text column that a
 * sibling SKU states more fully extended to that fuller wording.
 *
 * "More fully" means strictly prefix-extended, after trimming — `"Optional"` is
 * replaced by `"Optional - 2x 10Gb SFP+ ... available"`, but `"4 × 10GbE + 1
 * IPMI"` and `"4 × 10GbE RJ45 ports + 1 IPMI"` are left alone because neither
 * prefixes the other. Both of those are correct; picking between two correct
 * wordings is what the canonical-row rule is for. Extending a truncation is
 * different, and safe.
 *
 * `rows` must be capacity-ascending, as groupByModel() returns them.
 */
export function canonicalRow(rows: ProductSpecRow[]): ProductSpecRow {
  const top = rows[rows.length - 1];
  if (rows.length === 1) return top;
  const merged: ProductSpecRow = { ...top };
  for (const key of Object.keys(top) as (keyof ProductSpecRow)[]) {
    // Capacity-bearing and identity columns are per-SKU facts, never merged.
    if (key === "id" || key === "model_name" || key === "storage_raw_tb") continue;
    const own = top[key];
    if (typeof own !== "string") continue;
    const trimmed = own.trim();
    let best = trimmed;
    for (const sibling of rows) {
      const other = sibling[key];
      if (typeof other !== "string") continue;
      const otherTrimmed = other.trim();
      // Strict prefix extension only, case-insensitively, so a longer sibling
      // that merely re-words the value is ignored.
      if (
        otherTrimmed.length > best.length &&
        otherTrimmed.toLowerCase().startsWith(trimmed.toLowerCase())
      ) {
        best = otherTrimmed;
      }
    }
    if (best !== trimmed) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (merged as any)[key] = best;
    }
  }
  return merged;
}

/** The 8MP stream count. 8MP carries double the pixels per frame, so ~45% fewer. */
export const streamsAt8Mp = (baseline: number): number => Math.round(baseline * 0.55);

/** "60" -> "RAID 60". The level is a template variable, not a constant. */
function raidLabel(level: string | null): string {
  const trimmed = (level ?? "").trim();
  if (trimmed === "") return "RAID";
  // 'JBOD' and 'NA' are levels the column already holds; neither takes the word
  // "RAID" in front of it.
  if (/^[a-z]/i.test(trimmed)) return trimmed.toUpperCase();
  return `RAID ${trimmed}`;
}

/**
 * The three compliance pills on the hero row.
 *
 * DERIVED from `regulatory_safety` and `ndaa_text`, not authored, because a pill
 * is a conformity claim: an authored "CE / UKCA" printed on a model whose row
 * does not list UKCA would be a false statement of conformity. Only marks the
 * row actually names appear, so a row with no regulatory columns (the V100
 * today) gets no pills rather than borrowed ones.
 *
 * The GROUPING is the handoff's — regional conformity marks in one pill, the
 * remaining safety marks in another — because three pills is what the hero row
 * holds without the labels breaking mid-string.
 */
export function compliancePills(row: ProductSpecRow): string[] {
  const safety = `${row.regulatory_safety ?? ""} ${row.regulatory_emissions ?? ""}`;
  const has = (mark: string) => new RegExp(`\\b${mark}\\b`, "i").test(safety);
  const pills: string[] = [];
  if (!/^\s*$/.test(row.ndaa_text ?? "")) pills.push("NDAA");
  const regional = ["CE", "UKCA"].filter(has);
  if (regional.length > 0) pills.push(regional.join(" / "));
  const other = ["FCC", "UL", "RCM", "BSMI"].filter(has);
  if (other.length > 0) pills.push(other.join(" / "));
  return pills;
}

/**
 * The 7-cell NVR ladder, ordered by drive bays.
 *
 * V250 is absent because it is a management server rather than an NVR, and V900
 * because it is end of life — neither has product_specs rows, so ordering the
 * models present is enough and no exclusion list is needed. Do not merge this
 * with the 5-cell management/ACM ladder.
 */
export function nvrLadder(
  groups: Map<string, ProductSpecRow[]>,
  activeModel: string,
): LadderCell[] {
  return [...groups.entries()]
    .map(([model, rows]) => ({ model, row: rows[rows.length - 1] }))
    .sort((a, b) => (a.row.drive_bays ?? 0) - (b.row.drive_bays ?? 0))
    .map(({ model, row }) => ({
      model,
      detail: joinParts([
        row.drive_bays ? `${row.drive_bays} bay` : null,
        row.rack_units,
      ]),
      capacity: row.max_cameras_h265 == null ? "—" : String(row.max_cameras_h265),
      active: model === activeModel,
    }));
}

/**
 * The orderable-configurations rows — the piece that resolves "three SKUs per
 * NVR".
 *
 * Built from the REAL SKU rows, never synthesized from an assumed 16/20/24 TB
 * drive ladder: the drive capacity is `storage_raw_tb / hdd_count`, so a model
 * that ever ships a different capacity mix states what it actually ships.
 */
export function orderableRows(rows: ProductSpecRow[]): OrderableRow[] {
  return rows.map((row) => {
    const raw = row.storage_raw_tb;
    const drives = row.hdd_count ?? row.drive_bays;
    const perDrive = raw != null && drives ? raw / drives : null;
    const usable = usableCapacityTb(raw, row.hdd_count, row.raid_level_display);
    return {
      partNumber: row.id,
      driveConfig:
        drives && perDrive != null
          ? `${drives} × ${Math.round(perDrive)}TB enterprise HDD`
          : "—",
      raw: raw != null ? `${thousands(raw)} TB` : "—",
      usable: usable != null ? `${thousands(Math.round(usable))} TB` : "—",
    };
  });
}

/** The two VSR rows. H.265 only — the handoff is explicit that Ledger does not split codecs. */
export function vsrRows(baseline: number | null): VsrRow[] {
  if (baseline == null) return [];
  return [
    {
      resolution: "4MP · 2560×1440 (16:9)",
      codec: "H.265-20",
      streams: baseline,
      comparison: "Baseline VSR",
    },
    {
      resolution: "8MP · 3840×2160",
      codec: "H.265-20",
      streams: streamsAt8Mp(baseline),
      comparison: "−45% — 2× the pixels per frame",
    },
  ];
}

/**
 * The warranty band, or null when the row has no term.
 *
 * THE SEAL IS CHOSEN BY TERM. The two graphics are adjacent files with
 * near-identical names, and a 3-year sheet pointed at the 5-year mark prints a
 * false warranty claim. Derived from `warranty_years`; a term with no graphic
 * gets the held circle rather than the nearest available seal.
 */
export function warrantyBlock(row: ProductSpecRow): DatasheetContent["warranty"] {
  const years = Number(row.warranty_years);
  if (!Number.isFinite(years) || years <= 0) return null;
  return {
    years,
    title: copy.warrantyTitle(years),
    body: copy.warrantyBody(years, row.warranty_terms ? clean(row.warranty_terms) : null),
    sealPath: SEAL_BY_TERM[years] ?? null,
  };
}

/** Warranty seal graphics, keyed by term in years. Never index this by anything else. */
const SEAL_BY_TERM: Record<number, string> = {
  3: "/price-book/3_year_warranty-circle.png",
  5: "/price-book/5_year_warranty-circle-2.png",
};

/** The 8 page-1 attribute bullets, all derived. An unavailable column drops its bullet. */
function attributes(row: ProductSpecRow): string[] {
  const bullets: (string | null)[] = [
    osText(row.os_edition)?.replace(/^Microsoft\s+/, "") ?? null,
    row.cpu_model_full ? `${clean(row.cpu_model_full).split(/\s+\d+(?:\.\d+)?Ghz/i)[0]} CPU` : null,
    row.ram_spec ? `${clean(row.ram_spec)} RAM` : null,
    // "NO" is a real value in this column (the V100 has a single OS NVMe), so a
    // negative reads as "no redundancy to claim" rather than as a description.
    isNegative(row.os_redundancy) ? null : row.os_redundancy ? `${clean(row.os_redundancy)} OS SSDs` : null,
    row.raid_level_display ? `${raidLabel(row.raid_level_display)} data protection` : null,
    row.gbe_10_ports ? `${PORT_WORD[row.gbe_10_ports] ?? `${row.gbe_10_ports}×`} 10Gb Ethernet` : null,
    isYes(row.hotswap_power) ? "N+1 hot-swap power & cooling" : null,
    hasTpm(row) ? "TCG 2.0 cybersecurity w/ TPM" : null,
  ];
  return bullets.filter((b): b is string => b !== null && b !== "");
}

const PORT_WORD: Record<number, string> = { 1: "Single", 2: "Dual", 4: "Quad" };

/**
 * The OS column was transcribed with a shouting conjunction — "Windows Server
 * 2022 OR 2025 LTSC" — which reads as emphasis on a customer-facing sheet where
 * none is meant. Lowercasing a standalone OR changes no meaning, and doing it
 * here rather than in the column keeps the admin form showing what the source
 * factsheet says.
 */
function osText(value: string | null): string | null {
  return value === null ? null : clean(value).replace(/\bOR\b/g, "or");
}

/** A free-text column holding a negative ("No", "NA", "None") rather than a description. */
function isNegative(value: unknown): boolean {
  return /^\s*(no|n|none|na|n\/a|false)\s*$/i.test(String(value ?? ""));
}

/** Only claim TPM when the row's own security_features list names it. */
function hasTpm(row: ProductSpecRow): boolean {
  return (row.security_features ?? []).some((f) => /TPM/i.test(f));
}

function hardwareRows(row: ProductSpecRow, maxRawTb: number | null): SpecRow[] {
  const acceleration = joinParts([
    isYes(row.chiplet_arch) ? "Chiplet microarchitecture" : null,
    isYes(row.infinity_guard) ? "AMD Infinity Architecture & Guard" : null,
    isYes(row.avx_512) ? "Native 512-bit data paths (AVX-512)" : null,
    row.mem_bandwidth ? `${clean(row.mem_bandwidth)} memory bandwidth` : null,
  ]);
  // os_redundancy is "NO" on the V100 (one OS NVMe, no mirror), which would
  // otherwise compose into "1x NVMe, NO, dedicated for OS/VMS". A negative means
  // there is no redundancy to state, not that "NO" is part of the description.
  const osDrive =
    row.os_drive_desc ??
    joinParts(
      [row.os_ssd_type, isNegative(row.os_redundancy) ? null : row.os_redundancy, "dedicated for OS/VMS"],
      ", ",
    );
  const hdd = joinParts(
    [
      row.hdd_count ? `Up to ${row.hdd_count}× enterprise class 7200 RPM 3.5" HDD` : null,
      row.hdd_mtbf ? `${clean(row.hdd_mtbf)} hour MTBF` : null,
      "certified 24/7, tool-less hot-swap",
    ],
    ", ",
  );
  const raid = joinParts(
    [row.raid_support, isYes(row.battery_raid) ? "CacheVault battery protection" : null],
    " · ",
  );
  // sfp_addon is "No" on the V100/V200 rows, which must not print as an upgrade.
  // A bare "Optional" is dropped too: canonicalRow() recovers the full "Optional
  // - 2x 10Gb SFP+ ..." sentence when a sibling SKU has it, so a value still that
  // short after merging says nothing a reader can act on and would render as a
  // dangling "· Optional".
  const sfp = isNegative(row.sfp_addon) || /^optional\.?$/i.test((row.sfp_addon ?? "").trim())
    ? null
    : row.sfp_addon;
  const network = joinParts([row.network, sfp], " · ");

  return [
    ...specRow<SpecRow>(
      "CPU",
      joinParts(
        [row.cpu_model_full, row.cores_threads, row.cpu_turbo_ghz, row.cpu_cache ? `${clean(row.cpu_cache)} cache` : null],
        ", ",
      ),
    ),
    ...specRow<SpecRow>("Acceleration", acceleration),
    ...specRow<SpecRow>("RAM", row.ram_spec),
    ...specRow<SpecRow>("Operating system", osText(row.os_edition)),
    ...specRow<SpecRow>("VMS / OS drive", osDrive),
    ...specRow<SpecRow>("Hard drives", row.hdd_count ? hdd : null),
    ...specRow<SpecRow>("Storage capacity", maxRawTb != null ? `Up to ${thousands(maxRawTb)}TB raw capacity` : null),
    ...specRow<SpecRow>("RAID", raid),
    ...specRow<SpecRow>("Network", network),
    ...specRow<SpecRow>("Display", row.display_ports),
    ...specRow<SpecRow>("Encryption", row.security_features),
    ...specRow<SpecRow>("Management", row.remote_mgmt),
  ];
}

function environmentalRows(row: ProductSpecRow): SpecRow[] {
  return [
    ...specRow<SpecRow>("Form factor", row.form_factor),
    ...specRow<SpecRow>("Power", joinParts([row.power_wattage, row.power_redundancy, row.power_ac_input])),
    ...specRow<SpecRow>("Max draw", row.power_max_consumption),
    ...specRow<SpecRow>("Cooling", row.cooling),
    ...specRow<SpecRow>("Dimensions", joinParts([row.dimensions_mm, row.dimensions_in])),
    ...specRow<SpecRow>("Weight", row.shipping_weight),
    ...specRow<SpecRow>("Operating temp", row.operating_temp),
    ...specRow<SpecRow>("Storage temp", row.storage_temp),
    ...specRow<SpecRow>("Humidity", row.humidity),
    ...specRow<SpecRow>("Safety", joinParts([row.regulatory_safety, row.regulatory_emissions], ", ")),
    ...specRow<SpecRow>("Trade", row.ndaa_text),
  ];
}

/**
 * Build the Ledger content for one NVR model.
 *
 * `allRows` is every product_specs row, not just the model's — the model ladder
 * needs the other six models' bays and stream counts to show where this one
 * sits. Keeping the fetch outside means the caller makes one query and this
 * stays testable with a literal.
 *
 * Throws when the model has no rows, rather than rendering a sheet of dashes.
 */
export function buildLedgerContent(model: string, allRows: ProductSpecRow[]): DatasheetContent {
  const groups = groupByModel(allRows);
  const rows = groups.get(model);
  if (!rows || rows.length === 0) {
    throw new Error(
      `no product_specs rows for model ${model} (available: ${[...groups.keys()].sort().join(", ") || "none"})`,
    );
  }

  // Highest capacity, prefix-extended from siblings; see the header note.
  const spec = canonicalRow(rows);
  const maxRawTb = spec.storage_raw_tb;
  const maxUsableTb = usableCapacityTb(maxRawTb, spec.hdd_count, spec.raid_level_display);
  const bandwidth = spec.max_bandwidth_mbps;
  const raid = raidLabel(spec.raid_level_display);

  return {
    model,
    // Literal 1 of 3 in the handoff's audit, and it is fully derived here:
    // "36 Bay · 4U Rack · V5 Video Server".
    descriptor: joinParts([
      spec.drive_bays ? `${spec.drive_bays} Bay` : null,
      spec.rack_units ? `${spec.rack_units} Rack` : null,
      "V5 Video Server",
    ]),
    runningMark: copy.RUNNING_MARK,
    productClass: copy.LEDGER_PRODUCT_CLASS,
    compliance: compliancePills(spec),

    headline: [
      { key: "Throughput", value: bandwidth != null ? `${thousands(bandwidth)} Mbit/s` : "—" },
      { key: "Max Storage", value: maxRawTb != null ? `${thousands(maxRawTb)} TB` : "—" },
      { key: "Drive Bays", value: spec.drive_bays != null ? String(spec.drive_bays) : "—" },
      {
        key: "Max Camera Streams",
        value: spec.max_cameras_h265 != null ? thousands(spec.max_cameras_h265) : "—",
      },
    ],

    ladderHeading: `Where the ${model} ${copy.LEDGER_LADDER_HEADING_SUFFIX}`,
    ladderCaption: copy.LEDGER_LADDER_CAPTION,
    ladder: nvrLadder(groups, model),

    usageHeading: copy.LEDGER_USAGE_HEADING,
    // DB. Blank on the V100 and V200 rows today, which renders an empty column
    // rather than borrowing another model's prose.
    usage: spec.usage_paragraph ? clean(spec.usage_paragraph) : "",
    attributes: attributes(spec),

    productPhoto: {
      path: spec.product_photo_path || null,
      placeholder: copy.ledgerPhotoPlaceholder(model, spec.rack_units),
    },

    warranty: warrantyBlock(spec),

    featuresHeading: copy.LEDGER_FEATURES_HEADING,
    features: copy.LEDGER_FEATURES,
    vmsValidated: copy.VMS_VALIDATED,

    // Literal 2 of 3, also fully derived: "4,000 Mbit/s · 864 TB raw · 720 TB usable".
    ceilingLine: joinParts([
      bandwidth != null ? `${thousands(bandwidth)} Mbit/s` : null,
      maxRawTb != null ? `${thousands(maxRawTb)} TB raw` : null,
      maxUsableTb != null ? `${thousands(Math.round(maxUsableTb))} TB usable` : null,
    ]),
    vsrRows: vsrRows(spec.max_cameras_h265),
    vsrParameters: copy.LEDGER_VSR_PARAMETERS,
    vsrCaption: copy.LEDGER_VSR_CAPTION,

    // Literal 3 of 3 — appears in the column header AND the caption.
    raidLevel: raid,
    orderableRows: orderableRows(rows),
    orderableCaption: copy.ledgerOrderableCaption(
      raid,
      spec.raid_level_alt_display ? raidLabel(spec.raid_level_alt_display) : null,
    ),

    hardware: hardwareRows(spec, maxRawTb),
    environmental: environmentalRows(spec),

    rearIo: {
      path: spec.rear_io_photo_path || null,
      placeholder: copy.ledgerRearPlaceholder(model),
    },
    generalInfo: copy.LEDGER_GENERAL_INFO,

    footerAddress: copy.FOOTER_ADDRESS,
    footerNote: copy.FOOTER_NOTE,
    revisionLine: copy.revisionLine(spec.revision_date),
  };
}

/**
 * The longest `usage_paragraph` page 1 holds before the footer is pushed onto a
 * fourth page.
 *
 * MEASURED, not estimated: rendered against the real template and binary-searched
 * to the exact spill point, with the product photo at ADR 0105's 240px. Page 1's
 * only flexible child is the feature grid, and it sits at its content minimum, so
 * it absorbs nothing — the usage paragraph and the key attributes sit side by
 * side and the page only gains height when the TALLER of them shrinks (the
 * handoff's "Known constraints" §2). The usage column is the taller one on every
 * NVR model.
 *
 * Today: V800 272 · V500 281 · V400 289 · V600 310 · V700 369. Only the V700 is
 * over, and the V600 has just 14 characters of room, so this is a live
 * constraint on authored copy rather than a theoretical one.
 *
 * Re-measure with `scripts/render-datasheet.ts --all` if any page-1 block
 * changes size. The number is a property of the layout, not of the data.
 */
export const LEDGER_USAGE_MAX_CHARS = 324;

/**
 * Problems that make the sheet render WRONG, as opposed to merely incomplete.
 *
 * Separate from ledgerGaps() because the two need different treatment: a gap is
 * a block honestly left off a sheet that is otherwise correct, while a warning
 * here means the emitted PDF is defective — a footer on a page of its own is not
 * something to ship to a customer. Cheap enough to run in the picker, because it
 * measures the input rather than rendering the output.
 */
export function ledgerWarnings(model: string, allRows: ProductSpecRow[]): string[] {
  const rows = groupByModel(allRows).get(model);
  if (!rows || rows.length === 0) return [];
  const spec = canonicalRow(rows);
  const usage = spec.usage_paragraph ? clean(spec.usage_paragraph) : "";
  if (usage.length > LEDGER_USAGE_MAX_CHARS) {
    return [
      `The recommended-usage paragraph is ${usage.length} characters. Page 1 holds ` +
        `${LEDGER_USAGE_MAX_CHARS}, so the sheet currently spills onto a fourth page — ` +
        `shorten it by at least ${usage.length - LEDGER_USAGE_MAX_CHARS} characters in Product Specs.`,
    ];
  }
  return [];
}

/**
 * The columns a complete Ledger sheet needs, and which of them this model's
 * canonical row is missing.
 *
 * Surfaced in the admin picker rather than used to refuse a render: a sheet with
 * gaps is the honest output for a row with gaps, and the person who can fix it is
 * the one looking at the picker. Only fields whose absence is VISIBLE on the
 * sheet are listed — a missing block, not a missing spec row.
 */
export function ledgerGaps(model: string, allRows: ProductSpecRow[]): string[] {
  const rows = groupByModel(allRows).get(model);
  if (!rows || rows.length === 0) return ["no spec rows at all"];
  const spec = canonicalRow(rows);
  const gaps: string[] = [];
  if (!spec.usage_paragraph) gaps.push("recommended-usage paragraph");
  if (warrantyBlock(spec) === null) gaps.push("warranty term — the whole band is omitted");
  if (compliancePills(spec).length === 0) gaps.push("regulatory marks — no compliance pills");
  if (!spec.product_photo_path) gaps.push("front photo");
  if (!spec.rear_io_photo_path) gaps.push("rear I/O photo");
  const env = environmentalRows(spec).length;
  if (env < 8) gaps.push(`environmental specs — only ${env} of 11 rows`);
  return gaps;
}
