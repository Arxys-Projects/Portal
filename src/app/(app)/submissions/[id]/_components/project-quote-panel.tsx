import { buttonClasses } from "@/app/(app)/_components/ui";

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

// Partner-facing panel, display-only: unlike the admin ProjectQuotePanel,
// there is no generate/regenerate action here — generating a new Project
// Quote is internal-only (project-quote-actions.ts). Partners can download
// both documents for their own current quote (ADR 0083 + 0089): the Project
// Quote (partner pricing) and the Customer Proposal (stripped, end-customer
// version), same pattern as the pipeline.tsx quote-documents row.
export function PartnerProjectQuotePanel({
  current,
  projectQuoteHref,
  customerProposalHref,
}: {
  current: CurrentQuoteSummary | null;
  projectQuoteHref: string;
  customerProposalHref: string;
}) {
  return (
    <section className="mt-6 rounded-xl border-2 border-line bg-surface p-4">
      <h2 className="text-sm font-bold text-ink">Project Quote</h2>

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
          <div className="flex flex-wrap gap-2 pt-2">
            <a href={projectQuoteHref} download className={buttonClasses("secondary", "sm")}>
              Download Project Quote
            </a>
            <a href={customerProposalHref} download className={buttonClasses("secondary", "sm")}>
              Download Customer Proposal
            </a>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-soft">
          No Project Quote has been generated for this submission yet.
        </p>
      )}
    </section>
  );
}
