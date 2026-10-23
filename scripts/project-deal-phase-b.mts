// Project Portal Step 5 Phase B: the one live end-to-end test of a portal-built
// deal with product lines (ADRs 0170, 0171, 0172). Andy runs every step himself.
//
// Each step is its own run. Reads run by default; a write needs --apply, prints
// exactly what it will write, and asks for a typed CONFIRM. One step, one write
// group, so Andy approves each live write on its own.
//
//   check                 (default) read-only: the acting rep, the source calc,
//                         the candidate companies, contacts (with linked logins)
//                         and projects, the Pipedrive pipeline, stage and field.
//   create-field          Pipedrive: POST /api/v2/dealFields arxys_project_id (varchar).
//   create-project        Supabase: one projects row for the source calc's job,
//                         under --company and --contact.
//   save-calc             Supabase + email: a fresh project calc with the source
//                         calc's groups, saved through the real submitCalculation
//                         as Andy. It renders the PDF and EMAILS SALES (ADR 0169).
//   preview               read-only: previewDealLines for --calc.
//   create-deal           Supabase + Pipedrive: createProjectDeal for --calc after
//                         Andy confirms the previewed lines and the deal header.
//   retry-lines           Supabase + Pipedrive: retryMissingLines for --deal.
//   verify                read-only: the diff, the deal header, the ledger, each
//                         line's price, the deal value against Pipedrive's line
//                         sums, and whether search and the org's deals show the
//                         project id.
//   --self-test           no network: the module mocks reach the action.
//
// Run (from the repo root, so the PDF finds its assets):
//   node --env-file=.env.local --experimental-test-module-mocks --import tsx scripts/project-deal-phase-b.mts check
//   ... create-field --apply
//   ... create-project --company=<uuid> --contact=<uuid> --apply
//   ... save-calc --project=<uuid> --design='<json>' --apply
//   ... preview --calc=<uuid>
//   ... create-deal --calc=<uuid> --apply
//   ... retry-lines --deal=<id> --apply
//   ... verify --deal=<id>
// Options: --source=<uuid> (default the Escambia calc 59b730df-...),
// --company-name=<text> (default "Cornerstone"), --again (save-calc when the
// project already has a calc).
//
// The `check` output lists contact names, emails and portal login ids: do not
// paste it into a committed file (the repo is public).
//
// HOW save-calc SIGNS IN (ADR 0172). submitCalculation reads the rep's session
// from request cookies, and a script has none. The script asks Supabase (service
// role) for a one-time magic-link token for Andy's account, which must be an
// active internal user, exchanges it for a session in memory, and hands
// submitCalculation that client. RLS and the submissions guard then apply
// exactly as for his browser. No password is used and no email is sent for the
// link. The session is signed out (this session only) on every exit path. The
// account is fixed to Andy's: the script never signs in as anyone else.
//
// PROJECT_DEAL_PRODUCTS is set to "true" inside this process only. Production
// keeps it off; Andy turns it on.

import { mock } from "node:test";
import assert from "node:assert/strict";
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { DealHeader, LedgerRowForCheck } from "../src/lib/projects/phase-b";

mock.module("server-only", { namedExports: {} });
mock.module("next/cache", { namedExports: { revalidatePath: () => {}, revalidateTag: () => {} } });

// The rep's signed-in client for save-calc; set before the action runs.
let sessionClient: SupabaseClient | null = null;
mock.module("@/lib/supabase/server", {
  namedExports: {
    createSupabaseServerClient: async () => {
      if (!sessionClient) throw new Error("No rep session: only save-calc signs in.");
      return sessionClient;
    },
  },
});

const { env } = await import("../src/lib/env");
const { listAllV2, postJsonV2 } = await import("../src/lib/pipedrive/company-api");
const { listPipedriveProducts } = await import("../src/lib/pipedrive/product-api");
const {
  PROJECT_ID_FIELD_NAME,
  PROJECT_PIPELINE_NAME,
  PROJECT_STAGE_NAME,
  listDealProductsV2,
  resolveProjectPipelineStage,
} = await import("../src/lib/pipedrive/project-deal-api");
const { fromStoredSubmission } = await import("../src/lib/calculator/rehydrate");
const phaseB = await import("../src/lib/projects/phase-b");

const PD_V2_BASE = "https://api.pipedrive.com/api/v2";
const DEFAULT_SOURCE = "59b730df-535c-42f2-a607-001097745322";
// ADR 0172: the script signs in as this account only.
const REP_EMAIL = "andy.newbom@arxys.com";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

process.env.PROJECT_DEAL_PRODUCTS = "true";

// ---------------------------------------------------------------------------
// Arguments and helpers
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const step = argv.find((a) => !a.startsWith("--")) ?? "check";
function arg(name: string): string | undefined {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : "";
}
const apply = arg("apply") !== undefined;
const sourceId = arg("source") || DEFAULT_SOURCE;

