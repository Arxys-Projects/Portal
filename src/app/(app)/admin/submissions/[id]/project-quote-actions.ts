"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assembleProjectQuoteSnapshot } from "@/lib/project-quote/assemble";
import {
  projectQuotePdfFilename,
  projectQuoteTitle,
  renderProjectQuotePdfBuffer,
} from "@/lib/project-quote/render";
import {
  generateProjectQuoteCore,
  type GenerateProjectQuoteResult,
} from "@/lib/project-quote/generate";
import { pipedriveClient } from "@/lib/pipedrive/client";
import { resolveSubmissionOwnerLogoDataUri } from "@/lib/storage/partner-logo";

// ===========================================================================
// Generate Project Quote — internal-only server action (Phase 10 Step 6).
//
// The thin "use server" wrapper around generateProjectQuoteCore: it enforces
// the internal-caller gate server-side (defense-in-depth; the button also never
// renders for non-internal users), supplies the real assemble / render / deliver
// dependencies, and revalidates the detail page on success. All the branch,
// retry, and resilience logic lives in the injected, unit-tested core.
// ===========================================================================

const SESSION_EXPIRED = "Your session has expired. Sign in and try again.";
const NOT_INTERNAL = "You do not have permission to generate Project Quotes.";

export async function generateProjectQuote(
  submissionId: string,
): Promise<GenerateProjectQuoteResult> {
  if (typeof submissionId !== "string" || submissionId.length === 0) {
    return { ok: false, error: NOT_INTERNAL };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: SESSION_EXPIRED };

  // Internal-only, enforced here and not just in the UI. Mirrors the RLS gate
  // (is_internal OR is_admin) and the submitCalculation caller-status check:
  // the partner must be active AND internal (or an admin). A non-internal
  // caller, or a suspended one, is refused even on a crafted POST. RLS on
  // project_quotes enforces the same on the INSERT as a second layer.
  const { data: caller } = await supabase
    .from("partners")
    .select("role, status, is_internal")
    .eq("id", user.id)
    .maybeSingle<{ role: string; status: string; is_internal: boolean }>();
  const allowed =
    caller?.status === "active" && (caller.is_internal === true || caller.role === "admin");
  if (!allowed) return { ok: false, error: NOT_INTERNAL };

  // ADR 0089 (decision 2026-07-20): brand the Pipedrive-attached Project Quote
  // with the owning partner's logo too. Resolved once here (live, not frozen);
  // null degrades to a blank header slot, so a partner with no logo is
  // unaffected. Non-fatal by construction — a null just means no logo.
  const partnerLogoDataUri = await resolveSubmissionOwnerLogoDataUri(supabase, submissionId);

  const result = await generateProjectQuoteCore(submissionId, {
    supabase,
    assemble: (sid) => assembleProjectQuoteSnapshot(sid, supabase),
    render: (snapshot) => renderProjectQuotePdfBuffer(snapshot, { partnerLogoDataUri }),
    filename: (snapshot) => projectQuotePdfFilename(snapshot),
    deliver: (dealId, filename, buffer) => pipedriveClient.addDealFile(dealId, filename, buffer),
    updateDealTitle: (dealId, newTitle) =>
      pipedriveClient.updateDeal(dealId, { title: newTitle }),
  });

  // Re-render the detail page so the new current version / expiry / download
  // link appear. Only on success: a refused or failed generate leaves the page
  // unchanged.
  if (result.ok) revalidatePath(`/admin/submissions/${submissionId}`);
  return result;
}
