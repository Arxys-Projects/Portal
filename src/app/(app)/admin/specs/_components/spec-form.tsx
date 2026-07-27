"use client";

// The 43-field product_specs editor (design §3 sections, §4 safety design).
//
// Inputs are rendered by walking SPEC_SECTIONS, so this component never lists a
// column name of its own: adding a field to fields.ts renders it here and
// validates it in schema.ts, together. That is the drift protection ADR 0096's
// "Negative" section asks for.
//
// Only the seven fields the preview and the cross-field rules read are held in
// React state; the other 36 are uncontrolled with defaultValue. That keeps the
// reactive surface to exactly the values whose consequences need to be visible
// as they are typed, and leaves the rest as plain form fields the browser owns.

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button, Select } from "@/app/(app)/_components/ui";
import {
  RAID_LEVEL_OPTIONS,
  SPEC_SECTIONS,
  specRuleViolations,
  specWarnings,
  toNumberOrNull,
  type SpecField,
} from "../fields";
import type { SpecActionState } from "../actions";
import { NetUsablePreview, type CapacityInputs } from "./net-usable-preview";

const INITIAL: SpecActionState = { status: "idle" };

/** The fields whose values drive the live preview and the live rule checks. */
const LIVE_FIELDS = [
  "storage_raw_tb",
  "hdd_count",
  "drive_bays",
  "raid_level_display",
  "raid_level_alt_display",
  "max_cameras",
  "max_cameras_h265",
] as const;

type LiveField = (typeof LIVE_FIELDS)[number];
type LiveValues = Record<LiveField, string>;

const INPUT_CLASS =
  "mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink " +
  "focus:border-arxys-navy focus:outline-none focus:ring-2 focus:ring-arxys-navy/15";

const READONLY_INPUT_CLASS =
  "mt-1 block w-full rounded-lg border border-line bg-[#f2f5f9] px-3 py-2 font-mono text-sm " +
  "text-ink-soft focus:outline-none";

function isNumericKind(field: SpecField): boolean {
  return (
    field.kind === "int-required-positive" ||
    field.kind === "int-optional" ||
    field.kind === "num-required-positive"
  );
}

function isRequiredKind(field: SpecField): boolean {
  return (
    field.kind === "id" ||
    field.kind === "text-required" ||
    field.kind === "int-required-positive" ||
    field.kind === "num-required-positive" ||
    field.kind === "raid-required"
  );
}

function FieldMessages({
  serverErrors,
  liveError,
  hint,
}: {
  serverErrors?: string[];
  liveError?: string;
  hint?: string;
}) {
  return (
    <>
      {liveError ? (
        <p className="mt-1 text-xs font-medium text-red-600">{liveError}</p>
      ) : null}
      {serverErrors?.length && serverErrors[0] !== liveError ? (
        <p className="mt-1 text-xs font-medium text-red-600">{serverErrors[0]}</p>
      ) : null}
      {hint ? <p className="mt-1 text-xs text-ink-soft">{hint}</p> : null}
    </>
  );
}

