// One-off seed of ONE calculator submission: "Escambia Men's Prison" (Atmore,
// AL; Genetec Security Center), filed by Andy on behalf of Cornerstone
// Detention - HQ. Source: Escambia_VideoSurveillance_Seed_Document.md, Section 7
// (calculator rows) and Section 10 (open items). Section 9 (bid deviations) is
// bid-compliance context only and is deliberately not encoded here.
//
// WHY A SCRIPT. Same technique as the WCJ / Williamson / JCT scaffolds (JOURNAL
// 2026-07-22, 2026-08-17, 2026-09-01): build the row exactly the way
// submitCalculation() (src/app/(app)/calculator/actions.ts) builds it, using the
// REAL engine (computeGroup, mapPixelsToBucket, loadCandidateSpecs, recommend),
// never hand-copied formulas. What it skips on purpose: the PDF, both emails and
// the Pipedrive deal. Nothing here talks to Pipedrive. The row is a scaffold:
// Andy opens /calculator?revise=<id> to review it, and only his Save there
// creates the deal (as a revision of this row).
//
// MODES
//   (default)        dry-run. Reads camera_specs, partners, current_products,
//                    product_specs and submissions (SELECT only), prints every
//                    group, every count and the full row. Writes nothing.
//   --execute        same report, then refuses if an Escambia row already exists
//                    for this customer, then asks for a typed CONFIRM, then
//                    inserts exactly one public.submissions row.
//   --verify <id>    reads that row back, rehydrates it through the same
//                    fromStoredSubmission() the revise page uses, recomputes every
//                    group, and checks the counts and the submit-schema limits a
//                    Save from the form would have to pass.
//   --self-test      runs the --verify checks on the dry-run row in memory.
//                    Writes nothing.
//
// Run:
//   npx tsx --env-file=.env.local scripts/seed-escambia-submission.mts
//   npx tsx --env-file=.env.local scripts/seed-escambia-submission.mts --execute
//   npx tsx --env-file=.env.local scripts/seed-escambia-submission.mts --verify <id>
//   npx tsx --env-file=.env.local scripts/seed-escambia-submission.mts --self-test
//
// The `.mts` extension is load-bearing: tsx transforms plain `.ts` as CommonJS
// and rejects top-level await.
//
// DECISIONS (Andy, 2026-10-12, Phase 0 review):
//   - Project name "Escambia Men's Prison" (ASCII apostrophe, matching the seed
//     document, so name search and the Pipedrive title stay plain text).
//   - on_behalf_of_partner_id = Cornerstone Detention - HQ. The FK makes the row
//     visible to that partner's portal account as soon as it is inserted.
//   - Codec: H.265-20 is plain H.265 (`h265`). The engine has no compression-level
//     input.
//   - Complexity "Medium detail, low motion" (2.25) stands in for the spec's 65%
//     scene activity, which has no engine field. Confirmed by the sizing check
//     (18 x VX5-V800-864).
//   - Dual-rate motion profile (16 h at 15 fps + 8 h at 5 fps) is entered as ONE
//     motion-triggered group at 15 fps with motion 80%. The exact equivalent duty
//     under the sub-linear fps curve (ADR 0123) is 2/3 + 1/3 x effectiveFps(5)/15
//     = 0.7907; 80 rounds it up. Stream count and the 15 fps network peak stay
//     exact. ADR 0142's two-group workaround was rejected because it doubles the
//     displayed camera count and the bandwidth figure. See ADR 0147.
//   - Cell cameras: continuous 24 h at 15 fps. Q8752-E (both imagers) also
//     continuous 24 h at 15 fps per spec 2.06.E.6 and the 202-stream target.
//   - PNM-9085RQZ (discontinued on Hanwha's site) is quoted as its replacement,
//     PNM-9085RQZ1 (4 x 5MP), linked to that camera_specs row.
//   - XNV-C6083R, Q1800-LE and both Q8752-E rows have no camera_specs row (the
//     Q8752-E by design, ADR 0134); they are entered manually with the model and
//     the reason in the group name. Q8752-E thermal is sized at SVGA per the seed
//     (OPEN C stays open; Axis lists a 640x480 thermal sensor). See ADR 0148.
//   - Add-ons Failover Recorder and Management Server both on. They are booleans
//     that become a pinned Pipedrive note at Save; counts are quoted in Pipedrive.
//   - total_list_price_usd banked from the recommender, as on every submission.
//
// OPEN ITEMS. There is no notes column on submissions, so the per-row items
// (A, B, C, discontinued, manual entry, the VFR equivalence) are carried in the
// group names, which render in the calculator, on submission detail and in the
// PDF camera schedule. The project-level items are printed below and recorded in
// the JOURNAL; they are not stored on the row.

import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import { createClient } from "@supabase/supabase-js";
import { env } from "../src/lib/env";
import {
  CODECS,
  COMPLEXITIES,
  RESOLUTIONS,
  UTILIZATION_DEFAULT_PCT,
} from "../src/lib/calculator/tables";
import {
  CALC_VERSION,
  computeGroup,
  effectiveFps,
  retentionSummary,
  vsrLoad,
  type GroupComputed,
  type GroupInput,
} from "../src/lib/calculator/compute";
import { mapPixelsToBucket } from "../src/lib/calculator/camera-resolution";
import { INPUT_STATE_VERSION, fromStoredSubmission } from "../src/lib/calculator/rehydrate";
import { recommend } from "../src/lib/recommend/algorithm";
import { loadCandidateSpecs } from "../src/lib/recommend/candidates";
import { GB_PER_TB, type RecommendationResult } from "../src/lib/recommend/types";

