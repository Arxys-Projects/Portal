"use client";

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

function newGroup(seqNumber: number): Group {
  return {
    id: `g-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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

function Tooltip({ text, side = "l" }: { text: string; side?: "l" | "r" }) {
  return (
    <span className={"ax-tip" + (side === "r" ? " ax-tip-r" : "")}>
      <InfoIcon />
      <span className="ax-tt">{text}</span>
    </span>
  );
}

export function CalculatorForm() {
  const [groups, setGroups] = useState<Group[]>([newGroup(1)]);
  const [retentionDays, setRetentionDays] = useState(30);
  const [vms, setVms] = useState<string>("");
  const [projectName, setProjectName] = useState("");
  const [submitState, submitAction, isSubmitting] = useActionState<SubmissionState, unknown>(
    submitCalculation,
    INITIAL_STATE,
  );

  const addGroup = () =>
    setGroups((p) => [...p, newGroup(p.length + 1)]);
  const removeGroup = (id: string) =>
    setGroups((p) => (p.length > 1 ? p.filter((g) => g.id !== id) : p));
  const duplicateGroup = (id: string) =>
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
  const updateGroup = (id: string, patch: Partial<Group>) =>
    setGroups((p) => p.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const reset = () => {
    setGroups([newGroup(1)]);
    setRetentionDays(30);
    setVms("");
    setProjectName("");
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
            maxLength={50}
            placeholder="e.g. Main Campus"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
          />
        </div>
        <div className="ax-f" style={{ minWidth: 160 }}>
          <label className="ax-fl">Which VMS?</label>
          <select value={vms} onChange={(e) => setVms(e.target.value)}>
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
              value={retentionDays}
              onChange={(e) =>
                setRetentionDays(
                  Math.max(1, Math.min(730, parseInt(e.target.value || "1", 10))),
                )
              }
              style={{ width: 80 }}
            />
            <span style={{ color: "var(--td)", fontSize: 13 }}>days</span>
          </div>
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
                  value={group.cameras}
                  onChange={(e) =>
                    updateGroup(group.id, {
                      cameras: Math.max(
                        1,
                        Math.min(9999, parseInt(e.target.value || "1", 10)),
                      ),
                    })
                  }
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
                  value={group.fps}
                  onChange={(e) =>
                    updateGroup(group.id, {
                      fps: Math.max(
                        1,
                        Math.min(60, parseInt(e.target.value || "1", 10)),
                      ),
                    })
                  }
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
                    value={Math.round((group.recordingPercent / 100) * 24)}
                    onChange={(e) => {
                      const h = Math.max(
                        1,
                        Math.min(24, parseInt(e.target.value || "1", 10)),
                      );
                      updateGroup(group.id, {
                        recordingPercent: Math.round((h / 24) * 100),
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
                <td className="m">{group.recordingPercent}%</td>
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

      <div className="ax-save">
        <button
          type="button"
          className="ax-save-btn"
          disabled={isSubmitting || totals.cameras <= 0}
          onClick={() =>
            submitAction({
              projectName: projectName.trim() || null,
              vms: vms || null,
              retentionDays,
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
            })
          }
        >
          {isSubmitting ? "Saving…" : "Save & request quote"}
        </button>
        <span className="ax-save-hint">
          We&apos;ll save this calculation and notify Arxys sales.
        </span>
      </div>

      {submitState.status === "error" && (
        <div className="ax-rec-err">{submitState.error}</div>
      )}

      {submitState.status === "ok" && (
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
  return (
    <div className="ax-rec">
      <div className="ax-rec-h">Recommended configuration</div>
      <div className="ax-rec-w">
        <span className="ax-rec-units">{winner.units} ×</span>
        <span className="ax-rec-model">{winner.productGroup}</span>
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
