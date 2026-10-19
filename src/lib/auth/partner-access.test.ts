import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  BAN_FOREVER,
  reactivatePartnerAccess,
  suspendPartnerAccess,
  type PartnerAccessClient,
} from "./partner-access";

type Call =
  | { kind: "ban"; uid: string; ban_duration: string }
  | { kind: "status"; id: string; status: string };

function fakeAdmin(fail: { ban?: boolean; status?: boolean } = {}) {
  const calls: Call[] = [];
  const client: PartnerAccessClient = {
    auth: {
      admin: {
        async updateUserById(uid, attributes) {
          calls.push({ kind: "ban", uid, ban_duration: attributes.ban_duration });
          return { error: fail.ban ? { message: "auth down" } : null };
        },
      },
    },
    from() {
      return {
        update(values) {
          return {
            async eq(_column, id) {
              calls.push({ kind: "status", id, status: values.status });
              return { error: fail.status ? { message: "db down" } : null };
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

// dbError logs every failure; keep the test output clean.
let originalError: typeof console.error;
beforeEach(() => {
  originalError = console.error;
  console.error = () => {};
});
afterEach(() => {
  console.error = originalError;
});

describe("suspendPartnerAccess", () => {
  it("bans the Auth user first, then marks suspended", async () => {
    const { client, calls } = fakeAdmin();
    const res = await suspendPartnerAccess(client, "p-1");
    assert.deepEqual(res, { ok: true });
    assert.deepEqual(calls, [
      { kind: "ban", uid: "p-1", ban_duration: BAN_FOREVER },
      { kind: "status", id: "p-1", status: "suspended" },
    ]);
    assert.equal(BAN_FOREVER, "876000h");
  });

  it("fails and leaves the status alone when the ban fails", async () => {
    const { client, calls } = fakeAdmin({ ban: true });
    const res = await suspendPartnerAccess(client, "p-1");
    assert.equal(res.ok, false);
    assert.deepEqual(calls, [{ kind: "ban", uid: "p-1", ban_duration: BAN_FOREVER }]);
  });

  it("fails when the status write fails (user stays banned)", async () => {
    const { client, calls } = fakeAdmin({ status: true });
    const res = await suspendPartnerAccess(client, "p-1");
    assert.equal(res.ok, false);
    assert.equal(calls.length, 2);
  });
});

describe("reactivatePartnerAccess", () => {
  it("marks active, then lifts the ban", async () => {
    const { client, calls } = fakeAdmin();
    const res = await reactivatePartnerAccess(client, "p-1");
    assert.deepEqual(res, { ok: true });
    assert.deepEqual(calls, [
      { kind: "status", id: "p-1", status: "active" },
      { kind: "ban", uid: "p-1", ban_duration: "none" },
    ]);
  });

  it("does not unban when the status write fails", async () => {
    const { client, calls } = fakeAdmin({ status: true });
    const res = await reactivatePartnerAccess(client, "p-1");
    assert.equal(res.ok, false);
    assert.deepEqual(calls, [{ kind: "status", id: "p-1", status: "active" }]);
  });

  it("re-asserts the ban and puts the status back to suspended when the unban fails", async () => {
    const { client, calls } = fakeAdmin({ ban: true });
    const res = await reactivatePartnerAccess(client, "p-1");
    assert.equal(res.ok, false);
    assert.deepEqual(calls, [
      { kind: "status", id: "p-1", status: "active" },
      { kind: "ban", uid: "p-1", ban_duration: "none" },
      { kind: "ban", uid: "p-1", ban_duration: BAN_FOREVER },
      { kind: "status", id: "p-1", status: "suspended" },
    ]);
  });
});
