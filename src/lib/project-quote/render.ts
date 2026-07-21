import "server-only";
import { type DocumentProps, renderToBuffer } from "@react-pdf/renderer";
import { type ReactElement, createElement } from "react";
import { loadLogoDataUri, loadPngDataUriByPath } from "../pdf/assets";
import { ProjectQuotePdf, type ProjectQuotePdfInput } from "./ProjectQuotePdf";
import { assembleCustomerProposalCommercial } from "./customer-proposal";
import type { ProjectQuoteSnapshot } from "./types";
import { customerProposalTitle, projectQuoteTitle } from "./title";

export { projectQuoteTitle, customerProposalTitle };

// Which document to render from the shared snapshot (ADR 0089).
export type ProjectQuoteVariant = "project-quote" | "customer-proposal";

// Suggested filename for the downloaded PDF (Project Quote — partner pricing).
export function projectQuotePdfFilename(snapshot: ProjectQuoteSnapshot): string {
  return `${projectQuoteTitle(snapshot)}.pdf`;
}

// Suggested filename for the Customer Proposal (end-customer, no partner/discount).
export function customerProposalPdfFilename(snapshot: ProjectQuoteSnapshot): string {
  return `${customerProposalTitle(snapshot)}.pdf`;
}

// Filename for a given variant.
export function projectQuoteVariantFilename(
  snapshot: ProjectQuoteSnapshot,
  variant: ProjectQuoteVariant,
): string {
  return variant === "customer-proposal"
    ? customerProposalPdfFilename(snapshot)
    : projectQuotePdfFilename(snapshot);
}

export type RenderProjectQuoteOptions = {
  // Which document. Defaults to the Project Quote (unchanged legacy behavior).
  variant?: ProjectQuoteVariant;
  // Partner logo as a base64 data URI (center header), resolved LIVE at download
  // time from the owning partner's logo_path — not frozen in the snapshot, since
  // it is a branding overlay, not quote content (ADR 0089 §5 / determinism note).
  // null renders a blank, non-shifting header slot.
  partnerLogoDataUri?: string | null;
};

// Render a stored Project Quote snapshot to a PDF buffer. The snapshot is the
// single content contract — no Supabase, no Pipedrive, no live PRICING pull
// (ADR 0060). The only live input is the optional partner logo overlay, passed
// in by the caller. For the Customer Proposal variant, the commercial half is
// run through assembleCustomerProposalCommercial FIRST, so the component never
// receives a partner/discount value (ADR 0089 §2).
export async function renderProjectQuotePdfBuffer(
  snapshot: ProjectQuoteSnapshot,
  options: RenderProjectQuoteOptions = {},
): Promise<Buffer> {
  const { variant = "project-quote", partnerLogoDataUri = null } = options;
  const logoDataUri = loadLogoDataUri();

  // Frozen showcase paths → bytes at render (ADR 0060). Guard the field: rows
  // frozen while the showcase was removed (ADR 0065 → 0066) have no `showcase`.
  const showcase = snapshot.showcase ?? [];
  const showcaseHeroDataUris = showcase.map((item) =>
    item.heroImagePath ? loadPngDataUriByPath(item.heroImagePath) : null,
  );

  const shared = {
    sizing: snapshot.sizing,
    showcase,
    terms: snapshot.terms,
    generation: snapshot.generation,
    logoDataUri,
    partnerLogoDataUri,
    showcaseHeroDataUris,
  };

  const input: ProjectQuotePdfInput =
    variant === "customer-proposal"
      ? {
          ...shared,
          variant: "customer-proposal",
          commercial: assembleCustomerProposalCommercial(snapshot.commercial),
        }
      : { ...shared, variant: "project-quote", commercial: snapshot.commercial };

  // ProjectQuotePdf returns a <Document>, cast through unknown to satisfy
  // renderToBuffer's signature — same pattern as renderSubmissionPdfBuffer.
  const element = createElement(
    ProjectQuotePdf,
    { data: input },
  ) as unknown as ReactElement<DocumentProps>;
  return renderToBuffer(element);
}
