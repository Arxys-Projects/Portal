"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminOrInternal } from "@/lib/auth/require-admin-or-internal";
import { UTILIZATION_DEFAULT_PCT } from "@/lib/calculator/tables";
import { retentionSummary } from "@/lib/calculator/compute";
import { GB_PER_TB } from "@/lib/recommend/types";
import { sendSubmissionNotification } from "@/lib/email/submission-notification";
import { loadSubmissionPdfInput, pdfFilename, renderSubmissionPdfBuffer } from "@/lib/pdf/render";

// ---------------------------------------------------------------------------
// Manual "Resend notification email" — recovery affordance for a submission
// whose sales/partner notification never went out. The original send (calculator
// actions.ts submitCalculation) is fire-and-forget and swallows its own failure
// by design (ADR 0027), so a null email_sent_at was previously a dead end: no
// resend existed anywhere in the app. Added 2026-09-04 after submission
// 5a5f15d3 shipped to Pipedrive with no notification email and no way to
// recover short of a one-off script.
//
// Internal-or-admin, matching the other write actions on this page (relink,
// generate project quote).
// ---------------------------------------------------------------------------

export type ResendResult =
  | { ok: true; sentTo: string }
  | { ok: false; error: string };

export async function adminResendSubmissionNotification(
  submissionId: string,
): Promise<ResendResult> {
  if (!z.string().uuid().safeParse(submissionId).success) {
    return { ok: false, error: "Invalid submission id." };
  }

  const gate = await requireAdminOrInternal();
  if (!gate.ok) {
    return { ok: false, error: "You do not have permission to perform this action." };
  }

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  const { data: sub, error: loadError } = await supabase
    .from("submissions")
    .select("partner_id, on_behalf_of_partner_id, on_behalf_of_company_name")
    .eq("id", submissionId)
    .maybeSingle();
  if (loadError) return { ok: false, error: "Could not load this submission." };
  if (!sub) return { ok: false, error: "Submission not found." };

  const pdfInput = await loadSubmissionPdfInput(submissionId, supabase);
  if (!pdfInput) return { ok: false, error: "Could not load this submission's data." };

  // Recipient identity: the on-behalf target when set, else the creating rep —
  // never the caller. loadSubmissionPdfInput's own partner.email is the
  // AUTHENTICATED VIEWER's address (a documented limitation of the download
  // route, where viewer === owner); that does not hold for an admin resending
  // someone else's submission, so it is resolved fresh here.
  const identityUserId = sub.on_behalf_of_partner_id ?? sub.partner_id;
  let partnerEmail: string | undefined;
  if (!sub.on_behalf_of_company_name) {
    try {
      const u = await admin.auth.admin.getUserById(identityUserId);
      partnerEmail = u.data.user?.email ?? undefined;
    } catch {
      // No resolvable email → sales-only send, same as a fresh submit would do.
      partnerEmail = undefined;
    }
  }
  pdfInput.partner.email = partnerEmail ?? "(no email on file)";

  let pdfBuffer: Buffer | undefined;
  try {
    pdfBuffer = await renderSubmissionPdfBuffer(pdfInput);
  } catch (err) {
    console.error("submission PDF render failed (resend)", err);
  }

  const retention = retentionSummary(pdfInput.groups.map((g) => g.retentionDays));

  try {
    await sendSubmissionNotification({
      partner: {
        companyName: pdfInput.partner.companyName,
        contactName: pdfInput.partner.contactName,
        email: pdfInput.partner.email,
      },
      projectName: pdfInput.projectName,
      totals: {
        cameras: pdfInput.totals.cameras,
        bandwidthMbps: pdfInput.totals.bandwidthMbps,
        storageGb: pdfInput.totals.storageGb,
        recordedStorageGb: (pdfInput.recordedStorageTb ?? 0) * GB_PER_TB,
        retentionLabel: retention.label,
      },
      utilizationPct: pdfInput.maxDiskUtilizationPct ?? UTILIZATION_DEFAULT_PCT,
      vms: pdfInput.vms,
      recommendation: {
        winner: {
          units: pdfInput.recommendation.units,
          productGroup: pdfInput.recommendation.modelCode,
          coveredCameras: pdfInput.recommendation.coveredCameras,
          coveredStorageTb: pdfInput.recommendation.coveredStorageTb,
        },
        warnings: pdfInput.recommendation.warnings,
      },
      submissionId,
      pdfBuffer,
      pdfFilename: pdfBuffer ? pdfFilename(pdfInput) : undefined,
      partnerEmail,
    });
  } catch (err) {
    console.error("submission notification resend failed", { submissionId, error: err });
    return {
      ok: false,
      error: "The email failed to send. Check server logs for the underlying error.",
    };
  }

  // Best-effort — the email already sent by this point either way, so a stamp
  // failure here must not be reported as a send failure.
  await supabase
    .from("submissions")
    .update({ email_sent_at: new Date().toISOString() })
    .eq("id", submissionId);

  revalidatePath(`/admin/submissions/${submissionId}`);
  return {
    ok: true,
    sentTo: partnerEmail ?? "sales only — no partner email on file",
  };
}
