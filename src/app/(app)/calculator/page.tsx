import Link from "next/link";
import { CalculatorForm } from "./calculator-form";

export default function CalculatorPage() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Calculator</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Estimate bandwidth and storage for a video deployment.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back to dashboard
        </Link>
      </div>
      <CalculatorForm />
      <p className="mt-6 text-xs text-neutral-500">
        Server recommendation and save-to-history will land in Step 5.
      </p>
    </div>
  );
}
