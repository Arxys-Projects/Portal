import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseDesignRules } from "./rules";
import { seedBomRules, seedRules, seedSystemDesignRules } from "./seed-rules.test-fixtures";

describe("parseDesignRules", () => {
  it("reads the seeded rules", () => {
    const r = parseDesignRules(seedRules());
    assert.ok(r.ok);
    assert.deepEqual(r.values, {
      failoverDaysFraction: 0.5,
      defaultPrimariesPerFailover: 2,
      suggestDedicatedMgmtAboveServers: 3,
    });
    assert.equal(r.bomRules.length, 6);
    assert.deepEqual(r.warnings, []);
    // The snapshot lists rules in a stable order: keys alphabetically, BOM rules by id.
    assert.deepEqual(
      r.snapshot.systemDesignRules.map((x) => x.key),
      ["default_primaries_per_failover", "failover_days_fraction", "suggest_dedicated_mgmt_above_servers"],
    );
    assert.deepEqual(r.snapshot.bomRules.map((x) => x.id), [1, 2, 3, 4, 5, 6]);
  });

  it("checks each jsonb value's type, and never falls back to a default", () => {
    const cases: Array<[key: string, value: unknown, message: RegExp]> = [
      ["failover_days_fraction", "0.5", /"failover_days_fraction" must be a number above 0 and at most 1; it is "0.5"/],
      ["failover_days_fraction", 0, /above 0/],
      ["failover_days_fraction", 1.5, /at most 1/],
      ["failover_days_fraction", null, /it is null/],
      ["default_primaries_per_failover", 2.5, /"default_primaries_per_failover" must be a whole number from 1 to 100/],
      ["default_primaries_per_failover", 0, /from 1 to 100/],
      ["default_primaries_per_failover", 101, /from 1 to 100/],
      ["default_primaries_per_failover", true, /it is true/],
      ["suggest_dedicated_mgmt_above_servers", -1, /0 or more/],
      ["suggest_dedicated_mgmt_above_servers", { n: 3 }, /it is \{"n":3\}/],
    ];
    for (const [key, value, message] of cases) {
      const rules = seedRules();
      const row = rules.systemDesignRules.find((x) => x.key === key)!;
      row.value = value;
      const r = parseDesignRules(rules);
      assert.equal(r.ok, false, `${key} = ${JSON.stringify(value)}`);
      if (!r.ok) assert.match(r.errors.join("\n"), message);
    }
  });

  it("refuses a missing or doubled key", () => {
    const missing = parseDesignRules({
      systemDesignRules: seedSystemDesignRules().filter((x) => x.key !== "default_primaries_per_failover"),
      bomRules: seedBomRules(),
    });
    assert.ok(!missing.ok);
    assert.match(missing.errors[0], /"default_primaries_per_failover" is missing/);

    const doubled = seedRules();
    doubled.systemDesignRules.push({ ...doubled.systemDesignRules[0] });
    const r = parseDesignRules(doubled);
    assert.ok(!r.ok);
    assert.match(r.errors[0], /appears twice/);
  });

  it("ignores an unknown key, and leaves it out of the snapshot", () => {
    const rules = seedRules();
    rules.systemDesignRules.push({ key: "future_rule", value: "VX5-X", description: "later" });
    const r = parseDesignRules(rules);
    assert.ok(r.ok);
    assert.ok(!r.snapshot.systemDesignRules.some((x) => x.key === "future_rule"));
  });

  it("skips retired BOM rules and validates active ones", () => {
    const rules = seedRules();
    rules.bomRules[4].active = false; // GPU for recorders retired
    rules.bomRules.push({
      id: 7,
      design_item: "gpu",
      applies_to_role: "rack",
      sku: "",
      qty_per_server: 0,
      description: "bad",
      active: true,
    });
    const r = parseDesignRules(rules);
    assert.ok(!r.ok);
    assert.deepEqual(r.errors, [
      'BOM rule #7 applies to an unknown role "rack", has no SKU, has quantity 0; it must be a whole number from 1 to 100.',
    ]);

    rules.bomRules.pop();
    const ok = parseDesignRules(rules);
    assert.ok(ok.ok);
    assert.deepEqual(ok.bomRules.map((x) => x.id), [1, 2, 3, 4, 6]);
  });

  it("refuses a BOM row with no active flag, and a quantity above the ceiling", () => {
    const noFlag = seedRules();
    delete (noFlag.bomRules[0] as Partial<(typeof noFlag.bomRules)[0]>).active;
    const r = parseDesignRules(noFlag);
    assert.ok(!r.ok);
    assert.match(r.errors[0], /BOM rule #1 has no active flag/);

    const huge = seedRules();
    huge.bomRules[0].qty_per_server = 101;
    const h = parseDesignRules(huge);
    assert.ok(!h.ok);
    assert.match(h.errors[0], /BOM rule #1 has quantity 101; it must be a whole number from 1 to 100/);

    const unsafe = seedRules();
    unsafe.systemDesignRules[1].value = 2 ** 53;
    assert.equal(parseDesignRules(unsafe).ok, false);
  });

  it("refuses two active rules that add one SKU to one role", () => {
    const rules = seedRules();
    rules.bomRules.push({ ...rules.bomRules[0], id: 9, design_item: "nic" });
    const r = parseDesignRules(rules);
    assert.ok(!r.ok);
    assert.match(r.errors[0], /BOM rules #1 and #9 both add VX5-NIC-SFP28 to each recorder/);
  });

  it("keeps a rule for a design item the engine does not know, with a warning", () => {
    const rules = seedRules();
    rules.bomRules.push({ ...rules.bomRules[0], id: 8, design_item: "ram", sku: "VX5-RAM-32GB" });
    const r = parseDesignRules(rules);
    assert.ok(r.ok);
    assert.ok(r.snapshot.bomRules.some((x) => x.id === 8));
    assert.match(r.warnings[0], /BOM rule #8 is for "ram", which is not a design choice yet/);
  });

  it("copies every row: editing the input afterwards does not reach the snapshot", () => {
    const rules = seedRules();
    const r = parseDesignRules(rules);
    assert.ok(r.ok);
    rules.systemDesignRules[0].value = 0.25;
    rules.bomRules[0].qty_per_server = 5;
    rules.bomRules[0].sku = "VX5-OTHER";
    assert.equal(r.snapshot.systemDesignRules.find((x) => x.key === "failover_days_fraction")!.value, 0.5);
    assert.equal(r.snapshot.bomRules[0].qty_per_server, 1);
    assert.equal(r.snapshot.bomRules[0].sku, "VX5-NIC-SFP28");
    // Nor does editing the parsed rules.
    r.bomRules[1].qty_per_server = 7;
    assert.equal(r.snapshot.bomRules[1].qty_per_server, 1);
  });

  it("parses its own snapshot back to the same values (banked as jsonb)", () => {
    const first = parseDesignRules(seedRules());
    assert.ok(first.ok);
    const banked = JSON.parse(JSON.stringify(first.snapshot));
    const again = parseDesignRules(banked);
    assert.ok(again.ok);
    assert.deepEqual(again.values, first.values);
    assert.deepEqual(again.snapshot, first.snapshot);
  });
});
