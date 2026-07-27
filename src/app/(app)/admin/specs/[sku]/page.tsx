// /admin/specs/[sku] — edit one product_specs row (design §3).
//
// Admin-only, checked here as well as in the action: the /admin layout admits
// internal users too.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminOrInternal } from "@/lib/auth/require-admin-or-internal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { productGroupToFamilySlug } from "@/lib/price-book/families";
import { initialValuesFromRow, SPEC_FIELD_NAMES } from "../fields";
import { updateSpec } from "../actions";
import { SpecForm } from "../_components/spec-form";
import type { CapacityInputs } from "../_components/net-usable-preview";

export default async function EditSpecPage({
  params,
  searchParams,
}: {
  params: Promise<{ sku: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const gate = await requireAdminOrInternal();
  if (!gate.ok || !gate.isAdmin) notFound();

  const { sku } = await params;
  const { created } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data: row, error } = await supabase
    .from("product_specs")
    // Only the form's own 43 columns, plus provenance for the header. Selecting
    // the columns by name rather than `*` means an unsurfaced column (product_sku)
    // is visibly absent here rather than silently carried through the form.
    .select([...SPEC_FIELD_NAMES, "updated_at", "updated_by"].join(", "))
    .eq("id", sku)
    .maybeSingle<Record<string, unknown>>();

  if (error) {
    console.error("[load product_spec]", error);
    return (
      <div>
        <h1 className="text-2xl font-bold text-ink">{sku}</h1>
        <p className="mt-3 text-sm text-danger">Failed to load this spec row.</p>
      </div>
    );
  }
  if (!row) notFound();

  const savedCapacity: CapacityInputs = {
    storage_raw_tb: row.storage_raw_tb as number | null,
    hdd_count: row.hdd_count as number | null,
    raid_level_display: row.raid_level_display as string | null,
    raid_level_alt_display: row.raid_level_alt_display as string | null,
  };

  const familySlug = productGroupToFamilySlug(sku.split("-")[1] ?? "");

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-[#5c6472]">
            Product specs
          </p>
          <h1 className="mt-1 font-mono text-2xl font-bold text-ink">{sku}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {String(row.model_name ?? "")}
          </p>
        </div>
        {familySlug ? (
          <Link
            href={`/price-book/${familySlug}`}
            className="text-sm font-medium text-arxys-navy hover:underline"
          >
            View on the Price Book →
          </Link>
        ) : null}
      </div>

      {created ? (
        <p
          role="status"
          className="mt-4 rounded-[14px] border border-green-300 bg-green-50 p-3 text-sm font-medium text-green-800"
        >
          Spec row created. It is live on the Price Book now — check the net
          usable figure below.
        </p>
      ) : null}

      <div className="mt-5">
        <SpecForm
          mode="edit"
          action={updateSpec}
          initialValues={initialValuesFromRow(row)}
          savedCapacity={savedCapacity}
          skuLabel={sku}
        />
      </div>
    </div>
  );
}
