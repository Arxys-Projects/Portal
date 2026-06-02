import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ProductSpec } from "@/lib/comparison/types";
import type { QuickCompareModel } from "./types";

// 'VX5-V500-192' → 'V500'. Returns null for ids that don't match the pattern.
function familyOf(id: string): string | null {
  const m = /^VX5-(V\d+)-/.exec(id);
  return m ? m[1] : null;
}

// 'V100' → 100, used for V100→V800 ordering.
function familyOrder(family: string): number {
  const n = parseInt(family.replace(/^V/, ""), 10);
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
}

function toModel(family: string, s: ProductSpec): QuickCompareModel {
  return {
    modelFamily: family,
    maxCameras: s.max_cameras,
    maxBandwidthMbps: s.max_bandwidth_mbps ?? null,
    rackUnits: s.rack_units ?? null,
    driveBays: s.drive_bays ?? null,
    warranty: s.warranty,
    osEdition: s.os_edition ?? null,
    ramSpec: s.ram_spec ?? null,
    cpuModelFull: s.cpu_model_full ?? null,
    cpuTurboGhz: s.cpu_turbo_ghz ?? null,
    coresThreads: s.cores_threads ?? null,
    cpuCache: s.cpu_cache ?? null,
    memBandwidth: s.mem_bandwidth ?? null,
    avx512: s.avx_512 ?? null,
    workloadAffinity: s.workload_affinity ?? null,
    chipletArch: s.chiplet_arch ?? null,
    infinityGuard: s.infinity_guard ?? null,
    hotswapPower: s.hotswap_power ?? null,
    hddCount: s.hdd_count ?? null,
    hddMtbf: s.hdd_mtbf ?? null,
    raidLevelDisplay: s.raid_level_display ?? null,
    batteryRaid: s.battery_raid ?? null,
    osSsdType: s.os_ssd_type ?? null,
    osRedundancy: s.os_redundancy ?? null,
    gbe1Ports: s.gbe_1_ports ?? null,
    gbe10Ports: s.gbe_10_ports ?? null,
    sfpAddon: s.sfp_addon ?? null,
    avigilonGpu: s.avigilon_gpu ?? null,
  };
}

/**
 * Returns one QuickCompareModel per V5 model family, ordered V100→V800.
 *
 * product_specs holds one row per SKU tier (VX5-V100-32/-40/-48), but the
 * QuickCompare spec values are identical across tiers within a family, so we
 * dedupe to the first row seen per family. V900 is intentionally absent — it
 * has no product_specs rows (see ADR 0044 / JOURNAL Phase 6 Step 1).
 */
export async function getQuickCompareModels(): Promise<QuickCompareModel[]> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("product_specs")
    .select("*")
    .like("id", "VX5-V%")
    .order("id");

  const byFamily = new Map<string, QuickCompareModel>();
  for (const row of data ?? []) {
    const spec = row as unknown as ProductSpec;
    const family = familyOf(spec.id);
    if (!family) continue;
    if (!byFamily.has(family)) {
      byFamily.set(family, toModel(family, spec));
    }
  }

  return [...byFamily.values()].sort(
    (a, b) => familyOrder(a.modelFamily) - familyOrder(b.modelFamily),
  );
}
