-- Semi-custom "-NCD" SKUs: upgraded NIC & GPU variants of 3 base VX5 SKUs.
--
-- Adds 3 new SKUs, each a semi-custom variant of an existing base SKU with an
-- upgraded NIC and GPU, priced and sorted as new line items. Hardware specs
-- in product_specs are IDENTICAL to the base SKU's row — the NIC/GPU upgrade
-- is reflected only in the products.product_name suffix and msrp; there is no
-- new "upgraded" spec column to populate (none exists yet), so the spec row
-- is a straight copy of the base SKU keyed under the new SKU.
--
-- Base SKUs (latest effective_date = 2026-07-02, verified against products
-- directly, not current_products, on 2026-08-18):
--   VX5-V500-288  id 58  msrp 52220
--   VX5-V400-192  id 55  msrp 37463
--   VX5-V400-128  id 53  msrp 31034
-- max(sort_order) across all of products at draft time = 36.
--
-- products: STOP AND FLAG convention (per the 20260817000001 / 20260812000001
-- precedent) — apply by hand via the Supabase dashboard SQL editor, not
-- `supabase db push`. This file is a DRAFT and has not been applied.
--
-- New rows:
--   sku                  msrp    sort_order  product_name suffix
--   VX5-V500-288-NCD     54981   37          " - w/ Upgraded NIC & GPU"
--   VX5-V400-192-NCD     40244   38          " - w/ Upgraded NIC & GPU"
--   VX5-V400-128-NCD     33796   39          " - w/ Upgraded NIC & GPU"
--
-- Each products row copies product_name (before the suffix), price_type,
-- product_group, max_cameras, max_storage_tb verbatim from its base row;
-- effective_date = current_date (a new price version, not a backfill);
-- active = true; pushed_to_pipedrive_at left null (never pushed).
--
-- product_specs rows copy every column verbatim from the base SKU's row
-- (id 'VX5-*' -> id 'VX5-*-NCD'), except:
--   updated_at     -> now()          (both are also re-stamped by the
--   revision_date  -> current_date    product_specs_stamp_updated BEFORE
--                                      trigger from 20260727000001 regardless)
--   updated_by     -> null            (nullable — see 20260727000001 line 54:
--                                      "migration and service_role writes have
--                                      no signed-in user"; also re-stamped to
--                                      auth.uid() by the same trigger, which
--                                      is null for this migration's execution
--                                      context)
--
-- The product_specs insert SELECTs from the base row by id rather than
-- hardcoding all 70 columns, to eliminate any chance of a transcription error
-- across long free-text and jsonb-array columns (security_features, etc.).

begin;

-- ---------------------------------------------------------------------------
-- 1. products — 3 new SKUs, new price-version rows.
-- ---------------------------------------------------------------------------

insert into public.products (
  sku, product_name, msrp, price_type, product_group, sort_order, active,
  max_cameras, max_storage_tb, effective_date, pushed_to_pipedrive_at
)
values (
  'VX5-V500-288-NCD',
  'VideoX V500 288TB 2U 12Bay Rack - Net usable 240TB - V5 Video & Analytics Server - 5yr Warranty - w/ Upgraded NIC & GPU',
  54981, 'numeric', 'V500', 37, true, null, null, current_date, null
),
(
  'VX5-V400-192-NCD',
  'VideoX V400 192TB 2U 8Bay Rack - Net usable 144TB - V5 Video & Analytics Server - 5yr Warranty - w/ Upgraded NIC & GPU',
  40244, 'numeric', 'V400', 38, true, null, null, current_date, null
),
(
  'VX5-V400-128-NCD',
  'VideoX V400 128TB 2U 8Bay Rack - Net usable 96TB - V5 Video & Analytics Server - 5yr Warranty - w/ Upgraded NIC & GPU',
  33796, 'numeric', 'V400', 39, true, null, null, current_date, null
);

-- ---------------------------------------------------------------------------
-- 2. product_specs — identical hardware specs to the base SKU, new id.
-- ---------------------------------------------------------------------------

