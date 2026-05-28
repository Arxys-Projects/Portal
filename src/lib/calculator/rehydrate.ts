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

// New-group defaults — kept in sync with newGroup() in calculator-form.tsx.
const GROUP_DEFAULTS = {
  cameras: 1,
  resolutionIdx: 14, // 4MP (2560×1440)
  codecIdx: 0, // H.265
  complexityIdx: 1, // Medium
  fps: 15,
  recordingPercent: 100,
  motionPercent: 50,
} as const;

const RETENTION_DEFAULT = 30;

export type InitialGroup = {
  name: string;
  cameras: number;
  resolutionIdx: number;
  codecIdx: number;
  complexityIdx: number;
  fps: number;
  recordingPercent: number;
  motionPercent: number;
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

function normalizeGroup(g: RawGroup, i: number): InitialGroup {
  const name = typeof g.name === "string" && g.name.trim() ? g.name : `Camera Group ${i + 1}`;
  return {
    name,
    cameras: clampInt(g.cameras, 1, 9999, GROUP_DEFAULTS.cameras),
    resolutionIdx: clampIdx(g.resolutionIdx, RESOLUTIONS.length, GROUP_DEFAULTS.resolutionIdx),
    codecIdx: clampIdx(g.codecIdx, CODECS.length, GROUP_DEFAULTS.codecIdx),
    complexityIdx: clampIdx(g.complexityIdx, COMPLEXITIES.length, GROUP_DEFAULTS.complexityIdx),
    fps: clampInt(g.fps, 1, 60, GROUP_DEFAULTS.fps),
    recordingPercent: clampInt(g.recordingPercent, 1, 100, GROUP_DEFAULTS.recordingPercent),
    motionPercent: clampInt(g.motionPercent, 1, 100, GROUP_DEFAULTS.motionPercent),
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
  complexity?: string;
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

function resolveComplexityIdx(tier: string | undefined, rawIdx: number): number {
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
      complexityIdx: resolveComplexityIdx(b.complexity, g.complexityIdx),
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
