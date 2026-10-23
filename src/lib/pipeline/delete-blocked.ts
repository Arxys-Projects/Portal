// Why an admin's submission delete was refused with 23503 (foreign key).
//
// Four tables keep a submission with `on delete restrict`: a generated Project
// Quote, a project deal claim (the calc a portal-built deal was made from), the
// deal-line ledger, and a pricing confirmation. Postgres names the referencing
// table in the error ("... on table \"project_quotes\""), so the message says
// which one it was instead of always blaming a quote.

const BLOCKERS: [table: string, reason: string][] = [
  ["project_quotes", "a Project Quote has been generated from it"],
  ["project_deal_claims", "a Pipedrive deal was built from it"],
  ["deal_line_syncs", "the portal added lines to a Pipedrive deal from it"],
  ["quote_pricing_confirmations", "a deal's pricing was confirmed from it"],
];

export function deleteBlockedMessage(error: { message?: string | null; details?: string | null }): string {
  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  const hit = BLOCKERS.find(([table]) => text.includes(`table "${table}"`));
  return hit
    ? `This submission can't be deleted because ${hit[1]}.`
    : "This submission can't be deleted because other records still point to it.";
}
