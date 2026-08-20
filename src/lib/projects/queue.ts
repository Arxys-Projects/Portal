// Loading the /projects queue — the I/O half. All derivation lives in rows.ts.
//
// CROSS-PARTNER ACCESS needs no new access-control shape. `submissions` already
// carries submissions_select_internal (20260604000002) and `partners` already
// carries partners_select_internal (20260605000004), both permissive SELECT
// policies gated on is_internal — which is exactly the pattern the brief says to
// match rather than extend. So this takes the ordinary authenticated server
// client and reads across every partner; there is no service-role client here and
// no new policy in either migration. requireAdminOrInternal() is the caller's
// gate, and RLS is the second layer underneath it.
//
// Pipedrive is not read on a plain load. The queue reads pipedrive_deal_cache
// (ADR 0113) and the live reads happen only when the caller asks for them.

import type { SupabaseClient } from "@supabase/supabase-js";
import { groupIntoDeals } from "@/lib/pipeline/forecast";
import { fingerprintSnapshotLineItems } from "./line-items";
import { lastRepricingDate } from "./price-effectivity";
import type { PriceVersionRow } from "./price-effectivity";
import { readDealCache, refreshDealCache } from "./pipedrive-cache";
import { buildProjectQueue, pickCurrentQuote } from "./rows";
import type {
  ProjectQueueResult,
  QueueArchiveRow,
  QueueDealCacheRow,
  QueuePartnerRow,
  QueueQuoteRow,
  QueueSubmissionRow,
} from "./types";

const SUBMISSION_COLUMNS = `id, partner_id, project_name, status, is_preferred,
  total_list_price_usd, pipedrive_deal_id, created_at,
  on_behalf_of_partner_id, on_behalf_of_company_name, parent_submission_id,
  recommended_product_id, recommended_units`;

export type ProjectQueueRefreshMode =
  // Read the cache and make no Pipedrive calls. What a page navigation should do.
  | "none"
  // Read the cache, then live-read only the deals that have never been read.
  // One-time cost per deal, so a project that has just acquired a deal shows a
  // real line-item count on first sight instead of an unreachable marker.
  | "missing"
  // Live-read every linked deal. What the "↻ Refresh" control does.
  | "all";

export type LoadProjectQueueOptions = {
  refresh?: ProjectQueueRefreshMode;
  now?: Date;
};

// Load the whole queue for an internal viewer.
//
// `viewerId` is the signed-in internal user (partners.id = auth.uid()). It drives
// "by you" attribution and the proposal-just-generated state, which is
// deliberately scoped to the person who generated the proposal.
export async function loadProjectQueue(
  supabase: SupabaseClient,
  viewerId: string,
  options: LoadProjectQueueOptions = {},
): Promise<ProjectQueueResult> {
  const now = options.now ?? new Date();
  const refresh = options.refresh ?? "none";

  // Cross-partner: no partner_id filter. Single-digit-partner, double-digit-
  // submission scale, so this is one unpaginated read and the grouping happens
  // in memory, exactly as the admin partner-grouped view already does it.
  const [{ data: submissionRows, error: submissionError }, { data: partnerRows }, latestPriceEffectiveDate] =
    await Promise.all([
      supabase.from("submissions").select(SUBMISSION_COLUMNS).order("created_at", { ascending: false }),
      supabase.from("partners").select("id, company_name, contact_name, is_internal"),
      loadLatestPriceEffectiveDate(supabase, now),
    ]);

  if (submissionError) {
    // Without submissions there is no queue at all, so this one failure is fatal
    // where the others below degrade. Surfacing an empty queue would read as
    // "you have no projects", which is a lie the page cannot recover from.
    throw new Error(`Could not load projects: ${submissionError.message}`);
  }

  const submissions = (submissionRows ?? []) as unknown as QueueSubmissionRow[];
  const partners = ((partnerRows ?? []) as unknown as Array<{
    id: string;
    company_name: string;
    contact_name: string | null;
    is_internal: boolean | null;
  }>).map(
    (p): QueuePartnerRow => ({
      id: p.id,
      company_name: p.company_name,
      contact_name: p.contact_name ?? null,
      is_internal: Boolean(p.is_internal),
    }),
  );

  if (submissions.length === 0) {
    return buildProjectQueue({
      submissions: [],
      partners,
      quotes: [],
      archives: [],
      dealCache: [],
      viewerId,
      now,
      latestPriceEffectiveDate,
    });
  }

  const submissionIds = submissions.map((s) => s.id);

  const [quotes, archives] = await Promise.all([
    loadQuoteMetadata(supabase, submissionIds),
    loadArchives(supabase, submissionIds),
  ]);

  // Frozen line items are needed ONLY for the proposal that is current for its
  // project, because drift is only ever measured against the current version.
  // Finding out which those are means grouping first, which is why grouping runs
  // here as well as inside buildProjectQueue — groupIntoDeals is pure and cheap,
  // and the alternative (reading every snapshot) pulls the full jsonb for the
  // entire quote history of every project.
  await attachCurrentQuoteLineItems(supabase, submissions, partners, quotes);

  const dealCache = await loadDealCache(supabase, submissions, refresh, now);

  return buildProjectQueue({
    submissions,
    partners,
    quotes,
    archives,
    dealCache,
    viewerId,
    now,
    latestPriceEffectiveDate,
  });
}

