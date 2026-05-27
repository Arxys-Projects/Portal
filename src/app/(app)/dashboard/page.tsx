import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Footer from "@/app/(app)/_components/footer";
import RegisterDealForm from "./register-deal-form";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: partner } = user
    ? await supabase
        .from("partners")
        .select("id, role, company_name, contact_name, email")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };
  const isAdmin = partner?.role === "admin";

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-3xl font-semibold text-neutral-900">
          Arxys Partner Dashboard
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          Welcome back{user?.email ? `, ${user.email}` : ""}.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {/* Calculator */}
          <Link
            href="/calculator"
            className="group rounded-lg border-2 border-neutral-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow-md"
          >
            <h2 className="text-xl font-semibold text-neutral-900 group-hover:text-blue-700">
              Calculator
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Estimate bandwidth and storage for a new deployment.
            </p>
          </Link>

          {/* My Pipeline */}
          <Link
            href="/submissions"
            className="group rounded-lg border-2 border-neutral-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow-md"
          >
            <h2 className="text-xl font-semibold text-neutral-900 group-hover:text-blue-700">
              My Pipeline
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Browse your past calculator submissions and reports.
            </p>
          </Link>

          {/* Price book */}
          <Link
            href="/price-book"
            className="group rounded-lg border-2 border-neutral-200 bg-white p-6 shadow-sm transition hover:border-[#054A91] hover:shadow-md"
          >
            <h2 className="text-xl font-semibold text-neutral-900 group-hover:text-[#054A91]">
              VideoX V5 Price Book
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Browse families, specs, and current MSRPs.
            </p>
            <p className="mt-3 text-sm font-medium text-[#054A91]">
              Open price book →
            </p>
          </Link>

          {/* XLSX download */}
          <Link
            href="/api/price-book/xlsx"
            className="rounded-lg border-2 border-neutral-200 bg-white p-6 shadow-sm transition hover:border-[#fbb040] hover:shadow-md"
          >
            <h2 className="text-xl font-semibold text-neutral-900">
              VideoX Price List
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Download the current VideoX MSRP price book as an Excel
              spreadsheet.
            </p>
            <p className="mt-3 text-sm font-medium text-[#fbb040]">
              Download XLSX →
            </p>
          </Link>

          {/* Support */}
          <div className="rounded-lg border-2 border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-neutral-900">Support</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Access documentation or open a ticket with the Arxys support team.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <a
                href="https://www.arxys.com/company/support/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-[#054A91] hover:underline"
              >
                Support Documentation →
              </a>
              <a
                href="https://arxys.supportsystem.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center rounded bg-[#fbb040] px-4 py-2 text-sm font-semibold text-[#1a1a1a] transition hover:bg-[#e69e2c]"
              >
                Open a Support Ticket
              </a>
            </div>
          </div>

          {/* Deal Registration */}
          <div className="rounded-lg border-2 border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-neutral-900">
              Register a Deal
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Lock in partner protection on a specific opportunity — Andy will
              follow up.
            </p>
            <div className="mt-4">
              <RegisterDealForm
                partnerId={partner?.id ?? ""}
                companyName={partner?.company_name ?? ""}
                contactName={partner?.contact_name ?? ""}
                partnerEmail={partner?.email ?? user?.email ?? ""}
              />
            </div>
          </div>

          {/* Admin */}
          {isAdmin ? (
            <Link
              href="/admin"
              className="group rounded-lg border-2 border-neutral-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow-md"
            >
              <h2 className="text-xl font-semibold text-neutral-900 group-hover:text-blue-700">
                Admin
              </h2>
              <p className="mt-1 text-sm text-neutral-600">
                Manage partners and review all submissions.
              </p>
            </Link>
          ) : null}
        </div>

        <Footer />
      </div>
    </div>
  );
}