// ---------------------------------------------------------------------------
// Project constants
// ---------------------------------------------------------------------------

const PROJECT_NAME = "Escambia Men's Prison";
const VMS = "Genetec";
// Andy Newbom (internal, admin). partner_id = creator, as submitCalculation sets
// it from auth.uid(); the service-role insert has to state it explicitly.
const CREATOR_PARTNER_ID = "c4120cf3-9249-46d4-8798-4f873ea8113a";
// Cornerstone Detention - HQ (contact Ken Fuller).
const CUSTOMER_PARTNER_ID = "dafa0dfe-00e1-4604-a2f9-2fbbc51fd16a";
const RETENTION_DAYS = 90;
const UTILIZATION_PCT = UTILIZATION_DEFAULT_PCT;
const CODEC_VALUE = "h265";
const COMPLEXITY_LABEL = "Medium detail, low motion";
const FPS = 15;
const VFR_MOTION_PCT = 80;
const ADD_ON_FAILOVER_RECORDER = true;
const ADD_ON_MANAGEMENT_SERVER = true;

const VFR_TAG = "16h@15fps+8h@5fps as 80%";
const CONT_TAG = "continuous 24h @15fps";

// Expected totals from the seed document (Sections 1, 6, 7, 10).
const EXPECT = {
  physicalCameras: 1548,
  streams: 2469,
  continuousStreams: 202,
  vfrStreams: 2267,
  multiImagerStreams: 1304,
};

// ---------------------------------------------------------------------------
// The 17 seed rows (seed document Section 7)
// ---------------------------------------------------------------------------

type Profile = "vfr" | "continuous";
type SeedRow = {
  row: number;
  name: string;
  // Installed cameras on this row (Section 7 "Cameras").
  physicalCameras: number;
  // Recorded streams per camera (Section 7 "Imagers").
  imagers: number;
  // Catalog-linked rows take sensor count and pixels from camera_specs, and the
  // script asserts they equal `seedResolution` / `imagers`. Manual rows use
  // `seedResolution` directly.
  source: { kind: "catalog"; vendor: "Hanwha" | "Axis"; model: string } | { kind: "manual" };
  seedResolution: readonly [number, number];
  profile: Profile;
  // The Q8752-E thermal imager is a second stream from the same 9 cameras as the
  // visible row, so it adds streams but no physical cameras.
  sharesCamerasWithRow?: number;
};

const SEED_ROWS: readonly SeedRow[] = [
  { row: 1, name: `XNV-C6083R | manual 1080p, not in camera DB | ${VFR_TAG}`, physicalCameras: 524, imagers: 1, source: { kind: "manual" }, seedResolution: [1920, 1080], profile: "vfr" },
  { row: 2, name: `XNV-C8083R | ${VFR_TAG}`, physicalCameras: 147, imagers: 1, source: { kind: "catalog", vendor: "Hanwha", model: "XNV-C8083R" }, seedResolution: [3328, 1872], profile: "vfr" },
  { row: 3, name: `XNV-C9083R | ${VFR_TAG}`, physicalCameras: 128, imagers: 1, source: { kind: "catalog", vendor: "Hanwha", model: "XNV-C9083R" }, seedResolution: [3840, 2160], profile: "vfr" },
  { row: 4, name: `PNM-C7083RVD | ${VFR_TAG}`, physicalCameras: 85, imagers: 2, source: { kind: "catalog", vendor: "Hanwha", model: "PNM-C7083RVD" }, seedResolution: [1920, 1080], profile: "vfr" },
  { row: 5, name: `PNM-7082RVD | OPEN A: quote sheet only, not in spec | ${VFR_TAG}`, physicalCameras: 4, imagers: 2, source: { kind: "catalog", vendor: "Hanwha", model: "PNM-7082RVD" }, seedResolution: [1920, 1080], profile: "vfr" },
  { row: 6, name: `PNM-C12083RVD | ${VFR_TAG}`, physicalCameras: 16, imagers: 2, source: { kind: "catalog", vendor: "Hanwha", model: "PNM-C12083RVD" }, seedResolution: [3328, 1872], profile: "vfr" },
  { row: 7, name: `PNM-C16083RVQ | ${VFR_TAG}`, physicalCameras: 29, imagers: 4, source: { kind: "catalog", vendor: "Hanwha", model: "PNM-C16083RVQ" }, seedResolution: [2592, 1520], profile: "vfr" },
  { row: 8, name: `PNM-9085RQZ1 | replaces discontinued PNM-9085RQZ | ${VFR_TAG}`, physicalCameras: 240, imagers: 4, source: { kind: "catalog", vendor: "Hanwha", model: "PNM-9085RQZ1" }, seedResolution: [2560, 1920], profile: "vfr" },
  { row: 9, name: `XNF-8010RV | OPEN B: spec says 6MP, native 2048x2048 | ${VFR_TAG}`, physicalCameras: 25, imagers: 1, source: { kind: "catalog", vendor: "Hanwha", model: "XNF-8010RV" }, seedResolution: [2048, 2048], profile: "vfr" },
  { row: 10, name: `XNF-9010RV | OPEN B: spec says 12MP, native 3008x3008 | ${VFR_TAG}`, physicalCameras: 1, imagers: 1, source: { kind: "catalog", vendor: "Hanwha", model: "XNF-9010RV" }, seedResolution: [3008, 3008], profile: "vfr" },
  { row: 11, name: `TNV-C7013RC non-cell | ${VFR_TAG}`, physicalCameras: 145, imagers: 1, source: { kind: "catalog", vendor: "Hanwha", model: "TNV-C7013RC" }, seedResolution: [2048, 1536], profile: "vfr" },
  { row: 12, name: `TNV-C7013RC CELL | ${CONT_TAG}`, physicalCameras: 137, imagers: 1, source: { kind: "catalog", vendor: "Hanwha", model: "TNV-C7013RC" }, seedResolution: [2048, 1536], profile: "continuous" },
  { row: 13, name: `TNV-8011C non-cell | ${VFR_TAG}`, physicalCameras: 10, imagers: 1, source: { kind: "catalog", vendor: "Hanwha", model: "TNV-8011C" }, seedResolution: [2592, 1944], profile: "vfr" },
  { row: 14, name: `TNV-8011C CELL | ${CONT_TAG}`, physicalCameras: 47, imagers: 1, source: { kind: "catalog", vendor: "Hanwha", model: "TNV-8011C" }, seedResolution: [2592, 1944], profile: "continuous" },
  { row: 15, name: `Q8752-E visible | manual 1080p, discontinued (Mk II) | ${CONT_TAG}`, physicalCameras: 9, imagers: 1, source: { kind: "manual" }, seedResolution: [1920, 1080], profile: "continuous" },
  { row: 16, name: `Q8752-E thermal | OPEN C: SVGA assumed, sensor 640x480 | ${CONT_TAG}`, physicalCameras: 9, imagers: 1, source: { kind: "manual" }, seedResolution: [800, 600], profile: "continuous", sharesCamerasWithRow: 15 },
  { row: 17, name: `Q1800-LE LPR | manual 1080p, not in camera DB | ${VFR_TAG}`, physicalCameras: 1, imagers: 1, source: { kind: "manual" }, seedResolution: [1920, 1080], profile: "vfr" },
];

