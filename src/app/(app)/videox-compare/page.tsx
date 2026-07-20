import Link from "next/link";
import { getQuickCompareModels } from "@/lib/videox-compare/data";
import { QUICK_COMPARE_SPECS, SECTIONS, FOOTNOTE } from "@/lib/videox-compare/specs";
import { VideoxCompareForm } from "./videox-compare-form";
import "./videox-compare.css";

export default async function VideoxComparePage() {
  const models = await getQuickCompareModels();

  return (
    <div className="mx-auto max-w-[1200px]">
      <Link
        href="/dashboard"
        className="text-sm font-medium text-arxys-navy hover:underline"
      >
        ← Back to dashboard
      </Link>
      <h1 className="mt-3.5 text-[26px] font-extrabold tracking-tight text-ink">
        VideoX Quick Compare
      </h1>
      <p className="mt-1.5 max-w-2xl text-[14.5px] leading-relaxed text-ink-soft">
        Every VideoX V5 NVR model side by side — specs, features, and
        capabilities at a glance. Tick two or more models to compare just those
        columns.
      </p>
      <VideoxCompareForm
        models={models}
        specs={QUICK_COMPARE_SPECS}
        sections={SECTIONS}
        footnote={FOOTNOTE}
      />
    </div>
  );
}
