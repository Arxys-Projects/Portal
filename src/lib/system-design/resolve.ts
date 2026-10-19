import { VMS_OPTIONS } from "@/lib/calculator/tables";
import {
  MAX_PRIMARIES_PER_FAILOVER,
  MAX_WORKSTATIONS,
  parseDesignRules,
  type BomRule,
  type DesignItem,
  type DesignRulesInput,
  type DesignRulesSnapshot,
  type SystemDesignValues,
} from "./rules";

// resolveSystemDesign (ADR 0158). Pure: no I/O, no clock.
//
// Turns what the rep chose for a project calc (SFP+, GPU, failover, management
// server, workstations) into a fully resolved design, filling every default from
// the rules tables, and returns a snapshot of those rules to bank with the calc.
// Sizing happens after this, with the resolved values, in sizeProjectDesign()
// (size.ts): recommend() with excludeOneU = sfp, recommendFailover(), buildBom().
//
// Defaults come from the rules, never from constants here. The one derived
// default is failover days: ceil(longest retention x failover_days_fraction).

/** What the rep sent. Every field is optional; absent means "off" or "default". */
export type SystemDesignRequest = {
  sfp?: boolean | null;
  gpu?: boolean | null;
  failover?: {
    enabled: boolean;
    // Absent: ceil(longest retention x failover_days_fraction).
    days?: number | null;
    // Absent: default_primaries_per_failover.
    primariesPerFailover?: number | null;
  } | null;
  management?: {
    dedicated: boolean;
    // A failover pair is two management servers.
    failoverPair?: boolean | null;
    sku?: string | null;
  } | null;
  workstations?: { count: number; sku?: string | null } | null;
};

export type CalcDesignInputs = {
  // The calc's own retention: the value a group with none inherits.
  retentionDays?: number | null;
  // Each group's own retention, when it has one (ADR 0132). Retention resolves
  // group, then calc, the same chain submitCalculation uses before sizing, so
  // the failover default comes from the retention the sizing used. There is no
  // project fallback here: the project's default retention fills the calc's
  // form, and the calc then carries it.
  groups: readonly { retentionDays?: number | null }[];
  vms?: string | null;
  systemDesign?: SystemDesignRequest | null;
};

/** From the `projects` row. Used only where the calc leaves a value unset. */
export type ProjectDefaults = {
  vms?: string | null;
};

/** The dropdowns' contents, loaded by the caller from active products. */
export type DesignCatalog = {
  managementSkus: readonly string[];
  workstationSkus: readonly string[];
};

export type ResolvedFailover =
  | { enabled: false }
  | {
      enabled: true;
      days: number;
      primariesPerFailover: number;
      // True where the value came from the rules rather than the rep.
      daysDefaulted: boolean;
      ratioDefaulted: boolean;
    };

export type ResolvedManagement =
  | { dedicated: false; units: 0; sku: null }
  | { dedicated: true; units: 1 | 2; sku: string };

export type ResolvedSystemDesign = {
  sfp: boolean;
  gpu: boolean;
  failover: ResolvedFailover;
  management: ResolvedManagement;
  workstations: { count: number; sku: string | null };
  // The longest group retention after inheritance: what failover days default from.
  longestRetentionDays: number;
  vms: string | null;
};

export type SystemDesignResolution =
  | {
      ok: true;
      design: ResolvedSystemDesign;
      values: SystemDesignValues;
      snapshot: DesignRulesSnapshot;
      warnings: string[];
    }
  | { ok: false; errors: string[] };

// The GPU is for these VMSes' recorders only (brief, locked decisions).
const GPU_VMS: ReadonlySet<string> = new Set(["Avigilon", "Hanwha", "NX Witness"]);

const MAX_DAYS = 730; // the calculator's retention ceiling

const isWhole = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n);
const present = <T>(v: T | null | undefined): v is T => v !== null && v !== undefined;

// A SKU as typed: trimmed text, "" when absent, and any other value as text so
// the "not an active SKU" error names it instead of throwing.
const skuText = (v: unknown): string =>
  typeof v === "string" ? v.trim() : v === null || v === undefined ? "" : String(v);

