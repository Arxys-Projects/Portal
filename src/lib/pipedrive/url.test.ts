import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pipedriveDealUrl, PIPEDRIVE_WINDOW_TARGET } from "./url";

// No fetch mock needed — this module makes no network calls, per its own
// header comment ("No framework or env imports").

describe("pipedriveDealUrl", () => {
  it("builds the deal URL for a valid numeric id", () => {
    assert.equal(pipedriveDealUrl(5246), "https://app.pipedrive.com/deal/5246");
  });

  it("accepts a numeric string id", () => {
    assert.equal(pipedriveDealUrl("5122"), "https://app.pipedrive.com/deal/5122");
  });

  it("returns null for null/undefined/non-positive/non-integer ids", () => {
    assert.equal(pipedriveDealUrl(null), null);
    assert.equal(pipedriveDealUrl(undefined), null);
    assert.equal(pipedriveDealUrl(0), null);
    assert.equal(pipedriveDealUrl(-3), null);
    assert.equal(pipedriveDealUrl(4.5), null);
    assert.equal(pipedriveDealUrl("not-a-number"), null);
  });
});

// ADR 0119 — every Pipedrive deal link in the portal must share this exact
// string so `window.open`/`target=` calls resolve to the same browsing
// context and reuse one tab. This is the one place that invariant is
// enforced in code; the render sites just import the constant.
describe("PIPEDRIVE_WINDOW_TARGET", () => {
  it("is a stable, non-empty target name", () => {
    assert.equal(PIPEDRIVE_WINDOW_TARGET, "arxysPipedrive");
    assert.ok(PIPEDRIVE_WINDOW_TARGET.length > 0);
  });
});
