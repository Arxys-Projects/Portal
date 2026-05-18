"use client";

import { useMemo, useState } from "react";
import {
  CODECS,
  COMPLEXITIES,
  RESOLUTIONS,
  VMS_OPTIONS,
} from "@/lib/calculator/tables";
import {
  computeGroup,
  formatBandwidthMbps,
  formatStorageGb,
  type GroupInput,
} from "@/lib/calculator/compute";

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

export function CalculatorForm() {
  const [groups, setGroups] = useState<Group[]>([newGroup(1)]);
  const [retentionDays, setRetentionDays] = useState(30);
  const [vms, setVms] = useState<string>("");
  const [projectName, setProjectName] = useState("");

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
    return { bandwidthMbps, storageGb, cameras };
  }, [groupResults]);

  return (
    <div className="space-y-6">
      {/* Project metadata */}
      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-neutral-900">
          Project details
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Project name">
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Customer site"
              className={inputClass}
            />
          </Field>
          <Field label="Retention (days)">
            <input
              type="number"
              min={1}
              max={3650}
              value={retentionDays}
              onChange={(e) =>
                setRetentionDays(Math.max(1, parseInt(e.target.value || "0", 10)))
              }
              className={inputClass}
            />
          </Field>
          <Field label="VMS">
            <select
              value={vms}
              onChange={(e) => setVms(e.target.value)}
              className={inputClass}
            >
              <option value="">— Select —</option>
              {VMS_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      {/* Camera groups */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">
            Camera groups
          </h2>
          <button
            type="button"
            onClick={addGroup}
            className="rounded border border-blue-600 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50"
          >
            + Add group
          </button>
        </div>
        {groupResults.map(({ group, computed }, idx) => (
          <article
            key={group.id}
            className="rounded-lg border border-neutral-200 bg-white p-5"
          >
            <header className="mb-4 flex items-center justify-between">
              <input
                type="text"
                value={group.name}
                onChange={(e) =>
                  updateGroup(group.id, { name: e.target.value })
                }
                className="w-full max-w-xs rounded border border-transparent bg-white px-1 text-sm font-medium text-neutral-900 hover:border-neutral-300 focus:border-blue-500 focus:outline-none"
              />
              <div className="flex gap-1 text-xs text-neutral-500">
                <button
                  type="button"
                  onClick={() => duplicateGroup(group.id)}
                  className="rounded px-2 py-1 hover:bg-neutral-100"
                  title="Duplicate"
                >
                  Duplicate
                </button>
                {groups.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeGroup(group.id)}
                    className="rounded px-2 py-1 text-red-600 hover:bg-red-50"
                    title="Remove"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </header>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Cameras">
                <input
                  type="number"
                  min={1}
                  value={group.cameras}
                  onChange={(e) =>
                    updateGroup(group.id, {
                      cameras: Math.max(1, parseInt(e.target.value || "0", 10)),
                    })
                  }
                  className={inputClass}
                />
              </Field>
              <Field label="FPS">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={group.fps}
                  onChange={(e) =>
                    updateGroup(group.id, {
                      fps: Math.max(1, Math.min(60, parseInt(e.target.value || "0", 10))),
                    })
                  }
                  className={inputClass}
                />
              </Field>
              <Field label="Resolution">
                <select
                  value={group.resolutionIdx}
                  onChange={(e) =>
                    updateGroup(group.id, {
                      resolutionIdx: parseInt(e.target.value, 10),
                    })
                  }
                  className={inputClass}
                >
                  {RESOLUTIONS.map((r, i) => (
                    <option key={r.label} value={i}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Codec">
                <select
                  value={group.codecIdx}
                  onChange={(e) =>
                    updateGroup(group.id, { codecIdx: parseInt(e.target.value, 10) })
                  }
                  className={inputClass}
                >
                  {CODECS.map((c, i) => (
                    <option key={c.value} value={i}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Scene complexity">
                <select
                  value={group.complexityIdx}
                  onChange={(e) =>
                    updateGroup(group.id, {
                      complexityIdx: parseInt(e.target.value, 10),
                    })
                  }
                  className={inputClass}
                >
                  {COMPLEXITIES.map((c, i) => (
                    <option key={c.label} value={i}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Recording (% of day)">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={group.recordingPercent}
                  onChange={(e) =>
                    updateGroup(group.id, {
                      recordingPercent: clampPct(parseInt(e.target.value || "0", 10)),
                    })
                  }
                  className={inputClass}
                />
              </Field>
              <Field label="Motion (% activity)">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={group.motionPercent}
                  onChange={(e) =>
                    updateGroup(group.id, {
                      motionPercent: clampPct(parseInt(e.target.value || "0", 10)),
                    })
                  }
                  className={inputClass}
                />
              </Field>
              <Field label="Per-camera bitrate">
                <div className="px-3 py-2 text-sm text-neutral-700">
                  {formatBandwidthMbps(computed.bitrateMbps)}
                </div>
              </Field>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-neutral-100 pt-4 text-sm sm:grid-cols-3">
              <Metric label="Group bandwidth" value={formatBandwidthMbps(computed.bandwidthMbps)} />
              <Metric label="Group storage" value={formatStorageGb(computed.storageGb)} />
              <Metric
                label="Group raw storage"
                value={formatStorageGb(computed.rawStorageGb)}
                hint="before overhead"
              />
            </div>
          </article>
        ))}
      </section>

      {/* Totals */}
      <section className="rounded-lg border-2 border-blue-200 bg-blue-50 p-5">
        <h2 className="mb-4 text-sm font-semibold text-blue-900">Project totals</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Metric label="Total cameras" value={String(totals.cameras)} accent />
          <Metric
            label="Total bandwidth"
            value={formatBandwidthMbps(totals.bandwidthMbps)}
            accent
          />
          <Metric
            label="Total storage"
            value={formatStorageGb(totals.storageGb)}
            hint={`over ${retentionDays} days`}
            accent
          />
        </div>
      </section>
    </div>
  );
}

const inputClass =
  "block w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-600">{label}</span>
      {children}
    </label>
  );
}

function Metric({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div
        className={
          "text-xs font-medium " + (accent ? "text-blue-700" : "text-neutral-500")
        }
      >
        {label}
      </div>
      <div
        className={
          "text-lg font-semibold " +
          (accent ? "text-blue-900" : "text-neutral-900")
        }
      >
        {value}
      </div>
      {hint ? (
        <div className="text-xs text-neutral-500">{hint}</div>
      ) : null}
    </div>
  );
}
