// The Price Book product page's spec facts (hero stats, Key Features, Technical
// Specs), derived from product_specs for the seven families that have rows there.
//
// These used to be literal strings in families.ts, so every /admin/specs edit
// left the product page stale while the datasheet, calculators and recommender
// moved on. The V400 page still read 200 streams and the old CPU a month after
// the 9015 refresh. Deriving them closes that: a fact changes in /admin/specs, a
// wording change happens here. See ADR 0146.
//
// SAME ROW AS THE DATASHEET. The canonical row comes from canonicalRow() in
// datasheet/canonical-row.ts, the rule the datasheet adapter uses, so a page and
// its datasheet cannot pick different SKUs to describe a model. The caller passes
// only the SKUs the page lists (hidden_from_catalog = false), so a hidden -NCD
// copy never speaks for the page.
//
// A BLANK COLUMN DROPS ITS BULLET, the way specRow() drops a datasheet row.
// Nothing falls back to the old authored strings: a stale fact is the bug this
// module exists to remove.
//
// Pure: no Supabase, no react-pdf, no `server-only`.

import { canonicalRow, groupByModel } from "../datasheet/canonical-row";
import type { ProductSpecRow } from "../datasheet/from-product-specs";
import type { DatasheetContent } from "../datasheet/types";
import {
  clean,
  isBlank,
  isNegative,
  isYes,
  joinParts,
  osText,
  raidLabel,
  thousands,
} from "../datasheet/spec-text";
import type { Family, FamilyKpi } from "./families";

/**
 * The product_specs columns the page reads. The datasheet's row type plus
 * `gbe_1_ports`, which the datasheet does not print and the page's network
 * bullet needs.
 */
export type FamilySpecRow = ProductSpecRow & { gbe_1_ports: number | null };

export type FamilyDisplay = {
  /** Always three: Max VSR, Throughput, Warranty Support. */
  kpis: FamilyKpi[];
  keyFeatures: string[];
  technicalSpecs: string[];
  /**
   * The SKU whose row the facts came from, or null when the model had no rows
   * and every stat is the placeholder. The page logs the null case.
   */
  sourceSku: string | null;
};

/**
 * One constant for the throughput unit. The datasheet, the SKU table and commit
 * 66edf22 say Mbit/s; the page used to say Mbps. Reverting is this one line.
 */
export const THROUGHPUT_UNIT = "Mbit/s";

/**
 * Authored, because `warranty_terms` is not usable as a three-word unit line:
 * four different wordings across the seven models, one over 80 characters.
 * The years come from `warranty_years`.
 */
export const WARRANTY_KPI_UNIT = "Next Business Day Parts";

/** The page's existing empty-value mark. */
export const PLACEHOLDER = "—";

/** "3.3Ghz" -> "3.3GHz". The column was transcribed with a lowercase h. */
export function cpuText(value: string): string {
  return clean(value).replace(/(\d)\s*ghz\b/gi, "$1GHz");
}

/** A RAID level worth printing: not blank, and not the deprecated 'NA'. */
function hasLevel(level: string | null): level is string {
  return !isBlank(level) && !isNegative(level);
}

/**
 * The hot-swap power flag, read as affirmative when it starts with "Yes".
 * Looser than isYes() on purpose: canonicalRow() can extend "Yes" to a
 * sibling's "Yes 1+1", which isYes() rejects, and a redundant-power claim should
 * not vanish from the page over that.
 */
function hasHotSwapPower(value: string | null): boolean {
  return /^\s*yes\b/i.test(value ?? "");
}

function warrantyYears(row: FamilySpecRow): number | null {
  const years = Number(row.warranty_years);
  return Number.isFinite(years) && years > 0 ? years : null;
}

