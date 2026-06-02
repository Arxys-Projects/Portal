"use client";

import { useMemo, useState } from "react";
import type { QuickCompareModel, QuickCompareSpec, QuickCompareSection } from "@/lib/videox-compare/types";
import { VMS_OPTIONS } from "@/lib/videox-compare/vms";
import type { VmsId } from "@/lib/videox-compare/vms";

type Props = {
  models: QuickCompareModel[];
  specs: QuickCompareSpec[];
  sections: { key: QuickCompareSection; label: string }[];
  footnote: string;
};

// Display value for a (model, spec) pair. Null/empty → em dash.
function cellValue(model: QuickCompareModel, spec: QuickCompareSpec): string {
  const raw = model[spec.key];
  if (raw === null || raw === undefined || raw === "") return "—";
  if (spec.type === "integer") return Number(raw).toLocaleString();
  return String(raw);
}

export function VideoxCompareForm({ models, specs, sections, footnote }: Props) {
  // Families checked for compare mode. 2+ checked → collapse to those columns.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // "Minimum cameras needed" quick filter (raw input string).
  const [minCameras, setMinCameras] = useState<string>("");
  // Active VMS selection for the validation sheet banner. Null = none selected.
  const [selectedVms, setSelectedVms] = useState<VmsId | null>(null);

  const compareMode = selected.size >= 2;
  const visibleModels = compareMode
    ? models.filter((m) => selected.has(m.modelFamily))
    : models;

  const minCamerasNum = (() => {
    const n = parseInt(minCameras, 10);
    return Number.isNaN(n) || n <= 0 ? null : n;
  })();

  function toggle(family: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(family)) next.delete(family);
      else next.add(family);
      return next;
    });
  }

  // In compare mode, a row is "different" when the visible models don't all
  // share the same displayed value.
  const diffKeys = useMemo(() => {
    const keys = new Set<string>();
    if (!compareMode) return keys;
    for (const spec of specs) {
      const values = new Set(visibleModels.map((m) => cellValue(m, spec)));
      if (values.size > 1) keys.add(spec.key);
    }
    return keys;
  }, [compareMode, specs, visibleModels]);

  const specsBySection = useMemo(() => {
    const map = new Map<QuickCompareSection, QuickCompareSpec[]>();
    for (const spec of specs) {
      const list = map.get(spec.section) ?? [];
      list.push(spec);
      map.set(spec.section, list);
    }
    return map;
  }, [specs]);

  const colCount = visibleModels.length + 1;

  return (
    <div id="arxys-vxc-root">
      {/* Header */}
      <div className="vxc-hdr">
        <div className="vxc-t">VideoX Model Quick Compare</div>
        <div className="vxc-st">
          Every VideoX V5 NVR model, side by side — specs, features, and
          capabilities at a glance.
        </div>
      </div>

      {/* Controls */}
      <div className="vxc-controls">
        <div className="vxc-filter">
          <label htmlFor="vxc-min-cameras" className="vxc-fl">
            Minimum cameras needed
          </label>
          <input
            id="vxc-min-cameras"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            placeholder="e.g. 150"
            value={minCameras}
            onChange={(e) => setMinCameras(e.target.value)}
            className="vxc-min-input"
          />
          {minCamerasNum !== null && (
            <button
              type="button"
              className="vxc-clear"
              onClick={() => setMinCameras("")}
            >
              Clear
            </button>
          )}
        </div>

        <div className="vxc-compare-ctl">
          {compareMode ? (
            <span className="vxc-compare-state">
              Comparing {selected.size} models
            </span>
          ) : selected.size === 1 ? (
            <span className="vxc-compare-hint">
              Select one more model to compare
            </span>
          ) : (
            <span className="vxc-compare-hint">
              Tick models to compare just those columns
            </span>
          )}
          {selected.size > 0 && (
            <button
              type="button"
              className="vxc-reset"
              onClick={() => setSelected(new Set())}
            >
              Show all models
            </button>
          )}
        </div>
      </div>

      {/* VMS toggle row */}
      <div className="vxc-vms-toggle" role="group" aria-label="VMS selection">
        {VMS_OPTIONS.map((vms) => (
          <button
            key={vms.id}
            type="button"
            className={selectedVms === vms.id ? "vxc-vms-pill vxc-vms-pill--active" : "vxc-vms-pill"}
            onClick={() => setSelectedVms(selectedVms === vms.id ? null : vms.id)}
            aria-pressed={selectedVms === vms.id}
          >
            {vms.name}
          </button>
        ))}
      </div>

      {/* VMS validation sheet banner */}
      {selectedVms !== null && (() => {
        const vms = VMS_OPTIONS.find((v) => v.id === selectedVms)!;
        return (
          <div className="vxc-vms-banner" role="region" aria-label="VMS validation information">
            <span className="vxc-vms-banner-text">
              VideoX V5 is validated for {vms.name} {vms.vmsProduct}
            </span>
            {vms.sheetUrl ? (
              <a
                className="vxc-vms-sheet-link"
                href={vms.sheetUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Download {vms.name} Validation Sheet ↗
              </a>
            ) : (
              <span className="vxc-vms-sheet-pending">Validation sheet coming soon</span>
            )}
          </div>
        );
      })()}

      {/* Table */}
      <div className="vxc-tw">
        <table className="vxc-tbl">
          <thead>
            <tr>
              <th className="vxc-th-label" scope="col">
                <span className="vxc-th-label-text">Specification</span>
              </th>
              {visibleModels.map((m) => {
                const below =
                  minCamerasNum !== null && m.maxCameras < minCamerasNum;
                return (
                  <th key={m.modelFamily} className="vxc-th-model" scope="col">
                    <label className="vxc-model-check">
                      <input
                        type="checkbox"
                        checked={selected.has(m.modelFamily)}
                        onChange={() => toggle(m.modelFamily)}
                        aria-label={`Compare ${m.modelFamily}`}
                      />
                      <span className="vxc-model-name">{m.modelFamily}</span>
                    </label>
                    {below && (
                      <span className="vxc-below-badge">Below requirement</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sections.map((section) => {
              const rows = specsBySection.get(section.key) ?? [];
              if (rows.length === 0) return null;
              return (
                <SectionGroup
                  key={section.key}
                  label={section.label}
                  rows={rows}
                  models={visibleModels}
                  diffKeys={diffKeys}
                  minCamerasNum={minCamerasNum}
                  colCount={colCount}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="vxc-footnote">{footnote}</p>
    </div>
  );
}

function SectionGroup({
  label,
  rows,
  models,
  diffKeys,
  minCamerasNum,
  colCount,
}: {
  label: string;
  rows: QuickCompareSpec[];
  models: QuickCompareModel[];
  diffKeys: Set<string>;
  minCamerasNum: number | null;
  colCount: number;
}) {
  return (
    <>
      <tr className="vxc-section-row">
        <th className="vxc-section-cell" scope="colgroup" colSpan={colCount}>
          {label}
        </th>
      </tr>
      {rows.map((spec) => {
        const isDiff = diffKeys.has(spec.key);
        return (
          <tr key={spec.key} className={isDiff ? "vxc-row vxc-row-diff" : "vxc-row"}>
            <th className="vxc-td-label" scope="row">
              <span className="vxc-label-text">{spec.label}</span>
              {spec.tooltip && (
                <span
                  className="vxc-info"
                  tabIndex={0}
                  role="note"
                  aria-label={spec.tooltip}
                >
                  ⓘ
                  <span className="vxc-tip" role="tooltip">
                    {spec.tooltip}
                  </span>
                </span>
              )}
            </th>
            {models.map((m) => {
              const camCell = spec.key === "maxCameras";
              const below =
                camCell &&
                minCamerasNum !== null &&
                m.maxCameras < minCamerasNum;
              return (
                <td
                  key={m.modelFamily}
                  className={below ? "vxc-td vxc-td-below" : "vxc-td"}
                >
                  {cellValue(m, spec)}
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}
