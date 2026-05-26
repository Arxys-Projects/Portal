import "server-only";
import { env } from "@/lib/env";
import { getMailer } from "./transport";

export type DealRegistrationInput = {
  projectName: string;
  notes: string;
  partner: {
    id: string;
    company_name: string;
    contact_name: string;
    email: string;
  };
};

function buildBody(input: DealRegistrationInput): string {
  const { projectName, notes, partner } = input;
  return [
    "New deal registration request:",
    "",
    `Partner: ${partner.company_name}`,
    `Contact: ${partner.contact_name}`,
    `Email: ${partner.email}`,
    `Partner ID: ${partner.id}`,
    "",
    `Project: ${projectName}`,
    "",
    "Notes:",
    notes || "(none)",
  ].join("\n");
}

export async function sendDealRegistrationEmail(
  input: DealRegistrationInput,
): Promise<void> {
  const mailer = getMailer();
  await mailer.sendMail({
    from: env.SMTP_FROM,
    to: env.INTERNAL_NOTIFICATION_EMAIL,
    subject: `Deal Registration: ${input.projectName} — ${input.partner.company_name}`,
    text: buildBody(input),
  });
}
