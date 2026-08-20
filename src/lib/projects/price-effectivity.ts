// When pricing was last actually updated, from the append-only price history.
//
// Pure: no Supabase client, no framework. The only import is TYPE-only, so this
// module runs under plain Node in price-effectivity.test.ts.
//
// ---------------------------------------------------------------------------
// Why this is not max(effective_date)
// ---------------------------------------------------------------------------
//
// `products` is append-only, versioned by effective_date (ADR 0076), and one
// scripts/push-prices.ts run stamps every SKU it changes with the same date. So
// the /projects staleness flag originally read "the last price update" as one
// global max(effective_date) across current_products (ADR 0115).
//
// That conflates two different events. A row can be the latest for its SKU
// either because the SKU was REPRICED, or because the SKU was BORN — a brand-new
// product's debut row is also, trivially, its newest version. Adding a SKU to
// the catalog cannot invalidate a quote that was written before it existed: a
// quote's prices only go stale when something it could already contain changed
// price. Under max(effective_date), the debut of a single new SKU flagged every
// open-deal quote in the system as needing a price update (3 new "-NCD" SKUs on
// 2026-08-18 did exactly that to all 34 of them; see ADR 0141).
//
// So the date is derived from the history rather than read off the newest row:
// walk each SKU's versions in effective order and keep the date of the newest row
// that actually CHANGED that SKU's price. A debut row has no predecessor to
// differ from, so it contributes nothing.
//
// This is the one place in src/ that reads `products` instead of
// current_products. The exception is structural, not an oversight: the view is a
// resolver that collapses history to one row per SKU, and no question about a
// version-to-version delta can be answered from its output.

// A single price version. Deliberately the minimum this needs, so the query
// stays narrow and the tests can build rows by hand.
export type PriceVersionRow = {
  sku: string;
  msrp: number | null;
  effective_date: string | null;
};

// A price as compared, normalized. null and 0 are genuinely different states
// here — several seeded SKUs carry a null msrp (quote-only accessories), and
// null -> a real number is a repricing, not a no-op.
function priceOf(row: PriceVersionRow): number | null {
  return row.msrp === null || row.msrp === undefined ? null : Number(row.msrp);
}

// The effective_date of the most recent version row that changed an existing
// SKU's price, or null when no SKU has ever been repriced (a freshly seeded
// table) — which reads downstream as "nothing to be stale against".
//
// Future-dated rows are excluded on the same grounds current_products excludes
// them: a price change staged for next month must not flag today's quotes before
// it takes effect.
export function lastRepricingDate(rows: PriceVersionRow[], now: Date): string | null {
  const today = now.toISOString().slice(0, 10);

  const versionsBySku = new Map<string, PriceVersionRow[]>();
  for (const row of rows) {
    if (!row.effective_date || row.effective_date > today) continue;
    const versions = versionsBySku.get(row.sku);
    if (versions) versions.push(row);
    else versionsBySku.set(row.sku, [row]);
  }

  let latest: string | null = null;
  for (const versions of versionsBySku.values()) {
    // unique (sku, effective_date) means no ties to break within a SKU.
    versions.sort((a, b) => (a.effective_date! < b.effective_date! ? -1 : 1));
    for (let i = 1; i < versions.length; i++) {
      if (priceOf(versions[i]) === priceOf(versions[i - 1])) continue;
      const date = versions[i].effective_date!;
      if (!latest || date > latest) latest = date;
    }
  }

  return latest;
}
