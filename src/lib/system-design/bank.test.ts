import { describe, it, before, mock } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BankSystemDesignInput, bankSystemDesign as BankFn } from "./bank";
import { buildBom } from "./bom";
import { resolveSystemDesign } from "./resolve";
import { SYSTEM_DESIGN_ENGINE_VERSION } from "./size";
import { CATALOG, seedRules } from "./seed-rules.test-fixtures";

// bankSystemDesign is the one writer of submission_system_designs (ADR 0165).
// These tests pin that it checks ownership before it inserts, and never
// inserts otherwise.

const CALLER = "22222222-2222-4222-8222-222222222222";
const SUBMISSION = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";

type Call = [op: string, ...args: unknown[]];

function fakeAdmin(opts: { owner: string | null; readError?: unknown; insertError?: unknown }) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      return {
        select(columns: string) {
          calls.push(["select", table, columns]);
          return {
            eq(column: string, value: unknown) {
              calls.push(["eq", column, value]);
              return {
                maybeSingle: async () =>
                  opts.readError
                    ? { data: null, error: opts.readError }
                    : { data: opts.owner === null ? null : { partner_id: opts.owner }, error: null },
              };
            },
          };
        },
        insert(row: unknown) {
          calls.push(["insert", table, row]);
          return Promise.resolve({ error: opts.insertError ?? null });
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

function input(): BankSystemDesignInput {
  const resolution = resolveSystemDesign(
    { retentionDays: 30, groups: [{ retentionDays: 30 }], systemDesign: { gpu: true } },
    {},
    seedRules(),
    CATALOG,
  );
  assert.ok(resolution.ok);
  return {
    submissionId: SUBMISSION,
    callerId: CALLER,
    design: resolution.design,
    snapshot: resolution.snapshot,
    bom: buildBom({
      primary: { sku: "VX5-V400-128", units: 1 },
      failover: null,
      management: resolution.design.management,
      gpu: true,
      sfp: false,
      workstations: resolution.design.workstations,
      bomRules: resolution.snapshot.bomRules,
    }),
  };
}

// bank.ts imports server-only, which throws outside a server build.
let bankSystemDesign: typeof BankFn;
before(async () => {
  mock.module("server-only", { namedExports: {} });
  ({ bankSystemDesign } = await import("./bank"));
});

describe("bankSystemDesign (the side table's only writer)", () => {
  it("inserts once the caller owns the submission, stamped with the caller and engine version", async () => {
    const { client, calls } = fakeAdmin({ owner: CALLER });
    const data = input();
    assert.deepStrictEqual(await bankSystemDesign(client, data), { ok: true });
    assert.deepStrictEqual(calls, [
      ["select", "submissions", "partner_id"],
      ["eq", "id", SUBMISSION],
      [
        "insert",
        "submission_system_designs",
        {
          submission_id: SUBMISSION,
          resolved_design: data.design,
          rules_snapshot: data.snapshot,
          bom: data.bom,
          engine_version: SYSTEM_DESIGN_ENGINE_VERSION,
          created_by: CALLER,
        },
      ],
    ]);
  });

  it("refuses, without inserting, when someone else owns the submission", async () => {
    const { client, calls } = fakeAdmin({ owner: "33333333-3333-4333-8333-333333333333" });
    assert.deepStrictEqual(await bankSystemDesign(client, input()), { ok: false, reason: "not-owner" });
    assert.ok(!calls.some(([op]) => op === "insert"));
  });

  it("refuses, without inserting, when the submission does not exist", async () => {
    const { client, calls } = fakeAdmin({ owner: null });
    assert.deepStrictEqual(await bankSystemDesign(client, input()), { ok: false, reason: "not-owner" });
    assert.ok(!calls.some(([op]) => op === "insert"));
  });

  it("reports a failed ownership read without inserting", async () => {
    const readError = { code: "XX000", message: "read failed" };
    const { client, calls } = fakeAdmin({ owner: CALLER, readError });
    assert.deepStrictEqual(await bankSystemDesign(client, input()), {
      ok: false,
      reason: "db-error",
      context: "check owner",
      error: readError,
    });
    assert.ok(!calls.some(([op]) => op === "insert"));
  });

  it("reports the database refusing the insert (the trigger's 42501, or a second row)", async () => {
    const insertError = { code: "42501", message: "only an active internal user or an admin can bank a system design" };
    const { client } = fakeAdmin({ owner: CALLER, insertError });
    assert.deepStrictEqual(await bankSystemDesign(client, input()), {
      ok: false,
      reason: "db-error",
      context: "bank design",
      error: insertError,
    });
  });
});
