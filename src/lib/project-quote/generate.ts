import type { SupabaseClient } from "@supabase/supabase-js";
import { projectQuoteExpiryIso } from "./expiry";
import type { AssembleSnapshotResult, ProjectQuoteSnapshot } from "./types";

// ===========================================================================
// Project Quote — generate orchestrator (Phase 10 Step 6).
//
// The dependency-injected core of the "Generate Project Quote" action. The thin
// "use server" wrapper (project-quote-actions.ts) supplies the real assemble /
// render / deliver functions and the authenticated supabase client; this core
// owns the branch handling, the version-conflict retry, and the resilience
// ordering. Keeping the server-only imports (assemble.ts, render.ts) in the
// wrapper and injecting them here lets the core be unit-tested under plain Node
// with fakes — the same render -> data dependency discipline the rest of the
// module follows.
//
// Resilience ordering (ADR 0020): persist the row FIRST, then render, then
// deliver. A delivery (or render) failure is NON-FATAL and leaves a stored,
// re-deliverable quote — the same way submitCalculation treats deal sync as
// non-fatal. The quote exists once the row is in; delivery is best-effort.
// ===========================================================================

export type GenerateProjectQuoteResult =
  | {
      ok: true;
      version: number;
      identifier: string;
      // UTC calendar date (YYYY-MM-DD) the quote is valid through.
      expiresOn: string;
      // Whether the rendered PDF was attached to the Pipedrive deal. A false
      // value is NOT an error: the quote is persisted and re-deliverable.
      delivered: boolean;
      // Present only when delivered === false: a non-blocking operator notice.
      deliveryNote?: string;
    }
  | { ok: false; error: string };

// User-facing copy. House rules: no em dashes, no "not X but Y".
export const GENERATE_MESSAGES = {
  empty_deal:
    "This deal has no products yet. Add the line items in Pipedrive, then generate the quote.",
  no_deal_link:
    "This submission has no linked Pipedrive deal, so there is nothing to quote.",
  submission_not_found: "That submission could not be found.",
  deal_read_error:
    "Pipedrive could not be reached to read the deal. Try again in a moment.",
  persist_failed: "The quote could not be saved. Try again.",
  delivery_failed:
    "The quote was saved but could not be attached to the Pipedrive deal. You can retry generation to deliver it.",
} as const;

function mapAssembleFailure(
  result: Exclude<AssembleSnapshotResult, { ok: true }>,
): GenerateProjectQuoteResult {
  switch (result.reason) {
    case "empty_deal":
      return { ok: false, error: GENERATE_MESSAGES.empty_deal };
    case "no_deal_link":
      return { ok: false, error: GENERATE_MESSAGES.no_deal_link };
    case "submission_not_found":
      return { ok: false, error: GENERATE_MESSAGES.submission_not_found };
    case "deal_read_error":
      return { ok: false, error: GENERATE_MESSAGES.deal_read_error };
  }
}

export type GenerateDeps = {
  supabase: SupabaseClient;
  // Re-running assembly recomputes max(version)+1 and re-reads the deal; the
  // retry path calls it again on a version race.
  assemble: (submissionId: string) => Promise<AssembleSnapshotResult>;
  render: (snapshot: ProjectQuoteSnapshot) => Promise<Uint8Array>;
  filename: (snapshot: ProjectQuoteSnapshot) => string;
  deliver: (dealId: number, filename: string, buffer: Uint8Array) => Promise<unknown>;
};

// Postgres unique_violation. The unique (submission_id, version) constraint is
// the concurrency guard (ADR 0061): two racing generates both compute the same
// version, the second INSERT trips this, and we re-assemble once to get the
// next version rather than surfacing a raw DB error.
const UNIQUE_VIOLATION = "23505";

export async function generateProjectQuoteCore(
  submissionId: string,
  deps: GenerateDeps,
): Promise<GenerateProjectQuoteResult> {
  const assembled = await deps.assemble(submissionId);
  if (!assembled.ok) return mapAssembleFailure(assembled);

  // Persist first. The unique (submission_id, version) constraint is the race
  // guard: on a conflict, re-assemble once (recomputing version) and retry.
  let row = assembled.row;
  let insertedVersion: number | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await deps.supabase
      .from("project_quotes")
      .insert(row)
      .select("id, version")
      .single();

    if (!error && data) {
      insertedVersion = (data as { version: number }).version;
      break;
    }

    const code = (error as { code?: string } | null)?.code;
    if (code !== UNIQUE_VIOLATION || attempt === 1) {
      console.error("[project-quote persist]", error);
      return { ok: false, error: GENERATE_MESSAGES.persist_failed };
    }

    // Version race: another generate took this version. Re-assemble (which
    // recomputes max(version)+1) and try once more. No demote step, no
    // is_current flag — the new version row is the new "current" by derivation.
    const reassembled = await deps.assemble(submissionId);
    if (!reassembled.ok) return mapAssembleFailure(reassembled);
    row = reassembled.row;
  }

  if (insertedVersion === null) {
    return { ok: false, error: GENERATE_MESSAGES.persist_failed };
  }

  // Row is persisted: the quote exists and is re-renderable from its snapshot.
  // Render + deliver are best-effort from here; failure does not roll back.
  const snapshot = row.snapshot;
  let delivered = false;
  let deliveryNote: string | undefined;
  try {
    const buffer = await deps.render(snapshot);
    await deps.deliver(row.pipedrive_deal_id, deps.filename(snapshot), buffer);
    delivered = true;
  } catch (err) {
    console.error("[project-quote delivery]", err);
    deliveryNote = GENERATE_MESSAGES.delivery_failed;
  }

  return {
    ok: true,
    version: insertedVersion,
    identifier: snapshot.generation.identifier,
    expiresOn: projectQuoteExpiryIso(snapshot.generation.generatedAt, snapshot.generation.validityDays),
    delivered,
    deliveryNote,
  };
}