// "When pricing was last updated," as one global date: every SKU changed by a
// single scripts/push-prices.ts run shares the same effective_date, so one date
// covers the whole run.
//
// Reads the full append-only history from `products` — the one direct read of
// that table in src/ — because the answer is a version-to-version delta, and
// current_products has already collapsed each SKU to a single row. Which row is
// newest cannot distinguish a repricing from a brand-new SKU's debut, and only
// the former makes an existing quote stale. See lastRepricingDate and ADR 0141.
async function loadLatestPriceEffectiveDate(
  supabase: SupabaseClient,
  now: Date,
): Promise<string | null> {
  const { data, error } = await supabase.from("products").select("sku, msrp, effective_date");

  if (error) {
    // Degrade to "no flag": every quote reads as priced-current rather than
    // the read failing the whole queue over a staleness signal.
    console.error("[projects latest price]", error);
    return null;
  }

  return lastRepricingDate((data ?? []) as PriceVersionRow[], now);
}

// Proposal metadata for every submission in hand. Deliberately does not select
// `snapshot`: this read covers the whole quote history and the snapshots are
// large (frozen commercial + sizing + showcase + full T&Cs text).
async function loadQuoteMetadata(
  supabase: SupabaseClient,
  submissionIds: string[],
): Promise<Array<QueueQuoteRow & { id: string }>> {
  const { data, error } = await supabase
    .from("project_quotes")
    .select("id, submission_id, version, pipedrive_deal_id, generated_at, generated_by")
    .in("submission_id", submissionIds);

  if (error) {
    // Degrade to "no proposals": every row reads as Recommended with a generate
    // action, which is wrong but safe — the generate path re-reads the real
    // version from the database, so nothing can be overwritten on the strength of
    // this. Blanking the whole queue instead would be worse.
    console.error("[projects quote metadata]", error);
    return [];
  }

  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((raw) => ({
    id: String(raw.id),
    submission_id: String(raw.submission_id),
    version: Number(raw.version),
    pipedrive_deal_id: Number(raw.pipedrive_deal_id),
    generated_at: String(raw.generated_at),
    generated_by: String(raw.generated_by),
    line_items: null,
  }));
}

