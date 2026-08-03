import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PipedriveError, pipedriveClient } from "@/lib/pipedrive/client";
import { readDealCache, refreshDealCache } from "./pipedrive-cache";

// A fake Supabase that records what was written. The refresh only ever does one
// select-in and one or two upserts, so this is the whole surface it touches.
function fakeSupabase(existing: Array<Record<string, unknown>> = []) {
  const upserts: Array<Array<Record<string, unknown>>> = [];
  const client = {
    from() {
      return {
        select() {
          return {
            in() {
              return Promise.resolve({ data: existing, error: null });
            },
          };
        },
        upsert(rows: Array<Record<string, unknown>>) {
          upserts.push(rows);
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { supabase: client as unknown as SupabaseClient, upserts };
}

// A cache row in the raw PostgREST shape, numerics as strings and jsonb parsed.
function storedRow(o: Partial<Record<string, unknown>> & { pipedrive_deal_id: number }) {
  return {
    deal_status: "open",
    deal_value: "6545821.00",
    currency: "USD",
    line_item_count: 9,
    line_items: [
      { product_id: 1, code: null, name: "V800", quantity: 2, unit_price: 40000, line_amount: 80000 },
    ],
    deal_update_time: "2026-08-01T09:00:00Z",
    line_items_changed_at: null,
    read_at: "2026-08-01T09:42:00Z",
    last_failed_at: null,
    last_error: null,
    ...o,
  };
}

function pdDeal(o: Record<string, unknown> = {}) {
  return {
    id: 5001,
    title: "Riverside Campus",
    value: 6_545_821,
    currency: "USD",
    status: "open",
    update_time: "2026-08-03T08:00:00Z",
    user_id: null,
    person_id: null,
    org_id: null,
    ...o,
  };
}

function pdProduct(o: Record<string, unknown> = {}) {
  return {
    id: 100,
    product_id: 1,
    name: "V800",
    item_price: 40_000,
    discount: 0,
    discount_type: "percentage",
    quantity: 2,
    sum: 80_000,
    currency: "USD",
    order_nr: 1,
    ...o,
  };
}

const NOW = new Date("2026-08-03T09:42:00Z");

afterEach(() => {
  mock.restoreAll();
});

describe("readDealCache", () => {
  it("coerces the PostgREST shapes and keys by deal id", async () => {
    const { supabase } = fakeSupabase([storedRow({ pipedrive_deal_id: 5001 })]);
    const cache = await readDealCache(supabase, [5001]);
    const row = cache.get(5001);
    assert.equal(row?.deal_value, 6_545_821);
    assert.equal(row?.deal_status, "open");
    assert.equal(row?.line_items?.length, 1);
  });

  it("makes no query and returns nothing for an empty or junk id list", async () => {
    const { supabase } = fakeSupabase([storedRow({ pipedrive_deal_id: 5001 })]);
    assert.equal((await readDealCache(supabase, [])).size, 0);
    assert.equal((await readDealCache(supabase, [0, -1, 1.5])).size, 0);
  });
});

describe("refreshDealCache — a failed read never overwrites a good value", () => {
  it("writes ONLY the failure columns, leaving every last known value alone", async () => {
    // This is the mechanism behind acceptance check 9. If the failure upsert ever
    // carries a value column, a Pipedrive outage blanks the queue.
    mock.method(pipedriveClient, "getDeal", async () => {
      throw new PipedriveError(429, "rate limited", { error: "rate limited" });
    });
    mock.method(pipedriveClient, "getDealProducts", async () => []);

    const { supabase, upserts } = fakeSupabase([storedRow({ pipedrive_deal_id: 5001 })]);
    const result = await refreshDealCache(supabase, [5001], { now: NOW });

    assert.deepEqual(result.failed, [5001]);
    assert.deepEqual(result.refreshed, []);

    assert.equal(upserts.length, 1);
    assert.deepEqual(Object.keys(upserts[0][0]).sort(), [
      "last_error",
      "last_failed_at",
      "pipedrive_deal_id",
    ]);

    // And the returned cache still carries the values the row will render.
    const row = result.cache.get(5001);
    assert.equal(row?.deal_value, 6_545_821);
    assert.equal(row?.line_item_count, 9);
    assert.equal(row?.deal_status, "open");
    assert.equal(row?.read_at, "2026-08-01T09:42:00Z");
    assert.equal(row?.last_failed_at, NOW.toISOString());
  });

  it("records a failure for a deal it has never read, with nothing to fall back to", async () => {
    mock.method(pipedriveClient, "getDeal", async () => {
      throw new Error("socket hang up");
    });
    mock.method(pipedriveClient, "getDealProducts", async () => []);

    const { supabase } = fakeSupabase([]);
    const result = await refreshDealCache(supabase, [5001], { now: NOW });

    const row = result.cache.get(5001);
    assert.equal(row?.read_at, null);
    assert.equal(row?.deal_value, null);
    assert.equal(row?.last_failed_at, NOW.toISOString());
  });

  it("sends successes and failures as two separate upserts", async () => {
    // One merged payload would let PostgREST build the SET list from whichever
    // object it saw first, and either null a good value or write a stale read_at.
    mock.method(pipedriveClient, "getDeal", async (id: number) => {
      if (id === 5002) throw new PipedriveError(404, "not found", { error: "not found" });
      return pdDeal({ id });
    });
    mock.method(pipedriveClient, "getDealProducts", async () => [pdProduct()]);

    const { supabase, upserts } = fakeSupabase([]);
    const result = await refreshDealCache(supabase, [5001, 5002], { now: NOW });

    assert.deepEqual(result.refreshed, [5001]);
    assert.deepEqual(result.failed, [5002]);
    assert.equal(upserts.length, 2);
    assert.ok(upserts.every((rows) => rows.length === 1));
    // Every row in a given upsert has an identical column set.
    for (const rows of upserts) {
      const shape = JSON.stringify(Object.keys(rows[0]).sort());
      assert.ok(rows.every((r) => JSON.stringify(Object.keys(r).sort()) === shape));
    }
  });
});

describe("refreshDealCache — observed line-item change", () => {
  it("does not stamp a change on the FIRST read of a deal", async () => {
    // A first sighting is not a change. Stamping it would fire the amber drift
    // strip across the whole queue the day the cache is introduced.
    mock.method(pipedriveClient, "getDeal", async () => pdDeal());
    mock.method(pipedriveClient, "getDealProducts", async () => [pdProduct()]);

    const { supabase } = fakeSupabase([]);
    const result = await refreshDealCache(supabase, [5001], { now: NOW });
    assert.equal(result.cache.get(5001)?.line_items_changed_at, null);
    assert.equal(result.cache.get(5001)?.line_item_count, 1);
  });

  it("stamps the read that first saw a different fingerprint", async () => {
    mock.method(pipedriveClient, "getDeal", async () => pdDeal());
    mock.method(pipedriveClient, "getDealProducts", async () => [pdProduct({ quantity: 5 })]);

    const { supabase } = fakeSupabase([storedRow({ pipedrive_deal_id: 5001 })]);
    const result = await refreshDealCache(supabase, [5001], { now: NOW });
    assert.equal(result.cache.get(5001)?.line_items_changed_at, NOW.toISOString());
  });

  it("keeps the previous stamp when the lines have not moved", async () => {
    mock.method(pipedriveClient, "getDeal", async () => pdDeal());
    mock.method(pipedriveClient, "getDealProducts", async () => [pdProduct()]);

    const { supabase } = fakeSupabase([
      storedRow({ pipedrive_deal_id: 5001, line_items_changed_at: "2026-07-30T12:00:00Z" }),
    ]);
    const result = await refreshDealCache(supabase, [5001], { now: NOW });
    assert.equal(result.cache.get(5001)?.line_items_changed_at, "2026-07-30T12:00:00Z");
  });

  it("treats a re-ordered but otherwise identical deal as unchanged", async () => {
    mock.method(pipedriveClient, "getDeal", async () => pdDeal());
    mock.method(pipedriveClient, "getDealProducts", async () => [
      pdProduct({ id: 101, product_id: 2, name: "SW10", order_nr: 1, item_price: 5000, sum: 5000, quantity: 1 }),
      pdProduct({ order_nr: 2 }),
    ]);

    const { supabase } = fakeSupabase([
      storedRow({
        pipedrive_deal_id: 5001,
        line_items: [
          { product_id: 1, code: null, name: "V800", quantity: 2, unit_price: 40000, line_amount: 80000 },
          { product_id: 2, code: null, name: "SW10", quantity: 1, unit_price: 5000, line_amount: 5000 },
        ],
      }),
    ]);
    const result = await refreshDealCache(supabase, [5001], { now: NOW });
    assert.equal(result.cache.get(5001)?.line_items_changed_at, null);
  });

  it("preserves the failure trail on a success, because read_ok is derived", async () => {
    mock.method(pipedriveClient, "getDeal", async () => pdDeal());
    mock.method(pipedriveClient, "getDealProducts", async () => [pdProduct()]);

    const { supabase } = fakeSupabase([
      storedRow({
        pipedrive_deal_id: 5001,
        last_failed_at: "2026-08-02T09:00:00Z",
        last_error: "429 rate limited",
      }),
    ]);
    const result = await refreshDealCache(supabase, [5001], { now: NOW });
    const row = result.cache.get(5001);
    assert.equal(row?.read_at, NOW.toISOString());
    assert.equal(row?.last_failed_at, "2026-08-02T09:00:00Z");
    // read_at now beats last_failed_at, so the row reads as fresh again without
    // anything being cleared.
    assert.ok(new Date(row!.read_at!) > new Date(row!.last_failed_at!));
  });

  it("records a deal whose products came back null as genuinely empty", async () => {
    // GET /deals/{id}/products returns data: null for an empty deal, which is a
    // real state and the one that gates generation.
    mock.method(pipedriveClient, "getDeal", async () => pdDeal({ value: 0 }));
    mock.method(pipedriveClient, "getDealProducts", async () => null);

    const { supabase } = fakeSupabase([]);
    const result = await refreshDealCache(supabase, [5001], { now: NOW });
    assert.equal(result.cache.get(5001)?.line_item_count, 0);
    assert.deepEqual(result.cache.get(5001)?.line_items, []);
  });
});

describe("refreshDealCache — housekeeping", () => {
  it("reads each distinct deal once and skips junk ids", async () => {
    const seen: number[] = [];
    mock.method(pipedriveClient, "getDeal", async (id: number) => {
      seen.push(id);
      return pdDeal({ id });
    });
    mock.method(pipedriveClient, "getDealProducts", async () => [pdProduct()]);

    const { supabase } = fakeSupabase([]);
    await refreshDealCache(supabase, [5001, 5001, 5002, 0, -3], { now: NOW });
    assert.deepEqual(seen.sort(), [5001, 5002]);
  });

  it("does nothing at all when there are no deals to read", async () => {
    const { supabase, upserts } = fakeSupabase([]);
    const result = await refreshDealCache(supabase, [], { now: NOW });
    assert.equal(result.cache.size, 0);
    assert.equal(upserts.length, 0);
  });
});
