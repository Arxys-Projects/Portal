// Golden-file regression harness for the calculator math audit (Phase 1).
//
// Captures the CURRENT output of the camera→appliance math across the full
// input matrix, so any later coefficient/formula change produces a visible
// git diff in src/lib/calculator/__golden__/ rather than silent drift.
//
// This harness asserts NOTHING about correctness — only that output is
// unchanged since the last deliberate regeneration. When a coefficient change
// is intentional, regenerate and commit the diff alongside it:
//
//   UPDATE_GOLDEN=1 npm test
//
// Files under __golden__/:
//   matrix.csv                  — full input matrix at 100 cameras/group
//   specs-pool.json             — frozen live SKU pool (captured 2026-08-12)
//   fixture-mixed-project.json  — the five-scene / 300-camera named fixture
//
// See docs/audits/calculator-math-audit.md for what each number means.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { computeGroup, vsrLoad, type GroupInput } from "./compute";
import { CODECS, COMPLEXITIES, RESOLUTIONS } from "./tables";
import { recommend } from "../recommend/algorithm";
import type { ServerSpec } from "../recommend/types";

const GOLDEN_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "__golden__");
const UPDATE = process.env.UPDATE_GOLDEN === "1";

// Frozen SKU pool: the live recommender candidate pool (current_products ×
// product_specs via selectCandidates) captured 2026-08-12. Frozen so the
// harness measures MATH drift, not catalog drift. Regenerating the golden
// files does NOT refresh this file; recapture deliberately if the catalog
// matters to a comparison.
const POOL: ServerSpec[] = JSON.parse(
  readFileSync(path.join(GOLDEN_DIR, "specs-pool.json"), "utf8"),
).pool;

// Representative single SKU for the matrix's unit-count column: VX5-V600-320
// (mid-catalog, 280 TB usable, 275 VSR). The full-pool winner is exercised by
// the fixture project instead.
const REPRESENTATIVE_SKU = "VX5-V600-320";

// 7 significant digits: stable, diff-friendly, and fine-grained enough that
// any real coefficient change (≥0.0001%) shows up.
const fmt = (n: number): string => n.toPrecision(7);

// ---------------------------------------------------------------------------
// Matrix generation — every RESOLUTIONS entry × fps 5/10/12/15/20/30 × all
// codecs × all six complexity tiers × motion 0/25/50/75/100 × retention
// 7/30/60/90 days × recordingPercent 100 (continuous) and 50 (12 h/day).
// Cameras fixed at 100 per row so storage totals and unit counts are realistic.
// motion 0 is below the UI's 20% floor — included deliberately to pin the
// 0.2 idle-floor behavior.
// ---------------------------------------------------------------------------
const FPS_STEPS = [5, 10, 12, 15, 20, 30] as const;
const MOTION_STEPS = [0, 25, 50, 75, 100] as const;
const RETENTION_STEPS = [7, 30, 60, 90] as const;
const RECORDING_STEPS = [100, 50] as const;
const MATRIX_CAMERAS = 100;

