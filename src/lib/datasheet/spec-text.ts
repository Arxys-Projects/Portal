// Text helpers shared by both datasheet adapters.
//
// Lifted out of scripts/render-rail-mockup.ts, where `clean()` and `row()` were
// first written, so the Ledger adapter does not grow a second copy that drifts.
// Pure string work — no DB, no react-pdf — so both adapters stay unit testable
// without a network.

/**
 * Spec sheets were transcribed from PDFs with CRLFs and bullet dashes inside the
 * long text columns; a datasheet row wants one flowing run.
 *
 * Deliberately does NOT correct the *content* of a column. `operating_temp` on
 * several product_specs rows has the storage-temp range concatenated onto it by
 * a transcription slip — that is a data defect, fixable only through the admin
 * form (ADR 0096), and papering over it here would hide it from the person who
 * can fix it.
 */
export function clean(value: unknown): string {
  return String(value)
    .replace(/\r/g, "")
    .replace(/\s*\n\s*-\s*/g, " · ")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*\.\s*$/, "")
    .trim();
}

/** True when a spec column holds nothing worth printing. */
export function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  return String(value).trim() === "";
}

/**
 * Only emit a spec row when the column actually has a value.
 *
 * Returns an array so callers can spread it, which makes an omitted row
 * disappear from the list rather than becoming a row with an em dash in it.
 * Inventing a row is worse than a shorter table, and a fabricated TPM or
 * encryption claim on a product that never made one is worse than either
 * (ADR 0109 §3).
 */
export function specRow<T extends { label: string; value: string }>(
  label: string,
  value: unknown,
): T[] {
  if (isBlank(value)) return [];
  const text = Array.isArray(value) ? clean(value.join(" ")) : clean(value);
  return text === "" ? [] : ([{ label, value: text }] as T[]);
}

/** Join the parts of a composed spec value, dropping the blanks. */
export function joinParts(parts: unknown[], separator = " · "): string {
  return parts
    .filter((p) => !isBlank(p))
    .map((p) => clean(p))
    .filter((p) => p !== "")
    .join(separator);
}

/** 4000 -> "4,000". The handoff sets throughput figures with a thousands separator. */
export function thousands(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * A "Yes"/"YES"/"No" flag column read as a boolean. These columns are free text
 * in the schema, so anything that is not an affirmative reads as false rather
 * than as an assertion.
 */
export function isYes(value: unknown): boolean {
  return /^\s*(yes|y|true)\s*$/i.test(String(value ?? ""));
}
