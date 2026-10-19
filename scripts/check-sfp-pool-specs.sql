-- Read-only check of the SFP+ server pool (ADR 0160). Changes nothing.
--
-- Run it in the Supabase SQL editor (paste the SQL itself, not a file path or a
-- shell command) whenever product_specs.rack_units or sfp_addon may have been
-- edited, and before project calcs turn SFP+ on (Step 4).
--
-- One row per SKU in the recommender's pool: active, numeric price, not hidden
-- from the catalog, V200 to V800, with capacity specs. It reads rack_units and
-- sfp_addon the way src/lib/recommend/pool-filters.ts does:
--   * rack units: a whole number with "U" or "RU" ("1U", "2 U", "4RU"); anything
--     else is unreadable, and an unreadable server is left out under SFP+;
--   * sfp_addon: "Optional..." means the card fits, "No" means it does not.
--
-- Expected today: every row "ok"; the three V200s "left out", the rest "stays
-- in pool". Any "CHECK:" row is a spec to fix in Admin before quoting SFP+.
--
-- Tested in PGlite against stub tables on 2026-10-19.

with pool as (
  select cp.sku, cp.product_group, ps.rack_units, ps.sfp_addon
  from public.current_products cp
  join public.product_specs ps on ps.id = cp.sku
  where cp.active
    and cp.price_type = 'numeric'
    and not cp.hidden_from_catalog
    and cp.product_group in ('V200', 'V400', 'V500', 'V600', 'V700', 'V800')
    and ps.max_cameras is not null
    and ps.storage_raw_tb is not null
),
parsed as (
  select *,
    substring(rack_units from '^\s*(\d+)\s*[Rr]?[Uu]\s*$')::int as units,
    case
      when sfp_addon ~* '^\s*optional\y' then 'yes'
      when sfp_addon ~* '^\s*(no|none|n/a)\y' then 'no'
      else 'unknown'
    end as sfp_offered
  from pool
)
select
  sku,
  rack_units,
  sfp_addon,
  case
    when units is null or units = 0 then 'CHECK: rack units blank or unreadable'
    when sfp_offered = 'unknown' then 'CHECK: sfp_addon blank or unreadable'
    when units = 1 and sfp_offered = 'yes' then 'CHECK: 1U but sfp_addon says optional'
    when units >= 2 and sfp_offered = 'no' then 'CHECK: ' || units || 'U but sfp_addon says no'
    else 'ok'
  end as result,
  case when units >= 2 then 'stays in pool' else 'left out' end as when_sfp_is_on
from parsed
order by product_group, sku;
