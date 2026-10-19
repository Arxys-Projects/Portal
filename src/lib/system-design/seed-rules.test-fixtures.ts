// The seeded rules from migration 20261016000004_system_design_rules.sql, with
// failover_days_fraction at 1 as 20261019000001 sets it (failover days default to
// the longest retention, ADR 0162), in the row shape supabase-js returns. Ids follow the seed's insert order (1 to 6);
// the live ids may differ. Each call returns fresh objects, so a test can edit
// its copy freely.
import type { BomRuleRow, DesignRulesInput, SystemDesignRuleRow } from "./rules";
import type { DesignCatalog } from "./resolve";

export function seedSystemDesignRules(): SystemDesignRuleRow[] {
  return [
    {
      key: "failover_days_fraction",
      value: 1,
      description: "Default failover days as a fraction of the calc's longest retention, rounded up.",
      updated_at: "2026-10-16T18:00:00Z",
    },
    {
      key: "default_primaries_per_failover",
      value: 2,
      description: "Default number of primary recorders one failover unit covers.",
      updated_at: "2026-10-16T18:00:00Z",
    },
    {
      key: "suggest_dedicated_mgmt_above_servers",
      value: 3,
      description: "Suggest a dedicated management server when a calc has more recording servers than this.",
      updated_at: "2026-10-16T18:00:00Z",
    },
  ];
}

export function seedBomRules(): BomRuleRow[] {
  const row = (id: number, design_item: string, applies_to_role: string, sku: string): BomRuleRow => ({
    id,
    design_item,
    applies_to_role,
    sku,
    qty_per_server: 1,
    description: `${design_item} on: one ${sku} per ${applies_to_role}.`,
    active: true,
    updated_at: "2026-10-16T18:00:00Z",
  });
  return [
    row(1, "sfp", "recorder", "VX5-NIC-SFP28"),
    row(2, "sfp", "recorder", "VX5-NIC-SFP28x10"),
    row(3, "sfp", "failover", "VX5-NIC-SFP28"),
    row(4, "sfp", "failover", "VX5-NIC-SFP28x10"),
    row(5, "gpu", "recorder", "VX5-GPU-A1000"),
    row(6, "gpu", "failover", "VX5-GPU-A1000"),
  ];
}

// Mutable arrays, so a test can add, drop or edit rows.
export function seedRules(): DesignRulesInput & {
  systemDesignRules: SystemDesignRuleRow[];
  bomRules: BomRuleRow[];
} {
  return { systemDesignRules: seedSystemDesignRules(), bomRules: seedBomRules() };
}

// The dropdowns as Step 0 found them (item 3).
export const CATALOG: DesignCatalog = {
  managementSkus: ["VX5-V250-MGM", "VX5-V255-MGM"],
  workstationSkus: ["VX5-SW10-100", "VX5-SW20-200"],
};
