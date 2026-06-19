import "server-only";
import { env } from "@/lib/env";
import { getMailer } from "./transport";
import type { RecommendationResult } from "@/lib/recommend/types";

export type SubmissionNotificationInput = {
  partner: { companyName: string; contactName: string; email: string };
  projectName: string | null;
  totals: {
    cameras: number;
    bandwidthMbps: number;
    storageGb: number;
    retentionDays: number;
  };
  vms: string | null;
  recommendation: RecommendationResult;
  submissionId: string;
  // Optional PDF attachment. Same buffer is attached to both sales and
  // partner messages when present. Step 6 (PDF generation) wires this in;
  // when it's omitted the sender behaves exactly like Step 5.
  pdfBuffer?: Buffer;
  pdfFilename?: string;
  // Optional partner-facing recipient. Per ADR 0018 (supersedes 0014),
  // when present the partner receives their own copy of the report.
  // When omitted the sender behaves exactly like Step 5 (sales only).
  partnerEmail?: string;
};

function fmtNumber(n: number, decimals = 2): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function buildSalesBody(input: SubmissionNotificationInput): string {
  const { partner, projectName, totals, vms, recommendation } = input;
  const { winner } = recommendation;
  const lines = [
    "New Arxys Portal calculation submission",
    "",
    `Partner: ${partner.companyName} — ${partner.contactName} <${partner.email}>`,
    `Project: ${projectName ?? "(unnamed)"}`,
    `Submission ID: ${input.submissionId}`,
    "",
    "Workload totals",
    `  Cameras:    ${totals.cameras}`,
    `  Bandwidth:  ${fmtNumber(totals.bandwidthMbps)} Mbit/s`,
    `  Storage:    ${fmtNumber(totals.storageGb)} GB (incl. 20% overhead)`,
    `  Retention:  ${totals.retentionDays} days`,
    `  VMS:        ${vms ?? "(not specified)"}`,
    "",
    "Recommended configuration",
    `  ${winner.units} × ${winner.productGroup}`,
    `  Coverage: ${winner.coveredCameras} cameras, ${fmtNumber(winner.coveredStorageTb)} TB`,
  ];
  if (recommendation.warnings.length > 0) {
    lines.push("", "Warnings");
    for (const w of recommendation.warnings) lines.push(`  - ${w}`);
  }
  lines.push("", "Open in portal: https://portal.arxys.com/dashboard");
  return lines.join("\n");
}

function buildPartnerBody(input: SubmissionNotificationInput): string {
  const { partner, projectName, totals, recommendation } = input;
  const { winner } = recommendation;
  const lines = [
    `Hi ${partner.contactName || "there"},`,
    "",
    "Thanks for using the Arxys Video Storage & Bandwidth Calculator.",
    "Your saved report is attached as a PDF.",
    "",
    `Project: ${projectName ?? "(unnamed)"}`,
    "",
    "Workload totals",
    `  Cameras:    ${totals.cameras}`,
    `  Bandwidth:  ${fmtNumber(totals.bandwidthMbps)} Mbit/s`,
    `  Storage:    ${fmtNumber(totals.storageGb)} GB (includes 20% overhead)`,
    `  Retention:  ${totals.retentionDays} days`,
    "",
    "Recommended configuration",
    `  ${winner.units} × ${winner.productGroup}`,
    `  Coverage: ${winner.coveredCameras} cameras, ${fmtNumber(winner.coveredStorageTb)} TB`,
    "",
    "Arxys sales has also received a copy of this report and will be in touch.",
    "Questions in the meantime: sales@arxys.com · 619.258.7800",
    "",
    "— Arxys",
  ];
  return lines.join("\n");
}

export async function sendSubmissionNotification(input: SubmissionNotificationInput): Promise<void> {
  const mailer = getMailer();
  const salesSubject = `Arxys Portal — new submission from ${input.partner.companyName}`;

  // INTERNAL_NOTIFICATION_EMAIL is a Google Group (sales@arxys.com) and SMTP_USER
  // is a member of that group. Google Groups suppresses delivery back to the
  // sender, so SMTP_USER never receives the group fan-out. BCC SMTP_USER to give
  // them a direct copy that bypasses the loopback rule. Skip when SMTP_USER is
  // the same address as the To: target (otherwise the recipient gets two copies).
  // ADR 0015.
  const bcc =
    env.SMTP_USER.toLowerCase() !== env.INTERNAL_NOTIFICATION_EMAIL.toLowerCase()
      ? env.SMTP_USER
      : undefined;

  const attachments =
    input.pdfBuffer && input.pdfFilename
      ? [
          {
            filename: input.pdfFilename,
            content: input.pdfBuffer,
            contentType: "application/pdf",
          },
        ]
      : undefined;

  // Sales notification — preserves Step 5 behaviour (ADR 0015 BCC included).
  await mailer.sendMail({
    from: env.SMTP_FROM,
    to: env.INTERNAL_NOTIFICATION_EMAIL,
    bcc,
    subject: salesSubject,
    text: buildSalesBody(input),
    attachments,
  });

  // Partner-facing notification — separate sendMail call so the To/Subject/Body
  // stay clean and the failure modes don't bleed into the sales path. Per
  // ADR 0018, BCC SMTP_USER on this message too so the credential owner has a
  // durable audit copy of every partner-facing send.
  if (input.partnerEmail) {
    try {
      await mailer.sendMail({
        from: env.SMTP_FROM,
        to: input.partnerEmail,
        bcc,
        subject: "Your Arxys Video Storage Report",
        text: buildPartnerBody(input),
        attachments,
      });
    } catch (err) {
      // Partner-send failure must not surface as a sales-send failure — sales
      // already received the report by the time we got here. Log and move on.
      console.error("partner submission notification failed", err);
    }
  }
}
