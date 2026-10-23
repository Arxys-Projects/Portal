// The pure half of Step 5's project deal lines (ADR 0170): banked BOM plus the
// Pipedrive product list in, deal lines or refusals out; and the diff of a
// deal's lines against the BOM. No env, no fetch, no database.
//
// Prices are Pipedrive's. Each line carries its product's USD price exactly as
// GET /api/v2/products returned it, and nothing here multiplies, adds, rounds
// or discounts it. The portal never reads current_products for these lines.

import { groupByCode, pdName, usdPrice, type PdProduct } from "@/lib/pipedrive/product-sync";
import type { PdV2DealProduct } from "@/lib/pipedrive/project-deal-api";
import { SERVER_ROLES, type ServerRole } from "@/lib/system-design/rules";
import type { DealLineFingerprint } from "./types";

export type BomLineIn = { sku: string; qty: number; role: ServerRole };

export type PreviewLine = {
  sku: string;
  qty: number;
  role: ServerRole;
  pipedriveProductId: number;
  // The product's USD price, verbatim.
  unitPrice: number;
};

export type LineRefusalReason =
  | "missing"
  | "duplicate-code"
  | "not-linkable"
  | "no-usd-price"
  | "zero-price"
  | "market-price"
  | "call-for-quote";

export type LineRefusal = { sku: string; role: ServerRole; reason: LineRefusalReason; message: string };

export type PlannedLines =
  | { ok: true; lines: PreviewLine[]; fingerprint: DealLineFingerprint[] }
  | { ok: false; refusals: LineRefusal[] };

const MKT_PREFIX = pdName("", "market");
const CFQ_PREFIX = pdName("", "call_for_quote");

// The banked BOM, checked. It is server-written (ADR 0165), but it is jsonb, so
// a bad row is refused here instead of reaching Pipedrive.
export function parseBankedBom(raw: unknown): { ok: true; bom: BomLineIn[] } | { ok: false; message: string } {
  if (!Array.isArray(raw)) return { ok: false, message: "The banked BOM is not a list." };
  const bom: BomLineIn[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const line = (entry ?? {}) as Record<string, unknown>;
    const sku = typeof line.sku === "string" ? line.sku.trim() : "";
    const role = line.role as ServerRole;
    const qty = line.qty;
    if (!sku || !SERVER_ROLES.includes(role) || typeof qty !== "number" || !Number.isInteger(qty) || qty <= 0) {
      return { ok: false, message: `The banked BOM has an unreadable line: ${JSON.stringify(entry)}.` };
    }
    const key = `${sku}|${role}`;
    // ADR 0161: one line per SKU and role. A repeat would break the ledger's key.
    if (seen.has(key)) return { ok: false, message: `The banked BOM lists ${sku} as ${role} twice.` };
    seen.add(key);
    bom.push({ sku, qty, role });
  }
  if (bom.length === 0) return { ok: false, message: "The banked BOM is empty." };
  return { ok: true, bom };
}

const byLineOrder = (a: { sku: string; role: string }, b: { sku: string; role: string }) =>
  a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : a.role < b.role ? -1 : a.role > b.role ? 1 : 0;

// Resolve each BOM line to its Pipedrive product by exact code. Refuses the
// whole set, listing every offender, when any line cannot be sent as is.
// Duplicate codes block only when the BOM uses the code.
export function planDealLines(bom: readonly BomLineIn[], products: readonly PdProduct[]): PlannedLines {
  const byCode = groupByCode(products);
  const refusals: LineRefusal[] = [];
  const lines: PreviewLine[] = [];
  const refuse = (line: BomLineIn, reason: LineRefusalReason, message: string) =>
    refusals.push({ sku: line.sku, role: line.role, reason, message });

  for (const line of [...bom].sort(byLineOrder)) {
    const matches = byCode.get(line.sku) ?? [];
    if (matches.length === 0) {
      refuse(line, "missing", `${line.sku}: no Pipedrive product has this code.`);
      continue;
    }
    if (matches.length > 1) {
      const ids = matches.map((p) => `#${p.id}`).join(", ");
      refuse(line, "duplicate-code", `${line.sku}: ${matches.length} Pipedrive products share this code (${ids}).`);
      continue;
    }
    const product = matches[0];
    if (!product.is_linkable) {
      refuse(line, "not-linkable", `${line.sku}: Pipedrive product #${product.id} is off the deal picker.`);
      continue;
    }
    if (product.name.startsWith(MKT_PREFIX)) {
      refuse(line, "market-price", `${line.sku}: Pipedrive product #${product.id} is a market-price item.`);
      continue;
    }
    if (product.name.startsWith(CFQ_PREFIX)) {
      refuse(line, "call-for-quote", `${line.sku}: Pipedrive product #${product.id} is a call-for-quote item.`);
      continue;
    }
    const price = usdPrice(product);
    if (price === null || !Number.isFinite(price)) {
      refuse(line, "no-usd-price", `${line.sku}: Pipedrive product #${product.id} has no USD price.`);
      continue;
    }
    if (price <= 0) {
      refuse(line, "zero-price", `${line.sku}: Pipedrive product #${product.id} is priced at $0.`);
      continue;
    }
    lines.push({ sku: line.sku, qty: line.qty, role: line.role, pipedriveProductId: product.id, unitPrice: price });
  }

  if (refusals.length > 0) return { ok: false, refusals };
  const names = new Map(products.map((p) => [p.id, p.name]));
  return { ok: true, lines, fingerprint: fingerprintPreview(lines, names) };
}