// Fill in `line_items` on the current proposal of each project, in place.
async function attachCurrentQuoteLineItems(
  supabase: SupabaseClient,
  submissions: QueueSubmissionRow[],
  partners: QueuePartnerRow[],
  quotes: Array<QueueQuoteRow & { id: string }>,
): Promise<void> {
  if (quotes.length === 0) return;

  const bySubmission = new Map<string, Array<QueueQuoteRow & { id: string }>>();
  for (const q of quotes) {
    const list = bySubmission.get(q.submission_id) ?? [];
    list.push(q);
    bySubmission.set(q.submission_id, list);
  }

  const currentIds: string[] = [];
  for (const deal of groupIntoDeals(submissions, partners)) {
    const projectQuotes = deal.all_submission_ids.flatMap((id) => bySubmission.get(id) ?? []);
    const current = pickCurrentQuote(projectQuotes) as (QueueQuoteRow & { id: string }) | null;
    if (current) currentIds.push(current.id);
  }
  if (currentIds.length === 0) return;

  const { data, error } = await supabase
    .from("project_quotes")
    .select("id, snapshot")
    .in("id", currentIds);

  if (error) {
    // Leaves line_items null on the current proposals, which the derivation
    // treats as "no comparison basis": no drift is reported and the products line
    // reads "Quoted line items unavailable" rather than silently showing the
    // calculator's recommendation on a Quoted row.
    console.error("[projects quote snapshots]", error);
    return;
  }

  const byId = new Map(quotes.map((q) => [q.id, q]));
  for (const raw of (data ?? []) as Array<{ id: string; snapshot: unknown }>) {
    const quote = byId.get(String(raw.id));
    if (!quote) continue;
    const commercial = (raw.snapshot as { commercial?: { lineItems?: unknown } } | null)?.commercial;
    quote.line_items = fingerprintSnapshotLineItems(commercial?.lineItems);
  }
}

async function loadArchives(
  supabase: SupabaseClient,
  submissionIds: string[],
): Promise<QueueArchiveRow[]> {
  const { data, error } = await supabase
    .from("submission_internal_archives")
    .select("submission_id, archived_at, archived_by")
    .in("submission_id", submissionIds);

  if (error) {
    // Degrade to "nothing archived", which is the same state as an empty table
    // and is what the queue looks like before the migration is applied.
    console.error("[projects archives]", error);
    return [];
  }
  return (data ?? []) as unknown as QueueArchiveRow[];
}

async function loadDealCache(
  supabase: SupabaseClient,
  submissions: QueueSubmissionRow[],
  refresh: ProjectQueueRefreshMode,
  now: Date,
): Promise<QueueDealCacheRow[]> {
  const dealIds = Array.from(
    new Set(
      submissions
        .map((s) => Number(s.pipedrive_deal_id))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  );
  if (dealIds.length === 0) return [];

  if (refresh === "all") {
    const { cache } = await refreshDealCache(supabase, dealIds, { now });
    return Array.from(cache.values());
  }

  const cache = await readDealCache(supabase, dealIds);

  if (refresh === "missing") {
    const unseen = dealIds.filter((id) => !cache.has(id));
    if (unseen.length > 0) {
      const { cache: refreshed } = await refreshDealCache(supabase, unseen, { now });
      for (const [id, row] of refreshed) cache.set(id, row);
    }
  }

  return Array.from(cache.values());
}

// The set of deals the "↻ Refresh" control should re-read: every deal any
// submission is linked to. Exported so the refresh action does not have to
// re-derive it from a loaded queue, which would make the refresh depend on the
// page's current filters.
export async function projectQueueDealIds(supabase: SupabaseClient): Promise<number[]> {
  const { data, error } = await supabase
    .from("submissions")
    .select("pipedrive_deal_id")
    .not("pipedrive_deal_id", "is", null);

  if (error) {
    console.error("[projects deal ids]", error);
    return [];
  }
  return Array.from(
    new Set(
      ((data ?? []) as Array<{ pipedrive_deal_id: number | string | null }>)
        .map((r) => Number(r.pipedrive_deal_id))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  );
}