// Section 10 items that are project-wide, so no group name can carry them.
const PROJECT_OPEN_ITEMS: readonly string[] = [
  "D  No building / IDF / location grouping on the quote sheet; archiver grouping and failover pairing may need a split from the drawings.",
  "E  Genetec license basis for multi-imager cameras (per imager or per camera): 1,304 of 2,469 streams.",
  "F  Minimum Directory server count, and whether Directory failover needs its own license tier.",
  "G  Elmore baseline design documents (carry-over requirements unknown).",
  "H  Workstation, monitor, spot monitor, switch and RSA / NLEF license quantities (from drawings, not on the quantity sheet).",
  "I  Cluster file system change order could change the recording architecture and cost.",
  "Seed  PNM-9085RQZ is discontinued; quoted as PNM-9085RQZ1 (Andy, 2026-10-12). Confirm with Cornerstone / the engineer.",
  "Seed  AXIS Q8752-E is discontinued (Axis: replaced by Q8752-E Mk II). Sized from the seed document's 2MP + SVGA.",
  "Seed  Engine complexity 'Medium detail, low motion' stands in for spec 2.06.E.4's 65% scene activity; Genetec's own calculator will size differently.",
];

// Quote items the calculator cannot size; they belong on the Pipedrive quote.
function outOfScopeQuoteItems(primaryRecorders: number): string[] {
  return [
    `Failover archivers: ceil(${primaryRecorders}/2) = ${Math.ceil(primaryRecorders / 2)} (2.04.A.2), automatic.`,
    "Dedicated Security Center Directory servers: 1 primary + 1 failover minimum (2.04.A.4; OPEN F).",
    "Evidence Archive Server: 250 TB minimum, plus a 1:1 failover of the same size (2.08).",
    "Redundant 10/25GbE per recorder (2.04.A.6): V800 ships 4 x 10GbE RJ45; 2 x 10Gb SFP+ or 2 x 25Gb SFP28 is an option.",
    "5-year NBD hardware warranty with keep-your-drive (2.04.A.5).",
    "Spare cameras: 5% minimum, at least 2 per model, about 85 preliminary (3.07). Not recorded streams.",
  ];
}

// ---------------------------------------------------------------------------
// Submit-schema limits (mirrors groupSchema / submissionSchema in
// src/app/(app)/calculator/actions.ts, which is not importable from a script:
// the schema is a module-private const in a "use server" file)
// ---------------------------------------------------------------------------

type GroupPayload = {
  name: string;
  cameras: number;
  resolutionIdx: number;
  codecIdx: number;
  complexityIdx: number;
  fps: number;
  recordingMode: "constant" | "motion";
  recordingPercent: number;
  motionPercent: number;
  retentionDays: number;
  cameraVendor: string | null;
  cameraModel: string | null;
  units: number;
  sensorsPerCamera: number;
  cameraModelModified: boolean;
};

function isIntIn(n: unknown, min: number, max: number): boolean {
  return typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;
}

