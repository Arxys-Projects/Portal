-- Hide the 3 semi-custom "-NCD" SKUs from the price list and the calculator's
-- recommendation engine. They're custom to one partner and must never be
-- listed or suggested generally — but they must still resolve correctly
-- wherever a quote/submission already references the exact SKU (e.g. a
-- Pipedrive deal line item already carrying it), which is unaffected because
-- assemble.ts's showcase/sizing lookups select current_products by explicit
-- SKU with no catalog-visibility filter (src/lib/project-quote/assemble.ts).
--
-- Deliberately a SEPARATE column from `active`, not `active = false`:
-- `active` is RLS-gated (products_select_active_or_admin policy, see
-- 20260521190350_step3_4_products_sku_pk.sql — "active = true or is_admin")
-- and current_products is a security_invoker view, so a non-admin partner
-- viewing their own quote referencing one of these SKUs would lose the row
-- entirely if it were inactive. hidden_from_catalog carries no RLS meaning;
-- it is a plain listing filter applied only by the price-book pages/export
-- and the recommender's candidate-pool query — added in the same migration
-- as the follow-up code change, not held back for one.
--
-- STOP AND FLAG: apply by hand via the Supabase dashboard SQL editor, not
-- `supabase db push` (see 20260817000001 / 20260818000001 precedent — this
-- repo's remote migration history is known to be desynced from some
-- hand-applied migrations, so a push would try to re-run them).

alter table public.products
  add column hidden_from_catalog boolean not null default false;

update public.products
set hidden_from_catalog = true
where sku in ('VX5-V500-288-NCD', 'VX5-V400-192-NCD', 'VX5-V400-128-NCD');

-- current_products has an explicit column list (not `select *`), so the new
-- column is invisible through the view until it's added here too — every
-- query in the app reads current_products, never products directly.
create or replace view public.current_products
with (security_invoker = on) as
select distinct on (sku)
  id,
  sku,
  product_name,
  msrp,
  price_type,
  product_group,
  sort_order,
  active,
  max_cameras,
  max_storage_tb,
  effective_date,
  pushed_to_pipedrive_at,
  updated_at,
  hidden_from_catalog
from public.products
where effective_date <= current_date
order by sku, effective_date desc, id desc;
