import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  dedicatedManagementSuggestion,
  defaultFailoverDays,
  requestFromResolvedDesign,
  resolveSystemDesign,
  type CalcDesignInputs,
  type SystemDesignRequest,
} from "./resolve";
import { CATALOG, seedRules } from "./seed-rules.test-fixtures";

const calc = (over: Partial<CalcDesignInputs> = {}): CalcDesignInputs => ({
  retentionDays: 30,
  groups: [{ retentionDays: 30 }],
  vms: "Avigilon",
  systemDesign: null,
  ...over,
});

function ok(r: ReturnType<typeof resolveSystemDesign>) {
  if (!r.ok) assert.fail(`expected ok, got errors: ${r.errors.join(" | ")}`);
  return r;
}

describe("resolveSystemDesign: defaults", () => {
  it("with nothing chosen, everything is off", () => {
    const r = ok(resolveSystemDesign(calc(), {}, seedRules(), CATALOG));
    assert.deepEqual(r.design, {
      sfp: false,
      gpu: false,
      failover: { enabled: false },
      management: { dedicated: false, units: 0, sku: null },
      workstations: { count: 0, sku: null },
      longestRetentionDays: 30,
      vms: "Avigilon",
    });
    assert.deepEqual(r.warnings, []);
  });

  it("failover days default to the LONGEST retention (fraction 1, ADR 0162); ratio from the rule", () => {
    const r = ok(
      resolveSystemDesign(
        calc({
          groups: [{ retentionDays: 7 }, { retentionDays: 45 }, { retentionDays: 30 }],
          systemDesign: { failover: { enabled: true } },
        }),
        {},
        seedRules(),
        CATALOG,
      ),
    );
    assert.deepEqual(r.design.failover, {
      enabled: true,
      days: 45, // ceil(45 × 1): the longest of 7, 45 and 30
      primariesPerFailover: 2,
      daysDefaulted: true,
      ratioDefaulted: true,
    });
  });

  it("the rep's failover days and ratio win over the rules", () => {
    const r = ok(
      resolveSystemDesign(
        calc({ systemDesign: { failover: { enabled: true, days: 10, primariesPerFailover: 4 } } }),
        {},
        seedRules(),
        CATALOG,
      ),
    );
    assert.deepEqual(r.design.failover, {
      enabled: true,
      days: 10,
      primariesPerFailover: 4,
      daysDefaulted: false,
      ratioDefaulted: false,
    });
  });

  it("rounds up without floating-point drift", () => {
    assert.equal(defaultFailoverDays(30, 0.5), 15);
    assert.equal(defaultFailoverDays(7, 0.5), 4);
    assert.equal(defaultFailoverDays(1, 0.5), 1);
    // 0.07 × 100 is 7.000000000000001 in floating point; it must stay 7.
    assert.equal(0.07 * 100 > 7, true);
    assert.equal(defaultFailoverDays(100, 0.07), 7);
    assert.equal(defaultFailoverDays(1, 0.01), 1); // never 0
  });

  it("retention: a group's own, else the calc's (the chain submitCalculation sizes with)", () => {
    const r = ok(
      resolveSystemDesign(
        calc({ retentionDays: 60, groups: [{ retentionDays: null }, { retentionDays: 14 }] }),
        {},
        seedRules(),
        CATALOG,
      ),
    );
    assert.equal(r.design.longestRetentionDays, 60);

    const none = resolveSystemDesign(
      calc({ retentionDays: null, groups: [{}, { retentionDays: 14 }] }),
      {},
      seedRules(),
      CATALOG,
    );
    assert.ok(!none.ok);
    assert.deepEqual(none.errors, ["Camera group 1 has no retention, and the calc sets none."]);
  });

  it("VMS comes from the calc, else the project", () => {
    const r = ok(resolveSystemDesign(calc({ vms: null }), { vms: "Genetec" }, seedRules(), CATALOG));
    assert.equal(r.design.vms, "Genetec");
  });
});

