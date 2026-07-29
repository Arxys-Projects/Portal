// /admin/specs/[sku] — edit one product_specs row (design §3).
//
// Admin-only, checked here as well as in the action: the /admin layout admits
// internal users too.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminOrInternal } from "@/lib/auth/require-admin-or-internal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { productGroupToFamilySlug } from "@/lib/price-book/families";
import {
  DATASHEET_FIELD_NAMES,
  filledDatasheetFields,
  initialValuesFromRow,
  SPEC_FIELD_NAMES,
} from "../fields";
import { updateSpec } from "../actions";
import { SpecForm } from "../_components/spec-form";
import type { CapacityInputs } from "../_components/net-usable-preview";
import {
  PrefillActiveBanner,
  PrefillOffer,
  type PrefillSibling,
} from "../_components/datasheet-prefill";

/** The family segment of a SKU: VX5-V400-160 -> "V400". */
function groupOf(sku: string): string {
  return sku.split("-")[1] ?? "";
}

export default async function EditSpecPage({
  params,
  searchParams,
}: {
  params: Promise<{ sku: string }>;
  searchParams: Promise<{ created?: string; prefillFrom?: string }>;
}) {
  const gate = await requireAdminOrInternal();
  if (!gate.ok || !gate.isAdmin) notFound();

  const { sku } = await params;
  const { created, prefillFrom } = await searchParams;

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

  // The family's other capacity SKUs, for the datasheet prefill (ADR 0102).
  //
  // Read through the same RLS-scoped client, and read ONLY the datasheet columns
  // plus the id — a sibling's capacity inputs are none of this page's business
  // and selecting them would make it possible to widen the copy set by accident
  // later. The group filter runs in JS rather than as a LIKE: 21 rows is nothing
  // to fetch, and it avoids escaping a user-supplied segment into a pattern.
  //
  // A failure here is not fatal: the prefill is a convenience, so the page logs
  // and renders without the offer rather than failing an edit the admin came to
  // make.
  const { data: familyData, error: familyError } = await supabase
    .from("product_specs")
    .select(["id", ...DATASHEET_FIELD_NAMES].join(", "))
    .order("id");
  if (familyError) console.error("[load prefill siblings]", familyError);

  const familyRows = (familyData ?? []) as unknown as Record<string, unknown>[];
  const group = groupOf(sku);
  const siblingRows = familyRows.filter(
    (r) => typeof r.id === "string" && r.id !== sku && groupOf(r.id) === group,
  );
  const siblings: PrefillSibling[] = siblingRows.map((r) => ({
    sku: String(r.id),
    filledCount: filledDatasheetFields(r).length,
  }));

  // A prefill overlays the source row's datasheet columns onto this row's
  // values, so the form renders them as its defaults and the editor saves them
  // through the ordinary action. Only a real sibling is honoured: an unknown or
  // cross-family ?prefillFrom is ignored rather than 404'd, since the page is
  // still perfectly usable without it.
  const prefillSource = prefillFrom
    ? (siblingRows.find((r) => r.id === prefillFrom) ?? null)
    : null;

  const baseValues = initialValuesFromRow(row);
  const prefillValues = prefillSource
    ? initialValuesFromRow(prefillSource)
    : null;
  const initialValues = prefillValues
    ? {
        ...baseValues,
        // Exactly the 22, never `id` — which is the WHERE clause of the update
        // and is not in DATASHEET_FIELD_NAMES, so this cannot retarget the save.
        ...Object.fromEntries(
          DATASHEET_FIELD_NAMES.map((name) => [name, prefillValues[name] ?? ""]),
        ),
      }
    : baseValues;

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

      <div className="mt-4">
        {prefillSource ? (
          <PrefillActiveBanner
            fromSku={String(prefillSource.id)}
            copiedCount={filledDatasheetFields(prefillSource).length}
            sku={sku}
          />
        ) : (
          <PrefillOffer sku={sku} siblings={siblings} />
        )}
      </div>

      <div className="mt-5">
        <SpecForm
          // Remount when the prefill source changes: every field but the live
          // eleven is uncontrolled, so React would otherwise keep the previously
          // rendered defaultValue and the copied values would not appear.
          key={prefillSource ? `prefill:${String(prefillSource.id)}` : "saved"}
          mode="edit"
          action={updateSpec}
          initialValues={initialValues}
          savedCapacity={savedCapacity}
          skuLabel={sku}
        />
      </div>
    </div>
  );
}