function submitSchemaProblems(projectName: string, groups: readonly GroupPayload[]): string[] {
  const p: string[] = [];
  if (projectName.trim().length > 50) p.push(`projectName is ${projectName.trim().length} chars (max 50)`);
  if (groups.length < 1 || groups.length > 50) p.push(`${groups.length} groups (allowed 1-50)`);
  groups.forEach((g, i) => {
    const at = `group ${i + 1}`;
    if (g.name.trim().length > 80) p.push(`${at}: name is ${g.name.trim().length} chars (max 80)`);
    if (!isIntIn(g.cameras, 1, 9999)) p.push(`${at}: cameras ${g.cameras}`);
    if (!isIntIn(g.resolutionIdx, 0, RESOLUTIONS.length - 1)) p.push(`${at}: resolutionIdx ${g.resolutionIdx}`);
    if (!isIntIn(g.codecIdx, 0, CODECS.length - 1)) p.push(`${at}: codecIdx ${g.codecIdx}`);
    if (!isIntIn(g.complexityIdx, 0, COMPLEXITIES.length - 1)) p.push(`${at}: complexityIdx ${g.complexityIdx}`);
    if (!isIntIn(g.fps, 1, 60)) p.push(`${at}: fps ${g.fps}`);
    if (g.recordingMode !== "constant" && g.recordingMode !== "motion") p.push(`${at}: recordingMode ${g.recordingMode}`);
    if (!isIntIn(g.recordingPercent, 1, 100)) p.push(`${at}: recordingPercent ${g.recordingPercent}`);
    if (!isIntIn(g.motionPercent, 20, 100)) p.push(`${at}: motionPercent ${g.motionPercent}`);
    if (!isIntIn(g.retentionDays, 1, 730)) p.push(`${at}: retentionDays ${g.retentionDays}`);
    if (!isIntIn(g.units, 1, 9999)) p.push(`${at}: units ${g.units}`);
    if (!isIntIn(g.sensorsPerCamera, 1, 64)) p.push(`${at}: sensorsPerCamera ${g.sensorsPerCamera}`);
    if (g.cameraModel !== null && g.cameraModel.trim().length > 120) p.push(`${at}: cameraModel too long`);
    if (g.cameraVendor !== null && g.cameraVendor.trim().length > 20) p.push(`${at}: cameraVendor too long`);
  });
  return p;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fail(msg: string): never {
  console.error(`\nABORT: ${msg}`);
  process.exit(1);
}

const fmt = (n: number, d = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

function resolutionIdxForPixels(width: number, height: number): number {
  // Same lookup as the calculator form's resolutionIdxForPixels (ADR 0058).
  const match = mapPixelsToBucket(width, height);
  if (!match) fail(`${width}x${height} exceeds the largest RESOLUTIONS bucket`);
  const idx = RESOLUTIONS.findIndex((r) => r.label === match.bucket.label);
  if (idx < 0) fail(`bucket ${match.bucket.label} not found in RESOLUTIONS`);
  return idx;
}

function engineInput(g: GroupPayload): GroupInput {
  return {
    cameras: g.cameras,
    resolution: RESOLUTIONS[g.resolutionIdx],
    codec: CODECS[g.codecIdx],
    complexity: COMPLEXITIES[g.complexityIdx],
    fps: g.fps,
    retentionDays: g.retentionDays,
    recordingMode: g.recordingMode,
    recordingPercent: g.recordingPercent,
    motionPercent: g.motionPercent,
  };
}

async function promptConfirm(): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout });
    rl.question(
      "\nReview the row above. Type CONFIRM to insert it into PRODUCTION, or anything else to exit: ",
      (answer) => {
        rl.close();
        resolve(answer.trim() === "CONFIRM");
      },
    );
  });
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const codecIdx = CODECS.findIndex((c) => c.value === CODEC_VALUE);
const complexityIdx = COMPLEXITIES.findIndex((c) => c.label === COMPLEXITY_LABEL);
if (codecIdx < 0) fail(`codec ${CODEC_VALUE} not in CODECS`);
if (complexityIdx < 0) fail(`complexity "${COMPLEXITY_LABEL}" not in COMPLEXITIES`);

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

type Built = {
  seed: SeedRow;
  payload: GroupPayload;
  computed: GroupComputed;
  catalogNote: string;
};

async function buildGroups(): Promise<Built[]> {
  const catalogModels = [
    ...new Set(
      SEED_ROWS.flatMap((r) => (r.source.kind === "catalog" ? [r.source.model] : [])),
    ),
  ];
  const { data: specs, error } = await supabase
    .from("camera_specs")
    .select("vendor, model, sensor_count, max_width, max_height, currently_shipping")
    .in("model", catalogModels);
  if (error) fail(`camera_specs read failed: ${error.message}`);

  const built: Built[] = [];
  for (const seed of SEED_ROWS) {
    let width = seed.seedResolution[0];
    let height = seed.seedResolution[1];
    let sensors = seed.imagers;
    let vendor: string | null = null;
    let model: string | null = null;
    let catalogNote = "manual (no camera_specs link)";

    if (seed.source.kind === "catalog") {
      const src = seed.source;
      const hit = (specs ?? []).filter((s) => s.vendor === src.vendor && s.model === src.model);
      if (hit.length !== 1) fail(`row ${seed.row}: expected 1 camera_specs row for ${src.vendor} ${src.model}, found ${hit.length}`);
      const s = hit[0];
      if (s.sensor_count !== seed.imagers) fail(`row ${seed.row}: DB sensor_count ${s.sensor_count} != seed imagers ${seed.imagers}`);
      if (s.max_width !== width || s.max_height !== height) {
        fail(`row ${seed.row}: DB ${s.max_width}x${s.max_height} != seed ${width}x${height}`);
      }
      width = s.max_width;
      height = s.max_height;
      sensors = s.sensor_count;
      vendor = s.vendor;
      model = s.model;
      catalogNote = `camera_specs ${s.vendor} ${s.model} (${s.sensor_count} x ${s.max_width}x${s.max_height}${s.currently_shipping ? "" : ", NOT shipping"})`;
    }

    const continuous = seed.profile === "continuous";
    const payload: GroupPayload = {
      name: seed.name,
      cameras: seed.physicalCameras * sensors,
      resolutionIdx: resolutionIdxForPixels(width, height),
      codecIdx,
      complexityIdx,
      fps: FPS,
      recordingMode: continuous ? "constant" : "motion",
      recordingPercent: 100,
      // submitCalculation pins motion% to 100 under Continuous; mirror it.
      motionPercent: continuous ? 100 : VFR_MOTION_PCT,
      retentionDays: RETENTION_DAYS,
      cameraVendor: vendor,
      cameraModel: model,
      // On the model-loaded path the form keeps cameras = units x sensors. Manual
      // rows carry units = installed cameras too (sensors 1): nothing renders it
      // there, and it keeps a later model attach in the form from collapsing the
      // count to 1 x sensors.
      units: seed.physicalCameras,
      sensorsPerCamera: sensors,
      cameraModelModified: false,
    };
    built.push({ seed, payload, computed: computeGroup(engineInput(payload), UTILIZATION_PCT), catalogNote });
  }
  return built;
}

