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
//   matrix.csv                    — full input matrix at 100 cameras/group
//   specs-pool.json               — frozen live SKU pool (captured 2026-08-12)
//   fixture-mixed-project.json    — the five-scene / 300-camera named fixture
//   fixture-mixed-retention.json  — the same five groups at REGULATED retentions
//                                   (ADR 0132), the only fixture that exercises
//                                   the per-group retention path
//
// See docs/audits/calculator-math-audit.md for what each number means.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { computeGroup, vsrLoad, type GroupInput } from "./compute";
import {
  CODECS,
  COMPLEXITIES,
  RESOLUTIONS,
  UTILIZATION_DEFAULT_PCT,
  type CodecValue,
} from "./tables";
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
// Matrix generation — every RESOLUTIONS entry × fps 5/10/12/15/20/30 × three
// codecs × all six complexity tiers × motion 0/25/50/75/100 × retention
// 7/30/60/90 days × recordingPercent 100 (continuous) and 50 (12 h/day).
// Cameras fixed at 100 per row so storage totals and unit counts are realistic.
// motion 0 is below the UI's 20% clamp — included deliberately to pin the
// no-idle-floor duty-cycle behavior (ADR 0125): it must bill zero storage while
// still reporting the full event-peak bandwidth.
//
// The `ret` sweep is now each row's own per-group retention (ADR 0132) rather
// than a submission-wide argument. Single-group rows cannot show a mixed-retention
// project, so that path is pinned by fixture-mixed-retention.json instead.
//
// The codec sweep is an EXPLICIT ordered list rather than an iteration over
// CODECS, for two reasons. First, it insulates the golden from a picker
// reordering. Second — and this is why the order is h265, h264, h265smart and
// not the picker's — it keeps slots 0 and 1 identical to the pre-Phase-A golden
// (h265, h264), so those rows diff as pure coefficient movement. Only slot 2
// changes identity, from the retired `smart` to the new `h265smart` (ADR 0124),
// and the `codec` column makes that visible on every line.
// ---------------------------------------------------------------------------
const FPS_STEPS = [5, 10, 12, 15, 20, 30] as const;
const GOLDEN_CODECS: readonly CodecValue[] = ["h265", "h264", "h265smart"];
const MOTION_STEPS = [0, 25, 50, 75, 100] as const;
const RETENTION_STEPS = [7, 30, 60, 90] as const;
const RECORDING_STEPS = [100, 50] as const;
const MATRIX_CAMERAS = 100;

function codecByValue(value: CodecValue) {
  const c = CODECS.find((x) => x.value === value);
  if (!c) throw new Error(`codec "${value}" missing from CODECS`);
  return c;
}

