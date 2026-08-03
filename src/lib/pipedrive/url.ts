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
