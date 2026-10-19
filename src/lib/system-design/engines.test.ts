// The Step 3 engines chained the way a project calc will use them (Step 4 wires
// this into submitCalculation): resolveSystemDesign, then sizeProjectDesign
// (primary with excludeOneU = sfp, failover from the same pool, BOM).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeGroup, vsrLoad, type GroupInput } from "@/lib/calculator/compute";
import { CODECS, COMPLEXITIES, RESOLUTIONS } from "@/lib/calculator/tables";
import { GB_PER_TB } from "@/lib/recommend/types";
import { seededPool } from "@/lib/recommend/seeded-pool.test-fixtures";
import { buildBom } from "./bom";
import { resolveSystemDesign, type SystemDesignRequest } from "./resolve";
import { sizeProjectDesign } from "./size";
import { CATALOG, seedRules } from "./seed-rules.test-fixtures";

// The frozen pool with rack units and SFP add-on from the repo's seed file.
const POOL = seededPool();

type Group = { cameras: number; retentionDays: number };

function runProjectCalc(groups: Group[], systemDesign: SystemDesignRequest, specs = POOL) {
  const resolution = resolveSystemDesign(
    { retentionDays: 30, groups, vms: "Avigilon", systemDesign },
    {},
    seedRules(),
    CATALOG,
  );
  if (!resolution.ok) throw new Error(resolution.errors.join("; "));

  // 4MP H.265 at 15 fps, continuous: the calculator's default group.
  const sized = groups.map((g) => {
    const gi: GroupInput = {
      cameras: g.cameras,
      resolution: RESOLUTIONS[14],
      codec: CODECS[0],
      complexity: COMPLEXITIES[2],
      fps: 15,
      retentionDays: g.retentionDays,
      recordingMode: "constant",
      recordingPercent: 100,
      motionPercent: 100,
    };
    return { ...g, computed: computeGroup(gi) };
  });
  const totalCameras = sized.reduce((n, g) => n + g.cameras, 0);
  const totalStorageGb = sized.reduce((n, g) => n + g.computed.storageGb, 0);
  const totalVsr = sized.reduce((n, g) => n + vsrLoad(g.cameras, RESOLUTIONS[14]), 0);

  const sizing = sizeProjectDesign({
    resolution,
    totals: { totalCameras, totalStorageGb, totalVsr },
    groups: sized.map((g) => ({ storageGb: g.computed.storageGb, retentionDays: g.retentionDays })),
    specs,
  });
  if (!sizing.ok) throw new Error(sizing.error);
  return { design: resolution.design, ...sizing };
}

