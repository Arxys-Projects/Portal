"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { requireStaff } from "@/lib/auth/viewer";
import { assembleProjectQuoteSnapshot } from "@/lib/project-quote/assemble";
import {
  projectQuotePdfFilename,
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

  // Internal-only, enforced here and not just in the UI. Mirrors the RLS gate
  // (is_internal OR is_admin): the partner must be active AND internal (or an
  // admin). A non-internal caller, or a suspended one, is refused even on a
  // crafted POST. RLS on project_quotes enforces the same on the INSERT as a
  // second layer.
  const gate = await requireStaff();
  if (!gate.ok) {
    return {
      ok: false,
      error: gate.reason === "unauthenticated" ? SESSION_EXPIRED : NOT_INTERNAL,
    };
  }
  const supabase = await createSupabaseServerClient();

  // ADR 0089 (decision 2026-07-20): brand the Pipedrive-attached Project Quote
  // with the owning partner's logo too. Resolved once here (live, not frozen);
  // null degrades to a blank header slot, so a partner with no logo is
  // unaffected. Non-fatal by construction — a null just means no logo.
  const partnerLogoDataUri = await resolveSubmissionOwnerLogoDataUri(supabase, submissionId);

  const result = await generateProjectQuoteCore(submissionId, {
    supabase,
    // Service role for the Step 6 reads (pricing gate, project "Prepared for").
    assemble: (sid) =>
      assembleProjectQuoteSnapshot(sid, supabase, {
        admin: createSupabaseAdminClient(),
        pipedriveToken: env.PIPEDRIVE_API_TOKEN,
      }),
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
