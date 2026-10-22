import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BomLine } from "./bom";
import type { ResolvedSystemDesign } from "./resolve";
import type { DesignRulesSnapshot } from "./rules";
import { SYSTEM_DESIGN_ENGINE_VERSION } from "./size";

// Banks a project calc's resolved design, rules snapshot and BOM in
// submission_system_designs (ADR 0165). The ONLY code that writes that table.
//
// The ownership check and the insert live together here, so no path can write
// the table without the check: the submission must exist and its partner_id
// must be the caller. `admin` must be the service-role client, the one role
// with INSERT on the table. The database repeats the check in its insert
// trigger (owner, and an active internal user or admin), and the primary key
// refuses a second row for the same submission: insert once, never update.

export type BankSystemDesignInput = {
  submissionId: string;
  // The signed-in caller, as the server action verified it. Never from the request.
  callerId: string;
  design: ResolvedSystemDesign;
  snapshot: DesignRulesSnapshot;
  bom: readonly BomLine[];
};

export type BankSystemDesignResult =
  | { ok: true }
  | { ok: false; reason: "not-owner" }
  | { ok: false; reason: "db-error"; context: "check owner" | "bank design"; error: unknown };

export async function bankSystemDesign(
  admin: SupabaseClient,
  input: BankSystemDesignInput,
): Promise<BankSystemDesignResult> {
  const { data: owner, error: ownerError } = await admin
    .from("submissions")
    .select("partner_id")
    .eq("id", input.submissionId)
    .maybeSingle();
  if (ownerError) return { ok: false, reason: "db-error", context: "check owner", error: ownerError };
  if (!owner || owner.partner_id !== input.callerId) return { ok: false, reason: "not-owner" };

  const { error } = await admin.from("submission_system_designs").insert({
    submission_id: input.submissionId,
    resolved_design: input.design,
    rules_snapshot: input.snapshot,
    bom: input.bom,
    engine_version: SYSTEM_DESIGN_ENGINE_VERSION,
    created_by: input.callerId,
  });
  if (error) return { ok: false, reason: "db-error", context: "bank design", error };
  return { ok: true };
}