function uuidArg(name: string): string {
  const v = arg(name);
  if (!v || !UUID.test(v)) throw new Error(`--${name}=<uuid> is required for ${step}.`);
  return v;
}

function dealIdArg(): number {
  const id = Number(arg("deal"));
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("--deal=<id> is required.");
  return id;
}

async function confirm(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout });
    rl.question(`\n${question} Type CONFIRM to write or anything else to exit: `, (a) => {
      rl.close();
      resolve(a.trim() === "CONFIRM");
    });
  });
}

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

// A v2 GET that reports its status; a non-200 is printed by the caller.
async function pdGet<T>(path: string): Promise<{ status: number; data: T | null }> {
  const res = await fetch(`${PD_V2_BASE}${path}`, { headers: { "x-api-token": env.PIPEDRIVE_API_TOKEN } });
  let json: { data?: T } | null = null;
  try {
    json = (await res.json()) as { data?: T };
  } catch {
    json = null;
  }
  return { status: res.status, data: json?.data ?? null };
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const deps = { admin, pipedriveToken: env.PIPEDRIVE_API_TOKEN };

type Actor = { id: string; email: string; pipedriveUserId: number | null };

// Andy's account. It must be active and internal: submitCalculation honours the
// project fields only for is_internal (an admin who is not internal would be
// saved as a partner calc, with a deal made by name).
async function loadActor(): Promise<Actor> {
  let found: { id: string; email?: string } | undefined;
  for (let page = 1; page <= 20 && !found; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`list auth users: ${error.message}`);
    found = data.users.find((u) => (u.email ?? "").toLowerCase() === REP_EMAIL);
    if (data.users.length < 200) break;
  }
  if (!found) throw new Error(`No auth user with email ${REP_EMAIL}.`);
  const partner = must(
    await admin.from("partners").select("id, contact_name, status, role, is_internal, pipedrive_user_id").eq("id", found.id).maybeSingle(),
    "read the rep's partner row",
  ) as { id: string; contact_name: string; status: string; role: string; is_internal: boolean; pipedrive_user_id: number | null } | null;
  if (!partner) throw new Error(`${REP_EMAIL} has no partners row.`);
  console.log(
    `Rep: ${partner.contact_name} <${REP_EMAIL}> id=${partner.id} status=${partner.status} internal=${partner.is_internal} role=${partner.role} pipedrive_user_id=${partner.pipedrive_user_id ?? "(none)"}`,
  );
  if (partner.status !== "active" || partner.is_internal !== true) {
    throw new Error("The rep must be active with is_internal = true.");
  }
  return { id: partner.id, email: REP_EMAIL, pipedriveUserId: partner.pipedrive_user_id };
}

async function projectDeal() {
  return await import("../src/lib/projects/project-deal");
}

async function dealFields() {
  const fields = await listAllV2<Record<string, unknown>>(env.PIPEDRIVE_API_TOKEN, "/dealFields");
  return { fields, matches: phaseB.dealFieldMatches(fields, PROJECT_ID_FIELD_NAME) };
}

function printFieldMatches(matches: ReturnType<typeof phaseB.dealFieldMatches>) {
  if (matches.length === 0) return console.log(`"${PROJECT_ID_FIELD_NAME}" does not exist yet: create-field makes it.`);
  for (const m of matches) {
    console.log(`"${PROJECT_ID_FIELD_NAME}" code ${m.code} type ${m.type}${m.type === "varchar" ? "" : "  <-- NOT varchar"}`);
  }
  if (matches.length > 1) console.log(`PROBLEM: ${matches.length} fields share this name. Delete the extras in Pipedrive; the portal refuses to use either.`);
}

// The project's calcs (project_submissions), newest first.
async function projectCalcs(projectId: string) {
  const links = must(await admin.from("project_submissions").select("submission_id").eq("project_id", projectId), "read the project's calcs") as { submission_id: string }[];
  if (links.length === 0) return [];
  const rows = must(
    await admin
      .from("submissions")
      .select("id, project_name, created_at, email_sent_at, pipedrive_deal_id")
      .in("id", links.map((l) => l.submission_id))
      .order("created_at", { ascending: false }),
    "read the project's calcs",
  ) as { id: string; project_name: string | null; created_at: string; email_sent_at: string | null; pipedrive_deal_id: number | null }[];
  return rows;
}

// ---------------------------------------------------------------------------
// check
// ---------------------------------------------------------------------------

