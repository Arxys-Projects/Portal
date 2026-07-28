"use client";

// The `json-rows` editor — a jsonb array-of-records edited as a table of typed
// cells (ADR 0097 §4d; ADR 0100). Its first instance is
// appliance_specs.camera_matrix.
//
// WHY NOT A JSON TEXTAREA. ADR 0090 logged "the camera matrix's internal shape
// is unvalidated JSONB" as a standing negative. A textarea would leave a missing
// key, a renamed key or a stray trailing comma to be caught — or not — by
// whoever reads the rendered datasheet. Typed cells make the shape the only
// thing that can be entered, and the zod builder refuses anything else that
// reaches the column by another route.
//
// ONE HIDDEN INPUT. The rows live in React state and serialise into a single
// hidden input named after the column, so the flat one-input-per-column FormData
// model the actions and `specInputFromFormData` rely on is undisturbed: the
// server sees a string, exactly as it does for every other kind.
//
// AN UNREADABLE VALUE IS PRESERVED, NEVER DISCARDED. If the stored value cannot
// be read as rows (hand-written service_role JSON, a shape from before a column
// was renamed), the editor does not silently start empty — it keeps the original
// string in the hidden input, says so, and lets the save be refused by the
// schema. Replacing it is an explicit click.

import { useState } from "react";
import { Button, Select } from "@/app/(app)/_components/ui";
import type { SpecJsonColumn, SpecJsonRowsField } from "./fields";

/** One row while it is being edited: every cell is a display string. */
type CellValues = Record<string, string>;

const CELL_CLASS =
  "block w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink " +
  "focus:border-arxys-navy focus:outline-none focus:ring-2 focus:ring-arxys-navy/15";

function emptyRow(columns: readonly SpecJsonColumn[]): CellValues {
  return Object.fromEntries(columns.map((c) => [c.key, ""]));
}

/**
 * The stored JSON string as editable rows.
 *
 * `readable: false` means the value is something this editor cannot represent —
 * kept verbatim so a save cannot quietly drop it.
 */
function rowsFromJson(
  json: string,
  columns: readonly SpecJsonColumn[],
): { readable: boolean; rows: CellValues[] } {
  const trimmed = json.trim();
  if (trimmed === "") return { readable: true, rows: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { readable: false, rows: [] };
  }
  if (!Array.isArray(parsed)) return { readable: false, rows: [] };
  const rows: CellValues[] = [];
  for (const entry of parsed) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      return { readable: false, rows: [] };
    }
    const record = entry as Record<string, unknown>;
    // An extra key would be dropped by rendering only the known columns, and
    // dropping data silently is the one thing this editor must not do.
    const extra = Object.keys(record).filter(
      (k) => !columns.some((c) => c.key === k),
    );
    if (extra.length > 0) return { readable: false, rows: [] };
    rows.push(
      Object.fromEntries(
        columns.map((c) => {
          const value = record[c.key];
          return [c.key, value === null || value === undefined ? "" : String(value)];
        }),
      ),
    );
  }
  return { readable: true, rows };
}

/** Rows back to the hidden input's value. No rows means no value: null, not []. */
function jsonFromRows(rows: CellValues[]): string {
  return rows.length === 0 ? "" : JSON.stringify(rows);
}

export function JsonRowsEditor({
  field,
  initialJson,
  onChange,
}: {
  field: SpecJsonRowsField;
  /** The stored value as a JSON string; "" when the column is null. */
  initialJson: string;
  /** Called with the serialised value when the field is one of the live ones. */
  onChange?: (json: string) => void;
}) {
  const [state, setState] = useState(() => {
    const read = rowsFromJson(initialJson, field.columns);
    return { rows: read.rows, unreadable: read.readable ? null : initialJson };
  });

  const commit = (rows: CellValues[]) => {
    setState({ rows, unreadable: null });
    onChange?.(jsonFromRows(rows));
  };

  const setCell = (index: number, key: string, value: string) =>
    commit(state.rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)));

  const addRow = () => commit([...state.rows, emptyRow(field.columns)]);
  const removeRow = (index: number) =>
    commit(state.rows.filter((_, i) => i !== index));

  const hiddenValue = state.unreadable ?? jsonFromRows(state.rows);

  return (
    <div className="mt-1">
      <input type="hidden" name={field.name} value={hiddenValue} readOnly />

      {state.unreadable !== null ? (
        <div className="rounded-[14px] border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-bold">
            This value is not in the expected row shape, so it cannot be edited
            here.
          </p>
          <p className="mt-1">
            It is being kept exactly as it is stored, and the save will be
            refused until it is replaced. Stored value:
          </p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-white/70 p-2 font-mono text-xs">
            {state.unreadable}
          </pre>
          <div className="mt-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => commit([])}>
              Replace with an empty {field.label.toLowerCase()}
            </Button>
          </div>
        </div>
      ) : state.rows.length === 0 ? (
        <p className="rounded-[14px] border border-dashed border-line px-3 py-4 text-sm text-ink-soft">
          {field.emptyLabel}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[14px] border border-line">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {field.columns.map((column) => (
                  <th
                    key={column.key}
                    className="border-b border-line bg-panel px-2.5 py-2 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-[#3f4b5b]"
                  >
                    {column.label}
                  </th>
                ))}
                <th className="w-px border-b border-line bg-panel px-2.5 py-2">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((row, index) => (
                // Rows have no stable id — the index is the identity here, and
                // a row is only ever added at the end or removed whole.
                <tr key={index}>
                  {field.columns.map((column) => (
                    <td
                      key={column.key}
                      className="border-b border-line-soft px-2.5 py-2 align-top"
                    >
                      <label className="sr-only" htmlFor={`${field.name}-${index}-${column.key}`}>
                        {`${column.label}, row ${index + 1}`}
                      </label>
                      {column.kind === "enum" ? (
                        <Select
                          id={`${field.name}-${index}-${column.key}`}
                          value={row[column.key] ?? ""}
                          onChange={(e) => setCell(index, column.key, e.target.value)}
                        >
                          <option value="">— select —</option>
                          {(column.options ?? []).map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <input
                          id={`${field.name}-${index}-${column.key}`}
                          type={column.kind === "int-positive" ? "number" : "text"}
                          min={column.kind === "int-positive" ? 1 : undefined}
                          step={column.kind === "int-positive" ? 1 : undefined}
                          maxLength={column.kind === "text" ? column.maxLength : undefined}
                          placeholder={column.placeholder}
                          value={row[column.key] ?? ""}
                          onChange={(e) => setCell(index, column.key, e.target.value)}
                          className={CELL_CLASS}
                        />
                      )}
                    </td>
                  ))}
                  <td className="border-b border-line-soft px-2.5 py-2 align-top">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => removeRow(index)}
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {state.unreadable === null ? (
        <div className="mt-2">
          <Button type="button" variant="secondary" size="sm" onClick={addRow}>
            {field.addRowLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
