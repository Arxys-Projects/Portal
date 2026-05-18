"use client";

import { useActionState } from "react";
import { requestReset, type ForgotState } from "./actions";

export function ForgotForm() {
  const [state, formAction, pending] = useActionState<ForgotState | null, FormData>(
    requestReset,
    null,
  );

  if (state?.status === "sent") {
    return (
      <p className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
        If an account exists for that email, a reset link has been sent. Check
        your inbox.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-neutral-700">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="mt-1 block w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      {state?.status === "error" ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
      >
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