async function check() {
  section("Rep");
  await loadActor();

  section("Source calc");
  const src = must(
    await admin
      .from("submissions")
      .select("id, project_name, vms, created_at, input_state, groups_payload, pipedrive_deal_id, recommended_product_id, recommended_units, total_list_price_usd")
      .eq("id", sourceId)
      .maybeSingle(),
    "read the source calc",
  ) as Record<string, unknown> | null;
  if (!src) throw new Error(`No submission ${sourceId}.`);
  const state = fromStoredSubmission(src as { input_state?: unknown; groups_payload?: unknown });
  const cameras = state.groups.reduce((n, g) => n + g.cameras, 0);
  console.log(`${src.id}: "${src.project_name}" vms=${src.vms} groups=${state.groups.length} cameras=${cameras} retention=${state.retentionDays} utilization=${state.utilizationPct}%`);
  console.log(`Legacy recommendation: ${src.recommended_units} x ${src.recommended_product_id}, list $${src.total_list_price_usd}. Legacy add-ons: failover=${state.addOnFailoverRecorder} management=${state.addOnManagementServer} (save-calc uses --design instead).`);
  console.log(src.pipedrive_deal_id ? `WARNING: the legacy calc already has Pipedrive deal #${src.pipedrive_deal_id}. Phase B would add a second deal for the same job.` : "The legacy calc has no Pipedrive deal.");
  const link = must(await admin.from("project_submissions").select("project_id").eq("submission_id", sourceId).maybeSingle(), "read the source's project link") as { project_id: string } | null;
  console.log(link ? `Linked to project ${link.project_id}.` : "Not in a project (a legacy calc). save-calc makes a fresh project calc from its groups; the source is not changed.");

  const companyName = arg("company-name") || "Cornerstone";
  section(`Companies matching "${companyName}"`);
  const companies = must(
    await admin.from("companies").select("id, name, pipedrive_org_id, active").ilike("name", `%${companyName}%`),
    "read companies",
  ) as { id: string; name: string; pipedrive_org_id: number; active: boolean }[];
  if (companies.length === 0) console.log("(none)");
  for (const c of companies) {
    console.log(`company ${c.id}  "${c.name}"  org #${c.pipedrive_org_id}  active=${c.active}`);
    const contacts = must(
      await admin.from("contacts").select("id, name, email, pipedrive_person_id, active").eq("company_id", c.id).order("name"),
      "read contacts",
    ) as { id: string; name: string; email: string | null; pipedrive_person_id: number; active: boolean }[];
    for (const p of contacts) {
      const logins = must(await admin.from("partner_contact_links").select("partner_id").eq("contact_id", p.id).eq("company_id", c.id), "read login links") as { partner_id: string }[];
      const sees = logins.length === 1 ? `1 linked login (${logins[0].partner_id}): it would SEE the test calc if active and not internal` : `${logins.length} linked logins: no portal visibility`;
      console.log(`    contact ${p.id}  ${p.name}  <${p.email ?? "no email"}>  person #${p.pipedrive_person_id}  active=${p.active}  ${sees}`);
    }
    const projects = must(await admin.from("projects").select("id, name, primary_contact_id").eq("company_id", c.id), "read projects") as { id: string; name: string; primary_contact_id: string | null }[];
    for (const pr of projects) {
      const claim = must(await admin.from("project_deal_claims").select("pipedrive_deal_id").eq("project_id", pr.id).maybeSingle(), "read claims") as { pipedrive_deal_id: number | null } | null;
      const calcs = await projectCalcs(pr.id);
      console.log(`    project ${pr.id}  "${pr.name}"  contact=${pr.primary_contact_id ?? "none"}  calcs=${calcs.length}  claim=${claim ? `deal ${claim.pipedrive_deal_id ?? "(none yet)"}` : "none"}`);
    }
    const org = await pdGet<{ id: number; name: string }>(`/organizations/${c.pipedrive_org_id}`);
    console.log(`    Pipedrive org #${c.pipedrive_org_id}: ${org.status === 200 ? `"${org.data?.name}"` : `HTTP ${org.status}`}`);
  }

  section("Pipedrive routing and field");
  const pipelines = await listAllV2<{ id: number; name: string }>(env.PIPEDRIVE_API_TOKEN, "/pipelines");
  console.log(`Pipelines: ${pipelines.map((p) => `"${p.name}" #${p.id}`).join(", ")}`);
  const routing = await resolveProjectPipelineStage(env.PIPEDRIVE_API_TOKEN);
  console.log(routing.ok ? `OK "${PROJECT_PIPELINE_NAME}" #${routing.pipelineId} / "${PROJECT_STAGE_NAME}" #${routing.stageId}.` : `PROBLEM: ${routing.message}`);
  const pipeline = pipelines.find((p) => p.name === PROJECT_PIPELINE_NAME);
  if (pipeline) {
    const stages = await listAllV2<{ id: number; name: string }>(env.PIPEDRIVE_API_TOKEN, "/stages", { pipeline_id: String(pipeline.id) });
    console.log(`Stages in "${PROJECT_PIPELINE_NAME}": ${stages.map((s) => `"${s.name}" #${s.id}`).join(", ")}`);
  }
  const { fields, matches } = await dealFields();
  console.log(`dealFields: ${fields.length}; properties of the first: ${Object.keys(fields[0] ?? {}).join(", ")}`);
  printFieldMatches(matches);

  section("Next");
  console.log("Nothing above wrote anything. save-calc renders the PDF and emails sales (INTERNAL_NOTIFICATION_EMAIL); tell sales a test Escambia email is coming.");
}

// ---------------------------------------------------------------------------
// create-field, create-project
// ---------------------------------------------------------------------------

async function createField() {
  const { matches } = await dealFields();
  if (matches.length > 0) {
    printFieldMatches(matches);
    return console.log("Nothing to do: the field exists (fix any problem above in Pipedrive by hand).");
  }
  const body = { field_name: PROJECT_ID_FIELD_NAME, field_type: "varchar" };
  console.log(`Will POST /api/v2/dealFields ${JSON.stringify(body)}`);
  if (!apply) return console.log("Dry run: nothing written. Add --apply.");
  if (!(await confirm("Create the Pipedrive deal field above?"))) return console.log("Nothing written.");
  const created = await postJsonV2<Record<string, unknown>>(env.PIPEDRIVE_API_TOKEN, "/dealFields", body);
  console.log("Created:", { field_code: created.field_code ?? created.key, field_name: created.field_name ?? created.name, field_type: created.field_type });
  printFieldMatches((await dealFields()).matches);
}

async function createProject() {
  const actor = await loadActor();
  const companyId = uuidArg("company");
  const contactId = uuidArg("contact");
  const src = must(await admin.from("submissions").select("project_name, vms").eq("id", sourceId).maybeSingle(), "read the source calc") as { project_name: string | null; vms: string | null } | null;
  if (!src?.project_name) throw new Error("The source calc has no project name.");
  const company = must(await admin.from("companies").select("id, name, active").eq("id", companyId).maybeSingle(), "read company") as { name: string; active: boolean } | null;
  const contact = must(await admin.from("contacts").select("name, company_id, active").eq("id", contactId).maybeSingle(), "read contact") as { name: string; company_id: string; active: boolean } | null;
  if (!company?.active) throw new Error("The company does not exist or is inactive.");
  if (!contact?.active || contact.company_id !== companyId) throw new Error("The contact does not exist, is inactive, or is not at that company.");
  const dup = must(await admin.from("projects").select("id").eq("company_id", companyId).eq("name", src.project_name), "check for the project") as { id: string }[];
  if (dup.length > 0) return console.log(`Project "${src.project_name}" already exists for this company: ${dup[0].id}. Nothing to do.`);
  const row = { company_id: companyId, primary_contact_id: contactId, name: src.project_name, vms: src.vms, created_by: actor.id };
  console.log(`Will insert projects ${JSON.stringify(row)}\n  company "${company.name}", contact "${contact.name}"`);
  if (!apply) return console.log("Dry run: nothing written. Add --apply.");
  if (!(await confirm("Insert the project above?"))) return console.log("Nothing written.");
  const created = must(await admin.from("projects").insert(row).select("id").single(), "insert the project") as { id: string };
  console.log(`Project ${created.id} created. Next: save-calc --project=${created.id}`);
}

// ---------------------------------------------------------------------------
// save-calc
// ---------------------------------------------------------------------------

async function signIn(actor: Actor): Promise<SupabaseClient> {
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: actor.email });
  if (error || !link?.properties?.hashed_token) throw new Error(`one-time sign-in token: ${error?.message ?? "none returned"}`);
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error: verifyError } = await client.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (verifyError || data.user?.id !== actor.id) {
    if (data?.session) await client.auth.signOut({ scope: "local" });
    throw new Error(`sign-in as ${actor.email} failed: ${verifyError?.message ?? "wrong user"}`);
  }
  return client;
}

