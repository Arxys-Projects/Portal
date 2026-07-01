import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CalculatorForm } from "./calculator-form";
import {
  fromStoredSubmission,
  type CalculatorInitialState,
} from "@/lib/calculator/rehydrate";
import type { OnBehalfPartner } from "./calculator-form";
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
  let initialOnBehalfPartnerId: string | null = null;
  let initialOnBehalfCompanyName: string | null = null;
  if (revise) {
    const { data: source } = await supabase
      .from("submissions")
      .select("id, input_state, groups_payload, on_behalf_of_partner_id, on_behalf_of_company_name")
      .eq("id", revise)
      .maybeSingle();
    if (source) {
      initialState = fromStoredSubmission({
        input_state: source.input_state,
        groups_payload: source.groups_payload,
      });
      sourceSubmissionId = source.id as string;
      initialOnBehalfPartnerId = (source.on_behalf_of_partner_id as string | null) ?? null;
      initialOnBehalfCompanyName = (source.on_behalf_of_company_name as string | null) ?? null;
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

  // Phase 7 Step 1 / Phase 8 — only internal users may run a calc on behalf of a
  // partner. The target picker renders for them alone. RLS blocks a non-admin
  // from listing partners, so the list is fetched with the admin client and
  // gated behind is_internal. Phase 8 makes the named target a real portal user
  // (so the FK grants them visibility), so we expose the user identity — id,
  // company, contact, email — not just company-name suggestions.
  let isInternal = false;
  const onBehalfPartners: OnBehalfPartner[] = [];
  if (user) {
    const { data: caller } = await supabase
      .from("partners")
      .select("is_internal")
      .eq("id", user.id)
      .maybeSingle();
    isInternal = Boolean(caller?.is_internal);
    if (isInternal) {
      const admin = createSupabaseAdminClient();
      // Only active, non-internal partners are valid on-behalf targets — an
      // invited/suspended account can't sign in to see the work, and internal
      // users aren't external partners to roll a deal up to.
      const { data: partnerRows } = await admin
        .from("partners")
        .select("id, company_name, contact_name")
        .eq("status", "active")
        .eq("is_internal", false)
        .order("company_name");
      // Emails live on auth.users, not partners — join in memory, mirroring
      // admin/partners/page.tsx. listUsers caps at perPage=200; paginate here
      // and note it in JOURNAL if the partner base outgrows that.
      const emailById = new Map<string, string>();
      const list = await admin.auth.admin.listUsers({ perPage: 200 });
      if (list.error) {
        console.error("listUsers failed", list.error);
      } else {
        for (const u of list.data.users) {
          if (u.email) emailById.set(u.id, u.email);
        }
      }
      for (const row of partnerRows ?? []) {
        onBehalfPartners.push({
          id: row.id as string,
          companyName: (row.company_name as string)?.trim() ?? "",
          contactName: (row.contact_name as string)?.trim() ?? "",
          email: emailById.get(row.id as string) ?? null,
        });
      }
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Link
          href="/dashboard"
          className="text-sm font-medium text-arxys-navy hover:underline"
        >
          ← Back to dashboard
        </Link>
      </div>
      <CalculatorForm
        previousProjectNames={previousProjectNames}
        initialState={initialState}
        sourceSubmissionId={sourceSubmissionId}
        isInternal={isInternal}
        onBehalfPartners={onBehalfPartners}
        initialOnBehalfPartnerId={initialOnBehalfPartnerId}
        initialOnBehalfCompanyName={initialOnBehalfCompanyName}
      />
    </div>
  );
}
