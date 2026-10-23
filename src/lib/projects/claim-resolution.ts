// What scripts/resolve-project-deal-claim.mts may do with a project's deal
// claim (ADR 0170). Pure, so the rules are unit-tested; the script does the
// reads and writes.
//
// A claim with no deal id means POST /api/v2/deals may have reached Pipedrive
// without the portal hearing back. Andy checks Pipedrive, then either attaches
// the deal that was created, or releases the claim when none was.

export type ClaimForResolution = {
  id: number;
  projectId: string;
  submissionId: string;
  pipedriveDealId: number | null;
  claimedAt: string;
};

// A release needs the claim at least this old. A younger claim may be a
// create still in flight, or a deal Pipedrive's search has not indexed yet.
export const RELEASE_MIN_AGE_MS = 15 * 60 * 1000;

// The deal Andy names, as Pipedrive returns it; null when it was not found.
export type NamedDeal = { id: number; projectFieldValue: string | null; isDeleted: boolean } | null;

export type ClaimResolution =
  | { ok: true; action: "attach"; claimId: number; dealId: number; submissionId: string }
  | { ok: true; action: "release"; claimId: number }
  | { ok: false; message: string };

export function planClaimResolution(input: {
  claim: ClaimForResolution | null;
  action: "attach" | "release";
  dealId?: number;
  namedDeal?: NamedDeal;
  // Deals Pipedrive finds carrying this project's id in arxys_project_id:
  // the search plus the project org's deal list, read directly.
  dealsForProject: number[];
  now: Date;
}): ClaimResolution {
  const { claim } = input;
  if (!claim) return { ok: false, message: "This project has no deal claim. Nothing to resolve." };
  if (claim.pipedriveDealId) {
    return { ok: false, message: `The claim already holds deal #${claim.pipedriveDealId}. Nothing to resolve.` };
  }

  if (input.action === "release") {
    const ageMs = input.now.getTime() - Date.parse(claim.claimedAt);
    if (!(ageMs >= RELEASE_MIN_AGE_MS)) {
      return {
        ok: false,
        message: `The claim is ${Math.max(0, Math.round(ageMs / 60000))} minute(s) old. Wait until it is ${RELEASE_MIN_AGE_MS / 60000} minutes old: a create may still be running, or Pipedrive's search may not show its deal yet.`,
      };
    }
    if (input.dealsForProject.length > 0) {
      return {
        ok: false,
        message: `Pipedrive has deal(s) ${input.dealsForProject.map((d) => `#${d}`).join(", ")} for this project. Attach the right one instead of releasing the claim.`,
      };
    }
    return { ok: true, action: "release", claimId: claim.id };
  }

  const dealId = input.dealId;
  if (!dealId || !Number.isSafeInteger(dealId) || dealId <= 0) return { ok: false, message: "Give the deal id to attach." };
  const deal = input.namedDeal;
  if (!deal) return { ok: false, message: `Pipedrive has no deal #${dealId}.` };
  if (deal.isDeleted) return { ok: false, message: `Deal #${dealId} is deleted in Pipedrive.` };
  if (deal.projectFieldValue !== claim.projectId) {
    return {
      ok: false,
      message: `Deal #${dealId} does not carry this project's id in arxys_project_id (it has ${deal.projectFieldValue ?? "nothing"}).`,
    };
  }
  return { ok: true, action: "attach", claimId: claim.id, dealId, submissionId: claim.submissionId };
}
