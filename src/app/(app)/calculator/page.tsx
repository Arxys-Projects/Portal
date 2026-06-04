import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CalculatorForm } from "./calculator-form";
import {
  fromStoredSubmission,
  type CalculatorInitialState,
} from "@/lib/calculator/rehydrate";
import "./calculator.css";

type Search = Promise<{ revise?: string }>;

export default async function CalculatorPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const { revise } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Quote revision (Phase 4 Step 3): load the source submission RLS-scoped so a
  // partner can only rehydrate their own quote. A missing/forbidden row simply
  // yields a fresh calculator rather than an error.
  let initialState: CalculatorInitialState | undefined;
  let sourceSubmissionId: string | undefined;
  if (revise) {
    const { data: source } = await supabase
      .from("submissions")
      .select("id, input_state, groups_payload")
      .eq("id", revise)
      .maybeSingle();
    if (source) {
      initialState = fromStoredSubmission({
        input_state: source.input_state,
        groups_payload: source.groups_payload,
      });
      sourceSubmissionId = source.id as string;
    }
  }

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

  // Phase 7 Step 1 — only internal users may run a calc on behalf of a partner.
  // The target-partner field (and its company-name suggestions) renders for them
  // alone. RLS blocks a non-admin from listing partners, so the suggestion list
  // is fetched with the admin client and gated behind is_internal.
  let isInternal = false;
  const partnerCompanyNames: string[] = [];
  if (user) {
    const { data: caller } = await supabase
      .from("partners")
      .select("is_internal")
      .eq("id", user.id)
      .maybeSingle();
    isInternal = Boolean(caller?.is_internal);
    if (isInternal) {
      const admin = createSupabaseAdminClient();
      const { data: partnerRows } = await admin
        .from("partners")
        .select("company_name")
        .order("company_name");
      const seen = new Set<string>();
      for (const row of partnerRows ?? []) {
        const name = (row.company_name as string)?.trim();
        if (name && !seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          partnerCompanyNames.push(name);
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
      <CalculatorForm
        previousProjectNames={previousProjectNames}
        initialState={initialState}
        sourceSubmissionId={sourceSubmissionId}
        isInternal={isInternal}
        partnerCompanyNames={partnerCompanyNames}
      />
    </div>
  );
}