function kpis(row: FamilySpecRow | null): FamilyKpi[] {
  const years = row ? warrantyYears(row) : null;
  return [
    {
      label: "Max VSR",
      value: row?.max_cameras_h265 != null ? thousands(row.max_cameras_h265) : PLACEHOLDER,
      unit: "streams",
      vsrTooltip: true,
    },
    {
      label: "Throughput",
      value: row?.max_bandwidth_mbps != null ? thousands(row.max_bandwidth_mbps) : PLACEHOLDER,
      unit: THROUGHPUT_UNIT,
    },
    {
      label: "Warranty Support",
      value: years != null ? `${years} Years` : PLACEHOLDER,
      unit: WARRANTY_KPI_UNIT,
    },
  ];
}

/** "8x Enterprise HDD's, RAID 6 & Cachevault"; the V100 reads "RAID 1 or JBOD". */
function drivesBullet(row: FamilySpecRow): string | null {
  if (!row.hdd_count) return null;
  const levels = [
    ...new Set(
      [row.raid_level_display, row.raid_level_alt_display].filter(hasLevel).map(raidLabel),
    ),
  ];
  const raid = levels.length > 0 ? `, ${levels.join(" or ")}` : "";
  const cache = isYes(row.battery_raid) ? " & Cachevault" : "";
  return `${row.hdd_count}x Enterprise HDD's${raid}${cache}`;
}

function keyFeatures(row: FamilySpecRow): string[] {
  const bullets: (string | null)[] = [
    osText(row.os_edition)?.replace(/^Microsoft\s+/, "") ?? null,
    drivesBullet(row),
    row.max_bandwidth_mbps != null
      ? `${thousands(row.max_bandwidth_mbps)} ${THROUGHPUT_UNIT} max possible throughput`
      : null,
    isBlank(row.rack_units) ? null : `${clean(row.rack_units)} Rack mount w/ rails`,
    row.max_cameras_h265 != null
      ? `Max VSR = ${thousands(row.max_cameras_h265)} streams h.265 or h.264`
      : null,
  ];
  return bullets.filter((b): b is string => b !== null && b !== "");
}

/** Port counts from the integer columns: "2x 10Gb & 2x 1Gb Ethernet Ports". */
function networkBullet(row: FamilySpecRow): string | null {
  const ports = [
    row.gbe_10_ports ? `${row.gbe_10_ports}x 10Gb` : null,
    row.gbe_1_ports ? `${row.gbe_1_ports}x 1Gb` : null,
  ].filter((p): p is string => p !== null);
  return ports.length > 0 ? `${ports.join(" & ")} Ethernet Ports` : null;
}

function powerBullet(row: FamilySpecRow): string | null {
  if (hasHotSwapPower(row.hotswap_power)) {
    return /1\s*\+\s*1/.test(row.power_redundancy ?? "")
      ? "2x Hot-swap, Redundant Power Supply"
      : "Hot-swap, Redundant Power Supply";
  }
  if (isNegative(row.hotswap_power) && !isBlank(row.power_redundancy)) {
    return clean(row.power_redundancy);
  }
  return null;
}

function technicalSpecs(row: FamilySpecRow): string[] {
  const bullets: (string | null)[] = [
    isBlank(row.cpu_model_full) ? null : `${cpuText(row.cpu_model_full!)} CPU`,
    isBlank(row.ram_spec) ? null : `${clean(row.ram_spec)} DRAM`,
    // The datasheet's own fallback composition for its OS-drive row. The
    // `os_drive_desc` prose is not used: on three models it drops the drive
    // count and the mirroring, which are the facts this bullet states.
    isBlank(row.os_ssd_type)
      ? null
      : joinParts(
          [row.os_ssd_type, isNegative(row.os_redundancy) ? null : row.os_redundancy, "dedicated for OS/VMS"],
          ", ",
        ),
    networkBullet(row),
    isBlank(row.remote_mgmt) || isNegative(row.remote_mgmt) ? null : "1x Dedicated Remote Management",
    powerBullet(row),
  ];
  return bullets.filter((b): b is string => b !== null && b !== "");
}

/**
 * Derive one model's page facts from its product_specs rows.
 *
 * `rows` should be the rows the page lists. Rows for other models are ignored,
 * so passing a wider set is harmless.
 */