async function signOut() {
  if (!sessionClient) return;
  const client = sessionClient;
  sessionClient = null;
  const { error } = await client.auth.signOut({ scope: "local" });
  console.log(error ? `Sign-out of the script session FAILED: ${error.message}. Revoke it in Supabase Auth.` : "Script session signed out (this session only).");
}

async function saveCalc() {
  const actor = await loadActor();
  const projectId = uuidArg("project");
  // Explicit on purpose: {} quotes recorders only (no failover, management,
  // GPU, SFP+ or workstations).
  if (!arg("design")) throw new Error(`save-calc needs --design='<json>' (for example '{}' for recorders only, or '{"failover":{"enabled":true}}').`);
  const design = JSON.parse(arg("design") as string) as Record<string, unknown>;
  const project = must(await admin.from("projects").select("id, name").eq("id", projectId).maybeSingle(), "read project") as { name: string } | null;
  if (!project) throw new Error(`No project ${projectId}.`);
  const src = must(await admin.from("submissions").select("input_state, groups_payload").eq("id", sourceId).maybeSingle(), "read the source calc");
  if (!src) throw new Error(`No submission ${sourceId}.`);
  const state = fromStoredSubmission(src as { input_state?: unknown; groups_payload?: unknown });
  const payload = phaseB.buildProjectCalcPayload(state, projectId, design);
  const groups = payload.groups as { cameras: number }[];

  const existing = await projectCalcs(projectId);
  for (const c of existing) console.log(`Existing calc in this project: ${c.id} saved ${c.created_at} emailed ${c.email_sent_at ?? "no"} deal ${c.pipedrive_deal_id ?? "none"}`);
  if (existing.length > 0 && arg("again") === undefined) {
    return console.log("Refused: the project already has a calc (above). Use it, or pass --again to save another (and email sales again).");
  }

  const { loadProjectForCalc } = await import("../src/lib/projects/calc-save");
  const loaded = await loadProjectForCalc(admin, projectId);
  const grantee = loaded.status === "ok" ? loaded.project.visibleToPartnerId : null;
  console.log(
    `Will save a fresh project calc as ${actor.email} in project "${project.name}": "${payload.projectName}", ${groups.length} groups, ${groups.reduce((n, g) => n + g.cameras, 0)} cameras, retention ${state.retentionDays}, systemDesign ${JSON.stringify(design)}.`,
  );
  console.log(`The legacy add-ons (failover=${state.addOnFailoverRecorder}, management=${state.addOnManagementServer}) are NOT carried; --design decides the system design. The BOM is printed after the save.`);
  console.log(grantee ? `VISIBILITY: partner login ${grantee} (the primary contact's) will see this calc in the portal.` : "Visibility: no partner login will see this calc (Arxys only).");
  console.log("Writes: one submissions row, its project_submissions link, its banked design, the email stamp, and the visibility grant if any. Renders the PDF and EMAILS sales (INTERNAL_NOTIFICATION_EMAIL). Signs in as Andy once (Supabase records the login). No Pipedrive call.");
  if (!apply) return console.log("Dry run: nothing written, no sign-in. Add --apply.");
  if (!(await confirm("Save the calc above and email sales?"))) return console.log("Nothing written.");

  const before = new Set(existing.map((c) => c.id));
  sessionClient = await signIn(actor);
  try {
    const { submitCalculation } = (await import("../src/app/(app)/calculator/actions")) as unknown as {
      submitCalculation: (prev: { status: "idle" }, payload: unknown) => Promise<Record<string, unknown>>;
    };
    const result = await submitCalculation({ status: "idle" }, payload);
    if (result.status !== "ok") {
      console.log("Refused:", JSON.stringify(result, null, 2));
      process.exitCode = 1;
      return;
    }
    const proj = result.project as { projectId?: string; bom?: unknown; failover?: unknown } | undefined;
    if (proj?.projectId !== projectId) {
      console.log(`PROBLEM: calc ${result.submissionId} was saved but NOT as a project calc in ${projectId}. Check Pipedrive and the sales email; this should not happen for an internal rep.`);
      process.exitCode = 1;
      return;
    }
    const rec = result.recommendation as { winner?: unknown; warnings?: string[] };
    console.log(`Saved project calc ${result.submissionId}.`);
    console.log("Primary:", JSON.stringify(rec.winner));
    console.log("Failover:", JSON.stringify(proj.failover));
    console.log("BOM:", JSON.stringify(proj.bom, null, 2));
    console.log("Warnings:", rec.warnings ?? []);
    console.log(`Next: preview --calc=${result.submissionId}`);
  } catch (err) {
    console.error(`The save threw: ${err instanceof Error ? err.message : err}`);
    const recent = (await projectCalcs(projectId)).filter((c) => !before.has(c.id));
    console.log(recent.length ? `Rows created during this run: ${recent.map((c) => `${c.id} (emailed ${c.email_sent_at ?? "no"})`).join(", ")}` : "No calc row was created during this run.");
    process.exitCode = 1;
  } finally {
    await signOut();
  }
}