describe("resolveSystemDesign: management and workstations", () => {
  it("failover-pair management is 2 units", () => {
    const r = ok(
      resolveSystemDesign(
        calc({ systemDesign: { management: { dedicated: true, failoverPair: true, sku: "VX5-V255-MGM" } } }),
        {},
        seedRules(),
        CATALOG,
      ),
    );
    assert.deepEqual(r.design.management, { dedicated: true, units: 2, sku: "VX5-V255-MGM" });
  });

  it("a single dedicated management server is 1 unit; not dedicated ignores pair and SKU", () => {
    const one = ok(
      resolveSystemDesign(
        calc({ systemDesign: { management: { dedicated: true, sku: "VX5-V250-MGM" } } }),
        {},
        seedRules(),
        CATALOG,
      ),
    );
    assert.deepEqual(one.design.management, { dedicated: true, units: 1, sku: "VX5-V250-MGM" });
    const off = ok(
      resolveSystemDesign(
        calc({ systemDesign: { management: { dedicated: false, failoverPair: true, sku: "VX5-V250-MGM" } } }),
        {},
        seedRules(),
        CATALOG,
      ),
    );
    assert.deepEqual(off.design.management, { dedicated: false, units: 0, sku: null });
  });

  it("zero workstations means none, whatever SKU was picked", () => {
    const r = ok(
      resolveSystemDesign(
        calc({ systemDesign: { workstations: { count: 0, sku: "VX5-SW20-200" } } }),
        {},
        seedRules(),
        CATALOG,
      ),
    );
    assert.deepEqual(r.design.workstations, { count: 0, sku: null });
  });

  it("refuses SKUs outside the dropdowns, and missing SKUs", () => {
    const r = resolveSystemDesign(
      calc({
        systemDesign: {
          management: { dedicated: true, sku: "VX5-V600-320" },
          workstations: { count: 2, sku: "VX5-SW25-250" },
        },
      }),
      {},
      seedRules(),
      CATALOG,
    );
    assert.ok(!r.ok);
    assert.deepEqual(r.errors, [
      "VX5-V600-320 is not an active management server SKU.",
      "VX5-SW25-250 is not an active workstation SKU.",
    ]);
    const missing = resolveSystemDesign(
      calc({ systemDesign: { management: { dedicated: true }, workstations: { count: 1 } } }),
      {},
      seedRules(),
      CATALOG,
    );
    assert.ok(!missing.ok);
    assert.deepEqual(missing.errors, ["A dedicated management server needs a SKU.", "Workstations need a SKU."]);
  });
});

