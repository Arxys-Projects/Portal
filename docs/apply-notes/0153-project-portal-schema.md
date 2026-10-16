# Apply note — Project Portal schema, Step 1 (ADRs 0153, 0154, 0155)

> **Not applied yet.** Written 2026-10-16. Andy applies these by hand in the Supabase dashboard
> SQL editor. Not `supabase db push`: several migrations on this project were applied by hand and
> are missing from the remote history.

| Order | Forward | Rollback | Decision |
|---|---|---|---|
| 1 | `supabase/migrations/20261016000002_project_companies_contacts.sql` | `supabase/rollback/project-companies-contacts-rollback.sql` | [0153](../decisions/0153-project-companies-contacts-and-project-link-tables.md) |
| 2 | `supabase/migrations/20261016000003_projects.sql` | `supabase/rollback/projects-rollback.sql` | [0153](../decisions/0153-project-companies-contacts-and-project-link-tables.md) |
| 3 | `supabase/migrations/20261016000004_system_design_rules.sql` | `supabase/rollback/system-design-rules-rollback.sql` | [0154](../decisions/0154-system-design-and-bom-rules-are-admin-edited-and-audited.md) |
| 4 | `supabase/migrations/20261016000005_deal_line_syncs_and_pricing_confirmations.sql` | `supabase/rollback/deal-line-syncs-and-pricing-confirmations-rollback.sql` | [0155](../decisions/0155-deal-line-ledger-and-insert-only-pricing-confirmations.md) |

All four only **create** objects: 12 new tables, 4 new functions, their triggers and policies, and
the rules seeds. No existing table, column, policy, grant or row changes. No app code reads these
tables yet, so applying before or after any deploy makes no difference. No backup needed.

## How to apply

1. Paste each forward file into the SQL editor and run it, **in the order above** (2 needs 1; 3
   and 4 stand alone). Run each once: the `create table` statements fail on a second run. If one
   fails partway, run its rollback, fix, and run it again.
2. Confirm it landed. Expect 12 rows, every one with `rls = true`:

```sql
select c.relname, c.relrowsecurity as rls,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
  and c.relname in ('companies','company_name_aliases','contacts','partner_contact_links',
                    'projects','project_contacts','project_submissions',
                    'system_design_rules','bom_rules','design_rules_audit',
                    'deal_line_syncs','quote_pricing_confirmations')
order by 1;
```

   Expected `policies`: 1 each for companies, company_name_aliases, contacts and
   design_rules_audit; 2 for quote_pricing_confirmations; 3 each for system_design_rules,
   bom_rules and deal_line_syncs; 4 each for partner_contact_links, projects, project_contacts and
   project_submissions (31 in all).

3. Confirm the seeds: `select key, value from public.system_design_rules;` gives 3 rows
   (0.5 / 2 / 3), and `select design_item, applies_to_role, sku from public.bom_rules;` gives 6.
   `bom_rules` refuses a SKU no `products` row has, so all six SKUs must already be in the catalog
   (Step 0 confirmed they are).

4. Run the RLS suite. It creates and deletes its own users and test rows:

```bash
node --env-file=.env.local --import tsx scripts/test-rls.ts
```

   Expect every check to pass, including the new 24 to 24h. Before this note's migrations are
   applied, section 24 fails (the tables don't exist), which is expected.

## Rollback

Run in **reverse** order (4, 3, 2, 1). Rollback 1 refuses to run while `projects` exists, by design.
Each rollback file says what data it discards and how to dump it first.
