"use server";

import { z } from "zod";
import { NOT_ACTIVE_MESSAGE, requireActive } from "@/lib/auth/viewer";
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
  };

  const parsed = DealRegSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { status: "error", message: first?.message ?? "Invalid input." };
  }

  const { projectName, notes } = parsed.data;

  // Active partners only (ADR 0164).
  const gate = await requireActive();
  if (!gate.ok) {
    return {
      status: "error",
      message: gate.reason === "unauthenticated" ? "Not authenticated." : NOT_ACTIVE_MESSAGE,
    };
  }
  const { user, partner } = gate.viewer;

  try {
    await sendDealRegistrationEmail({
      projectName,
      notes: notes ?? "",
      partner: {
        id: user.id,
        company_name: partner.company_name as string,
        contact_name: partner.contact_name as string,
        email: user.email ?? "",
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
