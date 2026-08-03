// Display formatting for /projects. Pure — no Supabase, no framework — so it
// runs under plain Node in format.test.ts. Every "is this today" question here
// takes `nowIso` as an explicit argument rather than calling `new Date()`,
// because the board is a client component hydrated from server-rendered
// props: computing "now" independently on each side risks a hydration
// mismatch (and a silent one, right at a midnight boundary). The server page
// stamps one `nowIso` and every relative display on the page reads from it.
//
// Two different "today" questions get two different answers, deliberately:
//   - A clock timestamp (read_at, created_at, archived_at, generated_at) is
//     shown with a time of day ("at 9:42 AM"), so "today" has to mean the
//     VIEWER'S LOCAL calendar day — anything else would print a time and a
//     day that disagree with each other.
//   - `current_quote_expires_at` is a UTC calendar date with no time
//     component at all (projectQuoteExpiryIso derives it that way, ADR 0061),
//     so its arithmetic stays in UTC rather than mixing in a local offset it
//     was never computed against.

const LOCALE = "en-US";

export function formatUsd0(amount: number): string {
  return `$${Math.round(amount).toLocaleString(LOCALE)}`;
}

function pluralDays(n: number): string {
  return `${n} day${n === 1 ? "" : "s"}`;
}

// ---------------------------------------------------------------------------
// Local-calendar-day timestamps ("Read today at 9:42 AM" / "Read 14 Jul at
// 9:42 AM").
//
// Every function here takes an optional trailing IANA `timeZone`, defaulting
// to `undefined` (the runtime's own local zone — the browser's, when this
// runs client-side, which is the correct behavior: a viewer's "today" is
// their own wall clock, not a server's). format.test.ts is the one caller
// that ever passes an explicit zone, pinning it to "UTC" so the suite is
// deterministic regardless of which machine runs it.
// ---------------------------------------------------------------------------

function ymdInZone(iso: string, timeZone?: string): string {
  // en-CA formats as YYYY-MM-DD, which sorts and compares the way it reads.
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

export function isSameLocalDay(aIso: string, bIso: string, timeZone?: string): boolean {
  return ymdInZone(aIso, timeZone) === ymdInZone(bIso, timeZone);
}

// "today" or "14 Jul" — the day half of a clock timestamp, judged against the
// viewer's local calendar day. Day-then-month order is forced explicitly
// (matching the spec's "00 Mon" placeholder) rather than left to the locale's
// own ordering — en-US's Intl output ("Jul 14") reads month-first.
export function formatDayLabel(iso: string, nowIso: string, timeZone?: string): string {
  if (isSameLocalDay(iso, nowIso, timeZone)) return "today";
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat(LOCALE, { day: "numeric", timeZone }).format(d);
  const month = new Intl.DateTimeFormat(LOCALE, { month: "short", timeZone }).format(d);
  return `${day} ${month}`;
}

export function formatClockTime(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(LOCALE, { hour: "numeric", minute: "2-digit", timeZone }).format(
    new Date(iso),
  );
}

// "today at 9:42 AM" / "14 Jul at 9:42 AM" — the shared shape behind "Read …",
// "Created …", "Archived …". Callers prepend their own verb/lead-in.
export function formatDayAndClock(iso: string, nowIso: string, timeZone?: string): string {
  return `${formatDayLabel(iso, nowIso, timeZone)} at ${formatClockTime(iso, timeZone)}`;
}

// ---------------------------------------------------------------------------
// UTC-calendar-date expiry arithmetic.
// ---------------------------------------------------------------------------

function utcMidnight(iso: string): number {
  const d = new Date(iso);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// Whole days from "now" (its UTC calendar day) to `dateIso` (a YYYY-MM-DD UTC
// calendar date). Positive = in the future, negative = in the past.
export function daysUntilUtc(dateIso: string, nowIso: string): number {
  const target = Date.parse(`${dateIso}T00:00:00Z`);
  const today = utcMidnight(nowIso);
  return Math.round((target - today) / 86_400_000);
}

// "expires in 5 days" / "expires today" / "expired 5 days ago". Driven purely
// by the calendar arithmetic (not by the row's `is_expired` flag), so it stays
// honest even in the one case they can disagree: a quote whose calendar date
// has passed on a deal that is no longer open, which `is_expired` deliberately
// excludes (ADR 0113 — "true only when the deal is open") but which is still,
// factually, a past date.
export function formatExpiryQualifier(expiresAtIso: string, nowIso: string): string {
  const days = daysUntilUtc(expiresAtIso, nowIso);
  if (days > 0) return `expires in ${pluralDays(days)}`;
  if (days === 0) return "expires today";
  return `expired ${pluralDays(Math.abs(days))} ago`;
}
