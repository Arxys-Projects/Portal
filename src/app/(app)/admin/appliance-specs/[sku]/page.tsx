// /admin/appliance-specs/[sku] — edit one appliance_specs row (design §3).
//
// Admin-only, checked here as well as in the action: the /admin layout admits
// internal users too.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminOrInternal } from "@/lib/auth/require-admin-or-internal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { productGroupToFamilySlug } from "@/lib/price-book/families";
import {
  initialValuesFromRow,
  sheetGroupWarnings,
  APPLIANCE_FIELD_NAMES,
  type SheetGroupRow,
} from "../fields";
import { updateApplianceSpec } from "../actions";
import { ApplianceSpecForm } from "../_components/appliance-spec-form";

export default async function EditApplianceSpecPage({
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
    .from("appliance_specs")
    // Only the form's own 62 columns, plus provenance for the header. Selecting
    // by name rather than `*` means an unsurfaced column would be visibly absent
    // here rather than silently carried through the form.
    .select([...APPLIANCE_FIELD_NAMES, "updated_at", "updated_by"].join(", "))
    .eq("id", sku)
    .maybeSingle<Record<string, unknown>>();

  if (error) {
    console.error("[load appliance_spec]", error);
    return (
      <div>
        <h1 className="text-2xl font-bold text-ink">{sku}</h1>
        <p className="mt-3 text-sm text-danger">Failed to load this appliance row.</p>
      </div>
    );
  }
  if (!row) notFound();

  // The sheet group as it stands right now. This is the always-on view of the
  // cross-row invariant the save action warns about (design §4b) — and it is
  // where a row created a moment ago gets its group checked, since the create
  // action redirects here rather than returning a message.
  const sheetGroup = String(row.sheet_group ?? "");
  const { data: groupData } = await supabase
    .from("appliance_specs")
    .select("id, family_type")
    .eq("sheet_group", sheetGroup)
    .order("id");
  const groupRows = (groupData ?? []) as SheetGroupRow[];
  const groupWarnings = sheetGroupWarnings(sheetGroup, groupRows);
  const siblings = groupRows.filter((r) => r.id !== sku);

  const familySlug = productGroupToFamilySlug(String(row.product_group ?? ""));

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-[#5c6472]">
            Appliance specs
          </p>
          <h1 className="mt-1 font-mono text-2xl font-bold text-ink">{sku}</h1>
          <p className="mt-1 text-sm text-ink-soft">{String(row.model_name ?? "")}</p>
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
          Appliance row created. Check the sheet group below, then keep filling
          the fields from the factsheet.
        </p>
      ) : null}

      <div className="mt-4 rounded-[14px] border border-line bg-panel p-4">
        <p className="text-sm text-ink">
          <span className="font-semibold">Sheet group {sheetGroup}</span> —{" "}
          {siblings.length === 0
            ? "this SKU is the only row on its datasheet."
            : `shares its datasheet with ${siblings.map((s) => s.id).join(", ")}.`}
        </p>
        {groupWarnings.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
            {groupWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="mt-5">
        <ApplianceSpecForm
          mode="edit"
          action={updateApplianceSpec}
          initialValues={initialValuesFromRow(row)}
          skuLabel={sku}
        />
      </div>
    </div>
  );
}
