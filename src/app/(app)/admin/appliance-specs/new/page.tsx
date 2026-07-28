// /admin/appliance-specs/new — create an appliance row (design §3).
//
// This is the entry path for ALL SEVEN rows: appliance_specs ships empty and no
// migration or script seeds it (ADR 0097 §8), so every row on this table arrives
// through this page, and each entry doubles as end-to-end write-path validation.
//
// Admin-only, checked here as well as in the action: the /admin layout admits
// internal users too.

import { notFound } from "next/navigation";
import { requireAdminOrInternal } from "@/lib/auth/require-admin-or-internal";
import { initialValuesFromRow } from "../fields";
import { createApplianceSpec } from "../actions";
import { ApplianceSpecForm } from "../_components/appliance-spec-form";

export default async function NewApplianceSpecPage() {
  const gate = await requireAdminOrInternal();
  if (!gate.ok || !gate.isAdmin) notFound();

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

      <div className="mt-5">
        <ApplianceSpecForm
          mode="create"
          action={createApplianceSpec}
          initialValues={initialValuesFromRow(null)}
          skuLabel="new SKU"
        />
      </div>
    </div>
  );
}
