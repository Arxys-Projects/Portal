// Line-item fingerprints, drift detection, and the one-line products display.
//
// Pure: no Supabase, no Pipedrive client, no framework. The only imports are
// TYPE-only, which are erased at compile time, so this module runs under plain
// Node in line-items.test.ts.
//
// ---------------------------------------------------------------------------
// What drift detection actually compares, and why
// ---------------------------------------------------------------------------
//
// The spec asks for "a timestamp of the deal's last line-item change, compared
// against current_quote_generated_at, plus a count of differing lines".
//
// Pipedrive cannot supply that timestamp. A deal-product carries add_time, so an
// ADDED line is datable, but a DELETED line leaves nothing behind at all — and a
// deleted line is exactly the change that most badly invalidates a proposal
// already in front of a customer. The deal's own update_time moves for edits that
// have nothing to do with products, so it is not a substitute. So the timestamp is
// OBSERVED rather than reported: the cache stores a fingerprint of the lines as
// last read and stamps line_items_changed_at when a refresh sees a different one
// (ADR 0113). It is honest about being "when we first saw this", and monotonic.
//
// The COUNT is the part that carries the real weight, and it needs no timestamp
// at all: the lines a proposal was built from are already frozen in
// project_quotes.snapshot.commercial.lineItems, so diffing the deal as last read
// against that snapshot is a direct answer to "does v2 still match the deal".
// That comparison is the authoritative signal and it is what row_state uses;
// the timestamp is only ever copy.
//
// Two fields are deliberately EXCLUDED from the comparison:
//
//   * `code` — the product code lives on the product record, not on the deal
//     line, so recovering it costs one extra Pipedrive read per distinct product.
//     The cache refresh does not pay that cost (see pipedrive-cache.ts), so codes
//     arrive null from the deal side and non-null from the frozen snapshot side.
//     Comparing them would report drift on every line of every project, forever.
//   * `name` — a re-labelled line is not a change to what the customer is being
//     quoted, and the PDF prints the label frozen in its own snapshot regardless.
//
// What remains is the commercial substance: which product, how many, at what unit
// price, for what line amount. A change to any of those genuinely means the
// document no longer matches the deal.

import type { PdDealProduct } from "@/lib/pipedrive/client";
import type { DealLineFingerprint } from "./types";

// ---------------------------------------------------------------------------
// Coercion helpers — every input here is either jsonb or a third-party payload,
// so nothing is trusted and nothing is cast.
// ---------------------------------------------------------------------------

function finiteOrNull(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  // Postgres numeric arrives from PostgREST as a string.
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function stringOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

// Sort so the stored array is order-stable across reads: Pipedrive's returned
// order is preserved by the quote read layer but is not guaranteed identical
// between calls, and a re-ordered array must not read as a change. order_nr
// first (Pipedrive's own ordering), then product_id, then the attachment id, so
// two attachments of the same product still sort deterministically.
function byStableOrder(
  a: { order_nr: number | null; product_id: number; attachment_id: number },
  b: { order_nr: number | null; product_id: number; attachment_id: number },
): number {
  const ao = a.order_nr ?? Number.MAX_SAFE_INTEGER;
  const bo = b.order_nr ?? Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  if (a.product_id !== b.product_id) return a.product_id - b.product_id;
  return a.attachment_id - b.attachment_id;
}

// ---------------------------------------------------------------------------
// Fingerprints
// ---------------------------------------------------------------------------

// From a live Pipedrive `GET /deals/{id}/products` payload. `data` comes back
// null (not []) when a deal has no products attached, which is a legitimate
// state, not an error. `code` is null from this side by design (see the header).
export function fingerprintDealProducts(
  lines: PdDealProduct[] | null | undefined,
): DealLineFingerprint[] {
  if (!Array.isArray(lines)) return [];
  return lines
    .map((line) => ({
      product_id: Number(line.product_id),
      order_nr: finiteOrNull(line.order_nr),
      attachment_id: finiteOrNull(line.id) ?? 0,
      code: null as string | null,
      name: stringOrNull(line.name),
      quantity: finiteOrNull(line.quantity),
      unit_price: finiteOrNull(line.item_price),
      line_amount: finiteOrNull(line.sum),
    }))
    .filter((l) => Number.isFinite(l.product_id))
    .sort(byStableOrder)
    .map(({ order_nr: _order, attachment_id: _attachment, ...rest }) => rest);
}

// From the frozen project_quotes.snapshot.commercial.lineItems (QuoteLineItem[]),
// read out of jsonb. Every field is treated as untrusted: a row frozen by an
// older snapshot version may be missing any of them.
export function fingerprintSnapshotLineItems(raw: unknown): DealLineFingerprint[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      const line = (entry ?? {}) as Record<string, unknown>;
      return {
        product_id: Number(line.productId),
        order_nr: finiteOrNull(line.orderNr),
        attachment_id: 0,
        code: stringOrNull(line.productCode),
        name: stringOrNull(line.productName),
        quantity: finiteOrNull(line.quantity),
        unit_price: finiteOrNull(line.unitPrice),
        line_amount: finiteOrNull(line.lineAmount),
      };
    })
    .filter((l) => Number.isFinite(l.product_id))
    .sort(byStableOrder)
    .map(({ order_nr: _order, attachment_id: _attachment, ...rest }) => rest);
}

