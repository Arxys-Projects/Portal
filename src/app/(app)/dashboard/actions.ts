"use server";

import { z } from "zod";
import { sendDealRegistrationEmail } from "@/lib/email/deal-registration";

const DealRegSchema = z.object({
  projectName: z
    .string()
    .min(3, "Project name must be at least 3 characters")
    .max(200, "Project name must be 200 characters or fewer"),
  notes: z
    .string()
    .max(1000, "Notes must be 1000 characters or fewer")
    .optional(),
  partnerId: z.string().min(1),
  companyName: z.string(),
  contactName: z.string(),
  partnerEmail: z.string(),
});

export type DealRegState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: string };

export async function registerDealAction(
  _prev: DealRegState,
  formData: FormData,
): Promise<DealRegState> {
  const raw = {
    projectName: formData.get("projectName"),
    notes: formData.get("notes") ?? undefined,
    partnerId: formData.get("partnerId"),
    companyName: formData.get("companyName"),
    contactName: formData.get("contactName"),
    partnerEmail: formData.get("partnerEmail"),
  };

  const parsed = DealRegSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { status: "error", message: first?.message ?? "Invalid input." };
  }

  const { projectName, notes, partnerId, companyName, contactName, partnerEmail } =
    parsed.data;

  try {
    await sendDealRegistrationEmail({
      projectName,
      notes: notes ?? "",
      partner: {
        id: partnerId,
        company_name: companyName,
        contact_name: contactName,
        email: partnerEmail,
      },
    });
  } catch (err) {
    console.error("deal-reg email failed", err);
    return {
      status: "error",
      message: "Failed to send registration — please try again or email sales@arxys.com.",
    };
  }

  return { status: "success" };
}
