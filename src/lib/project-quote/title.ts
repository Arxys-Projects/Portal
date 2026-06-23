import type { ProjectQuoteSnapshot } from "./types";

// Strip characters illegal in filenames / deal titles and collapse whitespace.
export function sanitizeFilenamePart(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Canonical base title for both the PDF filename and the Pipedrive deal title.
// Format: Arxys Quote - {Company} - {Project} - {DealID} - V{#} - {YYYY-MM-DD}
// The date is the UTC calendar date of generatedAt (first 10 chars of the ISO timestamp).
export function projectQuoteTitle(snapshot: ProjectQuoteSnapshot): string {
  const company =
    sanitizeFilenamePart(
      snapshot.sizing.partner.companyName ||
        snapshot.commercial.organization?.name ||
        "",
    ) || "Arxys";
  const project =
    sanitizeFilenamePart(snapshot.sizing.projectName || "") || "Untitled Project";
  const date = snapshot.generation.generatedAt.slice(0, 10);
  return `Arxys Quote - ${company} - ${project} - ${snapshot.generation.dealId} - V${snapshot.generation.version} - ${date}`;
}
