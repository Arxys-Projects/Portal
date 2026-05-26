"use client";

import { useActionState, useState } from "react";
import { registerDealAction, type DealRegState } from "./actions";

type Props = {
  partnerId: string;
  companyName: string;
  contactName: string;
  partnerEmail: string;
};

const initial: DealRegState = { status: "idle" };

export default function RegisterDealForm({
  partnerId,
  companyName,
  contactName,
  partnerEmail,
}: Props) {
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded bg-[#fbb040] px-4 py-2 text-sm font-semibold text-[#1a1a1a] transition hover:bg-[#e69e2c]"
      >
        Register a Deal
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      {/* Hidden partner fields */}
      <input type="hidden" name="partnerId" value={partnerId} />
      <input type="hidden" name="companyName" value={companyName} />
      <input type="hidden" name="contactName" value={contactName} />
      <input type="hidden" name="partnerEmail" value={partnerEmail} />

      <div>
        <label
          htmlFor="dealProjectName"
          className="block text-xs font-semibold text-neutral-700 mb-1"
        >
          Project Name <span className="text-red-500">*</span>
        </label>
        <input
          id="dealProjectName"
          name="projectName"
          type="text"
          required
          minLength={3}
          maxLength={200}
          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-[#054A91] focus:outline-none"
          placeholder="e.g. Acme Corp — Downtown Campus"
        />
      </div>

      <div>
        <label
          htmlFor="dealNotes"
          className="block text-xs font-semibold text-neutral-700 mb-1"
        >
          Notes <span className="text-neutral-400 font-normal">(optional)</span>
        </label>
        <textarea
          id="dealNotes"
          name="notes"
          maxLength={1000}
          rows={3}
          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-[#054A91] focus:outline-none resize-none"
          placeholder="Opportunity details, timeline, competitive situation…"
        />
      </div>

      {state.status === "error" && (
        <p className="text-xs text-red-600">{state.message}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center rounded bg-[#fbb040] px-4 py-2 text-sm font-semibold text-[#1a1a1a] transition hover:bg-[#e69e2c] disabled:opacity-50"
        >
          {pending ? "Sending…" : "Submit Registration"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-neutral-500 hover:text-neutral-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
