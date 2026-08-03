// The `/projects` row derivation — pure, and the whole point of this module.
//
// Everything the design spec calls a "row state", every action slot, expiry,
// line-item drift, archive semantics and "which proposal is current" is computed
// here from plain data. No Supabase, no Pipedrive, no framework: queue.ts does
// the reads and hands the rows over, so all of the logic that is expensive to
// debug once a page sits on top of it is testable under plain Node.
//
// It EXTENDS groupIntoDeals() rather than reimplementing it. Company bucketing,
// on-behalf-of resolution, revision-lineage merging via parent_submission_id and
// representative-row selection are already correct and already tested in
// forecast.test.ts; forking them to add cross-partner fields would mean two
// copies of the trickiest grouping code in the repo. The only thing that changes
// versus the partner-facing "My Pipeline" caller is the input: an admin
// cross-partner result set with a populated partners list, instead of one
// partner's own RLS-scoped rows with partners: [].

import { groupIntoDeals, supersededIds } from "@/lib/pipeline/forecast";
import { projectQuoteExpiryIso } from "@/lib/project-quote/expiry";
import { pipedriveDealUrl } from "@/lib/pipedrive/url";
import {
  NO_DRIFT,
  diffLineItems,
  quotedProductsDisplay,
  recommendedProductsDisplay,
  type LineItemDrift,
} from "./line-items";
import type {
  AvailableActions,
  BuildProjectQueueInput,
  DownloadAction,
  PipedriveAction,
  ProjectAttention,
  ProjectPortalStatus,
  ProjectQueueResult,
  ProjectQueueRow,
  ProjectQueueTotals,
  ProjectRowState,
  QueueArchiveRow,
  QueueDealCacheRow,
  QueueQuoteRow,
  QueueSubmissionRow,
  TaskAction,
} from "./types";

// The Band C "Quotes · 30 days" window.
export const QUOTES_WINDOW_DAYS = 30;

const MS_PER_DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Action copy. Every string the page prints for an action slot lives here, so
// the spec's rule — "Every action label names the specific thing that will
// happen, including the version number" — is enforced in one testable place
// rather than assembled in JSX.
// ---------------------------------------------------------------------------
export const ACTION_LABELS = {
  retry_pipedrive_link: "Retry Pipedrive link",
  restore_from_archive: "Restore to my queue",
  add_line_items: "Add line items ↗",
  generate_first: "Generate Project Proposal",
  generate_next: (version: number) => `New Project Proposal v${version}`,
  download_generated: (version: number) => `Download Proposal v${version} ⌄`,
  download_split: "Download",
  download_submission_only: "Submission ⤓",
  open_deal: "Pipedrive ↗",
  no_deal: "No deal to open",
  archive: "Archive",
  undo_archive: "Undo",
} as const;

// ---------------------------------------------------------------------------
// Small derivations, each isolated so the tests can pin them individually.
// ---------------------------------------------------------------------------

function toPortalStatus(status: string | null): ProjectPortalStatus {
  if (status === "won" || status === "lost") return status;
  // ADR 0081 made the column NOT NULL with default 'open' and folded every
  // non-terminal legacy value into it, so anything else is 'open' by definition.
  return "open";
}

