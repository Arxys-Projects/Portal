// The By-partner grouping for /projects — the same queue, grouped by partner
// company instead of by recency.
//
// This is the old Partner Pipeline page's job, folded into /projects as a view
// toggle: same rows, same filters, same single search box, one grouping swapped
// for another. So the group totals keep the semantics that page already had,
// which its own footnote states out loud: "Open pipeline is the straight sum of
// open-deal list prices (ADR 0081)". That is the PORTAL list price on the
// project's representative submission, deliberately not the cached Pipedrive
// deal value the individual row cells show — the two are different numbers from
// different sources, and Band C is where the Pipedrive figure appears.
//
// Pure. No Supabase, no framework.

import type { ProjectQueueRow } from "./types";

export type PartnerProjectGroup = {
  // The normalised company-name bucket key, matching forecast.ts's company_key
  // (ADR 0099 — keyed on the NAME, because `partners` holds one row per person
  // and keying on the id gave one box per contact).
  company_key: string;
  company_name: string;
  // Group header: "0 projects · 0 contacts".
  project_count: number;
  contact_count: number;
  // Warning pills: "1 quote expired", "1 project has no deal link".
  expired_quote_count: number;
  missing_deal_link_count: number;
  // Right-aligned OPEN PIPELINE and WON totals — portal list prices (ADR 0081).
  open_pipeline_usd: number;
  won_usd: number;
  // The group's rows, order preserved from the input, so the queue's default
  // most-recently-active sort still holds inside each group.
  rows: ProjectQueueRow[];
};

// Group the queue's rows by partner company.
//
// Takes rows the caller has ALREADY filtered — the view toggle is a grouping, not
// a different query, so search, the status chips and the archived chip must apply
// identically in both views. Groups are ordered by open pipeline descending, then
// by company name, so the biggest number is at the top and ties are stable.
export function groupProjectRowsByPartner(rows: ProjectQueueRow[]): PartnerProjectGroup[] {
  const groups = new Map<string, PartnerProjectGroup & { contacts: Set<string> }>();

  for (const row of rows) {
    // The row carries the resolved display name; the key is its normalised form,
    // derived the same way forecast.ts derives company_key so the two views
    // bucket identically.
    const key = row.partner_company_name.trim().toLowerCase();
    let group = groups.get(key);
    if (!group) {
      group = {
        company_key: key,
        company_name: row.partner_company_name,
        project_count: 0,
        contact_count: 0,
        expired_quote_count: 0,
        missing_deal_link_count: 0,
        open_pipeline_usd: 0,
        won_usd: 0,
        rows: [],
        contacts: new Set<string>(),
      };
      groups.set(key, group);
    }

    group.rows.push(row);
    group.project_count += 1;
    // A free-typed on-behalf-of company has no portal identity and so no contact
    // to name (forecast.ts returns null for it); those projects count toward the
    // project total and not the contact total.
    if (row.partner_contact_name) group.contacts.add(row.partner_contact_name);
    if (row.is_expired) group.expired_quote_count += 1;
    if (row.deal_link_state === "missing") group.missing_deal_link_count += 1;

    const value = row.portal_list_price_usd ?? 0;
    if (row.portal_status === "open") group.open_pipeline_usd += value;
    else if (row.portal_status === "won") group.won_usd += value;
    // Lost contributes to neither (ADR 0081).
  }

  return Array.from(groups.values())
    .map(({ contacts, ...group }) => ({ ...group, contact_count: contacts.size }))
    .sort((a, b) =>
      b.open_pipeline_usd !== a.open_pipeline_usd
        ? b.open_pipeline_usd - a.open_pipeline_usd
        : a.company_name.localeCompare(b.company_name),
    );
}
