"use client";

import { useActionState } from "react";
import { updatePassword, type ResetState } from "./actions";

export function ResetForm() {
  const [state, formAction, pending] = useActionState<ResetState, FormData>(
    updatePassword,
    null,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-neutral-700"
        >
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="mt-1 block w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div>
        <label
          htmlFor="confirm"
          className="block text-sm font-medium text-neutral-700"
        >
          Confirm new password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="mt-1 block w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      {state?.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-arxys-gold px-3 py-2 text-sm font-medium text-arxys-text-on-gold shadow-sm hover:bg-arxys-gold-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
