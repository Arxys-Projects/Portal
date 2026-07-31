import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { datasheetCatalogue, type CatalogueEntry } from "./catalogue";
import type { ApplianceSpecRow } from "./from-appliance-specs";
import type { ProductSpecRow } from "./from-product-specs";

// The one Supabase read behind both the datasheet route and the admin picker.
//
// READ ONLY, ALWAYS. The admin form is the sole write path for both spec tables
// (ADR 0096); nothing in the datasheet pipeline updates a row. `select("*")` on
// both tables rather than a column list: the adapters read roughly forty columns
// each, the tables are 21 and 7 rows, and a hand-maintained projection here would
// silently drop a column from a sheet the next time one is added.
//
// Rendered ON DEMAND from live specs, never from a frozen snapshot (ADR 0110).
// The opposite of the Project Quote (ADR 0060), and deliberately: a quote must
// not drift under a customer, whereas a spec sheet should always state today's
// specs.

export type DatasheetSpecData = {
  productRows: ProductSpecRow[];
  applianceRows: ApplianceSpecRow[];
  catalogue: CatalogueEntry[];
};

/**
 * Load both spec tables and build the catalogue.
 *
 * The whole of product_specs is loaded even when one model is wanted, because the
 * model ladder on page 2 shows where the SKU sits among all seven — a sheet
 * cannot be built from its own model's rows alone.
 */
export async function loadDatasheetSpecData(): Promise<DatasheetSpecData> {
  const supabase = await createSupabaseServerClient();
  const [products, appliances] = await Promise.all([
    supabase.from("product_specs").select("*").order("id"),
    supabase.from("appliance_specs").select("*").order("id"),
  ]);

  if (products.error) {
    throw new Error(`product_specs read failed: ${products.error.message}`);
  }
  if (appliances.error) {
    throw new Error(`appliance_specs read failed: ${appliances.error.message}`);
  }

  const productRows = (products.data ?? []) as unknown as ProductSpecRow[];
  const applianceRows = (appliances.data ?? []) as unknown as ApplianceSpecRow[];
  return {
    productRows,
    applianceRows,
    catalogue: datasheetCatalogue(productRows, applianceRows),
  };
}
