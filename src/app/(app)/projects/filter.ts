// Filter/search state for /projects. Pure — no Supabase, no framework — so it
// runs under plain Node in filter.test.ts.
//
// "All filters, the query and the view live in the URL query string" (the
// spec's own words) and the row set is single-digit-partner / double-digit-
// submission scale (queue.ts), so every filter here runs client-side, in
// memory, against the full row set the server already loaded — there is no
// per-keystroke round trip. This module is the shared logic between the board
// component (which owns the state) and its tests; the board itself only
// wires this to React state and the URL bar.

import type { ProjectAttention, ProjectPortalStatus, ProjectQueueRow } from "@/lib/projects/types";

export type ProjectsView = "recent" | "partner";
export type AttentionFilter = "needs_price_update" | "missing_link" | null;

export type ProjectsFilterState = {
  q: string;
  // "Projects I created" — default ON. Absence of the URL param means the
  // default (true); an explicit `mine=0` is how "cleared" survives a reload,
  // since an absent param can't be told apart from "never set" otherwise.
  mine: boolean;
  status: ProjectPortalStatus | null; // null = the Open/Won/Lost chips are all off
  archived: boolean;
  view: ProjectsView;
  attention: AttentionFilter;
};

export const DEFAULT_FILTERS: ProjectsFilterState = {
  q: "",
  mine: true,
  status: null,
  archived: false,
  view: "recent",
  attention: null,
};

function readStatus(v: string | null): ProjectPortalStatus | null {
  return v === "open" || v === "won" || v === "lost" ? v : null;
}

function readAttention(v: string | null): AttentionFilter {
  return v === "needs_price_update" || v === "missing_link" ? v : null;
}

// Reads filter state from a key→value getter, so the same logic serves the
// server page (an awaited Next.js searchParams object) and the client board
// (a URLSearchParams over window.location.search) without either depending on
// the other's shape.
export function parseFilters(get: (key: string) => string | null): ProjectsFilterState {
  const mineParam = get("mine");
  return {
    q: get("q") ?? "",
    mine: mineParam === "0" ? false : true,
    status: readStatus(get("status")),
    archived: get("archived") === "1",
    view: get("view") === "partner" ? "partner" : "recent",
    attention: readAttention(get("attention")),
  };
}

export function parseFiltersFromRecord(
  raw: Record<string, string | string[] | undefined>,
): ProjectsFilterState {
  return parseFilters((key) => {
    const v = raw[key];
    return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
  });
}

export function parseFiltersFromSearch(search: string): ProjectsFilterState {
  const params = new URLSearchParams(search);
  return parseFilters((key) => params.get(key));
}

// The inverse of parseFilters: only ever called client-side to keep the URL
// bar in sync via history.replaceState. Omits every param at its default so
// the URL stays short when nothing is customized.
export function filtersToSearch(filters: ProjectsFilterState): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (!filters.mine) params.set("mine", "0");
  if (filters.status) params.set("status", filters.status);
  if (filters.archived) params.set("archived", "1");
  if (filters.view === "partner") params.set("view", "partner");
  if (filters.attention) params.set("attention", filters.attention);
  const s = params.toString();
  return s ? `?${s}` : "";
}

// ---------------------------------------------------------------------------
// Search matching
// ---------------------------------------------------------------------------

export function matchesQuery(
  row: Pick<ProjectQueueRow, "project_name" | "partner_company_name">,
  q: string,
): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (
    (row.project_name ?? "").toLowerCase().includes(needle) ||
    row.partner_company_name.toLowerCase().includes(needle)
  );
}

export type TextSegment = { text: string; match: boolean };

// Splits `text` into segments so the caller can render matched substrings
// amber and the rest plain. Every case-insensitive occurrence of `query` is
// marked, not just the first — a query like "a" against "Appliance" should
// mark both a's consistently rather than picking one arbitrarily.
export function highlightSegments(text: string, query: string): TextSegment[] {
  const needle = query.trim();
  if (!needle) return [{ text, match: false }];

  const haystack = text.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const segments: TextSegment[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const idx = haystack.indexOf(lowerNeedle, cursor);
    if (idx === -1) {
      segments.push({ text: text.slice(cursor), match: false });
      break;
    }
    if (idx > cursor) segments.push({ text: text.slice(cursor, idx), match: false });
    segments.push({ text: text.slice(idx, idx + needle.length), match: true });
    cursor = idx + needle.length;
  }
  return segments;
}

// ---------------------------------------------------------------------------
// Row filtering
// ---------------------------------------------------------------------------

export type AttentionIdSets = {
  needsPriceUpdate: Set<string>;
  missingLink: Set<string>;
};

export function attentionIdSets(attention: ProjectAttention): AttentionIdSets {
  return {
    needsPriceUpdate: new Set(attention.needs_price_update_submission_ids),
    missingLink: new Set(attention.missing_deal_link_submission_ids),
  };
}

// Every non-search filter: archived visibility, "mine", status, and the Band B
// attention shortcut. Search is applied separately (applyFilters) so the
// "N archived project(s) also match" strip can reuse this same scoped set
// without the query narrowing it first.
export function applyNonSearchFilters(
  rows: ProjectQueueRow[],
  filters: ProjectsFilterState,
  viewerName: string | null,
  attention: AttentionIdSets,
): ProjectQueueRow[] {
  return rows.filter((row) => {
    if (!filters.archived && row.internal_archived_at !== null) return false;
    if (filters.mine && row.created_by_user_name !== viewerName) return false;
    if (filters.status && row.portal_status !== filters.status) return false;
    if (filters.attention === "needs_price_update" && !attention.needsPriceUpdate.has(row.submission_id)) {
      return false;
    }
    if (filters.attention === "missing_link" && !attention.missingLink.has(row.submission_id)) {
      return false;
    }
    return true;
  });
}

export function applyFilters(
  rows: ProjectQueueRow[],
  filters: ProjectsFilterState,
  viewerName: string | null,
  attention: AttentionIdSets,
): ProjectQueueRow[] {
  const scoped = applyNonSearchFilters(rows, filters, viewerName, attention);
  if (!filters.q.trim()) return scoped;
  return scoped.filter((row) => matchesQuery(row, filters.q));
}

// The "1 archived project also matches" strip: archived rows that would
// satisfy every OTHER active filter (mine/status/attention) and the search
// query, but are hidden purely because the archived chip is off.
export function archivedMatches(
  rows: ProjectQueueRow[],
  filters: ProjectsFilterState,
  viewerName: string | null,
  attention: AttentionIdSets,
): ProjectQueueRow[] {
  if (filters.archived || !filters.q.trim()) return [];
  const withArchived = applyNonSearchFilters(
    rows,
    { ...filters, archived: true },
    viewerName,
    attention,
  );
  return withArchived.filter(
    (row) => row.internal_archived_at !== null && matchesQuery(row, filters.q),
  );
}

// ---------------------------------------------------------------------------
// "No project matches" empty state — closest match by plain Levenshtein
// distance. Small, unpaginated candidate lists (single-digit-partner scale),
// so an O(n * len^2) distance is cheap enough not to need anything smarter.
// ---------------------------------------------------------------------------

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

export function closestMatch(query: string, candidates: string[]): string | null {
  const needle = query.trim().toLowerCase();
  const pool = candidates.filter((c) => c.trim().length > 0);
  if (!needle || pool.length === 0) return null;

  let best: string | null = null;
  let bestDistance = Infinity;
  for (const candidate of pool) {
    const distance = levenshtein(needle, candidate.toLowerCase());
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}
