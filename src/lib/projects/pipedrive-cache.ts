// Reading and refreshing the cached Pipedrive deal state (ADR 0113).
//
// A /projects queue load performs ZERO Pipedrive calls: it reads
// pipedrive_deal_cache and nothing else. The live reads happen here, driven by
// the page's "↻ Refresh" control and by the first sighting of a deal that has
// never been read. That split is what makes the spec's two conflicting
// requirements both hold — "never blank, never zero on a read failure"
// (acceptance check 9) needs values written down in advance, and one screen of
// N projects cannot afford 2N round-trips against a rate-limited API on every
// page load.
//
// THE INVARIANT THIS FILE EXISTS TO PROTECT: a failed read never overwrites a
// good value. Success writes the value columns; failure writes only
// last_failed_at / last_error and leaves them alone. SQL cannot express "unless
// this write is a failure", which is why the two upserts below are separate
// statements with deliberately different column sets rather than one convenient
// merged payload.
//
// It reuses the existing shared Pipedrive client (src/lib/pipedrive/client.ts) —
// no second HTTP client, no second auth path, no second error type. It
// deliberately does NOT go through getDealForQuote(): that call resolves a
// product code per distinct product, which is one extra round-trip each, and the
// cache does not need codes (line-items.ts excludes them from the comparison for
// exactly this reason). It also returns a DealQuote, which is frozen verbatim
// inside project_quotes.snapshot — widening that type to carry the deal status
// this cache needs would quietly change the frozen snapshot shape as a side
// effect of an unrelated feature.

import type { SupabaseClient } from "@supabase/supabase-js";
import { PipedriveError, pipedriveClient } from "@/lib/pipedrive/client";
import { fingerprintDealProducts, fingerprintFromCacheColumn, sameLineItems } from "./line-items";
import type { DealLineFingerprint, PipedriveDealStatus, QueueDealCacheRow } from "./types";

const TABLE = "pipedrive_deal_cache";

// How many deals are read concurrently. Pipedrive rate-limits per token, and a
// refresh over a full queue is the heaviest thing this feature does; four in
// flight keeps a 40-deal refresh to roughly twenty sequential round-trip times
// without going anywhere near the limit.
const READ_CONCURRENCY = 4;

function toStatus(value: unknown): PipedriveDealStatus | null {
  return value === "open" || value === "won" || value === "lost" || value === "deleted"
    ? value
    : null;
}

function numericOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// PostgREST hands back numeric as a string and jsonb as parsed JSON. Nothing is
// cast; everything is coerced.
function mapCacheRow(raw: Record<string, unknown>): QueueDealCacheRow {
  return {
    pipedrive_deal_id: Number(raw.pipedrive_deal_id),
    deal_status: toStatus(raw.deal_status),
    deal_value: numericOrNull(raw.deal_value),
    currency: typeof raw.currency === "string" ? raw.currency : null,
    line_item_count: numericOrNull(raw.line_item_count),
    line_items: fingerprintFromCacheColumn(raw.line_items),
    deal_update_time: typeof raw.deal_update_time === "string" ? raw.deal_update_time : null,
    line_items_changed_at:
      typeof raw.line_items_changed_at === "string" ? raw.line_items_changed_at : null,
    read_at: typeof raw.read_at === "string" ? raw.read_at : null,
    last_failed_at: typeof raw.last_failed_at === "string" ? raw.last_failed_at : null,
    last_error: typeof raw.last_error === "string" ? raw.last_error : null,
  };
}

const CACHE_COLUMNS =
  "pipedrive_deal_id, deal_status, deal_value, currency, line_item_count, line_items, " +
  "deal_update_time, line_items_changed_at, read_at, last_failed_at, last_error";

