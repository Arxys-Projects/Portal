// Pure planning for the company sync and its mapping report (Project Portal
// brief Step 2; ADRs 0153, 0156). No I/O: the script reads Pipedrive and the
// database, calls these, prints the result, and writes only on --execute.

import type { PdV2Organization, PdV2Person, PdV2ContactValue } from "../pipedrive/company-api";

// ---------------------------------------------------------------------------
// Which orgs are companies
// ---------------------------------------------------------------------------

export type CompanyVia = "label" | "include_list";
export type SelectedOrg = { orgId: number; name: string; via: CompanyVia };

// An org is a company when it carries the partner label or its id is on the
// portal-side include list (ADR 0156). The label wins when both apply.
export function selectCompanyOrgs(
  orgs: PdV2Organization[],
  labelId: number,
  includeIds: Iterable<number>,
): { selected: SelectedOrg[]; includesNotFound: number[] } {
  const include = new Set(includeIds);
  const seen = new Set<number>();
  const selected: SelectedOrg[] = [];
  for (const o of orgs) {
    const labeled = (o.label_ids ?? []).includes(labelId);
    if (!labeled && !include.has(o.id)) continue;
    seen.add(o.id);
    selected.push({ orgId: o.id, name: o.name.trim(), via: labeled ? "label" : "include_list" });
  }
  const includesNotFound = [...include].filter((id) => !seen.has(id)).sort((a, b) => a - b);
  return { selected: selected.sort((a, b) => a.name.localeCompare(b.name)), includesNotFound };
}

// ---------------------------------------------------------------------------
// Persons → contacts
// ---------------------------------------------------------------------------

export type ContactRow = {
  pipedrivePersonId: number;
  orgId: number;
  name: string;
  email: string | null;
  phone: string | null;
};

function primaryValue(list: PdV2ContactValue[] | null | undefined): string | null {
  const values = (list ?? []).filter((v) => v.value && v.value.trim());
  const pick = values.find((v) => v.primary) ?? values[0];
  return pick ? pick.value.trim() : null;
}

export function toContactRow(p: PdV2Person, orgId: number): ContactRow {
  const email = primaryValue(p.emails ?? p.email);
  return {
    pipedrivePersonId: p.id,
    orgId,
    name: (p.name ?? "").trim() || `Person ${p.id}`,
    email: email ? email.toLowerCase() : null,
    phone: primaryValue(p.phones ?? p.phone),
  };
}

// ---------------------------------------------------------------------------
// Diff against what the portal already has (for the report and --execute)
// ---------------------------------------------------------------------------

export type ExistingCompany = { id: string; pipedriveOrgId: number; name: string; active: boolean };
export type CompanyPlan = {
  insert: SelectedOrg[];
  rename: { orgId: number; from: string; to: string }[];
  reactivate: number[];
  deactivate: ExistingCompany[];
  unchanged: number;
};

export function planCompanies(selected: SelectedOrg[], existing: ExistingCompany[]): CompanyPlan {
  const byOrg = new Map(existing.map((c) => [c.pipedriveOrgId, c]));
  const keep = new Set(selected.map((s) => s.orgId));
  const plan: CompanyPlan = { insert: [], rename: [], reactivate: [], deactivate: [], unchanged: 0 };
  for (const s of selected) {
    const cur = byOrg.get(s.orgId);
    if (!cur) { plan.insert.push(s); continue; }
    let changed = false;
    if (cur.name !== s.name) { plan.rename.push({ orgId: s.orgId, from: cur.name, to: s.name }); changed = true; }
    if (!cur.active) { plan.reactivate.push(s.orgId); changed = true; }
    if (!changed) plan.unchanged++;
  }
  plan.deactivate = existing.filter((c) => c.active && !keep.has(c.pipedriveOrgId));
  return plan;
}

// ---------------------------------------------------------------------------
// Name matching for the mapping report
// ---------------------------------------------------------------------------

