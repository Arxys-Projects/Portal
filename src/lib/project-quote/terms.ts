import { createHash } from "node:crypto";
import type { ProjectQuoteTerms } from "./types";

// Project Quote — in-force Terms & Conditions.
//
// The Project Quote freezes the FULL terms text (not only a version stamp) into
// each snapshot, so an issued quote re-renders the exact legal text it was sent
// with even if these constants later change or a future versioned-terms store
// is introduced. Storing the version alone would make an old quote depend on an
// external terms archive still holding that version at re-render time, a
// fragile dependency that breaks the self-contained-reproduction premise the
// whole feature rests on (the same reasoning that drives the commercial
// snapshot, ADR 0060). The content hash lets us audit and detect drift and
// de-duplicate identical terms across version bumps.
//
// TEXT PROVENANCE: seeded from the Arxys disclaimer currently shown on the
// Price Book (src/app/(app)/price-book/page.tsx) and recorded in
// docs/old-phase-3-plan.md. Replace with the approved quote legal copy and set
// PROJECT_QUOTE_TERMS_VERSION to the in-force quote terms version before
// go-live; bump the version on every terms change.

export const PROJECT_QUOTE_TERMS_VERSION = "1.0";

export const PROJECT_QUOTE_TERMS_TEXT = [
  "Prices and specifications are subject to change without notice. All tariff taxes are passed on to buyers.",
  "Prices and quotes expire immediately upon issuance of new prices and quotes. Prices, specifications, and availability are superseded by the latest Arxys price list on that date.",
  "We put our best effort and knowledge into maintaining the accuracy of specifications and pricing. Should there be any discrepancies, we reserve the right to follow our specifications and pricing.",
  "In case of a newer component or part, we reserve the right to change to the newer part at our discretion.",
].join("\n\n");

// sha256 of the exact frozen text, carried alongside the text as an integrity
// stamp. Pure: same input always yields the same digest.
export function projectQuoteTermsSha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// The in-force terms, ready to freeze into a snapshot.
export function getProjectQuoteTerms(): ProjectQuoteTerms {
  return {
    version: PROJECT_QUOTE_TERMS_VERSION,
    text: PROJECT_QUOTE_TERMS_TEXT,
    sha256: projectQuoteTermsSha256(PROJECT_QUOTE_TERMS_TEXT),
  };
}
