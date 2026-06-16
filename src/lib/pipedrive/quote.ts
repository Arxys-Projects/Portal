import {
  PipedriveError,
  pipedriveClient,
  type PdContactValue,
  type PdDealDetail,
  type PdDealProduct,
} from "./client";

// ---------------------------------------------------------------------------
// Project Quote read layer (Phase 10 Step 4).
//
// Headless data access for the future Project Quote. getDealForQuote(dealId)
// pulls one deal's commercial surface from Pipedrive and returns a validated,
// typed structure. It renders nothing, stores nothing, and writes nothing.
//
// Binding rules (locked in the 2026-06-15 Project Quote planning entry):
//   - Prices flow Pipedrive -> portal, never recomputed. Every unit price,
//     discount, line amount, and total is passed through EXACTLY as Pipedrive
//     returns it. This layer never sums lines, derives a total, or computes a
//     discounted unit price. Pipedrive is the single source of pricing truth.
//   - Line-item order is preserved exactly as Pipedrive returns it. We do not
//     re-sort by order_nr; we expose order_nr as a passthrough field.
//   - dealId is the authoritative key. This function reads exactly that deal.
//     It never searches or guesses.
//
// The auth/client pattern is reused verbatim from src/lib/pipedrive/client.ts
// (the same token-appending fetch wrapper and PipedriveError surface the write
// path uses). No new HTTP client, no new auth path.
// ---------------------------------------------------------------------------

// A raw Pipedrive money value, passed through verbatim. Never rounded, summed,
// or recomputed by this layer.
export type Money = number;

export type QuoteLineItem = {
  // Product attachment id and the underlying product id.
  productId: number;
  // Product code (e.g. "VX5-V255-MGM"). Lives on the product record, fetched
  // by product_id. null when the product was deleted or carries no code.
  productCode: string | null;
  productName: string | null;
  // item_price - the unit price / MSRP, verbatim.
  unitPrice: Money | null;
  // The raw discount value and its type, verbatim. discount_type is
  // "percentage" or "amount".
  discount: number | null;
  discountType: string | null;
  // Convenience: the discount as a percent when discount_type === "percentage",
  // else null. This is a classification of the raw value, not a price
  // computation.
  discountPercent: number | null;
  // Pipedrive does not expose a discounted unit price on the line; deriving one
  // would recompute a price, which this layer must never do. Always null;
  // the renderer (Step 5) shows unitPrice, discount, and lineAmount instead.
  discountedUnitPrice: Money | null;
  quantity: number | null;
  // sum - the extended/discounted line amount, verbatim.
  lineAmount: Money | null;
  currency: string | null;
  // Pipedrive's line ordering value, passed through. Order in the array is
  // already Pipedrive's returned order; this is exposed for reference only.
  orderNr: number | null;
  // True for a $0 / 0%-discount "info-only" line (e.g. a bundled warranty row):
  // both unitPrice and lineAmount are zero or null. The renderer decides how to
  // blank the price cells; this layer just flags the shape faithfully.
  isInfoOnly: boolean;
};

export type QuoteOrganization = {
  name: string | null;
  address: string | null;
};

export type QuotePerson = {
  name: string | null;
  email: string | null;
  phone: string | null;
};

export type DealQuote = {
  // The deal id (becomes the quote number in a later step).
  dealId: number;
  dealTitle: string | null;
  // update_time - the deal's last-modified timestamp, verbatim. Feeds staleness
  // logic in a later step; captured here, not acted on.
  updatedAt: string | null;
  // Deal owner (user) name, from the inlined user_id object. null when unset.
  owner: string | null;
  // Linked organization / person. null when the deal has no link at all; an
  // individual field is null when that field is missing on the linked record.
  organization: QuoteOrganization | null;
  person: QuotePerson | null;
  lineItems: QuoteLineItem[];
  // The deal's authoritative total (deal `value`), verbatim. NOT derived from
  // the line items.
  productTotal: Money | null;
  // The deal-level additional-discounts / tariff value, verbatim. See
  // ADDITIONAL_DISCOUNTS_DEAL_FIELD_KEY below: no such field is configured in
  // the Pipedrive account today, so this resolves to null.
  additionalDiscounts: Money | null;
  currency: string | null;
  // True when the deal has zero product line items - a valid, expected state
  // (the rep has not done the commercial work yet). The empty-deal GUARD
  // (refusing to generate) is Step 6; this layer just reports the state.
  isEmpty: boolean;
};

export type QuoteErrorKind = "not_found" | "auth" | "rate_limit" | "network" | "api";

export type QuoteError = {
  kind: QuoteErrorKind;
  status?: number;
  message: string;
};

export type GetDealForQuoteResult =
  | { ok: true; deal: DealQuote }
  | { ok: false; error: QuoteError };

// ---------------------------------------------------------------------------
// Pinned field keys.
//
// The deal-level "additional discounts / tariff" field referenced by the quote
// planning entry is NOT configured in this Pipedrive account: it has no entry
// in /v1/dealFields, the v2 deal-discounts endpoint is empty, and a real
// 10-line deal's `value` equals the exact sum of its line amounts (verified
// 2026-06-16). Until Arxys adds such a field, this stays null and
// additionalDiscounts resolves to null. When the field is added, pin its hashed
// deal-field key here (the same name-or-key pinning convention used in
// lookups.ts), so the read is reviewable in one place.
const ADDITIONAL_DISCOUNTS_DEAL_FIELD_KEY: string | null = null;

