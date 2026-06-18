import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateProjectQuoteCore,
  GENERATE_MESSAGES,
  type GenerateDeps,
} from "./generate";
import type { AssembleSnapshotResult, ProjectQuoteInsert, ProjectQuoteSnapshot } from "./types";
import type { DealQuote } from "@/lib/pipedrive/quote";

// --- fixtures --------------------------------------------------------------

// A minimal but type-complete row. The orchestrator only reads
// snapshot.generation.{identifier,generatedAt,validityDays} and
// row.pipedrive_deal_id, so the rest is filled with empty/zero values.
function makeRow(version: number, dealId = 4822): ProjectQuoteInsert {
  const snapshot = {
    snapshotVersion: 1,
    commercial: {} as DealQuote,
    sizing: {} as ProjectQuoteSnapshot["sizing"],
    terms: { version: "v1", text: "terms", sha256: "abc" },
    generation: {
      version,
      generatedAt: "2026-06-18T12:00:00.000Z",
      validityDays: 7,
      generatedByUserId: "user-1",
      submissionId: "sub-1",
      dealId,
      identifier: `${dealId}-V${version}-2026-06-18`,
    },
  } as ProjectQuoteSnapshot;
  return {
    submission_id: "sub-1",
    pipedrive_deal_id: dealId,
    version,
    snapshot,
    terms_version: "v1",
    generated_at: "2026-06-18T12:00:00.000Z",
    validity_days: 7,
    generated_by: "user-1",
  };
}

const okResult = (row: ProjectQuoteInsert): AssembleSnapshotResult => ({ ok: true, row });

// A fake supabase whose project_quotes insert returns queued responses in
// order. Records every inserted row so the conflict-retry path can be asserted.
type InsertResponse = { data?: unknown; error?: { code?: string } | null };
function fakeSupabase(responses: InsertResponse[]) {
  const insertedRows: unknown[] = [];
  let i = 0;
  const builder = {
    insert(row: unknown) {
      insertedRows.push(row);
      return builder;
    },
    select() {
      return builder;
    },
    single() {
      const r = responses[Math.min(i, responses.length - 1)];
      i += 1;
      return Promise.resolve(r);
    },
  };
  const supabase = { from: () => builder } as unknown as SupabaseClient;
  return { supabase, insertedRows, insertCount: () => i };
}

// A deps builder with sensible defaults; override per test.
function makeDeps(over: Partial<GenerateDeps> & { supabase: SupabaseClient }): GenerateDeps {
  return {
    assemble: async () => okResult(makeRow(1)),
    render: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    filename: () => "quote.pdf",
    deliver: async () => ({ id: 1 }),
    ...over,
  };
}

// --- branch handling -------------------------------------------------------

describe("generateProjectQuoteCore — assemble failure branches", () => {
  const cases: Array<{
    name: string;
    result: AssembleSnapshotResult;
    expected: string;
  }> = [
    {
      name: "empty_deal",
      result: { ok: false, reason: "empty_deal", deal: {} as DealQuote },
      expected: GENERATE_MESSAGES.empty_deal,
    },
    {
      name: "no_deal_link",
      result: { ok: false, reason: "no_deal_link", submissionId: "sub-1" },
      expected: GENERATE_MESSAGES.no_deal_link,
    },
    {
      name: "submission_not_found",
      result: { ok: false, reason: "submission_not_found", submissionId: "sub-1" },
      expected: GENERATE_MESSAGES.submission_not_found,
    },
    {
      name: "deal_read_error",
      result: {
        ok: false,
        reason: "deal_read_error",
        error: { kind: "network", message: "boom" },
      },
      expected: GENERATE_MESSAGES.deal_read_error,
    },
  ];

  for (const c of cases) {
    it(`maps ${c.name} to its message and never inserts`, async () => {
      const { supabase, insertCount } = fakeSupabase([]);
      let delivered = false;
      const res = await generateProjectQuoteCore(
        "sub-1",
        makeDeps({
          supabase,
          assemble: async () => c.result,
          deliver: async () => {
            delivered = true;
            return {};
          },
        }),
      );
      assert.deepEqual(res, { ok: false, error: c.expected });
      assert.equal(insertCount(), 0, "must not attempt an insert on assemble failure");
      assert.equal(delivered, false, "must not deliver on assemble failure");
    });
  }
});

// --- happy path ------------------------------------------------------------

