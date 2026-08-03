"use server";

// /projects server actions. Every one of these is a thin, internal-gated
// wrapper around logic that already exists elsewhere in the codebase — this
// page reuses the archive writes (ADR 0112), the cache refresh (ADR 0113),
// the relink recovery path (ADR 0093 step 3) and the Project Quote generate
// flow (Phase 10) rather than re-implementing any of them. The only genuinely
// new piece is the Generate dialog's live line-item preview, which reads
// Pipedrive but writes nothing.

import { revalidatePath } from "next/cache";
import { requireAdminOrInternal } from "@/lib/auth/require-admin-or-internal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { archiveProject, restoreProject } from "@/lib/projects/archive";
import { projectQueueDealIds } from "@/lib/projects/queue";
import { refreshDealCache } from "@/lib/projects/pipedrive-cache";
import { getDealForQuote } from "@/lib/pipedrive/quote";
import { adminRelinkPipedriveDeal, type RelinkResult } from "@/app/(app)/admin/submissions/actions";
import { generateProjectQuote } from "@/app/(app)/admin/submissions/[id]/project-quote-actions";
import type { GenerateProjectQuoteResult } from "@/lib/project-quote/generate";

const NOT_AUTHORIZED = "You do not have permission to do that.";

export type SimpleResult = { ok: true } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// ↻ Refresh — the one control that makes Pipedrive calls on this page. A
// plain page navigation never does (queue.ts's refresh: "none"); this is the
// user deliberately choosing to pay that cost.
// ---------------------------------------------------------------------------
export async function refreshProjectsAction(): Promise<SimpleResult> {
  const gate = await requireAdminOrInternal();
  if (!gate.ok) return { ok: false, error: NOT_AUTHORIZED };

  const supabase = await createSupabaseServerClient();
  const dealIds = await projectQueueDealIds(supabase);
  if (dealIds.length > 0) {
    await refreshDealCache(supabase, dealIds, { now: new Date() });
  }

  revalidatePath("/projects");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Archive / restore (ADR 0112) — the row's Archive confirm, the archived
// strip's Undo, and slot 1's "Restore to my queue" all call these two.
// ---------------------------------------------------------------------------
export async function archiveProjectAction(submissionId: string): Promise<SimpleResult> {
  const gate = await requireAdminOrInternal();
  if (!gate.ok) return { ok: false, error: NOT_AUTHORIZED };

  const supabase = await createSupabaseServerClient();
  const result = await archiveProject(supabase, submissionId, gate.userId);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/projects");
  return { ok: true };
}

export async function restoreProjectAction(submissionId: string): Promise<SimpleResult> {
  const gate = await requireAdminOrInternal();
  if (!gate.ok) return { ok: false, error: NOT_AUTHORIZED };

  const supabase = await createSupabaseServerClient();
  const result = await restoreProject(supabase, submissionId);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/projects");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Retry Pipedrive link (ADR 0093 step 3) — reuses the admin action verbatim
// and additionally revalidates /projects, which that action does not know
// about.
// ---------------------------------------------------------------------------
export async function relinkPipedriveAction(submissionId: string): Promise<RelinkResult> {
  const result = await adminRelinkPipedriveDeal(submissionId);
  if (result.ok) revalidatePath("/projects");
  return result;
}

// ---------------------------------------------------------------------------
// Generate Project Proposal — reuses the existing internal-only action
// verbatim (assemble → persist → render → deliver) and additionally
// revalidates /projects.
// ---------------------------------------------------------------------------
export async function generateProposalAction(
  submissionId: string,
): Promise<GenerateProjectQuoteResult> {
  const result = await generateProjectQuote(submissionId);
  if (result.ok) revalidatePath("/projects");
  return result;
}

// ---------------------------------------------------------------------------
// The Generate dialog's "trust loop" — a live, read-only Pipedrive read so he
// sees the exact lines the PDF will contain before committing a version
// number. Never writes anything; the real generate re-reads the deal itself
// (assembleProjectQuoteSnapshot), so this preview cannot go stale in a way
// that produces a wrong document — it can only fail to load.
// ---------------------------------------------------------------------------
export type DealPreviewLine = {
  label: string;
  quantity: number | null;
  unitPrice: number | null;
  lineAmount: number | null;
};

export type DealPreviewResult =
  | {
      ok: true;
      readAt: string;
      lines: DealPreviewLine[];
      total: number | null;
      currency: string | null;
    }
  | { ok: false; error: string };

export async function previewDealForGenerateAction(dealId: number): Promise<DealPreviewResult> {
  const gate = await requireAdminOrInternal();
  if (!gate.ok) return { ok: false, error: NOT_AUTHORIZED };
  if (!Number.isInteger(dealId) || dealId <= 0) {
    return { ok: false, error: "Invalid deal id." };
  }

  const result = await getDealForQuote(dealId);
  if (!result.ok) {
    const messages: Record<typeof result.error.kind, string> = {
      not_found: "That deal could not be found in Pipedrive.",
      auth: "Pipedrive rejected the request. Check the integration credentials.",
      rate_limit: "Pipedrive rate-limited the request. Try again in a moment.",
      network: "Could not reach Pipedrive. Try again in a moment.",
      api: "Pipedrive returned an error reading this deal.",
    };
    return { ok: false, error: messages[result.error.kind] };
  }

  return {
    ok: true,
    readAt: new Date().toISOString(),
    lines: result.deal.lineItems.map((line) => ({
      label: line.productCode ?? line.productName ?? `Product ${line.productId}`,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineAmount: line.lineAmount,
    })),
    total: result.deal.productTotal,
    currency: result.deal.currency,
  };
}
