"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createComparisonDeal } from "@/lib/pipedrive/deal";
import { PipedriveError } from "@/lib/pipedrive/client";
import { getMailer } from "@/lib/email/transport";
import { env } from "@/lib/env";

const quoteSchema = z.object({
  vendorName: z.string().min(1).max(100),
  vendorModelName: z.string().min(1).max(200),
  arxysModelId: z.string().min(1).max(50),
  serverCount: z.number().int().min(1).max(25),
});

export type QuoteState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "ok"; dealId: number }
  | { status: "error"; error: string };

export async function requestComparisonQuote(
  payload: unknown,
): Promise<QuoteState> {
  const parsed = quoteSchema.safeParse(payload);
  if (!parsed.success) {
    return { status: "error", error: "Invalid quote request payload." };
  }
  const input = parsed.data;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", error: "Not authenticated." };
  }

  const { data: partner } = await supabase
    .from("partners")
    .select("company_name, contact_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!partner) {
    return { status: "error", error: "Partner record not found." };
  }

  const partnerEmail = user.email ?? "";
  const companyName = partner.company_name as string;
  const contactName = partner.contact_name as string;

  const { data: catalogProduct } = await supabase
    .from("product_specs")
    .select("msrp")
    .eq("id", input.arxysModelId)
    .maybeSingle();

  if (!catalogProduct) {
    return { status: "error", error: "Arxys model not found in catalog." };
  }
  const catalogMsrp = catalogProduct.msrp as number;

  let dealId: number;
  try {
    const result = await createComparisonDeal({
      vendorName: input.vendorName,
      vendorModelName: input.vendorModelName,
      arxysModelId: input.arxysModelId,
      arxysMsrp: catalogMsrp,
      serverCount: input.serverCount,
      partner: { companyName, contactName, email: partnerEmail },
    });
    dealId = result.dealId;
  } catch (err) {
    const msg = err instanceof PipedriveError ? err.message : "Pipedrive deal creation failed.";
    console.error("comparison quote deal creation failed", err);
    return { status: "error", error: msg };
  }

  // Internal notification — no PDF attachment, no partner-facing email.
  try {
    const mailer = getMailer();
    const bcc =
      env.SMTP_USER.toLowerCase() !== env.INTERNAL_NOTIFICATION_EMAIL.toLowerCase()
        ? env.SMTP_USER
        : undefined;
    await mailer.sendMail({
      from: env.SMTP_FROM,
      to: env.INTERNAL_NOTIFICATION_EMAIL,
      bcc,
      subject: `Arxys Portal — comparison quote request from ${companyName}`,
      text: [
        "New comparison quote request from the Arxys Partner Portal.",
        "",
        `Partner: ${companyName} — ${contactName} <${partnerEmail}>`,
        `Competitor model: ${input.vendorName} ${input.vendorModelName}`,
        `Arxys match: ${input.arxysModelId}`,
        `Server count: ${input.serverCount}`,
        `Arxys MSRP: $${catalogMsrp.toLocaleString("en-US")}`,
        `Deal value: $${(catalogMsrp * input.serverCount).toLocaleString("en-US")}`,
        "",
        `Pipedrive deal ID: ${dealId}`,
        "Open in portal: https://portal.arxys.com/dashboard",
      ].join("\n"),
    });
  } catch (err) {
    // Email failure must not fail the quote request — deal is already created.
    console.error("comparison quote notification email failed", err);
  }

  return { status: "ok", dealId };
}