const ITEM_LABEL: Record<DesignItem, string> = { sfp: "SFP+", gpu: "GPU" };

/**
 * ceil(longest x fraction), but a product that floating point lands a hair over
 * a whole number (0.07 x 100 = 7.000000000000001) counts as that whole number.
 */
export function defaultFailoverDays(longestRetentionDays: number, fraction: number): number {
  return Math.max(1, Math.ceil(longestRetentionDays * fraction - 1e-9));
}

export function resolveSystemDesign(
  calc: CalcDesignInputs,
  project: ProjectDefaults,
  rules: DesignRulesInput,
  catalog: DesignCatalog,
): SystemDesignResolution {
  const errors: string[] = [];
  const warnings: string[] = [];

  const parsed = parseDesignRules(rules);
  if (!parsed.ok) errors.push(...parsed.errors);
  else warnings.push(...parsed.warnings);

  // --- Retention: group, then calc -------------------------------------------
  let longestRetentionDays = 0;
  if (calc.groups.length === 0) errors.push("The calc has no camera groups.");
  calc.groups.forEach((g, i) => {
    const days = g.retentionDays ?? calc.retentionDays;
    if (!present(days)) {
      errors.push(`Camera group ${i + 1} has no retention, and the calc sets none.`);
    } else if (!isWhole(days) || days < 1 || days > MAX_DAYS) {
      errors.push(`Camera group ${i + 1} has retention ${days}; it must be a whole number of days from 1 to ${MAX_DAYS}.`);
    } else {
      longestRetentionDays = Math.max(longestRetentionDays, days);
    }
  });

  const vmsRaw = calc.vms ?? project.vms ?? null;
  const vms = typeof vmsRaw === "string" && vmsRaw.trim() !== "" ? vmsRaw.trim() : null;

  const req = calc.systemDesign ?? {};
  const sfp = req.sfp === true;
  const gpu = req.gpu === true;

  // --- Failover -------------------------------------------------------------
  let failover: ResolvedFailover = { enabled: false };
  if (req.failover?.enabled === true) {
    const { days, primariesPerFailover } = req.failover;
    if (present(days) && (!isWhole(days) || days < 1 || days > MAX_DAYS)) {
      errors.push(`Failover days must be a whole number from 1 to ${MAX_DAYS}; got ${days}.`);
    }
    if (
      present(primariesPerFailover) &&
      (!isWhole(primariesPerFailover) ||
        primariesPerFailover < 1 ||
        primariesPerFailover > MAX_PRIMARIES_PER_FAILOVER)
    ) {
      errors.push(
        `Primaries per failover must be a whole number from 1 to ${MAX_PRIMARIES_PER_FAILOVER}; got ${primariesPerFailover}.`,
      );
    }
    if (parsed.ok && longestRetentionDays > 0) {
      const resolvedDays = present(days)
        ? days
        : defaultFailoverDays(longestRetentionDays, parsed.values.failoverDaysFraction);
      failover = {
        enabled: true,
        days: resolvedDays,
        primariesPerFailover: present(primariesPerFailover)
          ? primariesPerFailover
          : parsed.values.defaultPrimariesPerFailover,
        daysDefaulted: !present(days),
        ratioDefaulted: !present(primariesPerFailover),
      };
      if (resolvedDays > longestRetentionDays) {
        warnings.push(
          `Failover days (${resolvedDays}) are more than the longest retention (${longestRetentionDays}). ` +
            "A failover holds no group longer than its own retention, so the extra days change nothing.",
        );
      }
    }
  }

  // --- Management / directory server -----------------------------------------
  let management: ResolvedManagement = { dedicated: false, units: 0, sku: null };
  if (req.management?.dedicated === true) {
    const sku = skuText(req.management.sku);
    if (sku === "") {
      errors.push("A dedicated management server needs a SKU.");
    } else if (!catalog.managementSkus.includes(sku)) {
      errors.push(`${sku} is not an active management server SKU.`);
    } else {
      management = { dedicated: true, units: req.management.failoverPair === true ? 2 : 1, sku };
    }
  }

  // --- Workstations ----------------------------------------------------------
  let workstations: ResolvedSystemDesign["workstations"] = { count: 0, sku: null };
  if (present(req.workstations)) {
    const { count } = req.workstations;
    const sku = skuText(req.workstations.sku);
    if (!isWhole(count) || count < 0 || count > MAX_WORKSTATIONS) {
      errors.push(`Workstation count must be a whole number from 0 to ${MAX_WORKSTATIONS}; got ${count}.`);
    } else if (count > 0) {
      if (sku === "") errors.push("Workstations need a SKU.");
      else if (!catalog.workstationSkus.includes(sku)) {
        errors.push(`${sku} is not an active workstation SKU.`);
      } else workstations = { count, sku };
    }
  }

  // --- A design item that is on must add something -----------------------------
  // SFP+ or GPU on with no active rule for recorders would quote the servers
  // without the add-on and say nothing (architect review A-2). The recorders'
  // and failovers' parts are compared too, by SKU and quantity, whether or not
  // this calc has a failover: SFP+ and GPU are locked as the same parts on
  // both, so a difference is most likely one retired row of a pair, which also
  // leaves the recorders short.
  if (parsed.ok) {
    const partsFor = (item: DesignItem, role: BomRule["applies_to_role"]) =>
      parsed.bomRules
        .filter((r) => r.design_item === item && r.applies_to_role === role)
        .map((r) => `${r.qty_per_server} x ${r.sku}`)
        .sort();
    for (const item of [sfp ? "sfp" : null, gpu ? "gpu" : null] as const) {
      if (item === null) continue;
      const recorder = partsFor(item, "recorder");
      if (recorder.length === 0) {
        errors.push(
          `${ITEM_LABEL[item]} is on, but no active BOM rule adds anything to recorders. ` +
            `Turn ${ITEM_LABEL[item]} off, or ask an admin to restore the rule.`,
        );
        continue;
      }
      const failoverParts = partsFor(item, "failover");
      if (failoverParts.join("|") !== recorder.join("|")) {
        const onFailover = failoverParts.length > 0 ? failoverParts.join(" + ") : "nothing";
        warnings.push(
          req.failover?.enabled === true
            ? `${ITEM_LABEL[item]} adds ${recorder.join(" + ")} to each recorder but ${onFailover} to each failover. ` +
                "Check the BOM rules."
            : `The ${ITEM_LABEL[item]} rules for recorders (${recorder.join(" + ")}) and for failovers (${onFailover}) differ. ` +
                "Ask an admin to check them.",
        );
      }
    }
  }

  // --- Advice that does not change the design ---------------------------------
  if (gpu && vms !== null && VMS_OPTIONS.includes(vms) && vms !== "Other" && !GPU_VMS.has(vms)) {
    warnings.push(
      `GPU is on, but the VMS is ${vms}. The GPU is for Avigilon and Hanwha WAVE / Nx Witness recorders only.`,
    );
  }

  if (errors.length > 0 || !parsed.ok) return { ok: false, errors };
  return {
    ok: true,
    design: { sfp, gpu, failover, management, workstations, longestRetentionDays, vms },
    values: parsed.values,
    snapshot: parsed.snapshot,
    warnings,
  };
}

/**
 * The suggest_dedicated_mgmt_above_servers rule, applied once sizing is known.
 * Counts primaries and failovers: the management server runs both.
 * Null when a dedicated server is already chosen or the count is at or under
 * the threshold.
 */
export function dedicatedManagementSuggestion(
  resolution: { design: ResolvedSystemDesign; values: SystemDesignValues },
  primaryUnits: number,
  failoverUnits: number,
): string | null {
  const servers = primaryUnits + failoverUnits;
  const threshold = resolution.values.suggestDedicatedMgmtAboveServers;
  if (resolution.design.management.dedicated || servers <= threshold) return null;
  return (
    `This calc has ${servers} recording servers (more than ${threshold}). ` +
    "Consider a dedicated management server."
  );
}