// Pick the primary contact value (email/phone), falling back to the first
// entry, returning null when the array is empty or absent.
function pickPrimaryContactValue(values: PdContactValue[] | null | undefined): string | null {
  if (!values || values.length === 0) return null;
  const primary = values.find((v) => v.primary);
  const chosen = primary ?? values[0];
  const raw = chosen?.value;
  return raw && raw.length > 0 ? raw : null;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// Coerce a raw Pipedrive numeric to Money, preserving the value verbatim.
// Returns null for missing/non-finite values. Does not round or transform.
function toMoney(v: unknown): Money | null {
  return isFiniteNumber(v) ? v : null;
}

function mapOrganization(org: PdDealDetail["org_id"]): QuoteOrganization | null {
  if (!org) return null;
  return {
    name: org.name ?? null,
    address: org.address ?? null,
  };
}

function mapPerson(person: PdDealDetail["person_id"]): QuotePerson | null {
  if (!person) return null;
  return {
    name: person.name ?? null,
    email: pickPrimaryContactValue(person.email),
    phone: pickPrimaryContactValue(person.phone),
  };
}

function mapLineItem(line: PdDealProduct, code: string | null): QuoteLineItem {
  const unitPrice = toMoney(line.item_price);
  const lineAmount = toMoney(line.sum);
  const discount = isFiniteNumber(line.discount) ? line.discount : null;
  const discountType = line.discount_type ?? null;
  return {
    productId: line.product_id,
    productCode: code,
    productName: line.name ?? null,
    unitPrice,
    discount,
    discountType,
    discountPercent: discountType === "percentage" ? discount : null,
    // Never derived - Pipedrive does not provide a discounted unit price.
    discountedUnitPrice: null,
    quantity: isFiniteNumber(line.quantity) ? line.quantity : null,
    lineAmount,
    currency: line.currency ?? null,
    orderNr: isFiniteNumber(line.order_nr) ? line.order_nr : null,
    isInfoOnly: (unitPrice === null || unitPrice === 0) && (lineAmount === null || lineAmount === 0),
  };
}

// Map a thrown error (PipedriveError from the shared client, or a network-level
// throw) to a typed QuoteError. Mirrors the existing PipedriveError idiom: the
// client throws, this read layer classifies so callers never crash.
function classifyError(err: unknown): QuoteError {
  if (err instanceof PipedriveError) {
    const status = err.status;
    if (status === 401 || status === 403) return { kind: "auth", status, message: err.message };
    if (status === 404) return { kind: "not_found", status, message: err.message };
    if (status === 429) return { kind: "rate_limit", status, message: err.message };
    // A non-JSON / transport-level failure surfaces as a PipedriveError with a
    // null body and a "returned non-JSON" message.
    if (err.body === null) return { kind: "network", status, message: err.message };
    return { kind: "api", status, message: err.message };
  }
  const message = err instanceof Error ? err.message : "Unknown Pipedrive read error";
  return { kind: "network", message };
}

// Resolve product codes for the deal's lines. One read per DISTINCT product_id,
// run concurrently (matching the Promise.all idiom in deal.ts). A per-product
// failure degrades that code to null rather than failing the whole quote read.
async function resolveProductCodes(
  lines: PdDealProduct[],
): Promise<Map<number, string | null>> {
  const ids = Array.from(new Set(lines.map((l) => l.product_id).filter(isFiniteNumber)));
  const entries = await Promise.all(
    ids.map(async (id): Promise<[number, string | null]> => {
      try {
        const product = await pipedriveClient.getProduct(id);
        return [id, product.code ?? null];
      } catch {
        return [id, null];
      }
    }),
  );
  return new Map(entries);
}

// Single entry point for the read path. Takes a deal id and returns the typed,
// validated quote structure or a typed error. Never throws, never writes.
export async function getDealForQuote(dealId: number): Promise<GetDealForQuoteResult> {
  if (!Number.isInteger(dealId) || dealId <= 0) {
    return { ok: false, error: { kind: "api", message: `Invalid deal id: ${String(dealId)}` } };
  }

  let deal: PdDealDetail;
  let rawProducts: PdDealProduct[] | null;
  try {
    // The deal detail carries the inlined owner/person/org; the products call
    // carries the line items. Both are independent reads on the same deal.
    [deal, rawProducts] = await Promise.all([
      pipedriveClient.getDeal(dealId),
      pipedriveClient.getDealProducts(dealId),
    ]);
  } catch (err) {
    return { ok: false, error: classifyError(err) };
  }

  const lines = rawProducts ?? [];

  let codeByProductId: Map<number, string | null>;
  try {
    codeByProductId = await resolveProductCodes(lines);
  } catch (err) {
    // resolveProductCodes already swallows per-product failures; this guards an
    // unexpected throw so the read still returns the deal (codes default null).
    void err;
    codeByProductId = new Map();
  }

  // Preserve Pipedrive's returned line order exactly - no re-sort.
  const lineItems = lines.map((line) =>
    mapLineItem(line, codeByProductId.get(line.product_id) ?? null),
  );

  const additionalDiscounts = ADDITIONAL_DISCOUNTS_DEAL_FIELD_KEY
    ? toMoney(deal[ADDITIONAL_DISCOUNTS_DEAL_FIELD_KEY])
    : null;

  const quote: DealQuote = {
    dealId: deal.id,
    dealTitle: deal.title ?? null,
    updatedAt: deal.update_time ?? null,
    owner: deal.user_id?.name ?? null,
    organization: mapOrganization(deal.org_id),
    person: mapPerson(deal.person_id),
    lineItems,
    productTotal: toMoney(deal.value),
    additionalDiscounts,
    currency: deal.currency ?? null,
    isEmpty: lineItems.length === 0,
  };

  return { ok: true, deal: quote };
}
