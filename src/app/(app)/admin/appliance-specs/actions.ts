"use server";

// Server actions for the appliance_specs admin form (ADR 0097 decision 3).
//
// Two writes, no delete — and there must never be a delete here. Migration
// 20260729000001 withholds the DELETE grant entirely: once the skuExtraData
// overrides retire, these rows are the only source for the management / ACM /
// workstation Price Book strings and for the datasheet renderer, so removing one
// silently blanks those surfaces with no error anywhere (the ADR 0094 failure
// shape, restated for this table). service_role is the recovery path.
//
// AUTHORISATION, verbatim from the product_specs actions: the /admin layout gate
// admits internal users as well as admins, so every action checks `gate.isAdmin`
// specifically, and the client is createSupabaseServerClient(), NEVER
// createSupabaseAdminClient() — RLS is the real enforcement point, so a bug in
// the application-level check cannot produce an unauthorised write.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminOrInternal } from "@/lib/auth/require-admin-or-internal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors/safe-message";
import { productGroupToFamilySlug } from "@/lib/price-book/families";
import type { SpecActionState } from "@/lib/spec-form";
import {
  applianceWarnings,
  sheetGroupWarnings,
  type ApplianceRuleValues,
  type SheetGroupRow,
} from "./fields";
import {
  applianceInputFromFormData,
  parseApplianceForm,
  type SpecFormValues,
} from "./schema";

async function requireAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const gate = await requireAdminOrInternal();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!gate.isAdmin) {
    return {
      ok: false,
      error:
        "Editing appliance specs is admin-only. Internal users can view this page but not save changes.",
    };
  }
  return { ok: true, userId: gate.userId };
}

/**
 * The Price Book family page this SKU appears on.
 *
 * appliance_specs.id IS the products.sku (VX5-V250-MGM), and the middle segment
 * is the product group families.ts already maps — the same arrangement as
 * product_specs, so the same helper works unchanged.
 */
function familyPathForSku(sku: string): string | null {
  const group = sku.split("-")[1];
  if (!group) return null;
  const slug = productGroupToFamilySlug(group);
  return slug ? `/price-book/${slug}` : null;
}

function revalidateAppliancePaths(sku: string) {
  revalidatePath("/admin/appliance-specs");
  revalidatePath(`/admin/appliance-specs/${sku}`);
  revalidatePath("/price-book");
  const familyPath = familyPathForSku(sku);
  if (familyPath) revalidatePath(familyPath);
}

/**
 * The cross-row half of the sheet_group check (design §4b), run AFTER the write
 * so it sees the row that was just saved.
 *
 * A failure to read the group is not a failure to save: the row is already
 * committed by this point, so a warning that cannot be computed is simply not
 * shown rather than being reported as a save error.
 */
async function sheetGroupWarningsFor(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  sheetGroup: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("appliance_specs")
    .select("id, family_type")
    .eq("sheet_group", sheetGroup)
    .order("id");
  if (error || !data) return [];
  return sheetGroupWarnings(sheetGroup, data as SheetGroupRow[]);
}

export async function createApplianceSpec(
  _prev: SpecActionState | null,
  formData: FormData,
): Promise<SpecActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { status: "error", error: gate.error };

  const parsed = parseApplianceForm(applianceInputFromFormData(formData));
  if (!parsed.ok) {
    return {
      status: "error",
      error: "Fix the highlighted fields and try again.",
      fieldErrors: parsed.fieldErrors,
    };
  }
  const values = parsed.values;
  const sku = String(values.id);

  const supabase = await createSupabaseServerClient();
  // No updated_at / updated_by in the payload: the appliance_specs_stamp_updated
  // BEFORE trigger maintains both, and writing them here would fight it.
  const { data, error } = await supabase
    .from("appliance_specs")
    .insert(values)
    .select("id");
  if (error) {
    if (error.code === "23505") {
      return {
        status: "error",
        error: `An appliance spec row for ${sku} already exists. Edit it instead of creating a new one.`,
      };
    }
    return { status: "error", error: dbError(error, "create appliance spec") };
  }
  if ((data?.length ?? 0) === 0) {
    return {
      status: "error",
      error: "The database refused the insert. Your account may not have admin rights.",
    };
  }

  revalidateAppliancePaths(sku);
  // The edit page this lands on shows the row's sheet-group panel, which is
  // where the cross-row check for a freshly created row is read.
  redirect(`/admin/appliance-specs/${encodeURIComponent(sku)}?created=1`);
}

export async function updateApplianceSpec(
  _prev: SpecActionState | null,
  formData: FormData,
): Promise<SpecActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { status: "error", error: gate.error };

  const parsed = parseApplianceForm(applianceInputFromFormData(formData));
  if (!parsed.ok) {
    return {
      status: "error",
      error: "Fix the highlighted fields and try again.",
      fieldErrors: parsed.fieldErrors,
    };
  }
  const values: SpecFormValues = parsed.values;
  const sku = String(values.id);

  // The primary key is the WHERE clause, not part of the payload: renaming a SKU
  // would orphan the products join and the audit history, which is why the form
  // renders `id` read-only.
  const { id: _id, ...payload } = values;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("appliance_specs")
    .update(payload)
    .eq("id", sku)
    .select("id");
  if (error) return { status: "error", error: dbError(error, "update appliance spec") };
  // An UPDATE blocked by RLS is a SILENT zero-row no-op, not an error. Without
  // this check a refused save would report success.
  if ((data?.length ?? 0) === 0) {
    return {
      status: "error",
      error: `No row was updated. Either ${sku} no longer exists, or your account does not have admin rights.`,
    };
  }

  revalidateAppliancePaths(sku);
  const groupWarnings = await sheetGroupWarningsFor(
    supabase,
    String(values.sheet_group ?? ""),
  );
  return {
    status: "ok",
    message: `Saved ${sku}.`,
    warnings: [...applianceWarnings(values as ApplianceRuleValues), ...groupWarnings],
  };
}
