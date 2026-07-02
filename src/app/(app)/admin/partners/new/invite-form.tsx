"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/app/(app)/_components/ui";
import { invitePartner, type InviteState } from "../actions";

const INITIAL: InviteState = { status: "idle" };

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors || errors.length === 0) return null;
  return <p className="mt-1 text-xs text-red-600">{errors[0]}</p>;
}

export function InviteForm({
  showInternalToggle = false,
  defaultEmail = "",
  defaultContactName = "",
  defaultCompanyName = "",
  requestId,
}: {
  showInternalToggle?: boolean;
  defaultEmail?: string;
  defaultContactName?: string;
  defaultCompanyName?: string;
  requestId?: string;
}) {
  const [state, formAction, pending] = useActionState<InviteState, FormData>(
    invitePartner,
    INITIAL,
  );
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="space-y-4">
      {requestId ? (
        <input type="hidden" name="requestId" value={requestId} />
      ) : null}
      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-neutral-700"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="off"
          defaultValue={defaultEmail}
          className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-arxys-navy focus:outline-none focus:ring-2 focus:ring-arxys-navy/15"
        />
        <FieldError errors={fieldErrors?.email} />
      </div>
      <div>
        <label
          htmlFor="contactName"
          className="block text-sm font-medium text-neutral-700"
        >
          Contact name
        </label>
        <input
          id="contactName"
          name="contactName"
          type="text"
          required
          defaultValue={defaultContactName}
          className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-arxys-navy focus:outline-none focus:ring-2 focus:ring-arxys-navy/15"
        />
        <FieldError errors={fieldErrors?.contactName} />
      </div>
      <div>
        <label
          htmlFor="companyName"
          className="block text-sm font-medium text-neutral-700"
        >
          Company name
        </label>
        <input
          id="companyName"
          name="companyName"
          type="text"
          required
          defaultValue={defaultCompanyName}
          className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-arxys-navy focus:outline-none focus:ring-2 focus:ring-arxys-navy/15"
        />
        <FieldError errors={fieldErrors?.companyName} />
      </div>
      {showInternalToggle ? (
        <div>
          <label className="flex items-start gap-2 text-sm text-neutral-700">
            <input
              id="isInternal"
              name="isInternal"
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-neutral-300"
            />
            <span>
              <span className="font-medium">Internal user</span>
              <span className="block text-xs text-neutral-500">
                An Arxys staff member who can run sizing calculations on behalf
                of partners. Leave unchecked for an external partner.
              </span>
            </span>
          </label>
        </div>
      ) : null}

      {state.status === "error" && !state.fieldErrors ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.status === "ok" ? (
        <p role="status" className="text-sm text-green-700">
          {state.message}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <Link
          href="/admin/partners"
          className="text-sm font-medium text-ink-soft hover:text-ink hover:underline"
        >
          Cancel
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending invite…" : "Send invite"}
        </Button>
      </div>
    </form>
  );
}
