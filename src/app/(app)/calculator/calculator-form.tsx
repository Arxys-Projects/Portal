"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import {
  CODECS,
  COMPLEXITIES,
  RESOLUTIONS,
  VMS_OPTIONS,
} from "@/lib/calculator/tables";
import { mapPixelsToBucket } from "@/lib/calculator/camera-resolution";
import {
  computeGroup,
  formatBandwidthMbps,
  formatNumber,
  formatStorageGb,
  type GroupInput,
} from "@/lib/calculator/compute";
import {
  searchCameraModels,
  submitCalculation,
  type CameraModelResult,
  type SubmissionState,
} from "./actions";
import { productGroupToFamilySlug } from "@/lib/price-book/families";
import { pickHeadroomOption } from "@/lib/recommend/headroom";
import type { CalculatorInitialState, InitialGroup } from "@/lib/calculator/rehydrate";
import {
  BarsIcon,
  CameraIcon,
  CheckIcon,
  DuplicateIcon,
  InfoIcon,
  PlusIcon,
  ResetIcon,
  StorageIcon,
  TrashIcon,
} from "./icons";

const INITIAL_STATE: SubmissionState = { status: "idle" };

// Camera vendors offered by the model picker. Only Axis returns results today
// (Hanwha / Avigilon are seeded in a later step), but all three are shown so the
// menu reflects the planned library rather than hiding empty vendors.
const CAMERA_VENDORS = ["Axis", "Hanwha", "Avigilon"] as const;

// Matches the auto-assigned "Camera Group N" name, used to decide whether a
// model select may prefill the group name (a user-edited name is never touched).
const DEFAULT_NAME_RE = /^Camera Group \d+$/;

type Group = {
  id: string;
  name: string;
  cameras: number;
  resolutionIdx: number;
  codecIdx: number;
  complexityIdx: number;
  fps: number;
  // "constant" = records 24/7 at the full event rate (motion% pinned to 100);
  // "motion" = records full hours but at a reduced bitrate during quiet periods.
  recordingMode: "constant" | "motion";
  recordingPercent: number; // Operation Hours, encoded as (hours / 24) × 100
  motionPercent: number;    // Motion/Event % (20–100); only live under "motion"
  // Phase 10 Step 3 — camera-model picker. null vendor/model = no model loaded,
  // in which case `cameras` is the direct editable input and the group behaves
  // exactly as before the feature. When a model IS loaded, `cameras` is derived
  // = units × sensorsPerCamera (still the engine input + payload field); units
  // is the user's free count, sensorsPerCamera comes from the model's sensor
  // count (editable on demand). cameraModelModified records that the user
  // overrode the auto-filled resolution or sensors after loading — a stored
  // fact, never recomputed against camera_specs.
  cameraVendor: string | null;
  cameraModel: string | null;
  units: number;
  sensorsPerCamera: number;
  cameraModelModified: boolean;
};