insert into public.product_specs (
  id, model_name, form_factor, storage_raw_tb, cpu_model, cpu_cores_threads,
  cpu_base_ghz, cpu_passmark, ram_gb, max_cameras, max_cameras_h265, network,
  raid_support, os, warranty, vms_certified, notes, product_sku, rack_units,
  drive_bays, max_bandwidth_mbps, os_edition, ram_spec, cpu_model_full,
  cpu_turbo_ghz, cores_threads, cpu_cache, mem_bandwidth, avx_512,
  workload_affinity, chiplet_arch, infinity_guard, hotswap_power, hdd_count,
  hdd_mtbf, raid_level_display, battery_raid, os_ssd_type, os_redundancy,
  gbe_1_ports, gbe_10_ports, sfp_addon, avigilon_gpu, updated_at, updated_by,
  raid_level_alt_display, power_wattage, power_redundancy, power_ac_input,
  power_dc_input, power_max_consumption, cooling, dimensions_mm,
  dimensions_in, shipping_weight, warranty_years, warranty_terms,
  operating_temp, storage_temp, humidity, regulatory_safety,
  regulatory_emissions, ndaa_text, security_features, remote_mgmt,
  os_drive_desc, display_ports, revision_date, product_photo_path,
  rear_io_photo_path, usage_paragraph
)
select
  'VX5-V500-288-NCD', model_name, form_factor, storage_raw_tb, cpu_model,
  cpu_cores_threads, cpu_base_ghz, cpu_passmark, ram_gb, max_cameras,
  max_cameras_h265, network, raid_support, os, warranty, vms_certified,
  notes, product_sku, rack_units, drive_bays, max_bandwidth_mbps, os_edition,
  ram_spec, cpu_model_full, cpu_turbo_ghz, cores_threads, cpu_cache,
  mem_bandwidth, avx_512, workload_affinity, chiplet_arch, infinity_guard,
  hotswap_power, hdd_count, hdd_mtbf, raid_level_display, battery_raid,
  os_ssd_type, os_redundancy, gbe_1_ports, gbe_10_ports, sfp_addon,
  avigilon_gpu, now(), null, raid_level_alt_display, power_wattage,
  power_redundancy, power_ac_input, power_dc_input, power_max_consumption,
  cooling, dimensions_mm, dimensions_in, shipping_weight, warranty_years,
  warranty_terms, operating_temp, storage_temp, humidity, regulatory_safety,
  regulatory_emissions, ndaa_text, security_features, remote_mgmt,
  os_drive_desc, display_ports, current_date, product_photo_path,
  rear_io_photo_path, usage_paragraph
from public.product_specs
where id = 'VX5-V500-288';

insert into public.product_specs (
  id, model_name, form_factor, storage_raw_tb, cpu_model, cpu_cores_threads,
  cpu_base_ghz, cpu_passmark, ram_gb, max_cameras, max_cameras_h265, network,
  raid_support, os, warranty, vms_certified, notes, product_sku, rack_units,
  drive_bays, max_bandwidth_mbps, os_edition, ram_spec, cpu_model_full,
  cpu_turbo_ghz, cores_threads, cpu_cache, mem_bandwidth, avx_512,
  workload_affinity, chiplet_arch, infinity_guard, hotswap_power, hdd_count,
  hdd_mtbf, raid_level_display, battery_raid, os_ssd_type, os_redundancy,
  gbe_1_ports, gbe_10_ports, sfp_addon, avigilon_gpu, updated_at, updated_by,
  raid_level_alt_display, power_wattage, power_redundancy, power_ac_input,
  power_dc_input, power_max_consumption, cooling, dimensions_mm,
  dimensions_in, shipping_weight, warranty_years, warranty_terms,
  operating_temp, storage_temp, humidity, regulatory_safety,
  regulatory_emissions, ndaa_text, security_features, remote_mgmt,
  os_drive_desc, display_ports, revision_date, product_photo_path,
  rear_io_photo_path, usage_paragraph
)
select
  'VX5-V400-192-NCD', model_name, form_factor, storage_raw_tb, cpu_model,
  cpu_cores_threads, cpu_base_ghz, cpu_passmark, ram_gb, max_cameras,
  max_cameras_h265, network, raid_support, os, warranty, vms_certified,
  notes, product_sku, rack_units, drive_bays, max_bandwidth_mbps, os_edition,
  ram_spec, cpu_model_full, cpu_turbo_ghz, cores_threads, cpu_cache,
  mem_bandwidth, avx_512, workload_affinity, chiplet_arch, infinity_guard,
  hotswap_power, hdd_count, hdd_mtbf, raid_level_display, battery_raid,
  os_ssd_type, os_redundancy, gbe_1_ports, gbe_10_ports, sfp_addon,
  avigilon_gpu, now(), null, raid_level_alt_display, power_wattage,
  power_redundancy, power_ac_input, power_dc_input, power_max_consumption,
  cooling, dimensions_mm, dimensions_in, shipping_weight, warranty_years,
  warranty_terms, operating_temp, storage_temp, humidity, regulatory_safety,
  regulatory_emissions, ndaa_text, security_features, remote_mgmt,
  os_drive_desc, display_ports, current_date, product_photo_path,
  rear_io_photo_path, usage_paragraph