describe("resolveSystemDesign: refusals and advice", () => {
  it("refuses bad failover inputs and bad workstation counts", () => {
    const r = resolveSystemDesign(
      calc({
        systemDesign: {
          failover: { enabled: true, days: 0, primariesPerFailover: 1.5 },
          workstations: { count: -1, sku: "VX5-SW10-100" },
        },
      }),
      {},
      seedRules(),
      CATALOG,
    );
    assert.ok(!r.ok);
    assert.equal(r.errors.length, 3);
    assert.match(r.errors[0], /Failover days must be a whole number from 1 to 730; got 0/);
    assert.match(r.errors[1], /Primaries per failover must be a whole number from 1 to 100; got 1.5/);
    assert.match(r.errors[2], /Workstation count must be a whole number from 0 to 500; got -1/);
  });

  it("caps rep-entered counts, so a typo cannot reach the deal lines", () => {
    const atCap = ok(
      resolveSystemDesign(
        calc({
          systemDesign: {
            failover: { enabled: true, primariesPerFailover: 100 },
            workstations: { count: 500, sku: "VX5-SW10-100" },
          },
        }),
        {},
        seedRules(),
        CATALOG,
      ),
    );
    assert.equal(atCap.design.workstations.count, 500);
    const over = resolveSystemDesign(
      calc({
        systemDesign: {
          failover: { enabled: true, primariesPerFailover: 101 },
          workstations: { count: 501, sku: "VX5-SW10-100" },
        },
      }),
      {},
      seedRules(),
      CATALOG,
    );
    assert.ok(!over.ok);
    assert.equal(over.errors.length, 2);
    const huge = resolveSystemDesign(
      calc({ systemDesign: { workstations: { count: 1e300, sku: "VX5-SW10-100" } } }),
      {},
      seedRules(),
      CATALOG,
    );
    assert.ok(!huge.ok);
  });

  it("a SKU that is not text is refused with an error, never a crash", () => {
    const request = {
      management: { dedicated: true, sku: 42 },
      workstations: { count: 1, sku: { sku: "VX5-SW10-100" } },
    } as unknown as SystemDesignRequest;
    const r = resolveSystemDesign(calc({ systemDesign: request }), {}, seedRules(), CATALOG);
    assert.ok(!r.ok);
    assert.deepEqual(r.errors, [
      "42 is not an active management server SKU.",
      "[object Object] is not an active workstation SKU.",
    ]);
  });

  it("SFP+ or GPU on with no active rule for recorders is refused (architect review A-2)", () => {
    for (const [item, ids, label] of [
      ["sfp", [1, 2], "SFP+"],
      ["gpu", [5], "GPU"],
    ] as const) {
      const rules = seedRules();
      for (const id of ids) rules.bomRules.find((x) => x.id === id)!.active = false;
      const r = resolveSystemDesign(calc({ systemDesign: { [item]: true } }), {}, rules, CATALOG);
      assert.ok(!r.ok, item);
      assert.match(r.errors[0], new RegExp(`^${label.replace("+", "\\+")} is on, but no active BOM rule adds anything to recorders`));
      // With the item off, the same rules are fine.
      assert.ok(resolveSystemDesign(calc(), {}, rules, CATALOG).ok);
    }
    // No rules at all (a failed read passed as []): refused too.
    const empty = resolveSystemDesign(
      calc({ systemDesign: { sfp: true } }),
      {},
      { systemDesignRules: seedRules().systemDesignRules, bomRules: [] },
      CATALOG,
    );
    assert.ok(!empty.ok);
  });

  it("warns when a design item adds different parts to failovers than to recorders", () => {
    const rules = seedRules();
    rules.bomRules.find((x) => x.id === 4)!.active = false; // SFP28x10 for failovers retired
    const r = ok(
      resolveSystemDesign(
        calc({ systemDesign: { sfp: true, failover: { enabled: true } } }),
        {},
        rules,
        CATALOG,
      ),
    );
    assert.deepEqual(r.warnings, [
      "SFP+ adds 1 x VX5-NIC-SFP28 + 1 x VX5-NIC-SFP28x10 to each recorder but 1 x VX5-NIC-SFP28 to each failover. Check the BOM rules.",
    ]);
  });

  it("warns about one retired row of the recorders' pair even with failover off", () => {
    const rules = seedRules();
    rules.bomRules.find((x) => x.id === 2)!.active = false; // SFP28x10 for recorders retired
    const r = ok(resolveSystemDesign(calc({ systemDesign: { sfp: true } }), {}, rules, CATALOG));
    assert.deepEqual(r.warnings, [
      "The SFP+ rules for recorders (1 x VX5-NIC-SFP28) and for failovers (1 x VX5-NIC-SFP28 + 1 x VX5-NIC-SFP28x10) differ. Ask an admin to check them.",
    ]);
  });

  it("compares quantities as well as SKUs", () => {
    const rules = seedRules();
    rules.bomRules.find((x) => x.id === 6)!.qty_per_server = 2; // 2 GPUs per failover
    const r = ok(resolveSystemDesign(calc({ systemDesign: { gpu: true } }), {}, rules, CATALOG));
    assert.deepEqual(r.warnings, [
      "The GPU rules for recorders (1 x VX5-GPU-A1000) and for failovers (2 x VX5-GPU-A1000) differ. Ask an admin to check them.",
    ]);
    // The seeded rules are symmetric: no warning.
    assert.deepEqual(ok(resolveSystemDesign(calc({ systemDesign: { gpu: true, sfp: true } }), {}, seedRules(), CATALOG)).warnings, []);
  });

  it("refuses fractional failover days", () => {
    const r = resolveSystemDesign(
      calc({ systemDesign: { failover: { enabled: true, days: 7.5 } } }),
      {},
      seedRules(),
      CATALOG,
    );
    assert.ok(!r.ok);
    assert.match(r.errors[0], /Failover days must be a whole number from 1 to 730; got 7.5/);
  });

  it("a malformed rule stops the calc; no built-in default stands in", () => {
    const rules = seedRules();
    rules.systemDesignRules[0].value = "half";
    const r = resolveSystemDesign(calc({ systemDesign: { failover: { enabled: true } } }), {}, rules, CATALOG);
    assert.ok(!r.ok);
    assert.match(r.errors[0], /"failover_days_fraction" must be a number/);
  });

  it("warns when GPU is on for a VMS that does not use it, and not otherwise", () => {
    const on = (vms: string) =>
      ok(resolveSystemDesign(calc({ vms, systemDesign: { gpu: true } }), {}, seedRules(), CATALOG));
    assert.match(on("Milestone").warnings[0], /GPU is on, but the VMS is Milestone/);
    assert.deepEqual(on("Avigilon").warnings, []);
    assert.deepEqual(on("Hanwha").warnings, []);
    assert.deepEqual(on("NX Witness").warnings, []);
    assert.deepEqual(on("Other").warnings, []);
    // GPU stays on either way: the warning is advice only.
    assert.equal(on("Milestone").design.gpu, true);
  });

  it("warns when failover days exceed the longest retention", () => {
    const r = ok(
      resolveSystemDesign(
        calc({ systemDesign: { failover: { enabled: true, days: 45 } } }),
        {},
        seedRules(),
        CATALOG,
      ),
    );
    assert.match(r.warnings[0], /Failover days \(45\) are more than the longest retention \(30\)/);
  });
});

