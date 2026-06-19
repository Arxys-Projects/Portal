import Link from "next/link";
import { notFound } from "next/navigation";
import { loadSubmissionDetail } from "@/app/(app)/_components/load-submission";
import { SubmissionDetail } from "@/app/(app)/_components/submission-detail";

export default async function PartnerSubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const submission = await loadSubmissionDetail(id);
  if (!submission) notFound();

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
      <SubmissionDetail submission={submission} mode="partner" />
    </div>
  );
}
