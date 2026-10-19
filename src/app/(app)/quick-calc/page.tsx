import Link from "next/link";
import { getViewer, isInternal as viewerIsInternal } from "@/lib/auth/viewer";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { QuickCalcForm } from "./quick-calc-form";
import type { OnBehalfPartner } from "@/app/(app)/calculator/calculator-form";

// Quick Project Calculation & Quote (ADR 0082) — the fast-path calculator.
// Six inputs, everything else pinned to the Arxys VSR standard; feeds the
// exact same submission → Pipedrive → System Estimate pipeline as the full
// calculator (the save path IS submitCalculation).

export default async function QuickCalcPage() {
  const viewer = await getViewer();

  // Mirror the full calculator's on-behalf gating (Phase 7/8): only internal
  // users get the partner picker; a partner sees their own company read-only.
  // Active only, matching public.is_internal() (ADR 0164).
  const isInternal = viewerIsInternal(viewer);
  const ownCompanyName = viewer?.partner?.company_name ?? null;
  const ownContactName = viewer?.partner?.contact_name ?? null;
  const onBehalfPartners: OnBehalfPartner[] = [];
  if (isInternal) {
    const admin = createSupabaseAdminClient();
    const { data: partnerRows } = await admin
      .from("partners")
      .select("id, company_name, contact_name")
      .eq("status", "active")
      .eq("is_internal", false)
      .order("company_name");
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

  return (
    <div className="mx-auto max-w-[760px]">
      <Link
        href="/dashboard"
        className="text-sm font-medium text-arxys-navy hover:underline"
      >
        ← Back to dashboard
      </Link>
      <h1 className="mt-3.5 text-2xl font-extrabold tracking-tight text-ink">
        Quick Project Calculation &amp; Quote
      </h1>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
        Don&apos;t have full camera specs yet? Get a saved quote from a handful
        of inputs — sized on the Arxys VSR standard, with the same output
        document as the full Calculator.
      </p>
      <QuickCalcForm
        isInternal={isInternal}
        onBehalfPartners={onBehalfPartners}
        ownCompanyName={ownCompanyName}
        ownContactName={ownContactName}
      />
    </div>
  );
}
