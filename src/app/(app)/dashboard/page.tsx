import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-neutral-900">Dashboard</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Welcome back{user?.email ? `, ${user.email}` : ""}.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/calculator"
          className="group rounded-lg border border-neutral-200 bg-white p-6 transition hover:border-blue-300 hover:shadow-sm"
        >
          <h2 className="text-base font-semibold text-neutral-900 group-hover:text-blue-700">
            Calculator
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            Estimate bandwidth and storage for a new deployment.
          </p>
        </Link>

        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-6">
          <h2 className="text-base font-semibold text-neutral-500">
            Submission history
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            Coming in Step 5.
          </p>
        </div>
      </div>
    </div>
  );
}