function counts(groups: readonly { payload: GroupPayload; seed?: SeedRow }[]) {
  let streams = 0, continuousStreams = 0, vfrStreams = 0, multiImagerStreams = 0, physical = 0;
  for (const { payload, seed } of groups) {
    streams += payload.cameras;
    if (payload.recordingMode === "constant") continuousStreams += payload.cameras;
    else vfrStreams += payload.cameras;
    if (payload.sensorsPerCamera > 1) multiImagerStreams += payload.cameras;
    if (!seed?.sharesCamerasWithRow) physical += payload.units;
  }
  // The two Q8752-E rows are one 2-imager camera split by resolution.
  const q8752 = groups.filter((g) => g.payload.name.startsWith("Q8752-E"));
  if (q8752.length === 2) multiImagerStreams += q8752.reduce((s, g) => s + g.payload.cameras, 0);
  return { streams, continuousStreams, vfrStreams, multiImagerStreams, physical };
}

async function buildRow(built: Built[]) {
  const pool = await loadCandidateSpecs(supabase);
  if (pool.status !== "ok") fail(`candidate pool: ${pool.status}`);

  const totals = built.reduce(
    (a, b) => ({
      cameras: a.cameras + b.payload.cameras,
      bandwidthMbps: a.bandwidthMbps + b.computed.bandwidthMbps,
      recordedStorageGb: a.recordedStorageGb + b.computed.recordedStorageGb,
      storageGb: a.storageGb + b.computed.storageGb,
    }),
    { cameras: 0, bandwidthMbps: 0, recordedStorageGb: 0, storageGb: 0 },
  );
  const retention = retentionSummary(built.map((b) => b.payload.retentionDays));
  const totalVsr = built.reduce(
    (s, b) => s + vsrLoad(b.payload.cameras, RESOLUTIONS[b.payload.resolutionIdx]),
    0,
  );
  const recommendation: RecommendationResult = recommend(
    { totalCameras: totals.cameras, totalStorageGb: totals.storageGb, totalVsr },
    pool.specs,
  );
  // Primary group = the one with the most cameras, exactly as submitCalculation picks it.
  const primary = [...built].sort((a, b) => b.payload.cameras - a.payload.cameras)[0];

  const groups = built.map((b) => b.payload);
  const row = {
    partner_id: CREATOR_PARTNER_ID,
    input_state: {
      version: INPUT_STATE_VERSION,
      projectName: PROJECT_NAME,
      vms: VMS,
      retentionDays: RETENTION_DAYS,
      utilizationPct: UTILIZATION_PCT,
      groups,
      addOnFailoverRecorder: ADD_ON_FAILOVER_RECORDER,
      addOnManagementServer: ADD_ON_MANAGEMENT_SERVER,
    },
    calc_version: CALC_VERSION,
    max_disk_utilization_pct: UTILIZATION_PCT,
    status: "open",
    parent_submission_id: null,
    on_behalf_of_partner_id: CUSTOMER_PARTNER_ID,
    on_behalf_of_company_name: null,
    project_name: PROJECT_NAME,
    cameras_count: totals.cameras,
    resolution_code: RESOLUTIONS[primary.payload.resolutionIdx].label,
    codec: CODECS[primary.payload.codecIdx].value,
    complexity: COMPLEXITIES[primary.payload.complexityIdx].tier,
    vms: VMS,
    retention_days: retention.max,
    bandwidth_mbps: Number(totals.bandwidthMbps.toFixed(2)),
    storage_tb: Number((totals.storageGb / GB_PER_TB).toFixed(2)),
    recorded_storage_tb: Number((totals.recordedStorageGb / GB_PER_TB).toFixed(2)),
    recommended_product_id: recommendation.winner.sku,
    recommended_units: recommendation.winner.units,
    total_list_price_usd: Number(recommendation.winner.totalCostUsd.toFixed(2)),
    groups_payload: {
      retentionDays: RETENTION_DAYS,
      utilizationPct: UTILIZATION_PCT,
      calcVersion: CALC_VERSION,
      groups: built.map((b) => ({
        name: b.payload.name,
        cameras: b.payload.cameras,
        resolutionIdx: b.payload.resolutionIdx,
        resolutionLabel: RESOLUTIONS[b.payload.resolutionIdx].label,
        codec: CODECS[b.payload.codecIdx].value,
        complexity: COMPLEXITIES[b.payload.complexityIdx].tier,
        complexityLabel: COMPLEXITIES[b.payload.complexityIdx].label,
        fps: b.payload.fps,
        retentionDays: b.payload.retentionDays,
        recordingMode: b.payload.recordingMode,
        recordingPercent: b.payload.recordingPercent,
        motionPercent: b.payload.motionPercent,
        cameraVendor: b.payload.cameraVendor,
        cameraModel: b.payload.cameraModel,
        units: b.payload.units,
        sensorsPerCamera: b.payload.sensorsPerCamera,
        cameraModelModified: b.payload.cameraModelModified,
        computed: b.computed,
      })),
    },
  };
  return { row, totals, totalVsr, recommendation };
}