// The preview in the DealLineFingerprint shape, compared only with a fresh
// preview (sameLineItems). line_amount stays null: computing qty × price would
// be price math. It is never compared with a deal read-back, where Pipedrive
// fills line_amount and name and the code is null.
export function fingerprintPreview(
  lines: readonly PreviewLine[],
  names: ReadonlyMap<number, string>,
): DealLineFingerprint[] {
  return [...lines].sort(byLineOrder).map((l) => ({
    product_id: l.pipedriveProductId,
    code: l.sku,
    name: names.get(l.pipedriveProductId) ?? null,
    quantity: l.qty,
    unit_price: l.unitPrice,
    line_amount: null,
  }));
}

// The role travels in the deal line's comment, so a retry and the diff can
// tell two roles of one SKU apart. Read back case-insensitively in case a rep
// retypes it.
export function roleComment(role: ServerRole): string {
  return `Arxys role: ${role}`;
}

const ROLE_COMMENT = /arxys role:\s*(recorder|failover|mgmt|workstation)\b/i;

export function roleFromComment(comments: string | null | undefined): ServerRole | null {
  const match = ROLE_COMMENT.exec(comments ?? "");
  return match ? (match[1].toLowerCase() as ServerRole) : null;
}

// ---------------------------------------------------------------------------
// Diff: banked BOM against the deal's current lines, by SKU and role.
// ---------------------------------------------------------------------------

export type DealLinesDiff = {
  clean: boolean;
  // In the BOM, not on the deal.
  missing: { sku: string; role: ServerRole; qty: number }[];
  // On the deal, not in the BOM. sku is null for a product with no code; role
  // is null when the comment carries none (a line a rep added by hand).
  extra: { sku: string | null; role: ServerRole | null; qty: number | null; productId: number; attachmentId: number }[];
  // Same SKU and role, different quantity.
  quantity: { sku: string; role: ServerRole; expected: number; actual: number | null; attachmentId: number }[];
  // Same SKU and quantity, under another role on the deal.
  role: { sku: string; expected: ServerRole; actual: ServerRole; qty: number; attachmentId: number }[];
};

export function diffBomAgainstDeal(
  bom: readonly BomLineIn[],
  dealLines: readonly PdV2DealProduct[],
  codeByProductId: ReadonlyMap<number, string>,
): DealLinesDiff {
  const expected = new Map(bom.map((l) => [`${l.sku}|${l.role}`, l]));
  const diff: DealLinesDiff = { clean: true, missing: [], extra: [], quantity: [], role: [] };
  const sorted = [...dealLines].sort((a, b) => a.id - b.id);

  for (const line of sorted) {
    const sku = codeByProductId.get(line.product_id) ?? null;
    const role = roleFromComment(line.comments);
    const qty = typeof line.quantity === "number" ? line.quantity : null;
    const want = sku && role ? expected.get(`${sku}|${role}`) : undefined;
    if (!want) {
      diff.extra.push({ sku, role, qty, productId: line.product_id, attachmentId: line.id });
      continue;
    }
    expected.delete(`${want.sku}|${want.role}`);
    if (qty !== want.qty) {
      diff.quantity.push({ sku: want.sku, role: want.role, expected: want.qty, actual: qty, attachmentId: line.id });
    }
  }
  diff.missing = [...expected.values()].sort(byLineOrder).map((l) => ({ sku: l.sku, role: l.role, qty: l.qty }));

  // A missing line and an extra line of the same SKU and quantity, both with a
  // role, is one line filed under the other role.
  for (const miss of [...diff.missing]) {
    const i = diff.extra.findIndex((e) => e.sku === miss.sku && e.role !== null && e.qty === miss.qty);
    if (i < 0) continue;
    const [extra] = diff.extra.splice(i, 1);
    diff.missing.splice(diff.missing.indexOf(miss), 1);
    diff.role.push({ sku: miss.sku, expected: miss.role, actual: extra.role as ServerRole, qty: miss.qty, attachmentId: extra.attachmentId });
  }

  diff.clean = diff.missing.length + diff.extra.length + diff.quantity.length + diff.role.length === 0;
  return diff;
}