describe("generateProjectQuoteCore — persist, render, deliver", () => {
  it("persists, delivers, and returns version/identifier/expiry on the happy path", async () => {
    const { supabase, insertCount } = fakeSupabase([{ data: { id: "q1", version: 1 } }]);
    const deliverCalls: Array<{ dealId: number; filename: string }> = [];
    const res = await generateProjectQuoteCore(
      "sub-1",
      makeDeps({
        supabase,
        assemble: async () => okResult(makeRow(1, 4822)),
        deliver: async (dealId, filename) => {
          deliverCalls.push({ dealId, filename });
          return { id: 7 };
        },
      }),
    );
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.version, 1);
      assert.equal(res.identifier, "4822-V1-2026-06-18");
      assert.equal(res.expiresOn, "2026-06-25"); // generatedAt 06-18 + 7 days
      assert.equal(res.delivered, true);
      assert.equal(res.deliveryNote, undefined);
    }
    assert.equal(insertCount(), 1);
    assert.deepEqual(deliverCalls, [{ dealId: 4822, filename: "quote.pdf" }]);
  });
});

// --- version-conflict retry ------------------------------------------------

describe("generateProjectQuoteCore — version conflict retry", () => {
  it("re-assembles once on a (submission_id, version) conflict and succeeds", async () => {
    // First insert hits the unique violation; second (after re-assembly at the
    // next version) succeeds.
    const { supabase, insertedRows, insertCount } = fakeSupabase([
      { error: { code: "23505" } },
      { data: { id: "q2", version: 2 } },
    ]);
    let assembleCalls = 0;
    const res = await generateProjectQuoteCore(
      "sub-1",
      makeDeps({
        supabase,
        assemble: async () => {
          assembleCalls += 1;
          // First call returns version 1 (loses the race), second returns 2.
          return okResult(makeRow(assembleCalls === 1 ? 1 : 2));
        },
      }),
    );
    assert.equal(res.ok, true);
    if (res.ok) assert.equal(res.version, 2);
    assert.equal(assembleCalls, 2, "must re-assemble exactly once on conflict");
    assert.equal(insertCount(), 2);
    // The retried insert carries the recomputed version-2 row.
    assert.equal((insertedRows[1] as ProjectQuoteInsert).version, 2);
  });

  it("gives up with persist_failed after a second consecutive conflict", async () => {
    const { supabase, insertCount } = fakeSupabase([
      { error: { code: "23505" } },
      { error: { code: "23505" } },
    ]);
    const res = await generateProjectQuoteCore(
      "sub-1",
      makeDeps({ supabase, assemble: async () => okResult(makeRow(1)) }),
    );
    assert.deepEqual(res, { ok: false, error: GENERATE_MESSAGES.persist_failed });
    assert.equal(insertCount(), 2, "retries exactly once, then stops");
  });

  it("surfaces a non-conflict insert error as persist_failed without retrying", async () => {
    const { supabase, insertCount } = fakeSupabase([{ error: { code: "23503" } }]);
    const res = await generateProjectQuoteCore(
      "sub-1",
      makeDeps({ supabase, assemble: async () => okResult(makeRow(1)) }),
    );
    assert.deepEqual(res, { ok: false, error: GENERATE_MESSAGES.persist_failed });
    assert.equal(insertCount(), 1, "a non-23505 error is not retried");
  });
});

// --- delivery is non-fatal -------------------------------------------------

describe("generateProjectQuoteCore — delivery failure is non-fatal", () => {
  it("returns ok with delivered:false when the Pipedrive attach throws", async () => {
    const { supabase } = fakeSupabase([{ data: { id: "q1", version: 1 } }]);
    const res = await generateProjectQuoteCore(
      "sub-1",
      makeDeps({
        supabase,
        assemble: async () => okResult(makeRow(1)),
        deliver: async () => {
          throw new Error("pipedrive 503");
        },
      }),
    );
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.delivered, false);
      assert.equal(res.deliveryNote, GENERATE_MESSAGES.delivery_failed);
      assert.equal(res.version, 1); // the quote is still persisted and reported
    }
  });

  it("returns ok with delivered:false when rendering throws (row already persisted)", async () => {
    const { supabase } = fakeSupabase([{ data: { id: "q1", version: 1 } }]);
    let delivered = false;
    const res = await generateProjectQuoteCore(
      "sub-1",
      makeDeps({
        supabase,
        assemble: async () => okResult(makeRow(1)),
        render: async () => {
          throw new Error("render boom");
        },
        deliver: async () => {
          delivered = true;
          return {};
        },
      }),
    );
    assert.equal(res.ok, true);
    if (res.ok) assert.equal(res.delivered, false);
    assert.equal(delivered, false, "deliver is never reached when render throws");
  });
});
