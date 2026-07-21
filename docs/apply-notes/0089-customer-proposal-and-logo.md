# Apply note — ADR 0089 (Customer Proposal + partner logo)

Stop-and-flag migrations for Andy to apply. The agent holds no DDL credentials
(2026-07-17 CLI 401); apply each via the Supabase **dashboard SQL editor**. The
CLI never auto-applies these (rollbacks live in `supabase/rollback/`, outside
`supabase/migrations/`). None touch existing rows.

Until these are applied the feature degrades quietly: the Customer Proposal
route returns 404 for partners (same as the Project Quote), and the logo column
is read best-effort so the admin/partners page and the dashboard keep working
with no logo shown.

## Order

### 0. Prerequisite (separate approval — ADR 0083)

`supabase/migrations/20260720000001_project_quotes_partner_select.sql`
— widens the `project_quotes` SELECT policy to the owning partner. **Required
for partner visibility of EITHER document** (Project Quote and Customer
Proposal). This is the ADR 0083 gate; if it is not yet applied, apply it under
that ADR's review. Rollback: `supabase/rollback/project-quotes-partner-select-rollback.sql`.

### 1. Migration A — logo_path column

`supabase/migrations/20260721000001_partners_logo_path.sql`
— adds nullable `partners.logo_path`. Column-only, additive.
Rollback: `supabase/rollback/partners-logo-path-rollback.sql`.

### 2. Migration B — partner-logos Storage bucket

`supabase/migrations/20260721000002_partner_logos_bucket.sql`
— creates the public-read / admin-write `partner-logos` bucket and its
`storage.objects` policies. **First Storage bucket in this project** — confirm
the public-read model is still what you want before applying (logos are not
secret; the dashboard `<img>` and PDF fetch both rely on public read).
Rollback: `supabase/rollback/partner-logos-bucket-rollback.sql`
(⚠ delete any uploaded objects first — a bucket with objects will not drop).

No snapshot MSRP-freeze migration is needed: MSRP is already stored per line in
the snapshot (Task 0 finding — see ADR 0089 implementation notes).

## Verify after applying

1. `RUN_0083_TESTS=1 npx tsx scripts/test-rls.ts` — tests 20a–20g pass
   (owner-positive, cross-partner-negative, on-behalf-positive for the Project
   Quote **and** the Customer Proposal; INSERT still blocked).
2. Admin → Partners: upload a PNG/JPG logo for a partner; the thumbnail appears;
   a non-image is rejected with a clear message.
3. As that partner: My Pipeline shows **Project Quote** + **Customer Proposal**
   per revision. Download both — the logo renders centered in the header of
   each; the Customer Proposal shows no discount/partner columns, no DEAL cell,
   no Terms page, and "All amounts in USD."
4. Cross-partner: a different partner cannot download either document for a
   submission they do not own (404).
5. The partner's own dashboard shows their logo next to "Welcome back"; internal
   / admin dashboards do not.
