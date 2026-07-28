"use server";

// Server actions for the product_specs admin form (ADR 0096 decision 4; design
// datasheets/spec-admin-form-design.md §3).
//
// Two writes, no delete. There is no delete action here and there must never be
// one: migration 20260727000001 withholds the DELETE grant entirely, because per
// ADR 0094 a SKU with no product_specs row is *skipped* by loadCandidateSpecs
// rather than falling back to its nameplate — so deleting a spec row silently
// removes a SKU from the recommender pool with no error anywhere. Availability
// is products.active's job. scripts/test-rls.ts test 21i proves the database
// refuses a delete even for an admin; this file is the other half of that, so
// the UI cannot offer the control by mistake.
//
// AUTHORISATION. The /admin layout gate (requireAdminOrInternal) admits internal
// users as well as admins, so every action below checks `gate.isAdmin`
// specifically — matching project-quote-actions.ts and the admin XLSX export,
// the other two admin-only surfaces inside that shell.
//
// The client is createSupabaseServerClient(), NEVER createSupabaseAdminClient().
// That is deliberate and load-bearing: RLS is the real enforcement point, so a
// bug in the application-level isAdmin check above cannot produce an
// unauthorised write. The service-role client would bypass the policies and make
// this file the only thing standing between an internal user and a
// customer-facing capacity figure.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminOrInternal } from "@/lib/auth/require-admin-or-internal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors/safe-message";
import { productGroupToFamilySlug } from "@/lib/price-book/families";
import { usableCapacityTb } from "@/lib/capacity-utils";
// The result shape is the shared kit's: <SpecFormShell> is what renders it, so
// the contract belongs next to the renderer rather than in one table's actions.
// Imported as a type only — a "use server" module may export nothing but async
// functions.
import type { SpecActionState } from "@/lib/spec-form";
import { specWarnings, type SpecRuleValues } from "./fields";
import { parseSpecForm, specInputFromFormData } from "./schema";

async function requireAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const gate = await requireAdminOrInternal();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!gate.isAdmin) {
    return {
      ok: false,
      error:
        "Editing product specs is admin-only. Internal users can view this page but not save changes.",
    };
  }
  return { ok: true, userId: gate.userId };
}

/**
 * The Price Book family page a SKU appears on, e.g. VX5-V500-192 -> /price-book/v500.
 *
 * product_specs.id IS the products.sku, and the middle segment is the product
 * group families.ts already maps. Returns null for a SKU shaped unexpectedly or
 * a group with no family page, in which case only the index and the Price Book
 * root are revalidated.
 */
function familyPathForSku(sku: string): string | null {
  const group = sku.split("-")[1];
  if (!group) return null;
  const slug = productGroupToFamilySlug(group);
  return slug ? `/price-book/${slug}` : null;
}

function revalidateSpecPaths(sku: string) {
  revalidatePath("/admin/specs");
  revalidatePath(`/admin/specs/${sku}`);
  revalidatePath("/price-book");
  const familyPath = familyPathForSku(sku);
  if (familyPath) revalidatePath(familyPath);
}

/** The net-usable figure the save just published, for the confirmation message. */
function netUsableSummary(values: Record<string, string | number | null>): string {
  const usable = usableCapacityTb(
    values.storage_raw_tb as number | null,
    values.hdd_count as number | null,
    values.raid_level_display as string | null,
  );
  if (usable == null) return "";
  return ` Net usable is now ${Math.round(usable * 10) / 10} TB.`;
}

export async function createSpec(
  _prev: SpecActionState | null,
  formData: FormData,
): Promise<SpecActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { status: "error", error: gate.error };

  const parsed = parseSpecForm(specInputFromFormData(formData));
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
  // No updated_at / updated_by in the payload: the product_specs_stamp_updated
  // BEFORE trigger maintains both, and writing them here would fight it.
  const { data, error } = await supabase
    .from("product_specs")
    .insert(values)
    .select("id");
  if (error) {
    // 23505 is the primary-key collision — the one failure with a fix the
    // editor can act on, so it is named rather than flattened by dbError().
    if (error.code === "23505") {
      return {
        status: "error",
        error: `A spec row for ${sku} already exists. Edit it instead of creating a new one.`,
      };
    }
    return { status: "error", error: dbError(error, "create product spec") };
  }
  if ((data?.length ?? 0) === 0) {
    return {
      status: "error",
      error: "The database refused the insert. Your account may not have admin rights.",
    };
  }

  revalidateSpecPaths(sku);
  redirect(`/admin/specs/${encodeURIComponent(sku)}?created=1`);
}

export async function updateSpec(
  _prev: SpecActionState | null,
  formData: FormData,
): Promise<SpecActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { status: "error", error: gate.error };

  const parsed = parseSpecForm(specInputFromFormData(formData));
  if (!parsed.ok) {
    return {
      status: "error",
      error: "Fix the highlighted fields and try again.",
      fieldErrors: parsed.fieldErrors,
    };
  }
  const values = parsed.values;
  const sku = String(values.id);

  // The primary key is the WHERE clause, not part of the payload. Renaming a
  // SKU is a different operation (it would orphan the products join and the
  // audit history) and the form renders `id` read-only for that reason.
  const { id: _id, ...payload } = values;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("product_specs")
    .update(payload)
    .eq("id", sku)
    .select("id");
  if (error) return { status: "error", error: dbError(error, "update product spec") };
  // An UPDATE blocked by RLS is a SILENT zero-row no-op, not an error — that is
  // what test 21e/21f record. Without this check a refused save would report
  // success and the editor would believe a capacity change had landed.
  if ((data?.length ?? 0) === 0) {
    return {
      status: "error",
      error: `No row was updated. Either ${sku} no longer exists, or your account does not have admin rights.`,
    };
  }

  revalidateSpecPaths(sku);
  return {
    status: "ok",
    message: `Saved ${sku}.${netUsableSummary(values)}`,
    warnings: specWarnings(values as SpecRuleValues),
  };
}
