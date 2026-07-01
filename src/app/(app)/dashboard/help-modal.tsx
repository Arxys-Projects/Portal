"use client";

import { useState } from "react";

const SECTIONS = [
  {
    id: "calculator",
    label: "Calculator",
    bullets: [
      "Enter a Project Name and, optionally, the VMS software and retention window.",
      "Add one or more camera groups — each group is a set of cameras sharing the same resolution, codec, and frame rate.",
      "The live totals at the top (cameras, bandwidth, storage) update as you type.",
      "Click Save & request quote to submit to Arxys sales. The page scrolls to your recommended configuration automatically.",
      "You can revise a past quote from My Pipeline — it saves as a new version without losing the original.",
    ],
  },
  {
    id: "pipeline",
    label: "My Pipeline",
    bullets: [
      "Shows all your submitted quotes grouped by project name.",
      "Each project displays the preferred or most-recent quote value and its pipeline status (draft, sent, on hold, won, lost).",
      "Click a row to expand the deal and see individual quote revisions.",
      "The summary bar at the top shows your total open pipeline and weighted forecast.",
      "Drafts are excluded from dollar totals until a quote is sent.",
    ],
  },
  {
    id: "comparison",
    label: "Server Comparison",
    bullets: [
      "Select an Arxys VideoX model and one or two competitor appliances to compare spec-for-spec.",
      "Columns show CPU, RAM, storage, camera capacity, and MSRP side by side.",
      "Use this to build a competitive justification for a deal — VideoX typically wins on cameras-per-dollar.",
      "Competitor data is sourced from published spec sheets; pricing reflects current MSRP.",
    ],
  },
  {
    id: "quickcompare",
    label: "VideoX Quick Compare",
    bullets: [
      "Compare every VideoX V5 NVR model side by side across all spec categories.",
      "Use the tab bar to switch between Overview, System, Storage, and Networking sections.",
      "Highlight a column by clicking a model name to focus on that unit.",
      "Good for answering 'what's the difference between a V400 and a V500?' on a sales call.",
    ],
  },
  {
    id: "pricebook",
    label: "Price Book",
    bullets: [
      "Browse VideoX families (V100 through V800) with specs and current MSRPs.",
      "Each family page lists all storage tier SKUs and their list prices.",
      "Download the full price list as an Excel file from the Dashboard ('VideoX Price List').",
      "Prices shown are MSRP — your partner discount is applied separately.",
    ],
  },
  {
    id: "deals",
    label: "Deal Registration",
    bullets: [
      "Use the Register a Deal form on the Dashboard to lock in partner protection on a specific opportunity.",
      "Enter the end-customer name and your contact info — Andy will follow up to confirm.",
      "Deal registration is separate from submitting a quote via the Calculator.",
    ],
  },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export default function HelpModal() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<SectionId>("calculator");

  const section = SECTIONS.find((s) => s.id === active)!;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-[#3a4351] transition-colors hover:text-arxys-navy"
        aria-label="Open portal help guide"
      >
        <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-arxys-navy text-[11px] font-bold leading-none text-arxys-navy">?</span>
        Portal guide
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="relative flex w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl" style={{ maxHeight: "85vh" }}>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
              <h2 className="text-base font-semibold text-neutral-900">Portal guide</h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                aria-label="Close"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 overflow-x-auto border-b border-neutral-200 px-4 pt-3 pb-0">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActive(s.id)}
                  className={[
                    "whitespace-nowrap rounded-t px-3 py-1.5 text-xs font-medium transition",
                    active === s.id
                      ? "border-b-2 border-arxys-navy text-neutral-900"
                      : "text-neutral-500 hover:text-neutral-800",
                  ].join(" ")}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="overflow-y-auto px-6 py-5">
              <h3 className="mb-3 text-sm font-semibold text-neutral-800">{section.label}</h3>
              <ul className="space-y-2">
                {section.bullets.map((b, i) => (
                  <li key={i} className="flex gap-2 text-sm text-neutral-700">
                    <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-arxys-navy" style={{ marginTop: "0.45rem" }} />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
