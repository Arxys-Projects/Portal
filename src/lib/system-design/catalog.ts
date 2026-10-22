import type { SupabaseClient } from "@supabase/supabase-js";
import type { DesignCatalog } from "./resolve";
import type { BomRuleRow, DesignRulesInput, SystemDesignRuleRow } from "./rules";

// What a project calc save reads before resolveSystemDesign (Project Portal
// Step 4): the rules tables and the dropdown catalog. Always from the database,
// never from the request (ADR 0158): whoever supplies the rules or the catalog
// controls the add-ons and SKUs on a quote.
//
// The catalog is the active, listed products in the management-server and
// workstation families (brief Step 0 results item 3: V250-MGM and V255-MGM;
// SW10-100 and SW20-200, with SW25 to SW35 inactive). An allowlist of product
// groups, as in candidates.ts, so a new family never appears in a dropdown
// before anyone has looked at it.

const MANAGEMENT_PRODUCT_GROUPS: ReadonlySet<string> = new Set(["V250", "V255"]);
// Every SW family is a workstation; `active` decides which are offered.
const WORKSTATION_PRODUCT_GROUP = /^SW\d+$/;

export type CatalogProductRow = { sku: string; product_group: string };

/** Pure: the dropdown SKUs from active product rows, in the rows' order. */
export function selectDesignCatalog(rows: readonly CatalogProductRow[]): DesignCatalog {
  return {
    managementSkus: rows.filter((r) => MANAGEMENT_PRODUCT_GROUPS.has(r.product_group)).map((r) => r.sku),
    workstationSkus: rows.filter((r) => WORKSTATION_PRODUCT_GROUP.test(r.product_group)).map((r) => r.sku),
  };
}

export type DesignInputs =
  | { status: "ok"; rules: DesignRulesInput; catalog: DesignCatalog }
  | {
      status: "db-error";
      context: "load system design rules" | "load BOM rules" | "load design catalog";
      error: unknown;
    };

/** Reads the rules and the catalog. The caller checks who may run this. */
export async function loadDesignInputs(client: SupabaseClient): Promise<DesignInputs> {
  const { data: designRules, error: designError } = await client
    .from("system_design_rules")
    .select("key, value, description, updated_at")
    .order("key");
  if (designError) return { status: "db-error", context: "load system design rules", error: designError };

  // Every row, retired ones included: parseDesignRules needs the `active` flag
  // to tell them apart, and refuses a row that has none.
  const { data: bomRules, error: bomError } = await client
    .from("bom_rules")
    .select("id, design_item, applies_to_role, sku, qty_per_server, description, active, updated_at")
    .order("id");
  if (bomError) return { status: "db-error", context: "load BOM rules", error: bomError };

  const { data: products, error: productError } = await client
    .from("current_products")
    .select("sku, product_group")
    .eq("active", true)
    .eq("hidden_from_catalog", false)
    .order("sort_order");
  if (productError) return { status: "db-error", context: "load design catalog", error: productError };

  return {
    status: "ok",
    rules: {
      systemDesignRules: (designRules ?? []) as SystemDesignRuleRow[],
      bomRules: (bomRules ?? []) as BomRuleRow[],
    },
    catalog: selectDesignCatalog((products ?? []) as CatalogProductRow[]),
  };
}
