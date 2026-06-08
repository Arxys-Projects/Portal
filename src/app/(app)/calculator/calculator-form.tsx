"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  CODECS,
  COMPLEXITIES,
  RESOLUTIONS,
  VMS_OPTIONS,
} from "@/lib/calculator/tables";
import {
  computeGroup,
  formatBandwidthMbps,
  formatNumber,
  formatStorageGb,
  type GroupInput,
} from "@/lib/calculator/compute";
import { submitCalculation, type SubmissionState } from "./actions";
import { productGroupToFamilySlug } from "@/lib/price-book/families";
import { pickHeadroomOption } from "@/lib/recommend/headroom";
import type { CalculatorInitialState, InitialGroup } from "@/lib/calculator/rehydrate";
import {
  BarsIcon,
  CameraIcon,
  DuplicateIcon,
  InfoIcon,
  PlusIcon,
  ResetIcon,
  StorageIcon,
  TrashIcon,
} from "./icons";

const INITIAL_STATE: SubmissionState = { status: "idle" };

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
  };
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

export function CalculatorForm({
  previousProjectNames = [],
  initialState,
  sourceSubmissionId,
  isInternal = false,
  partnerCompanyNames = [],
}: {
  previousProjectNames?: string[];
  initialState?: CalculatorInitialState;
  sourceSubmissionId?: string;
  // Phase 7 Step 1 — internal users get a target-partner field to run a calc on
  // behalf of a partner. Never rendered for external partners.
  isInternal?: boolean;
  partnerCompanyNames?: string[];
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
  // is always blank on a rehydrated revision — the rep retypes it if needed.
  const [onBehalfOf, setOnBehalfOf] = useState("");
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

  // The action's own pending flag is the saving state: it flips true the moment
  // submitAction is dispatched and false when the action resolves, so no
  // separate isSaving state (or an effect to reset it) is needed.
  const [submitState, submitAction, isSaving] = useActionState<SubmissionState, unknown>(
    submitCalculation,
    INITIAL_STATE,
  );

  const resultRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (submitState.status === "ok" && !resultDismissed) {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [submitState.status, submitState, resultDismissed]);

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
  const reset = () => {
    setGroups([newGroup(1)]);
    setRetentionDays(30);
    setVms("");
    setProjectName("");
    setOnBehalfOf("");
    setHasInteracted(false);
    setResultDismissed(true);
    setAddOnFailoverRecorder(false);
    setAddOnManagementServer(false);
    setRevisionSourceId(null);
    setNumericDrafts(new Map());
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

      {/* Global settings */}
      <div className="ax-gl">
        <div className="ax-f" style={{ minWidth: 160 }}>
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
        {isInternal && (
          <div className="ax-f" style={{ minWidth: 180 }}>
            <label className="ax-fl">
              On behalf of
              <Tooltip text="Internal only. Type a partner's company to roll this calc and its deal up to them. Leave blank to file under your own account." />
            </label>
            <input
              type="text"
              list="ax-partner-names"
              maxLength={120}
              placeholder="Partner company"
              value={onBehalfOf}
              onChange={(e) => { touch(); setOnBehalfOf(e.target.value); }}
            />
            {partnerCompanyNames.length > 0 && (
              <datalist id="ax-partner-names">
                {partnerCompanyNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            )}
            {onBehalfOf.trim() &&
            !partnerCompanyNames.some(
              (n) => n.toLowerCase() === onBehalfOf.trim().toLowerCase(),
            ) ? (
              <span style={{ fontSize: 11, color: "var(--td)", marginTop: 4 }}>
                No matching partner — a new Pipedrive organization will be created.
              </span>
            ) : null}
          </div>
        )}
        <div className="ax-f" style={{ minWidth: 160 }}>
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
        <div className="ax-f" style={{ minWidth: 130 }}>
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

        {/* Add-on toggles */}
        <div className="ax-f" style={{ gap: 8 }}>
          <label className="ax-fl">
            Add-ons
            <Tooltip text="Optional extra hardware for resilience and scale. Tick what the project needs — we'll factor it into the quote." />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
            <input
              type="checkbox"
              checked={addOnFailoverRecorder}
              onChange={(e) => { touch(); setAddOnFailoverRecorder(e.target.checked); }}
            />
            Failover Recorder
            <Tooltip text="A standby recorder that automatically takes over if a main recorder fails, so you keep recording during an outage." />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
            <input
              type="checkbox"
              checked={addOnManagementServer}
              onChange={(e) => { touch(); setAddOnManagementServer(e.target.checked); }}
            />
            Management Server
            <Tooltip text="A dedicated server that runs the VMS software and management, separate from the recorders. Common on larger systems for performance and easier administration." />
          </label>
        </div>

        <div className="ax-save" style={{ marginLeft: "auto", marginTop: 0 }}>
          <span className="ax-save-hint">
            Configure all cameras, then save to send the project to Arxys for review and a quote.
          </span>
          <button
            type="button"
            className="ax-save-btn"
            disabled={!hasInteracted || isSaving}
            data-saving={isSaving || undefined}
            onClick={() => {
              setResultDismissed(false);
              submitAction({
                projectName: projectName.trim() || null,
                onBehalfOf: isInternal ? (onBehalfOf.trim() || null) : null,
                vms: vms || null,
                retentionDays,
                addOnFailoverRecorder,
                addOnManagementServer,
                isRevision: Boolean(revisionSourceId),
                sourceSubmissionId: revisionSourceId,
                groups: groups.map((g) => ({
                  name: g.name,
                  cameras: g.cameras,
                  resolutionIdx: g.resolutionIdx,
                  codecIdx: g.codecIdx,
                  complexityIdx: g.complexityIdx,
                  fps: g.fps,
                  recordingMode: g.recordingMode,
                  recordingPercent: g.recordingPercent,
                  // Constant pins motion% to 100; the server re-enforces this.
                  motionPercent: g.recordingMode === "constant" ? 100 : g.motionPercent,
                })),
              });
            }}
          >
            {isSaving && (
              <svg className="ax-save-spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            )}
            {isSaving ? "Saving…" : "Save & request quote"}
          </button>
          <button
            type="button"
            className="ax-ib"
            onClick={reset}
            style={{ gap: 6 }}
          >
            <ResetIcon /> Reset
          </button>
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
                      updateGroup(group.id, {
                        cameras: Math.max(1, Math.min(9999, n)),
                      });
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
              <div className="ax-f wr">
                <label className="ax-fl">
                  Resolution
                  <Tooltip text="The camera's image size in megapixels (e.g. 4MP). Higher resolution means sharper, more detailed footage — and more storage and bandwidth to match." side="r" />
                </label>
                <select
                  value={group.resolutionIdx}
                  onChange={(e) =>
                    updateGroup(group.id, {
                      resolutionIdx: parseInt(e.target.value, 10),
                    })
                  }
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

      {submitState.status === "error" && !resultDismissed && (
        <div className="ax-rec-err">{submitState.error}</div>
      )}

      {submitState.status === "ok" && !resultDismissed && (
        <div ref={resultRef}>
          <RecommendationPanel state={submitState} />
        </div>
      )}
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
