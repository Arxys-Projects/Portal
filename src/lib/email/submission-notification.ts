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
};

function fmtNumber(n: number, decimals = 2): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function buildBody(input: SubmissionNotificationInput): string {
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
    `  Bandwidth:  ${fmtNumber(totals.bandwidthMbps)} Mbps`,
    `  Storage:    ${fmtNumber(totals.storageGb)} GB (incl. 20% overhead)`,
    `  Retention:  ${totals.retentionDays} days`,
    `  VMS:        ${vms ?? "(not specified)"}`,
    "",
    "Recommended configuration",
    `  ${winner.units} × ${winner.modelCode}`,
    `  Coverage: ${winner.coveredCameras} cameras, ${fmtNumber(winner.coveredStorageTb)} TB`,
  ];
  if (recommendation.warnings.length > 0) {
    lines.push("", "Warnings");
    for (const w of recommendation.warnings) lines.push(`  - ${w}`);
  }
  lines.push("", "Open in portal: https://portal.arxys.com/dashboard");
  return lines.join("\n");
}

export async function sendSubmissionNotification(input: SubmissionNotificationInput): Promise<void> {
  const mailer = getMailer();
  const subject = `Arxys Portal — new submission from ${input.partner.companyName}`;

  // INTERNAL_NOTIFICATION_EMAIL is a Google Group (sales@arxys.com) and SMTP_USER
  // is a member of that group. Google Groups suppresses delivery back to the
  // sender, so SMTP_USER never receives the group fan-out. BCC SMTP_USER to give
  // them a direct copy that bypasses the loopback rule. Skip when SMTP_USER is
  // the same address as the To: target (otherwise the recipient gets two copies).
  const bcc =
    env.SMTP_USER.toLowerCase() !== env.INTERNAL_NOTIFICATION_EMAIL.toLowerCase()
      ? env.SMTP_USER
      : undefined;

  await mailer.sendMail({
    from: env.SMTP_FROM,
    to: env.INTERNAL_NOTIFICATION_EMAIL,
    bcc,
    subject,
    text: buildBody(input),
  });
}