function generateMatrixCsv(): string {
  const repSpec = POOL.find((s) => s.sku === REPRESENTATIVE_SKU);
  if (!repSpec) throw new Error(`${REPRESENTATIVE_SKU} missing from frozen pool`);
  const lines: string[] = [
    `# calculator golden matrix — cameras=${MATRIX_CAMERAS} per row; units = recommended`,
    `# unit count for ${REPRESENTATIVE_SKU} alone (storage floor 1.2 / VSR floor 1.1).`,
    `# resIdx = index into RESOLUTIONS; cxIdx = index into COMPLEXITIES.`,
    "resIdx,fps,codec,cxIdx,motion,ret,rec,frameKb,bitrateMbps,bandwidthMbps,rawStorageGb,storageGb,units",
  ];
  for (let resIdx = 0; resIdx < RESOLUTIONS.length; resIdx++) {
    const resolution = RESOLUTIONS[resIdx];
    const vsr = vsrLoad(MATRIX_CAMERAS, resolution);
    for (const fps of FPS_STEPS) {
      for (const codec of CODECS) {
        for (let cxIdx = 0; cxIdx < COMPLEXITIES.length; cxIdx++) {
          for (const motion of MOTION_STEPS) {
            for (const ret of RETENTION_STEPS) {
              for (const rec of RECORDING_STEPS) {
                const gi: GroupInput = {
                  cameras: MATRIX_CAMERAS,
                  resolution,
                  codec,
                  complexity: COMPLEXITIES[cxIdx],
                  fps,
                  recordingPercent: rec,
                  motionPercent: motion,
                };
                const c = computeGroup(gi, ret);
                const { winner } = recommend(
                  {
                    totalCameras: MATRIX_CAMERAS,
                    totalStorageGb: c.storageGb,
                    totalVsr: vsr,
                  },
                  [repSpec],
                );
                lines.push(
                  [
                    resIdx,
                    fps,
                    codec.value,
                    cxIdx,
                    motion,
                    ret,
                    rec,
                    fmt(c.frameKb),
                    fmt(c.bitrateMbps),
                    fmt(c.bandwidthMbps),
                    fmt(c.rawStorageGb),
                    fmt(c.storageGb),
                    winner.units,
                  ].join(","),
                );
              }
            }
          }
        }
      }
    }
  }
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Named fixture: "five-scene mixed project" — 300 cameras across five groups,
// 30-day retention. Defined by the 2026-08 math audit as the canonical
// realistic deal, so coefficient changes can be read as TB and appliance count
// on a real quote rather than as abstract percentages.
// ---------------------------------------------------------------------------
type FixtureGroup = {
  name: string;
  cameras: number;
  resolutionIdx: number;
  codecIdx: number;
  complexityIdx: number;
  fps: number;
  recordingPercent: number;
  motionPercent: number;
};

export const FIXTURE_RETENTION_DAYS = 30;
export const FIXTURE_GROUPS: readonly FixtureGroup[] = [
  // Constant recording ⇒ motion pinned to 100 (server behavior).
  { name: "Perimeter & parking", cameras: 80, resolutionIdx: 14, codecIdx: 0, complexityIdx: 2, fps: 12, recordingPercent: 100, motionPercent: 100 },
  { name: "Lobby & entries", cameras: 60, resolutionIdx: 11, codecIdx: 0, complexityIdx: 1, fps: 15, recordingPercent: 100, motionPercent: 75 },
  { name: "Warehouse floor", cameras: 90, resolutionIdx: 15, codecIdx: 2, complexityIdx: 3, fps: 15, recordingPercent: 100, motionPercent: 50 },
  { name: "Loading dock (12 h/day)", cameras: 40, resolutionIdx: 19, codecIdx: 1, complexityIdx: 4, fps: 10, recordingPercent: 50, motionPercent: 100 },
  { name: "Back offices", cameras: 30, resolutionIdx: 8, codecIdx: 0, complexityIdx: 0, fps: 15, recordingPercent: 100, motionPercent: 25 },
];

function generateFixtureJson(): string {
  const groups = FIXTURE_GROUPS.map((g) => {
    const gi: GroupInput = {
      cameras: g.cameras,
      resolution: RESOLUTIONS[g.resolutionIdx],
      codec: CODECS[g.codecIdx],
      complexity: COMPLEXITIES[g.complexityIdx],
      fps: g.fps,
      recordingPercent: g.recordingPercent,
      motionPercent: g.motionPercent,
    };
    const computed = computeGroup(gi, FIXTURE_RETENTION_DAYS);
    return {
      input: { ...g, resolutionLabel: RESOLUTIONS[g.resolutionIdx].label, codec: CODECS[g.codecIdx].value, complexityLabel: COMPLEXITIES[g.complexityIdx].label },
      vsr: Number(fmt(vsrLoad(g.cameras, RESOLUTIONS[g.resolutionIdx]))),
      computed: {
        frameKb: Number(fmt(computed.frameKb)),
        bitrateMbps: Number(fmt(computed.bitrateMbps)),
        bandwidthMbps: Number(fmt(computed.bandwidthMbps)),
        rawStorageGb: Number(fmt(computed.rawStorageGb)),
        storageGb: Number(fmt(computed.storageGb)),
      },
    };
  });

  const totals = groups.reduce(
    (acc, g) => {
      acc.cameras += g.input.cameras;
      acc.bandwidthMbps += g.computed.bandwidthMbps;
      acc.rawStorageGb += g.computed.rawStorageGb;
      acc.storageGb += g.computed.storageGb;
      acc.vsr += g.vsr;
      return acc;
    },
    { cameras: 0, bandwidthMbps: 0, rawStorageGb: 0, storageGb: 0, vsr: 0 },
  );

  const rec = recommend(
    { totalCameras: totals.cameras, totalStorageGb: totals.storageGb, totalVsr: totals.vsr },
    POOL,
  );

  return (
    JSON.stringify(
      {
        note:
          "Five-scene / 300-camera mixed project — canonical audit fixture. " +
          `Retention ${FIXTURE_RETENTION_DAYS} days. Recommendation sized against the frozen 2026-08-12 pool.`,
        retentionDays: FIXTURE_RETENTION_DAYS,
        groups,
        totals: {
          cameras: totals.cameras,
          vsr: Number(fmt(totals.vsr)),
          bandwidthMbps: Number(fmt(totals.bandwidthMbps)),
          rawStorageGb: Number(fmt(totals.rawStorageGb)),
          storageGb: Number(fmt(totals.storageGb)),
          storageTb: Number(fmt(totals.storageGb / 1000)),
        },
        recommendation: {
          winner: rec.winner,
          alternativesTop3: rec.alternatives.slice(0, 3),
          warnings: rec.warnings,
        },
      },
      null,
      2,
    ) + "\n"
  );
}

// ---------------------------------------------------------------------------

describe("golden-file regression harness (calculator math audit)", () => {
  const cases: ReadonlyArray<{ file: string; generate: () => string }> = [
    { file: "matrix.csv", generate: generateMatrixCsv },
    { file: "fixture-mixed-project.json", generate: generateFixtureJson },
  ];

  for (const { file, generate } of cases) {
    it(`${file} matches committed golden output`, () => {
      const golden = path.join(GOLDEN_DIR, file);
      const current = generate();
      if (UPDATE || !existsSync(golden)) {
        mkdirSync(GOLDEN_DIR, { recursive: true });
        writeFileSync(golden, current);
        return;
      }
      const committed = readFileSync(golden, "utf8");
      if (committed === current) return;

      // Readable failure: show how many lines drifted and the first few.
      const a = committed.split("\n");
      const b = current.split("\n");
      const diffs: string[] = [];
      const max = Math.max(a.length, b.length);
      for (let i = 0; i < max && diffs.length < 5; i++) {
        if (a[i] !== b[i]) diffs.push(`  line ${i + 1}:\n    golden:  ${a[i]}\n    current: ${b[i]}`);
      }
      let count = 0;
      for (let i = 0; i < max; i++) if (a[i] !== b[i]) count++;
      assert.fail(
        `${file}: ${count} line(s) differ from golden output.\n` +
          `If this change is deliberate, regenerate with UPDATE_GOLDEN=1 npm test and commit the diff.\n` +
          diffs.join("\n"),
      );
    });
  }
});
