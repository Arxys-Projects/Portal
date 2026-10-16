// The Pipedrive half of the price pipeline (scripts/push-prices.ts): what to
// create, update, retire, or refuse, given current_products and the live
// Pipedrive product list. Pure — no env, no fetch, no Supabase — so the rules
// below are unit-tested in product-sync.test.ts. The script owns the I/O.
//
// Two rules here replace what ADR 0079 set up (see ADR 0150):
//
//   * RETIRE, never delete. A portal-inactive SKU's Pipedrive product gets
//     `is_linkable: false` (v1 `selectable`), which takes it off the deal
//     picker and keeps the product and every deal line that uses it. The old
//     mechanism sent v1 `active_flag: false`, which Pipedrive treats as a
//     DELETE: the four products "archived" on 2026-07-06 (SW25, SW30, SW35,
//     V270-ACM) now 404 by id and are gone from list and search.
//
//   * A duplicated code is a hard stop. Products are matched by exact `code`.
//     When two Pipedrive products share a code that is a portal SKU, there is
//     no right one to pick: the old Map silently kept the last, so the run
//     priced one product and left the other (often the one on the picker) at a
//     stale price. Seen live on VX5-V600-320: #1443 linkable at $41,659, #1485
//     not linkable at $56,461. Such SKUs are reported, never written, and the
//     script refuses the Pipedrive step until they are resolved.

export type PriceType = "numeric" | "market" | "call_for_quote";

// The slice of a current_products row this logic reads. Callers pass their
// own wider row type and get it back inside the change buckets.
export type SyncProduct = {
  id: number;
  sku: string;
  product_name: string;
  msrp: number | string | null;
  price_type: PriceType;
  active: boolean;
};

// One price entry as GET /api/v2/products returns it.
export type PdPrice = {
  price: number;
  currency: string;
  cost?: number | null;
  direct_cost?: number | null;
  notes?: string | null;
};

// A product as GET /api/v2/products returns it. Deleted products are not
// returned at all, so there is no deleted flag to read here.
export type PdProduct = {
  id: number;
  name: string;
  code: string | null;
  is_linkable: boolean;
  prices: PdPrice[] | null;
};

// Request bodies for POST /api/v2/products and PATCH /api/v2/products/{id}.
export type PdPriceRequest = {
  price: number;
  currency: string;
  cost?: number;
  direct_cost?: number;
  notes?: string;
};

export type PdProductRequest = {
  name?: string;
  code?: string;
  prices?: PdPriceRequest[];
  is_linkable?: boolean;
};

export type UpdateReason = "name" | "price" | "relink";

export type DuplicateCode = { code: string; products: PdProduct[] };

export type PipedriveChanges<T extends SyncProduct> = {
  newInPd: T[];
  updatedInPd: Array<{ cur: T; product: PdProduct; reasons: UpdateReason[] }>;
  // Portal-inactive SKUs whose product is still on the deal picker.
  retireInPd: Array<{ cur: T; product: PdProduct }>;
  // Codes shared by 2+ products where the code is a portal SKU. Blocks the run.
  blockingDuplicates: DuplicateCode[];
  // Codes shared by 2+ products where the code is NOT a portal SKU (legacy
  // V2/V3/V4 and resale items). Reported only; the run never touches them.
  otherDuplicates: DuplicateCode[];
  // Products with a code that is not a portal SKU. Never touched automatically.
  flaggedRemoval: PdProduct[];
};

// Pipedrive display name: [MKT] / [CFQ] prefix for non-numeric prices.
export function pdName(name: string, priceType: PriceType): string {
  if (priceType === "market") return `[MKT] ${name}`;
  if (priceType === "call_for_quote") return `[CFQ] ${name}`;
  return name;
}

// Pipedrive price: the MSRP for numeric SKUs, 0 for MKT / CFQ.
export function pdPrice(priceType: PriceType, msrp: number | string | null): number {
  return priceType === "numeric" ? Number(msrp ?? 0) : 0;
}

export function usdPrice(product: PdProduct): number | null {
  const entry = (product.prices ?? []).find((p) => p.currency === "USD");
  return entry ? Number(entry.price) : null;
}

