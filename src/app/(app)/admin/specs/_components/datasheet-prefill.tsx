// The sibling prefill control on /admin/specs/[sku] (ADR 0102).
//
// A factsheet describes a chassis, so the 22 datasheet columns are identical
// across the three capacity SKUs of a family — one V400 sheet covers the 128,
// the 160 and the 192. Entering them three times by hand is what ADR 0097 §8
// costed as "21 hand edits… if it proves painful in practice, a copy-from-sibling
// prefill is a cheap later nicety — a UI convenience, not a second write path."
//
// THIS IS NOT A WRITE PATH, and the mechanism is what guarantees that rather
// than a comment promising it. The control is a set of plain links to
// ?prefillFrom=<sibling>. The page re-renders with the sibling's 22 values as
// the form's defaults; the editor reviews them and presses the same Save button,
// through the same action, the same zod parse and the same RLS policy as any
// other edit. Nothing is written by following the link, so there is no second
// place a value can enter product_specs and no attribution to get wrong — the
// audit row still records the admin who pressed Save.
//
// Server component: it renders links and counts, holds no state, and needs no
// client bundle.

import Link from "next/link";

export type PrefillSibling = {
  sku: string;
  /** How many of the 22 datasheet columns carry a value on that row. */
  filledCount: number;
};

const PANEL =
  "rounded-[14px] border border-line bg-[#f7f9fc] p-4 text-sm text-ink-soft";

/**
 * Shown when the page was loaded with ?prefillFrom=. States plainly that
 * nothing has been saved, because the form now shows values the database does
 * not have — the one genuinely confusing state this feature introduces, and the
 * reason the banner is loud rather than a toast.
 */
export function PrefillActiveBanner({
  fromSku,
  copiedCount,
  sku,
}: {
  fromSku: string;
  copiedCount: number;
  sku: string;
}) {
  return (
    <div
      role="status"
      className="rounded-[14px] border border-arxys-navy/30 bg-arxys-navy/[0.04] p-4"
    >
      <p className="text-sm font-bold text-ink">
        Datasheet fields copied from{" "}
        <span className="font-mono">{fromSku}</span>
      </p>
      <p className="mt-1 text-sm text-ink-soft">
        {copiedCount === 0
          ? "That row has no datasheet values to copy, so nothing in the form changed."
          : `${copiedCount} of the 22 factsheet fields below now show ${fromSku}'s values.`}{" "}
        <strong className="font-semibold text-ink">Nothing is saved yet.</strong>{" "}
        Check them against the sheet, then press Save {sku}.
      </p>
      <Link
        href={`/admin/specs/${encodeURIComponent(sku)}`}
        className="mt-2 inline-block text-sm font-medium text-arxys-navy hover:underline"
      >
        Discard the prefill and reload {sku}
      </Link>
    </div>
  );
}

/**
 * The offer, shown when no prefill is active and the family has siblings.
 *
 * Each sibling is labelled with how many of the 22 it carries, so the editor
 * picks the row that has actually been filled in rather than discovering after
 * the fact that they copied 22 blanks over. A sibling with 0 stays clickable —
 * it is not an error to copy from an empty row, just useless — but it says so.
 */
export function PrefillOffer({
  sku,
  siblings,
}: {
  sku: string;
  siblings: readonly PrefillSibling[];
}) {
  if (siblings.length === 0) return null;

  return (
    <div className={PANEL}>
      <p className="font-semibold text-ink">Copy the datasheet fields</p>
      <p className="mt-1 leading-relaxed">
        One factsheet covers every capacity in a family, so the 22 factsheet
        fields (power, cooling, dimensions, environmental, regulatory, warranty
        terms, revision date) are the same on all of them. Copy them from a
        sibling instead of retyping — you review the values and press Save as
        usual.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {siblings.map((sibling) => (
          <Link
            key={sibling.sku}
            href={`/admin/specs/${encodeURIComponent(sku)}?prefillFrom=${encodeURIComponent(sibling.sku)}`}
            className="inline-flex items-baseline gap-2 rounded-lg border border-line bg-surface px-3 py-2 font-mono text-sm font-medium text-arxys-navy hover:border-arxys-navy hover:bg-arxys-navy/[0.04]"
          >
            {sibling.sku}
            <span className="font-sans text-xs font-normal text-ink-soft">
              {sibling.filledCount === 0
                ? "nothing filled in yet"
                : `${sibling.filledCount} of 22 filled`}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
