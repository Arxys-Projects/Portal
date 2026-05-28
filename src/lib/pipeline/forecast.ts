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

// One deal = one (partner_id, trimmed-lower project_name) pair.
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
    const key = `${s.partner_id}\x00${projectKey}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        subs: [],
        partnerName: partnerMap.get(s.partner_id) ?? s.partner_id,
      });
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
