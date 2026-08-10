// The one place the Pipedrive deal URL is composed.
//
// The same `https://app.pipedrive.com/deal/{id}` string is currently hand-written
// in three components (admin/submissions/_components/partner-group-view.tsx twice
// and _components/submission-detail.tsx). /projects needs it per row and returns
// it as a data-contract field (`pipedrive_deal_url`), so it belongs in a function
// rather than a fourth literal. Those three call sites are left alone
// deliberately — retrofitting them is a tidy-up, not part of this work.
//
// No framework or env imports, so this is safe in both bundles and directly
// unit-testable. The host is not configurable: Arxys is on the shared
// app.pipedrive.com domain, which resolves the deal to whichever company the
// signed-in session belongs to, so there is no per-tenant subdomain to thread
// through.

export function pipedriveDealUrl(dealId: number | string | null | undefined): string | null {
  if (dealId === null || dealId === undefined) return null;
  const id = typeof dealId === "number" ? dealId : Number(dealId);
  if (!Number.isFinite(id) || !Number.isInteger(id) || id <= 0) return null;
  return `https://app.pipedrive.com/deal/${id}`;
}

// ADR 0119 — the shared `window.open()`/`target` name every Pipedrive deal
// link uses, so opening a second (or fifth) deal from the portal reuses and
// refocuses one browser tab instead of piling up a new one per click. This
// works because same-named targets are resolved by the BROWSING CONTEXT that
// opens them: every render site in the same portal tab shares this one
// constant, so they all resolve to the same target and reuse each other's
// tab. Opening links from two separately-opened portal tabs still produces
// two Pipedrive tabs — each originating tab tracks its own target-name
// registry, and there's no cross-tab signal to unify them. `rel="noreferrer"`
// (not `"noopener noreferrer"`) is deliberate: `noopener` forces the new
// context to never share a name with its opener, which breaks the reuse this
// exists for. `noreferrer` alone keeps the same referrer-stripping privacy
// property without that side effect. Verified live against production
// Pipedrive (deals #5246/#5122) on 2026-08-10 — see ADR 0119.
export const PIPEDRIVE_WINDOW_TARGET = "arxysPipedrive";
