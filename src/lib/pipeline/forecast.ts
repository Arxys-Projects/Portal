// Pure pipeline-forecast helpers — no Supabase dependency, safe in both
// server and client bundles.

export type ForecastableStatus = "on-hold" | "sent" | "won" | "lost";

// Probability weights per deal status (OQ-2, Phase 4 locked decisions).
// draft/NULL is never passed here — callers filter those out upstream.
export const STAGE_PROBABILITY: Record<ForecastableStatus, number> = {
  "on-hold": 0.2,
  sent: 0.4,
  won: 1.0,
  lost: 0.0,
};

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
};

export type PartnerRow = {
  id: string;
  company_name: string;
};

export type Deal = {
  partner_id: string;
  partner_name: string;
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

// Resolve the partner a submission rolls up to (Phase 7 Step 1). For a normal
// self-serve row this is the creator; for an on-behalf row it is the target.
//   groupingId — the stable bucket key:
//     COALESCE(on_behalf_of_partner_id, lower(trim(company_name)), partner_id).
//   partnerName — the human label for that bucket.
function effectivePartner(
  s: SubmissionRow,
  partnerMap: Map<string, string>,
): { groupingId: string; partnerName: string } {
  const fk = s.on_behalf_of_partner_id ?? null;
  const company = (s.on_behalf_of_company_name ?? "").trim();
  if (fk) {
    // Matched partner: group by the stable FK; label from the denormalised
    // company name, falling back to the partners map (admin views) then the id.
    return { groupingId: fk, partnerName: company || partnerMap.get(fk) || fk };
  }
  if (company) {
    // Free-typed company: no portal identity — group by the normalised name.
    return { groupingId: company.toLowerCase(), partnerName: company };
  }
  return {
    groupingId: s.partner_id,
    partnerName: partnerMap.get(s.partner_id) ?? s.partner_id,
  };
}

// One deal = one (effective-partner, trimmed-lower project_name) pair.
// Representative = is_preferred row if any starred, else most-recent by created_at.
export function groupIntoDeals(
  submissions: SubmissionRow[],
  partners: PartnerRow[],
): Deal[] {
  const partnerMap = new Map<string, string>();
  for (const p of partners) {
    partnerMap.set(p.id, p.company_name);
  }

  type Bucket = { subs: SubmissionRow[]; partnerName: string };
  const buckets = new Map<string, Bucket>();

  for (const s of submissions) {
    const projectKey = (s.project_name ?? "").trim().toLowerCase();
    const { groupingId, partnerName } = effectivePartner(s, partnerMap);
    const key = `${groupingId}\x00${projectKey}`;
    if (!buckets.has(key)) {
      buckets.set(key, { subs: [], partnerName });
    }
    buckets.get(key)!.subs.push(s);
  }

  const deals: Deal[] = [];
  for (const [key, { subs, partnerName }] of buckets) {
    const partnerId = key.slice(0, key.indexOf("\x00"));

    // preferred-or-latest
    const preferred = subs.find((s) => s.is_preferred);
    const sorted = [...subs].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const rep = preferred ?? sorted[0];

    deals.push({
      partner_id: partnerId,
      partner_name: partnerName,
      project_key: (rep.project_name ?? "").trim().toLowerCase(),
      project_name: rep.project_name,
      status: rep.status,
      total_list_price_usd: rep.total_list_price_usd,
      pipedrive_deal_id: rep.pipedrive_deal_id,
      representative_id: rep.id,
      representative_created_at: rep.created_at,
      all_submission_ids: sorted.map((s) => s.id),
    });
  }

  return deals;
}

export type ForecastSummary = {
  // Total list price of all non-draft/null deals (including won + lost).
  totalOpenPipeline: number;
  // Probability-weighted sum (lost contributes 0, draft/null excluded entirely).
  weightedForecast: number;
};

// Filters out draft/null before weighting. Caller may pass all deals.
export function computeWeightedForecast(deals: Deal[]): ForecastSummary {
  let totalOpenPipeline = 0;
  let weightedForecast = 0;

  for (const deal of deals) {
    if (deal.status === null || deal.status === "draft") continue;
    const value = deal.total_list_price_usd ?? 0;
    const prob =
      STAGE_PROBABILITY[deal.status as ForecastableStatus] ?? 0;
    totalOpenPipeline += value;
    weightedForecast += value * prob;
  }

  return { totalOpenPipeline, weightedForecast };
}
