"use client";

import Link from "next/link";
import { useActionState } from "react";
import { rejectAccessRequest, type RequestActionState } from "./actions";

const INITIAL: RequestActionState = { status: "idle" };

type Props = {
  id: string;
  name: string;
  email: string;
  companyName: string;
};

// Approve → prefill handoff. Param names deliberately match the invite form's
// input `name` attributes (email / contactName / companyName) so the invite
// form fills straight through. requestId lets invitePartner() stamp the
// conversion on a successful send. See ADR 0077.
function invitePrefillHref({ id, name, email, companyName }: Props): string {
  const params = new URLSearchParams({
    requestId: id,
    email,
    contactName: name,
    companyName,
  });
  return `/admin/partners/new?${params.toString()}`;
}

export function RequestRowActions(props: Props) {
  const [state, formAction, pending] = useActionState<RequestActionState, FormData>(
    rejectAccessRequest,
    INITIAL,
  );

  return (
    <div className="flex flex-wrap items-start justify-end gap-2">
      <Link
        href={invitePrefillHref(props)}
        className="rounded border border-arxys-navy bg-arxys-navy-soft px-2 py-1 text-xs font-medium text-arxys-navy hover:bg-secondary"
      >
        Approve → invite
      </Link>
      <form
        action={formAction}
        className="inline-flex flex-col items-end gap-1"
        onSubmit={(e) => {
          if (
            !window.confirm(
              "Reject this access request? This cannot be undone from the UI.",
            )
          ) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="id" value={props.id} />
        <button
          type="submit"
          disabled={pending}
          className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          {pending ? "…" : "Reject"}
        </button>
        {state.status === "error" ? (
          <span className="max-w-[16rem] text-right text-xs text-red-600">
            {state.error}
          </span>
        ) : null}
      </form>
    </div>
  );
}
