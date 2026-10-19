# Live catalog snapshot, 2026-10-19

Taken by Andy in the Supabase SQL editor at 2026-10-19 20:18:06 UTC. The query (read only) is in the Slice 1 report, Andy action items section. This file summarizes the result and compares it with the policy matrix replayed from the migrations at `2ae9350` (slice report Appendices A and F). The full JSON can be committed alongside this file as `2026-10-19-live-catalog-snapshot.json` when exported.

## Result: no security drift found

| Area | Live | From migrations at `2ae9350` | Result |
|---|---|---|---|
| Tables in `public` | 26, all RLS enabled, none FORCE RLS | 13 base + 13 from `20261016000002` to `000006` | Match |
| Policies | 66 in `public` + 4 on `storage.objects` | 31 base + 35 new in `public`, 4 storage | Match |
| New-table policies | 35 | 35 | Match |
| Non-internal triggers in `public` | 17 | 7 base (including `trg_partners_guard_self_update`) + 10 new | Match |
| `partners_guard_self_update()` | SECURITY INVOKER, `search_path=""`, allow-list `phone`, `updated_at`; trusts non-client roles and active admins | Same (`20261016000001`) | Match |
| `is_admin(uuid)` | DEFINER, `search_path=public`, checks `role='admin' and status='active'`, authenticated EXECUTE | Same | Match |
| `is_internal(uuid)` | DEFINER, `search_path=public`, **no status check**, authenticated EXECUTE | Same | Match (B1-S-3 confirmed live) |
| SECURITY DEFINER functions | `is_admin`, `is_internal`, `rls_auto_enable`, `product_specs_write_audit`, `appliance_specs_write_audit`, `design_rules_write_audit`, `bom_rules_check_sku` (7) | 7 | Match |
| `camera_aliases_text(text[])` | no `search_path`, anon and authenticated EXECUTE | Same | Match (B1-S-10) |
| `pg_trgm` | installed in `public`; its functions anon-executable | Same | Match (B1-S-10) |
| View `current_products` | `security_invoker=on`; anon and authenticated hold ALL | Same | Match (B1-S-10) |
| Event triggers | `ensure_rls` -> `rls_auto_enable`, plus Supabase-managed ones | Same | Match |
| Bucket `partner-logos` | public, no MIME list, no size limit | Same | Match (B1-S-5) |
| Storage policies | admin INSERT/UPDATE/DELETE, `partner_logos_public_read` to `public` | Same | Match |

## Table grants to `authenticated` worth noting (all as the migrations define)

- `submissions`: SELECT, INSERT, UPDATE, DELETE on every column. **Confirms B1-S-2 / B1-A-1 live.**
- `partners`: SELECT, UPDATE (columns are guarded by the trigger).
- `access_requests`: SELECT, UPDATE (B1-S-11).
- `deal_line_syncs`: INSERT, SELECT, UPDATE on every column (B1-A-18 / B1-S-14).
- `project_quotes`, `quote_pricing_confirmations`: INSERT, SELECT only.
- `anon` holds no table grant except on the `current_products` view.

The `column_grants` section of the snapshot repeats each table-level grant per column. It shows no grant beyond the table-level ones.

## What this snapshot does not cover

- Columns, constraints, indexes and sequences. The Performance Advisor covers part of the index picture.
- Catalog data (prices, specs), which B1-A-3 shows can differ from a migration replay.
- `supabase_migrations.schema_migrations`, the CLI's history.
