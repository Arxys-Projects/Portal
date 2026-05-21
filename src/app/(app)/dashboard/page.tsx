import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: partner } = user
    ? await supabase
        .from("partners")
        .select("role")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };
  const isAdmin = partner?.role === "admin";

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

        <Link
          href="/submissions"
          className="group rounded-lg border border-neutral-200 bg-white p-6 transition hover:border-blue-300 hover:shadow-sm"
        >
          <h2 className="text-base font-semibold text-neutral-900 group-hover:text-blue-700">
            Submission history
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            Browse your past calculator submissions and reports.
          </p>
        </Link>

        <Link
          href="/api/price-book/xlsx"
          className="rounded-lg border border-neutral-200 bg-white p-6 transition hover:border-arxys-gold hover:shadow-sm"
        >
          <h2 className="text-base font-semibold text-neutral-900">
            VideoX price list
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            Download the current VideoX MSRP price book as an Excel
            spreadsheet.
          </p>
          <p className="mt-3 text-sm font-medium text-arxys-gold">
            Download XLSX →
          </p>
        </Link>

        {isAdmin ? (
          <Link
            href="/admin"
            className="group rounded-lg border border-neutral-200 bg-white p-6 transition hover:border-blue-300 hover:shadow-sm"
          >
            <h2 className="text-base font-semibold text-neutral-900 group-hover:text-blue-700">
              Admin
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Manage partners and review all submissions.
            </p>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