// ---------------------------------------------------------------------------
// preview, create-deal, retry-lines, verify
// ---------------------------------------------------------------------------

async function previewFor(actor: Actor, calcId: string) {
  const pd = await projectDeal();
  const r = await pd.previewDealLines(deps, calcId, actor.id);
  if (!r.ok) {
    console.log(`Refused (${r.reason}): ${r.message}`);
    for (const x of r.refusals ?? []) console.log(`  ${x.sku} (${x.role}): ${x.message}`);
    process.exitCode = 1;
    return null;
  }
  console.log("Lines (price is the Pipedrive product's USD price, verbatim):");
  for (const l of r.lines) console.log(`  ${l.sku.padEnd(20)} ${l.role.padEnd(12)} qty ${String(l.qty).padStart(4)}  product #${l.pipedriveProductId}  $${l.unitPrice}`);
  return r;
}

async function preview() {
  await previewFor(await loadActor(), uuidArg("calc"));
}

// The deal the portal will create: header pieces read the same way createProjectDeal reads them.
async function plannedHeader(actor: Actor, calcId: string) {
  const link = must(await admin.from("project_submissions").select("project_id").eq("submission_id", calcId).maybeSingle(), "read the calc's project") as { project_id: string } | null;
  if (!link) throw new Error("The calc is not in a project.");
  const project = must(await admin.from("projects").select("id, name, company_id, primary_contact_id").eq("id", link.project_id).maybeSingle(), "read the project") as { id: string; name: string; company_id: string; primary_contact_id: string | null };
  const company = must(await admin.from("companies").select("name, pipedrive_org_id").eq("id", project.company_id).maybeSingle(), "read the company") as { name: string; pipedrive_org_id: number };
  const contact = project.primary_contact_id
    ? (must(await admin.from("contacts").select("name, pipedrive_person_id").eq("id", project.primary_contact_id).maybeSingle(), "read the contact") as { name: string; pipedrive_person_id: number } | null)
    : null;
  const routing = await resolveProjectPipelineStage(env.PIPEDRIVE_API_TOKEN);
  if (!routing.ok) throw new Error(routing.message);
  const { matches } = await dealFields();
  if (matches.length !== 1 || !matches[0].code) throw new Error(`"${PROJECT_ID_FIELD_NAME}" must exist exactly once (found ${matches.length}).`);
  return {
    projectId: project.id,
    projectName: project.name,
    companyName: company.name,
    contactName: contact?.name ?? null,
    want: {
      pipelineId: routing.pipelineId,
      stageId: routing.stageId,
      orgId: Number(company.pipedrive_org_id),
      personId: Number(contact?.pipedrive_person_id),
      ownerId: actor.pipedriveUserId,
      fieldCode: matches[0].code,
      projectId: project.id,
    },
  };
}