const LEGAL_SUFFIXES = new Set(["inc", "incorporated", "llc", "ltd", "limited", "corp", "corporation", "co", "company", "lp", "llp", "pllc"]);

// Lowercase, "&" → "and", punctuation to spaces, collapse spaces, and drop
// trailing legal suffixes ("Digital Provisions, Inc." → "digital provisions").
export function normalizeCompanyName(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  while (words.length > 1 && LEGAL_SUFFIXES.has(words[words.length - 1])) words.pop();
  return words.join(" ");
}

const exactKey = (s: string) => s.trim().toLowerCase();

// Portal test accounts the report skips (brief Step 2). "RLS Hijack Co" is the
// name scripts/test-rls.ts case 23d tries to set; a persona left behind by an
// interrupted run can carry it.
export const TEST_ACCOUNT_NAMES = ["RLS Test Co A", "RLS Hijack Co", "Gate Test Co plain", "Gate Test Co suspended", "Big Corp", "Evil Corp"];
export const TEST_EMAIL_DOMAIN = "@arxys-rls-test.invalid";

export function isTestAccountName(name: string): boolean {
  const n = normalizeCompanyName(name);
  return n.startsWith("rls test co") || TEST_ACCOUNT_NAMES.some((t) => normalizeCompanyName(t) === n);
}

export type PortalName = {
  name: string;
  source: "partner_company_name" | "on_behalf_company_name";
  count: number;
};
export type CompanyRef = { orgId: number; name: string };
export type AliasRef = { alias: string; orgId: number };

export type NameProposal = {
  name: string;
  source: PortalName["source"];
  count: number;
  match: "exact" | "normalized" | "alias" | "none" | "ambiguous";
  orgId: number | null;
  companyName: string | null;
  candidates?: CompanyRef[];
  note?: string;
};

export function proposeNameMapping(
  names: PortalName[],
  companies: CompanyRef[],
  aliases: AliasRef[],
): { proposals: NameProposal[]; skipped: PortalName[] } {
  const byExact = new Map<string, CompanyRef[]>();
  const byNorm = new Map<string, CompanyRef[]>();
  const push = (m: Map<string, CompanyRef[]>, k: string, c: CompanyRef) => m.set(k, [...(m.get(k) ?? []), c]);
  for (const c of companies) {
    push(byExact, exactKey(c.name), c);
    push(byNorm, normalizeCompanyName(c.name), c);
  }
  const companyByOrg = new Map(companies.map((c) => [c.orgId, c]));
  const aliasByKey = new Map(aliases.map((a) => [exactKey(a.alias), a]));

  const proposals: NameProposal[] = [];
  const skipped: PortalName[] = [];
  for (const n of names) {
    if (!n.name.trim()) continue;
    if (isTestAccountName(n.name)) { skipped.push(n); continue; }
    const base = { name: n.name, source: n.source, count: n.count };
    const note = exactKey(n.name) === "arxys" ? "Non-internal partner row named \"Arxys\": check it" : undefined;
    const exact = byExact.get(exactKey(n.name)) ?? [];
    const norm = byNorm.get(normalizeCompanyName(n.name)) ?? [];
    const alias = aliasByKey.get(exactKey(n.name));
    // An approved alias outranks the normalized guess, but not an exact name.
    if (exact.length === 1) {
      proposals.push({ ...base, match: "exact", orgId: exact[0].orgId, companyName: exact[0].name, note });
    } else if (alias && companyByOrg.has(alias.orgId)) {
      const c = companyByOrg.get(alias.orgId)!;
      proposals.push({ ...base, match: "alias", orgId: c.orgId, companyName: c.name, note });
    } else if (exact.length > 1 || norm.length > 1) {
      proposals.push({ ...base, match: "ambiguous", orgId: null, companyName: null, candidates: exact.length > 1 ? exact : norm, note });
    } else if (norm.length === 1) {
      proposals.push({ ...base, match: "normalized", orgId: norm[0].orgId, companyName: norm[0].name, note });
    } else {
      proposals.push({ ...base, match: "none", orgId: null, companyName: null, note });
    }
  }
  proposals.sort((a, b) => a.match.localeCompare(b.match) || a.name.localeCompare(b.name));
  return { proposals, skipped };
}