function toDealId(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function toEpoch(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

// "Generated today" for the proposal-just-generated strip, compared in UTC.
//
// The strip reads "generated today at 9:47 AM by you", and the page formats that
// clock time in the viewer's locale. A UTC calendar comparison therefore drifts
// from the rendered time for a proposal generated late in the evening in a
// western time zone: it would render "today" while this says otherwise. With one
// internal user on US business hours that window is never hit in practice, and
// the alternative — threading an IANA zone through the query layer — buys nothing
// today. Flagged for the page phase, which knows the display zone.
function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

// The project's CURRENT proposal: the most recently generated one across every
// submission in the project's lineage, which is what the generate dialog means
// by "the current Project Proposal for this project".
//
// Ordered on generated_at rather than on version, because version is numbered
// per submission (assemble.ts) and so is not comparable across a project's
// lineage — sub A's v2 and sub B's v1 can both exist and B's can be the newer
// document. Ties break on version then submission_id purely for determinism.
export function pickCurrentQuote(quotes: QueueQuoteRow[]): QueueQuoteRow | null {
  if (quotes.length === 0) return null;
  return [...quotes].sort((a, b) => {
    const ta = toEpoch(a.generated_at) ?? 0;
    const tb = toEpoch(b.generated_at) ?? 0;
    if (ta !== tb) return tb - ta;
    if (a.version !== b.version) return b.version - a.version;
    return a.submission_id < b.submission_id ? -1 : 1;
  })[0];
}

// Whether the cached read is current. Derived, never stored (ADR 0113): a
// failure updates last_failed_at and leaves the values alone, so "is what I am
// looking at stale" is the comparison of the two timestamps and nothing else.
//
// No cache row, or a row that has never had a successful read, is NOT ok — there
// are no last known values to show, which is the one case where the row
// legitimately has nothing in its value cell.
export function isCacheReadOk(cache: QueueDealCacheRow | null): boolean {
  if (!cache || cache.read_at === null) return false;
  if (cache.last_failed_at === null) return true;
  const read = toEpoch(cache.read_at);
  const failed = toEpoch(cache.last_failed_at);
  if (read === null) return false;
  if (failed === null) return true;
  return read >= failed;
}

// ---------------------------------------------------------------------------
// Row state
// ---------------------------------------------------------------------------

// Everything the state and action decisions depend on, resolved once so the two
// functions below cannot disagree about the facts.
type RowFacts = {
  isArchived: boolean;
  dealLinked: boolean;
  dealUrl: string | null;
  // null = never successfully read. A KNOWN zero is what gates generation.
  lineItemCount: number | null;
  hasQuote: boolean;
  currentVersion: number | null;
  currentQuoteSubmissionId: string | null;
  nextVersion: number;
  justGenerated: boolean;
  isExpired: boolean;
  drift: LineItemDrift;
};

// Precedence, most decisive first. These are card treatments and only one can
// win, so the order IS the design decision:
//
//   1. archived        — an archived row is out of the queue; its only offer is
//                        restore, so nothing else about it should be shouting.
//   2. no_deal_link    — a red border, and the row genuinely cannot be quoted at
//                        all. Beats every quote state because no quote state is
//                        actionable without a deal.
//   3. just generated  — the green "ready to download and send" strip. Beats
//                        drift and expiry because neither can be true of a
//                        proposal made minutes ago.
//   4. drifted         — beats expiry: "v2 no longer matches the deal" is a
//                        correctness problem, "v2 lapsed" is only a freshness
//                        one, and re-generating fixes both. A row that is both
//                        should send him to the more serious reason.
//   5. quote_expired
//   6. quote_current
//   7. deal_zero_line_items — only reachable with no proposal, and only on a
//                        KNOWN zero. An unread deal is not claimed to be empty.
//   8. no_quote_yet    — the fallthrough.
export function deriveRowState(facts: RowFacts): ProjectRowState {
  if (facts.isArchived) return "archived";
  if (!facts.dealLinked) return "no_deal_link";
  if (facts.justGenerated) return "proposal_just_generated";
  if (facts.hasQuote && facts.drift.total > 0) return "line_items_drifted";
  if (facts.isExpired) return "quote_expired";
  if (facts.hasQuote) return "quote_current";
  if (facts.lineItemCount === 0) return "deal_zero_line_items";
  return "no_quote_yet";
}

// The three slots, always present, always in this order. Slot 1's branch order
// mirrors deriveRowState's precedence so a row's state and its primary action
// can never describe different situations.
export function deriveAvailableActions(facts: RowFacts): AvailableActions {
  const task: TaskAction = (() => {
    if (facts.isArchived) {
      return { kind: "restore_from_archive", label: ACTION_LABELS.restore_from_archive };
    }
    if (!facts.dealLinked) {
      return { kind: "retry_pipedrive_link", label: ACTION_LABELS.retry_pipedrive_link };
    }
    if (facts.justGenerated && facts.currentVersion !== null && facts.currentQuoteSubmissionId) {
      return {
        kind: "download_proposal",
        label: ACTION_LABELS.download_generated(facts.currentVersion),
        version: facts.currentVersion,
        proposal_submission_id: facts.currentQuoteSubmissionId,
      };
    }
    // The generate guard, and the reason this whole layer computes
    // deal_line_item_count: generating against an empty deal burns a version
    // number and produces a wrong PDF (acceptance check 5). Only a KNOWN zero
    // triggers it — when the count is null the deal has never been read, and
    // assemble.ts's own empty_deal refusal is the backstop, so offering the
    // generate button is safe and reads far better than telling him to add line
    // items to a deal that plainly has them.
    if (facts.lineItemCount === 0) {
      return {
        kind: "add_line_items",
        label: ACTION_LABELS.add_line_items,
        url: facts.dealUrl ?? "",
      };
    }
    if (facts.hasQuote) {
      return {
        kind: "generate_next_proposal",
        label: ACTION_LABELS.generate_next(facts.nextVersion),
        next_version: facts.nextVersion,
      };
    }
    return {
      kind: "generate_proposal",
      label: ACTION_LABELS.generate_first,
      next_version: facts.nextVersion,
    };
  })();

  // Slot 2. A Recommended row has no proposal, so there is nothing to split:
  // one button, the calculator submission only.
  const download: DownloadAction =
    facts.currentVersion !== null && facts.currentQuoteSubmissionId
      ? {
          kind: "download_split",
          label: ACTION_LABELS.download_split,
          proposal_version: facts.currentVersion,
          proposal_submission_id: facts.currentQuoteSubmissionId,
        }
      : { kind: "download_submission_only", label: ACTION_LABELS.download_submission_only };

  // Slot 3. Present but disabled when unlinked — the slot never disappears,
  // because a slot that moves costs more than a slot that repeats.
  const pipedrive: PipedriveAction = facts.dealUrl
    ? { kind: "open_deal", label: ACTION_LABELS.open_deal, url: facts.dealUrl, enabled: true }
    : { kind: "no_deal", label: ACTION_LABELS.no_deal, url: null, enabled: false };

  return {
    task,
    download,
    pipedrive,
    archive: facts.isArchived
      ? { kind: "restore", label: ACTION_LABELS.undo_archive }
      : { kind: "archive", label: ACTION_LABELS.archive },
  };
}

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

export function buildProjectQueue(input: BuildProjectQueueInput): ProjectQueueResult {
  const { submissions, partners, quotes, archives, dealCache, viewerId, now } = input;

  const subById = new Map<string, QueueSubmissionRow>(submissions.map((s) => [s.id, s]));
  const partnerById = new Map(partners.map((p) => [p.id, p]));

  const quotesBySubmission = new Map<string, QueueQuoteRow[]>();
  for (const q of quotes) {
    const list = quotesBySubmission.get(q.submission_id) ?? [];
    list.push(q);
    quotesBySubmission.set(q.submission_id, list);
  }

  const archiveBySubmission = new Map<string, QueueArchiveRow>(
    archives.map((a) => [a.submission_id, a]),
  );
  const cacheByDealId = new Map<number, QueueDealCacheRow>(
    dealCache.map((c) => [Number(c.pipedrive_deal_id), c]),
  );

  const deals = groupIntoDeals(submissions, partners);
  const superseded = supersededIds(submissions);
  const quotesWindowStart = now.getTime() - QUOTES_WINDOW_DAYS * MS_PER_DAY;

  const rows: ProjectQueueRow[] = [];
  const sortKey = new Map<string, number>();
  let quotesInWindow = 0;

  for (const deal of deals) {
    const rep = subById.get(deal.representative_id);
    // groupIntoDeals only ever returns ids it was given, so this cannot happen.
    // Skipping rather than asserting keeps a single malformed input from taking
    // the whole queue down.
    if (!rep) continue;

    // all_submission_ids arrives newest-first.
    const bucket = deal.all_submission_ids
      .map((id) => subById.get(id))
      .filter((s): s is QueueSubmissionRow => Boolean(s));

    // The project's deal: the representative's link, falling back to the newest
    // submission in the bucket that has one. A revision filed before its deal
    // sync completed has no id of its own while the project plainly has a deal,
    // and calling that project "unlinked" would put a red border and a
    // Retry-link button on a row whose deal is one click away.
    const dealId =
      toDealId(rep.pipedrive_deal_id) ??
      bucket.map((s) => toDealId(s.pipedrive_deal_id)).find((id) => id !== null) ??
      null;

    const cache = dealId !== null ? cacheByDealId.get(dealId) ?? null : null;
    const dealUrl = pipedriveDealUrl(dealId);
    const readOk = dealId === null ? true : isCacheReadOk(cache);

    const projectQuotes = bucket.flatMap((s) => quotesBySubmission.get(s.id) ?? []);
    const currentQuote = pickCurrentQuote(projectQuotes);

    const archive = archiveBySubmission.get(rep.id) ?? null;

    // Band C's "Quotes · 30 days". Archived projects are excluded for the same
    // reason they are excluded from Band B and the other two numbers: the tile
    // is clickable and filters the queue, so a count that includes rows the
    // queue will not show is a count he can catch out.
    if (archive === null) {
      for (const q of projectQuotes) {
        const t = toEpoch(q.generated_at);
        if (t !== null && t >= quotesWindowStart) quotesInWindow += 1;
      }
    }

    // The version the generate action will ACTUALLY create. assemble.ts computes
    // max(version)+1 for the submission it is handed, which is this row's
    // representative — so on a project whose newest revision carries no
    // proposals yet, this restarts at 1 even though current_quote_version reads
    // 3. That is confusing copy but it is TRUE, and a button that names a
    // version the system will not produce is worse. See ADR 0113's follow-up.
    const repVersions = (quotesBySubmission.get(rep.id) ?? []).map((q) => q.version);
    const nextVersion = (repVersions.length > 0 ? Math.max(...repVersions) : 0) + 1;

    // Expiry: derived from the validity window frozen at generation, never
    // stored (ADR 0061). is_expired additionally requires the deal to be open,
    // per the spec — a lapsed proposal on a won or lost deal is not a chase.
    let expiresAt: string | null = null;
    let isExpired = false;
    if (currentQuote) {
      expiresAt = projectQuoteExpiryIso(currentQuote.generated_at, currentQuote.validity_days);
      const generatedAt = toEpoch(currentQuote.generated_at);
      if (generatedAt !== null) {
        const expiryInstant = generatedAt + currentQuote.validity_days * MS_PER_DAY;
        isExpired = now.getTime() > expiryInstant && cache?.deal_status === "open";
      }
    }

    // Drift is only meaningful when the proposal was snapshotted from the deal
    // the project is linked to now. A relink can repoint a submission at a
    // different deal (ADR 0093 step 3), and comparing across that boundary would
    // report every line as drifted.
    const driftComparable =
      currentQuote !== null && dealId !== null && Number(currentQuote.pipedrive_deal_id) === dealId;
    const drift = driftComparable
      ? diffLineItems(cache?.line_items ?? null, currentQuote.line_items)
      : NO_DRIFT;

    const creator = partnerById.get(rep.partner_id);

    const justGenerated =
      currentQuote !== null &&
      currentQuote.generated_by === viewerId &&
      isSameUtcDay(new Date(currentQuote.generated_at), now);

    const facts: RowFacts = {
      isArchived: archive !== null,
      dealLinked: dealId !== null,
      dealUrl,
      lineItemCount: cache?.line_item_count ?? null,
      hasQuote: currentQuote !== null,
      currentVersion: currentQuote?.version ?? null,
      currentQuoteSubmissionId: currentQuote?.submission_id ?? null,
      nextVersion,
      justGenerated,
      isExpired,
      drift,
    };

    // Quoted describes the DOCUMENT he would send, so it is built from the
    // proposal's frozen lines rather than from the live deal — the drift strip is
    // what says the two disagree. Never falls back to the recommendation: a
    // Recommended-looking products line on a Quoted row is the exact confusion
    // the spec forbids, because it puts a wrong product list in front of a
    // customer.
    const productsDisplay = currentQuote
      ? currentQuote.line_items
        ? quotedProductsDisplay(currentQuote.line_items)
        : "Quoted line items unavailable"
      : recommendedProductsDisplay(rep.recommended_product_id, rep.recommended_units);

    rows.push({
      submission_id: rep.id,
      project_name: deal.project_name,
      partner_company_name: deal.company_name,
      partner_contact_name: deal.contact_name,

      created_by_user_name: creator?.contact_name ?? null,
      created_by_is_internal: creator?.is_internal ?? false,
      created_at: rep.created_at,

      portal_status: toPortalStatus(rep.status),
      portal_status_editable: false,

      internal_archived_at: archive?.archived_at ?? null,
      internal_archived_by: archive?.archived_by ?? null,
      internal_archived_by_name: archive
        ? partnerById.get(archive.archived_by)?.contact_name ?? null
        : null,

      pipedrive_deal_id: dealId,
      pipedrive_deal_url: dealUrl,
      deal_link_state: dealId === null ? "missing" : "linked",

      pipedrive_deal_status: cache?.deal_status ?? null,
      pipedrive_status_as_of: cache?.read_at ?? null,
      pipedrive_read_ok: readOk,
      pipedrive_deal_value: cache?.deal_value ?? null,
      portal_list_price_usd:
        rep.total_list_price_usd === null ? null : Number(rep.total_list_price_usd),
      deal_line_item_count: cache?.line_item_count ?? null,

      products_display: productsDisplay,
      products_source: currentQuote ? "quoted" : "recommended",

      current_quote_version: currentQuote?.version ?? null,
      current_quote_generated_at: currentQuote?.generated_at ?? null,
      current_quote_expires_at: expiresAt,
      is_expired: isExpired,
      project_quote_version_count: projectQuotes.length,

      is_superseded: superseded.has(rep.id),

      project_key: deal.project_key,
      parent_submission_id: rep.parent_submission_id ?? null,

      deal_line_items_changed_at: cache?.line_items_changed_at ?? null,
      line_item_drift_count: drift.total,

      row_state: deriveRowState(facts),
      available_actions: deriveAvailableActions(facts),
    });

    // "Most recently updated" — `submissions` has no updated_at, so activity is
    // the newest of anything that happened to the project: a submission filed or
    // a proposal generated.
    const activity = Math.max(
      ...bucket.map((s) => toEpoch(s.created_at) ?? 0),
      toEpoch(currentQuote?.generated_at ?? null) ?? 0,
    );
    sortKey.set(rep.id, activity);
  }

  rows.sort((a, b) => (sortKey.get(b.submission_id) ?? 0) - (sortKey.get(a.submission_id) ?? 0));

  return {
    rows,
    attention: deriveAttention(rows),
    totals: deriveTotals(rows, quotesInWindow),
  };
}

// Band B. Archived projects are excluded from both entries: an archived row is
// out of the queue, so a banner offering "Show these 4 →" that then reveals
// three would be a bug the user can see.
function deriveAttention(rows: ProjectQueueRow[]): ProjectAttention {
  const live = rows.filter((r) => r.internal_archived_at === null);
  return {
    expired_quote_submission_ids: live.filter((r) => r.is_expired).map((r) => r.submission_id),
    missing_deal_link_submission_ids: live
      .filter((r) => r.deal_link_state === "missing")
      .map((r) => r.submission_id),
  };
}

// Band C, exactly three numbers.
function deriveTotals(rows: ProjectQueueRow[], quotesInWindow: number): ProjectQueueTotals {
  const live = rows.filter((r) => r.internal_archived_at === null);

  // Open pipeline is the sum of CACHED PIPEDRIVE deal values across open deals,
  // which is a different figure from the By-partner view's totals (the straight
  // sum of portal list prices, ADR 0081) and is labelled differently on the page.
  const contributing = live.filter(
    (r) => r.deal_link_state === "linked" && r.pipedrive_deal_status === "open",
  );

  let openPipeline = 0;
  let stale = 0;
  let oldestRead: number | null = null;
  for (const row of contributing) {
    openPipeline += row.pipedrive_deal_value ?? 0;
    if (!row.pipedrive_read_ok) stale += 1;
    const t = toEpoch(row.pipedrive_status_as_of);
    if (t !== null && (oldestRead === null || t < oldestRead)) oldestRead = t;
  }

  return {
    open_pipeline_usd: openPipeline,
    // The OLDEST contributing read, so the sum is never presented as fresher
    // than its stalest input.
    open_pipeline_as_of: oldestRead === null ? null : new Date(oldestRead).toISOString(),
    open_pipeline_deal_count: contributing.length,
    open_pipeline_stale_deal_count: stale,
    open_project_count: live.filter((r) => r.portal_status === "open").length,
    quotes_last_30_days: quotesInWindow,
  };
}
