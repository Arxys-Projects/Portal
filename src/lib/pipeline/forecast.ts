// Pure pipeline-forecast helpers — no Supabase dependency, safe in both
// server and client bundles.
//
// ADR 0081 — the status model reduced to open / won / lost and Weighted
// Forecast was retired. Open Pipeline is now a straight (unweighted) sum of the
// list price across Open deals; a Won total is provided alongside it.

export type SubmissionRow = {
  id: string;
  partner_id: string;
  project_name: string | null;
  status: string | null;
  is_preferred: boolean;
  total_list_price_usd: number | null;
  pipedrive_deal_id: string | null;
  created_at: string;
  // Phase 7 Step 1 — on-behalf-of. When set, the submission rolls up to a
  // target partner rather than its creator (partner_id). on_behalf_of_partner_id
  // is the stable grouping key for a matched partner; on_behalf_of_company_name
  // is always populated for an on-behalf row and is the display label.
  on_behalf_of_partner_id?: string | null;
  on_behalf_of_company_name?: string | null;
  // ADR 0093 step 2 — revision lineage. Set to the source submission's id on
  // a calculator ?revise= submit; null for a fresh submission.
  parent_submission_id?: string | null;
};

export type PartnerRow = {
  id: string;
  company_name: string;
  // ADR 0099 — surfaced on the deal row so the grouped admin view can show WHO
  // filed a project once the boxes are companies rather than people. Optional:
  // the partner-facing callers pass [] and never render a contact.
  contact_name?: string | null;
};

export type Deal = {
  // ADR 0099 — the COMPANY bucket key (normalised company name), not a
  // partners.id. `partners` holds one row per person, so keying on the id gave
  // one box per contact — 14 identical "JCT Solutions" boxes with no way to
  // tell them apart and no company subtotal anywhere.
  company_key: string;
  company_name: string;
  // The contact on the representative submission. Display only — never a
  // grouping key. Null when the company was free-typed (no portal identity).
  contact_name: string | null;
  // Normalised (trimmed + lower-cased) project key for grouping.
  project_key: string;
  // Original display name from the representative submission.
  project_name: string | null;
  status: string | null;
  total_list_price_usd: number | null;
  pipedrive_deal_id: string | null;
  representative_id: string;
  representative_created_at: string;
  // All submission ids that collapsed into this deal (newest-first).
  all_submission_ids: string[];
};

// Resolve the COMPANY a submission rolls up to (ADR 0099; Phase 7 Step 1 for
// the on-behalf semantics). For a self-serve row the company is the creator's;
// for an on-behalf row it is the target's.
//
//   companyKey  — the bucket key: lower(trim(company name)) whenever a name can
//                 be resolved, else the partner id.
//   companyName — the display label for that bucket.
//
// Keying on the NAME rather than partners.id is the whole point: `partners`
// holds one row per person, so an id key split every multi-contact company into
// one box per contact (JCT Solutions had 14). Names are free-typed at signup, so
// this merges case/whitespace variants ("Intelli-Tec" / "Intelli-tec") but NOT
// suffix variants ("Digital Provisions" / "Digital Provisions Inc") — those need
// the partner records reconciled, and deliberately-distinct regional entities
// ("LONG Building Technologies, inc. - AK" vs "- ID") correctly stay apart.
//
// The id fallback matters: the partner-facing callers pass partners: [], so no
// name resolves and every row buckets by its own partner_id exactly as before.
// A single partner's own view must not change behaviour here.
//
// `contactPartnerId` is the partner row the CONTACT comes from, and it must
// belong to the same company as the bucket — otherwise a free-typed on-behalf
// row would be labelled with the internal rep who filed it, who works somewhere
// else entirely. Null when the bucket's company has no portal identity.
function effectiveCompany(
  s: SubmissionRow,
  partnerMap: Map<string, string>,
): { companyKey: string; companyName: string; contactPartnerId: string | null } {
  const fk = s.on_behalf_of_partner_id ?? null;
  const typed = (s.on_behalf_of_company_name ?? "").trim();

  // On-behalf of a MATCHED partner: the target's company owns the bucket, and
  // the target's own contact is the right person to name.
  if (fk) {
    const label = typed || partnerMap.get(fk) || "";
    return label
      ? { companyKey: label.trim().toLowerCase(), companyName: label.trim(), contactPartnerId: fk }
      : { companyKey: fk, companyName: fk, contactPartnerId: fk };
  }

  // On-behalf of a free-typed company (mutually exclusive with the FK): there is
  // no partner row for it, so there is no contact to show. Deliberately NOT the
  // creator — they're an Arxys rep, not a contact at this company.
  if (typed) {
    return { companyKey: typed.toLowerCase(), companyName: typed, contactPartnerId: null };
  }

  // Plain self-serve: the creator's own company and the creator as contact.
  const label = partnerMap.get(s.partner_id) || "";
  return label
    ? {
        companyKey: label.trim().toLowerCase(),
        companyName: label.trim(),
        contactPartnerId: s.partner_id,
      }
    : { companyKey: s.partner_id, companyName: s.partner_id, contactPartnerId: s.partner_id };
}

