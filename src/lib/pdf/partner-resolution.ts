// Pure partner-display resolution for the System Estimate PDF.
// Extracted here (no `server-only`) so unit tests can import it directly.
//
// Three-tier precedence (applied to both the PDF and any other reader that
// shows a partner attribution on a submission):
//   1. on_behalf_of_partner_id → resolved FK target (company + contact from partners table)
//   2. on_behalf_of_company_name → free-text name, contact unknown (non-onboarded partner)
//   3. creating partner (partner_id) → existing behavior

export type SubmissionPartnerResolutionInput = {
  on_behalf_of_partner_id: string | null;
  on_behalf_of_company_name: string | null;
};

export type ResolvedPartner = {
  companyName: string;
  contactName: string;
};

type PartnerRow = { company_name: string; contact_name: string } | null;

/**
 * Resolve the display partner for a submission.
 *
 * @param submission  The two on-behalf-of columns from the submission row.
 * @param onBehalfRow Partner row for `on_behalf_of_partner_id` (or null if not set / not found).
 * @param creatingRow Partner row for `partner_id` (the creating rep).
 */
export function resolveSubmissionPartner(
  submission: SubmissionPartnerResolutionInput,
  onBehalfRow: PartnerRow,
  creatingRow: PartnerRow,
): ResolvedPartner {
  // Tier 1: FK-linked on-behalf target
  if (submission.on_behalf_of_partner_id && onBehalfRow) {
    return {
      companyName: onBehalfRow.company_name ?? "(unknown)",
      contactName: onBehalfRow.contact_name ?? "(unknown)",
    };
  }
  // Tier 2: free-text on-behalf name (non-onboarded partner — no portal account)
  if (submission.on_behalf_of_company_name) {
    return {
      companyName: submission.on_behalf_of_company_name,
      contactName: "(not onboarded)",
    };
  }
  // Tier 3: creating partner (the rep who ran the calc for themselves)
  return {
    companyName: creatingRow?.company_name ?? "(unknown)",
    contactName: creatingRow?.contact_name ?? "(unknown)",
  };
}
