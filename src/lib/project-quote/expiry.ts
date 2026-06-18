// Project Quote expiry — derived, never stored (ADR 0061).
//
// Expiry is computed from the frozen generatedAt plus the frozen validityDays;
// no "expired" flag is persisted, so shortening PROJECT_QUOTE_VALIDITY_DAYS
// never changes an already-issued quote. This returns the UTC calendar date
// (YYYY-MM-DD) for internal display and the action result. The PDF footer
// formats the same instant with toLocaleDateString for the document; both
// derive from the identical `generatedAt + validityDays * 86400 * 1000`
// instant, so they never disagree on which day a quote lapses.
export function projectQuoteExpiryIso(generatedAtIso: string, validityDays: number): string {
  const base = new Date(generatedAtIso).getTime();
  return new Date(base + validityDays * 86400 * 1000).toISOString().slice(0, 10);
}
