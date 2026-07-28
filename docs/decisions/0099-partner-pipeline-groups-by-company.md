# 0099 — Partner Pipeline groups by company, not by person

- **Status**: Accepted
- **Date**: 2026-07-28

## Context

`partners` holds one row per **person**, not per company: 80 rows across 34 distinct
`company_name` values. JCT Solutions alone has 14 person rows, TRL Sytems 7, RLS Test Co A 9,
Intelli-tec 5.

`groupIntoDeals` keyed each deal bucket on `partners.id`, and the grouped admin view then keyed
its boxes on that. So the Partner Pipeline rendered **one box per contact** — but the header
printed only `company_name`. The result was five identically-labelled "JCT Solutions" boxes with
nothing on screen to distinguish them, scattered non-adjacently down the page because the group
list was in Map insertion order (submission recency) with no sort at all. `contact_name`, the one
field that differed, was already on the row and never rendered.

Two consequences beyond the confusion: a company's real pipeline was unknowable (JCT's
$1,544,706 was spread across boxes with no subtotal anywhere), and the same project filed by two
different reps at one company could never be recognised as the same deal.

Andy's stated model for this surface is **Partner Company → Project Name**, with the individual
contact "less relevant in this view because that's not how we or they look up projects."

## Options considered

- **Show `contact_name` in the box header.** One line, removes the mystery — but leaves 14 boxes
  and still no company subtotal. Makes an unwanted structure tolerable instead of fixing it.
- **Sort the groups so a company's boxes are adjacent.** Also trivial, also cosmetic.
- **Group by `company_id` via a new `companies` table with a `partners.company_id` FK.** The
  structurally correct answer; needs a migration, a backfill, and a decision on every ambiguous
  name. Too much for the problem at hand.
- **Group by normalised `company_name`, move the contact onto the project row.** No migration.
  Merges case and whitespace variants; leaves genuinely ambiguous names to be reconciled in the
  partner records.

## Decision

Bucket deals on `lower(trim(company name))` — resolved from the on-behalf target when set, else
the creator — falling back to the partner id when no name resolves. `Deal.partner_id` /
`partner_name` are renamed to `company_key` / `company_name` so a company key is never mistaken
for a `partners.id`, and a new `Deal.contact_name` carries the representative row's contact for
display only. The grouped view shows one box per company with `N projects · M contacts`, the
contact on each project row, and groups sorted alphabetically (live deals before lost within a
company) because this view is used to **look a project up**, not to rank by value.

The contact is resolved from the **representative** submission and must belong to the bucket's
company: for a free-typed on-behalf company it is `null`, never the internal Arxys rep who filed
it. (A test caught exactly that mislabelling during implementation.)

The id fallback is load-bearing: the partner-facing callers (`/dashboard`, `/submissions`) pass
`partners: []`, so nothing resolves to a name and every row buckets by its own `partner_id`
exactly as before. A single partner's own view is unchanged by this ADR.

## Consequences

**Positive:** 26 boxes → 13 against production data, each with a real company subtotal. Same
project filed by two reps at one company now collapses into one deal instead of two. Alphabetical
order makes lookup predictable. The XLSX export inherits all of it (its "Partner" column became
"Partner Company" plus a new "Contact" column). **Open Pipeline does not move** — measured at
$8,110,095 before and after, and deal count is unchanged at 68, because no project name is
currently filed by two different people at the same company. The earlier concern that this would
silently change the headline number was unfounded, and it was worth measuring rather than
assuming.

**Negative:** grouping on a free-typed string is only as good as the data. Case and whitespace
variants merge; suffix and abbreviation variants do not. Live examples: `TRL` and
`TRL Sytems, inc.` remain two boxes and are probably one company; `Digital Provisions` vs
`Digital Provisions Inc` would split if both had submissions. Genuinely distinct regional
entities (`LONG Building Technologies, inc. - AK` vs `- ID`) correctly stay apart, so this is not
purely a defect. Fixing the rest means editing partner records, and nothing in the UI signals
that two boxes *ought* to be one. A merged deal also shows only the representative row's contact,
not everyone who filed into it.

**When to revisit:** if name collisions need resolving faster than they can be cleaned up by
hand, or partner-record editing proves too blunt, promote companies to their own table with a
`partners.company_id` FK and group on that — the option deliberately deferred here.
