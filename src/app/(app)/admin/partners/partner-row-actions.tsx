"use client";

import { useActionState } from "react";
import {
  reactivatePartner,
  resendInvite,
  suspendPartner,
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
        ? "rounded border border-blue-300 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
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
          label="Resend invite"
          variant="neutral"
        />
      ) : null}
    </div>
  );
}