// Unlabeled orgs named exactly like a portal string. Existing deals hang off
// them (Step 0 item 6), so each is an alias candidate for the company that
// portal string maps to.
export function findUnlabeledNameTwins(
  orgs: PdV2Organization[],
  selectedOrgIds: Set<number>,
  proposals: NameProposal[],
): { orgId: number; orgName: string; portalName: string; proposedOrgId: number | null; proposedCompany: string | null }[] {
  const byKey = new Map(proposals.map((p) => [exactKey(p.name), p]));
  const out = [];
  for (const o of orgs) {
    if (selectedOrgIds.has(o.id)) continue;
    const p = byKey.get(exactKey(o.name));
    if (!p) continue;
    out.push({ orgId: o.id, orgName: o.name, portalName: p.name, proposedOrgId: p.orgId, proposedCompany: p.companyName });
  }
  return out.sort((a, b) => a.orgName.localeCompare(b.orgName) || a.orgId - b.orgId);
}

// ---------------------------------------------------------------------------
// Login → contact links (proposed by email)
// ---------------------------------------------------------------------------

export type PortalLogin = {
  partnerId: string;
  email: string | null;
  companyName: string;
  contactName: string;
  status: string;
};

export type LinkProposal = {
  partnerId: string;
  email: string | null;
  companyName: string;
  status: string;
  result: "match" | "company_mismatch" | "ambiguous" | "no_contact" | "no_email";
  pipedrivePersonId: number | null;
  contactOrgId: number | null;
  contactCompany: string | null;
};

export function proposeLoginLinks(
  logins: PortalLogin[],
  contacts: ContactRow[],
  companyNameByOrg: Map<number, string>,
  proposals: NameProposal[],
): LinkProposal[] {
  const byEmail = new Map<string, ContactRow[]>();
  for (const c of contacts) if (c.email) byEmail.set(c.email, [...(byEmail.get(c.email) ?? []), c]);
  const orgForPartnerName = new Map(
    proposals.filter((p) => p.source === "partner_company_name").map((p) => [exactKey(p.name), p.orgId]),
  );
  const out: LinkProposal[] = [];
  for (const l of logins) {
    if (isTestAccountName(l.companyName) || l.email?.toLowerCase().endsWith(TEST_EMAIL_DOMAIN)) continue;
    const base = { partnerId: l.partnerId, email: l.email, companyName: l.companyName, status: l.status };
    if (!l.email) { out.push({ ...base, result: "no_email", pipedrivePersonId: null, contactOrgId: null, contactCompany: null }); continue; }
    const hits = byEmail.get(l.email.trim().toLowerCase()) ?? [];
    if (hits.length === 0) { out.push({ ...base, result: "no_contact", pipedrivePersonId: null, contactOrgId: null, contactCompany: null }); continue; }
    if (hits.length > 1) { out.push({ ...base, result: "ambiguous", pipedrivePersonId: null, contactOrgId: null, contactCompany: null }); continue; }
    const c = hits[0];
    const expected = orgForPartnerName.get(exactKey(l.companyName)) ?? null;
    out.push({
      ...base,
      result: expected === null || expected === c.orgId ? "match" : "company_mismatch",
      pipedrivePersonId: c.pipedrivePersonId,
      contactOrgId: c.orgId,
      contactCompany: companyNameByOrg.get(c.orgId) ?? null,
    });
  }
  return out.sort((a, b) => a.result.localeCompare(b.result) || a.companyName.localeCompare(b.companyName));
}
