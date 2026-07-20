"use client";

// VideoX Quick Compare — the model-vs-model selection utility (ADR 0084 —
// Compare split). The page header lives in page.tsx (standard back-link + ink
// H1 pattern); the VMS vendor pills + validation banner moved to the VMS
// Server Comparison page (ADR 0085). The dense spec matrix keeps its scoped
// stylesheet for the sticky-first-column / striping / tooltip machinery.

import { useMemo, useState } from "react";
import type { QuickCompareModel, QuickCompareSpec, QuickCompareSection } from "@/lib/videox-compare/types";
import { Button } from "@/app/(app)/_components/ui";

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
      {/* Controls */}
      <div className="mt-4.5 flex flex-wrap items-end justify-between gap-4 rounded-[14px] border border-line bg-surface px-4.5 py-4">
        <div className="flex flex-col items-start gap-1.5">
          <label
            htmlFor="vxc-min-cameras"
            className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-[#8b929b]"
          >
            Minimum camera streams needed
          </label>
          <div className="flex items-center gap-2.5">
            <input
              id="vxc-min-cameras"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              placeholder="e.g. 150"
              value={minCameras}
              onChange={(e) => setMinCameras(e.target.value)}
              className="h-10 w-36 rounded-lg border border-[#b9c4d5] px-3 text-sm text-ink outline-none transition-colors focus:border-arxys-navy"
            />
            {minCamerasNum !== null && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setMinCameras("")}
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3.5 pb-1">
          {compareMode ? (
            <span className="text-[13px] font-semibold text-arxys-navy">
              Comparing {selected.size} models
            </span>
          ) : selected.size === 1 ? (
            <span className="text-[13px] text-ink-soft">
              Select one more model to compare
            </span>
          ) : (
            <span className="text-[13px] text-ink-soft">
              Tick models to compare just those columns
            </span>
          )}
          {selected.size > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSelected(new Set())}
            >
              Show all models
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="vxc-tw mt-4">
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