// Products grouped by exact code. Products with no code are left out: they
// cannot be matched to a SKU either way.
export function groupByCode(products: readonly PdProduct[]): Map<string, PdProduct[]> {
  const byCode = new Map<string, PdProduct[]>();
  for (const p of products) {
    if (!p.code) continue;
    const list = byCode.get(p.code);
    if (list) list.push(p);
    else byCode.set(p.code, [p]);
  }
  return byCode;
}

export function computePipedriveChanges<T extends SyncProduct>(
  current: readonly T[],
  pdProducts: readonly PdProduct[],
): PipedriveChanges<T> {
  const byCode = groupByCode(pdProducts);
  const curSkus = new Set(current.map((c) => c.sku));

  const changes: PipedriveChanges<T> = {
    newInPd: [],
    updatedInPd: [],
    retireInPd: [],
    blockingDuplicates: [],
    otherDuplicates: [],
    flaggedRemoval: [],
  };

  for (const cur of current) {
    const matches = byCode.get(cur.sku) ?? [];

    if (matches.length > 1) {
      changes.blockingDuplicates.push({ code: cur.sku, products: matches });
      continue;
    }
    const product = matches[0];

    // current_products has no `active` filter, so portal-deactivated SKUs still
    // resolve here. Inactive means retire: never create it, never push it back
    // onto the picker. Already-retired and absent products are skipped, which is
    // what makes a second run a no-op.
    if (!cur.active) {
      if (product && product.is_linkable) changes.retireInPd.push({ cur, product });
      continue;
    }

    if (!product) {
      changes.newInPd.push(cur);
      continue;
    }

    const reasons: UpdateReason[] = [];
    if (product.name !== pdName(cur.product_name, cur.price_type)) reasons.push("name");
    if (usdPrice(product) !== pdPrice(cur.price_type, cur.msrp)) reasons.push("price");
    // The inverse of retiring: a SKU reactivated in the portal goes back on the
    // picker on the next run.
    if (!product.is_linkable) reasons.push("relink");
    if (reasons.length > 0) changes.updatedInPd.push({ cur, product, reasons });
  }

  for (const [code, products] of byCode) {
    if (curSkus.has(code)) continue;
    changes.flaggedRemoval.push(...products);
    if (products.length > 1) changes.otherDuplicates.push({ code, products });
  }

  return changes;
}

// The existing prices in request shape. Sent back unchanged on every PATCH,
// because the v2 docs say an omitted `prices` assigns a default price of 0.
function toPriceRequests(prices: readonly PdPrice[] | null): PdPriceRequest[] {
  return (prices ?? []).map((p) => {
    const out: PdPriceRequest = { price: Number(p.price), currency: p.currency };
    if (p.cost != null) out.cost = Number(p.cost);
    if (p.direct_cost != null) out.direct_cost = Number(p.direct_cost);
    if (p.notes != null) out.notes = p.notes;
    return out;
  });
}

export function buildCreatePayload(cur: SyncProduct): PdProductRequest {
  return {
    name: pdName(cur.product_name, cur.price_type),
    code: cur.sku,
    prices: [{ price: pdPrice(cur.price_type, cur.msrp), currency: "USD" }],
    is_linkable: true,
  };
}

// Name, USD price and linkability from the portal. Any other currency's
// price, and the cost fields on the USD entry, are carried over as they are.
export function buildUpdatePayload(cur: SyncProduct, product: PdProduct): PdProductRequest {
  const price = pdPrice(cur.price_type, cur.msrp);
  const prices = toPriceRequests(product.prices);
  const usd = prices.find((p) => p.currency === "USD");
  if (usd) usd.price = price;
  else prices.push({ price, currency: "USD" });
  return {
    name: pdName(cur.product_name, cur.price_type),
    code: cur.sku,
    prices,
    is_linkable: true,
  };
}

// Off the picker, nothing else changed. The price of a retired product is not
// refreshed.
export function buildRetirePayload(product: PdProduct): PdProductRequest {
  return { is_linkable: false, prices: toPriceRequests(product.prices) };
}
