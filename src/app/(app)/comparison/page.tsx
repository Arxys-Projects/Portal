import Link from "next/link";
import { getComparisonData } from "@/lib/comparison/data";
import { DISPLAY_SPECS, MESSAGES } from "@/lib/comparison/display-specs";
import { ComparisonForm } from "./comparison-form";
import "./comparison.css";

export default async function ComparisonPage() {
  const { productSpecs, competitorsByVendor } = await getComparisonData();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
          ← Back to dashboard
        </Link>
      </div>
      <ComparisonForm
        productSpecs={productSpecs}
        competitorsByVendor={competitorsByVendor}
        displaySpecs={DISPLAY_SPECS}
        messages={MESSAGES}
      />
    </div>
  );
}
