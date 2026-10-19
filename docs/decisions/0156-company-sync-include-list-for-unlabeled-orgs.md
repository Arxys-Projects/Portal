# 0156 — A portal-side include list brings unlabeled orgs into the company sync

- **Status**: Accepted (decided by Andy 2026-10-16; migration 20261016000006 applied and verified 2026-10-16)
- **Date**: 2026-10-16
- **Related**: 0153 (companies are labeled Pipedrive orgs, keyed by org id)

## Context

The company sync takes Pipedrive orgs labeled "Arxys Security Partner" (0153). That label also
drives partner emails. Relativity Space is wanted as a company for projects but is not a partner,
so it must never carry the label. LiquidPC and NCD Communications are labeled and need nothing.

## Options considered

- **Label Relativity Space anyway.** It would get partner emails. Rejected.
- **A second Pipedrive label the sync also accepts.** Keeps Pipedrive the single authority, but adds
  a label to Pipedrive and depends on the email automation keying only on the partner label. Andy
  chose not to change Pipedrive.
- **Hard-code the org id in the sync.** Needs a deploy to change and hides the reason. Rejected.
- **A portal-side table of extra org ids.** A small migration; the list and its reasons live in one
  place the sync reads.

## Decision

`company_sync_includes` (`pipedrive_org_id` primary key, required plain-language `reason`,
`added_by`, `added_at`). The sync treats an org as a company when it carries the label **or** its id
is on the list. Admins add and remove rows; internal users can read them; partners get nothing.
Removing a row makes the next sync mark the company inactive, never delete it. No row is seeded:
Relativity Space has three org versions, and Andy adds the one he picks.

## Consequences

**Positive:** no Pipedrive change and no partner emails to non-partners. The reason for each
exception is stored next to it.

**Negative:** company membership now has two sources, the Pipedrive label and this table. Someone
looking only at Pipedrive won't see why Relativity Space is a portal company.

**When to revisit:** if the list grows past a handful of orgs (a "direct customer" label in Pipedrive
would then be cheaper to maintain), or if portal features need to tell partners and direct customers
apart (then record the source on `companies`).
