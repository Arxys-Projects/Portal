// Display copy for a /projects row's State zone, top strip, and archived
// strip. Pure — no Supabase, no framework — so it runs under plain Node in
// row-copy.test.ts.
//
// This switches ON `row_state`; it never re-derives it. The precedence rules
// (does archived beat expired? does drift beat expiry?) already live in
// src/lib/projects/rows.ts and are tested there — this module's only job is
// choosing the WORDS for a state that is already decided, from fields the row
// already carries (version, timestamps, drift count).

import type {
  PipedriveDealStatus,
  ProjectQueueRow,
  ProjectRowState,
  ProductsSource,
} from "@/lib/projects/types";
import { formatDayAndClock, formatDayLabel, formatExpiryQualifier } from "./format";

export type DotTone = "green" | "amber" | "red" | "grey";
export type TextTone = "ink" | "amber" | "red" | "muted";
export type CardBorder = "default" | "amber-2" | "red-2" | "dashed";
export type StripTone = "green" | "amber";

export const DOT_COLOR: Record<DotTone, string> = {
  green: "#177a4f",
  amber: "#b45309",
  red: "#c0392b",
  grey: "#9aa4b2",
};

export const TEXT_TONE_CLASS: Record<TextTone, string> = {
  ink: "text-ink",
  amber: "text-[#b45309]",
  red: "text-danger",
  muted: "text-ink-soft/80",
};

export type StateZoneCopy = {
  dot: DotTone;
  tone: TextTone;
  headline: string;
  qualifier: string;
};

function pluralLines(n: number): string {
  return n === 1 ? "1 line differs" : `${n} lines differ`;
}

// The State zone's two lines. Every quote-bearing state prints the expiry
// phrase somewhere, but WHICH line it lands on differs by state on purpose
// (matches the reference screenshot exactly): "current" and "just generated"
// put it in the qualifier, under a headline that just says "current";
// "expired" promotes it into the headline itself, because that is the fact
// that most needs to be seen first.
export function stateZoneCopy(row: ProjectQueueRow, nowIso: string, timeZone?: string): StateZoneCopy {
  const state: ProjectRowState = row.row_state;
  const version = row.current_quote_version;
  const generatedAt = row.current_quote_generated_at;
  const expiresAt = row.current_quote_expires_at;

  switch (state) {
    case "archived":
      return {
        dot: "grey",
        tone: "muted",
        headline: version !== null ? `Quote v${version} kept` : "No quote yet",
        qualifier: "Hidden from your queue only",
      };

    case "no_deal_link":
      return {
        dot: "red",
        tone: "red",
        headline: "No Pipedrive deal linked",
        qualifier: "No quote can be generated",
      };

    case "proposal_just_generated":
      return {
        dot: "green",
        tone: "ink",
        headline: `Quote v${version} · current`,
        qualifier: `Generated today${expiresAt ? ` · ${formatExpiryQualifier(expiresAt, nowIso)}` : ""}`,
      };

    case "line_items_drifted":
      return {
        dot: "amber",
        tone: "amber",
        headline: `Quote v${version} · out of date`,
        qualifier:
          `Generated ${generatedAt ? formatDayLabel(generatedAt, nowIso, timeZone) : "—"} · ` +
          pluralLines(row.line_item_drift_count),
      };

    case "quote_expired":
      return {
        dot: "amber",
        tone: "amber",
        headline: `Quote v${version} · ${expiresAt ? formatExpiryQualifier(expiresAt, nowIso) : "expired"}`,
        qualifier: `Generated ${generatedAt ? formatDayLabel(generatedAt, nowIso, timeZone) : "—"} · deal still open`,
      };

    case "quote_current":
      return {
        dot: "green",
        tone: "ink",
        headline: `Quote v${version} · current`,
        qualifier:
          `Generated ${generatedAt ? formatDayLabel(generatedAt, nowIso, timeZone) : "—"}` +
          (expiresAt ? ` · ${formatExpiryQualifier(expiresAt, nowIso)}` : ""),
      };

    case "deal_zero_line_items":
      return {
        dot: "grey",
        tone: "ink",
        headline: "No quote yet",
        qualifier: "Deal has 0 line items",
      };

    case "no_quote_yet":
      return {
        dot: "grey",
        tone: "ink",
        headline: "No quote yet",
        qualifier:
          row.deal_line_item_count === null
            ? "Pipedrive not yet read"
            : `Deal has ${row.deal_line_item_count} line item${row.deal_line_item_count === 1 ? "" : "s"}`,
      };
  }
}