from public.product_specs
where id = 'VX5-V400-192';

insert into public.product_specs (
  id, model_name, form_factor, storage_raw_tb, cpu_model, cpu_cores_threads,
  cpu_base_ghz, cpu_passmark, ram_gb, max_cameras, max_cameras_h265, network,
  raid_support, os, warranty, vms_certified, notes, product_sku, rack_units,
  drive_bays, max_bandwidth_mbps, os_edition, ram_spec, cpu_model_full,
  cpu_turbo_ghz, cores_threads, cpu_cache, mem_bandwidth, avx_512,
  workload_affinity, chiplet_arch, infinity_guard, hotswap_power, hdd_count,
  hdd_mtbf, raid_level_display, battery_raid, os_ssd_type, os_redundancy,
  gbe_1_ports, gbe_10_ports, sfp_addon, avigilon_gpu, updated_at, updated_by,
  raid_level_alt_display, power_wattage, power_redundancy, power_ac_input,
  power_dc_input, power_max_consumption, cooling, dimensions_mm,
  dimensions_in, shipping_weight, warranty_years, warranty_terms,
  operating_temp, storage_temp, humidity, regulatory_safety,
  regulatory_emissions, ndaa_text, security_features, remote_mgmt,
  os_drive_desc, display_ports, revision_date, product_photo_path,
  rear_io_photo_path, usage_paragraph
)
select
  'VX5-V400-128-NCD', model_name, form_factor, storage_raw_tb, cpu_model,
  cpu_cores_threads, cpu_base_ghz, cpu_passmark, ram_gb, max_cameras,
  max_cameras_h265, network, raid_support, os, warranty, vms_certified,
  notes, product_sku, rack_units, drive_bays, max_bandwidth_mbps, os_edition,
  ram_spec, cpu_model_full, cpu_turbo_ghz, cores_threads, cpu_cache,
  mem_bandwidth, avx_512, workload_affinity, chiplet_arch, infinity_guard,
  hotswap_power, hdd_count, hdd_mtbf, raid_level_display, battery_raid,
  os_ssd_type, os_redundancy, gbe_1_ports, gbe_10_ports, sfp_addon,
  avigilon_gpu, now(), null, raid_level_alt_display, power_wattage,
  power_redundancy, power_ac_input, power_dc_input, power_max_consumption,
  cooling, dimensions_mm, dimensions_in, shipping_weight, warranty_years,
  warranty_terms, operating_temp, storage_temp, humidity, regulatory_safety,
  regulatory_emissions, ndaa_text, security_features, remote_mgmt,
  os_drive_desc, display_ports, current_date, product_photo_path,
  rear_io_photo_path, usage_paragraph
from public.product_specs
where id = 'VX5-V400-128';

commit;
