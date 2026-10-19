// System design and BOM rules: validation and the snapshot (ADR 0158). Pure.
//
// The rules live in `system_design_rules` (named defaults, `value` jsonb) and
// `bom_rules` (design item + server role -> SKU x qty per server), both
// admin-edited (ADR 0154). jsonb moves type checking out of the database, so it
// happens here, per key. A missing or malformed rule is an error, never a quiet
// fallback to a constant in code: a fallback would make an admin's edit look
// saved while the calc ignored it.
//
// The snapshot is the validated rules in the same row shape they were read in,
// so a calc banked with one can be resolved again from it later and get the
// values it was saved with, whatever the tables say by then.

export const SERVER_ROLES = ["recorder", "failover", "mgmt", "workstation"] as const;
export type ServerRole = (typeof SERVER_ROLES)[number];

// The design items the engine knows how to switch on. A bom_rules row for any
// other item is kept in the snapshot but adds nothing until the engine learns it.
export const DESIGN_ITEMS = ["sfp", "gpu"] as const;
export type DesignItem = (typeof DESIGN_ITEMS)[number];

/** A `system_design_rules` row as read. */
export type SystemDesignRuleRow = {
  key: string;
  value: unknown;
  description: string;
  updated_at?: string | null;
};

/** A `bom_rules` row as read. */
export type BomRuleRow = {
  id: number;
  design_item: string;
  applies_to_role: string;
  sku: string;
  qty_per_server: number;
  description: string;
  active: boolean;
  updated_at?: string | null;
};

/** An active, validated BOM rule. */
export type BomRule = BomRuleRow & { applies_to_role: ServerRole; active: true };

export type DesignRulesInput = {
  systemDesignRules: readonly SystemDesignRuleRow[];
  bomRules: readonly BomRuleRow[];
};

/**
 * What a calc banks (Step 4 decides where). Assignable to DesignRulesInput, so
 * it can be resolved from again. Holds the known rule keys and the active BOM
 * rules only, each copied field by field.
 */
export type DesignRulesSnapshot = {
  snapshotVersion: 1;
  systemDesignRules: SystemDesignRuleRow[];
  bomRules: BomRule[];
};

export type SystemDesignValues = {
  failoverDaysFraction: number;
  defaultPrimariesPerFailover: number;
  suggestDedicatedMgmtAboveServers: number;
};

type RuleSpec = {
  field: keyof SystemDesignValues;
  valid: (v: unknown) => v is number;
  expected: string;
};

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isWholeAtLeast = (min: number) => (v: unknown): v is number =>
  isNumber(v) && Number.isSafeInteger(v) && v >= min;

// No add-on goes into a server more than this many times. The table has no
// ceiling of its own, and a typo of 1000 would reach the deal lines.
export const MAX_QTY_PER_SERVER = 100;
// The most primaries one failover may cover, for the rule and for a rep's entry.
export const MAX_PRIMARIES_PER_FAILOVER = 100;
// The most workstations one calc may carry, checked by the resolver and the BOM.
export const MAX_WORKSTATIONS = 500;
// Ceilings from security review S-3, confirmed by Andy on 2026-10-19.

const RULES: Record<string, RuleSpec> = {
  failover_days_fraction: {
    field: "failoverDaysFraction",
    valid: (v): v is number => isNumber(v) && v > 0 && v <= 1,
    expected: "a number above 0 and at most 1",
  },
  default_primaries_per_failover: {
    field: "defaultPrimariesPerFailover",
    valid: (v): v is number => isWholeAtLeast(1)(v) && v <= MAX_PRIMARIES_PER_FAILOVER,
    expected: `a whole number from 1 to ${MAX_PRIMARIES_PER_FAILOVER}`,
  },
  suggest_dedicated_mgmt_above_servers: {
    field: "suggestDedicatedMgmtAboveServers",
    valid: isWholeAtLeast(0),
    expected: "a whole number, 0 or more",
  },
};

export type ParsedDesignRules =
  | {
      ok: true;
      values: SystemDesignValues;
      bomRules: BomRule[];
      snapshot: DesignRulesSnapshot;
      warnings: string[];
    }
  | { ok: false; errors: string[] };

