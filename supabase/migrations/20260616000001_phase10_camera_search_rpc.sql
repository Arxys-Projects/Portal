-- Phase 10 Step 3 — camera-model search RPC
--
-- The calculator's camera-model typeahead searches camera_specs by model AND
-- by model_aliases, scoped to the chosen vendor, filter-as-you-type. The alias
-- match MUST run through the IMMUTABLE helper public.camera_aliases_text(text[])
-- so the planner can use the expression GIN trigram index built over it in
-- 20260615000002 (a naive ILIKE on the array, or on array_to_string directly,
-- would not be index-backed — see that migration's Detours note). PostgREST
-- cannot express a WHERE clause over that helper on its own, so the search is
-- exposed as a SECURITY INVOKER function: RLS on camera_specs (read-open to
-- authenticated) still applies, and the function only reads.
--
-- Returns a trimmed projection (the columns the picker needs), not the whole
-- row. currently_shipping is filtered out so retired models can be re-seeded
-- without surfacing in the picker. Ordered by model for a stable list.

create or replace function public.search_camera_specs(
  p_vendor text,
  p_query  text,
  p_limit  integer default 12
)
returns table (
  id           uuid,
  vendor       text,
  model        text,
  sensor_count integer,
  max_width    integer,
  max_height   integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select cs.id, cs.vendor, cs.model, cs.sensor_count, cs.max_width, cs.max_height
  from public.camera_specs cs
  where cs.vendor = p_vendor
    and cs.currently_shipping
    and (
      cs.model ilike '%' || p_query || '%'
      or public.camera_aliases_text(cs.model_aliases) ilike '%' || p_query || '%'
    )
  order by cs.model
  limit greatest(1, least(coalesce(p_limit, 12), 50));
$$;

revoke all on function public.search_camera_specs(text, text, integer) from public, anon;
grant execute on function public.search_camera_specs(text, text, integer) to authenticated;