export function SpecForm({
  mode,
  action,
  initialValues,
  savedCapacity,
  skuLabel,
}: {
  mode: "create" | "edit";
  action: (
    prev: SpecActionState | null,
    formData: FormData,
  ) => Promise<SpecActionState>;
  /** Every field as a display string; "" for null. */
  initialValues: Record<string, string>;
  /** The persisted capacity inputs, for the preview's "saved" side. Null on create. */
  savedCapacity: CapacityInputs | null;
  skuLabel: string;
}) {
  const [state, formAction, pending] = useActionState<SpecActionState, FormData>(
    action,
    INITIAL,
  );

  const [live, setLive] = useState<LiveValues>(
    () =>
      Object.fromEntries(
        LIVE_FIELDS.map((name) => [name, initialValues[name] ?? ""]),
      ) as LiveValues,
  );

  const setLiveField = (name: LiveField, value: string) =>
    setLive((prev) => ({ ...prev, [name]: value }));

  // Coerced once, then shared by the preview, the rule check and the warnings —
  // the same three readings the server will take of the submitted values.
  const ruleValues = {
    drive_bays: toNumberOrNull(live.drive_bays),
    hdd_count: toNumberOrNull(live.hdd_count),
    raid_level_display: live.raid_level_display || null,
    raid_level_alt_display: live.raid_level_alt_display || null,
    max_cameras: toNumberOrNull(live.max_cameras),
    max_cameras_h265: toNumberOrNull(live.max_cameras_h265),
  };

  const nextCapacity: CapacityInputs = {
    storage_raw_tb: toNumberOrNull(live.storage_raw_tb),
    hdd_count: ruleValues.hdd_count,
    raid_level_display: ruleValues.raid_level_display,
    raid_level_alt_display: ruleValues.raid_level_alt_display,
  };

  const violations = specRuleViolations(ruleValues);
  const violationByField = new Map(violations.map((v) => [v.field, v.message]));
  const warnings = specWarnings(ruleValues);

  const serverFieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  const renderInput = (field: SpecField) => {
    const isLive = (LIVE_FIELDS as readonly string[]).includes(field.name);
    const liveValue = isLive ? live[field.name as LiveField] : undefined;

    if (field.kind === "id") {
      // Read-only when editing: the primary key is the WHERE clause of the
      // update and the join key products.sku matches on, so renaming it here
      // would orphan the product row and the audit history. readOnly (not
      // disabled) so the value still submits.
      if (mode === "edit") {
        return (
          <input
            id={field.name}
            name={field.name}
            type="text"
            readOnly
            defaultValue={initialValues[field.name] ?? ""}
            className={READONLY_INPUT_CLASS}
          />
        );
      }
      return (
        <input
          id={field.name}
          name={field.name}
          type="text"
          required
          autoComplete="off"
          placeholder="VX5-V900-960"
          defaultValue={initialValues[field.name] ?? ""}
          className={`${INPUT_CLASS} font-mono`}
        />
      );
    }

    if (field.kind === "raid-required" || field.kind === "raid-optional") {
      return (
        <Select
          id={field.name}
          name={field.name}
          className="mt-1"
          required={field.kind === "raid-required"}
          value={liveValue ?? ""}
          onChange={(e) => setLiveField(field.name as LiveField, e.target.value)}
        >
          <option value="">
            {field.kind === "raid-required" ? "— select a level —" : "— none —"}
          </option>
          {RAID_LEVEL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      );
    }

    if (field.kind === "textarea-optional") {
      return (
        <textarea
          id={field.name}
          name={field.name}
          rows={3}
          maxLength={field.maxLength}
          defaultValue={initialValues[field.name] ?? ""}
          className={INPUT_CLASS}
        />
      );
    }

    const numeric = isNumericKind(field);
    const common = {
      id: field.name,
      name: field.name,
      type: numeric ? ("number" as const) : ("text" as const),
      required: isRequiredKind(field),
      maxLength: numeric ? undefined : field.maxLength,
      // numeric columns are `numeric`/`integer` in Postgres; "any" lets a
      // decimal raw-TB or base-GHz through, which `int()` in the schema then
      // refuses for the integer columns with a readable message.
      step: numeric ? ("any" as const) : undefined,
      min: field.kind === "int-optional" ? 0 : undefined,
      className: INPUT_CLASS,
    };

    if (isLive) {
      return (
        <input
          {...common}
          value={liveValue ?? ""}
          onChange={(e) => setLiveField(field.name as LiveField, e.target.value)}
        />
      );
    }
    return <input {...common} defaultValue={initialValues[field.name] ?? ""} />;
  };

  return (
    <form action={formAction} className="space-y-6">
      {/* The preview sits above the fields and stays visible while editing the
          Storage & RAID section, which is directly below it. */}
      <NetUsablePreview saved={savedCapacity} next={nextCapacity} />

      {violations.length > 0 ? (
        <div
          role="alert"
          className="rounded-[14px] border border-red-300 bg-red-50 p-4 text-sm text-red-800"
        >
          <p className="font-bold">
            {violations.length === 1
              ? "This change cannot be saved:"
              : `${violations.length} problems block this save:`}
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5">
            {violations.map((v) => (
              <li key={`${v.field}:${v.message}`}>{v.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="rounded-[14px] border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-bold">Worth a check — this will still save:</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {SPEC_SECTIONS.map((section) => (
        <fieldset
          key={section.title}
          className="rounded-[14px] border border-line bg-surface p-5"
        >
          <legend className="px-1.5 text-[11px] font-bold uppercase tracking-[0.09em] text-[#5c6472]">
            {section.title}
          </legend>
          {section.note ? (
            <p className="mb-4 text-[13px] leading-relaxed text-ink-soft">
              {section.note}
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            {section.fields.map((field) => (
              <div
                key={field.name}
                className={field.kind === "textarea-optional" ? "sm:col-span-2" : ""}
              >
                <label
                  htmlFor={field.name}
                  className="block text-sm font-medium text-neutral-700"
                >
                  {field.label}
                  {isRequiredKind(field) ? (
                    <span className="ml-1 text-red-600" aria-hidden="true">
                      *
                    </span>
                  ) : null}
                </label>
                {renderInput(field)}
                <FieldMessages
                  serverErrors={serverFieldErrors?.[field.name]}
                  liveError={violationByField.get(field.name)}
                  hint={field.hint}
                />
              </div>
            ))}
          </div>
        </fieldset>
      ))}

      {state.status === "error" ? (
        <p role="alert" className="text-sm font-medium text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.status === "ok" ? (
        <div role="status">
          <p className="text-sm font-medium text-green-700">{state.message}</p>
          {state.warnings?.map((w) => (
            <p key={w} className="mt-1 text-sm text-amber-800">
              {w}
            </p>
          ))}
        </div>
      ) : null}

      {serverFieldErrors?._form?.length ? (
        <p role="alert" className="text-sm font-medium text-red-600">
          {serverFieldErrors._form[0]}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <Link
          href="/admin/specs"
          className="text-sm font-medium text-ink-soft hover:text-ink hover:underline"
        >
          Back to specs
        </Link>
        <Button type="submit" disabled={pending || violations.length > 0}>
          {pending
            ? "Saving…"
            : mode === "create"
              ? "Create spec row"
              : `Save ${skuLabel}`}
        </Button>
      </div>
    </form>
  );
}
