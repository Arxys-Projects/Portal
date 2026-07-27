// /admin/specs/new — create a spec row for a SKU that has none (design §3).
//
// Admin-only, checked here as well as in the action: the /admin layout admits
// internal users too.

import { notFound } from "next/navigation";
import { requireAdminOrInternal } from "@/lib/auth/require-admin-or-internal";
import { initialValuesFromRow } from "../fields";
import { createSpec } from "../actions";
import { SpecForm } from "../_components/spec-form";

export default async function NewSpecPage() {
  const gate = await requireAdminOrInternal();
  if (!gate.ok || !gate.isAdmin) notFound();

  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-[#5c6472]">
        Product specs
      </p>
      <h1 className="mt-1 text-2xl font-bold text-ink">New spec row</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-soft">
        For a rack-video SKU that has no spec row yet. The SKU must match{" "}
        <code className="font-mono">products.sku</code> exactly — the two tables
        are joined in process on it, with no foreign key to catch a typo, and a
        mismatch means the model is skipped by the recommender and shows no net
        usable figure on the Price Book.
      </p>

      <div className="mt-5">
        <SpecForm
          mode="create"
          action={createSpec}
          initialValues={initialValuesFromRow(null)}
          savedCapacity={null}
          skuLabel="new SKU"
        />
      </div>
    </div>
  );
}