// Read the cache for a set of deals. Returns only the deals that have a row; a
// missing entry means "never read", which the row derivation renders as
// pipedrive_read_ok: false with null last-known values.
//
// A failed read here resolves to an EMPTY map rather than throwing: losing the
// cache degrades /projects to "every deal unreachable", which is honest and
// still usable, whereas throwing takes the whole page down over a table the page
// treats as advisory.
export async function readDealCache(
  supabase: SupabaseClient,
  dealIds: number[],
): Promise<Map<number, QueueDealCacheRow>> {
  const ids = Array.from(new Set(dealIds.filter((id) => Number.isInteger(id) && id > 0)));
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase.from(TABLE).select(CACHE_COLUMNS).in("pipedrive_deal_id", ids);
  if (error) {
    console.error("[projects deal-cache read]", error);
    return new Map();
  }
  const map = new Map<number, QueueDealCacheRow>();
  for (const raw of (data ?? []) as unknown as Record<string, unknown>[]) {
    const row = mapCacheRow(raw);
    map.set(row.pipedrive_deal_id, row);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Refresh
// ---------------------------------------------------------------------------

type LiveRead =
  | {
      ok: true;
      dealId: number;
      status: PipedriveDealStatus | null;
      value: number | null;
      currency: string | null;
      updateTime: string | null;
      lineItems: DealLineFingerprint[];
    }
  | { ok: false; dealId: number; error: string };

// One deal's live read: the deal detail (status, value, currency) and its
// products (count, fingerprint), fetched together. Never throws — a failure is a
// typed result, mirroring getDealForQuote's contract.
async function readOneDeal(dealId: number): Promise<LiveRead> {
  try {
    const [deal, products] = await Promise.all([
      pipedriveClient.getDeal(dealId),
      pipedriveClient.getDealProducts(dealId),
    ]);
    return {
      ok: true,
      dealId,
      status: toStatus(deal.status),
      value: numericOrNull(deal.value),
      currency: deal.currency ?? null,
      updateTime: deal.update_time ?? null,
      lineItems: fingerprintDealProducts(products),
    };
  } catch (err) {
    const message =
      err instanceof PipedriveError
        ? `${err.status} ${err.message}`
        : err instanceof Error
          ? err.message
          : "Unknown Pipedrive read error";
    return { ok: false, dealId, error: message };
  }
}

// Bounded-concurrency map. A plain Promise.all over 40 deals would open 80
// sockets at once and invite a 429, and the repo has no task-pool helper to
// reuse.
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export type RefreshDealCacheResult = {
  // The cache as it stands AFTER the refresh, for every deal asked for that has
  // a row — successes updated, failures carrying their preserved last-known
  // values. Feed this straight into buildProjectQueue.
  cache: Map<number, QueueDealCacheRow>;
  refreshed: number[];
  failed: number[];
};

// Refresh the cache for a set of deals and return the post-refresh state.
//
// `now` is injected so the read timestamps a caller renders ("Read today at
// 9:42 AM") are the same instant it stamped, and so this is testable.
export async function refreshDealCache(
  supabase: SupabaseClient,
  dealIds: number[],
  options: { now?: Date } = {},
): Promise<RefreshDealCacheResult> {
  const ids = Array.from(new Set(dealIds.filter((id) => Number.isInteger(id) && id > 0)));
  if (ids.length === 0) return { cache: new Map(), refreshed: [], failed: [] };

  const now = options.now ?? new Date();
  const readAt = now.toISOString();

  // The PREVIOUS fingerprint is what makes line_items_changed_at possible: an
  // observed change is only observable against something already written down.
  const previous = await readDealCache(supabase, ids);
  const reads = await mapWithConcurrency(ids, READ_CONCURRENCY, readOneDeal);

  const successRows: Record<string, unknown>[] = [];
  const failureRows: Record<string, unknown>[] = [];
  const cache = new Map<number, QueueDealCacheRow>(previous);
  const refreshed: number[] = [];
  const failed: number[] = [];

  for (const read of reads) {
    const prior = previous.get(read.dealId) ?? null;

    if (!read.ok) {
      failed.push(read.dealId);
      // ONLY the failure columns. Every last-known value is left exactly as it
      // was, which is the entire "never blank, never zero" guarantee.
      failureRows.push({
        pipedrive_deal_id: read.dealId,
        last_failed_at: readAt,
        last_error: read.error.slice(0, 500),
      });
      cache.set(read.dealId, {
        ...(prior ?? {
          pipedrive_deal_id: read.dealId,
          deal_status: null,
          deal_value: null,
          currency: null,
          line_item_count: null,
          line_items: null,
          deal_update_time: null,
          line_items_changed_at: null,
          read_at: null,
        }),
        last_failed_at: readAt,
        last_error: read.error,
      });
      continue;
    }

    refreshed.push(read.dealId);

    // A first sighting is not a change: line_items_changed_at stays null until a
    // fingerprint has actually been seen to differ from a stored one. Otherwise
    // every deal would look like it changed the moment it entered the cache, and
    // the amber drift strip would fire across the whole queue on day one.
    const priorLines = prior?.line_items ?? null;
    const changed = priorLines !== null && !sameLineItems(priorLines, read.lineItems);
    const lineItemsChangedAt = changed ? readAt : prior?.line_items_changed_at ?? null;

    successRows.push({
      pipedrive_deal_id: read.dealId,
      deal_status: read.status,
      deal_value: read.value,
      currency: read.currency,
      line_item_count: read.lineItems.length,
      line_items: read.lineItems,
      deal_update_time: read.updateTime,
      line_items_changed_at: lineItemsChangedAt,
      read_at: readAt,
    });

    cache.set(read.dealId, {
      pipedrive_deal_id: read.dealId,
      deal_status: read.status,
      deal_value: read.value,
      currency: read.currency,
      line_item_count: read.lineItems.length,
      line_items: read.lineItems,
      deal_update_time: read.updateTime,
      line_items_changed_at: lineItemsChangedAt,
      read_at: readAt,
      // Preserved, not cleared: read_ok is derived by comparing the two
      // timestamps (read_at >= last_failed_at), so a successful read reasserts
      // freshness without discarding the diagnostic trail.
      last_failed_at: prior?.last_failed_at ?? null,
      last_error: prior?.last_error ?? null,
    });
  }

  // Two statements, not one. An upsert builds its SET list from the payload's
  // columns, so merging these would either null a good value out on a failure
  // row or write a stale read_at on a success row — whichever object PostgREST
  // used to derive the column list.
  if (successRows.length > 0) {
    const { error } = await supabase.from(TABLE).upsert(successRows, {
      onConflict: "pipedrive_deal_id",
    });
    if (error) console.error("[projects deal-cache upsert success]", error);
  }
  if (failureRows.length > 0) {
    const { error } = await supabase.from(TABLE).upsert(failureRows, {
      onConflict: "pipedrive_deal_id",
    });
    if (error) console.error("[projects deal-cache upsert failure]", error);
  }

  return { cache, refreshed, failed };
}
