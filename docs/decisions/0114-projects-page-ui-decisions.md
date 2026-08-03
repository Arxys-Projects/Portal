# 0114 — `/projects` page-layer decisions

- **Status**: Accepted
- **Date**: 2026-08-03
- **Related**: phase 2 of the `/projects` build, sitting on top of [0112](./0112-internal-project-archive-is-a-side-table.md) and
  [0113](./0113-pipedrive-reads-are-cached-with-a-last-known-fallback.md); reads on 0067 / 0075 (the
  portal design system this page extends rather than forks)

## Context

Phase 1 shipped the schema and query layer: `row_state`, `available_actions`, and every field in the
data contract. Phase 2 is the page — a design spec with six reference screenshots, nine acceptance
checks, and a fixed data contract that is explicitly not to be re-derived. Most of the work was
mechanical (switch on `row_state`, print labels verbatim). A handful of things the spec and the
contract leave genuinely open needed a decision, and this ADR records them so the next session does
not have to reconstruct the reasoning from the diff.

## Decisions

**The internal nav strip (screenshot 2c) is global chrome, added to `(app)/layout.tsx`, not something
`/projects` renders for itself.** SALES is the only link that points at `/projects`, so if the strip
only rendered on `/projects` there would be no way to navigate there in the first place — a
chicken-and-egg dead end. Gated on the same `isAdminOrInternal` the page itself gates on (not
`is_internal` alone), so the nav and the route agree about who can reach it: RLS on both new tables
is `is_internal OR is_admin`, and an admin who is not separately flagged internal should not get a
link to a page that then 404s them, or vice versa.

**"Projects I created" matches on `created_by_user_name`, a display name, not an id.** The data
contract has no creator-id field — deliberately; `types.ts` says outright "created_by drives the
filter chip, not a column." The only field available for comparison is the name, so the page
resolves the viewer's own `contact_name` server-side once and filters `row.created_by_user_name ===
viewerName`. Fragile in principle (two internal users could someday share a display name); harmless
today with exactly one internal user. Revisit if the contract ever grows an id.

**Action-slot widths are CSS `min-width`, not a hard cap.** The spec's "Actions: 620px, right-aligned"
and acceptance check 1 ("the primary action button starts at the same x on every row; nothing clips
or wraps") pull against each other the instant label lengths differ ("Retry Pipedrive link" vs "New
Project Proposal v4" vs "Add line items ↗"). A fixed `width` on each slot would satisfy the alignment
half and risk the clipping half; `min-width` satisfies both — every slot floors at a size sized for
the design's ordinary labels, and only grows past that floor (pushing the row very slightly wider,
never clipping or overlapping) for a label long enough to need it. Icon slots (Open project, the
`···` archive menu) stay in the DOM even when inert — an archived row has no `···` menu — rather than
being omitted, for the same reason `Button.tsx`'s own docstring already gives: "so rows don't
visually jump" (ADR 0067, Decision 2).

**The Generate dialog's live line-item preview is a new, read-only server action
(`previewDealForGenerateAction`), not a reuse of `assembleProjectQuoteSnapshot`.** The dialog's whole
point (the spec calls it "the trust loop") is showing the exact lines the PDF will contain before a
version number is burned. `getDealForQuote(dealId)` already does exactly this with no side effects,
so the action is a thin wrapper: gate, call, map errors to copy, return. If the preview fails to load,
Generate is disabled in the dialog — the real generate path re-reads the deal itself and has its own
`empty_deal` guard, so this can only ever fail closed, never let a blind commit through.

**"Calculator submission (PDF)" always targets the row's own `submission_id` (the representative),
never `available_actions.download`'s `proposal_submission_id`.** `DownloadAction`'s
`download_submission_only` variant carries no id at all — the type is explicit that the page already
knows which submission to ask for. The Project Proposal side of the split menu targets whichever
submission actually owns the frozen quote (which can be an older revision, per ADR 0113's "known
wrinkle"); the calculator submission side is about *today's* sizing inputs, which live on the
representative regardless of where the quote was generated from.

**Filtering, search, and the view toggle run entirely client-side against the already-loaded row set,
with the URL kept in sync via the plain History API, not `next/navigation`'s router.** `queue.ts`'s
own scale note (single-digit-partner, double-digit-submission) makes this cheap, and the spec's
"Search is the primary control" with per-keystroke amber highlighting would read as laggy over a
server round trip. `router.replace`/`push` risk an RSC refetch on every keystroke depending on Next's
navigation caching; `history.replaceState` categorically cannot, so a hard reload (which re-enters
through `page.tsx`, parsing the same params server-side) is the only path that ever touches the
server for a filter change. The Refresh control and every mutation are genuine `router.refresh()`
calls, deliberately, because those need a real server round trip.

**The "Quotes · 30 days" tile's click is a best-effort filter, not an exact-count guarantee.**
`totals.quotes_last_30_days` counts *quotes generated* in the window (a project with two proposals in
30 days counts twice); a row shows only its *current* quote. Clicking the tile filters to rows whose
current quote's `generated_at` falls in the window, which can legitimately show fewer rows than the
tile's own number on a project that generated more than once recently. This mismatch is a property of
the metric the query layer already defines, not a bug introduced here, and is not worth a second
metric just to make one click target arithmetically exact.

**`valueCellText` covers a second case beyond `no_deal_link`: a *linked* deal whose
`pipedrive_deal_value` is `null` because it has never been read even once.** The original phase-1
handoff calls out `no_deal_link` as the value cell's one special case, but acceptance check 9 ("never
blanks or zeros") is about more than that one state — a brand-new deal link with no cache row yet
would otherwise render `formatUsd0(null ?? 0)` as `$0`, a fabricated number masquerading as data. Both
cases now render "Value unavailable"; a deal that was read successfully before and has since gone
stale keeps its real last-known figure and gets the separate "Pipedrive unreachable" chip instead —
those are different situations and the page no longer conflates them.

## Consequences

**Positive:** the page never makes a Pipedrive call on ordinary interaction (search, filter, view
toggle), matching queue.ts's own "zero calls on a plain load" property one layer up. Every non-obvious
choice above is either a small, isolated pure function (covered by `format.test.ts`, `filter.test.ts`,
`row-copy.test.ts`) or a one-line gate, so none of this logic is locked inside JSX where it would be
expensive to re-derive.

**Negative:** the "Projects I created" chip and the Quotes·30-days tile both carry a documented,
accepted imprecision (name-matching; count-vs-projects mismatch) rather than a schema change to fix
them outright — the right call at one internal user and a small dataset, worth revisiting only if
either stops being true.

**When to revisit:** a second internal user (the name-matching chip needs an id), Pipedrive shipping a
dependable per-line change timestamp (already flagged in ADR 0113, unrelated to this page), or the
"Quotes · 30 days" tile becoming something people rely on for an exact number rather than a shortcut
into the queue.
