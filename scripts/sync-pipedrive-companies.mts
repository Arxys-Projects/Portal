// Company and contact sync from Pipedrive, plus the mapping report (Project
// Portal brief Step 2; ADRs 0153, 0156). NEVER writes to Pipedrive: every
// Pipedrive call is a GET (src/lib/pipedrive/company-api.ts).
//
// A company is a Pipedrive org that carries the "Arxys Security Partner" label
// OR whose id is in company_sync_includes. Contacts are the persons under those
// orgs. Both are keyed by Pipedrive id, never by name.
//
// Run:
//   Dry run (default; reads only, writes nothing to the database):
//     node --env-file=.env.local --import tsx scripts/sync-pipedrive-companies.mts
//   Upsert companies and contacts (typed CONFIRM):
//     node --env-file=.env.local --import tsx scripts/sync-pipedrive-companies.mts --execute
//   Write the approved aliases and login links (typed CONFIRM; needs --execute
//   to have run first, so the companies and contacts exist):
//     node --env-file=.env.local --import tsx scripts/sync-pipedrive-companies.mts --apply-mapping=backups/company-mapping-....json
//
// Every run writes the proposed mapping to backups/company-mapping-<stamp>.json
// (gitignored: it holds emails). Andy reviews it, deletes any entry he does not
// approve, and passes the edited file to --apply-mapping. Nothing else writes
// company_name_aliases or partner_contact_links.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { env } from "../src/lib/env";
import {
  listAllOrganizations,
  listPersonsForOrg,
  resolveOrgLabelId,
} from "../src/lib/pipedrive/company-api";
import {
  findUnlabeledNameTwins,
  planCompanies,
  proposeLoginLinks,
  proposeNameMapping,
  selectCompanyOrgs,
  toContactRow,
  type ContactRow,
  type PortalLogin,
  type PortalName,
} from "../src/lib/companies/sync";

const PARTNER_LABEL = "Arxys Security Partner";

type MappingFile = {
  generatedAt: string;
  aliases: { alias: string; orgId: number; source: "partner_company_name" | "on_behalf_company_name" | "pipedrive_org"; pipedriveOrgId?: number; company: string | null }[];
  links: { partnerId: string; email: string | null; pipedrivePersonId: number; company: string | null }[];
};

async function promptConfirm(question: string): Promise<boolean> {
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

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

async function readPortal(admin: SupabaseClient) {
  const companies = must(await admin.from("companies").select("id, pipedrive_org_id, name, active"), "read companies") as
    { id: string; pipedrive_org_id: number; name: string; active: boolean }[];
  const contacts = must(await admin.from("contacts").select("id, pipedrive_person_id, active"), "read contacts") as
    { id: string; pipedrive_person_id: number; active: boolean }[];
  const aliases = must(await admin.from("company_name_aliases").select("alias, companies(pipedrive_org_id)"), "read aliases") as
    unknown as { alias: string; companies: { pipedrive_org_id: number } | null }[];
  const includes = must(await admin.from("company_sync_includes").select("pipedrive_org_id"), "read includes") as
    { pipedrive_org_id: number }[];
  const partners = must(
    await admin.from("partners").select("id, company_name, contact_name, status, role, is_internal"),
    "read partners",
  ) as { id: string; company_name: string; contact_name: string; status: string; role: string; is_internal: boolean }[];
  const onBehalf = must(
    await admin.from("submissions").select("on_behalf_of_company_name").not("on_behalf_of_company_name", "is", null),
    "read on-behalf names",
  ) as { on_behalf_of_company_name: string }[];

  // Login emails live in auth.users.
  const emailById = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`list auth users: ${error.message}`);
    for (const u of data.users) if (u.email) emailById.set(u.id, u.email.toLowerCase());
    if (data.users.length < 1000) break;
  }
  return { companies, contacts, aliases, includes, partners, onBehalf, emailById };
}

