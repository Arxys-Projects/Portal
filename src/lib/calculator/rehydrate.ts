import {
  CODECS,
  COMPLEXITIES,
  RESOLUTIONS,
  VMS_OPTIONS,
} from "./tables";

// Phase 4 Step 3 — quote-revision rehydration.
//
// Reconstructs the calculator form's initial state from a stored submission so
// a partner can reopen a past quote, edit it, and save a revision. Two layers:
//
//   normalizeInputState() — coerces a raw `input_state` JSON blob into a fully
//     defaulted, range-clamped shape. Tolerates partial/old rows.
//   fromStoredSubmission() — builds the form's initial state, resolving each
//     group's resolution/codec/complexity index ROBUSTLY: it prefers the
//     resolved VALUES banked in `groups_payload` (label / codec value / tier)
//     so a row still rehydrates correctly even if the lookup-table ORDER has
//     shifted since the row was written, falling back to the raw stored index.

// Version stamp written into submissions.input_state by actions.ts. Bump when
// the stored shape changes in a way rehydration must branch on. v1 is the first
// stamped version and is the marker that the two add-on booleans (Phase 4
// Step 2) are present. Absent / 0 = a pre-stamp row where add-ons were never
// stored, so they default to false.
export const INPUT_STATE_VERSION = 1;

// Camera vendors offered by the model picker (Phase 10 Step 3). A loaded model
// always carries one of these; anything else coerces to null (no model loaded).
const CAMERA_VENDORS = ["Axis", "Hanwha", "Avigilon"] as const;

// New-group defaults — kept in sync with newGroup() in calculator-form.tsx.
const GROUP_DEFAULTS = {
  cameras: 1,
  resolutionIdx: 14, // 4MP (2560×1440)
  codecIdx: 0, // H.265
  complexityIdx: 2, // Medium detail, low motion (realistic typical scene)
  fps: 15,
  recordingMode: "constant" as const,
  recordingPercent: 100, // 24 h/day
  motionPercent: 100, // N/A under Constant; the safe default mode
  // Phase 10 Step 3 — camera-model picker. Pre-feature rows have none of these,
  // so they default to the no-model path: cameras stays the direct input, and
  // the group renders exactly as it did before the feature existed.
  cameraVendor: null as string | null,
  cameraModel: null as string | null,
  units: 1,
  sensorsPerCamera: 1,
  cameraModelModified: false,
} as const;

const RETENTION_DEFAULT = 30;

export type InitialGroup = {
  name: string;
  cameras: number;
  resolutionIdx: number;
  codecIdx: number;
  complexityIdx: number;
  fps: number;
  recordingMode: "constant" | "motion";
  recordingPercent: number;
  motionPercent: number;
  // Phase 10 Step 3 — null vendor/model = no model loaded (no-model path).
  cameraVendor: string | null;
  cameraModel: string | null;
  units: number;
  sensorsPerCamera: number;
  cameraModelModified: boolean;
};

export type CalculatorInitialState = {
  projectName: string;
  vms: string;
  retentionDays: number;
  addOnFailoverRecorder: boolean;
  addOnManagementServer: boolean;
  groups: InitialGroup[];
};

export type NormalizedInputState = CalculatorInitialState & { version: number };