const shown = (v: unknown) => (v === undefined ? "nothing" : JSON.stringify(v));

export function parseDesignRules(input: DesignRulesInput): ParsedDesignRules {
  const errors: string[] = [];
  const warnings: string[] = [];

  // --- system_design_rules -------------------------------------------------
  const byKey = new Map<string, SystemDesignRuleRow>();
  for (const row of input.systemDesignRules) {
    if (byKey.has(row.key)) errors.push(`System design rule "${row.key}" appears twice.`);
    byKey.set(row.key, row);
  }
  const values: Partial<SystemDesignValues> = {};
  const keptRules: SystemDesignRuleRow[] = [];
  for (const [key, spec] of Object.entries(RULES)) {
    const row = byKey.get(key);
    if (!row) {
      errors.push(`System design rule "${key}" is missing.`);
      continue;
    }
    if (!spec.valid(row.value)) {
      errors.push(
        `System design rule "${key}" must be ${spec.expected}; it is ${shown(row.value)}.`,
      );
      continue;
    }
    values[spec.field] = row.value;
    keptRules.push({
      key,
      value: row.value,
      description: row.description,
      updated_at: row.updated_at ?? null,
    });
  }

  // --- bom_rules (active rows only; a retired rule plays no part) -----------
  const bomRules: BomRule[] = [];
  const seenLine = new Map<string, number>();
  for (const row of input.bomRules) {
    const label = `BOM rule #${row.id}`;
    // A read that leaves out `active` must not quietly drop every add-on.
    if (typeof row.active !== "boolean") {
      errors.push(`${label} has no active flag, so it cannot be told apart from a retired rule.`);
      continue;
    }
    if (!row.active) continue;
    const problems: string[] = [];
    if (!isWholeAtLeast(1)(row.id)) problems.push("has no valid id");
    if (typeof row.design_item !== "string" || row.design_item.trim() === "") {
      problems.push("has no design item");
    }
    if (!(SERVER_ROLES as readonly string[]).includes(row.applies_to_role)) {
      problems.push(`applies to an unknown role ${shown(row.applies_to_role)}`);
    }
    if (typeof row.sku !== "string" || row.sku.trim() === "") problems.push("has no SKU");
    if (!isWholeAtLeast(1)(row.qty_per_server) || row.qty_per_server > MAX_QTY_PER_SERVER) {
      problems.push(
        `has quantity ${shown(row.qty_per_server)}; it must be a whole number from 1 to ${MAX_QTY_PER_SERVER}`,
      );
    }
    if (problems.length > 0) {
      errors.push(`${label} ${problems.join(", ")}.`);
      continue;
    }
    // The deal-line ledger keys a line on (SKU, role), so two active rules that
    // add the same SKU to the same role cannot both become lines. The table's
    // own unique key includes the design item, so this can only happen across
    // two design items.
    const lineKey = `${row.applies_to_role}\u0000${row.sku}`;
    const clash = seenLine.get(lineKey);
    if (clash !== undefined) {
      errors.push(
        `BOM rules #${clash} and #${row.id} both add ${row.sku} to each ${row.applies_to_role}; ` +
          "retire one or merge them.",
      );
      continue;
    }
    seenLine.set(lineKey, row.id);
    if (!(DESIGN_ITEMS as readonly string[]).includes(row.design_item)) {
      warnings.push(
        `${label} is for "${row.design_item}", which is not a design choice yet, so it adds nothing.`,
      );
    }
    bomRules.push({
      id: row.id,
      design_item: row.design_item,
      applies_to_role: row.applies_to_role as ServerRole,
      sku: row.sku,
      qty_per_server: row.qty_per_server,
      description: row.description,
      active: true,
      updated_at: row.updated_at ?? null,
    });
  }

  if (errors.length > 0) return { ok: false, errors };

  keptRules.sort((a, b) => a.key.localeCompare(b.key));
  bomRules.sort((a, b) => a.id - b.id);
  return {
    ok: true,
    values: values as SystemDesignValues,
    bomRules,
    snapshot: {
      snapshotVersion: 1,
      systemDesignRules: keptRules,
      // Copied again so the snapshot and `bomRules` share no objects.
      bomRules: bomRules.map((r) => ({ ...r })),
    },
    warnings,
  };
}
