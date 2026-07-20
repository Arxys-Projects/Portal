"use client";

// VMS Server Comparison — the "win a job" persuasion tool (ADR 0084/0085).
// Restyled onto the shared ui/ components (ADR 0067/0075); the bespoke
// comparison.css `ac-*` sheet is retired. The market-reality callouts sit at
// the top of the page ("Why partners switch") rather than below the results,
// and the VMS validation-sheet downloads live here (moved from Quick Compare).

import { useState, type ReactNode } from "react";
import type { ProductSpec, CompetitorProduct, DisplaySpec, SharedSpecKey } from "@/lib/comparison/types";
import type { VendorGroup } from "@/lib/comparison/data";
import { requestComparisonQuote } from "./actions";
import type { ComparisonPdfInput } from "@/lib/pdf/comparison-template";
import { VMS_OPTIONS } from "@/lib/videox-compare/vms";
import { Select } from "@/app/(app)/_components/ui";

type Props = {
  productSpecs: Record<string, ProductSpec>;
  competitorsByVendor: Record<string, VendorGroup>;
  displaySpecs: DisplaySpec[];
  messages: Record<string, string>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getVal(obj: ProductSpec | CompetitorProduct, key: SharedSpecKey): string | number {
  return (obj as Record<string, unknown>)[key] as string | number;
}

function fmtVal(key: SharedSpecKey, val: string | number | null | undefined): string {
  // Competitor-only specs (e.g. hw_platform) have no value on Arxys rows —
  // render an em dash rather than "null"/"undefined".
  if (val === null || val === undefined || val === "") return "—";
  switch (key) {
    case "cpu_base_ghz":   return `${val} GHz`;
    case "ram_gb":         return `${val} GB`;
    case "storage_raw_tb": return `${Number(val)} TB`;
    case "cpu_passmark":   return Number(val).toLocaleString();
    case "max_cameras":
    case "max_cameras_h265": return Number(val).toLocaleString();
    default:               return String(val);
  }
}

type AdvResult =
  | { kind: "none" }
  | { kind: "badge" }
  | { kind: "win";  text: string }
  | { kind: "loss"; text: string }
  | { kind: "equal" };

function computeAdv(
  spec: DisplaySpec,
  arxysVal: string | number,
  compVal: string | number,
): AdvResult {
  if (!spec.highlight_if_better) return { kind: "none" };
  if (!spec.is_numeric) return { kind: "badge" };

  const a = Number(arxysVal);
  const c = Number(compVal);
  if (isNaN(a) || isNaN(c)) return { kind: "none" };

  const delta = a - c;
  if (delta === 0) return { kind: "equal" };

  const absPct = c !== 0 ? Math.abs(Math.round((delta / c) * 100)) : 0;

  let deltaStr: string;
  switch (spec.spec_key) {
    case "cpu_base_ghz":
      deltaStr = `${delta > 0 ? "+" : ""}${delta.toFixed(1)} GHz`;
      break;
    case "storage_raw_tb":
      deltaStr = `${delta > 0 ? "+" : ""}${delta} TB`;
      break;
    case "ram_gb":
      deltaStr = `${delta > 0 ? "+" : ""}${delta} GB`;
      break;
    case "cpu_passmark":
      deltaStr = `${delta > 0 ? "+" : ""}${delta.toLocaleString()}`;
      break;
    default:
      deltaStr = `${delta > 0 ? "+" : ""}${delta.toLocaleString()}`;
  }

  if (delta > 0) return { kind: "win",  text: `${deltaStr} (+${absPct}%)` };
  return           { kind: "loss", text: `${deltaStr} (−${absPct}%)` };
}

function fmtUsd(n: number): string {
  return `$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// Gold-accent market-reality callout card ("Why partners switch" band).
function CalloutCard({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line border-l-[3px] border-l-arxys-gold bg-[linear-gradient(90deg,#fdf8ec,#ffffff)] px-4 py-4">
      <div className="flex items-center gap-2 text-arxys-gold-text">
        {icon}
        <span className="text-[11px] font-extrabold uppercase tracking-[0.06em]">
          {label}
        </span>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-ink">{children}</p>
    </div>
  );
}

function StepLabel({ num, children }: { num: number; children: ReactNode }) {
  return (
    <label className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.05em] text-[#8b929b]">
      <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-arxys-navy text-[10px] text-white">
        {num}
      </span>
      {children}
    </label>
  );
}

const DownloadGlyph = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ComparisonForm({
  productSpecs,
  competitorsByVendor,
  displaySpecs,
  messages,
}: Props) {
  const [selectedVendor, setSelectedVendor] = useState<string>("");
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [userPrice, setUserPrice] = useState<string>("");
  const [serverCount, setServerCount] = useState<number>(1);
  const [quoteStatus, setQuoteStatus] = useState<"idle" | "submitting" | "ok" | "error">("idle");
  const [quoteError, setQuoteError] = useState<string>("");
  const [pdfStatus, setPdfStatus] = useState<"idle" | "loading" | "error">("idle");

  const vendors = Object.keys(competitorsByVendor) as Array<keyof typeof competitorsByVendor>;

  const vendorGroup: VendorGroup | null = selectedVendor
    ? (competitorsByVendor[selectedVendor] ?? null)
    : null;

  const models: CompetitorProduct[] = vendorGroup?.models ?? [];

  const competitor: CompetitorProduct | null = selectedModelId
    ? (models.find((m) => m.id === selectedModelId) ?? null)
    : null;

  const arxysModel: ProductSpec | null = competitor
    ? (productSpecs[competitor.arxys_match_id] ?? null)
    : null;

  const hasResults = competitor !== null && arxysModel !== null;

  const parsedPrice = parseFloat(userPrice.replace(/,/g, ""));
  const validPrice  = !isNaN(parsedPrice) && parsedPrice > 0;
  const priceDelta  = validPrice && arxysModel ? parsedPrice - arxysModel.msrp : null;
  const deploymentSavings = priceDelta !== null ? serverCount * priceDelta : null;

  const multiplierText =
    deploymentSavings !== null && arxysModel
      ? (messages.multiplier_format ?? "")
          .replace("{n}", String(serverCount))
          .replace("${total}", fmtUsd(deploymentSavings))
      : null;

  function handleVendorChange(v: string) {
    setSelectedVendor(v);
    setSelectedModelId("");
    setUserPrice("");
    setServerCount(1);
  }

  function handleModelChange(id: string) {
    setSelectedModelId(id);
    setUserPrice("");
    setServerCount(1);
    setQuoteStatus("idle");
    setQuoteError("");
    setPdfStatus("idle");
  }

  async function handleDownloadPdf() {
    if (!competitor || !arxysModel) return;
    setPdfStatus("loading");
    try {
      const specs = displaySpecs.map((spec) => ({
        label: spec.display_label,
        competitorVal: fmtVal(spec.spec_key, getVal(competitor, spec.spec_key)),
        arxysVal: fmtVal(spec.spec_key, getVal(arxysModel, spec.spec_key)),
      }));
      const body: Omit<ComparisonPdfInput, "generatedAt"> = {
        partnerCompanyName: "",
        competitorBrand: competitor.brand_name,
        competitorProductLine: competitor.product_line,
        competitorModelName: competitor.model_name,
        arxysModelName: arxysModel.model_name,
        arxysModelId: arxysModel.id,
        specs,
        competitorPriceUsd: validPrice ? parsedPrice : null,
        arxysMsrpUsd: arxysModel.msrp,
        serverCount,
        priceDeltaUsd: priceDelta,
        deploymentSavingsUsd: deploymentSavings,
        footerText: messages.pdf_footer ?? "",
        // The leave-behind carries the same market-reality content the screen
        // shows (ADR 0085) — existing message strings, not new copy.
        callouts: [
          { label: "Lead time", text: messages.lead_time_callout },
          { label: "Supply secured", text: messages.hdd_callout },
          { label: "No commitment", text: messages.second_source_note },
        ].filter((c) => Boolean(c.text)),
      };
      const res = await fetch("/api/comparison/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setPdfStatus("error");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Arxys-Comparison-${competitor.brand_name}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setPdfStatus("idle");
    } catch {
      setPdfStatus("error");
    }
  }

  async function handleRequestQuote() {
    if (!competitor || !arxysModel || quoteStatus === "ok") return;
    setQuoteStatus("submitting");
    setQuoteError("");
    const result = await requestComparisonQuote({
      vendorName: `${competitor.brand_name} ${competitor.product_line}`,
      vendorModelName: competitor.model_name,
      arxysModelId: arxysModel.id,
      serverCount,
    });
    if (result.status === "ok") {
      setQuoteStatus("ok");
    } else if (result.status === "error") {
      setQuoteStatus("error");
      setQuoteError(result.error);
    }
  }

  const vendorLabel = (v: string): string => {
    const g = competitorsByVendor[v];
    return g ? `${g.brandName} ${g.productLine}` : v;
  };

  return (
    <div>
      {/* "Why partners switch" band — existing market-reality strings,
          repositioned to the top of the page (ADR 0085). */}
      <div className="mt-5 grid grid-cols-1 gap-3.5 md:grid-cols-3">
        <CalloutCard
          label="Lead time"
          icon={
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 7 12 12 15 14" />
            </svg>
          }
        >
          {messages.lead_time_callout}
        </CalloutCard>
        <CalloutCard
          label="Supply secured"
          icon={
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <ellipse cx="12" cy="5" rx="8" ry="3" />
              <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
              <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
            </svg>
          }
        >
          {messages.hdd_callout}
        </CalloutCard>
        <CalloutCard
          label="No commitment"
          icon={
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18h6" />
              <path d="M10 22h4" />
              <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z" />
            </svg>
          }
        >
          {messages.second_source_note}
        </CalloutCard>
      </div>

      {/* Step selects + validation sheets */}
      <div className="mt-4.5 rounded-[14px] border border-line bg-surface px-5 py-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <StepLabel num={1}>{messages.step1_label ?? "Select your VMS platform"}</StepLabel>
            <Select
              aria-label="VMS Platform"
              value={selectedVendor}
              onChange={(e) => handleVendorChange(e.target.value)}
            >
              <option value="">— Select vendor —</option>
              {vendors.map((v) => (
                <option key={v} value={v}>
                  {vendorLabel(v)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <StepLabel num={2}>{messages.step2_label ?? "Select the model you've been quoted"}</StepLabel>
            <Select
              aria-label="Server Model"
              value={selectedModelId}
              disabled={!selectedVendor}
              onChange={(e) => handleModelChange(e.target.value)}
            >
              <option value="">— Select model —</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.model_name} — {m.storage_raw_tb} TB
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* VMS validation sheets — moved here from VideoX Quick Compare
            (ADR 0085; the downloads belong with the switch decision). */}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line-soft pt-4">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-[#8b929b]">
            VMS validation sheets
          </span>
          {VMS_OPTIONS.map((vms) => (
            <a
              key={vms.id}
              href={vms.sheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#b9c4d5] bg-surface px-3 py-1.5 text-[13px] font-semibold text-arxys-navy transition-colors hover:border-arxys-navy hover:bg-arxys-navy-soft"
            >
              {DownloadGlyph}
              {vms.name}
            </a>
          ))}
        </div>
      </div>

      {!hasResults ? (
        <p className="mt-2.5 px-0.5 text-xs text-ink-soft">
          Select your vendor and quoted model to populate the comparison and
          compute each spec advantage.
        </p>
      ) : null}

      {/* Results panel */}
      {hasResults && competitor && arxysModel && (
        <div className="space-y-4.5">
          {/* Spec comparison table */}
          <div className="mt-4.5 overflow-x-auto rounded-[14px] border border-line bg-surface">
            <table className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr className="bg-panel">
                  <th className="border-b border-line px-3.5 py-3 text-left text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#3f4b5b]">
                    Specification
                  </th>
                  <th className="border-b border-line px-3.5 py-3 text-left text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#3f4b5b]">
                    {competitor.brand_name} {competitor.product_line}
                  </th>
                  <th className="border-b border-line bg-arxys-navy-soft px-3.5 py-3 text-left text-[11px] font-extrabold uppercase tracking-[0.06em] text-arxys-navy">
                    Arxys VideoX
                  </th>
                  <th className="hidden border-b border-line px-3.5 py-3 text-left text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#3f4b5b] md:table-cell">
                    Advantage
                  </th>
                </tr>
              </thead>
              <tbody className="text-ink">
                {displaySpecs.map((spec) => {
                  const compVal  = getVal(competitor, spec.spec_key);
                  const arxysVal = getVal(arxysModel, spec.spec_key);
                  const adv      = computeAdv(spec, arxysVal, compVal);

                  return (
                    <tr key={spec.spec_key} className="border-b border-line-soft last:border-0">
                      <td className="px-3.5 py-2.5 font-medium">{spec.display_label}</td>
                      <td className="px-3.5 py-2.5 text-ink-soft">
                        {fmtVal(spec.spec_key, compVal)}
                      </td>
                      <td className="bg-arxys-navy-soft px-3.5 py-2.5 font-semibold">
                        {fmtVal(spec.spec_key, arxysVal)}
                      </td>
                      <td className="hidden px-3.5 py-2.5 md:table-cell">
                        {adv.kind === "badge" && (
                          <span className="inline-block rounded-full border border-[#b6ddc6] bg-[#e7f4ec] px-2.5 py-0.5 text-[11px] font-bold text-[#136340]">
                            Arxys advantage
                          </span>
                        )}
                        {adv.kind === "win" && (
                          <span className="text-[12.5px] font-semibold text-[#136340]">
                            {adv.text}
                          </span>
                        )}
                        {adv.kind === "loss" && (
                          <span className="text-[12.5px] font-semibold text-danger">
                            {adv.text}
                          </span>
                        )}
                        {adv.kind === "equal" && (
                          <span className="text-[12.5px] text-ink-soft">Equal</span>
                        )}
                        {adv.kind === "none" && (
                          <span className="text-ink-soft">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pricing comparison */}
          <div className="rounded-[14px] border border-line bg-surface px-5 py-5">
            <p className="mb-3.5 text-[12.5px] font-bold uppercase tracking-[0.08em] text-[#222c3a]">
              Pricing comparison
            </p>

            <div className="flex flex-wrap items-center justify-between gap-4 py-2">
              <span className="text-sm text-ink-soft">
                {competitor.brand_name} price (your quote, per server)
              </span>
              <div className="inline-flex items-stretch overflow-hidden rounded-lg border border-[#b9c4d5]">
                <span className="flex items-center border-r border-[#b9c4d5] bg-panel px-2.5 text-sm text-ink-soft">
                  $
                </span>
                <input
                  type="number"
                  min={0}
                  step={100}
                  placeholder="Enter quoted price"
                  value={userPrice}
                  onChange={(e) => setUserPrice(e.target.value)}
                  className="w-44 border-0 px-3 py-2 text-sm text-ink outline-none"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line-soft py-2">
              <span className="text-sm text-ink-soft">Arxys VideoX MSRP</span>
              <span className="text-base font-bold tabular-nums text-ink">
                {fmtUsd(arxysModel.msrp)}
              </span>
            </div>

            {validPrice && priceDelta !== null ? (
              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line-soft py-2">
                <span
                  className={`text-sm font-semibold ${
                    priceDelta > 0
                      ? "text-[#136340]"
                      : priceDelta < 0
                        ? "text-danger"
                        : "text-ink-soft"
                  }`}
                >
                  {priceDelta > 0
                    ? "You save per server"
                    : priceDelta < 0
                      ? "Competitor is lower by"
                      : "Same price"}
                </span>
                <span
                  className={`text-base font-bold tabular-nums ${
                    priceDelta > 0
                      ? "text-[#136340]"
                      : priceDelta < 0
                        ? "text-danger"
                        : "text-ink"
                  }`}
                >
                  {priceDelta !== 0 ? fmtUsd(priceDelta) : "—"}
                </span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line-soft py-2">
                <span className="text-sm font-semibold text-[#136340]">
                  You save per server
                </span>
                <span className="text-sm text-ink-soft">
                  enter your quote to calculate →
                </span>
              </div>
            )}

            {validPrice && priceDelta !== null ? (
              <p className="mt-3 text-xs leading-relaxed text-ink-soft">
                {messages.price_disclosure}
              </p>
            ) : null}

            {/* Deployment multiplier */}
            <div className="mt-4 border-t border-line-soft pt-4">
              <p className="mb-2 text-[13px] font-semibold text-ink">
                {messages.multiplier_label}
              </p>
              <div className="flex items-center gap-3.5">
                <span className="shrink-0 text-xs text-ink-soft">
                  Servers in deployment
                </span>
                <input
                  type="range"
                  min={1}
                  max={25}
                  value={serverCount}
                  onChange={(e) => setServerCount(Number(e.target.value))}
                  className="min-w-0 flex-1 accent-[#14346b]"
                />
                <span className="min-w-6 text-right text-sm font-bold text-arxys-navy">
                  {serverCount}
                </span>
              </div>
              {validPrice && deploymentSavings !== null && multiplierText ? (
                <p
                  className={`mt-2.5 text-sm font-semibold ${
                    deploymentSavings >= 0 ? "text-[#136340]" : "text-danger"
                  }`}
                >
                  {deploymentSavings >= 0 ? "+" : "−"}
                  {fmtUsd(deploymentSavings)}{" "}
                  <span className="font-normal text-ink-soft">{multiplierText}</span>
                </p>
              ) : null}
            </div>
          </div>

          {/* Support & warranty — honest support-model and durability facts
              (ADR 0085). Copy pending Andy's review; validated wording rails. */}
          <div className="rounded-[14px] border border-line bg-panel px-5 py-4">
            <p className="text-[12.5px] font-bold uppercase tracking-[0.08em] text-[#222c3a]">
              Support &amp; warranty
            </p>
            <div className="mt-2.5 grid grid-cols-1 gap-x-6 gap-y-2 text-[13px] leading-relaxed text-ink sm:grid-cols-3">
              <p>
                <span className="font-semibold">5-year warranty</span> with
                advanced replacement — multi-year coverage is the standard
                term, not an add-on.
              </p>
              <p>
                <span className="font-semibold">Next-business-day advanced
                parts</span> with self-repair — the replacement part ships
                before the failed one comes back.
              </p>
              <p>
                <span className="font-semibold">Support hours 8–5 Pacific.</span>{" "}
                No 24/7 phone tier — that&apos;s the honest trade-off against
                the tier-1 OEMs.
              </p>
            </div>
          </div>

          {/* CTA band */}
          <div className="flex flex-wrap items-center justify-between gap-5 rounded-[14px] bg-[linear-gradient(140deg,#1a3f7c,#0d2247)] p-6 text-white">
            <div>
              <h2 className="text-lg font-bold">{messages.cta_headline}</h2>
              <p className="mt-1.5 text-sm text-white/85">{messages.cta_subtext}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={pdfStatus === "loading"}
                className="rounded-lg border border-white/55 bg-transparent px-4.5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pdfStatus === "loading" ? "Generating…" : messages.pdf_button}
              </button>
              <button
                type="button"
                onClick={handleRequestQuote}
                disabled={quoteStatus === "submitting" || quoteStatus === "ok"}
                className="rounded-lg bg-arxys-gold px-4.5 py-2.5 text-sm font-bold text-arxys-text-on-gold transition-colors hover:bg-arxys-gold-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {quoteStatus === "submitting"
                  ? "Sending…"
                  : quoteStatus === "ok"
                  ? "Quote requested ✓"
                  : messages.cta_button}
              </button>
            </div>
            {quoteStatus === "ok" && (
              <p className="w-full text-sm font-medium text-[#9fe3bd]">
                Your request has been sent — Arxys sales will be in touch within 24 hours.
              </p>
            )}
            {quoteStatus === "error" && quoteError && (
              <p className="w-full text-sm font-medium text-[#ffb4a8]">{quoteError}</p>
            )}
            {pdfStatus === "error" && (
              <p className="w-full text-sm font-medium text-[#ffb4a8]">
                PDF generation failed — please try again.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