describe("rules snapshot", () => {
  it("a rule edited after save: the banked snapshot holds the old value", () => {
    // Saved at the seeded fraction 1 (30 days), then an admin moves it to 0.25.
    const live = seedRules();
    const request = calc({ systemDesign: { failover: { enabled: true } } });

    const atSave = ok(resolveSystemDesign(request, {}, live, CATALOG));
    assert.equal(atSave.design.failover.enabled && atSave.design.failover.days, 30);
    // Banked as jsonb with the calc.
    const banked = JSON.parse(JSON.stringify(atSave.snapshot));

    // An admin then edits the live rows (in place, to prove nothing is shared).
    live.systemDesignRules.find((x) => x.key === "failover_days_fraction")!.value = 0.25;
    live.systemDesignRules.find((x) => x.key === "default_primaries_per_failover")!.value = 3;

    // The snapshot did not move...
    assert.equal(
      atSave.snapshot.systemDesignRules.find((x) => x.key === "failover_days_fraction")!.value,
      1,
    );
    // ...resolving from it gives the saved values...
    const fromSnapshot = ok(resolveSystemDesign(request, {}, banked, CATALOG));
    assert.deepEqual(fromSnapshot.design, atSave.design);
    assert.deepEqual(fromSnapshot.snapshot, atSave.snapshot);
    // ...and resolving from the live rules gives the new ones.
    const fromLive = ok(resolveSystemDesign(request, {}, live, CATALOG));
    assert.deepEqual(fromLive.design.failover, {
      enabled: true,
      days: 8, // ceil(30 × 0.25)
      primariesPerFailover: 3,
      daysDefaulted: true,
      ratioDefaulted: true,
    });
  });
});

describe("dedicatedManagementSuggestion", () => {
  const base = ok(resolveSystemDesign(calc(), {}, seedRules(), CATALOG));

  it("suggests one above the threshold, counting primaries and failovers", () => {
    assert.equal(dedicatedManagementSuggestion(base, 3, 0), null);
    assert.equal(dedicatedManagementSuggestion(base, 2, 1), null);
    assert.match(dedicatedManagementSuggestion(base, 3, 1)!, /4 recording servers \(more than 3\)/);
  });

  it("says nothing once a dedicated server is chosen", () => {
    const dedicated = ok(
      resolveSystemDesign(
        calc({ systemDesign: { management: { dedicated: true, sku: "VX5-V250-MGM" } } }),
        {},
        seedRules(),
        CATALOG,
      ),
    );
    assert.equal(dedicatedManagementSuggestion(dedicated, 18, 9), null);
  });
});

describe("requestFromResolvedDesign (ADR 0173)", () => {
  it("round-trips the rep's choices, and lets defaulted failover values default again", () => {
    const chosen: SystemDesignRequest = {
      sfp: false,
      gpu: true,
      failover: { enabled: true },
      management: { dedicated: true, failoverPair: true, sku: "VX5-V255-MGM" },
      workstations: { count: 2, sku: "VX5-SW20-200" },
    };
    const first = ok(resolveSystemDesign(calc({ systemDesign: chosen }), {}, seedRules(), CATALOG));
    const again = requestFromResolvedDesign(JSON.parse(JSON.stringify(first.design)));
    assert.deepEqual(again, {
      sfp: false,
      gpu: true,
      failover: { enabled: true, days: null, primariesPerFailover: null },
      management: { dedicated: true, failoverPair: true, sku: "VX5-V255-MGM" },
      workstations: { count: 2, sku: "VX5-SW20-200" },
    });
    const second = ok(resolveSystemDesign(calc({ systemDesign: again }), {}, seedRules(), CATALOG));
    assert.deepEqual(second.design, first.design);
  });

  it("keeps failover values the rep set, and an all-off design", () => {
    const set = ok(resolveSystemDesign(calc({ systemDesign: { failover: { enabled: true, days: 20, primariesPerFailover: 3 } } }), {}, seedRules(), CATALOG));
    assert.deepEqual(requestFromResolvedDesign(set.design)?.failover, { enabled: true, days: 20, primariesPerFailover: 3 });
    const off = ok(resolveSystemDesign(calc(), {}, seedRules(), CATALOG));
    assert.deepEqual(requestFromResolvedDesign(off.design), {
      sfp: false,
      gpu: false,
      failover: { enabled: false },
      management: { dedicated: false },
      workstations: { count: 0, sku: null },
    });
  });

  it("returns null for anything unreadable", () => {
    assert.equal(requestFromResolvedDesign(null), null);
    // An older banked shape with no defaulted flags: the values default again.
    const old = { sfp: false, gpu: false, failover: { enabled: true, days: 45, primariesPerFailover: 2 }, management: { dedicated: false }, workstations: { count: 0, sku: null } };
    assert.deepEqual(requestFromResolvedDesign(old)?.failover, { enabled: true, days: null, primariesPerFailover: null });
    assert.equal(requestFromResolvedDesign({ sfp: "yes" }), null);
    assert.equal(requestFromResolvedDesign({ sfp: false, gpu: false, failover: {}, management: { dedicated: false }, workstations: { count: 0 } }), null);
  });
});
