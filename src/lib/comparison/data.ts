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

  const [{ data: specs }, { data: comps }] = await Promise.all([
    supabase.from("product_specs").select("*").order("id"),
    supabase
      .from("competitor_products")
      .select("*")
      .order("vendor")
      .order("storage_raw_tb"),
  ]);

  const productSpecs: Record<string, ProductSpec> = {};
  for (const s of specs ?? []) {
    productSpecs[s.id as string] = s as unknown as ProductSpec;
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
