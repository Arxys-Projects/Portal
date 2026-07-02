"use client";

import { useActionState } from "react";
import { requestAccess, type RequestAccessState } from "./request-access-actions";

const INITIAL: RequestAccessState = { status: "idle" };

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors || errors.length === 0) return null;
  return <p className="mt-1 text-xs text-red-600">{errors[0]}</p>;
}

const inputClass =
  "mt-1 block w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

export function RequestAccessForm() {
  const [state, formAction, pending] = useActionState<RequestAccessState, FormData>(
    requestAccess,
    INITIAL,
  );
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <details className="mt-4 rounded border border-neutral-200 bg-neutral-50 px-3 py-3 text-sm text-neutral-600 [&_summary::-webkit-details-marker]:hidden">
      <summary className="cursor-pointer list-none font-medium text-neutral-700 hover:text-neutral-900">
        Not a partner yet? <span className="text-blue-600">Request access</span>
      </summary>

      {state.status === "ok" ? (
        <p role="status" className="mt-3 text-sm text-green-700">
          {state.message}
        </p>
      ) : (
        <form action={formAction} className="mt-3 space-y-3">
          <p className="text-xs text-neutral-500">
            Tell us who you are and we&apos;ll be in touch. No account is created
            until an Arxys admin sends you an invite.
          </p>

          {/* Honeypot — visually hidden off-screen (not display:none, which some
              bots skip). Real users never see or tab to it. */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "-9999px",
              width: "1px",
              height: "1px",
              overflow: "hidden",
            }}
          >
            <label htmlFor="website">Website</label>
            <input
              id="website"
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          <div>
            <label
              htmlFor="ra-name"
              className="block text-sm font-medium text-neutral-700"
            >
              Your name
            </label>
            <input
              id="ra-name"
              name="name"
              type="text"
              required
              maxLength={120}
              autoComplete="name"
              className={inputClass}
            />
            <FieldError errors={fieldErrors?.name} />
          </div>

          <div>
            <label
              htmlFor="ra-email"
              className="block text-sm font-medium text-neutral-700"
            >
              Work email
            </label>
            <input
              id="ra-email"
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              className={inputClass}
            />
            <FieldError errors={fieldErrors?.email} />
          </div>

          <div>
            <label
              htmlFor="ra-company"
              className="block text-sm font-medium text-neutral-700"
            >
              Company name
            </label>
            <input
              id="ra-company"
              name="companyName"
              type="text"
              required
              maxLength={120}
              autoComplete="organization"
              className={inputClass}
            />
            <FieldError errors={fieldErrors?.companyName} />
          </div>

          {state.status === "error" && !state.fieldErrors ? (
            <p role="alert" className="text-sm text-red-600">
              {state.error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded bg-arxys-gold px-3 py-2 text-sm font-medium text-arxys-text-on-gold shadow-sm hover:bg-arxys-gold-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Sending…" : "Request access"}
          </button>
        </form>
      )}
    </details>
  );
}
