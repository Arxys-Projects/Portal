import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadSubmissionDetail } from "@/app/(app)/_components/load-submission";
import { SubmissionDetail } from "@/app/(app)/_components/submission-detail";

export default async function AdminSubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const submission = await loadSubmissionDetail(id);
  if (!submission) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: partnerRow } = await supabase
    .from("submissions")
    .select(
      "partners!inner(id, company_name, contact_name)",
    )
    .eq("id", id)
    .maybeSingle();
  const joined = partnerRow as
    | {
        partners:
          | { id: string; company_name: string; contact_name: string }
          | { id: string; company_name: string; contact_name: string }[];
      }
    | null;
  const partnerObj = joined
    ? Array.isArray(joined.partners)
      ? joined.partners[0]
      : joined.partners
    : null;
  const partner = partnerObj
    ? {
        id: partnerObj.id,
        companyName: partnerObj.company_name,
        contactName: partnerObj.contact_name,
      }
    : undefined;

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/admin/submissions"
          className="text-sm text-blue-600 hover:underline"
        >
          ← All submissions
        </Link>
      </div>
      <SubmissionDetail
        submission={submission}
        partner={partner}
        mode="admin"
      />
    </div>
  );
}