// One deal = one (effective-partner, trimmed-lower project_name) pair, merged
// further by revision lineage (ADR 0093 step 2 — see below).
// Representative = is_preferred row if any starred, else the newest
// non-superseded (leaf) row, else most-recent by created_at.
export function groupIntoDeals(
  submissions: SubmissionRow[],
  partners: PartnerRow[],
): Deal[] {
  const partnerMap = new Map<string, string>();
  const contactMap = new Map<string, string | null>();
  for (const p of partners) {
    partnerMap.set(p.id, p.company_name);
    contactMap.set(p.id, p.contact_name ?? null);
  }

  type Bucket = { subs: SubmissionRow[]; companyName: string };
  const buckets = new Map<string, Bucket>();
  const idToKey = new Map<string, string>();

  for (const s of submissions) {
    const projectKey = (s.project_name ?? "").trim().toLowerCase();
    const { companyKey, companyName } = effectiveCompany(s, partnerMap);
    const key = `${companyKey}\x00${projectKey}`;
    if (!buckets.has(key)) {
      buckets.set(key, { subs: [], companyName });
    }
    buckets.get(key)!.subs.push(s);
    idToKey.set(s.id, key);
  }

  // ADR 0093 step 2 — a revise can edit the project name, so two lineage-linked
  // rows can land in different text buckets. parent_submission_id is the
  // authoritative link (set server-side, RLS-validated at submit time — see
  // calculator/actions.ts), so it merges buckets rather than only
  // supplementing the text match. Small union-find over the text-bucket keys.
  const dsuParent = new Map<string, string>();
  const find = (k: string): string => {
    let root = k;
    while (dsuParent.has(root)) root = dsuParent.get(root)!;
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) dsuParent.set(ra, rb);
  };
  const idSet = new Set(submissions.map((s) => s.id));
  for (const s of submissions) {
    if (s.parent_submission_id && idSet.has(s.parent_submission_id)) {
      const childKey = idToKey.get(s.id);
      const parentKey = idToKey.get(s.parent_submission_id);
      if (childKey && parentKey) union(childKey, parentKey);
    }
  }

  const merged = new Map<string, Bucket>();
  for (const [key, bucket] of buckets) {
    const root = find(key);
    if (!merged.has(root)) {
      merged.set(root, { subs: [], companyName: bucket.companyName });
    }
    merged.get(root)!.subs.push(...bucket.subs);
  }

  const deals: Deal[] = [];
  for (const [root, { subs, companyName }] of merged) {
    const companyKey = root.slice(0, root.indexOf("\x00"));

    const byCreatedDesc = (a: SubmissionRow, b: SubmissionRow) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

    // A row referenced as another row's parent_submission_id within this
    // bucket has been superseded by a later revision — never let it win
    // representative selection over a still-current (leaf) row, even if it
    // happens to be newer by clock (out-of-order created_at, clock skew).
    const parentIds = new Set(
      subs
        .map((s) => s.parent_submission_id)
        .filter((id): id is string => Boolean(id)),
    );
    const leaves = subs.filter((s) => !parentIds.has(s.id));
    const candidates = leaves.length > 0 ? leaves : subs;

    const preferred = subs.find((s) => s.is_preferred);
    const rep = preferred ?? [...candidates].sort(byCreatedDesc)[0];

    deals.push({
      company_key: companyKey,
      company_name: companyName,
      // Resolved from the REPRESENTATIVE row: a merged deal shows the contact
      // behind the copy actually being reported, not whoever happened to be first.
      contact_name: (() => {
        const { contactPartnerId } = effectiveCompany(rep, partnerMap);
        return contactPartnerId ? contactMap.get(contactPartnerId) ?? null : null;
      })(),
      project_key: (rep.project_name ?? "").trim().toLowerCase(),
      project_name: rep.project_name,
      status: rep.status,
      total_list_price_usd: rep.total_list_price_usd,
      pipedrive_deal_id: rep.pipedrive_deal_id,
      representative_id: rep.id,
      representative_created_at: rep.created_at,
      all_submission_ids: [...subs].sort(byCreatedDesc).map((s) => s.id),
    });
  }

  return deals;
}

// A submission is "superseded" once another submission's parent_submission_id
// points to it — i.e., it was revised. Independent of deal bucketing; used to
// gray out stale rows in the admin drill-down instead of showing them as
// equally-live "Open" alongside the revision that replaced them.
export function supersededIds(submissions: SubmissionRow[]): Set<string> {
  const ids = new Set<string>();
  for (const s of submissions) {
    if (s.parent_submission_id) ids.add(s.parent_submission_id);
  }
  return ids;
}

export type PipelineTotals = {
  // Straight (unweighted) sum of list price across Open deals only.
  openPipeline: number;
  // Straight sum of list price across Won deals (informational; no weighting).
  wonTotal: number;
};

// Open Pipeline = sum of Open deal values; Won total = sum of Won deal values.
// Lost deals contribute to neither. Caller may pass all deals (ADR 0081).
export function computePipelineTotals(deals: Deal[]): PipelineTotals {
  let openPipeline = 0;
  let wonTotal = 0;

  for (const deal of deals) {
    const value = deal.total_list_price_usd ?? 0;
    if (deal.status === "open") openPipeline += value;
    else if (deal.status === "won") wonTotal += value;
  }

  return { openPipeline, wonTotal };
}