function freshId(): string {
  return `g-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function newGroup(seqNumber: number): Group {
  return {
    id: freshId(),
    name: `Camera Group ${seqNumber}`,
    cameras: 1,
    resolutionIdx: 14,    // 4MP (2560×1440) — same default as legacy
    codecIdx: 0,          // H.265
    complexityIdx: 2,     // Medium detail, low motion (realistic typical scene)
    fps: 15,
    recordingMode: "constant", // safe default: Constant, 24 h, 100%
    recordingPercent: 100,     // 24 h/day
    motionPercent: 100,
    // No model loaded by default — the no-model (direct-cameras) path.
    cameraVendor: null,
    cameraModel: null,
    units: 1,
    sensorsPerCamera: 1,
    cameraModelModified: false,
  };
}

// Map a camera's native pixels to a RESOLUTIONS index via mapPixelsToBucket
// (ADR 0058 round-up — the single source of truth, never reimplemented here).
// Returns null when pixels exceed the largest bucket, so the caller leaves
// resolutionIdx untouched and surfaces a non-blocking notice.
function resolutionIdxForPixels(width: number, height: number): number | null {
  const match = mapPixelsToBucket(width, height);
  if (!match) return null;
  const idx = RESOLUTIONS.findIndex((r) => r.label === match.bucket.label);
  return idx >= 0 ? idx : null;
}

// Result-row resolution label for the picker dropdown (same bucket mapping).
function bucketLabelForRow(r: CameraModelResult): string {
  const match = mapPixelsToBucket(r.maxWidth, r.maxHeight);
  return match ? match.bucket.label : "above largest bucket";
}

// Operation Hours ⇄ recordingPercent. The persisted source of truth is the
// percent; the UI presents it as whole hours/day.
function hoursFromPercent(recordingPercent: number): number {
  return Math.round((recordingPercent / 100) * 24);
}
function percentFromHours(hours: number): number {
  return Math.round((Math.max(1, Math.min(24, hours)) / 24) * 100);
}

// Rehydration (Phase 4 Step 3): turn a stored group into a form Group, minting
// a fresh client-side id. Falls back to one default group for an empty state.
function groupsFromInitial(initial: InitialGroup[] | undefined): Group[] {
  if (!initial || initial.length === 0) return [newGroup(1)];
  return initial.map((g) => ({ id: freshId(), ...g }));
}

function Tooltip({ text, side = "l" }: { text: string; side?: "l" | "r" }) {
  return (
    <span
      className={"ax-tip" + (side === "r" ? " ax-tip-r" : "")}
      tabIndex={0}
    >
      <InfoIcon />
      <span className="ax-tt">{text}</span>
    </span>
  );
}

// An active, non-internal partner user an internal rep can run a calc for. The
// id is a real portal user — binding it as the FK is what grants that user
// visibility into the resulting submission (Phase 8).
export type OnBehalfPartner = {
  id: string;
  companyName: string;
  contactName: string;
  email: string | null;
};

export function CalculatorForm({
  previousProjectNames = [],
  initialState,
  sourceSubmissionId,
  isInternal = false,
  onBehalfPartners = [],
}: {
  previousProjectNames?: string[];
  initialState?: CalculatorInitialState;
  sourceSubmissionId?: string;
  // Phase 7 Step 1 / Phase 8 — internal users get an on-behalf target picker.
  // Never rendered for external partners.
  isInternal?: boolean;
  onBehalfPartners?: OnBehalfPartner[];
}) {
  const [groups, setGroups] = useState<Group[]>(() =>
    groupsFromInitial(initialState?.groups),
  );
  const [retentionDays, setRetentionDays] = useState(
    () => initialState?.retentionDays ?? 30,
  );
  const [vms, setVms] = useState<string>(() => initialState?.vms ?? "");
  const [projectName, setProjectName] = useState(
    () => initialState?.projectName ?? "",
  );
  // On-behalf-of target (internal users only). Not part of input_state, so it
  // is always blank on a rehydrated revision — the rep re-picks if needed.
  // Two mutually-exclusive paths: pick an onboarded partner user (binds the FK
  // → grants that user visibility), or type a not-yet-onboarded company name
  // (org-only fallback, no FK, no portal visibility). The DB CHECK enforces at
  // most one set; the UI clears the other whenever one is used.
  const [onBehalfCompany, setOnBehalfCompany] = useState("");
  const [onBehalfPartnerId, setOnBehalfPartnerId] = useState("");
  const [onBehalfNewCompany, setOnBehalfNewCompany] = useState("");
  // The not-onboarded fallback is hidden behind a text link until clicked, then
  // reveals the New company name input inline in its place (Fix 1, Band 1).
  const [showNewCompany, setShowNewCompany] = useState(false);
  // A rehydrated form is immediately re-submittable, so it starts "interacted".
  const [hasInteracted, setHasInteracted] = useState(() => Boolean(initialState));
  const [resultDismissed, setResultDismissed] = useState(false);
  const [addOnFailoverRecorder, setAddOnFailoverRecorder] = useState(
    () => initialState?.addOnFailoverRecorder ?? false,
  );
  const [addOnManagementServer, setAddOnManagementServer] = useState(
    () => initialState?.addOnManagementServer ?? false,
  );
  // The source submission this is a revision of. Reset clears it so a freshly
  // reset form saves a brand-new submission rather than another revision.
  const [revisionSourceId, setRevisionSourceId] = useState<string | null>(
    () => sourceSubmissionId ?? null,
  );

  // Tracks raw string values for numeric inputs while the user is actively
  // typing, so an intermediate empty field doesn't snap to the clamped minimum.
  // Keys: `${groupId}.cameras`, `${groupId}.fps`, `${groupId}.recording`, "retention".
  const [numericDrafts, setNumericDrafts] = useState<Map<string, string>>(
    new Map(),
  );

  // Submit state is held locally and updated from the transition callback so the
  // saving flag can be cleared there (never from a useEffect — that tripped the
  // react-hooks/set-state-in-effect rule during the admin EditableName rework).
  const [submitState, setSubmitState] = useState<SubmissionState>(INITIAL_STATE);
  const [isSaving, setIsSaving] = useState(false);
  const [, startTransition] = useTransition();

  const touch = () => {
    if (!hasInteracted) setHasInteracted(true);
    // Dismiss a stale recommendation on the first interaction after a submit.
    if (!resultDismissed && submitState.status === "ok") {
      setResultDismissed(true);
    }
  };

  const getDraft = (key: string, fallback: number): string =>
    numericDrafts.has(key) ? numericDrafts.get(key)! : String(fallback);

  const setDraft = (key: string, value: string) => {
    setNumericDrafts((prev) => new Map(prev).set(key, value));
  };

  const clearDraft = (key: string) => {
    setNumericDrafts((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  };

  // On-behalf picker: distinct companies, then the users at the chosen company.
  // Small lists, so derive per-render rather than memoize.
  const onBehalfCompanies = [
    ...new Set(onBehalfPartners.map((p) => p.companyName).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));
  const onBehalfUsersInCompany = onBehalfPartners.filter(
    (p) => p.companyName === onBehalfCompany,
  );

  const addGroup = () => {
    touch();
    setGroups((p) => [...p, newGroup(p.length + 1)]);
  };
  const removeGroup = (id: string) => {
    touch();
    setGroups((p) => (p.length > 1 ? p.filter((g) => g.id !== id) : p));
  };
  const duplicateGroup = (id: string) => {
    touch();
    setGroups((p) => {
      const src = p.find((g) => g.id === id);
      if (!src) return p;
      return [
        ...p,
        {
          ...src,
          id: `g-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: `${src.name} (copy)`,
        },
      ];
    });
  };
  const updateGroup = (id: string, patch: Partial<Group>) => {
    touch();
    setGroups((p) => p.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  };

  // Camera-model picker handlers. `cameras` stays the source of truth: on the
  // model-loaded path it is kept equal to units × sensorsPerCamera here, so the
  // compute map and submit payload (which both read `cameras`) need no change.
  const derivedCameras = (units: number, sensors: number) =>
    Math.max(1, Math.min(9999, units * sensors));

  // Load a model: fill resolution (via mapPixelsToBucket) + sensors, reset the
  // modified flag, recompute cameras, and prefill the name only if still the
  // default. Returns false when the pixel→bucket map yields null so the picker
  // can show a non-blocking notice (cannot happen with the Axis seed; defensive).
  const loadCameraModel = (id: string, r: CameraModelResult): boolean => {
    touch();
    const idx = resolutionIdxForPixels(r.maxWidth, r.maxHeight);
    setGroups((p) =>
      p.map((g) => {
        if (g.id !== id) return g;
        return {
          ...g,
          cameraVendor: r.vendor,
          cameraModel: r.model,
          sensorsPerCamera: r.sensorCount,
          cameraModelModified: false,
          cameras: derivedCameras(g.units, r.sensorCount),
          // CODEC is never auto-filled from a model (constraint #2). A null
          // bucket leaves resolutionIdx untouched (constraint #3).
          ...(idx !== null ? { resolutionIdx: idx } : {}),
          name: DEFAULT_NAME_RE.test(g.name.trim()) ? `${r.vendor} ${r.model}` : g.name,
        };
      }),
    );
    return idx !== null;
  };

  // Detach the model: unlock fields, clear vendor/model, reset sensors→1 and the
  // modified flag. Non-destructive — the group name and the current resolution
  // are left as-is, and cameras keeps its last value (now directly editable).
  const clearCameraModel = (id: string) => {
    touch();
    setGroups((p) =>
      p.map((g) =>
        g.id === id
          ? {
              ...g,
              cameraVendor: null,
              cameraModel: null,
              sensorsPerCamera: 1,
              cameraModelModified: false,
            }
          : g,
      ),
    );
  };

  const setUnits = (id: string, units: number) => {
    setGroups((p) =>
      p.map((g) =>
        g.id === id
          ? { ...g, units, cameras: derivedCameras(units, g.sensorsPerCamera) }
          : g,
      ),
    );
  };

  // An explicit override of the auto-filled sensor count marks the group
  // modified and recomputes the derived camera total.
  const setSensorsPerCamera = (id: string, sensors: number) => {
    setGroups((p) =>
      p.map((g) =>
        g.id === id
          ? {
              ...g,
              sensorsPerCamera: sensors,
              cameraModelModified: true,
              cameras: derivedCameras(g.units, sensors),
            }
          : g,
      ),
    );
  };

  const reset = () => {
    setGroups([newGroup(1)]);
    setRetentionDays(30);
    setVms("");
    setProjectName("");
    setOnBehalfCompany("");
    setOnBehalfPartnerId("");
    setOnBehalfNewCompany("");
    setShowNewCompany(false);
    setHasInteracted(false);
    setResultDismissed(true);
    setAddOnFailoverRecorder(false);
    setAddOnManagementServer(false);
    setRevisionSourceId(null);
    setNumericDrafts(new Map());
    setSubmitState(INITIAL_STATE);
    setIsSaving(false);
  };

  const handleSave = () => {
    // flushSync paints the disabled + spinner state before the server action's
    // synchronous payload serialization blocks the main thread; a transition's
    // pending flag alone does not paint in time here (the 2026-06-05 spinner
    // fix). The saving flag is cleared from the transition callback below, not a
    // useEffect, so react-hooks/set-state-in-effect stays clean.
    flushSync(() => setIsSaving(true));
    setResultDismissed(false);
    const payload = {
      projectName: projectName.trim() || null,
      // Picker id binds the FK (grants the named user visibility); the free-text
      // fallback is org-only. Never both — the UI clears the other path when one
      // is used. Ignored server-side for non-internal callers.
      onBehalfOfPartnerId: isInternal ? (onBehalfPartnerId || null) : null,
      onBehalfOfCompanyName: isInternal
        ? (onBehalfPartnerId ? null : onBehalfNewCompany.trim() || null)
        : null,
      vms: vms || null,
      retentionDays,
      addOnFailoverRecorder,
      addOnManagementServer,
      isRevision: Boolean(revisionSourceId),
      sourceSubmissionId: revisionSourceId,
      groups: groups.map((g) => ({
        name: g.name,
        // cameras stays the engine input + payload field; on the model-loaded
        // path it already equals units × sensorsPerCamera (kept in sync above).
        cameras: g.cameras,
        resolutionIdx: g.resolutionIdx,
        codecIdx: g.codecIdx,
        complexityIdx: g.complexityIdx,
        fps: g.fps,
        recordingMode: g.recordingMode,
        recordingPercent: g.recordingPercent,
        // Constant pins motion% to 100; the server re-enforces this.
        motionPercent: g.recordingMode === "constant" ? 100 : g.motionPercent,
        // Phase 10 Step 3 — banked for rehydration (input_state) + display
        // (groups_payload). The engine contract is unchanged; these are extra.
        cameraVendor: g.cameraVendor,
        cameraModel: g.cameraModel,
        units: g.units,
        sensorsPerCamera: g.sensorsPerCamera,
        cameraModelModified: g.cameraModelModified,
      })),
    };
    startTransition(async () => {
      const res = await submitCalculation(INITIAL_STATE, payload);
      setSubmitState(res);
      setIsSaving(false);
    });
  };

  const groupResults = useMemo(
    () =>
      groups.map((g) => {
        const input: GroupInput = {
          cameras: Math.max(1, Math.floor(g.cameras || 0)),
          resolution: RESOLUTIONS[g.resolutionIdx],
          codec: CODECS[g.codecIdx],
          complexity: COMPLEXITIES[g.complexityIdx],
          fps: Math.max(1, g.fps),
          recordingPercent: g.recordingPercent,
          // Constant always sizes at the full event rate, matching the server.
          motionPercent: g.recordingMode === "constant" ? 100 : g.motionPercent,
        };
        return { group: g, computed: computeGroup(input, retentionDays) };
      }),
    [groups, retentionDays],
  );

  const totals = useMemo(() => {
    const bandwidthMbps = groupResults.reduce(
      (s, r) => s + r.computed.bandwidthMbps,
      0,
    );
    const storageGb = groupResults.reduce(
      (s, r) => s + r.computed.storageGb,
      0,
    );
    const cameras = groupResults.reduce((s, r) => s + r.group.cameras, 0);
    const dailyGb = storageGb / Math.max(retentionDays, 1);
    return { bandwidthMbps, storageGb, cameras, dailyGb };
  }, [groupResults, retentionDays]);

  return (
    <div id="arxys-calc-root">
      {/* Summary cards */}
      <div className="ax-sum">
        <div className="ax-s bl">
          <div className="ax-sl">
            Total Cameras
            <Tooltip text="Every camera stream across all your groups, added together." />
          </div>
          <div className="ax-sv bl">{totals.cameras}</div>
        </div>
        <div className="ax-s cy">
          <div className="ax-sl">
            Total Bandwidth
            <Tooltip text="The combined network speed all cameras need at the same time. Size your network switches and any uplink to handle at least this much." />
          </div>
          <div className="ax-sv cy">{formatBandwidthMbps(totals.bandwidthMbps)}</div>
        </div>
        <div className="ax-s gn">
          <div className="ax-sl">
            Total Storage
            <Tooltip text="Total drive space needed to keep every camera's footage for the full retention period. Already includes the 20% VMS overhead." side="r" />
          </div>
          <div className="ax-sv gn">{formatStorageGb(totals.storageGb)}</div>
          <div style={{ fontSize: 11, color: "var(--td)", marginTop: 4 }}>
            (includes 20% overhead)
          </div>
        </div>
      </div>

      {/* Project panel — three bands: attribution (internal), setup, action */}
      <div className="ax-gl">
        {/* Band 1 — on-behalf attribution (internal users only) */}
        {isInternal && (
          <div className="ax-band">
            <div className="ax-attr-head">
              <span className="ax-attr-title">On behalf of</span>
              <span className="ax-attr-tag">internal only</span>
              <Tooltip text="Pick the partner company, then the user this is for. They see it in their own pipeline and can revise it. Leave blank to file under your own account." />
            </div>
            <div className="ax-attr-grid">
              <div className="ax-f">
                <label className="ax-fl">Company</label>
                <select
                  value={onBehalfCompany}
                  onChange={(e) => {
                    touch();
                    setOnBehalfCompany(e.target.value);
                    setOnBehalfPartnerId("");
                    if (e.target.value) setOnBehalfNewCompany("");
                  }}
                >
                  <option value="">— Select partner —</option>
                  {onBehalfCompanies.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ax-f">
                <label className="ax-fl">Partner user</label>
                <select
                  value={onBehalfPartnerId}
                  disabled={!onBehalfCompany}
                  onChange={(e) => { touch(); setOnBehalfPartnerId(e.target.value); }}
                >
                  <option value="">
                    {onBehalfCompany ? "— Select user —" : "— Select a company first —"}
                  </option>
                  {onBehalfUsersInCompany.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.contactName}
                      {p.email ? ` (${p.email})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {showNewCompany ? (
              <div className="ax-f ax-attr-new">
                <label className="ax-fl">New company name</label>
                <input
                  type="text"
                  maxLength={120}
                  placeholder="Company name"
                  autoFocus
                  value={onBehalfNewCompany}
                  onChange={(e) => {
                    touch();
                    setOnBehalfNewCompany(e.target.value);
                    if (e.target.value) {
                      setOnBehalfCompany("");
                      setOnBehalfPartnerId("");
                    }
                  }}
                />
                {onBehalfNewCompany.trim() ? (
                  <span className="ax-attr-note">
                    A new Pipedrive organization is created. The deal rolls up to the company; no portal user sees it until that company is onboarded.
                  </span>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                className="ax-attr-newlink"
                onClick={() => setShowNewCompany(true)}
              >
                + Company not onboarded? Add a new name
              </button>
            )}
          </div>
        )}

        {/* Band 2 — project setup */}
        <div className="ax-band">
          <div className="ax-setup-row">
            <div className="ax-f ax-f-project">
              <label className="ax-fl">
                Project Name
                <Tooltip text="A label for this estimate — e.g. the site or customer name. Just helps you find and revise it later; it doesn't affect the math." />
              </label>
              <input
                type="text"
                list="ax-project-names"
                maxLength={50}
                placeholder="e.g. Main Campus"
                value={projectName}
                onChange={(e) => { touch(); setProjectName(e.target.value); }}
              />
              {previousProjectNames.length > 0 && (
                <datalist id="ax-project-names">
                  {previousProjectNames.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              )}
            </div>
            <div className="ax-f ax-f-vms">
              <label className="ax-fl">
                Which VMS?
                <Tooltip text="The video management software the cameras record into (Milestone, Genetec, etc.). Each platform compresses video a little differently, so picking yours makes the storage and bandwidth estimates track your real system." />
              </label>
              <select value={vms} onChange={(e) => { touch(); setVms(e.target.value); }}>
                <option value="">— Select —</option>
                {VMS_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="ax-f ax-f-ret">
              <label className="ax-fl">
                Retention
                <Tooltip text="Days of footage to store." />
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="number"
                  min={1}
                  max={730}
                  value={getDraft("retention", retentionDays)}
                  onChange={(e) => {
                    touch();
                    setDraft("retention", e.target.value);
                    const n = parseInt(e.target.value, 10);
                    if (!isNaN(n)) {
                      setRetentionDays(Math.max(1, Math.min(730, n)));
                    }
                  }}
                  onBlur={(e) => {
                    clearDraft("retention");
                    const n = parseInt(e.target.value, 10);
                    setRetentionDays(isNaN(n) ? 30 : Math.max(1, Math.min(730, n)));
                  }}
                  style={{ width: 80 }}
                />
                <span style={{ color: "var(--td)", fontSize: 13 }}>days</span>
              </div>
            </div>
          </div>

          {/* Add-on toggles */}
          <div className="ax-addons-row">
            <span className="ax-addons-label">
              Add-ons
              <Tooltip text="Optional extra hardware for resilience and scale. Tick what the project needs — we'll factor it into the quote." />
            </span>
            <label className="ax-addon-chk">
              <input
                type="checkbox"
                checked={addOnFailoverRecorder}
                onChange={(e) => { touch(); setAddOnFailoverRecorder(e.target.checked); }}
              />
              Failover Recorder
              <Tooltip text="A standby recorder that automatically takes over if a main recorder fails, so you keep recording during an outage." />
            </label>
            <label className="ax-addon-chk">
              <input
                type="checkbox"
                checked={addOnManagementServer}
                onChange={(e) => { touch(); setAddOnManagementServer(e.target.checked); }}
              />
              Management Server
              <Tooltip text="A dedicated server that runs the VMS software and management, separate from the recorders. Common on larger systems for performance and easier administration." />
            </label>
          </div>
        </div>

        {/* Band 3 — action */}
        <div className="ax-band ax-band-action">
          <div className="ax-divider" />
          {submitState.status === "error" && !resultDismissed && (
            <div className="ax-rec-err" style={{ marginTop: 0 }}>
              {submitState.error}
            </div>
          )}
          {submitState.status === "ok" && !resultDismissed && (
            <div className="ax-saved-bar">
              <CheckIcon />
              <span>Estimate saved and sent to Arxys</span>
              <a
                className="ax-saved-link"
                href={`/api/submissions/${submitState.submissionId}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View report PDF
              </a>
            </div>
          )}
          <div className="ax-action-row">
            <span className="ax-save-hint">
              Configure all cameras, then save to send to Arxys for review.
            </span>
            {submitState.status === "ok" && !resultDismissed ? (
              <div className="ax-action-btns">
                <button
                  type="button"
                  className="ax-ib"
                  onClick={reset}
                  style={{ gap: 6 }}
                >
                  <ResetIcon /> Start new project
                </button>
                <button type="button" className="ax-save-btn" disabled>
                  <CheckIcon /> Saved
                </button>
              </div>
            ) : (
              <div className="ax-action-btns">
                <button
                  type="button"
                  className="ax-ib"
                  onClick={reset}
                  disabled={isSaving}
                  style={{ gap: 6 }}
                >
                  <ResetIcon /> Reset
                </button>
                <button
                  type="button"
                  className="ax-save-btn"
                  disabled={!hasInteracted || isSaving}
                  data-saving={isSaving || undefined}
                  onClick={handleSave}
                >
                  {isSaving && (
                    <svg className="ax-save-spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                  )}
                  {isSaving ? "Saving…" : "Save & request quote"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Camera groups */}
      <div>
        {groupResults.map(({ group, computed }) => (
          <div key={group.id} className="ax-cam">
            <div className="ax-ch">
              <div className="ax-chl">
                <CameraIcon />
                <input
                  className="ax-cn"
                  value={group.name}
                  onChange={(e) =>
                    updateGroup(group.id, { name: e.target.value })
                  }
                  placeholder="Enter group name..."
                />
                <CameraModelPicker
                  group={group}
                  onLoad={loadCameraModel}
                  onClear={clearCameraModel}
                  touch={touch}
                />
              </div>
              <div className="ax-ca">
                <button
                  type="button"
                  className="ax-ib"
                  title="Copy this group"
                  onClick={() => duplicateGroup(group.id)}
                >
                  <DuplicateIcon /> Copy
                </button>
                <button
                  type="button"
                  className="ax-ib dng"
                  title="Delete this group"
                  onClick={() => removeGroup(group.id)}
                  disabled={groups.length <= 1}
                >
                  <TrashIcon /> Delete
                </button>
              </div>
            </div>

            <div className="ax-cb">
              <CamerasField
                group={group}
                getDraft={getDraft}
                setDraft={setDraft}
                clearDraft={clearDraft}
                touch={touch}
                updateGroup={updateGroup}
                setUnits={setUnits}
                setSensorsPerCamera={setSensorsPerCamera}
              />
              <div className="ax-f wr">
                <label className="ax-fl">
                  Resolution
                  <Tooltip text="The camera's image size in megapixels (e.g. 4MP). Higher resolution means sharper, more detailed footage — and more storage and bandwidth to match." side="r" />
                </label>
                <select
                  value={group.resolutionIdx}
                  onChange={(e) => {
                    const resolutionIdx = parseInt(e.target.value, 10);
                    // Overriding the auto-filled resolution after a model is
                    // loaded marks the group modified (a stored fact).
                    updateGroup(
                      group.id,
                      group.cameraModel
                        ? { resolutionIdx, cameraModelModified: true }
                        : { resolutionIdx },
                    );
                  }}
                >
                  {RESOLUTIONS.map((r, i) => (
                    <option key={r.label} value={i}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ax-f wk">
                <label className="ax-fl">
                  Codec
                  <Tooltip text={CODECS[group.codecIdx].note} />
                </label>
                <select
                  value={group.codecIdx}
                  onChange={(e) =>
                    updateGroup(group.id, {
                      codecIdx: parseInt(e.target.value, 10),
                    })
                  }
                >
                  {CODECS.map((c, i) => (
                    <option key={c.value} value={i}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ax-f wf">
                <label className="ax-fl">
                  FPS
                  <Tooltip text="Frames per second — how smooth the video looks. Higher FPS captures fast motion better but uses more storage. 15 is typical for surveillance; 30 for fast scenes like checkout lanes." side="r" />
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={getDraft(`${group.id}.fps`, group.fps)}
                  onChange={(e) => {
                    setDraft(`${group.id}.fps`, e.target.value);
                    touch();
                    const n = parseInt(e.target.value, 10);
                    if (!isNaN(n)) {
                      updateGroup(group.id, {
                        fps: Math.max(1, Math.min(60, n)),
                      });
                    }
                  }}
                  onBlur={(e) => {
                    clearDraft(`${group.id}.fps`);
                    const n = parseInt(e.target.value, 10);
                    updateGroup(group.id, {
                      fps: isNaN(n) ? 1 : Math.max(1, Math.min(60, n)),
                    });
                  }}
                  style={{ textAlign: "center" }}
                />
              </div>
              <div className="ax-f wx">
                <label className="ax-fl">
                  Complexity
                  <Tooltip text="How detailed and how busy the scene is — it scales the bitrate. Pick the closest example scene below rather than guessing Low/Medium/High." side="r" />
                </label>
                <select
                  value={group.complexityIdx}
                  onChange={(e) =>
                    updateGroup(group.id, {
                      complexityIdx: parseInt(e.target.value, 10),
                    })
                  }
                >
                  {COMPLEXITIES.map((c, i) => (
                    <option key={c.label} value={i}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ax-f wd">
                <label className="ax-fl">
                  Recording
                  <Tooltip text="Constant = records continuously 24/7 at the full bitrate (most storage). Motion-only = records the full hours but at a reduced bitrate during quiet periods; enter the expected motion % at right." side="r" />
                </label>
                <select
                  value={group.recordingMode}
                  onChange={(e) => {
                    touch();
                    // Switching to Constant pins motion% to 100 (the full event
                    // rate); switching to Motion-only re-enables the slider.
                    updateGroup(
                      group.id,
                      e.target.value === "motion"
                        ? { recordingMode: "motion" }
                        : { recordingMode: "constant", motionPercent: 100 },
                    );
                  }}
                >
                  <option value="constant">Constant</option>
                  <option value="motion">Motion-only</option>
                </select>
              </div>
              <div className="ax-f wh">
                <label className="ax-fl">
                  Operation
                  <Tooltip text="Hours per day the cameras are powered and recording at all. Reduces stored hours linearly — separate from motion." side="r" />
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={getDraft(
                      `${group.id}.recording`,
                      hoursFromPercent(group.recordingPercent),
                    )}
                    onChange={(e) => {
                      setDraft(`${group.id}.recording`, e.target.value);
                      touch();
                      const h = parseInt(e.target.value, 10);
                      if (!isNaN(h)) {
                        updateGroup(group.id, {
                          recordingPercent: percentFromHours(h),
                        });
                      }
                    }}
                    onBlur={(e) => {
                      clearDraft(`${group.id}.recording`);
                      const h = parseInt(e.target.value, 10);
                      updateGroup(group.id, {
                        recordingPercent: percentFromHours(isNaN(h) ? 24 : h),
                      });
                    }}
                    style={{ width: 56, textAlign: "center" }}
                  />
                  <span style={{ fontSize: 12, color: "var(--td)" }}>hrs</span>
                </div>
              </div>
              <div className="ax-f wm">
                <label className="ax-fl">
                  Motion/Event %
                  <Tooltip text="Expected share of time the scene has motion/events. Weights the bitrate between a 20% idle floor and the full event rate. Only applies to Motion-only recording." side="r" />
                </label>
                {(() => {
                  const isConstant = group.recordingMode === "constant";
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="number"
                        min={20}
                        max={100}
                        step={5}
                        disabled={isConstant}
                        value={isConstant ? 100 : getDraft(`${group.id}.motion`, group.motionPercent)}
                        aria-label={`Motion/event percentage for ${group.name}${isConstant ? " (fixed at 100% under Constant recording)" : ""}`}
                        onChange={(e) => {
                          setDraft(`${group.id}.motion`, e.target.value);
                          touch();
                          const n = parseInt(e.target.value, 10);
                          if (!isNaN(n)) {
                            updateGroup(group.id, {
                              motionPercent: Math.max(20, Math.min(100, n)),
                            });
                          }
                        }}
                        onBlur={(e) => {
                          clearDraft(`${group.id}.motion`);
                          const n = parseInt(e.target.value, 10);
                          updateGroup(group.id, {
                            motionPercent: isNaN(n) ? 100 : Math.max(20, Math.min(100, n)),
                          });
                        }}
                        style={{ width: 56, textAlign: "center" }}
                      />
                      <span style={{ fontSize: 12, color: "var(--td)" }}>%</span>
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="ax-cx-ex">
              <strong>{COMPLEXITIES[group.complexityIdx].label}</strong>
              {" — e.g. "}
              {COMPLEXITIES[group.complexityIdx].example}
            </div>

            <div className="ax-cr">
              <div className="ax-ci">
                <span className="ax-cil">
                  Bitrate:
                  <Tooltip text="How much data one camera in this group produces every second. Resolution, FPS, and how busy the scene is all push it up or down." side="r" />
                </span>
                <span className="ax-civ" style={{ color: "var(--pu)" }}>
                  {computed.bitrateMbps >= 1
                    ? `${formatNumber(computed.bitrateMbps)} Mbps`
                    : `${Math.round(computed.bitrateMbps * 1000)} Kbps`}
                </span>
              </div>
              <div className="ax-ci">
                <span className="ax-cil">
                  Bandwidth:
                  <Tooltip text="Network speed this whole group needs at once (one camera's bitrate × the number of cameras)." side="r" />
                </span>
                <span className="ax-civ" style={{ color: "var(--cy)" }}>
                  {formatBandwidthMbps(computed.bandwidthMbps)}
                </span>
              </div>
              <div className="ax-ci">
                <span className="ax-cil">
                  Storage:
                  <Tooltip text="Drive space this group needs to hold its footage for the full retention period, with the 20% VMS overhead added." side="r" />
                </span>
                <span className="ax-civ" style={{ color: "var(--gn)" }}>
                  {formatStorageGb(computed.storageGb)}
                </span>
              </div>
              <div className="ax-ci">
                <span className="ax-cil">
                  Daily:
                  <Tooltip text="How much footage this group records each day. Multiply by your retention days to get total storage." side="r" />
                </span>
                <span className="ax-civ" style={{ color: "var(--am)" }}>
                  {formatStorageGb(computed.storageGb / Math.max(retentionDays, 1))}/day
                </span>
              </div>
            </div>
          </div>
        ))}
        <button type="button" className="ax-add" onClick={addGroup}>
          <PlusIcon /> Add Camera Group
        </button>
      </div>

      {/* Results table */}
      <div className="ax-tw">
        <table className="ax-tbl">
          <thead>
            <tr>
              <th>Camera Group</th>
              <th>Qty</th>
              <th>Resolution</th>
              <th>Codec</th>
              <th>FPS</th>
              <th>Rec</th>
              <th>Bandwidth</th>
              <th>Storage</th>
              <th>Daily</th>
            </tr>
          </thead>
          <tbody>
            {groupResults.map(({ group, computed }) => (
              <tr key={group.id}>
                <td style={{ color: "var(--tp)", fontWeight: 600 }}>
                  {group.name}
                </td>
                <td className="m">{group.cameras}</td>
                <td>{RESOLUTIONS[group.resolutionIdx].label}</td>
                <td>{CODECS[group.codecIdx].label}</td>
                <td className="m">{group.fps}</td>
                <td className="m">{Math.round((group.recordingPercent / 100) * 24)} hrs</td>
                <td className="m" style={{ color: "var(--cy)" }}>
                  {formatBandwidthMbps(computed.bandwidthMbps)}
                </td>
                <td className="m" style={{ color: "var(--gn)" }}>
                  {formatStorageGb(computed.storageGb)}
                </td>
                <td className="m" style={{ color: "var(--am)" }}>
                  {formatStorageGb(computed.storageGb / Math.max(retentionDays, 1))}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td className="m">{totals.cameras}</td>
              <td colSpan={4}></td>
              <td className="m" style={{ color: "var(--cy)" }}>
                {formatBandwidthMbps(totals.bandwidthMbps)}
              </td>
              <td className="m" style={{ color: "var(--gn)" }}>
                {formatStorageGb(totals.storageGb)}
              </td>
              <td className="m" style={{ color: "var(--am)" }}>
                {formatStorageGb(totals.dailyGb)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="ax-cht-grid">
        {/* Bandwidth bar chart */}
        <div className="ax-cht">
          <div className="ax-cht-t">
            <BarsIcon /> Bandwidth by Group
          </div>
          {groupResults.map(({ group, computed }) => {
            const pct =
              totals.bandwidthMbps > 0
                ? (computed.bandwidthMbps / totals.bandwidthMbps) * 100
                : 0;
            return (
              <div key={group.id} className="ax-br">
                <div className="ax-bl">{group.name}</div>
                <div className="ax-bt">
                  <div className="ax-bf bw" style={{ width: `${pct}%` }} />
                  <span className="ax-bpct">{pct.toFixed(0)}%</span>
                </div>
                <div className="ax-bv">
                  {formatBandwidthMbps(computed.bandwidthMbps)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Storage bar chart */}
        <div className="ax-cht">
          <div className="ax-cht-t">
            <StorageIcon /> Storage by Group
          </div>
          {groupResults.map(({ group, computed }) => {
            const pct =
              totals.storageGb > 0
                ? (computed.storageGb / totals.storageGb) * 100
                : 0;
            return (
              <div key={group.id} className="ax-br">
                <div className="ax-bl">{group.name}</div>
                <div className="ax-bt">
                  <div className="ax-bf st" style={{ width: `${pct}%` }} />
                  <span className="ax-bpct">{pct.toFixed(0)}%</span>
                </div>
                <div className="ax-bv">
                  {formatStorageGb(computed.storageGb)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="ax-fn">
        <strong>Note:</strong> Storage includes ~20% overhead for VMS best practices.
      </div>

      {/* Plain-speak FAQ — every field explained without leaving the page */}
      <details className="ax-faq">
        <summary>
          <InfoIcon />
          How this calculator works — what each field means
        </summary>
        <div className="ax-faq-body">
          <div className="ax-faq-col">
            <h4>What you enter</h4>
            <ul>
              <li><strong>Project Name</strong> — a label so you can find and revise this estimate later. Doesn&apos;t change the math.</li>
              <li><strong>Which VMS?</strong> — the recording software (Milestone, Genetec, etc.). Each compresses video a bit differently, so picking yours keeps the estimate realistic.</li>
              <li><strong>Retention</strong> — how many days of footage you keep before it&apos;s overwritten. More days = more storage, in a straight line.</li>
              <li><strong>Add-ons</strong> — optional hardware. <em>Failover Recorder</em> is a standby that takes over if a recorder dies; <em>Management Server</em> runs the VMS separately from the recorders on bigger systems.</li>
              <li><strong>Video Streams</strong> — how many cameras share these settings. Everything below multiplies by this count.</li>
              <li><strong>Resolution</strong> — image size in megapixels. Higher = sharper footage, but more storage and bandwidth.</li>
              <li><strong>Codec</strong> — the compression method. Newer codecs (H.265) pack the same picture into roughly half the space of older ones (H.264).</li>
              <li><strong>FPS</strong> — frames per second, i.e. how smooth the video is. 15 suits most scenes; raise it only where fast motion matters.</li>
              <li><strong>Complexity</strong> — how detailed and busy the scene is. A quiet hallway compresses small; a crowded stadium needs far more data. Pick the closest example scene.</li>
              <li><strong>Recording</strong> — <em>Constant</em> records 24/7 at full quality (most storage). <em>Motion-only</em> records the full hours but drops quality during quiet periods to save space.</li>
              <li><strong>Operation</strong> — hours per day the cameras actually record. Fewer hours cuts storage proportionally.</li>
              <li><strong>Motion/Event %</strong> — on Motion-only, how much of the time something is actually happening. Higher % means more high-quality footage, so more storage.</li>
            </ul>
          </div>
          <div className="ax-faq-col">
            <h4>What we calculate</h4>
            <ul>
              <li><strong>Bitrate</strong> — the data one camera produces per second. The building block for everything else; resolution, FPS, codec, and complexity all feed into it.</li>
              <li><strong>Bandwidth</strong> — network speed a group (or the whole system) needs at once. Make sure your switches and uplinks can carry the total.</li>
              <li><strong>Storage</strong> — drive space to keep all footage for the retention period, including a 20% overhead the VMS needs for its database and indexes.</li>
              <li><strong>Daily</strong> — footage recorded per day. A quick gut-check: daily × retention days ≈ total storage.</li>
              <li><strong>Totals</strong> — the summary cards at the top add up every group, so you see the project-wide camera count, bandwidth, and storage at a glance.</li>
              <li><strong>Recommendation</strong> — after you save, we match these totals to the Arxys appliance that fits, plus alternatives and room to grow.</li>
            </ul>
          </div>
        </div>
        <p className="ax-faq-foot">
          Rough estimate for planning. Real-world figures vary with scene content and camera settings — your Arxys team confirms the final sizing on the quote.
        </p>
      </details>

      {submitState.status === "ok" && !resultDismissed && (
        <RecommendationPanel state={submitState} />
      )}
    </div>
  );
}

// Vendor-gated camera-model typeahead + provenance chip. One instance per group
// card (keyed by the card), so its search scope/query state is per group. The
// alias-aware search runs through the searchCameraModels server action (which
// queries the camera_aliases_text-backed RPC). A minimal accessible combobox —
// no new dependency.
function CameraModelPicker({
  group,
  onLoad,
  onClear,
  touch,
}: {
  group: Group;
  onLoad: (id: string, r: CameraModelResult) => boolean;
  onClear: (id: string) => void;
  touch: () => void;
}) {
  const [vendor, setVendor] = useState<string>(() => group.cameraVendor ?? "");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CameraModelResult[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic request id so a slow earlier response can't overwrite a newer one.
  const seqRef = useRef(0);
  const listId = `cmp-list-${group.id}`;

  const runSearch = (v: string, q: string) => {
    const trimmed = q.trim();
    if (!v || !trimmed) {
      setResults([]);
      setSearched(false);
      setOpen(false);
      return;
    }
    const seq = ++seqRef.current;
    setLoading(true);
    searchCameraModels(v, trimmed)
      .then((rows) => {
        if (seq !== seqRef.current) return;
        setResults(rows);
        setActiveIndex(rows.length ? 0 : -1);
        setSearched(true);
        setLoading(false);
        setOpen(true);
      })
      .catch(() => {
        if (seq !== seqRef.current) return;
        setResults([]);
        setSearched(true);
        setLoading(false);
        setOpen(true);
      });
  };

  const onQueryChange = (val: string) => {
    touch();
    setQuery(val);
    setNotice(null);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => runSearch(vendor, val), 200);
  };

  const select = (r: CameraModelResult) => {
    const filled = onLoad(group.id, r);
    setNotice(
      filled
        ? null
        : `${r.model}: native resolution is above the largest bucket, so resolution was left unchanged.`,
    );
    setQuery("");
    setResults([]);
    setOpen(false);
    setSearched(false);
    setActiveIndex(-1);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open && results.length) {
        setOpen(true);
        return;
      }
      setActiveIndex((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      if (open && activeIndex >= 0 && results[activeIndex]) {
        e.preventDefault();
        select(results[activeIndex]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="ax-cmp">
      <select
        className="ax-cmp-vendor"
        aria-label="Camera vendor"
        value={group.cameraModel ? (group.cameraVendor ?? "") : vendor}
        onChange={(e) => {
          touch();
          const v = e.target.value;
          setVendor(v);
          setQuery("");
          setResults([]);
          setOpen(false);
          setSearched(false);
          setNotice(null);
          // Changing vendor while a model is loaded detaches it (the loaded
          // model belonged to the previous vendor scope).
          if (group.cameraModel) onClear(group.id);
        }}
      >
        <option value="">Vendor</option>
        {CAMERA_VENDORS.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>

      {group.cameraModel ? (
        <span
          className="ax-cmp-chip"
          data-modified={group.cameraModelModified || undefined}
        >
          from {group.cameraVendor} {group.cameraModel}
          {group.cameraModelModified ? " · modified" : ""}
          <button
            type="button"
            className="ax-cmp-x"
            aria-label={`Detach ${group.cameraVendor} ${group.cameraModel}`}
            onClick={() => {
              touch();
              onClear(group.id);
              setVendor(group.cameraVendor ?? "");
            }}
          >
            ×
          </button>
        </span>
      ) : (
        <div className="ax-cmp-search">
          <input
            type="text"
            className="ax-cmp-input"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              open && activeIndex >= 0 && results[activeIndex]
                ? `${listId}-opt-${activeIndex}`
                : undefined
            }
            disabled={!vendor}
            placeholder={vendor ? "Search model…" : "Pick a vendor"}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => {
              if (results.length) setOpen(true);
            }}
            onBlur={() => {
              if (timerRef.current) clearTimeout(timerRef.current);
              // Defer the close so a mousedown on an option still registers.
              setTimeout(() => setOpen(false), 120);
            }}
          />
          {open && (query.trim() !== "" || loading) && (
            <ul className="ax-cmp-list" id={listId} role="listbox">
              {loading && results.length === 0 ? (
                <li className="ax-cmp-empty">Searching…</li>
              ) : results.length === 0 ? (
                searched ? <li className="ax-cmp-empty">No models found</li> : null
              ) : (
                results.map((r, i) => (
                  <li
                    key={r.id}
                    id={`${listId}-opt-${i}`}
                    role="option"
                    aria-selected={i === activeIndex}
                    className={"ax-cmp-opt" + (i === activeIndex ? " active" : "")}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      select(r);
                    }}
                    onMouseEnter={() => setActiveIndex(i)}
                  >
                    <span className="ax-cmp-opt-m">{r.model}</span>
                    <span className="ax-cmp-opt-d">
                      {bucketLabelForRow(r)} · {r.sensorCount}{" "}
                      {r.sensorCount === 1 ? "sensor" : "sensors"}
                    </span>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}
      {notice && <span className="ax-cmp-notice">{notice}</span>}
    </div>
  );
}

// The Video Streams cell. No model → the original direct-cameras input (kept
// byte-identical to pre-feature behavior). Model loaded → the decomposition
// "units × sensors = cameras", where cameras is derived/read-only, units is the
// user's free input, and sensors is read-only-by-default with an edit toggle.
function CamerasField({
  group,
  getDraft,
  setDraft,
  clearDraft,
  touch,
  updateGroup,
  setUnits,
  setSensorsPerCamera,
}: {
  group: Group;
  getDraft: (key: string, fallback: number) => string;
  setDraft: (key: string, value: string) => void;
  clearDraft: (key: string) => void;
  touch: () => void;
  updateGroup: (id: string, patch: Partial<Group>) => void;
  setUnits: (id: string, units: number) => void;
  setSensorsPerCamera: (id: string, sensors: number) => void;
}) {
  const [editingSensors, setEditingSensors] = useState(false);

  if (!group.cameraModel) {
    return (
      <div className="ax-f wc">
        <label className="ax-fl">
          Video Streams
          <Tooltip text="How many cameras (camera feeds) share these same settings. Every number below — bandwidth, storage — multiplies by this count." />
        </label>
        <input
          type="number"
          min={1}
          max={9999}
          value={getDraft(`${group.id}.cameras`, group.cameras)}
          onChange={(e) => {
            setDraft(`${group.id}.cameras`, e.target.value);
            touch();
            const n = parseInt(e.target.value, 10);
            if (!isNaN(n)) {
              updateGroup(group.id, { cameras: Math.max(1, Math.min(9999, n)) });
            }
          }}
          onBlur={(e) => {
            clearDraft(`${group.id}.cameras`);
            const n = parseInt(e.target.value, 10);
            updateGroup(group.id, {
              cameras: isNaN(n) ? 1 : Math.max(1, Math.min(9999, n)),
            });
          }}
          style={{ textAlign: "center" }}
        />
      </div>
    );
  }

  return (
    <div className="ax-f wc wc-model">
      <label className="ax-fl">
        Video Streams
        <Tooltip text="Units of this camera model. Total streams = units × sensors per camera; every number below multiplies by that total. Editing sensors overrides the model's value." />
      </label>
      <div className="ax-units-row">
        <input
          type="number"
          min={1}
          max={9999}
          aria-label={`Units of ${group.cameraModel}`}
          value={getDraft(`${group.id}.units`, group.units)}
          onChange={(e) => {
            setDraft(`${group.id}.units`, e.target.value);
            touch();
            const n = parseInt(e.target.value, 10);
            if (!isNaN(n)) setUnits(group.id, Math.max(1, Math.min(9999, n)));
          }}
          onBlur={(e) => {
            clearDraft(`${group.id}.units`);
            const n = parseInt(e.target.value, 10);
            setUnits(group.id, isNaN(n) ? 1 : Math.max(1, Math.min(9999, n)));
          }}
          style={{ width: 52, textAlign: "center" }}
        />
        <span className="ax-units-x">units ×</span>
        {editingSensors ? (
          <input
            type="number"
            min={1}
            max={64}
            autoFocus
            aria-label={`Sensors per camera for ${group.cameraModel}`}
            value={getDraft(`${group.id}.sensors`, group.sensorsPerCamera)}
            onChange={(e) => {
              setDraft(`${group.id}.sensors`, e.target.value);
              touch();
              const n = parseInt(e.target.value, 10);
              if (!isNaN(n)) setSensorsPerCamera(group.id, Math.max(1, Math.min(64, n)));
            }}
            onBlur={(e) => {
              clearDraft(`${group.id}.sensors`);
              const n = parseInt(e.target.value, 10);
              setSensorsPerCamera(group.id, isNaN(n) ? 1 : Math.max(1, Math.min(64, n)));
              setEditingSensors(false);
            }}
            style={{ width: 44, textAlign: "center" }}
          />
        ) : (
          <button
            type="button"
            className="ax-sensor-ed"
            title="Edit sensors per camera"
            onClick={() => setEditingSensors(true)}
          >
            {group.sensorsPerCamera} {group.sensorsPerCamera === 1 ? "sensor" : "sensors"}
          </button>
        )}
        <span className="ax-units-eq">= {group.cameras}</span>
      </div>
    </div>
  );
}

function RecommendationPanel({
  state,
}: {
  state: Extract<SubmissionState, { status: "ok" }>;
}) {
  const { recommendation } = state;
  const { winner } = recommendation;
  const familySlug = productGroupToFamilySlug(winner.productGroup);

  const runnerUps = recommendation.alternatives.slice(0, 2);
  const headroom = pickHeadroomOption(winner, recommendation.alternatives);

  return (
    <div className="ax-rec">
      <div className="ax-rec-h">Recommended configuration</div>

      {/* Winner */}
      <div className="ax-rec-w">
        <span className="ax-rec-units">{winner.units} ×</span>
        {familySlug ? (
          <Link
            href={`/price-book/${familySlug}`}
            className="ax-rec-model ax-rec-model-link"
          >
            {winner.productGroup}
          </Link>
        ) : (
          <span className="ax-rec-model">{winner.productGroup}</span>
        )}
      </div>
      <div className="ax-rec-cov">
        <div>
          <span className="ax-rec-l">Cameras covered</span>
          <span className="ax-rec-v">
            {winner.coveredCameras.toLocaleString()} (request {recommendation.totals.cameras.toLocaleString()})
          </span>
        </div>
        <div>
          <span className="ax-rec-l">Storage covered</span>
          <span className="ax-rec-v">
            {formatNumber(winner.coveredStorageTb)} TB (request {formatStorageGb(recommendation.totals.storageGb)})
          </span>
        </div>
        <div>
          <span className="ax-rec-l">Driving dimension</span>
          <span className="ax-rec-v">{winner.driverDimension}</span>
        </div>
      </div>

      {/* Alternatives */}
      {runnerUps.length > 0 && (
        <div className="ax-rec-alt">
          <div className="ax-rec-alt-h">Alternatives</div>
          {runnerUps.map((alt) => {
            const altSlug = productGroupToFamilySlug(alt.productGroup);
            return (
              <div key={alt.sku} className="ax-rec-alt-row">
                <span className="ax-rec-units">{alt.units} ×</span>
                {altSlug ? (
                  <Link
                    href={`/price-book/${altSlug}`}
                    className="ax-rec-model ax-rec-model-link"
                  >
                    {alt.productGroup}
                  </Link>
                ) : (
                  <span className="ax-rec-model">{alt.productGroup}</span>
                )}
                <span className="ax-rec-alt-price">
                  ${alt.totalCostUsd.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Headroom / room to grow */}
      {headroom && (
        <div className="ax-rec-grow">
          <div className="ax-rec-alt-h">Room to grow</div>
          <div className="ax-rec-alt-row">
            <span className="ax-rec-units">{headroom.units} ×</span>
            {productGroupToFamilySlug(headroom.productGroup) ? (
              <Link
                href={`/price-book/${productGroupToFamilySlug(headroom.productGroup)}`}
                className="ax-rec-model ax-rec-model-link"
              >
                {headroom.productGroup}
              </Link>
            ) : (
              <span className="ax-rec-model">{headroom.productGroup}</span>
            )}
            <span className="ax-rec-alt-price">
              ${headroom.totalCostUsd.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "var(--td)", marginTop: 4 }}>
            Covers {headroom.coveredCameras.toLocaleString()} cameras · {formatNumber(headroom.coveredStorageTb)} TB
          </div>
        </div>
      )}

      {recommendation.warnings.length > 0 && (
        <ul className="ax-rec-warn">
          {recommendation.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
      <div className="ax-rec-actions">
        <a
          className="ax-pdf-btn"
          href={`/api/submissions/${state.submissionId}/pdf`}
          download
        >
          Download PDF
        </a>
      </div>
      <div className="ax-rec-conf">
        Submitted to Arxys sales — they&apos;ll be in touch. Submission ID{" "}
        <code>{state.submissionId}</code>.
      </div>
    </div>
  );
}