export type StoredSubmissionRow = {
  input_state?: unknown;
  groups_payload?: unknown;
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function clampIdx(value: unknown, length: number, fallback: number): number {
  const safeFallback = Math.max(0, Math.min(length - 1, fallback));
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return safeFallback;
  return Math.max(0, Math.min(length - 1, Math.round(n)));
}

// An out-of-list VMS (renamed/retired option, or a legacy free-text value)
// collapses to the "— Select —" empty choice.
function coerceVms(value: unknown): string {
  return typeof value === "string" && (VMS_OPTIONS as readonly string[]).includes(value)
    ? value
    : "";
}

type RawGroup = Record<string, unknown>;

// Recording mode is the one genuinely new persisted field. Anything that isn't
// the literal "motion" (including absent on a pre-change row) reads as the safe
// "constant" default. Operation Hours and Motion/Event % round-trip via the
// existing recordingPercent / motionPercent fields.
function coerceRecordingMode(value: unknown): "constant" | "motion" {
  return value === "motion" ? "motion" : "constant";
}

// A loaded camera vendor is one of the fixed three or null. The model is any
// non-empty string or null. Either being null means "no model loaded", and the
// form renders the no-model (direct-cameras) path.
function coerceCameraVendor(value: unknown): string | null {
  return typeof value === "string" && (CAMERA_VENDORS as readonly string[]).includes(value)
    ? value
    : null;
}
function coerceCameraModel(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizeGroup(g: RawGroup, i: number): InitialGroup {
  const name = typeof g.name === "string" && g.name.trim() ? g.name : `Camera Group ${i + 1}`;
  return {
    name,
    cameras: clampInt(g.cameras, 1, 9999, GROUP_DEFAULTS.cameras),
    resolutionIdx: clampIdx(g.resolutionIdx, RESOLUTIONS.length, GROUP_DEFAULTS.resolutionIdx),
    codecIdx: clampIdx(g.codecIdx, CODECS.length, GROUP_DEFAULTS.codecIdx),
    complexityIdx: clampIdx(g.complexityIdx, COMPLEXITIES.length, GROUP_DEFAULTS.complexityIdx),
    fps: clampInt(g.fps, 1, 60, GROUP_DEFAULTS.fps),
    recordingMode: coerceRecordingMode(g.recordingMode),
    recordingPercent: clampInt(g.recordingPercent, 1, 100, GROUP_DEFAULTS.recordingPercent),
    // Motion floor is 20 (UI domain); a stray sub-20 value from an old row
    // clamps up rather than tripping the submit-side schema on resubmission.
    motionPercent: clampInt(g.motionPercent, 20, 100, GROUP_DEFAULTS.motionPercent),
    // Phase 10 Step 3 — camera-model picker fields. units/sensors are finite
    // ints >= 1; cameras itself is NOT recomputed from them here (a banked
    // quote's cameras is authoritative). cameraModelModified is a stored fact,
    // read as a strict boolean (never recomputed against camera_specs).
    cameraVendor: coerceCameraVendor(g.cameraVendor),
    cameraModel: coerceCameraModel(g.cameraModel),
    units: clampInt(g.units, 1, 9999, GROUP_DEFAULTS.units),
    sensorsPerCamera: clampInt(g.sensorsPerCamera, 1, 64, GROUP_DEFAULTS.sensorsPerCamera),
    cameraModelModified: g.cameraModelModified === true,
  };
}

export function normalizeInputState(raw: unknown): NormalizedInputState {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const version = typeof obj.version === "number" ? obj.version : 0;

  const rawGroups = Array.isArray(obj.groups) ? (obj.groups as RawGroup[]) : [];
  const source = rawGroups.length > 0 ? rawGroups : [{}];
  const groups = source.map((g, i) => normalizeGroup((g ?? {}) as RawGroup, i));

  // The add-on booleans arrived in v1 (Phase 4 Step 2). For older / absent
  // versions they were never stored, so we ignore any stray value and default
  // to false rather than trusting a field the writer never wrote.
  const supportsAddOns = version >= 1;

  return {
    version,
    projectName: typeof obj.projectName === "string" ? obj.projectName.slice(0, 50) : "",
    vms: coerceVms(obj.vms),
    retentionDays: clampInt(obj.retentionDays, 1, 730, RETENTION_DEFAULT),
    addOnFailoverRecorder: supportsAddOns ? obj.addOnFailoverRecorder === true : false,
    addOnManagementServer: supportsAddOns ? obj.addOnManagementServer === true : false,
    groups,
  };
}

type BankedGroup = {
  resolutionLabel?: string;
  codec?: string;
  complexity?: string;      // tier (low/med/high) — legacy, ambiguous across 6 levels
  complexityLabel?: string; // unique label — preferred for exact 1-of-6 recovery
  // Phase 10 Step 3 — camera-model picker. Banked resolved into groups_payload
  // (preferred on rehydration over the raw input_state copy), undefined when the
  // row predates the feature.
  cameraVendor?: string | null;
  cameraModel?: string | null;
  units?: number;
  sensorsPerCamera?: number;
  cameraModelModified?: boolean;
};

function extractBankedGroups(payload: unknown): BankedGroup[] {
  if (!payload || typeof payload !== "object") return [];
  const groups = (payload as { groups?: unknown }).groups;
  if (!Array.isArray(groups)) return [];
  return groups.map((g) => {
    const o = (g && typeof g === "object" ? g : {}) as Record<string, unknown>;
    return {
      resolutionLabel: typeof o.resolutionLabel === "string" ? o.resolutionLabel : undefined,
      codec: typeof o.codec === "string" ? o.codec : undefined,
      complexity: typeof o.complexity === "string" ? o.complexity : undefined,
      complexityLabel: typeof o.complexityLabel === "string" ? o.complexityLabel : undefined,
      // Present only on rows written by Step 3+. `has` distinguishes "banked as
      // absent/null" (a no-model group) from "field never written" (pre-feature
      // row) so the raw fallback only kicks in for the latter.
      cameraVendor: "cameraVendor" in o ? coerceCameraVendor(o.cameraVendor) : undefined,
      cameraModel: "cameraModel" in o ? coerceCameraModel(o.cameraModel) : undefined,
      units: typeof o.units === "number" ? o.units : undefined,
      sensorsPerCamera: typeof o.sensorsPerCamera === "number" ? o.sensorsPerCamera : undefined,
      cameraModelModified:
        typeof o.cameraModelModified === "boolean" ? o.cameraModelModified : undefined,
    };
  });
}

function resolveResolutionIdx(label: string | undefined, rawIdx: number): number {
  if (label) {
    const found = RESOLUTIONS.findIndex((r) => r.label === label);
    if (found >= 0) return found;
  }
  return clampIdx(rawIdx, RESOLUTIONS.length, GROUP_DEFAULTS.resolutionIdx);
}

function resolveCodecIdx(value: string | undefined, rawIdx: number): number {
  if (value) {
    const found = CODECS.findIndex((c) => c.value === value);
    if (found >= 0) return found;
  }
  return clampIdx(rawIdx, CODECS.length, GROUP_DEFAULTS.codecIdx);
}

// Prefer the unique label (recovers the exact 1-of-6 level and survives table
// reordering); fall back to the tier (ambiguous post-six-levels — resolves to
// the first level of that tier, fine for legacy rows); finally the raw index.
function resolveComplexityIdx(
  label: string | undefined,
  tier: string | undefined,
  rawIdx: number,
): number {
  if (label) {
    const found = COMPLEXITIES.findIndex((c) => c.label === label);
    if (found >= 0) return found;
  }
  if (tier) {
    const found = COMPLEXITIES.findIndex((c) => c.tier === tier);
    if (found >= 0) return found;
  }
  return clampIdx(rawIdx, COMPLEXITIES.length, GROUP_DEFAULTS.complexityIdx);
}

export function fromStoredSubmission(row: StoredSubmissionRow): CalculatorInitialState {
  const normalized = normalizeInputState(row.input_state);
  const banked = extractBankedGroups(row.groups_payload);

  const groups = normalized.groups.map((g, i) => {
    const b = banked[i];
    if (!b) return g;
    return {
      ...g,
      resolutionIdx: resolveResolutionIdx(b.resolutionLabel, g.resolutionIdx),
      codecIdx: resolveCodecIdx(b.codec, g.codecIdx),
      complexityIdx: resolveComplexityIdx(b.complexityLabel, b.complexity, g.complexityIdx),
      // Prefer the banked resolved camera fields over the raw input_state copy
      // (same robustness pattern as resolution/codec/complexity). `undefined`
      // means a pre-feature row that never banked them, so the raw value (which
      // defaulted to no-model) carries through. cameras is NOT touched here:
      // a banked quote's camera count is authoritative and never recomputed
      // from units × sensors on rehydration.
      cameraVendor: b.cameraVendor !== undefined ? b.cameraVendor : g.cameraVendor,
      cameraModel: b.cameraModel !== undefined ? b.cameraModel : g.cameraModel,
      units: b.units !== undefined ? clampInt(b.units, 1, 9999, g.units) : g.units,
      sensorsPerCamera:
        b.sensorsPerCamera !== undefined
          ? clampInt(b.sensorsPerCamera, 1, 64, g.sensorsPerCamera)
          : g.sensorsPerCamera,
      cameraModelModified:
        b.cameraModelModified !== undefined ? b.cameraModelModified : g.cameraModelModified,
    };
  });

  return {
    projectName: normalized.projectName,
    vms: normalized.vms,
    retentionDays: normalized.retentionDays,
    addOnFailoverRecorder: normalized.addOnFailoverRecorder,
    addOnManagementServer: normalized.addOnManagementServer,
    groups,
  };
}
