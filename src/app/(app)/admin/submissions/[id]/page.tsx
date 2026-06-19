import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadSubmissionDetail } from "@/app/(app)/_components/load-submission";
import { SubmissionDetail } from "@/app/(app)/_components/submission-detail";
import { resolveSubmissionPartner } from "@/lib/pdf/partner-resolution";
import { loadCurrentProjectQuote } from "@/lib/project-quote/assemble";
import { projectQuoteExpiryIso } from "@/lib/project-quote/expiry";
import {
  ProjectQuotePanel,
  type CurrentQuoteSummary,
} from "./_components/project-quote-panel";

export default async function AdminSubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const submission = await loadSubmissionDetail(id);
  if (!submission) notFound();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch creating-partner data (company + contact) and on-behalf-of columns.
  const { data: subRow } = await supabase
    .from("submissions")
    .select(
      `on_behalf_of_partner_id, on_behalf_of_company_name,
       partners!submissions_partner_id_fkey!inner(id, company_name, contact_name)`,
    )
    .eq("id", id)
    .maybeSingle();
  const joined = subRow as
    | {
        on_behalf_of_partner_id: string | null;
        on_behalf_of_company_name: string | null;
        partners:
          | { id: string; company_name: string; contact_name: string }
          | { id: string; company_name: string; contact_name: string }[];
      }
    | null;
  const creatingPartnerObj = joined
    ? Array.isArray(joined.partners)
      ? joined.partners[0]
      : joined.partners
    : null;

  // Resolve on-behalf-of target via admin client when FK is set.
  let onBehalfPartnerObj: { company_name: string; contact_name: string } | null = null;
  if (joined?.on_behalf_of_partner_id) {
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("partners")
      .select("company_name, contact_name")
      .eq("id", joined.on_behalf_of_partner_id)
      .maybeSingle();
    onBehalfPartnerObj = data as { company_name: string; contact_name: string } | null;
  }

  // Three-tier precedence: on-behalf FK target → free-text name → creating partner.
  const resolved = resolveSubmissionPartner(
    {
      on_behalf_of_partner_id: joined?.on_behalf_of_partner_id ?? null,
      on_behalf_of_company_name: joined?.on_behalf_of_company_name ?? null,
    },
    onBehalfPartnerObj,
    creatingPartnerObj as { company_name: string; contact_name: string } | null,
  );
  const partner = creatingPartnerObj
    ? {
        id: creatingPartnerObj.id,
        companyName: resolved.companyName,
        contactName: resolved.contactName,
      }
    : undefined;

  // Internal users (is_internal = true) can revise submissions from the admin
  // view. Phase 8 Step C gave internal users access to this view but the
  // Edit/revise button was absent here — they had to navigate to /submissions
  // instead. canRevise restores the affordance for them.
  let isInternal = false;
  if (user) {
    const { data: callerRow } = await supabase
      .from("partners")
      .select("is_internal")
      .eq("id", user.id)
      .maybeSingle();
    isInternal = Boolean(callerRow?.is_internal);
  }

  // Project Quote is internal-only (ADR 0059). Load the derived-current quote
  // (max version) and pass a serializable summary to the panel. RLS on
  // project_quotes also gates this read to internal callers, so a non-internal
  // viewer sees neither the panel (isInternal gate) nor any quote (null read).
  let currentQuote: CurrentQuoteSummary | null = null;
  if (isInternal) {
    const current = await loadCurrentProjectQuote(id, supabase);
    if (current) {
      currentQuote = {
        version: current.version,
        identifier: current.snapshot.generation.identifier,
        generatedOn: current.generated_at.slice(0, 10),
        expiresOn: projectQuoteExpiryIso(current.generated_at, current.validity_days),
        termsVersion: current.terms_version,
      };
    }
  }

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/admin/submissions"
          className="text-sm font-medium text-arxys-navy hover:underline"
        >
          ← All submissions
        </Link>
      </div>
      <SubmissionDetail
        submission={submission}
        partner={partner}
        mode="admin"
        canRevise={isInternal}
      />
      {isInternal ? (
        <ProjectQuotePanel
          submissionId={id}
          current={currentQuote}
          downloadHref={`/api/admin/submissions/${id}/project-quote/pdf`}
        />
      ) : null}
    </div>
  );
}