function countNames(values: string[], source: PortalName["source"]): PortalName[] {
  const m = new Map<string, { name: string; count: number }>();
  for (const v of values) {
    const name = v.trim();
    if (!name) continue;
    const k = name.toLowerCase();
    const cur = m.get(k);
    if (cur) cur.count++; else m.set(k, { name, count: 1 });
  }
  return [...m.values()].map((x) => ({ ...x, source }));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  const execute = argv.includes("--execute");
  const applyArg = argv.find((a) => a.startsWith("--apply-mapping="));
  if (execute && applyArg) throw new Error("Run --execute and --apply-mapping separately.");

  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (applyArg) return applyMapping(admin, applyArg.slice("--apply-mapping=".length));

  const token = env.PIPEDRIVE_API_TOKEN;
  console.log(execute ? "Mode: EXECUTE (companies + contacts, after CONFIRM)" : "Mode: dry run (no writes)");

  // Pipedrive (GET only)
  const labelId = await resolveOrgLabelId(token, PARTNER_LABEL);
  const orgs = await listAllOrganizations(token);
  const portal = await readPortal(admin);
  const { selected, includesNotFound } = selectCompanyOrgs(orgs, labelId, portal.includes.map((i) => i.pipedrive_org_id));
  // Keyed by person id: one upsert batch must not carry the same key twice.
  const byPerson = new Map<number, ContactRow>();
  for (const s of selected) {
    for (const p of await listPersonsForOrg(token, s.orgId)) byPerson.set(p.id, toContactRow(p, s.orgId));
  }
  const contacts = [...byPerson.values()];

  // Plans
  const companyPlan = planCompanies(
    selected,
    portal.companies.map((c) => ({ id: c.id, pipedriveOrgId: c.pipedrive_org_id, name: c.name, active: c.active })),
  );
  const existingPersonIds = new Set(portal.contacts.map((c) => c.pipedrive_person_id));
  const seenPersonIds = new Set(contacts.map((c) => c.pipedrivePersonId));
  const newContacts = contacts.filter((c) => !existingPersonIds.has(c.pipedrivePersonId)).length;
  const contactsToDeactivate = portal.contacts.filter((c) => c.active && !seenPersonIds.has(c.pipedrive_person_id));

  const companyRefs = selected.map((s) => ({ orgId: s.orgId, name: s.name }));
  const companyNameByOrg = new Map(companyRefs.map((c) => [c.orgId, c.name]));
  const external = portal.partners.filter((p) => !p.is_internal && p.role === "partner");
  const names = [
    ...countNames(external.map((p) => p.company_name), "partner_company_name"),
    ...countNames(portal.onBehalf.map((r) => r.on_behalf_of_company_name), "on_behalf_company_name"),
  ];
  const aliasRefs = portal.aliases
    .filter((a) => a.companies)
    .map((a) => ({ alias: a.alias, orgId: a.companies!.pipedrive_org_id }));
  const { proposals, skipped } = proposeNameMapping(names, companyRefs, aliasRefs);
  const twins = findUnlabeledNameTwins(orgs, new Set(selected.map((s) => s.orgId)), proposals);
  const logins: PortalLogin[] = external.map((p) => ({
    partnerId: p.id,
    email: portal.emailById.get(p.id) ?? null,
    companyName: p.company_name,
    contactName: p.contact_name,
    status: p.status,
  }));
  const links = proposeLoginLinks(logins, contacts, companyNameByOrg, proposals);

  // Report
  const viaLabel = selected.filter((s) => s.via === "label").length;
  console.log(`\n== Companies ==\nLabel "${PARTNER_LABEL}" = option id ${labelId}. Scanned ${orgs.length} orgs.`);
  console.log(`${selected.length} companies: ${viaLabel} by label, ${selected.length - viaLabel} by include list.`);
  for (const s of selected.filter((x) => x.via === "include_list")) console.log(`  include list: ${s.name} (#${s.orgId})`);
  for (const id of includesNotFound) console.log(`  ! include-list org #${id} not found in Pipedrive`);
  console.log(`Plan: ${companyPlan.insert.length} new, ${companyPlan.rename.length} renamed, ${companyPlan.reactivate.length} reactivated, ${companyPlan.deactivate.length} deactivated, ${companyPlan.unchanged} unchanged.`);
  for (const r of companyPlan.rename) console.log(`  rename #${r.orgId}: "${r.from}" -> "${r.to}"`);
  for (const d of companyPlan.deactivate) console.log(`  deactivate #${d.pipedriveOrgId} ${d.name}`);
  const noPersons = selected.filter((s) => !contacts.some((c) => c.orgId === s.orgId));
  console.log(`\n== Contacts ==\n${contacts.length} persons (${contacts.filter((c) => c.email).length} with email): ${newContacts} new, ${contactsToDeactivate.length} to deactivate.`);
  if (noPersons.length) console.log(`Companies with no persons: ${noPersons.map((s) => s.name).join(", ")}`);

  const tally = (k: string) => proposals.filter((p) => p.match === k);
  console.log(`\n== Name mapping (${proposals.length} names; ${skipped.length} test accounts skipped) ==`);
  for (const k of ["exact", "alias", "normalized"]) console.log(`${k}: ${tally(k).length}`);
  for (const p of tally("normalized")) console.log(`  normalized: "${p.name}" [${p.source}, ${p.count}] -> ${p.companyName} (#${p.orgId})`);
  console.log(`\nExceptions (${tally("none").length + tally("ambiguous").length}):`);
  for (const p of tally("ambiguous")) console.log(`  ambiguous: "${p.name}" [${p.source}, ${p.count}] -> ${p.candidates?.map((c) => `${c.name} (#${c.orgId})`).join(" | ")}`);
  for (const p of tally("none")) console.log(`  no company: "${p.name}" [${p.source}, ${p.count}]`);
  for (const p of proposals.filter((x) => x.note)) console.log(`  ! ${p.note} [${p.source}, ${p.count}]`);
  console.log(`\nUnlabeled orgs named like a portal string (alias candidates, ${twins.length}):`);
  for (const t of twins) console.log(`  #${t.orgId} "${t.orgName}" -> ${t.proposedCompany ? `${t.proposedCompany} (#${t.proposedOrgId})` : "no company (exception)"}`);

  console.log(`\n== Login -> contact links (${links.length} non-internal logins) ==`);
  for (const k of ["match", "company_mismatch", "ambiguous", "no_contact", "no_email"]) {
    const rows = links.filter((l) => l.result === k);
    console.log(`${k}: ${rows.length}`);
    if (k !== "match") for (const l of rows) console.log(`  ${l.companyName} <${l.email ?? "no email"}> [${l.status}]${l.contactCompany ? ` -> contact at ${l.contactCompany}` : ""}`);
  }

  // Proposed mapping file
  // A twin and a normalized spelling can be the same string; the twin row wins
  // because it also carries the org id (alias text is unique ignoring case).
  const twinKeys = new Set(twins.filter((t) => t.proposedOrgId !== null).map((t) => t.orgName.trim().toLowerCase()));
  const mapping: MappingFile = {
    generatedAt: new Date().toISOString(),
    aliases: [
      ...proposals
        .filter((p) => p.match === "normalized" && p.orgId !== null && !twinKeys.has(p.name.trim().toLowerCase()))
        .map((p) => ({ alias: p.name, orgId: p.orgId!, source: p.source, company: p.companyName })),
      ...twins
        .filter((t) => t.proposedOrgId !== null)
        .map((t) => ({ alias: t.orgName, orgId: t.proposedOrgId!, source: "pipedrive_org" as const, pipedriveOrgId: t.orgId, company: t.proposedCompany })),
    ],
    links: links
      .filter((l) => l.result === "match")
      .map((l) => ({ partnerId: l.partnerId, email: l.email, pipedrivePersonId: l.pipedrivePersonId!, company: l.contactCompany })),
  };
  mkdirSync("backups", { recursive: true });
  const outPath = `backups/company-mapping-${mapping.generatedAt.replace(/[:.]/g, "-")}.json`;
  writeFileSync(outPath, JSON.stringify(mapping, null, 2));
  console.log(`\nProposed mapping (${mapping.aliases.length} aliases, ${mapping.links.length} links) written to ${outPath}.`);
  console.log("Review it, remove anything not approved, then run --apply-mapping=<file> after --execute.");

  if (!execute) return;
  if (!(await promptConfirm(`Upsert ${selected.length} companies and ${contacts.length} contacts, deactivate ${companyPlan.deactivate.length} companies and ${contactsToDeactivate.length} contacts?`))) {
    console.log("Cancelled. Nothing written.");
    return;
  }
  const now = new Date().toISOString();
  must(await admin.from("companies").upsert(
    selected.map((s) => ({ pipedrive_org_id: s.orgId, name: s.name, active: true, last_synced_at: now })),
    { onConflict: "pipedrive_org_id" },
  ), "upsert companies");
  if (companyPlan.deactivate.length) {
    must(await admin.from("companies").update({ active: false }).in("id", companyPlan.deactivate.map((d) => d.id)), "deactivate companies");
  }
  const ids = must(await admin.from("companies").select("id, pipedrive_org_id"), "re-read companies") as { id: string; pipedrive_org_id: number }[];
  const companyIdByOrg = new Map(ids.map((r) => [r.pipedrive_org_id, r.id]));
  for (let i = 0; i < contacts.length; i += 500) {
    must(await admin.from("contacts").upsert(
      contacts.slice(i, i + 500).map((c) => ({
        pipedrive_person_id: c.pipedrivePersonId,
        company_id: companyIdByOrg.get(c.orgId),
        name: c.name,
        email: c.email,
        phone: c.phone,
        active: true,
        last_synced_at: now,
      })),
      { onConflict: "pipedrive_person_id" },
    ), "upsert contacts");
  }
  if (contactsToDeactivate.length) {
    must(await admin.from("contacts").update({ active: false }).in("id", contactsToDeactivate.map((c) => c.id)), "deactivate contacts");
  }
  console.log("Done: companies and contacts written. Aliases and links are NOT written by --execute.");
}

// ---------------------------------------------------------------------------
// --apply-mapping: aliases and login links from the reviewed file
// ---------------------------------------------------------------------------

async function applyMapping(admin: SupabaseClient, path: string) {
  const mapping = JSON.parse(readFileSync(path, "utf8")) as MappingFile;
  const companies = must(await admin.from("companies").select("id, pipedrive_org_id"), "read companies") as { id: string; pipedrive_org_id: number }[];
  const contacts = must(await admin.from("contacts").select("id, pipedrive_person_id, company_id"), "read contacts") as { id: string; pipedrive_person_id: number; company_id: string }[];
  const companyByOrg = new Map(companies.map((c) => [c.pipedrive_org_id, c.id]));
  const contactByPerson = new Map(contacts.map((c) => [c.pipedrive_person_id, c]));

  const aliasRows = mapping.aliases.map((a) => ({ a, company_id: companyByOrg.get(a.orgId) }));
  const linkRows = mapping.links.map((l) => ({ l, contact: contactByPerson.get(l.pipedrivePersonId) }));
  const missing = [
    ...aliasRows.filter((r) => !r.company_id).map((r) => `alias "${r.a.alias}": company #${r.a.orgId} not synced`),
    ...linkRows.filter((r) => !r.contact).map((r) => `link ${r.l.email}: person #${r.l.pipedrivePersonId} not synced`),
  ];
  console.log(`From ${path}: ${aliasRows.length} aliases, ${linkRows.length} links.`);
  if (missing.length) {
    console.log("Stopping: run --execute first, or remove these entries:");
    for (const m of missing) console.log(`  ${m}`);
    process.exitCode = 1;
    return;
  }
  for (const r of aliasRows) console.log(`  alias "${r.a.alias}" -> ${r.a.company} (#${r.a.orgId})`);
  for (const r of linkRows) console.log(`  link <${r.l.email}> -> person #${r.l.pipedrivePersonId} at ${r.l.company}`);
  if (!(await promptConfirm("Write these aliases and links?"))) {
    console.log("Cancelled. Nothing written.");
    return;
  }
  // One by one: the alias uniqueness is an expression index (lower(btrim)),
  // which PostgREST upsert cannot target, so a duplicate is reported, not fatal.
  for (const r of aliasRows) {
    const { error } = await admin.from("company_name_aliases").insert({
      company_id: r.company_id,
      alias: r.a.alias,
      source: r.a.source,
      pipedrive_org_id: r.a.source === "pipedrive_org" ? r.a.pipedriveOrgId : null,
    });
    if (error) console.log(`  alias "${r.a.alias}": ${error.code === "23505" ? "already present" : error.message}`);
  }
  if (linkRows.length) {
    must(await admin.from("partner_contact_links").upsert(
      linkRows.map((r) => ({ partner_id: r.l.partnerId, contact_id: r.contact!.id, company_id: r.contact!.company_id })),
      { onConflict: "partner_id" },
    ), "upsert links");
  }
  console.log("Done: aliases and links written.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
