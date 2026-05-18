import Link from "next/link";
import { CalculatorForm } from "./calculator-form";
import "./calculator.css";

export default function CalculatorPage() {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Link
          href="/dashboard"
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back to dashboard
        </Link>
      </div>
      <CalculatorForm />
    </div>
  );
}
