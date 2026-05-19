import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/lib/env";

// Gmail SMTP transport per ADR 0002. SMTP_FROM is the "Send mail as" alias
// (noreply@arxys.com) configured on Andy's Workspace mailbox.

let cached: Transporter | null = null;

export function getMailer(): Transporter {
  if (cached) return cached;
  const port = Number.parseInt(env.SMTP_PORT, 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid SMTP_PORT: ${env.SMTP_PORT}`);
  }
  cached = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  return cached;
}
