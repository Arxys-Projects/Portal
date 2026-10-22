import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadDesignInputs, selectDesignCatalog } from "./catalog";
import { seedBomRules, seedSystemDesignRules } from "./seed-rules.test-fixtures";

describe("selectDesignCatalog", () => {
  it("offers the V250 / V255 management servers and every SW workstation it is given", () => {
    const catalog = selectDesignCatalog([
      { sku: "VX5-V200-64", product_group: "V200" },
      { sku: "VX5-V250-MGM", product_group: "V250" },
      { sku: "VX5-V255-MGM", product_group: "V255" },
      { sku: "VX5-V260-ACM", product_group: "V260" },
      { sku: "VX5-SW10-100", product_group: "SW10" },
      { sku: "VX5-SW20-200", product_group: "SW20" },
      { sku: "VX5-NIC-SFP28", product_group: "NIC" },
      { sku: "VX5-SWITCH-24", product_group: "SWITCH" },
    ]);
    assert.deepStrictEqual(catalog, {
      managementSkus: ["VX5-V250-MGM", "VX5-V255-MGM"],
      workstationSkus: ["VX5-SW10-100", "VX5-SW20-200"],
    });
  });
});

describe("loadDesignInputs", () => {
  // Records each query and answers from `data`.
  function fakeClient(data: Record<string, unknown[]>, failOn?: string) {
    const queries: string[] = [];
    const client = {
      from(table: string) {
        const parts = [table];
        const builder = {
          select(columns: string) { parts.push(`select ${columns}`); return builder; },
          eq(column: string, value: unknown) { parts.push(`${column}=${String(value)}`); return builder; },
          order(column: string) { parts.push(`order ${column}`); return builder; },
          then(resolve: (r: { data: unknown[] | null; error: unknown }) => unknown) {
            queries.push(parts.join(" | "));
            return Promise.resolve(
              table === failOn ? { data: null, error: { message: "boom" } } : { data: data[table] ?? [], error: null },
            ).then(resolve);
          },
        };
        return builder;
      },
    } as unknown as SupabaseClient;
    return { client, queries };
  }

  it("reads every rule row and only active, listed products", async () => {
    const { client, queries } = fakeClient({
      system_design_rules: seedSystemDesignRules(),
      bom_rules: seedBomRules(),
      current_products: [
        { sku: "VX5-V250-MGM", product_group: "V250" },
        { sku: "VX5-SW20-200", product_group: "SW20" },
      ],
    });
    const loaded = await loadDesignInputs(client);
    assert.equal(loaded.status, "ok");
    assert.ok(loaded.status === "ok");
    assert.deepStrictEqual(loaded.rules.systemDesignRules, seedSystemDesignRules());
    assert.deepStrictEqual(loaded.rules.bomRules, seedBomRules());
    assert.deepStrictEqual(loaded.catalog, { managementSkus: ["VX5-V250-MGM"], workstationSkus: ["VX5-SW20-200"] });
    assert.deepStrictEqual(queries, [
      "system_design_rules | select key, value, description, updated_at | order key",
      "bom_rules | select id, design_item, applies_to_role, sku, qty_per_server, description, active, updated_at | order id",
      "current_products | select sku, product_group | active=true | hidden_from_catalog=false | order sort_order",
    ]);
  });

  it("names the read that failed", async () => {
    const { client } = fakeClient({}, "bom_rules");
    const loaded = await loadDesignInputs(client);
    assert.equal(loaded.status, "db-error");
    assert.ok(loaded.status === "db-error" && loaded.context === "load BOM rules");
  });
});
