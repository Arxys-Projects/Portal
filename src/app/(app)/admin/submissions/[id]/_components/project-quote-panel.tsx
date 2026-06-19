"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, buttonClasses } from "@/app/(app)/_components/ui";
import { generateProjectQuote } from "../project-quote-actions";

// Serializable summary of the current (latest-version) Project Quote, derived
// server-side from loadCurrentProjectQuote. null when none has been generated.
export type CurrentQuoteSummary = {
  version: number;
  identifier: string;
  // YYYY-MM-DD
  generatedOn: string;
  expiresOn: string;
  termsVersion: string;
};

export function ProjectQuotePanel({
  submissionId,
  current,
  downloadHref,
}: {
  submissionId: string;
  current: CurrentQuoteSummary | null;
  downloadHref: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function handleGenerate() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await generateProjectQuote(submissionId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Non-blocking delivery notice: the quote is saved either way.
      setNotice(
        res.delivered
          ? `Generated ${res.identifier} and attached it to the Pipedrive deal.`
          : `Generated ${res.identifier}. ${res.deliveryNote ?? ""}`.trim(),
      );
      // Pull the new current version / expiry / download link into the page.
      router.refresh();
    });
  }

  return (
    <section className="mt-6 rounded-xl border-2 border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-bold text-ink">Project Quote</h2>
        <span className="text-xs text-ink-soft">Internal only</span>
      </div>

      {current ? (
        <div className="mt-3 space-y-1 text-sm text-ink">
          <div>
            <span className="font-semibold">Current:</span>{" "}
            <span className="font-mono">{current.identifier}</span>
            <span className="text-ink-soft"> (version {current.version})</span>
          </div>
          <div className="text-ink-soft">
            Generated {current.generatedOn} · Valid through {current.expiresOn} · Terms{" "}
            {current.termsVersion}
          </div>
          <div className="pt-2">
            <a href={downloadHref} className={buttonClasses("secondary", "sm")}>
              Download PDF
            </a>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-soft">
          No Project Quote has been generated for this submission yet.
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={handleGenerate} disabled={isPending} size="sm">
          {isPending
            ? "Generating…"
            : current
              ? "Make New Project Quote"
              : "Generate Project Quote"}
        </Button>
        {current ? (
          <span className="text-xs text-ink-soft">
            Creates version {current.version + 1} from the deal as it stands now.
          </span>
        ) : null}
      </div>

      {notice ? (
        <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
      ) : null}
    </section>
  );
}
