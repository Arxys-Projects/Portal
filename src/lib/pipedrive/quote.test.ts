import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Env vars must exist before the env module materializes them.
process.env.PIPEDRIVE_API_TOKEN ??= "test-token";

// The Pipedrive modules import the shared client; `npm test` passes
// --conditions=react-server so the (absent) "server-only" import resolves
// empty under plain Node, matching the Next.js server runtime.

type FetchCall = { url: string; method: string; body: unknown };
const calls: FetchCall[] = [];

type Responder = (url: URL, method: string, body: unknown) => unknown;
let responder: Responder = () => ({});

// A failing responder may throw, or return { __status, __body } to drive a
// non-200 envelope so the client raises a PipedriveError with that status.
function installFetchMock(): void {
  globalThis.fetch = (async (input: Request | string | URL, init?: RequestInit) => {
    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(urlStr);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url: urlStr, method, body });
    const data = responder(url, method, body) as
      | { __status?: number; __body?: unknown; __error?: string }
      | unknown;
    if (data && typeof data === "object" && "__status" in data) {
      const d = data as { __status: number; __error?: string; __body?: unknown };
      return new Response(JSON.stringify({ success: false, error: d.__error ?? "err", data: d.__body ?? null }), {
        status: d.__status,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

// ---------------------------------------------------------------------------
// Fixtures. Sanitized to clearly-fake data matching the real /v1 response
// shapes captured 2026-06-16 (deal detail inlines user_id/person_id/org_id;
// line items carry item_price/discount/discount_type/quantity/sum/order_nr;
// product code lives on the product record). No real customer PII.
// ---------------------------------------------------------------------------

const DEAL_ID = 4822;

// Product code lookup by product_id, returned from GET /v1/products/{id}.
const PRODUCT_CODES: Record<number, string> = {
  101: "VX5-V800-720",
  102: "VX5-V255-MGM",
  103: "VX5-WTY-5YR",
  104: "MKT-DRAM-32",
};

// A multi-line deal modeled on the real Kean deal 4822 shape: priced lines, a
// $0 info-only warranty line, and a priced [MKT] custom line. The deal `value`
// is INTENTIONALLY not equal to the sum of the line amounts (see the
// pass-through test) to prove the layer reports value verbatim and never
// recomputes a total from the lines.
const LINE_SUM = 244358.4 + 8896.25 + 0 + 23450; // = 276704.65
const DEAL_VALUE_VERBATIM = 999999.99; // deliberately != LINE_SUM

const dealProducts = [
  {
    id: 9001,
    product_id: 101,
    name: "VideoX V800 720TB 4U 36Bay Rack - Net usable",
    item_price: 74048,
    discount: 45,
    discount_type: "percentage",
    quantity: 6,
    sum: 244358.4,
    currency: "USD",
    order_nr: 0,
  },
  {
    id: 9002,
    product_id: 102,
    name: "VideoX V5 V255 Management/Directory Performance Server",
    item_price: 16175,
    discount: 45,
    discount_type: "percentage",
    quantity: 1,
    sum: 8896.25,
    currency: "USD",
    order_nr: 1,
  },
  {
    // $0 info-only warranty line.
    id: 9003,
    product_id: 103,
    name: "VideoX Enterprise 5 Year Warranty - Next Business Day",
    item_price: 0,
    discount: 0,
    discount_type: "percentage",
    quantity: 9,
    sum: 0,
    currency: "USD",
    order_nr: 2,
  },
  {
    // Priced [MKT] custom line - ordinary product with a price.
    id: 9004,
    product_id: 104,
    name: "[MKT] 32GB ECC DRAM DDR5 - Upgrade - Custom Quote",
    item_price: 3350,
    discount: 0,
    discount_type: "percentage",
    quantity: 7,
    sum: 23450,
    currency: "USD",
    order_nr: 3,
  },
];

function dealDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: DEAL_ID,
    title: "Fake University | Campus Surveillance | 2026-06-16",
    value: DEAL_VALUE_VERBATIM,
    currency: "USD",
    update_time: "2026-06-16 14:44:47",
    user_id: { id: 101, name: "Andy Newbom", email: "andy@arxys.example" },
    person_id: {
      value: 555,
      name: "Pat Buyer",
      email: [{ value: "pat@fake.example", primary: true, label: "work" }],
      phone: [{ value: "+1-555-0100", primary: true, label: "work" }],
    },
    org_id: {
      value: 777,
      name: "Fake University",
      address: "123 Example Ave, Springfield",
    },
    products_count: dealProducts.length,
    ...overrides,
  };
}

function defaultResponder(url: URL, method: string): unknown {
  const path = url.pathname;
  if (path === `/v1/deals/${DEAL_ID}` && method === "GET") return dealDetail();
  if (path === `/v1/deals/${DEAL_ID}/products` && method === "GET") return dealProducts;
  const productMatch = path.match(/^\/v1\/products\/(\d+)$/);
  if (productMatch && method === "GET") {
    const id = Number(productMatch[1]);
    return { id, code: PRODUCT_CODES[id] ?? null, name: `Product ${id}` };
  }
  throw new Error(`Unmocked request: ${method} ${path}`);
}

let getDealForQuote: typeof import("./quote").getDealForQuote;

before(async () => {
  installFetchMock();
  ({ getDealForQuote } = await import("./quote"));
});

beforeEach(() => {
  calls.length = 0;
  responder = (url, method) => defaultResponder(url, method);
});

describe("getDealForQuote - normal multi-line deal", () => {
  it("returns the typed quote with metadata, owner, org, person, and lines in Pipedrive order", async () => {
    const result = await getDealForQuote(DEAL_ID);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const q = result.deal;

    assert.equal(q.dealId, DEAL_ID);
    assert.equal(q.dealTitle, "Fake University | Campus Surveillance | 2026-06-16");
    assert.equal(q.updatedAt, "2026-06-16 14:44:47");
    assert.equal(q.owner, "Andy Newbom");
    assert.equal(q.currency, "USD");
    assert.equal(q.isEmpty, false);

    assert.deepEqual(q.organization, { name: "Fake University", address: "123 Example Ave, Springfield" });
    assert.deepEqual(q.person, { name: "Pat Buyer", email: "pat@fake.example", phone: "+1-555-0100" });

    // Order preserved exactly as returned (order_nr 0..3 in array order).
    assert.deepEqual(
      q.lineItems.map((l) => l.orderNr),
      [0, 1, 2, 3],
    );
    assert.deepEqual(
      q.lineItems.map((l) => l.productCode),
      ["VX5-V800-720", "VX5-V255-MGM", "VX5-WTY-5YR", "MKT-DRAM-32"],
    );
  });

  it("passes line money values through verbatim and classifies percentage discounts", async () => {
    const result = await getDealForQuote(DEAL_ID);
    assert.ok(result.ok);
    const first = result.deal.lineItems[0];
    assert.equal(first.unitPrice, 74048);
    assert.equal(first.quantity, 6);
    assert.equal(first.lineAmount, 244358.4);
    assert.equal(first.discount, 45);
    assert.equal(first.discountType, "percentage");
    assert.equal(first.discountPercent, 45);
    // Never derived.
    assert.equal(first.discountedUnitPrice, null);
    assert.equal(first.isInfoOnly, false);
  });

  it("resolves each distinct product code with one /products read per id", async () => {
    await getDealForQuote(DEAL_ID);
    const productReads = calls.filter((c) => /\/v1\/products\/\d+$/.test(new URL(c.url).pathname));
    assert.equal(productReads.length, 4, "one read per distinct product_id");
  });
});

describe("getDealForQuote - verbatim total (no recompute)", () => {
  it("reports productTotal as the deal value, NOT the sum of line amounts", async () => {
    const result = await getDealForQuote(DEAL_ID);
    assert.ok(result.ok);
    // The fixture's deal value is intentionally different from the line sum.
    assert.notEqual(DEAL_VALUE_VERBATIM, LINE_SUM);
    assert.equal(result.deal.productTotal, DEAL_VALUE_VERBATIM);
    // Guard: the layer must not have summed the lines into the total.
    assert.notEqual(result.deal.productTotal, LINE_SUM);
  });

  it("does not expose a deal-level additional-discounts/tariff (none configured)", async () => {
    const result = await getDealForQuote(DEAL_ID);
    assert.ok(result.ok);
    assert.equal(result.deal.additionalDiscounts, null);
  });
});

describe("getDealForQuote - info-only and [MKT] lines", () => {
  it("flags a $0 / 0% line as info-only with raw zero values preserved", async () => {
    const result = await getDealForQuote(DEAL_ID);
    assert.ok(result.ok);
    const warranty = result.deal.lineItems.find((l) => l.productId === 103)!;
    assert.equal(warranty.isInfoOnly, true);
    assert.equal(warranty.unitPrice, 0);
    assert.equal(warranty.lineAmount, 0);
    assert.equal(warranty.quantity, 9);
  });

  it("returns a priced [MKT] custom line like any other line", async () => {
    const result = await getDealForQuote(DEAL_ID);
    assert.ok(result.ok);
    const mkt = result.deal.lineItems.find((l) => l.productId === 104)!;
    assert.equal(mkt.isInfoOnly, false);
    assert.equal(mkt.unitPrice, 3350);
    assert.equal(mkt.quantity, 7);
    assert.equal(mkt.lineAmount, 23450);
    assert.equal(mkt.productCode, "MKT-DRAM-32");
    assert.match(mkt.productName ?? "", /^\[MKT\]/);
  });
});

describe("getDealForQuote - empty deal", () => {
  it("returns ok with empty lineItems and isEmpty when products data is null", async () => {
    responder = (url, method) => {
      if (url.pathname === `/v1/deals/${DEAL_ID}/products`) return null;
      return defaultResponder(url, method);
    };
    const result = await getDealForQuote(DEAL_ID);
    assert.ok(result.ok);
    assert.deepEqual(result.deal.lineItems, []);
    assert.equal(result.deal.isEmpty, true);
    // Deal metadata still resolves.
    assert.equal(result.deal.dealTitle, "Fake University | Campus Surveillance | 2026-06-16");
  });
});

describe("getDealForQuote - missing links", () => {
  it("returns organization null when the deal has no linked org", async () => {
    responder = (url, method) => {
      if (url.pathname === `/v1/deals/${DEAL_ID}`) return dealDetail({ org_id: null });
      return defaultResponder(url, method);
    };
    const result = await getDealForQuote(DEAL_ID);
    assert.ok(result.ok);
    assert.equal(result.deal.organization, null);
    // Person still resolves.
    assert.equal(result.deal.person?.name, "Pat Buyer");
  });

  it("returns person null when the deal has no linked person", async () => {
    responder = (url, method) => {
      if (url.pathname === `/v1/deals/${DEAL_ID}`) return dealDetail({ person_id: null });
      return defaultResponder(url, method);
    };
    const result = await getDealForQuote(DEAL_ID);
    assert.ok(result.ok);
    assert.equal(result.deal.person, null);
  });

  it("returns phone null when the person has no phone, keeping name and email", async () => {
    responder = (url, method) => {
      if (url.pathname === `/v1/deals/${DEAL_ID}`) {
        return dealDetail({
          person_id: {
            value: 555,
            name: "Pat Buyer",
            email: [{ value: "pat@fake.example", primary: true }],
            phone: [],
          },
        });
      }
      return defaultResponder(url, method);
    };
    const result = await getDealForQuote(DEAL_ID);
    assert.ok(result.ok);
    assert.deepEqual(result.deal.person, { name: "Pat Buyer", email: "pat@fake.example", phone: null });
  });

  it("returns org address null when the linked org omits an address", async () => {
    responder = (url, method) => {
      if (url.pathname === `/v1/deals/${DEAL_ID}`) {
        return dealDetail({ org_id: { value: 777, name: "Fake University", address: null } });
      }
      return defaultResponder(url, method);
    };
    const result = await getDealForQuote(DEAL_ID);
    assert.ok(result.ok);
    assert.deepEqual(result.deal.organization, { name: "Fake University", address: null });
  });

  it("degrades a product code to null when its product read fails, without failing the quote", async () => {
    responder = (url, method) => {
      const m = url.pathname.match(/^\/v1\/products\/(\d+)$/);
      if (m && Number(m[1]) === 104) return { __status: 404, __error: "Product not found" };
      return defaultResponder(url, method);
    };
    const result = await getDealForQuote(DEAL_ID);
    assert.ok(result.ok);
    const mkt = result.deal.lineItems.find((l) => l.productId === 104)!;
    assert.equal(mkt.productCode, null);
    // Other codes still resolve.
    assert.equal(result.deal.lineItems[0].productCode, "VX5-V800-720");
  });
});

describe("getDealForQuote - typed errors (no throw)", () => {
  it("returns not_found for a 404 deal", async () => {
    responder = (url) => {
      if (url.pathname === `/v1/deals/${DEAL_ID}`) return { __status: 404, __error: "Deal not found" };
      return { __status: 404 };
    };
    const result = await getDealForQuote(DEAL_ID);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.kind, "not_found");
    assert.equal(result.error.status, 404);
  });

  it("returns auth for a 401", async () => {
    responder = () => ({ __status: 401, __error: "Unauthorized" });
    const result = await getDealForQuote(DEAL_ID);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.kind, "auth");
  });

  it("returns rate_limit for a 429", async () => {
    responder = () => ({ __status: 429, __error: "Too Many Requests" });
    const result = await getDealForQuote(DEAL_ID);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.kind, "rate_limit");
  });

  it("rejects an invalid deal id without any network call", async () => {
    const result = await getDealForQuote(0);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.kind, "api");
    assert.equal(calls.length, 0, "no fetch should be issued for an invalid id");
  });
});
