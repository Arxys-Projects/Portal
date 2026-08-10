"use client";

import { useActionState, useState, useTransition } from "react";
import {
  reactivatePartner,
  resendInvite,
  setPartnerInternal,
  suspendPartner,
  uploadPartnerLogo,
  type SimpleActionState,
} from "./actions";

const INITIAL: SimpleActionState = { status: "idle" };

type Props = {
  id: string;
  status: "active" | "invited" | "suspended";
};

function ActionButton({
  action,
  id,
  label,
  variant,
  confirmMessage,
}: {
  action: typeof suspendPartner;
  id: string;
  label: string;
  variant: "danger" | "neutral" | "primary";
  confirmMessage?: string;
}) {
  const [state, formAction, pending] = useActionState<SimpleActionState, FormData>(
    action,
    INITIAL,
  );
  const cls =
    variant === "danger"
      ? "rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
      : variant === "primary"
        ? "rounded border border-arxys-navy bg-arxys-navy-soft px-2 py-1 text-xs font-medium text-arxys-navy hover:bg-secondary disabled:opacity-50"
        : "rounded border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50";
  return (
    <form
      action={formAction}
      className="inline-flex flex-col items-end gap-1"
      onSubmit={(e) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className={cls}>
        {pending ? "…" : label}
      </button>
      {state.status === "error" ? (
        <span className="max-w-[16rem] text-right text-xs text-red-600">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

// ADR 0089 — admin-only logo upload for a partner. Picking a file auto-submits
// the form (requestSubmit), so upload happens on selection; the current logo
// (when set) shows as a small thumbnail. Accepts PNG/JPG only; the server
// action re-validates type and size.
export function LogoUpload({ id, logoUrl }: { id: string; logoUrl: string | null }) {
  const [state, formAction, pending] = useActionState<SimpleActionState, FormData>(
    uploadPartnerLogo,
    INITIAL,
  );
  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-1">
      <input type="hidden" name="id" value={id} />
      <div className="inline-flex items-center gap-2">
        {logoUrl ? (
          // Public bucket URL; next/image would need remotePatterns config for
          // the Storage host, so a plain img is simpler here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt="Partner logo"
            className="h-6 max-w-[72px] rounded border border-line bg-white object-contain"
          />
        ) : (
          <span className="text-xs text-ink-soft">None</span>
        )}
        <label className="cursor-pointer rounded border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100">
          {pending ? "…" : logoUrl ? "Replace" : "Upload"}
          <input
            type="file"
            name="logo"
            accept="image/png,image/jpeg"
            disabled={pending}
            className="hidden"
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
          />
        </label>
      </div>
      {state.status === "error" ? (
        <span className="max-w-[12rem] text-xs text-red-600">{state.error}</span>
      ) : null}
    </form>
  );
}

// Phase 7 Step 1 — flip a partner's internal flag. The button submits the
// NEXT value so the action is a plain set, not a read-modify-write.
export function InternalToggle({
  id,
  isInternal,
}: {
  id: string;
  isInternal: boolean;
}) {
  const [state, formAction, pending] = useActionState<SimpleActionState, FormData>(
    setPartnerInternal,
    INITIAL,
  );
  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="value" value={isInternal ? "false" : "true"} />
      <button
        type="submit"
        disabled={pending}
        className={
          isInternal
            ? "rounded border border-arxys-gold bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            : "rounded border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
        }
        title={
          isInternal
            ? "Internal user — click to revoke"
            : "External partner — click to mark internal"
        }
      >
        {pending ? "…" : isInternal ? "Internal ✓" : "Mark internal"}
      </button>
      {state.status === "error" ? (
        <span className="max-w-[12rem] text-xs text-red-600">{state.error}</span>
      ) : null}
    </form>
  );
}

// Admin-only inline edit of a partner name field (company or contact). Display
// mode shows the value with an Edit affordance; edit mode swaps in a text input
// with Save / Cancel. The server action is passed in so one component serves
// both columns. revalidatePath in the action refreshes the server component, so
// the `value` prop reflects the saved name; we collapse back to display on a
// successful save.
export function EditableName({
  id,
  value,
  fieldName,
  label,
  action,
  required = true,
  inputMode,
  placeholder,
}: {
  id: string;
  value: string;
  fieldName: string;
  label: string;
  action: (
    prev: SimpleActionState | null,
    formData: FormData,
  ) => Promise<SimpleActionState>;
  // ADR 0118 — the Pipedrive User ID field is optional (empty clears it back
  // to the default owner), unlike company/contact name which must always hold
  // a value. Defaults to true so every existing caller is unaffected.
  required?: boolean;
  inputMode?: "text" | "numeric";
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Call the action in a transition so we can close the editor on success
  // (and surface the error otherwise) from the callback — not from an effect.
  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await action(null, formData);
      if (res.status === "error") {
        setError(res.error);
      } else {
        setError(null);
        setEditing(false);
      }
    });
  }

  if (!editing) {
    return (
      <div className="inline-flex items-center gap-2">
        <span className="text-neutral-900">{value || "—"}</span>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setEditing(true);
          }}
          className="rounded border border-neutral-300 px-1.5 py-0.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
          title={`Edit ${label}`}
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <form action={onSubmit} className="inline-flex flex-col items-start gap-1">
      <input type="hidden" name="id" value={id} />
      <div className="inline-flex items-center gap-1">
        <input
          name={fieldName}
          defaultValue={value}
          autoFocus
          maxLength={120}
          required={required}
          inputMode={inputMode}
          placeholder={placeholder}
          aria-label={label}
          className="w-48 rounded-lg border border-line px-2 py-1 text-sm text-ink focus:border-arxys-navy focus:outline-none focus:ring-2 focus:ring-arxys-navy/15"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded border border-arxys-navy bg-arxys-navy-soft px-2 py-1 text-xs font-medium text-arxys-navy hover:bg-secondary disabled:opacity-50"
        >
          {pending ? "…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setEditing(false);
          }}
          disabled={pending}
          className="rounded border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      {error ? (
        <span className="max-w-[16rem] text-xs text-red-600">{error}</span>
      ) : null}
    </form>
  );
}

export function PartnerRowActions({ id, status }: Props) {
  return (
    <div className="flex flex-wrap items-start justify-end gap-2">
      {status === "active" ? (
        <ActionButton
          action={suspendPartner}
          id={id}
          label="Suspend"
          variant="danger"
          confirmMessage="Suspend this partner? They will be signed out and blocked from the portal."
        />
      ) : null}
      {status === "suspended" ? (
        <ActionButton
          action={reactivatePartner}
          id={id}
          label="Reactivate"
          variant="primary"
        />
      ) : null}
      {status === "invited" ? (
        <ActionButton
          action={resendInvite}
          id={id}
          label="Resend sign-in link"
          variant="neutral"
        />
      ) : null}
    </div>
  );
}
