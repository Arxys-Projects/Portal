import { GB_PER_TB, type ServerSpec } from "./types";
import { applyPoolOptions, type PoolOptions } from "./pool-filters";

// Failover server sizing for project calcs (ADR 0159). Pure: no I/O.
//
// A failover server takes over ONE failed primary recorder for `failoverDays`.
// One failover covers `primariesPerFailover` primaries, one failure at a time,
// so each failover is sized on one primary's share of the load:
//
//   units              = ceil(primary units / primaries per failover)
//   daily load         = sum over groups of (group storageGb / group retentionDays)
//   per-unit storage   = (daily load / primary units) x failover days
//   per-unit cameras   = the primary SKU's max_cameras
//
// The choice is the cheapest SKU (by MSRP, every unit being the same SKU) whose
// usable storage and camera capacity both clear the per-unit figures. When none
// does, the result has no choice and a warning; it never falls back to the
// primary's SKU.
//
// SIZING BASIS: storageGb is the primary's own basis: required RAID-net capacity
// with the Max disk utilization buffer and the binary charge already in it
// (ADR 0126/0127). A failover that has taken over a primary runs at that
// primary's fill limit, so the two are compared like for like.
//
// MIXED RETENTION: each group contributes its own storage / its own retention
// (ADR 0132), so a 180-day records group and a 7-day dock group each add what
// they write per day. Total / longest retention would under-size the short
// groups' share; total / shortest would over-size the rest. The calc's totals
// (RecommendationInput) carry no retention, which is why this takes groups.
//
// Failover days multiply every group's daily load, including a group whose own
// retention is shorter than the failover days (ADR 0159 records the capped
// alternative for Andy).
//
// POOL: the same candidate pool and filters as the primary (numeric price, the
// V200 to V800 allowlist the loader applies, and the SFP+ 1U exclusion when the
// caller passes it), through the shared applyPoolOptions.

export type FailoverPrimary = {
  sku: string;
  units: number;
};

// One camera group as computeGroup sized it.
export type FailoverGroupLoad = {
  // Required decimal RAID-net capacity over the group's own retention
  // (computeGroup's storageGb): the figure the primary sizes on.
  storageGb: number;
  retentionDays: number;
};

export type FailoverChoice = {
  sku: string;
  productGroup: string;
  productName: string;
  units: number;
  // current_products MSRP: the ranking key, as for the primary. Deal lines take
  // their price from Pipedrive (Step 5), never from here.
  unitMsrp: number;
  maxCameras: number;
  usableStorageTb: number;
};

export type FailoverRecommendation = {
  // null when no SKU in the pool qualifies; `warnings` says why.
  choice: FailoverChoice | null;
  // How many failover servers, whether or not a SKU qualified.
  units: number;
  // Required capacity written per day across the whole calc, decimal GB.
  dailyLoadGb: number;
  // What each failover server must hold for the failover days, decimal TB
  // (net-usable basis).
  requiredPerUnitTb: number;
  // The primary SKU's per-unit camera capacity, which each failover must match.
  requiredMaxCameras: number;
  warnings: string[];
};

function isPositiveInt(n: number): boolean {
  return Number.isInteger(n) && n >= 1;
}

function compare(a: ServerSpec, b: ServerSpec): number {
  if (a.msrp !== b.msrp) return a.msrp - b.msrp;
  // Same price: the tighter fit, then the smaller camera rating, then the SKU.
  if (a.usableStorageTb !== b.usableStorageTb) return a.usableStorageTb - b.usableStorageTb;
  if (a.maxCameras !== b.maxCameras) return a.maxCameras - b.maxCameras;
  return a.sku.localeCompare(b.sku);
}

const fmtTb = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-US");

/**
 * Pass the same `specs` and `options` the primary was recommended with. The
 * pool's own spec warnings (SFP+ disagreements) are not repeated here: the
 * primary's result already carries them.
 */
export function recommendFailover(
  primary: FailoverPrimary,
  groups: readonly FailoverGroupLoad[],
  failoverDays: number,
  primariesPerFailover: number,
  specs: readonly ServerSpec[],
  options: PoolOptions = {},
): FailoverRecommendation {
  if (!isPositiveInt(primary.units)) {
    throw new Error("recommendFailover(): primary units must be a whole number >= 1");
  }
  if (!isPositiveInt(failoverDays)) {
    throw new Error("recommendFailover(): failover days must be a whole number >= 1");
  }
  if (!isPositiveInt(primariesPerFailover)) {
    throw new Error("recommendFailover(): primaries per failover must be a whole number >= 1");
  }
  if (groups.length === 0) {
    throw new Error("recommendFailover(): no camera groups");
  }
  for (const g of groups) {
    if (!(Number.isFinite(g.retentionDays) && g.retentionDays > 0)) {
      throw new Error("recommendFailover(): every group needs a retention > 0");
    }
    if (!(Number.isFinite(g.storageGb) && g.storageGb >= 0)) {
      throw new Error("recommendFailover(): group storage must be >= 0");
    }
  }
  const primarySpec = specs.find((s) => s.sku === primary.sku);
  if (!primarySpec) {
    throw new Error(`recommendFailover(): primary SKU ${primary.sku} is not in the candidate pool`);
  }

  const numericSpecs = specs.filter((s) => s.priceType === "numeric");
  const { pool } = applyPoolOptions(numericSpecs, options);
  if (pool.length === 0) {
    throw new Error("recommendFailover(): no SKUs left in the pool");
  }

  const units = Math.ceil(primary.units / primariesPerFailover);
  const dailyLoadGb = groups.reduce((sum, g) => sum + g.storageGb / g.retentionDays, 0);
  const requiredPerUnitTb = ((dailyLoadGb / primary.units) * failoverDays) / GB_PER_TB;
  const requiredMaxCameras = primarySpec.maxCameras;

  const qualifying = pool
    .filter((s) => s.maxCameras >= requiredMaxCameras && s.usableStorageTb >= requiredPerUnitTb)
    .sort(compare);
  const best = qualifying[0];

  if (!best) {
    return {
      choice: null,
      units,
      dailyLoadGb,
      requiredPerUnitTb,
      requiredMaxCameras,
      warnings: [
        `No failover server fits: each one needs ${fmtTb(requiredPerUnitTb)} TB usable and ` +
          `${requiredMaxCameras} cameras (to take over one ${primary.sku}) for ${failoverDays} days, ` +
          "and no server in the pool has both. Lower the failover days, or have sales engineering review.",
      ],
    };
  }

  return {
    choice: {
      sku: best.sku,
      productGroup: best.productGroup,
      productName: best.productName,
      units,
      unitMsrp: best.msrp,
      maxCameras: best.maxCameras,
      usableStorageTb: best.usableStorageTb,
    },
    units,
    dailyLoadGb,
    requiredPerUnitTb,
    requiredMaxCameras,
    warnings: [],
  };
}
