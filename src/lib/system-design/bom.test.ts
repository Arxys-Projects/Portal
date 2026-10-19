import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildBom, type BomInput } from "./bom";
import { parseDesignRules, type BomRule } from "./rules";
import { seedRules } from "./seed-rules.test-fixtures";

function seedBom(): BomRule[] {
  const r = parseDesignRules(seedRules());
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.snapshot.bomRules;
}

const input = (over: Partial<BomInput> = {}): BomInput => ({
  primary: { sku: "VX5-V500-240", units: 3 },
  failover: null,
  management: { sku: null, units: 0 },
  gpu: false,
  sfp: false,
  workstations: { sku: null, count: 0 },
  bomRules: seedBom(),
  ...over,
});

describe("buildBom", () => {
  it("with nothing on, is just the recorders", () => {
    assert.deepEqual(buildBom(input()), [
      { sku: "VX5-V500-240", qty: 3, role: "recorder", ruleId: null },
    ]);
  });

  it("lines carry no price", () => {
    for (const line of buildBom(input({ sfp: true, gpu: true }))) {
      assert.deepEqual(Object.keys(line).sort(), ["qty", "role", "ruleId", "sku"]);
    }
  });

  it("everything on: per-server add-ons multiply by each role's server count", () => {
    const lines = buildBom(
      input({
        failover: { sku: "VX5-V500-192", units: 2 },
        management: { sku: "VX5-V255-MGM", units: 2 },
        sfp: true,
        gpu: true,
        workstations: { sku: "VX5-SW20-200", count: 4 },
      }),
    );
    assert.deepEqual(lines, [
      { sku: "VX5-V500-240", qty: 3, role: "recorder", ruleId: null },
      { sku: "VX5-NIC-SFP28", qty: 3, role: "recorder", ruleId: 1 },
      { sku: "VX5-NIC-SFP28x10", qty: 3, role: "recorder", ruleId: 2 },
      { sku: "VX5-GPU-A1000", qty: 3, role: "recorder", ruleId: 5 },
      { sku: "VX5-V500-192", qty: 2, role: "failover", ruleId: null },
      { sku: "VX5-NIC-SFP28", qty: 2, role: "failover", ruleId: 3 },
      { sku: "VX5-NIC-SFP28x10", qty: 2, role: "failover", ruleId: 4 },
      { sku: "VX5-GPU-A1000", qty: 2, role: "failover", ruleId: 6 },
      // SFP+ and GPU rules exist for recorders and failovers only.
      { sku: "VX5-V255-MGM", qty: 2, role: "mgmt", ruleId: null },
      { sku: "VX5-SW20-200", qty: 4, role: "workstation", ruleId: null },
    ]);
  });

  it("failover-pair management is one line of 2, and a mgmt rule doubles with it", () => {
    const rules: BomRule[] = [
      ...seedBom(),
      {
        id: 20,
        design_item: "sfp",
        applies_to_role: "mgmt",
        sku: "VX5-NIC-SFP28",
        qty_per_server: 1,
        description: "test only",
        active: true,
      },
    ];
    const lines = buildBom(input({ management: { sku: "VX5-V250-MGM", units: 2 }, sfp: true, bomRules: rules }));
    assert.deepEqual(
      lines.filter((l) => l.role === "mgmt"),
      [
        { sku: "VX5-V250-MGM", qty: 2, role: "mgmt", ruleId: null },
        { sku: "VX5-NIC-SFP28", qty: 2, role: "mgmt", ruleId: 20 },
      ],
    );
  });

  it("zero workstations adds no line", () => {
    const lines = buildBom(input({ workstations: { sku: null, count: 0 } }));
    assert.ok(!lines.some((l) => l.role === "workstation"));
  });

  it("failover on but nothing qualified: no failover lines, and no failover add-ons", () => {
    const lines = buildBom(input({ failover: null, sfp: true }));
    assert.ok(!lines.some((l) => l.role === "failover"));
  });

  it("a rule for an unknown design item adds nothing", () => {
    const rules: BomRule[] = [
      ...seedBom(),
      {
        id: 30,
        design_item: "ram",
        applies_to_role: "recorder",
        sku: "VX5-RAM-32GB",
        qty_per_server: 2,
        description: "test only",
        active: true,
      },
    ];
    assert.deepEqual(buildBom(input({ bomRules: rules })), buildBom(input()));
  });

  it("orders lines the same way whatever order the rules arrive in", () => {
    const shuffled = [...seedBom()].reverse();
    assert.deepEqual(
      buildBom(input({ sfp: true, gpu: true, bomRules: shuffled })),
      buildBom(input({ sfp: true, gpu: true })),
    );
  });

  it("refuses a rule that repeats the role's own server SKU", () => {
    const rules: BomRule[] = [
      {
        id: 40,
        design_item: "gpu",
        applies_to_role: "recorder",
        sku: "VX5-V500-240",
        qty_per_server: 1,
        description: "test only",
        active: true,
      },
    ];
    assert.throws(() => buildBom(input({ gpu: true, bomRules: rules })), /VX5-V500-240 would be two recorder lines/);
  });

  it("refuses a malformed rule handed in without a fresh parse (security review S-2)", () => {
    const bad = (over: Partial<BomRule>) => [{ ...seedBom()[0], ...over } as BomRule];
    for (const over of [
      { qty_per_server: -5 },
      { qty_per_server: "3" as unknown as number },
      { qty_per_server: 1.5 },
      { qty_per_server: 1e308 },
      { qty_per_server: 101 },
      { sku: "" },
      { applies_to_role: "rack" as BomRule["applies_to_role"] },
      { id: 0 },
      { active: undefined as unknown as true },
      { design_item: 7 as unknown as string },
    ]) {
      assert.throws(
        () => buildBom(input({ sfp: true, bomRules: bad(over) })),
        /is malformed/,
        JSON.stringify(over),
      );
    }
  });

  it("refuses impossible counts", () => {
    assert.throws(() => buildBom(input({ primary: { sku: "VX5-V500-240", units: 0 } })), /primary/);
    assert.throws(() => buildBom(input({ failover: { sku: "X", units: 0 } })), /failover/);
    assert.throws(() => buildBom(input({ management: { sku: "VX5-V250-MGM", units: 3 } })), /management/);
    assert.throws(() => buildBom(input({ management: { sku: null, units: 1 } })), /management/);
    assert.throws(() => buildBom(input({ workstations: { sku: null, count: 2 } })), /workstations/);
    assert.throws(() => buildBom(input({ workstations: { sku: "VX5-SW10-100", count: 1.5 } })), /workstations/);
    assert.throws(() => buildBom(input({ primary: { sku: "VX5-V500-240", units: 2 ** 53 } })), /primary/);
    assert.throws(() => buildBom(input({ workstations: { sku: "VX5-SW10-100", count: 501 } })), /workstations/);
    assert.equal(buildBom(input({ workstations: { sku: "VX5-SW10-100", count: 500 } }))[1].qty, 500);
  });
});
