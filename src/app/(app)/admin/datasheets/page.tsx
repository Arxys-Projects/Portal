// /admin/datasheets — pick a model, download its datasheet.
//
// Admin AND internal, unlike its neighbours /admin/specs and
// /admin/appliance-specs, which are admin-only because they WRITE. This page
// only reads and hands back a PDF, and the gate matches the route's
// (requireDatasheetAccess, ADR 0110).
//
// THE MODELS WITH NO SHEET ARE ON THIS PAGE. Three ACM rows cannot be generated,
// because no template was ever designed for them. Omitting them would read as
// "these products do not exist"; each one states its own reason in a full
// sentence. Same for a sheet that renders with gaps: the missing columns are
// named, so the person who can fill them in through the spec form can see what
// to fill in.
//
// ONE CARD PER SHEET, NOT PER SKU. V250 and V255 share one sheet and get one
// card titled "V250 / V255", the same way an NVR's three drive capacities do —
// the SKU line under the card is what tells a reader their model is covered.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireDatasheetAccess } from "@/lib/datasheet/guard";
import { loadDatasheetSpecData } from "@/lib/datasheet/load";
import { EXPECTED_PAGES } from "@/lib/datasheet/render";
import type { CatalogueEntry } from "@/lib/datasheet/catalogue";
import { buttonClasses } from "@/app/(app)/_components/ui";

export const dynamic = "force-dynamic";

const TEMPLATE_LABEL = {
  ledger: "Ledger — video & management",
  rail: "Rail — workstation",
} as const;

function SheetCard({ entry }: { entry: CatalogueEntry }) {
  const available = entry.template !== null;
  return (
    <div className="rounded-[14px] border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="text-lg font-bold text-ink">{entry.displayName}</h3>
            <span className="text-sm text-ink-soft">{entry.description}</span>
          </div>
          <p className="mt-1 text-xs text-ink-soft">
            {available ? (
              <>
                {TEMPLATE_LABEL[entry.template!]} ·{" "}
                {EXPECTED_PAGES[entry.template!]}{" "}
                {EXPECTED_PAGES[entry.template!] === 1 ? "page" : "pages"} · from{" "}
                <span className="font-mono">{entry.source}</span>
              </>
            ) : (
              <>
                from <span className="font-mono">{entry.source}</span>
              </>
            )}
          </p>
        </div>

        {available ? (
          // A plain link, not a fetch: the browser handles the download and the
          // Content-Disposition filename, and there is no client JS to fail.
          <a
            href={`/api/datasheet/${encodeURIComponent(entry.model)}`}
            className={buttonClasses("primary", "sm")}
          >
            Download PDF
          </a>
        ) : (
          <span className="rounded-lg bg-[#f1f3f6] px-3 py-2 text-xs font-semibold text-[#5c6472]">
            No datasheet yet
          </span>
        )}
      </div>

      {/* The SKUs that make up this sheet's ordering table — the answer to
          "why is there no separate V400-160 datasheet". */}
      {entry.skus.length > 1 ? (
        <p className="mt-3 text-xs text-ink-soft">
          {entry.aliases.length > 0
            ? `One sheet covers all ${entry.skus.length} variants: `
            : `One sheet covers all ${entry.skus.length} capacities: `}
          <span className="font-mono">{entry.skus.join(" · ")}</span>
        </p>
      ) : null}

      {!available && entry.unavailableReason ? (
        <p className="mt-3 border-t border-line pt-3 text-sm text-ink-soft">
          {entry.unavailableReason}
        </p>
      ) : null}

      {/* A warning means the PDF comes out DEFECTIVE, not merely incomplete, so
          it sits above the gaps and reads in red rather than amber. */}
      {available && entry.warnings.length > 0 ? (
        <div className="mt-3 rounded-[10px] border border-red-300 bg-red-50 p-3">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-red-900">
            Needs fixing before sending to a customer
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-red-900">
            {entry.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {available && entry.gaps.length > 0 ? (
        <div className="mt-3 rounded-[10px] border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-amber-900">
            Renders with gaps
          </p>
          <p className="mt-1 text-sm text-amber-900">
            These are blank in the spec row, so they are left off the sheet rather than
            guessed at:
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-amber-900">
            {entry.gaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default async function AdminDatasheetsPage() {
  const gate = await requireDatasheetAccess();
  if (!gate.ok) notFound();

  let catalogue: CatalogueEntry[];
  try {
    ({ catalogue } = await loadDatasheetSpecData());
  } catch (err) {
    console.error("[load datasheet catalogue]", err);
    return (
      <div>
        <h1 className="text-2xl font-bold text-ink">Datasheets</h1>
        <p className="mt-3 text-sm text-danger">
          Failed to load the spec tables, so no datasheet can be generated right now.
        </p>
      </div>
    );
  }

  const available = catalogue.filter((e) => e.template !== null);
  const unavailable = catalogue.filter((e) => e.template === null);

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">Datasheets</h1>
      <p className="mt-1 max-w-3xl text-sm text-ink-soft">
        One datasheet per model, generated from the live spec tables when you click
        Download — never from a saved copy, so a sheet always states today&apos;s specs. Edit
        a value in{" "}
        <Link href="/admin/specs" className="font-semibold text-arxys-navy hover:underline">
          Product Specs
        </Link>{" "}
        or{" "}
        <Link
          href="/admin/appliance-specs"
          className="font-semibold text-arxys-navy hover:underline"
        >
          Appliance Specs
        </Link>{" "}
        and the next download carries it.
      </p>

      <h2 className="mt-6 text-[11px] font-bold uppercase tracking-[0.09em] text-[#5c6472]">
        {available.length} {available.length === 1 ? "sheet" : "sheets"} available
      </h2>
      <div className="mt-3 space-y-3">
        {available.map((entry) => (
          <SheetCard key={`${entry.source}-${entry.model}`} entry={entry} />
        ))}
      </div>

      {unavailable.length > 0 ? (
        <>
          <h2 className="mt-8 text-[11px] font-bold uppercase tracking-[0.09em] text-[#5c6472]">
            {unavailable.length} {unavailable.length === 1 ? "model has" : "models have"} no
            datasheet yet
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-soft">
            These products are real and their spec rows exist — what is missing is a sheet
            design or a built template, not the data. They are listed here rather than left
            off so the gap is visible.
          </p>
          <div className="mt-3 space-y-3">
            {unavailable.map((entry) => (
              <SheetCard key={`${entry.source}-${entry.model}`} entry={entry} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
