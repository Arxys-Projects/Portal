"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
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
  recordingPercent: number;
  motionPercent: number;
};

function freshId(): string {
  return `g-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function newGroup(seqNumber: number): Group {
  return {
    id: freshId(),
    name: `Camera Group ${seqNumber}`,
    cameras: 1,
    resolutionIdx: 14, // 4MP (2560×1440) — same default as legacy
    codecIdx: 0,       // H.265
    complexityIdx: 1,  // Medium
    fps: 15,
    recordingPercent: 100,
    motionPercent: 50,
  };
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
}: {
  previousProjectNames?: string[];
  initialState?: CalculatorInitialState;
  sourceSubmissionId?: string;
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

  const [submitState, submitAction, isSubmitting] = useActionState<SubmissionState, unknown>(
    submitCalculation,
    INITIAL_STATE,
  );

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
          motionPercent: g.motionPercent,
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
          <div className="ax-sl">Total Cameras</div>
          <div className="ax-sv bl">{totals.cameras}</div>
        </div>
        <div className="ax-s cy">
          <div className="ax-sl">Total Bandwidth</div>
          <div className="ax-sv cy">{formatBandwidthMbps(totals.bandwidthMbps)}</div>
        </div>
        <div className="ax-s gn">
          <div className="ax-sl">Total Storage</div>
          <div className="ax-sv gn">{formatStorageGb(totals.storageGb)}</div>
          <div style={{ fontSize: 11, color: "var(--td)", marginTop: 4 }}>
            (includes 20% overhead)
          </div>
        </div>
      </div>

      {/* Global settings */}
      <div className="ax-gl">
        <div className="ax-f" style={{ minWidth: 160 }}>
          <label className="ax-fl">Project Name</label>
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
        <div className="ax-f" style={{ minWidth: 160 }}>
          <label className="ax-fl">Which VMS?</label>
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
          <label className="ax-fl">Add-ons</label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
            <input
              type="checkbox"
              checked={addOnFailoverRecorder}
              onChange={(e) => { touch(); setAddOnFailoverRecorder(e.target.checked); }}
            />
            Failover Recorder
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
            <input
              type="checkbox"
              checked={addOnManagementServer}
              onChange={(e) => { touch(); setAddOnManagementServer(e.target.checked); }}
            />
            Management Server
          </label>
        </div>

        <div style={{ marginLeft: "auto" }}>
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

      {/* Submit button — above camera groups, disabled until first interaction */}
      <div className="ax-save">
        <button
          type="button"
          className="ax-save-btn"
          disabled={!hasInteracted || isSubmitting}
          onClick={() => {
            setResultDismissed(false);
            submitAction({
              projectName: projectName.trim() || null,
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
                recordingPercent: g.recordingPercent,
                motionPercent: g.motionPercent,
              })),
            });
          }}
        >
          {isSubmitting ? "Saving…" : "Save & request quote"}
        </button>
        <span className="ax-save-hint">
          Configure a camera group below, then save to notify Arxys sales.
        </span>
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
                <label className="ax-fl">Video Streams</label>
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
                <label className="ax-fl">Resolution</label>
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
                <label className="ax-fl">FPS</label>
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
                <label className="ax-fl">Complexity</label>
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
              <div className="ax-f wh">
                <label className="ax-fl">
                  Hrs/Day
                  <Tooltip text="Hours per day cameras record." side="r" />
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={getDraft(
                      `${group.id}.recording`,
                      Math.round((group.recordingPercent / 100) * 24),
                    )}
                    onChange={(e) => {
                      setDraft(`${group.id}.recording`, e.target.value);
                      touch();
                      const h = parseInt(e.target.value, 10);
                      if (!isNaN(h)) {
                        updateGroup(group.id, {
                          recordingPercent: Math.round(
                            (Math.max(1, Math.min(24, h)) / 24) * 100,
                          ),
                        });
                      }
                    }}
                    onBlur={(e) => {
                      clearDraft(`${group.id}.recording`);
                      const h = parseInt(e.target.value, 10);
                      updateGroup(group.id, {
                        recordingPercent: Math.round(
                          (isNaN(h) ? 24 : Math.max(1, Math.min(24, h))) / 24 * 100,
                        ),
                      });
                    }}
                    style={{ width: 56, textAlign: "center" }}
                  />
                  <span style={{ fontSize: 12, color: "var(--td)" }}>hrs</span>
                </div>
              </div>
              <div className="ax-f wm">
                <label className="ax-fl">
                  Motion
                  <Tooltip text="Scene motion level" side="r" />
                </label>
                <div className="ax-sr">
                  <input
                    type="range"
                    min={1}
                    max={100}
                    value={group.motionPercent}
                    aria-label={`Scene motion level for ${group.name}, ${group.motionPercent}%`}
                    onChange={(e) =>
                      updateGroup(group.id, {
                        motionPercent: parseInt(e.target.value, 10),
                      })
                    }
                    style={{ maxWidth: 80 }}
                  />
                  <span className="ax-svl">{group.motionPercent}%</span>
                </div>
              </div>
            </div>

            <div className="ax-cr">
              <div className="ax-ci">
                <span className="ax-cil">Bitrate:</span>
                <span className="ax-civ" style={{ color: "var(--pu)" }}>
                  {computed.bitrateMbps >= 1
                    ? `${formatNumber(computed.bitrateMbps)} Mbps`
                    : `${Math.round(computed.bitrateMbps * 1000)} Kbps`}
                </span>
              </div>
              <div className="ax-ci">
                <span className="ax-cil">Bandwidth:</span>
                <span className="ax-civ" style={{ color: "var(--cy)" }}>
                  {formatBandwidthMbps(computed.bandwidthMbps)}
                </span>
              </div>
              <div className="ax-ci">
                <span className="ax-cil">Storage:</span>
                <span className="ax-civ" style={{ color: "var(--gn)" }}>
                  {formatStorageGb(computed.storageGb)}
                </span>
              </div>
              <div className="ax-ci">
                <span className="ax-cil">Daily:</span>
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

      <div className="ax-fn">
        <strong>Note:</strong> Storage includes ~20% overhead for VMS best practices.
      </div>

      {submitState.status === "error" && !resultDismissed && (
        <div className="ax-rec-err">{submitState.error}</div>
      )}

      {submitState.status === "ok" && !resultDismissed && (
        <RecommendationPanel state={submitState} />
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
