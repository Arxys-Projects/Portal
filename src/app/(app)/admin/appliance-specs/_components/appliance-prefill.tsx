// The sibling prefill control on /admin/appliance-specs (ADR 0103, which reads
// on ADR 0102).
//
// A chassis family shares one platform-and-power block: V250/V255/V260/V265 are
// one chassis differing only in CPU, RAM and drive sizes; SW20 is an SW10 with a
// second GPU; V150 shares the platform block. So the 30
// APPLIANCE_PREFILL_FIELD_NAMES are the same across a family, and entering them
// once per row by hand is what this control removes — the same mechanism ADR
// 0102 built one table over, extended here to the create form because this table
// ships empty and every row is created (ADR 0103).
//
// THIS IS NOT A WRITE PATH, and the mechanism is what guarantees that rather
// than a comment promising it. The control is a set of plain links to
// ?prefillFrom=<source>. The page re-renders with the source's 30 values as the
// form's defaults; the editor reviews them and presses the same Save button,
// through the same createApplianceSpec / updateApplianceSpec action, the same
// zod parse and the same RLS policy as any other save. Following the link writes
// nothing, so there is no second place a value can enter appliance_specs and no
// attribution to get wrong — the audit trigger still stamps the admin who saved.
//
// Server component: it renders links and counts, holds no state, and needs no
// client bundle.

import Link from "next/link";

export type PrefillSource = {
  sku: string;
  /** The row's archetype, so the editor copies from the right kind of chassis. */
  familyType: string | null;
  /** How many of the 30 copyable fields carry a value on that row. */
  filledCount: number;
};

const PANEL =
  "rounded-[14px] border border-line bg-[#f7f9fc] p-4 text-sm text-ink-soft";

const FAMILY_TYPE_LABEL: Record<string, string> = {
  management: "management",
  acm: "ACM",
  workstation: "workstation",
};

function familyLabel(familyType: string | null): string {
  if (!familyType) return "no archetype";
  return FAMILY_TYPE_LABEL[familyType] ?? familyType;
}

/**
 * Shown when the page was loaded with ?prefillFrom=. States plainly that
 * nothing has been saved, because the form now shows values the database does
 * not have — the one genuinely confusing state this feature introduces, and the
 * reason the banner is loud rather than a toast. Serves both surfaces: the
 * discard link goes back to the empty create form or to the unprefilled row.
 */
export function AppliancePrefillActiveBanner({
  fromSku,
  copiedCount,
  discardHref,
  saveLabel,
}: {
  fromSku: string;
  copiedCount: number;
  discardHref: string;
  /** What the Save button below reads, so the banner points at the real action. */
  saveLabel: string;
}) {
  return (
    <div
      role="status"
      className="rounded-[14px] border border-arxys-navy/30 bg-arxys-navy/[0.04] p-4"
    >
      <p className="text-sm font-bold text-ink">
        Platform fields copied from{" "}
        <span className="font-mono">{fromSku}</span>
      </p>
      <p className="mt-1 text-sm text-ink-soft">
        {copiedCount === 0
          ? "That row has no platform values to copy, so nothing in the form changed."
          : `${copiedCount} of the 30 chassis-and-platform fields below now show ${fromSku}'s values.`}{" "}
        <strong className="font-semibold text-ink">Nothing is saved yet.</strong>{" "}
        Check them against the sheet — the per-SKU fields (CPU, RAM, drives, and
        the workstation GPU block) are yours to fill — then press {saveLabel}.
      </p>
      <Link
        href={discardHref}
        className="mt-2 inline-block text-sm font-medium text-arxys-navy hover:underline"
      >
        Discard the prefill
      </Link>
    </div>
  );
}

/**
 * The offer, shown when no prefill is active and at least one other row exists.
 *
 * Every other appliance row is a candidate, cross-sheet-group included — V250 in
 * group V250 is a valid source for V260 in group V260, because the chassis is
 * shared. Each is labelled with its archetype and how many of the 30 it carries,
 * so the editor copies from a filled row of the right kind rather than
 * discovering after the fact that they copied 30 blanks or a workstation's
 * platform block onto a management row. A source with 0 stays clickable — it is
 * not an error to copy from an empty row, just useless — but it says so.
 *
 * `basePath` is the page the links target (the create page or this row's edit
 * page); the prefill is applied by re-rendering that same page with the param.
 */
export function AppliancePrefillOffer({
  basePath,
  sources,
}: {
  basePath: string;
  sources: readonly PrefillSource[];
}) {
  if (sources.length === 0) return null;

  return (
    <div className={PANEL}>
      <p className="font-semibold text-ink">Copy the chassis-and-platform fields</p>
      <p className="mt-1 leading-relaxed">
        A chassis family shares one platform block, so the 30 platform, power,
        physical, environmental, regulatory and warranty fields are the same
        across it. Copy them from an existing row of the same chassis instead of
        retyping — you review the values and press Save as usual. The per-SKU
        fields (CPU, RAM, drives, and the workstation GPU block) are never copied
        and stay yours to fill.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {sources.map((source) => (
          <Link
            key={source.sku}
            href={`${basePath}?prefillFrom=${encodeURIComponent(source.sku)}`}
            className="inline-flex items-baseline gap-2 rounded-lg border border-line bg-surface px-3 py-2 font-mono text-sm font-medium text-arxys-navy hover:border-arxys-navy hover:bg-arxys-navy/[0.04]"
          >
            {source.sku}
            <span className="font-sans text-xs font-normal text-ink-soft">
              {familyLabel(source.familyType)} —{" "}
              {source.filledCount === 0
                ? "nothing filled in yet"
                : `${source.filledCount} of 30 copyable`}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