export function deriveFamilyDisplay(rows: FamilySpecRow[], model: string): FamilyDisplay {
  const modelRows = groupByModel(rows).get(model);
  if (!modelRows || modelRows.length === 0) {
    return { kpis: kpis(null), keyFeatures: [], technicalSpecs: [], sourceSku: null };
  }
  const row = canonicalRow(modelRows);
  return {
    kpis: kpis(row),
    keyFeatures: keyFeatures(row),
    technicalSpecs: technicalSpecs(row),
    sourceSku: row.id,
  };
}

/**
 * Where a page and its datasheet disagree on a fact they both state. Empty when
 * they agree. The regression guard: the unit tests run it on fixture rows, and
 * scripts/audit-price-book-specs.ts runs it on live rows.
 *
 * The page is derived from the rows it lists and the datasheet from every row,
 * as each is in production, so a hidden -NCD copy drifting from its visible twin
 * shows up here.
 *
 * Covers the facts both surfaces print: Max VSR, throughput, CPU, RAM, OS, rack
 * units and warranty years. The page's drive, network and power bullets are
 * page-only phrasings with no single datasheet counterpart.
 */
export function datasheetMismatches(page: FamilyDisplay, sheet: DatasheetContent): string[] {
  const out: string[] = [];
  const check = (fact: string, pageValue: string | null, sheetValue: string | null) => {
    if (pageValue !== sheetValue) {
      out.push(`${fact}: page ${JSON.stringify(pageValue)} vs datasheet ${JSON.stringify(sheetValue)}`);
    }
  };
  const headline = (key: string) => sheet.headline.find((h) => h.key === key)?.value ?? null;
  const hardware = (label: string) => sheet.hardware.find((r) => r.label === label)?.value ?? null;
  const kpi = (label: string) => {
    const k = page.kpis.find((x) => x.label === label);
    return k && k.value !== PLACEHOLDER ? k : null;
  };

  check("Max VSR", kpi("Max VSR")?.value ?? null, headline("Max Camera Streams"));
  const throughput = kpi("Throughput");
  check("Throughput", throughput ? `${throughput.value} ${throughput.unit}` : null, headline("Throughput"));

  const sheetCpu = hardware("CPU")?.split(", ")[0] ?? null;
  check(
    "CPU",
    page.technicalSpecs.find((b) => b.endsWith(" CPU")) ?? null,
    sheetCpu ? `${cpuText(sheetCpu)} CPU` : null,
  );
  const sheetRam = hardware("RAM");
  check("RAM", page.technicalSpecs.find((b) => b.endsWith(" DRAM")) ?? null, sheetRam ? `${sheetRam} DRAM` : null);

  const sheetOs = hardware("Operating system")?.replace(/^Microsoft\s+/, "") ?? null;
  check("OS", page.keyFeatures.find((b) => b.startsWith("Windows")) ?? null, sheetOs);

  const pageRack = page.keyFeatures.find((b) => b.endsWith(" Rack mount w/ rails"))?.replace(/ Rack mount w\/ rails$/, "") ?? null;
  const sheetRack = /(?:^|· )([^·]+?) Rack(?: ·|$)/.exec(sheet.descriptor)?.[1] ?? null;
  check("Rack units", pageRack, sheetRack);

  const years = kpi("Warranty Support")?.value ?? null;
  check("Warranty years", years, sheet.warranty ? `${sheet.warranty.years} Years` : null);
  return out;
}

/**
 * The page's facts for any family: authored arrays for the families whose specs
 * live outside product_specs (V250, V260, SW today), derived ones for the rest.
 *
 * A product_specs family names exactly one product group, and that group is the
 * model key (families.test.ts holds this).
 */
export function resolveFamilyDisplay(family: Family, specRows: FamilySpecRow[]): FamilyDisplay {
  if (family.specSource === "authored") {
    return {
      kpis: family.kpis,
      keyFeatures: family.keyFeatures,
      technicalSpecs: family.technicalSpecs,
      sourceSku: null,
    };
  }
  return deriveFamilyDisplay(specRows, family.productGroups[0]);
}
