"use client";

import Link from "next/link";
import { useActionState } from "react";
import { invitePartner, type InviteState } from "../actions";

const INITIAL: InviteState = { status: "idle" };

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors || errors.length === 0) return null;
  return <p className="mt-1 text-xs text-red-600">{errors[0]}</p>;
}

export function InviteForm() {
  const [state, formAction, pending] = useActionState<InviteState, FormData>(
    invitePartner,
    INITIAL,
  );
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="space-y-4">
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
          className="mt-1 block w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
          className="mt-1 block w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
          className="mt-1 block w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <FieldError errors={fieldErrors?.companyName} />
      </div>

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
          className="text-sm text-neutral-600 hover:underline"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
        >
          {pending ? "Sending invite…" : "Send invite"}
        </button>
      </div>
    </form>
  );
}
