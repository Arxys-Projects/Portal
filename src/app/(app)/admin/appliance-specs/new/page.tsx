// /admin/appliance-specs/new — create an appliance row (design §3).
//
// This is the entry path for ALL SEVEN rows: appliance_specs ships empty and no
// migration or script seeds it (ADR 0097 §8), so every row on this table arrives
// through this page, and each entry doubles as end-to-end write-path validation.
//
// It is also the PRIMARY surface for the sibling prefill (ADR 0103): because the
// table is empty and all seven rows are created here, the copy-from-sibling
// mechanism ADR 0102 built for the edit form matters most on create. Following a
// ?prefillFrom= link re-renders this page with the source row's 30 copyable
// fields as the form's defaults — a GET, no write — and Save goes through the
// ordinary createApplianceSpec action. With an empty table there are no sources
// yet, so the offer is simply absent until the first row exists.
//
// Admin-only, checked here as well as in the action: the /admin layout admits
// internal users too.

import { notFound } from "next/navigation";
import { requireAdminOrInternal } from "@/lib/auth/require-admin-or-internal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  APPLIANCE_PREFILL_FIELD_NAMES,
  filledPrefillFields,
  initialValuesFromRow,
  prefillInitialValues,
} from "../fields";
import { createApplianceSpec } from "../actions";
import { ApplianceSpecForm } from "../_components/appliance-spec-form";
import {
  AppliancePrefillActiveBanner,
  AppliancePrefillOffer,
  type PrefillSource,
} from "../_components/appliance-prefill";

export default async function NewApplianceSpecPage({
  searchParams,
}: {
  searchParams: Promise<{ prefillFrom?: string }>;
}) {
  const gate = await requireAdminOrInternal();
  if (!gate.ok || !gate.isAdmin) notFound();

  const { prefillFrom } = await searchParams;

  // Every existing row is a candidate source, cross-sheet-group included, since
  // a chassis family spans sheet groups. Read only the id, the archetype (for
  // the label) and the 30 copyable columns — a source's per-SKU fields are none
  // of this page's business, and not selecting them keeps the copy set from
  // being widened here by accident.
  //
  // A failure to read the sources is not a failure to create: the prefill is a
  // convenience, so the page logs and renders without the offer rather than
  // failing an entry the admin came to make.
  const supabase = await createSupabaseServerClient();
  const { data: sourceData, error: sourceError } = await supabase
    .from("appliance_specs")
    .select(["id", "family_type", ...APPLIANCE_PREFILL_FIELD_NAMES].join(", "))
    .order("id");
  if (sourceError) console.error("[load appliance prefill sources]", sourceError);

  const sourceRows = (sourceData ?? []) as unknown as Record<string, unknown>[];
  const sources: PrefillSource[] = sourceRows.map((r) => ({
    sku: String(r.id),
    familyType: (r.family_type as string | null) ?? null,
    filledCount: filledPrefillFields(r).length,
  }));

  // Only a real existing row is honoured as a source: an unknown ?prefillFrom is
  // ignored rather than 404'd, since the create form is perfectly usable without
  // it.
  const prefillSource = prefillFrom
    ? (sourceRows.find((r) => r.id === prefillFrom) ?? null)
    : null;

  const initialValues = prefillInitialValues(
    initialValuesFromRow(null),
    prefillSource,
  );

  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-[#5c6472]">
        Appliance specs
      </p>
      <h1 className="mt-1 text-2xl font-bold text-ink">New appliance row</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-soft">
        For a management, ACM or workstation SKU. The SKU must match{" "}
        <code className="font-mono">products.sku</code> exactly — the two tables
        are joined in process on it, with no foreign key to catch a typo. Pick
        the family type first: it decides which sections apply, and the datasheet
        template dispatches on it.
      </p>

      <div className="mt-4">
        {prefillSource ? (
          <AppliancePrefillActiveBanner
            fromSku={String(prefillSource.id)}
            copiedCount={filledPrefillFields(prefillSource).length}
            discardHref="/admin/appliance-specs/new"
            saveLabel="Create appliance row"
          />
        ) : (
          <AppliancePrefillOffer
            basePath="/admin/appliance-specs/new"
            sources={sources}
          />
        )}
      </div>

      <div className="mt-5">
        <ApplianceSpecForm
          // Remount when the prefill source changes: every field but the live
          // ones is uncontrolled, so React would otherwise keep the previously
          // rendered defaultValue and the copied values would not appear.
          key={prefillSource ? `prefill:${String(prefillSource.id)}` : "blank"}
          mode="create"
          action={createApplianceSpec}
          initialValues={initialValues}
          skuLabel="new SKU"
        />
      </div>
    </div>
  );
}
