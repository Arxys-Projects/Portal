import "server-only";
import { type DocumentProps, renderToBuffer } from "@react-pdf/renderer";
import { type ReactElement, createElement } from "react";
import { loadLogoDataUri, loadPngDataUriByPath } from "../pdf/assets";
import { ProjectQuotePdf, type ProjectQuotePdfInput } from "./ProjectQuotePdf";
import type { ProjectQuoteSnapshot } from "./types";

// Strip characters illegal in filenames across Windows / macOS / Linux and
// collapse whitespace so a company or project name cannot break a file path.
function sanitizeFilenamePart(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Suggested filename for the downloaded PDF.
export function projectQuotePdfFilename(snapshot: ProjectQuoteSnapshot): string {
  const company =
    sanitizeFilenamePart(
      snapshot.sizing.partner.companyName ||
        snapshot.commercial.organization?.name ||
        "",
    ) || "Arxys";
  return `Arxys Project Quote - ${company} - ${snapshot.generation.identifier}.pdf`;
}

// Render a stored Project Quote snapshot to a PDF buffer. The snapshot is
// the single input contract — no Supabase, no Pipedrive, no live data pull.
// Image paths frozen in the snapshot are loaded from /public at render time
// (the path is a version-controlled asset, not external mutating state; see
// ADR 0060 for why bytes are not frozen in the snapshot row).
export async function renderProjectQuotePdfBuffer(
  snapshot: ProjectQuoteSnapshot,
): Promise<Buffer> {
  const logoDataUri = loadLogoDataUri();

  const primaryHeroDataUri = snapshot.sizing.primaryServerHeroImagePath
    ? loadPngDataUriByPath(snapshot.sizing.primaryServerHeroImagePath)
    : null;

  // Frozen showcase paths → bytes at render (ADR 0060). Guard the field: rows
  // frozen while the showcase was removed (ADR 0065 → 0066) have no `showcase`.
  const showcaseHeroDataUris = (snapshot.showcase ?? []).map((item) =>
    item.heroImagePath ? loadPngDataUriByPath(item.heroImagePath) : null,
  );

  const input: ProjectQuotePdfInput = {
    snapshot,
    logoDataUri,
    primaryHeroDataUri,
    showcaseHeroDataUris,
  };

  // ProjectQuotePdf returns a <Document>, cast through unknown to satisfy
  // renderToBuffer's signature — same pattern as renderSubmissionPdfBuffer.
  const element = createElement(
    ProjectQuotePdf,
    { data: input },
  ) as unknown as ReactElement<DocumentProps>;
  return renderToBuffer(element);
}
