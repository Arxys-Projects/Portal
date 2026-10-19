import {
  MAX_QTY_PER_SERVER,
  MAX_WORKSTATIONS,
  SERVER_ROLES,
  type BomRule,
  type DesignItem,
  type ServerRole,
} from "./rules";

// buildBom (ADR 0161). Pure: no I/O, and no prices. Step 5 reads each line's
// price from the Pipedrive product, never from here.
//
// One line per (SKU, role), which is the key the deal-line ledger
// (`deal_line_syncs`) is unique on. Server lines carry ruleId null; every
// add-on line names the bom_rules row that produced it, so the banked BOM can
// be traced to the snapshot it was built from.
//
// Rule lines: for each active rule whose design item is on, qty_per_server x
// the number of servers in that role. A role with no servers adds nothing.
//
// Order: recorder, failover, mgmt, workstation; within a role the server line
// first, then add-ons by rule id.

export type BomLine = {
  sku: string;
  qty: number;
  role: ServerRole;
  ruleId: number | null;
};

export type BomInput = {
  // The primary recommendation's winner.
  primary: { sku: string; units: number };
  // recommendFailover()'s choice; null when failover is off or nothing qualified.
  failover: { sku: string; units: number } | null;
  // The resolved management server; units 0 when not dedicated.
  management: { sku: string | null; units: number };
  gpu: boolean;
  sfp: boolean;
  // The resolved workstations; count 0 means none.
  workstations: { sku: string | null; count: number };
  // From the rules snapshot, which parseDesignRules validated. Checked again
  // here, because a banked snapshot could reach this without a fresh parse.
  bomRules: readonly BomRule[];
};

const isWhole = (n: unknown, min: number): n is number =>
  typeof n === "number" && Number.isSafeInteger(n) && n >= min;

export function buildBom(input: BomInput): BomLine[] {
  const { primary, failover, management, workstations } = input;
  if (!primary.sku || !isWhole(primary.units, 1)) {
    throw new Error("buildBom(): the primary needs a SKU and at least 1 unit");
  }
  if (failover && (!failover.sku || !isWhole(failover.units, 1))) {
    throw new Error("buildBom(): a failover needs a SKU and at least 1 unit");
  }
  if (!isWhole(management.units, 0) || management.units > 2 || (management.units > 0 && !management.sku)) {
    throw new Error("buildBom(): management is 0, 1 or 2 units, with a SKU when there are any");
  }
  if (
    !isWhole(workstations.count, 0) ||
    workstations.count > MAX_WORKSTATIONS ||
    (workstations.count > 0 && !workstations.sku)
  ) {
    throw new Error(
      `buildBom(): workstations need a whole count up to ${MAX_WORKSTATIONS}, with a SKU when there are any`,
    );
  }

  const servers: Record<ServerRole, { sku: string; qty: number } | null> = {
    recorder: { sku: primary.sku, qty: primary.units },
    failover: failover ? { sku: failover.sku, qty: failover.units } : null,
    mgmt: management.units > 0 ? { sku: management.sku!, qty: management.units } : null,
    workstation: workstations.count > 0 ? { sku: workstations.sku!, qty: workstations.count } : null,
  };
  for (const rule of input.bomRules) {
    if (
      !isWhole(rule.id, 1) ||
      rule.active !== true ||
      typeof rule.design_item !== "string" ||
      typeof rule.sku !== "string" ||
      rule.sku.trim() === "" ||
      !(SERVER_ROLES as readonly string[]).includes(rule.applies_to_role) ||
      !isWhole(rule.qty_per_server, 1) ||
      rule.qty_per_server > MAX_QTY_PER_SERVER
    ) {
      throw new Error(`buildBom(): BOM rule #${String(rule.id)} is malformed; resolve the rules again`);
    }
  }

  const on: Record<DesignItem, boolean> = { sfp: input.sfp, gpu: input.gpu };
  const rules = [...input.bomRules].sort((a, b) => a.id - b.id);

  const lines: BomLine[] = [];
  const seen = new Set<string>();
  const add = (line: BomLine) => {
    if (!isWhole(line.qty, 1)) {
      throw new Error(`buildBom(): ${line.sku} would have quantity ${line.qty}`);
    }
    const key = `${line.role}\u0000${line.sku}`;
    if (seen.has(key)) {
      // parseDesignRules refuses two rules for one (SKU, role); what is left is a
      // rule that adds the role's own server SKU to it.
      throw new Error(`buildBom(): ${line.sku} would be two ${line.role} lines`);
    }
    seen.add(key);
    lines.push(line);
  };

  for (const role of SERVER_ROLES) {
    const server = servers[role];
    if (!server) continue;
    add({ sku: server.sku, qty: server.qty, role, ruleId: null });
    for (const rule of rules) {
      if (rule.applies_to_role !== role) continue;
      if (on[rule.design_item as DesignItem] !== true) continue;
      add({ sku: rule.sku, qty: rule.qty_per_server * server.qty, role, ruleId: rule.id });
    }
  }
  return lines;
}
