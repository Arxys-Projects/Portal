"use client";

import { useActionState, useState } from "react";
import { Button } from "@/app/(app)/_components/ui";
import { registerDealAction, type DealRegState } from "./actions";

const initial: DealRegState = { status: "idle" };

export default function RegisterDealForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(registerDealAction, initial);

  if (state.status === "success") {
    return (
      <p className="text-sm font-medium text-green-700">
        Thanks — Andy will be in touch.
      </p>
    );
  }

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        Register a Deal
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label
          htmlFor="dealProjectName"
          className="block text-xs font-semibold text-ink mb-1"
        >
          Project Name <span className="text-danger">*</span>
        </label>
        <input
          id="dealProjectName"
          name="projectName"
          type="text"
          required
          minLength={3}
          maxLength={200}
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-arxys-navy focus:outline-none focus:ring-2 focus:ring-arxys-navy/15"
          placeholder="e.g. Acme Corp — Downtown Campus"
        />
      </div>

      <div>
        <label
          htmlFor="dealNotes"
          className="block text-xs font-semibold text-ink mb-1"
        >
          Notes <span className="text-ink-soft font-normal">(optional)</span>
        </label>
        <textarea
          id="dealNotes"
          name="notes"
          maxLength={1000}
          rows={3}
          className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-arxys-navy focus:outline-none focus:ring-2 focus:ring-arxys-navy/15"
          placeholder="Opportunity details, timeline, competitive situation…"
        />
      </div>

      {state.status === "error" && (
        <p className="text-xs text-danger">{state.message}</p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Submit Registration"}
        </Button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs font-medium text-ink-soft hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