// Other deals that look like the same job: the legacy source calc's, and any
// submission with the same job name that has a deal.
async function sameJobDeals(projectName: string) {
  const rows = must(
    await admin.from("submissions").select("id, pipedrive_deal_id, project_name").ilike("project_name", projectName).not("pipedrive_deal_id", "is", null),
    "look for other deals for this job",
  ) as { id: string; pipedrive_deal_id: number }[];
  return rows;
}

async function createDeal() {
  const actor = await loadActor();
  if (!actor.pipedriveUserId) throw new Error("Andy's partners row has no pipedrive_user_id; the deal owner would fall back. Fix the row first.");
  const calcId = uuidArg("calc");
  const header = await plannedHeader(actor, calcId);
  const r = await previewFor(actor, calcId);
  if (!r) return;
  const calc = must(await admin.from("submissions").select("project_name, created_at").eq("id", calcId).maybeSingle(), "read the calc") as { project_name: string | null; created_at: string };
  const others = await sameJobDeals(calc.project_name ?? header.projectName);
  console.log(`\nWill create ONE Pipedrive deal:`);
  console.log(`  title    Arxys Quote - ${header.companyName} - ${calc.project_name ?? header.projectName} - ${calc.created_at.slice(0, 10)}`);
  console.log(`  org #${header.want.orgId} (${header.companyName}), person #${header.want.personId} (${header.contactName}), owner #${header.want.ownerId}`);
  console.log(`  pipeline #${header.want.pipelineId} "${PROJECT_PIPELINE_NAME}", stage #${header.want.stageId} "${PROJECT_STAGE_NAME}", currency USD, no value`);
  console.log(`  ${PROJECT_ID_FIELD_NAME} (${header.want.fieldCode}) = ${header.projectId}`);
  console.log(`then add the ${r.lines.length} lines above, one at a time. Supabase: the claim, the calc's deal link, ${r.lines.length} ledger rows.`);
  if (others.length > 0) {
    console.log(`WARNING: other submissions for "${calc.project_name}" already have deals: ${others.map((o) => `#${o.pipedrive_deal_id} (calc ${o.id})`).join(", ")}. This adds another deal for the same job.`);
  }
  if (!apply) return console.log("Dry run: nothing written. Add --apply.");
  if (!(await confirm("The deal and lines above are right; create the deal?"))) return console.log("Nothing written.");
  const pd = await projectDeal();
  const run = await pd.createProjectDeal(deps, calcId, r.fingerprint, actor.id);
  if (!run.ok) {
    console.log(`Refused (${run.reason}): ${run.message}${run.dealId ? ` [deal #${run.dealId}]` : ""}`);
    process.exitCode = 1;
    return;
  }
  printRun(run);
  await verifyDeal(actor, run.dealId);
}

function printRun(run: { dealId: number; lines: { sku: string; role: string; status: string; error?: string | null }[]; warnings: string[]; diff: unknown }) {
  console.log(`Deal #${run.dealId}. Lines:`);
  for (const l of run.lines) console.log(`  ${l.sku} (${l.role}): ${l.status}${l.error ? ` (${l.error})` : ""}`);
  for (const w of run.warnings) console.log(`  warning: ${w}`);
  console.log("Diff:", JSON.stringify(run.diff));
}

async function retryLines() {
  const actor = await loadActor();
  const dealId = dealIdArg();
  const rows = must(await admin.from("deal_line_syncs").select("sku, role, qty, status, error, updated_at").eq("pipedrive_deal_id", dealId).order("sku"), "read the ledger") as { sku: string; role: string; qty: number; status: string; error: string | null; updated_at: string }[];
  if (rows.length === 0) console.log("The ledger has no rows for this deal (a retry seeds them if the products still match what was confirmed).");
  for (const r of rows) console.log(`  ledger ${r.sku} (${r.role}) qty ${r.qty}: ${r.status}${r.error ? ` (${r.error})` : ""} updated ${r.updated_at}`);
  const lines = await listDealProductsV2(env.PIPEDRIVE_API_TOKEN, dealId);
  for (const l of lines) console.log(`  on deal: line #${l.id} product #${l.product_id} qty ${l.quantity} "${l.comments ?? ""}"`);
  console.log("Will run retryMissingLines: it claims the open rows, reads the deal, records any line already there, and posts only the rest.");
  if (!apply) return console.log("Dry run: nothing written. Add --apply.");
  if (!(await confirm("Retry the missing lines?"))) return console.log("Nothing written.");
  const pd = await projectDeal();
  const run = await pd.retryMissingLines(deps, dealId, actor.id);
  if (!run.ok) {
    console.log(`Refused (${run.reason}): ${run.message}`);
    process.exitCode = 1;
    return;
  }
  printRun(run);
  await verifyDeal(actor, dealId);
}

async function verifyDeal(actor: Actor, dealId: number) {
  section(`Verify deal #${dealId}`);
  const claim = must(await admin.from("project_deal_claims").select("project_id, submission_id").eq("pipedrive_deal_id", dealId).maybeSingle(), "read the claim") as { project_id: string; submission_id: string } | null;
  if (!claim) throw new Error(`Deal #${dealId} has no portal claim.`);
  const failures: string[] = [];

  const pd = await projectDeal();
  const diff = await pd.diffDealLines(deps, dealId, claim.submission_id, actor.id);
  if (diff.ok) console.log(`Diff against calc ${claim.submission_id}: ${diff.diff.clean ? "clean" : "NOT CLEAN"} ${JSON.stringify(diff.diff)}`);
  else console.log(`Diff refused (${diff.reason}): ${diff.message}`);
  if (!(diff.ok && diff.diff.clean)) failures.push("diff");

  let header: Awaited<ReturnType<typeof plannedHeader>> | null = null;
  try {
    header = await plannedHeader(actor, claim.submission_id);
  } catch (err) {
    console.log(`Header: could not work out the expected header (${err instanceof Error ? err.message : err}).`);
  }
  const deal = await pdGet<DealHeader & { title?: string; value?: number }>(`/deals/${dealId}`);
  if (deal.status !== 200) console.log(`GET deal: HTTP ${deal.status}`);
  const headerProblems = header
    ? phaseB.checkDealHeader(deal.status === 200 ? deal.data : null, header.want)
    : ["expected header unknown"];
  console.log(headerProblems.length === 0 ? `Header: "${deal.data?.title}" is in the right pipeline, stage, org, person, owner, USD, with the project id.` : `Header: ${headerProblems.join("; ")}`);
  if (headerProblems.length) failures.push("header");

  const [lines, products] = await Promise.all([listDealProductsV2(env.PIPEDRIVE_API_TOKEN, dealId), listPipedriveProducts(env.PIPEDRIVE_API_TOKEN)]);
  for (const l of lines) console.log(`  line #${l.id} product #${l.product_id} qty ${l.quantity} item_price ${l.item_price} sum ${l.sum} comments "${l.comments ?? ""}"`);
  const roles = lines.filter((l) => /arxys role:/i.test(l.comments ?? "")).length;
  console.log(`Comments carrying the role: ${roles} of ${lines.length}.`);
  if (roles !== lines.length) failures.push("comments");

  const ledger = must(await admin.from("deal_line_syncs").select("sku, role, status, pipedrive_deal_product_id, item_price_sent").eq("pipedrive_deal_id", dealId), "read the ledger") as LedgerRowForCheck[];
  const ledgerProblems = phaseB.checkLedger(ledger, lines);
  console.log(ledgerProblems.length === 0 ? `Ledger: ${ledger.length} rows, all added, each on the deal at the price it sent.` : `Ledger: ${ledgerProblems.join("; ")}`);
  if (ledgerProblems.length) failures.push("ledger");

  const priceProblems = phaseB.checkLinePrices(lines, products);
  console.log(priceProblems.length === 0 ? "Prices: every line equals its product's current USD price." : `Prices against the CURRENT product price: ${JSON.stringify(priceProblems)} (a price changed since sending shows here, and the ledger check above shows what was sent).`);
  if (priceProblems.length) failures.push("prices");

  const value = phaseB.checkDealValue(deal.data?.value, lines);
  console.log(`Deal value ${value.dealValue}, Pipedrive line sums ${value.linesSum}: ${value.ok ? "equal" : "NOT EQUAL"}`);
  if (!value.ok) failures.push("value");

  const sub = must(await admin.from("submissions").select("pipedrive_deal_id").eq("id", claim.submission_id).maybeSingle(), "read the calc") as { pipedrive_deal_id: number | null };
  console.log(sub.pipedrive_deal_id === dealId ? "The calc is linked to the deal." : `The calc's deal link is ${sub.pipedrive_deal_id} (expected ${dealId}).`);
  if (sub.pipedrive_deal_id !== dealId) failures.push("calc link");

  // What resolve-project-deal-claim.mts relies on (informational).
  const search = await pdGet<{ items?: { item?: { id?: number } }[] }>(`/deals/search?term=${encodeURIComponent(claim.project_id)}&fields=custom_fields&exact_match=true`);
  const searchIds = (search.data?.items ?? []).map((i) => i.item?.id);
  console.log(`Deal search for the project id: HTTP ${search.status}, ${searchIds.includes(dealId) ? "finds this deal" : `does NOT find this deal yet (${JSON.stringify(searchIds)})`}.`);
  if (header) {
    const want = header.want;
    const orgDeals = await listAllV2<{ id: number; custom_fields?: Record<string, unknown> | null }>(env.PIPEDRIVE_API_TOKEN, "/deals", { org_id: String(want.orgId) });
    const mine = orgDeals.find((d) => d.id === dealId);
    console.log(`Org deal list: ${mine ? (mine.custom_fields?.[want.fieldCode] === claim.project_id ? "shows the project id on this deal" : `has this deal but custom_fields ${mine.custom_fields ? "lack the project id" : "missing"}`) : "does not include this deal"}.`);
  }

  console.log(failures.length === 0 ? "\nVERIFY PASSED." : `\nVERIFY FAILED: ${failures.join(", ")}.`);
  if (failures.length) process.exitCode = 1;
}

async function verify() {
  await verifyDeal(await loadActor(), dealIdArg());
}

async function selfTest() {
  // The action's own import graph gets the mocked server client: the account
  // gate inside it fails with the script's message when no one is signed in.
  const viewer = (await import("../src/lib/auth/viewer")) as { requireActive: () => Promise<unknown> };
  await assert.rejects(viewer.requireActive(), /No rep session/);
  const actions = (await import("../src/app/(app)/calculator/actions")) as { submitCalculation?: unknown };
  assert.equal(typeof actions.submitCalculation, "function");
  const pd = await projectDeal();
  assert.equal(pd.projectDealsEnabled(), true);
  console.log("Self-test: the action loads, its account gate uses the script's client, the flag is on in this process only.");
}

const steps: Record<string, () => Promise<unknown>> = {
  check,
  "create-field": createField,
  "create-project": createProject,
  "save-calc": saveCalc,
  preview,
  "create-deal": createDeal,
  "retry-lines": retryLines,
  verify,
};

// A Ctrl-C during save-calc still signs the script session out.
process.on("SIGINT", () => {
  if (step === "save-calc" && sessionClient) {
    console.log("\nStopped during the save. Run save-calc without --apply to list the project's calcs before anything else.");
  }
  void signOut().finally(() => process.exit(130));
});

try {
  if (arg("as") !== undefined) throw new Error("--as is not supported: the script acts as Andy only (ADR 0172).");
  if (arg("self-test") !== undefined) await selfTest();
  else if (!steps[step]) throw new Error(`Unknown step "${step}". Steps: ${Object.keys(steps).join(", ")}.`);
  else await steps[step]();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await signOut();
}
