import Link from "next/link";
import { getQuickCompareModels } from "@/lib/videox-compare/data";
import { QUICK_COMPARE_SPECS, SECTIONS, FOOTNOTE } from "@/lib/videox-compare/specs";
import { VideoxCompareForm } from "./videox-compare-form";
import "./videox-compare.css";

export default async function VideoxComparePage() {
  const models = await getQuickCompareModels();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
          ← Back to dashboard
        </Link>
      </div>
      <VideoxCompareForm
        models={models}
        specs={QUICK_COMPARE_SPECS}
        sections={SECTIONS}
        footnote={FOOTNOTE}
      />
    </div>
  );
}
