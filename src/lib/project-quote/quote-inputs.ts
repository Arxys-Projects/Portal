import "server-only";
import { getDealForQuote, type GetDealForQuoteResult } from "@/lib/pipedrive/quote";
import type { PdDealProduct } from "@/lib/pipedrive/client";
import { toQuoteLines } from "@/lib/projects/deal-lines";
import { checkQuoteGate, type PricingGateDeps } from "@/lib/projects/pricing-gate";
import { readProjectPreparedFor } from "./prepared-for";
import type { ProjectPreparedFor, ProjectQuotePricingGate } from "./types";

// The Project Portal Step 6 reads in front of a Project Quote (ADRs 0176,
// 0177): the pricing gate, the project's "Prepared for", and the deal itself.
//
// For a portal-built deal with PROJECT_QUOTE_GATE on, the gate reads the deal's
// lines ONCE, checks them against the latest confirmation, and the deal read
// below is handed those same lines, so the quote cannot show a line the gate
// did not check. Otherwise the deal is read exactly as before.

export type QuoteInputs =
  | {
      ok: true;
      dealResult: GetDealForQuoteResult;
      preparedFor: ProjectPreparedFor | null;
      pricingGate: ProjectQuotePricingGate | null;
    }
  | { ok: false; reason: "pricing_gate" | "project_read_error"; message: string };

export async function readQuoteInputs(
  deps: PricingGateDeps,
  submissionId: string,
  dealId: number,
  readDeal: (dealId: number, lines?: PdDealProduct[]) => Promise<GetDealForQuoteResult> = getDealForQuote,
): Promise<QuoteInputs> {
  const [gate, project] = await Promise.all([
    checkQuoteGate(deps, dealId, submissionId),
    readProjectPreparedFor(deps.admin, submissionId),
  ]);
  if (!("kind" in gate)) return { ok: false, reason: "pricing_gate", message: gate.message };
  if (project.status === "error") {
    console.error(`[project-quote prepared-for: ${project.context}]`, project.error);
    return {
      ok: false,
      reason: "project_read_error",
      message: "The project's company and contact could not be read. Try again in a moment.",
    };
  }

  const dealResult = gate.kind === "gated" ? await readDeal(dealId, toQuoteLines(gate.lines)) : await readDeal(dealId);
  return {
    ok: true,
    dealResult,
    preparedFor: project.status === "project" ? project.preparedFor : null,
    pricingGate: gate.kind === "gated" ? { confirmationId: gate.confirmationId, fingerprint: gate.fingerprint } : null,
  };
}
