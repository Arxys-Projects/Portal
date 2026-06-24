"use client";

import { useState } from "react";
import type { ProductSpec, CompetitorProduct, DisplaySpec, SharedSpecKey } from "@/lib/comparison/types";
import type { VendorGroup } from "@/lib/comparison/data";
import { requestComparisonQuote } from "./actions";
import type { ComparisonPdfInput } from "@/lib/pdf/comparison-template";

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
    <div id="arxys-cmp-root">
      {/* Header */}
      <div className="ac-hdr">
        <div className="ac-t">{messages.page_headline ?? "Server Comparison"}</div>
        <div className="ac-st">{messages.page_subhead}</div>
      </div>

      {/* Step 1 — Vendor */}
      <div className="ac-step">
        <div className="ac-step-label">
          <span className="ac-step-num">1</span>
          {messages.step1_label}
        </div>
        <div className="ac-selects">
          <div className="ac-f">
            <label className="ac-fl">VMS Platform</label>
            <select
              value={selectedVendor}
              onChange={(e) => handleVendorChange(e.target.value)}
            >
              <option value="">— Select vendor —</option>
              {vendors.map((v) => (
                <option key={v} value={v}>
                  {vendorLabel(v)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Step 2 — Model (only shown after vendor chosen) */}
      {selectedVendor && (
        <div className="ac-step">
          <div className="ac-step-label">
            <span className="ac-step-num">2</span>
            {messages.step2_label}
          </div>
          <div className="ac-selects">
            <div className="ac-f">
              <label className="ac-fl">Server Model</label>
              <select
                value={selectedModelId}
                onChange={(e) => handleModelChange(e.target.value)}
              >
                <option value="">— Select model —</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.model_name} — {m.storage_raw_tb} TB
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Results panel */}
      {hasResults && competitor && arxysModel && (
        <div className="ac-results">
          {/* Spec comparison table */}
          <div className="ac-tw">
            <table className="ac-tbl">
              <thead>
                <tr>
                  <th className="ac-th-spec">Specification</th>
                  <th className="ac-th-comp">{competitor.brand_name} {competitor.product_line}</th>
                  <th className="ac-th-arxys">Arxys VideoX</th>
                  <th className="ac-th-adv">Advantage</th>
                </tr>
              </thead>
              <tbody>
                {displaySpecs.map((spec) => {
                  const compVal  = getVal(competitor, spec.spec_key);
                  const arxysVal = getVal(arxysModel, spec.spec_key);
                  const adv      = computeAdv(spec, arxysVal, compVal);

                  return (
                    <tr key={spec.spec_key}>
                      <td className="ac-td-spec">{spec.display_label}</td>
                      <td className="ac-td-val">{fmtVal(spec.spec_key, compVal)}</td>
                      <td className="ac-td-val ac-arxys-col">{fmtVal(spec.spec_key, arxysVal)}</td>
                      <td className="ac-td-adv">
                        {adv.kind === "badge" && (
                          <span className="ac-adv-badge">Arxys advantage</span>
                        )}
                        {adv.kind === "win" && (
                          <span className="ac-adv-win">{adv.text}</span>
                        )}
                        {adv.kind === "loss" && (
                          <span className="ac-adv-loss">{adv.text}</span>
                        )}
                        {adv.kind === "equal" && (
                          <span className="ac-adv-eq">Equal</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pricing section */}
          <div className="ac-pricing">
            <div className="ac-pricing-hdr">Pricing Comparison</div>
            <div className="ac-pricing-grid">
              <div className="ac-price-row">
                <div className="ac-price-label">
                  {competitor.brand_name} price (your quote)
                </div>
                <div className="ac-price-input-wrap">
                  <span className="ac-price-sym">$</span>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    placeholder="Enter quoted price"
                    value={userPrice}
                    onChange={(e) => setUserPrice(e.target.value)}
                    className="ac-price-input"
                  />
                </div>
              </div>

              <div className="ac-price-row">
                <div className="ac-price-label">Arxys VideoX MSRP</div>
                <div className="ac-price-val">
                  {fmtUsd(arxysModel.msrp)}
                </div>
              </div>

              {validPrice && priceDelta !== null && (
                <div className={`ac-price-row ac-delta-row${priceDelta > 0 ? " ac-delta-win" : priceDelta < 0 ? " ac-delta-loss" : ""}`}>
                  <div className="ac-price-label">
                    {priceDelta > 0
                      ? "You save per server"
                      : priceDelta < 0
                      ? "Competitor is lower by"
                      : "Same price"}
                  </div>
                  <div className="ac-price-val ac-price-delta">
                    {priceDelta !== 0 ? fmtUsd(priceDelta) : "—"}
                  </div>
                </div>
              )}
            </div>

            {validPrice && priceDelta !== null && (
              <>
                <div className="ac-disclosure">{messages.price_disclosure}</div>
              </>
            )}
          </div>

          {/* Deployment multiplier */}
          {validPrice && priceDelta !== null && (
            <div className="ac-deploy">
              <div className="ac-deploy-hdr">{messages.multiplier_label}</div>
              <div className="ac-deploy-body">
                <div className="ac-deploy-slider">
                  <label className="ac-fl">Servers in deployment</label>
                  <div className="ac-sr">
                    <input
                      type="range"
                      min={1}
                      max={25}
                      value={serverCount}
                      onChange={(e) => setServerCount(Number(e.target.value))}
                    />
                    <span className="ac-svl">{serverCount}</span>
                  </div>
                </div>
                {deploymentSavings !== null && multiplierText && (
                  <div className={`ac-deploy-total${deploymentSavings >= 0 ? " ac-deploy-win" : " ac-deploy-loss"}`}>
                    <div className="ac-deploy-total-val">
                      {deploymentSavings >= 0 ? "+" : "−"}{fmtUsd(deploymentSavings)}
                    </div>
                    <div className="ac-deploy-total-msg">{multiplierText}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Callouts */}
          <div className="ac-callouts">
            <div className="ac-callout ac-callout-time">
              <div className="ac-callout-icon">⏱</div>
              <div className="ac-callout-text">{messages.lead_time_callout}</div>
            </div>
            <div className="ac-callout ac-callout-hdd">
              <div className="ac-callout-icon">💾</div>
              <div className="ac-callout-text">{messages.hdd_callout}</div>
            </div>
            <div className="ac-callout ac-callout-note">
              <div className="ac-callout-icon">💡</div>
              <div className="ac-callout-text">{messages.second_source_note}</div>
            </div>
          </div>

          {/* CTA */}
          <div className="ac-cta">
            <div className="ac-cta-hdr">{messages.cta_headline}</div>
            <div className="ac-cta-sub">{messages.cta_subtext}</div>
            <div className="ac-cta-btns">
              <button
                type="button"
                className="ac-btn-pdf"
                onClick={handleDownloadPdf}
                disabled={pdfStatus === "loading"}
              >
                {pdfStatus === "loading" ? "Generating…" : messages.pdf_button}
              </button>
              <button
                type="button"
                className="ac-btn-quote"
                onClick={handleRequestQuote}
                disabled={quoteStatus === "submitting" || quoteStatus === "ok"}
              >
                {quoteStatus === "submitting"
                  ? "Sending…"
                  : quoteStatus === "ok"
                  ? "Quote requested ✓"
                  : messages.cta_button}
              </button>
            </div>
            {quoteStatus === "ok" && (
              <div className="ac-cta-success">
                Your request has been sent — Arxys sales will be in touch within 24 hours.
              </div>
            )}
            {quoteStatus === "error" && quoteError && (
              <div className="ac-cta-error">{quoteError}</div>
            )}
            {pdfStatus === "error" && (
              <div className="ac-cta-error">PDF generation failed — please try again.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
