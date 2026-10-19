import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { User } from "@supabase/supabase-js";
import {
  gateError,
  gateViewer,
  isActive,
  isAdmin,
  isInternal,
  isStaff,
  loadViewer,
  type Viewer,
  type ViewerPartner,
} from "./viewer-core";

const user = { id: "u-1", email: "p@example.com" } as User;

function partner(overrides: Partial<ViewerPartner> = {}): ViewerPartner {
  return {
    company_name: "Acme",
    contact_name: "Pat",
    role: "partner",
    status: "active",
    is_internal: false,
    ...overrides,
  };
}

function viewer(p: ViewerPartner | null): Viewer {
  return { user, partner: p };
}

describe("viewer predicates", () => {
  it("no user: nothing passes", () => {
    assert.equal(isActive(null), false);
    assert.equal(isStaff(null), false);
    assert.equal(isAdmin(null), false);
  });

  it("Auth user with no partners row: nothing passes (fail closed)", () => {
    const v = viewer(null);
    assert.equal(isActive(v), false);
    assert.equal(isStaff(v), false);
    assert.equal(isAdmin(v), false);
  });

  for (const status of ["invited", "suspended", null, "something-else"]) {
    it(`status ${String(status)}: not active, even as an internal admin`, () => {
      const v = viewer(partner({ status, role: "admin", is_internal: true }));
      assert.equal(isActive(v), false);
      assert.equal(isStaff(v), false);
      assert.equal(isAdmin(v), false);
    });
  }

  it("active partner: active only", () => {
    const v = viewer(partner());
    assert.equal(isActive(v), true);
    assert.equal(isStaff(v), false);
    assert.equal(isAdmin(v), false);
  });

  it("active internal: active and staff, not admin", () => {
    const v = viewer(partner({ is_internal: true }));
    assert.equal(isActive(v), true);
    assert.equal(isStaff(v), true);
    assert.equal(isAdmin(v), false);
  });

  it("active admin: active, staff and admin", () => {
    const v = viewer(partner({ role: "admin" }));
    assert.equal(isActive(v), true);
    assert.equal(isStaff(v), true);
    assert.equal(isAdmin(v), true);
  });
});

describe("gateViewer", () => {
  it("no user → unauthenticated", () => {
    assert.deepEqual(gateViewer(null, isActive), { ok: false, reason: "unauthenticated" });
  });

  it("no partners row → forbidden", () => {
    assert.deepEqual(gateViewer(viewer(null), isActive), { ok: false, reason: "forbidden" });
  });

  it("invited → forbidden", () => {
    assert.deepEqual(gateViewer(viewer(partner({ status: "invited" })), isActive), {
      ok: false,
      reason: "forbidden",
    });
  });

  it("suspended → forbidden", () => {
    assert.deepEqual(gateViewer(viewer(partner({ status: "suspended" })), isActive), {
      ok: false,
      reason: "forbidden",
    });
  });

  it("active → ok with the viewer", () => {
    const p = partner();
    assert.deepEqual(gateViewer(viewer(p), isActive), { ok: true, viewer: { user, partner: p } });
  });

  it("active partner fails the staff and admin gates", () => {
    assert.deepEqual(gateViewer(viewer(partner()), isStaff), { ok: false, reason: "forbidden" });
    assert.deepEqual(gateViewer(viewer(partner()), isAdmin), { ok: false, reason: "forbidden" });
  });
});

describe("loadViewer", () => {
  it("returns null with no session and does not read partners", async () => {
    let reads = 0;
    const v = await loadViewer({
      getUser: async () => null,
      loadPartner: async () => {
        reads++;
        return { data: null, error: null };
      },
    });
    assert.equal(v, null);
    assert.equal(reads, 0);
  });

  it("reads the caller's own row", async () => {
    const p = partner();
    let askedFor = "";
    const v = await loadViewer({
      getUser: async () => user,
      loadPartner: async (id) => {
        askedFor = id;
        return { data: p, error: null };
      },
    });
    assert.equal(askedFor, "u-1");
    assert.deepEqual(v, { user, partner: p });
  });

  it("missing row → partner null", async () => {
    const v = await loadViewer({
      getUser: async () => user,
      loadPartner: async () => ({ data: null, error: null }),
    });
    assert.deepEqual(v, { user, partner: null });
    assert.equal(isActive(v), false);
  });

  it("a failed partners read throws instead of reading as no row", async () => {
    const original = console.error;
    console.error = () => {};
    try {
      await assert.rejects(
        loadViewer({
          getUser: async () => user,
          loadPartner: async () => ({ data: null, error: { message: "boom" } }),
        }),
      );
    } finally {
      console.error = original;
    }
  });
});

describe("isInternal", () => {
  it("needs an active row with the flag; admin alone is not internal", () => {
    assert.equal(isInternal(null), false);
    assert.equal(isInternal(viewer(null)), false);
    assert.equal(isInternal(viewer(partner({ is_internal: true }))), true);
    assert.equal(isInternal(viewer(partner({ is_internal: true, status: "suspended" }))), false);
    assert.equal(isInternal(viewer(partner({ role: "admin" }))), false);
    assert.equal(isInternal(viewer(partner({ is_internal: null }))), false);
  });
});

describe("gateError", () => {
  it("keeps the two refusal messages the admin actions return", () => {
    assert.equal(gateError({ reason: "unauthenticated" }), "Not authenticated.");
    assert.equal(gateError({ reason: "forbidden" }), "Not authorized.");
  });
});