// ---------------------------------------------------------------------------
// Pre-flight reads (SELECT only)
// ---------------------------------------------------------------------------

async function preflight() {
  const { data: people, error } = await supabase
    .from("partners")
    .select("id, company_name, contact_name, status, is_internal")
    .in("id", [CREATOR_PARTNER_ID, CUSTOMER_PARTNER_ID]);
  if (error) fail(`partners read failed: ${error.message}`);
  const creator = people?.find((p) => p.id === CREATOR_PARTNER_ID);
  const customer = people?.find((p) => p.id === CUSTOMER_PARTNER_ID);
  // The same eligibility submitCalculation enforces for an on-behalf target.
  if (!creator || creator.status !== "active" || !creator.is_internal) fail("creator is not an active internal partner");
  if (!customer || customer.status !== "active" || customer.is_internal) fail("customer is not an active external partner");

  const { data: existing, error: dupError } = await supabase
    .from("submissions")
    .select("id, project_name, created_at, status")
    .eq("on_behalf_of_partner_id", CUSTOMER_PARTNER_ID)
    .ilike("project_name", "%escambia%");
  if (dupError) fail(`submissions read failed: ${dupError.message}`);
  return { creator, customer, existing: existing ?? [] };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function printReport(
  pre: Awaited<ReturnType<typeof preflight>>,
  built: Built[],
  r: Awaited<ReturnType<typeof buildRow>>,
) {
  const exactDuty = 2 / 3 + (1 / 3) * (effectiveFps(5) / 15);
  console.log("=".repeat(100));
  console.log(`ESCAMBIA SEED: ${PROJECT_NAME}   (dry-run report)`);
  console.log("=".repeat(100));
  console.log(`Creator   : ${pre.creator.contact_name} / ${pre.creator.company_name} (${CREATOR_PARTNER_ID})`);
  console.log(`Customer  : ${pre.customer.company_name}, contact ${pre.customer.contact_name} (${CUSTOMER_PARTNER_ID})`);
  console.log(`Project   : "${PROJECT_NAME}" (${PROJECT_NAME.length} chars) | VMS ${VMS} | retention ${RETENTION_DAYS} d | utilization ${UTILIZATION_PCT}%`);
  console.log(`Codec     : ${CODECS[codecIdx].label} (${CODEC_VALUE}) | complexity "${COMPLEXITY_LABEL}" (x${COMPLEXITIES[complexityIdx].multiplier})`);
  console.log(`VFR rows  : motion-triggered @ ${FPS} fps, motion ${VFR_MOTION_PCT}% (exact equivalent duty ${(exactDuty * 100).toFixed(2)}%)`);
  console.log(`Add-ons   : Failover Recorder ${ADD_ON_FAILOVER_RECORDER ? "Yes" : "No"} | Management Server ${ADD_ON_MANAGEMENT_SERVER ? "Yes" : "No"}`);
  console.log(`Existing Escambia rows for this customer: ${pre.existing.length === 0 ? "none" : pre.existing.map((e) => `${e.id} "${e.project_name}"`).join(", ")}`);

  console.log("\nGROUPS (17 seed rows -> 17 calculator groups)");
  console.log("-".repeat(100));
  for (const b of built) {
    const p = b.payload;
    const c = b.computed;
    console.log(`#${String(b.seed.row).padStart(2)} ${p.name}   [name ${p.name.length}/80]`);
    console.log(
      `    source ${b.catalogNote}\n` +
        `    ${p.units} cam x ${p.sensorsPerCamera} imager = ${p.cameras} streams | ${RESOLUTIONS[p.resolutionIdx].label} | ` +
        `${p.recordingMode === "constant" ? "Continuous" : `Motion ${p.motionPercent}%`} @ ${p.fps} fps, ${Math.round((p.recordingPercent / 100) * 24)} h/day | ${p.retentionDays} d`,
    );
    console.log(
      `    per stream ${fmt(c.bitrateMbps, 3)} Mbit/s | group peak ${fmt(c.bandwidthMbps)} Mbit/s | ` +
        `recorded ${fmt(c.recordedStorageGb / GB_PER_TB)} TB | required ${fmt(c.storageGb / GB_PER_TB)} TB`,
    );
  }

  const k = counts(built);
  const check = (label: string, got: number, want: number) =>
    console.log(`  ${got === want ? "OK  " : "FAIL"} ${label.padEnd(34)} ${String(got).padStart(5)}  (expected ${want})`);
  console.log("\nCOUNTS");
  console.log("-".repeat(100));
  check("Physical cameras", k.physical, EXPECT.physicalCameras);
  check("Recorded streams (cameras_count)", k.streams, EXPECT.streams);
  check("Continuous 24h @15 streams", k.continuousStreams, EXPECT.continuousStreams);
  check("VFR (motion 80%) streams", k.vfrStreams, EXPECT.vfrStreams);
  check("Multi-imager streams", k.multiImagerStreams, EXPECT.multiImagerStreams);
  console.log(`  Groups: ${built.length} of 50 allowed`);

  const w = r.recommendation.winner;
  console.log("\nTOTALS AND RECOMMENDATION (real engine + live candidate pool)");
  console.log("-".repeat(100));
  console.log(`  Peak bandwidth      ${fmt(r.totals.bandwidthMbps)} Mbit/s`);
  console.log(`  Recorded data       ${fmt(r.totals.recordedStorageGb / GB_PER_TB)} TB`);
  console.log(`  Required capacity   ${fmt(r.totals.storageGb / GB_PER_TB)} TB  (at ${UTILIZATION_PCT}% max disk utilization)`);
  console.log(`  VSR load            ${fmt(r.totalVsr, 1)}`);
  console.log(`  Recommended         ${w.units} x ${w.sku} (${w.productName}), covers ${fmt(w.coveredStorageTb, 1)} TB usable, driven by ${w.driverDimension}`);
  console.log(`  Alternatives        ${r.recommendation.alternatives.map((a) => `${a.units} x ${a.sku}`).join(" | ") || "none"}`);
  for (const warn of r.recommendation.warnings) console.log(`  Warning             ${warn}`);

  console.log("\nQUOTE ITEMS OUTSIDE CALCULATOR SCOPE (for the Pipedrive quote)");
  console.log("-".repeat(100));
  for (const line of outOfScopeQuoteItems(w.units)) console.log(`  - ${line}`);

  console.log("\nPROJECT-LEVEL OPEN ITEMS (not stored on the row; recorded in the JOURNAL)");
  console.log("-".repeat(100));
  for (const line of PROJECT_OPEN_ITEMS) console.log(`  - ${line}`);

  const problems = submitSchemaProblems(PROJECT_NAME, built.map((b) => b.payload));
  console.log(`\nSubmit-schema limits: ${problems.length === 0 ? "all pass" : problems.join("; ")}`);

  console.log("\nTHE ONE ROW THAT WOULD BE INSERTED INTO public.submissions");
  console.log("-".repeat(100));
  console.log(JSON.stringify(r.row, null, 2));

  const allCountsOk =
    k.physical === EXPECT.physicalCameras &&
    k.streams === EXPECT.streams &&
    k.continuousStreams === EXPECT.continuousStreams &&
    k.vfrStreams === EXPECT.vfrStreams &&
    k.multiImagerStreams === EXPECT.multiImagerStreams;
  return { problems, allCountsOk };
}

// ---------------------------------------------------------------------------
// Verify (Phase 2 read-back)
// ---------------------------------------------------------------------------

async function verify(id: string) {
  const { data: row, error } = await supabase.from("submissions").select("*").eq("id", id).single();
  if (error || !row) fail(`could not read submission ${id}: ${error?.message}`);
  await verifyRow(id, row);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function verifyRow(id: string, row: any) {
  const results: [string, boolean, string][] = [];
  const ok = (label: string, pass: boolean, detail = "") => results.push([label, pass, detail]);

  ok("project_name", row.project_name === PROJECT_NAME, row.project_name);
  ok("partner_id = creator", row.partner_id === CREATOR_PARTNER_ID);
  ok("on_behalf_of_partner_id = customer", row.on_behalf_of_partner_id === CUSTOMER_PARTNER_ID);
  ok("calc_version", row.calc_version === CALC_VERSION, String(row.calc_version));
  ok("status open", row.status === "open", row.status);
  ok("no Pipedrive deal", row.pipedrive_deal_id === null, String(row.pipedrive_deal_id));
  ok("no email sent", row.email_sent_at === null, String(row.email_sent_at));

  // Rehydrate exactly as /calculator?revise=<id> does.
  const state = fromStoredSubmission({ input_state: row.input_state, groups_payload: row.groups_payload });
  const banked = (row.groups_payload?.groups ?? []) as (GroupPayload & { computed: GroupComputed })[];
  ok("17 groups banked and rehydrated", banked.length === 17 && state.groups.length === 17, `${banked.length}/${state.groups.length}`);
  ok("rehydrated projectName", state.projectName === PROJECT_NAME, state.projectName);
  ok("rehydrated VMS", state.vms === VMS, state.vms);
  ok("rehydrated add-ons", state.addOnFailoverRecorder === ADD_ON_FAILOVER_RECORDER && state.addOnManagementServer === ADD_ON_MANAGEMENT_SERVER);

  const fields: (keyof GroupPayload)[] = [
    "name", "cameras", "resolutionIdx", "codecIdx", "complexityIdx", "fps", "recordingMode",
    "recordingPercent", "motionPercent", "retentionDays", "cameraVendor", "cameraModel",
    "units", "sensorsPerCamera", "cameraModelModified",
  ];
  const sum = { bw: 0, rec: 0, sto: 0 };
  let drift = 0;
  let maxRelErr = 0;
  // The input copy carries every form field (indexes included); groups_payload
  // carries the resolved labels the revise page prefers. Both must land on the
  // same form state.
  const inputs = (row.input_state?.groups ?? []) as GroupPayload[];
  ok("17 input groups banked", inputs.length === 17, String(inputs.length));
  state.groups.forEach((g, i) => {
    const b = banked[i];
    const rehydrated = g as unknown as GroupPayload;
    for (const f of fields) {
      if (rehydrated[f] !== inputs[i]?.[f]) {
        drift++;
        console.log(`  drift group ${i + 1} ${f}: banked ${JSON.stringify(inputs[i]?.[f])} rehydrated ${JSON.stringify(rehydrated[f])}`);
      }
    }
    const labels = b as unknown as { resolutionLabel: string; codec: string; complexityLabel: string };
    if (
      RESOLUTIONS[rehydrated.resolutionIdx].label !== labels.resolutionLabel ||
      CODECS[rehydrated.codecIdx].value !== labels.codec ||
      COMPLEXITIES[rehydrated.complexityIdx].label !== labels.complexityLabel
    ) {
      drift++;
      console.log(`  drift group ${i + 1}: groups_payload labels do not resolve to the rehydrated indexes`);
    }
    // Recompute from the REHYDRATED state, the way a Save from the form would.
    const c = computeGroup(engineInput(g as unknown as GroupPayload), state.utilizationPct);
    for (const key of ["bandwidthMbps", "recordedStorageGb", "storageGb", "bitrateMbps", "frameKb"] as const) {
      const rel = Math.abs(c[key] - b.computed[key]) / Math.max(1e-12, Math.abs(b.computed[key]));
      maxRelErr = Math.max(maxRelErr, rel);
    }
    sum.bw += c.bandwidthMbps;
    sum.rec += c.recordedStorageGb;
    sum.sto += c.storageGb;
  });
  ok("rehydrated groups match banked inputs", drift === 0, `${drift} field drifts`);
  ok("recompute matches banked computed", maxRelErr < 1e-12, `max relative error ${maxRelErr.toExponential(2)}`);
  ok("bandwidth_mbps column", Number(sum.bw.toFixed(2)) === Number(row.bandwidth_mbps), String(row.bandwidth_mbps));
  ok("storage_tb column", Number((sum.sto / GB_PER_TB).toFixed(2)) === Number(row.storage_tb), String(row.storage_tb));
  ok("recorded_storage_tb column", Number((sum.rec / GB_PER_TB).toFixed(2)) === Number(row.recorded_storage_tb), String(row.recorded_storage_tb));

  const seedByName = new Map(SEED_ROWS.map((s) => [s.name, s]));
  const k = counts(banked.map((payload) => ({ payload, seed: seedByName.get(payload.name) })));
  ok("physical cameras 1,548", k.physical === EXPECT.physicalCameras, String(k.physical));
  ok("streams 2,469 (= cameras_count)", k.streams === EXPECT.streams && row.cameras_count === EXPECT.streams, `${k.streams} / ${row.cameras_count}`);
  ok("continuous streams 202", k.continuousStreams === EXPECT.continuousStreams, String(k.continuousStreams));
  ok("VFR streams 2,267", k.vfrStreams === EXPECT.vfrStreams, String(k.vfrStreams));
  ok("multi-imager streams 1,304", k.multiImagerStreams === EXPECT.multiImagerStreams, String(k.multiImagerStreams));

  const problems = submitSchemaProblems(state.projectName, state.groups as unknown as GroupPayload[]);
  ok("a Save from the revise form passes the submit-schema limits", problems.length === 0, problems.join("; "));

  // Re-run the recommender against today's pool. A difference is not a seed
  // fault (prices or catalog may have moved); it is reported, not failed.
  const pool = await loadCandidateSpecs(supabase);
  if (pool.status === "ok") {
    const totalVsr = state.groups.reduce((s, g) => s + vsrLoad(g.cameras, RESOLUTIONS[g.resolutionIdx]), 0);
    const now = recommend({ totalCameras: k.streams, totalStorageGb: sum.sto, totalVsr }, pool.specs);
    const same = now.winner.sku === row.recommended_product_id && now.winner.units === row.recommended_units;
    console.log(`  Recommender today: ${now.winner.units} x ${now.winner.sku} (banked ${row.recommended_units} x ${row.recommended_product_id})${same ? "" : "  <- differs"}`);
  }

  console.log(`\nVERIFY ${id}`);
  for (const [label, pass, detail] of results) {
    console.log(`  ${pass ? "OK  " : "FAIL"} ${label}${detail ? `  (${detail})` : ""}`);
  }
  const failed = results.filter(([, pass]) => !pass).length;
  console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) FAILED.`);
  process.exit(failed === 0 ? 0 : 1);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const verifyAt = args.indexOf("--verify");
if (verifyAt >= 0) {
  const id = args[verifyAt + 1];
  if (!id) fail("--verify needs a submission id");
  await verify(id);
} else if (args.includes("--self-test")) {
  // Runs the --verify checks against the row the dry-run would insert, held in
  // memory, so the read-back logic is proven before anything is written. The
  // two columns the DB defaults on insert are filled the way the insert leaves
  // them.
  const built = await buildGroups();
  const r = await buildRow(built);
  await verifyRow("(in-memory dry-run row)", { ...r.row, pipedrive_deal_id: null, email_sent_at: null });
} else {
  const execute = args.includes("--execute");
  const pre = await preflight();
  const built = await buildGroups();
  const r = await buildRow(built);
  const { problems, allCountsOk } = printReport(pre, built, r);

  if (!execute) {
    console.log("\nDRY-RUN: nothing was written. Re-run with --execute to insert.");
  } else {
    if (problems.length > 0) fail(`submit-schema limits failed: ${problems.join("; ")}`);
    if (!allCountsOk) fail("counts do not match the seed document");
    if (pre.existing.length > 0) fail("an Escambia submission already exists for this customer; refusing to insert a duplicate");
    if (!(await promptConfirm())) {
      console.log("Cancelled. Nothing was written.");
      process.exit(0);
    }
    const { data: inserted, error } = await supabase
      .from("submissions")
      .insert(r.row)
      .select("id")
      .single();
    if (error || !inserted) fail(`insert failed: ${error?.message}`);
    console.log(`\nInserted submission ${inserted.id}`);
    console.log(`  Review: https://portal.arxys.com/submissions/${inserted.id}`);
    console.log(`  Revise: https://portal.arxys.com/calculator?revise=${inserted.id}`);
    console.log(`  Verify: npx tsx --env-file=.env.local scripts/seed-escambia-submission.mts --verify ${inserted.id}`);
  }
}
