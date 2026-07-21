import type { ProjectQuoteSnapshot } from "./types";

// Strip characters illegal in filenames / deal titles and collapse whitespace.
export function sanitizeFilenamePart(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Shared title parts for both documents. Company / project / date are common;
// only the leading label differs. The company name is intentionally KEPT on the
// Customer Proposal (ADR 0089 / decision 2026-07-20): the partner is not gated
// from seeing who a document is prepared for. What is scrubbed from the customer
// document is pricing/discount, which never appears in the title anyway (the
// title carries only company, project, deal id, version, date).
function titleParts(snapshot: ProjectQuoteSnapshot): {
  company: string;
  project: string;
  dealId: number;
  version: number;
  date: string;
} {
  const company =
    sanitizeFilenamePart(
      snapshot.sizing.partner.companyName ||
        snapshot.commercial.organization?.name ||
        "",
    ) || "Arxys";
  const project =
    sanitizeFilenamePart(snapshot.sizing.projectName || "") || "Untitled Project";
  const date = snapshot.generation.generatedAt.slice(0, 10);
  return {
    company,
    project,
    dealId: snapshot.generation.dealId,
    version: snapshot.generation.version,
    date,
  };
}

// Canonical base title for both the PDF filename and the Pipedrive deal title.
// Format: Arxys Quote - {Company} - {Project} - {DealID} - V{#} - {YYYY-MM-DD}
// The date is the UTC calendar date of generatedAt (first 10 chars of the ISO timestamp).
export function projectQuoteTitle(snapshot: ProjectQuoteSnapshot): string {
  const { company, project, dealId, version, date } = titleParts(snapshot);
  return `Arxys Quote - ${company} - ${project} - ${dealId} - V${version} - ${date}`;
}

// Customer Proposal filename base. Same identity parts, "Customer Proposal"
// label instead of "Quote" — no partner/discount reference (ADR 0089 §3).
export function customerProposalTitle(snapshot: ProjectQuoteSnapshot): string {
  const { company, project, dealId, version, date } = titleParts(snapshot);
  return `Arxys Customer Proposal - ${company} - ${project} - ${dealId} - V${version} - ${date}`;
}
