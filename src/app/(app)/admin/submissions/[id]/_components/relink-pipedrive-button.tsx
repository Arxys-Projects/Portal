"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/(app)/_components/ui";
import { adminRelinkPipedriveDeal } from "../../actions";

// ADR 0093 step 3 — recovery affordance for a submission whose Pipedrive sync
// failed at submit time. Only rendered when pipedrive_deal_id is null, so there
// is no path here that overwrites an existing link.
export function RelinkPipedriveButton({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function handleRelink() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await adminRelinkPipedriveDeal(submissionId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNotice(
        [
          res.inherited
            ? `Updated the source quote's existing deal #${res.dealId} in place.`
            : `Created and linked Pipedrive deal #${res.dealId}.`,
          // The deal's value is locked to its attached line items, so it still
          // shows the previous revision's price. A pinned note on the deal spells
          // out the new figure for sales.
          res.valueUpdateSkipped
            ? `Deal value was NOT changed — this deal has products attached, so Pipedrive keeps its ` +
              `value tied to the line items. Update the products in Pipedrive to reflect the new sizing ` +
              `(see the pinned note on the deal).`
            : null,
        ]
          .filter(Boolean)
          .join(" "),
      );
      router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col gap-1.5">
      <span className="flex items-center gap-2">
        <span className="text-xs text-ink-soft">
          No Pipedrive deal linked to this submission.
        </span>
        <Button variant="secondary" size="sm" onClick={handleRelink} disabled={isPending}>
          {isPending ? "Linking…" : "Retry Pipedrive link"}
        </Button>
      </span>
      {notice ? <span className="text-xs text-green-800">{notice}</span> : null}
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </span>
  );
}