// From a pipedrive_deal_cache.line_items jsonb column round-trip. Same shape
// going out as coming in, but re-coerced because jsonb is jsonb.
export function fingerprintFromCacheColumn(raw: unknown): DealLineFingerprint[] | null {
  if (raw === null || raw === undefined) return null;
  if (!Array.isArray(raw)) return null;
  return raw
    .map((entry) => {
      const line = (entry ?? {}) as Record<string, unknown>;
      return {
        product_id: Number(line.product_id),
        code: stringOrNull(line.code),
        name: stringOrNull(line.name),
        quantity: finiteOrNull(line.quantity),
        unit_price: finiteOrNull(line.unit_price),
        line_amount: finiteOrNull(line.line_amount),
      };
    })
    .filter((l) => Number.isFinite(l.product_id));
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

// The comparable substance of one line. code and name are excluded (header).
function commercialKey(line: DealLineFingerprint): string {
  return [line.product_id, line.quantity, line.unit_price, line.line_amount].join("|");
}

// True when two fingerprints describe the same set of lines. Drives the cache's
// "did the deal's lines change since we last looked" stamp, so it compares the
// same fields the drift count does — a change that does not move the count must
// not move the timestamp either.
export function sameLineItems(
  a: DealLineFingerprint[] | null,
  b: DealLineFingerprint[] | null,
): boolean {
  if (a === null || b === null) return a === b;
  if (a.length !== b.length) return false;
  const ka = a.map(commercialKey).sort();
  const kb = b.map(commercialKey).sort();
  return ka.every((k, i) => k === kb[i]);
}

export type LineItemDrift = {
  // Lines present on both sides for the same product, with different numbers.
  changed: number;
  // On the deal, absent from the proposal.
  added: number;
  // In the proposal, no longer on the deal.
  removed: number;
  // changed + added + removed — the "count of differing lines" the row strip
  // reports.
  total: number;
};

export const NO_DRIFT: LineItemDrift = { changed: 0, added: 0, removed: 0, total: 0 };

// Diff the deal as last read against the proposal's frozen lines.
//
// Pairing is by product_id as a MULTISET, so a deal carrying the same product on
// two lines is handled, and only then are the numbers compared. Doing it that
// way is what makes a single quantity edit count as one changed line rather than
// as one removal plus one addition — which matters, because the number lands in
// user-facing copy ("v2 no longer matches the deal").
export function diffLineItems(
  dealLines: DealLineFingerprint[] | null,
  quoteLines: DealLineFingerprint[] | null,
): LineItemDrift {
  // Nothing to compare: either the proposal does not exist or the deal has never
  // been read successfully. Reporting drift from an absent comparison basis would
  // put an amber "no longer matches the deal" strip on a row nobody has looked
  // at, which is worse than saying nothing.
  if (dealLines === null || quoteLines === null) return NO_DRIFT;

  const byProduct = new Map<number, DealLineFingerprint[]>();
  for (const line of quoteLines) {
    const list = byProduct.get(line.product_id) ?? [];
    list.push(line);
    byProduct.set(line.product_id, list);
  }

  let changed = 0;
  let added = 0;

  for (const dealLine of dealLines) {
    const candidates = byProduct.get(dealLine.product_id);
    if (!candidates || candidates.length === 0) {
      added += 1;
      continue;
    }
    // Prefer an exact match so that when a product appears twice and only one of
    // the two was edited, the untouched line is not the one reported as changed.
    const key = commercialKey(dealLine);
    const exact = candidates.findIndex((c) => commercialKey(c) === key);
    if (exact >= 0) {
      candidates.splice(exact, 1);
    } else {
      candidates.shift();
      changed += 1;
    }
  }

  let removed = 0;
  for (const leftovers of byProduct.values()) removed += leftovers.length;

  return { changed, added, removed, total: changed + added + removed };
}

// ---------------------------------------------------------------------------
// The products line
// ---------------------------------------------------------------------------

// How many products the line names before it collapses into "+N more". The spec
// shows two ("0 × Model · 0 × Model +3 more"); the rule that matters is that the
// line "counts what it hid" and is never a bare ellipsis.
export const PRODUCTS_DISPLAY_MAX_ITEMS = 2;

// A UUID-shaped recommended_product_id marks a pre-Step-3+4 submission whose FK
// target was dropped; modern rows carry SKU strings, which never look like UUIDs.
function isUuidShaped(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function formatQuantity(quantity: number | null): string {
  if (quantity === null) return "1";
  return Number.isInteger(quantity) ? String(quantity) : String(quantity);
}

// The Quoted products line, built from the current proposal's FROZEN lines — not
// from the live deal. The line must describe the document he would send, so it
// tracks the snapshot even when the deal has since drifted; the drift strip is
// what says the two disagree.
export function quotedProductsDisplay(lines: DealLineFingerprint[]): string {
  if (lines.length === 0) return "No line items on the proposal";
  const shown = lines.slice(0, PRODUCTS_DISPLAY_MAX_ITEMS);
  const hidden = lines.length - shown.length;
  const head = shown
    .map((l) => `${formatQuantity(l.quantity)} × ${l.code ?? l.name ?? `Product ${l.product_id}`}`)
    .join(" · ");
  return hidden > 0 ? `${head} +${hidden} more` : head;
}

// The Recommended products line: calculator output, before any proposal exists.
// The page renders this in italic grey prefixed "Calculator output, not yet
// quoted", so this string must not try to look quoted.
export function recommendedProductsDisplay(
  sku: string | null,
  units: number | null,
): string {
  if (!sku) return "No recommendation recorded";
  if (isUuidShaped(sku)) return "Recommendation unavailable (legacy submission)";
  const count = units !== null && Number.isFinite(units) && units > 0 ? units : 1;
  return `${count} × ${sku}`;
}
