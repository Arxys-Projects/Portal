// Resolve a project's stuck deal claim (Project Portal Step 5, ADR 0170).
//
// createProjectDeal takes a claim before POST /api/v2/deals. When Pipedrive
// does not confirm the create (timeout, 5xx), the claim keeps no deal id and
// the portal refuses every further create for that project, because a deal may
// exist. This script is how Andy clears it. It never writes to Pipedrive.
//
// Run:
//   Dry run (default; reads Supabase and Pipedrive, writes nothing):
//     node --env-file=.env.local --import tsx scripts/resolve-project-deal-claim.mts --project=<uuid> --attach-deal=<id>
//     node --env-file=.env.local --import tsx scripts/resolve-project-deal-claim.mts --project=<uuid> --release
//   Write (typed CONFIRM): add --apply.
//
// --attach-deal records the deal Pipedrive did create: on the claim, and on
// the calc (submissions.pipedrive_deal_id). The deal must carry the project's
// id in arxys_project_id. Then "retry missing lines" adds its lines.
// --release deletes the claim, only when the claim is at least 15 minutes old
// and Pipedrive shows no deal carrying the project's id (its search, plus the
// project org's deal list read directly, since search can lag), so the rep can
// create the deal again.

import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import { env } from "../src/lib/env";
import { listAllV2 } from "../src/lib/pipedrive/company-api";
import { findDealFieldCode, PROJECT_ID_FIELD_NAME } from "../src/lib/pipedrive/project-deal-api";
import { planClaimResolution, type NamedDeal } from "../src/lib/projects/claim-resolution";

const PD_V2_BASE = "https://api.pipedrive.com/api/v2";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : "";
}

async function promptConfirm(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout });
    rl.question(`\n${question} Type CONFIRM to write or anything else to exit: `, (a) => {
      rl.close();
      resolve(a.trim() === "CONFIRM");
    });
  });
}

