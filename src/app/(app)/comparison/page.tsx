import Link from "next/link";
import { getComparisonData } from "@/lib/comparison/data";
import { DISPLAY_SPECS, MESSAGES } from "@/lib/comparison/display-specs";
import { ComparisonForm } from "./comparison-form";

export default async function ComparisonPage() {
  const { productSpecs, competitorsByVendor } = await getComparisonData();

  return (
    <div className="mx-auto max-w-[940px]">
      <Link
        href="/dashboard"
        className="text-sm font-medium text-arxys-navy hover:underline"
      >
        ← Back to dashboard
      </Link>
      <h1 className="mt-3.5 text-[26px] font-extrabold tracking-tight text-ink">
        VMS Server Comparison
      </h1>
      <p className="mt-1.5 max-w-2xl text-[14.5px] leading-relaxed text-ink-soft">
        {MESSAGES.page_subhead}
      </p>
      <ComparisonForm
        productSpecs={productSpecs}
        competitorsByVendor={competitorsByVendor}
        displaySpecs={DISPLAY_SPECS}
        messages={MESSAGES}
      />
    </div>
  );
}
