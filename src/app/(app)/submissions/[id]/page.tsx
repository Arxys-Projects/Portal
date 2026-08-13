import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  loadSubmissionDetail,
  loadSubmissionLineage,
} from "@/app/(app)/_components/load-submission";
import { SubmissionDetail } from "@/app/(app)/_components/submission-detail";
import { loadCurrentProjectQuote } from "@/lib/project-quote/assemble";
import { projectQuoteExpiryIso } from "@/lib/project-quote/expiry";
import {
  PartnerProjectQuotePanel,
  type CurrentQuoteSummary,
} from "./_components/project-quote-panel";

export default async function PartnerSubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const submission = await loadSubmissionDetail(id);
  if (!submission) notFound();
  const lineage = await loadSubmissionLineage(id);

  // Partners can download their own current Project Quote and Customer
  // Proposal (ADR 0083 + 0089) — no generate action here, that's admin-only.
  const supabase = await createSupabaseServerClient();
  const current = await loadCurrentProjectQuote(id, supabase);
  const currentQuote: CurrentQuoteSummary | null = current
    ? {
        version: current.version,
        identifier: current.snapshot.generation.identifier,
        generatedOn: current.generated_at.slice(0, 10),
        expiresOn: projectQuoteExpiryIso(current.generated_at, current.validity_days),
        termsVersion: current.terms_version,
      }
    : null;

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/submissions"
          className="text-sm font-medium text-arxys-navy hover:underline"
        >
          ← Back to submission history
        </Link>
      </div>
      <SubmissionDetail
        submission={submission}
        mode="partner"
        lineage={lineage}
        projectQuotePanel={
          <PartnerProjectQuotePanel
            current={currentQuote}
            projectQuoteHref={
              current ? `/api/submissions/${id}/project-quote/pdf?version=${current.version}` : ""
            }
            customerProposalHref={
              current
                ? `/api/submissions/${id}/project-quote/pdf?version=${current.version}&variant=customer-proposal`
                : ""
            }
          />
        }
      />
    </div>
  );
}
