import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ProductSpec, CompetitorProduct } from "./types";

export type VendorGroup = {
  brandName: string;
  productLine: string;
  models: CompetitorProduct[];
};

export type ComparisonData = {
  productSpecs: Record<string, ProductSpec>;
  competitorsByVendor: Record<string, VendorGroup>;
};

export async function getComparisonData(): Promise<ComparisonData> {
  const supabase = await createSupabaseServerClient();

  const [{ data: specs }, { data: comps }, { data: prices }] = await Promise.all([
    supabase.from("product_specs").select("*").order("id"),
    supabase
      .from("competitor_products")
      .select("*")
      .order("vendor")
      .order("storage_raw_tb"),
    supabase.from("current_products").select("sku, msrp"),
  ]);

  // Price comes solely from current_products (the versioned, effective-dated
  // source of truth). product_specs.msrp was dropped (ADR 0086) — it was a stale
  // reference-table copy the price pipeline (push-prices.ts) never updated. Every
  // Arxys model shown in the comparison is a priced, active SKU present here; a
  // SKU with no current numeric price falls back to 0 (rejected by the PDF's
  // positive-price schema rather than shown as stale).
  const msrpBySku = new Map<string, number>(
    (prices ?? [])
      .filter((p) => p.msrp != null)
      .map((p) => [p.sku as string, Number(p.msrp)]),
  );

  const productSpecs: Record<string, ProductSpec> = {};
  for (const s of specs ?? []) {
    const id = s.id as string;
    const spec = s as unknown as ProductSpec;
    productSpecs[id] = { ...spec, msrp: msrpBySku.get(id) ?? 0 };
  }

  const competitorsByVendor: Record<string, VendorGroup> = {};
  for (const c of comps ?? []) {
    const comp = c as unknown as CompetitorProduct;
    if (!competitorsByVendor[comp.vendor]) {
      competitorsByVendor[comp.vendor] = {
        brandName: comp.brand_name,
        productLine: comp.product_line,
        models: [],
      };
    }
    competitorsByVendor[comp.vendor].models.push(comp);
  }

  return { productSpecs, competitorsByVendor };
}
