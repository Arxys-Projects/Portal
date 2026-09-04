"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/(app)/_components/ui";
import { adminResendSubmissionNotification } from "../resend-notification-actions";

// Manual recovery affordance for a submission whose sales/partner notification
// email never sent (or failed silently — ADR 0027). Always available, not
// gated on email_sent_at being null: an admin may also want to re-send a copy
// that did go out the first time.
export function ResendNotificationButton({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function handleResend() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await adminResendSubmissionNotification(submissionId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNotice(`Notification email sent to ${res.sentTo}.`);
      router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col gap-1.5">
      <Button variant="secondary" size="sm" onClick={handleResend} disabled={isPending}>
        {isPending ? "Sending…" : "Resend notification email"}
      </Button>
      {notice ? <span className="text-xs text-green-800">{notice}</span> : null}
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </span>
  );
}