async function pdGet(path: string): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const res = await fetch(`${PD_V2_BASE}${path}`, { headers: { "x-api-token": env.PIPEDRIVE_API_TOKEN } });
  let json: Record<string, unknown> | null = null;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function main() {
  const projectId = arg("project");
  const attach = arg("attach-deal");
  const release = arg("release") !== undefined;
  const apply = arg("apply") !== undefined;
  if (!projectId || !/^[0-9a-f-]{36}$/i.test(projectId) || (attach === undefined) === !release) {
    console.error("Usage: --project=<uuid> and exactly one of --attach-deal=<id> or --release [--apply]");
    process.exit(2);
  }

  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: row, error } = await admin
    .from("project_deal_claims")
    .select("id, project_id, submission_id, pipedrive_deal_id, claimed_by, claimed_at")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw new Error(`read claim: ${error.message}`);
  const now = new Date();
  console.log("Claim:", row ?? "(none)");
  if (row) console.log(`Claim age: ${Math.round((now.getTime() - Date.parse(row.claimed_at)) / 60000)} minute(s).`);

  const fieldCode = await findDealFieldCode(env.PIPEDRIVE_API_TOKEN, PROJECT_ID_FIELD_NAME);
  if (!fieldCode) throw new Error(`The "${PROJECT_ID_FIELD_NAME}" deal field was not found in Pipedrive.`);

  // Deals that carry this project's id (read-only search).
  const search = await pdGet(
    `/deals/search?term=${encodeURIComponent(projectId)}&fields=custom_fields&exact_match=true`,
  );
  const items = ((search.json?.data as { items?: { item?: { id?: number; title?: string } }[] } | undefined)?.items ?? [])
    .map((i) => i.item)
    .filter((i): i is { id: number; title?: string } => typeof i?.id === "number");
  if (search.status !== 200) throw new Error(`Pipedrive deal search failed (${search.status}); not safe to decide.`);
  // Search is index-backed and can lag, so also read the project org's deals
  // directly and check the field on each.
  const { data: project, error: projectError } = await admin
    .from("projects")
    .select("companies(pipedrive_org_id)")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) throw new Error(`read project: ${projectError.message}`);
  const orgId = (project as { companies: { pipedrive_org_id: number } | null } | null)?.companies?.pipedrive_org_id;
  if (!orgId) throw new Error("The project's company has no Pipedrive org; not safe to decide.");
  const orgDeals = await listAllV2<{ id: number; title?: string; custom_fields?: Record<string, unknown> | null }>(
    env.PIPEDRIVE_API_TOKEN,
    "/deals",
    { org_id: String(orgId) },
  );
  // If the list came back without custom fields, it proves nothing: stop.
  if (orgDeals.some((d) => !d.custom_fields || typeof d.custom_fields !== "object")) {
    throw new Error("Pipedrive's deal list did not include custom fields, so it cannot show a deal for this project; not safe to decide.");
  }
  const fromOrg = orgDeals.filter((d) => d.custom_fields?.[fieldCode] === projectId);
  const found = new Map<number, string | undefined>();
  for (const d of [...items, ...fromOrg]) found.set(d.id, d.title);
  console.log(
    "Pipedrive deals carrying this project's id (search plus the org's deal list):",
    found.size ? [...found].map(([id, title]) => ({ id, title })) : "(none)",
  );

  let namedDeal: NamedDeal = null;
  const dealId = attach ? Number(attach) : undefined;
  if (dealId) {
    const got = await pdGet(`/deals/${dealId}`);
    const data = got.json?.data as { id?: number; is_deleted?: boolean; title?: string; custom_fields?: Record<string, unknown> } | undefined;
    if (got.status === 200 && data?.id) {
      const value = data.custom_fields?.[fieldCode];
      namedDeal = { id: data.id, isDeleted: data.is_deleted === true, projectFieldValue: typeof value === "string" ? value : null };
      console.log(`Deal #${data.id}: "${data.title}"`, namedDeal);
    } else if (got.status !== 404) {
      throw new Error(`Pipedrive GET deal #${dealId} failed (${got.status}).`);
    }
  }

  const plan = planClaimResolution({
    claim: row
      ? {
          id: Number(row.id),
          projectId: row.project_id,
          submissionId: row.submission_id,
          pipedriveDealId: row.pipedrive_deal_id,
          claimedAt: row.claimed_at,
        }
      : null,
    action: release ? "release" : "attach",
    dealId,
    namedDeal,
    dealsForProject: [...found.keys()],
    now,
  });
  if (!plan.ok) {
    console.log(`\nRefused: ${plan.message}`);
    process.exit(1);
  }
  if (plan.action === "release") {
    console.log(`\nWould DELETE claim ${plan.claimId} (no deal id). The rep can then create the deal again.`);
  } else {
    console.log(
      `\nWould set claim ${plan.claimId} pipedrive_deal_id = ${plan.dealId}, and submissions ${plan.submissionId} pipedrive_deal_id = ${plan.dealId} (only if empty).`,
    );
  }
  if (!apply) {
    console.log("\nDry run: nothing written. Add --apply to write.");
    return;
  }
  if (!(await promptConfirm("Write the change above?"))) {
    console.log("Nothing written.");
    return;
  }

  if (plan.action === "release") {
    const { data, error: delError } = await admin
      .from("project_deal_claims")
      .delete()
      .eq("id", plan.claimId)
      .is("pipedrive_deal_id", null)
      .select("id");
    if (delError) throw new Error(`release claim: ${delError.message}`);
    console.log(`Released ${data?.length ?? 0} claim(s).`);
    return;
  }
  const { data: linked, error: linkError } = await admin
    .from("project_deal_claims")
    .update({ pipedrive_deal_id: plan.dealId, deal_linked_at: new Date().toISOString() })
    .eq("id", plan.claimId)
    .is("pipedrive_deal_id", null)
    .select("id");
  if (linkError) throw new Error(`attach deal to claim: ${linkError.message}`);
  if ((linked ?? []).length !== 1) throw new Error("The claim changed since the dry run; nothing attached.");
  const { error: subError } = await admin
    .from("submissions")
    .update({ pipedrive_deal_id: plan.dealId })
    .eq("id", plan.submissionId)
    .is("pipedrive_deal_id", null);
  if (subError) throw new Error(`link calc to deal: ${subError.message} (the claim is attached; "retry missing lines" links the calc)`);
  console.log(`Attached deal #${plan.dealId}. Next: "retry missing lines" on deal #${plan.dealId} adds its lines.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
