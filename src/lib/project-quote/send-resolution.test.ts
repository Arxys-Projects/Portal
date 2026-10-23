import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planSendClear, SENDING_MIN_AGE_MS } from "./send-resolution";

// ADR 0175: what Andy's clear script may do with a Quote ready send row.

const now = new Date("2026-10-23T18:00:00Z");
const row = (status: string, ageMs = SENDING_MIN_AGE_MS) => ({
  id: 9,
  toEmail: "ken@example.com",
  status,
  error: null,
  createdAt: new Date(now.getTime() - ageMs).toISOString(),
});

describe("planSendClear", () => {
  it("clears a failed row, and a sending row once it is old enough", () => {
    assert.deepEqual(planSendClear(row("failed", 0), now), { ok: true, sendId: 9, status: "failed" });
    assert.deepEqual(planSendClear(row("sending"), now), { ok: true, sendId: 9, status: "sending" });
  });

  it("never clears a sent row, a young sending row, or nothing", () => {
    assert.equal(planSendClear(row("sent"), now).ok, false);
    assert.equal(planSendClear(row("sending", SENDING_MIN_AGE_MS - 1), now).ok, false);
    assert.equal(planSendClear(null, now).ok, false);
    assert.equal(planSendClear(row("queued"), now).ok, false);
  });
});
