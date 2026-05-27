import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CalculatorForm } from "./calculator-form";
import "./calculator.css";

export default async function CalculatorPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const previousProjectNames: string[] = [];
  if (user) {
    const { data } = await supabase
      .from("submissions")
      .select("project_name")
      .eq("partner_id", user.id)
      .not("project_name", "is", null)
      .order("created_at", { ascending: false });
    if (data) {
      const seen = new Set<string>();
      for (const row of data) {
        const name = (row.project_name as string).trim();
        if (name && !seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          previousProjectNames.push(name);
        }
      }
    }
  }

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
      <CalculatorForm previousProjectNames={previousProjectNames} />
    </div>
  );
}
