// Which product_specs row speaks for a model. Shared by the Ledger datasheet
// adapter (from-product-specs.ts) and the Price Book product pages
// (src/lib/price-book/family-specs.ts), so both pick the same row by the same
// rule.
//
// Its own module, apart from from-product-specs.ts, because that adapter imports
// the datasheet tokens and through them @react-pdf/renderer. A server page that
// only needs the row rule should not load the PDF renderer to get it. Pure: no
// Supabase, no react-pdf, no `server-only`.
//
// Generic over the row type so a caller reading extra columns (the Price Book
// reads `gbe_1_ports`) keeps them in its types. The runtime behaviour is the
// same for every row shape.

import type { ProductSpecRow } from "./from-product-specs";

/** Part numbers are `VX5-{MODEL}-{RAW_TB}`, so the model is the middle segment. */
export function modelOf(row: Pick<ProductSpecRow, "id">): string {
  return row.id.split("-")[1] ?? row.id;
}

/** Group rows into their models, each sorted by raw capacity ascending. */
export function groupByModel<T extends ProductSpecRow>(rows: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const model = modelOf(row);
    const list = groups.get(model);
    if (list) list.push(row);
    else groups.set(model, [row]);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => (a.storage_raw_tb ?? 0) - (b.storage_raw_tb ?? 0));
  }
  return groups;
}

/**
 * The model's spec row: the highest-capacity SKU, with any text column that a
 * sibling SKU states more fully extended to that fuller wording.
 *
 * "More fully" means strictly prefix-extended, after trimming — `"Optional"` is
 * replaced by `"Optional - 2x 10Gb SFP+ ... available"`, but `"4 × 10GbE + 1
 * IPMI"` and `"4 × 10GbE RJ45 ports + 1 IPMI"` are left alone because neither
 * prefixes the other. Both of those are correct; picking between two correct
 * wordings is what the canonical-row rule is for. Extending a truncation is
 * different, and safe.
 *
 * `rows` must be capacity-ascending, as groupByModel() returns them.
 */
export function canonicalRow<T extends ProductSpecRow>(rows: T[]): T {
  const top = rows[rows.length - 1];
  if (rows.length === 1) return top;
  const merged: T = { ...top };
  for (const key of Object.keys(top) as (keyof T)[]) {
    // Capacity-bearing and identity columns are per-SKU facts, never merged.
    if (key === "id" || key === "model_name" || key === "storage_raw_tb") continue;
    const own = top[key];
    if (typeof own !== "string") continue;
    const trimmed = own.trim();
    let best = trimmed;
    for (const sibling of rows) {
      const other = sibling[key];
      if (typeof other !== "string") continue;
      const otherTrimmed = other.trim();
      // Strict prefix extension only, case-insensitively, so a longer sibling
      // that merely re-words the value is ignored.
      if (
        otherTrimmed.length > best.length &&
        otherTrimmed.toLowerCase().startsWith(trimmed.toLowerCase())
      ) {
        best = otherTrimmed;
      }
    }
    if (best !== trimmed) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (merged as any)[key] = best;
    }
  }
  return merged;
}