// Card-level border treatment. Only four of the eight states get one; the
// rest are a plain card (proposal_just_generated / line_items_drifted signal
// through their top strip instead, not a border).
export function cardBorder(state: ProjectRowState): CardBorder {
  switch (state) {
    case "no_deal_link":
      return "red-2";
    case "quote_expired":
      return "amber-2";
    case "archived":
      return "dashed";
    default:
      return "default";
  }
}

// The green / amber banner inside the card, above the identity line. Null for
// every state except the two the spec calls out. `justGenerated` is defined
// in rows.ts as generated_by === viewerId, so "by you" needs no viewerId
// check here — the state cannot exist unless it is true.
export function topStripCopy(
  row: ProjectQueueRow,
  nowIso: string,
  timeZone?: string,
): { tone: StripTone; text: string } | null {
  if (row.row_state === "proposal_just_generated" && row.current_quote_generated_at) {
    const when = formatDayAndClock(row.current_quote_generated_at, nowIso, timeZone);
    return {
      tone: "green",
      text: `✓ Project Proposal v${row.current_quote_version} generated ${when} by you · Ready to download and send`,
    };
  }

  if (row.row_state === "line_items_drifted") {
    const version = row.current_quote_version;
    const changedPhrase = row.deal_line_items_changed_at
      ? `changed ${formatDayLabel(row.deal_line_items_changed_at, nowIso, timeZone)}, after`
      : "have changed since";
    return {
      tone: "amber",
      text: `Pipedrive line items ${changedPhrase} Quote v${version} was generated · v${version} no longer matches the deal`,
    };
  }

  return null;
}

// The grey strip an archived row shows in place of the top strip, plus the
// "by you" / "by <name>" attribution the design's copy depends on.
export function archivedStripText(
  row: ProjectQueueRow,
  viewerId: string,
  nowIso: string,
  timeZone?: string,
): string | null {
  if (row.row_state !== "archived" || !row.internal_archived_at) return null;
  const who = row.internal_archived_by === viewerId ? "you" : (row.internal_archived_by_name ?? "someone");
  return `Archived ${formatDayAndClock(row.internal_archived_at, nowIso, timeZone)} by ${who} · nothing was deleted`;
}

// Two cases render "Value unavailable" instead of a number, and neither may
// ever fall back to formatting `?? 0` as a dollar figure — that would print a
// fabricated zero exactly where acceptance check 9 requires either a real
// last-known value or an explicit "unavailable", never a number that looks
// like data but isn't:
//   - no_deal_link: there is no Pipedrive deal to have a value at all. The
//     portal's own list price is deliberately not substituted (types.ts on
//     portal_list_price_usd) — a different source disagreeing with the
//     row's own state would be worse than blank.
//   - pipedrive_deal_value === null on a LINKED deal: the cache has never
//     completed one successful read for it (distinct from a read that
//     succeeded before and is merely stale now, which always leaves a
//     non-null last-known value per ADR 0113 and renders normally, with the
//     "Pipedrive unreachable" chip carrying the staleness separately).
// Null means "format the number normally".
export function valueCellText(row: ProjectQueueRow): string | null {
  if (row.row_state === "no_deal_link") return "Value unavailable";
  if (row.pipedrive_deal_value === null) return "Value unavailable";
  return null;
}

export function productsSourceChip(source: ProductsSource): { label: string; dashed: boolean } {
  return source === "quoted" ? { label: "Quoted", dashed: false } : { label: "Recommended", dashed: true };
}

const DEAL_STATUS_LABEL: Record<PipedriveDealStatus, string> = {
  open: "Open",
  won: "Won",
  lost: "Lost",
  deleted: "Deleted",
};

export function formatDealStatusLabel(status: PipedriveDealStatus | null): string {
  return status ? DEAL_STATUS_LABEL[status] : "Not linked";
}
