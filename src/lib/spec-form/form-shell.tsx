"use client";

// The section-walking spec editor (ADR 0097 decision 4; design
// datasheets/datasheet-phase2-admin-surface-design.md §5). Extracted verbatim
// from the shipped product_specs form, which is now its first caller.
//
// Inputs are rendered by walking the sections it is handed, so this component
// never names a column: adding a field to a table's fields.ts renders it here
// and validates it in that table's schema.ts, together. That is the drift
// protection ADR 0096's "Negative" section asks for, and it is what carries
// over to the second table unchanged.
//
// WHAT IS LIVE AND WHAT IS NOT. Only the fields named in `liveFields` are held
// in React state; the rest are uncontrolled with defaultValue. That keeps the
// reactive surface to exactly the values whose consequences need to be visible
// as they are typed — on product_specs, the seven the net-usable preview and
// the cross-field rules read — and leaves the other three dozen as plain form
// fields the browser owns.
//
// WHAT STAYS PER-TABLE. `extras` is the slot for the treatments that only make
// sense for one table: the net-usable preview on product_specs (ADR 0096 §4b),
// the camera-matrix editor on appliance_specs (ADR 0097 §4d). It is a function
// of the live values, not a node, so an extra can react to typing without the
// shell knowing what it is reacting to. `liveChecks` is the same arrangement
// for the rules and warnings, whose conditions live next to each table's field
// metadata.

import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import { Button, Select } from "@/app/(app)/_components/ui";
import {
  isEnumField,
  isNumericKind,
  isRequiredKind,
  isWideKind,
  type SpecField,
  type SpecRuleViolation,
  type SpecSection,
} from "./fields";
import type { SpecActionState } from "./action-state";

const INITIAL: SpecActionState = { status: "idle" };

/** The live fields as display strings, keyed by field name. */
export type SpecLiveValues = Record<string, string>;

export type SpecLiveChecks = {
  /** Conditions that block the save. The submit button disables while any hold. */
  violations: SpecRuleViolation[];
  /** Conditions worth a second look that still save. */
  warnings: string[];
};

const INPUT_CLASS =
  "mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink " +
  "focus:border-arxys-navy focus:outline-none focus:ring-2 focus:ring-arxys-navy/15";

const READONLY_INPUT_CLASS =
  "mt-1 block w-full rounded-lg border border-line bg-[#f2f5f9] px-3 py-2 font-mono text-sm " +
  "text-ink-soft focus:outline-none";

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

export function SpecFormShell({
  mode,
  action,
  sections,
  initialValues,
  liveFields = [],
  liveChecks,
  extras,
  idPlaceholder,
  backHref,
  backLabel,
  submitLabel,
}: {
  mode: "create" | "edit";
  action: (
    prev: SpecActionState | null,
    formData: FormData,
  ) => Promise<SpecActionState>;
  /** The table's declarative field list, walked in order. */
  sections: readonly SpecSection[];
  /** Every field as a display string; "" for null. */
  initialValues: Record<string, string>;
  /** Field names to hold in React state, so `liveChecks` and `extras` see them as typed. */
  liveFields?: readonly string[];
  /** Recomputed on every keystroke in a live field. */
  liveChecks?: (live: SpecLiveValues) => SpecLiveChecks;
  /** The per-table slot, rendered above the fields. */
  extras?: (live: SpecLiveValues) => ReactNode;
  /** Placeholder for the `id` input on the create form. */
  idPlaceholder?: string;
  backHref: string;
  backLabel: string;
  /** The submit button's label when idle; "Saving…" replaces it while pending. */
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<SpecActionState, FormData>(
    action,
    INITIAL,
  );

  const [live, setLive] = useState<SpecLiveValues>(() =>
    Object.fromEntries(liveFields.map((name) => [name, initialValues[name] ?? ""])),
  );

  const setLiveField = (name: string, value: string) =>
    setLive((prev) => ({ ...prev, [name]: value }));

  const { violations, warnings } = liveChecks?.(live) ?? {
    violations: [],
    warnings: [],
  };
  const violationByField = new Map(violations.map((v) => [v.field, v.message]));

  const serverFieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  const renderInput = (field: SpecField) => {
    const isLive = liveFields.includes(field.name);
    const liveValue = isLive ? live[field.name] : undefined;

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
          placeholder={idPlaceholder}
          defaultValue={initialValues[field.name] ?? ""}
          className={`${INPUT_CLASS} font-mono`}
        />
      );
    }

    if (isEnumField(field)) {
      // Controlled only when the field is live. An enum that nothing reacts to
      // (no rule, no extra) stays uncontrolled like every other plain input,
      // rather than becoming a controlled input with no onChange.
      const selectProps = isLive
        ? {
            value: liveValue ?? "",
            onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
              setLiveField(field.name, e.target.value),
          }
        : { defaultValue: initialValues[field.name] ?? "" };
      return (
        <Select
          id={field.name}
          name={field.name}
          className="mt-1"
          required={field.kind === "enum-required"}
          {...selectProps}
        >
          <option value="">{field.emptyOptionLabel}</option>
          {field.options.map((option) => (
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

    if (field.kind === "string-list") {
      // One item per line. No maxLength on the textarea: the cap is per entry,
      // not on the whole list, and the schema enforces it with a message that
      // says so — a total-character limit here would silently truncate a
      // legitimate long list instead.
      return (
        <textarea
          id={field.name}
          name={field.name}
          rows={4}
          defaultValue={initialValues[field.name] ?? ""}
          className={`${INPUT_CLASS} font-mono`}
        />
      );
    }

    if (field.kind === "date-optional") {
      return (
        <input
          id={field.name}
          name={field.name}
          type="date"
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
          onChange={(e) => setLiveField(field.name, e.target.value)}
        />
      );
    }
    return <input {...common} defaultValue={initialValues[field.name] ?? ""} />;
  };

  return (
    <form action={formAction} className="space-y-6">
      {/* The extras slot sits above the fields, where the product_specs preview
          stays visible while editing the Storage & RAID section below it. */}
      {extras?.(live)}

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

      {sections.map((section) => (
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
                className={isWideKind(field) ? "sm:col-span-2" : ""}
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
          href={backHref}
          className="text-sm font-medium text-ink-soft hover:text-ink hover:underline"
        >
          {backLabel}
        </Link>
        <Button type="submit" disabled={pending || violations.length > 0}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