describe("project calc engines, chained", () => {
  it("SFP+ on a calc that would have picked a V200: a 2U server plus the SFP+ pair", () => {
    // 20 cameras at 30 days needs about 36 TB: one V200-64 (48 TB usable).
    const small = [{ cameras: 20, retentionDays: 30 }];
    const plain = runProjectCalc(small, {});
    assert.equal(plain.primary.winner.productGroup, "V200");

    const r = runProjectCalc(small, { sfp: true });
    assert.notEqual(r.primary.winner.productGroup, "V200");
    const units = r.primary.winner.units;
    assert.deepEqual(r.bom, [
      { sku: r.primary.winner.sku, qty: units, role: "recorder", ruleId: null },
      { sku: "VX5-NIC-SFP28", qty: units, role: "recorder", ruleId: 1 },
      { sku: "VX5-NIC-SFP28x10", qty: units, role: "recorder", ruleId: 2 },
    ]);
  });

  it("GPU on a V200: no exclusion, one GPU per recorder", () => {
    const r = runProjectCalc([{ cameras: 20, retentionDays: 30 }], { gpu: true });
    assert.equal(r.primary.winner.productGroup, "V200");
    assert.deepEqual(r.bom, [
      { sku: r.primary.winner.sku, qty: r.primary.winner.units, role: "recorder", ruleId: null },
      { sku: "VX5-GPU-A1000", qty: r.primary.winner.units, role: "recorder", ruleId: 5 },
    ]);
  });

  it("failover on a mixed-retention calc: count, floors, and add-ons on the failovers too", () => {
    const groups = [
      { cameras: 300, retentionDays: 90 },
      { cameras: 400, retentionDays: 14 },
      { cameras: 250, retentionDays: 30 },
    ];
    const r = runProjectCalc(groups, { sfp: true, gpu: true, failover: { enabled: true } });
    assert.ok(r.design.failover.enabled);
    assert.equal(r.design.failover.days, 45); // ceil(90 × 0.5)

    const primaryUnits = r.primary.winner.units;
    const choice = r.failover?.choice;
    assert.ok(choice, `expected a failover SKU; warnings: ${r.failover?.warnings.join(" | ")}`);
    assert.equal(choice.units, Math.ceil(primaryUnits / 2));
    const primarySpec = POOL.find((s) => s.sku === r.primary.winner.sku)!;
    assert.ok(choice.maxCameras >= primarySpec.maxCameras);
    assert.ok(choice.usableStorageTb >= r.failover!.requiredPerUnitTb);
    assert.notEqual(choice.productGroup, "V200");

    // Daily load is per group at its own retention, times the failover days.
    let perDay = 0;
    for (const g of groups) {
      const c = computeGroup({
        cameras: g.cameras,
        resolution: RESOLUTIONS[14],
        codec: CODECS[0],
        complexity: COMPLEXITIES[2],
        fps: 15,
        retentionDays: g.retentionDays,
        recordingMode: "constant",
        recordingPercent: 100,
        motionPercent: 100,
      });
      perDay += c.storageGb / g.retentionDays;
    }
    assert.ok(Math.abs(r.failover!.dailyLoadGb - perDay) < 1e-6);
    assert.ok(Math.abs(r.failover!.requiredPerUnitTb - (perDay / primaryUnits) * 45 / GB_PER_TB) < 1e-9);

    assert.deepEqual(
      r.bom.filter((l) => l.role === "failover"),
      [
        { sku: choice.sku, qty: choice.units, role: "failover", ruleId: null },
        { sku: "VX5-NIC-SFP28", qty: choice.units, role: "failover", ruleId: 3 },
        { sku: "VX5-NIC-SFP28x10", qty: choice.units, role: "failover", ruleId: 4 },
        { sku: "VX5-GPU-A1000", qty: choice.units, role: "failover", ruleId: 6 },
      ],
    );
  });

  it("failover with no qualifying SKU: a warning, no failover lines, and the primary stands", () => {
    // A heavy 7-day group beside a light 365-day one. The default failover days
    // come from the longest retention (ceil(365 x 0.5) = 183), and 183 days of the
    // heavy group's daily load is far more than any one server holds.
    const r = runProjectCalc(
      [
        { cameras: 600, retentionDays: 7 },
        { cameras: 20, retentionDays: 365 },
      ],
      { sfp: true, failover: { enabled: true, primariesPerFailover: 1 } },
    );
    assert.ok(r.design.failover.enabled && r.design.failover.days === 183);
    assert.equal(r.failover?.choice, null);
    assert.equal(r.failover?.units, r.primary.winner.units);
    assert.match(r.failover!.warnings[0], /No failover server fits/);
    assert.ok(!r.bom.some((l) => l.role === "failover"));
    assert.equal(r.bom[0].role, "recorder");
  });

  it("a retired BOM rule adds nothing; its twin for the other role still applies", () => {
    const rules = seedRules();
    rules.bomRules.find((x) => x.id === 6)!.active = false; // GPU for failovers retired
    const resolution = resolveSystemDesign(
      { retentionDays: 30, groups: [{}], systemDesign: { gpu: true, failover: { enabled: true } } },
      {},
      rules,
      CATALOG,
    );
    assert.ok(resolution.ok);
    assert.ok(!resolution.snapshot.bomRules.some((x) => x.id === 6));
    // The rep is told the failovers get no GPU.
    assert.match(resolution.warnings[0], /GPU adds 1 x VX5-GPU-A1000 to each recorder but nothing to each failover/);
    const bom = buildBom({
      primary: { sku: "VX5-V500-240", units: 2 },
      failover: { sku: "VX5-V500-192", units: 1 },
      management: resolution.design.management,
      gpu: resolution.design.gpu,
      sfp: resolution.design.sfp,
      workstations: resolution.design.workstations,
      bomRules: resolution.snapshot.bomRules,
    });
    assert.deepEqual(bom, [
      { sku: "VX5-V500-240", qty: 2, role: "recorder", ruleId: null },
      { sku: "VX5-GPU-A1000", qty: 2, role: "recorder", ruleId: 5 },
      { sku: "VX5-V500-192", qty: 1, role: "failover", ruleId: null },
    ]);
  });

  it("gathers every warning in order, including the management suggestion", () => {
    // 1,200 cameras needs well over 3 recorders; failover adds more.
    const r = runProjectCalc([{ cameras: 1200, retentionDays: 30 }], {
      failover: { enabled: true, days: 60 },
    });
    assert.match(r.warnings[0], /Failover days \(60\) are more than the longest retention \(30\)/);
    assert.ok(r.warnings.some((w) => /stacks \d+ units/.test(w)));
    assert.match(r.warnings[r.warnings.length - 1], /Consider a dedicated management server/);
  });

  it("refuses groups whose retention disagrees with the resolved design (architect review A-7)", () => {
    const resolution = resolveSystemDesign(
      { retentionDays: 30, groups: [{}], systemDesign: { failover: { enabled: true } } },
      {},
      seedRules(),
      CATALOG,
    );
    assert.ok(resolution.ok);
    const base = {
      resolution,
      totals: { totalCameras: 20, totalStorageGb: 36_000, totalVsr: 20 },
      specs: POOL,
    };
    assert.deepEqual(sizeProjectDesign({ ...base, groups: [{ storageGb: 36_000, retentionDays: 90 }] }), {
      ok: false,
      error:
        "sizeProjectDesign(): the groups' longest retention (90) differs from the resolved design's (30); resolve and size from the same groups",
    });
    assert.equal(sizeProjectDesign({ ...base, groups: [] }).ok, false);
    assert.equal(sizeProjectDesign({ ...base, groups: [{ storageGb: 36_000, retentionDays: 30 }] }).ok, true);
  });

  it("an SFP+ calc on a pool loaded without rack units comes back as an error, never a throw", () => {
    const withoutRack = POOL.map((s) => ({ ...s, rackUnits: null }));
    const resolution = resolveSystemDesign(
      { retentionDays: 30, groups: [{}], systemDesign: { sfp: true } },
      {},
      seedRules(),
      CATALOG,
    );
    assert.ok(resolution.ok);
    const sizing = sizeProjectDesign({
      resolution,
      totals: { totalCameras: 20, totalStorageGb: 36_000, totalVsr: 20 },
      groups: [{ storageGb: 36_000, retentionDays: 30 }],
      specs: withoutRack,
    });
    assert.deepEqual(sizing, {
      ok: false,
      error: "recommend(): no SKUs left after excluding 1U servers (SFP+ is on)",
    });
  });

  it("management pair and workstations ride along without touching sizing", () => {
    const base = runProjectCalc([{ cameras: 200, retentionDays: 30 }], {});
    const r = runProjectCalc([{ cameras: 200, retentionDays: 30 }], {
      management: { dedicated: true, failoverPair: true, sku: "VX5-V255-MGM" },
      workstations: { count: 0, sku: "VX5-SW10-100" },
    });
    assert.deepEqual(r.primary, base.primary);
    assert.deepEqual(
      r.bom.filter((l) => l.role !== "recorder"),
      [{ sku: "VX5-V255-MGM", qty: 2, role: "mgmt", ruleId: null }],
    );
  });
});