function generateMatrixCsv(): string {
  const repSpec = POOL.find((s) => s.sku === REPRESENTATIVE_SKU);
  if (!repSpec) throw new Error(`${REPRESENTATIVE_SKU} missing from frozen pool`);
  const lines: string[] = [
    `# calculator golden matrix — cameras=${MATRIX_CAMERAS} per row; units = recommended`,
    `# unit count for ${REPRESENTATIVE_SKU} alone (VSR floor 1.1; no storage floor —`,
    `# storageGb already carries the utilization buffer and the binary charge).`,
    `# storageGb = required decimal RAID-net at the ${UTILIZATION_DEFAULT_PCT}% default Max disk utilization.`,
    `# recordedStorageGb = modeled video over the row's retention, no buffer, no`,
    `# binary charge. The separate rawStorageGb column is gone: ADR 0131 removed the`,
    `# +5% audio/metadata term that was the only difference between the two.`,
    `# bitrateMbps / bandwidthMbps are DECIMAL and at the event peak (duty cycle 1.0).`,
    `# ret = the row's own per-group retention in days (ADR 0132).`,
    `# resIdx = index into RESOLUTIONS; cxIdx = index into COMPLEXITIES.`,
    "resIdx,fps,codec,cxIdx,motion,ret,rec,frameKb,bitrateMbps,bandwidthMbps,recordedStorageGb,storageGb,units",
  ];
  for (let resIdx = 0; resIdx < RESOLUTIONS.length; resIdx++) {
    const resolution = RESOLUTIONS[resIdx];
    const vsr = vsrLoad(MATRIX_CAMERAS, resolution);
    for (const fps of FPS_STEPS) {
      for (const codecValue of GOLDEN_CODECS) {
        const codec = codecByValue(codecValue);
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
                  retentionDays: ret,
                  recordingPercent: rec,
                  motionPercent: motion,
                };
                const c = computeGroup(gi);
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
                    fmt(c.recordedStorageGb),
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
// Named fixtures: "five-scene mixed project" — 300 cameras across five groups.
// Defined by the 2026-08 math audit as the canonical realistic deal, so
// coefficient changes can be read as TB and appliance count on a real quote
// rather than as abstract percentages. Rendered twice: once at a uniform 30-day
// retention (the canonical file, unchanged in shape since Phase 1) and once at
// five regulated per-group retentions (ADR 0132).
// ---------------------------------------------------------------------------
type FixtureGroup = {
  name: string;
  cameras: number;
  resolutionIdx: number;
  // Explicit codec VALUE, not an index. The pre-Phase-A fixture stored codecIdx,
  // which silently changed meaning the moment CODECS gained h265smart — exactly
  // the failure mode ADR 0124 exists to prevent. A value can only ever mean one
  // thing.
  codec: CodecValue;
  complexityIdx: number;
  fps: number;
  recordingMode: "constant" | "motion";
  recordingPercent: number;
  motionPercent: number;
};

export const FIXTURE_RETENTION_DAYS = 30;
export const FIXTURE_GROUPS: readonly FixtureGroup[] = [
  { name: "Perimeter & parking", cameras: 80, resolutionIdx: 14, codec: "h265", complexityIdx: 2, fps: 12, recordingMode: "constant", recordingPercent: 100, motionPercent: 100 },
  { name: "Lobby & entries", cameras: 60, resolutionIdx: 11, codec: "h265", complexityIdx: 1, fps: 15, recordingMode: "motion", recordingPercent: 100, motionPercent: 75 },
  // The smart-codec group. It was quoted on the retired H.264-Smart key, which
  // sized 20% ABOVE plain H.265; under ADR 0124 it becomes H.265+Smart, 20%
  // below. This single group is what the audit's §C3 fixture impact was measured
  // on, and it is where the largest movement in the golden diff lands.
  { name: "Warehouse floor", cameras: 90, resolutionIdx: 15, codec: "h265smart", complexityIdx: 3, fps: 15, recordingMode: "motion", recordingPercent: 100, motionPercent: 50 },
  { name: "Loading dock (12 h/day)", cameras: 40, resolutionIdx: 19, codec: "h264", complexityIdx: 4, fps: 10, recordingMode: "constant", recordingPercent: 50, motionPercent: 100 },
  { name: "Back offices", cameras: 30, resolutionIdx: 8, codec: "h265", complexityIdx: 0, fps: 15, recordingMode: "motion", recordingPercent: 100, motionPercent: 25 },
];

// Regulated per-group retentions for the mixed-retention fixture (ADR 0132),
// mapped onto the same five groups so the two fixtures differ in ONE dimension
// and the effect of per-group retention is readable by subtraction.
//
// The values are the regulated figures the ADR cites, read as ONE coherent deal —
// a gaming property — rather than five numbers scattered across the groups:
//
//   Perimeter & parking       15   Nevada gaming's 7→15 day statutory floor
//   Lobby & entries           90   PCI/PII, point-of-sale sightlines
//   Warehouse floor           30   back-of-house general policy
//   Loading dock               7   operational monitoring only, no regulated hold
//   Back offices             180   count room / records area, the longest hold
//
// This assignment is also the best-BALANCED of the plausible ones, which is what
// makes it useful as a regression fixture: the five groups take 19 / 29 / 34 / 16
// / 3 percent of project footage, so a fault in any one group's retention moves
// the total visibly. Putting the 180 on the loading dock instead — 4K at
// complexity 5, the heaviest group per camera-day — would have made that single
// group 83% of the file and left the other four unable to show a regression.
//
// Deliberately a SECOND fixture rather than retention added to the canonical one:
// changing FIXTURE_GROUPS would move the audit's reference deal for a reason
// unrelated to the coefficient changes landing alongside it, and the plan's whole
// sequencing rule is that a golden movement must stay attributable.
const FIXTURE_RETENTION_BY_GROUP: readonly number[] = [15, 90, 30, 7, 180];

function buildFixture(retentionFor: (index: number) => number) {
  const groups = FIXTURE_GROUPS.map((g, i) => {
    const retentionDays = retentionFor(i);
    const gi: GroupInput = {
      cameras: g.cameras,
      resolution: RESOLUTIONS[g.resolutionIdx],
      codec: codecByValue(g.codec),
      complexity: COMPLEXITIES[g.complexityIdx],
      fps: g.fps,
      retentionDays,
      recordingMode: g.recordingMode,
      recordingPercent: g.recordingPercent,
      motionPercent: g.motionPercent,
    };
    const computed = computeGroup(gi);
    return {
      input: {
        ...g,
        retentionDays,
        resolutionLabel: RESOLUTIONS[g.resolutionIdx].label,
        complexityLabel: COMPLEXITIES[g.complexityIdx].label,
      },
      vsr: Number(fmt(vsrLoad(g.cameras, RESOLUTIONS[g.resolutionIdx]))),
      computed: {
        frameKb: Number(fmt(computed.frameKb)),
        bitrateMbps: Number(fmt(computed.bitrateMbps)),
        bandwidthMbps: Number(fmt(computed.bandwidthMbps)),
        recordedStorageGb: Number(fmt(computed.recordedStorageGb)),
        storageGb: Number(fmt(computed.storageGb)),
      },
    };
  });

  const totals = groups.reduce(
    (acc, g) => {
      acc.cameras += g.input.cameras;
      acc.bandwidthMbps += g.computed.bandwidthMbps;
      acc.recordedStorageGb += g.computed.recordedStorageGb;
      acc.storageGb += g.computed.storageGb;
      acc.vsr += g.vsr;
      return acc;
    },
    { cameras: 0, bandwidthMbps: 0, recordedStorageGb: 0, storageGb: 0, vsr: 0 },
  );

  const rec = recommend(
    { totalCameras: totals.cameras, totalStorageGb: totals.storageGb, totalVsr: totals.vsr },
    POOL,
  );

  return { groups, totals, rec };
}

function serializeFixture(
  note: string,
  retention: { label: string; perGroup: readonly number[] | null },
  built: ReturnType<typeof buildFixture>,
): string {
  const { groups, totals, rec } = built;
  return (
    JSON.stringify(
      {
        note,
        retention: retention.label,
        retentionByGroup: retention.perGroup,
        utilizationPct: UTILIZATION_DEFAULT_PCT,
        groups,
        totals: {
          cameras: totals.cameras,
          vsr: Number(fmt(totals.vsr)),
          bandwidthMbps: Number(fmt(totals.bandwidthMbps)),
          recordedStorageGb: Number(fmt(totals.recordedStorageGb)),
          storageGb: Number(fmt(totals.storageGb)),
          storageTb: Number(fmt(totals.storageGb / 1000)),
          // The headline the plan tracks: required drive nameplate over modeled
          // video, before ceil/SKU granularity. ×1.499 pre-Phase-A → ×1.306 at
          // Phase A's 90% default → ×1.336 at the 88% default (ADR 0131). Since
          // ADR 0131 removed the audio term, modeled video and recorded data are
          // the same quantity, so this is exactly 1 / (util × 0.8931).
          multiplierOverRawVideo: Number(fmt(totals.storageGb / totals.recordedStorageGb)),
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

function generateFixtureJson(): string {
  return serializeFixture(
    "Five-scene / 300-camera mixed project — canonical audit fixture. " +
      `Uniform retention ${FIXTURE_RETENTION_DAYS} days. Recommendation sized against the frozen 2026-08-12 pool. ` +
      `storageGb is required decimal RAID-net at the ${UTILIZATION_DEFAULT_PCT}% default Max disk utilization; ` +
      "recordedStorageGb is the Milestone-comparable recorded-data figure; " +
      "bandwidth is the event peak (duty cycle 1.0).",
    { label: `${FIXTURE_RETENTION_DAYS} days (uniform)`, perGroup: null },
    buildFixture(() => FIXTURE_RETENTION_DAYS),
  );
}

// The same five groups at five DIFFERENT retentions — the only fixture that
// exercises per-group retention (ADR 0132). Under the old submission-wide model
// this project could only have been quoted at its longest requirement (180 days
// on every group), so the gap between this file's storageGb and that is the whole
// value of D9.
function generateMixedRetentionFixtureJson(): string {
  return serializeFixture(
    "Five-scene / 300-camera gaming-property deal at REGULATED per-group retentions " +
      `(ADR 0132): ${FIXTURE_RETENTION_BY_GROUP.join(" / ")} days, group order as listed. Same five ` +
      "groups as fixture-mixed-project.json, so the two differ in retention alone. The pre-D9 " +
      "model could only have quoted this project at its longest requirement on every group; each " +
      "group here is sized at its own, and the group storageGb figures sum exactly to the total " +
      "because the buffer and the binary charge are both scalar.",
    {
      label: `${Math.min(...FIXTURE_RETENTION_BY_GROUP)}–${Math.max(...FIXTURE_RETENTION_BY_GROUP)} days (per group)`,
      perGroup: FIXTURE_RETENTION_BY_GROUP,
    },
    buildFixture((i) => FIXTURE_RETENTION_BY_GROUP[i]),
  );
}

// ---------------------------------------------------------------------------

describe("golden-file regression harness (calculator math audit)", () => {
  const cases: ReadonlyArray<{ file: string; generate: () => string }> = [
    { file: "matrix.csv", generate: generateMatrixCsv },
    { file: "fixture-mixed-project.json", generate: generateFixtureJson },
    { file: "fixture-mixed-retention.json", generate: generateMixedRetentionFixtureJson },
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
