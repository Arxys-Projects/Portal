import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isSafeNext } from "./safe-next";

describe("isSafeNext", () => {
  it("accepts same-site paths", () => {
    assert.equal(isSafeNext("/dashboard"), true);
    assert.equal(isSafeNext("/submissions/abc?x=1"), true);
    assert.equal(isSafeNext("/reset-password"), true);
    assert.equal(isSafeNext("/price-book#top"), true);
    assert.equal(isSafeNext("/%5Cevil.com"), true); // encoded: stays a local path
  });

  it("rejects backslash forms browsers resolve off-site", () => {
    assert.equal(isSafeNext("/\\evil.com"), false);
    assert.equal(isSafeNext("/\\/evil.com"), false);
    assert.equal(isSafeNext("\\\\evil.com"), false);
  });

  it("rejects control characters", () => {
    assert.equal(isSafeNext("/\t/evil.com"), false);
    assert.equal(isSafeNext("/\n/evil.com"), false);
    assert.equal(isSafeNext("/\r/evil.com"), false);
    assert.equal(isSafeNext("/dash\u0000board"), false);
    assert.equal(isSafeNext("/dash\u007fboard"), false);
  });

  it("rejects protocol-relative and absolute URLs", () => {
    assert.equal(isSafeNext("//x"), false);
    assert.equal(isSafeNext("//evil.com/dashboard"), false);
    assert.equal(isSafeNext("https://x"), false);
    assert.equal(isSafeNext("javascript:alert(1)"), false);
  });

  it("rejects empty and non-path values", () => {
    assert.equal(isSafeNext(""), false);
    assert.equal(isSafeNext(null), false);
    assert.equal(isSafeNext(undefined), false);
    assert.equal(isSafeNext("dashboard"), false);
  });
});
