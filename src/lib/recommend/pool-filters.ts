import type { ServerSpec } from "./types";

// Candidate-pool filters shared by the primary recommender and the failover
// recommender, so both always choose from the same pool (ADR 0159).
//
// SFP+ 1U EXCLUSION (ADR 0160). The SFP+ option is a NIC card plus a 10Gb
// transceiver pair, and a 1U chassis has no slot for it. When a project calc
// turns SFP+ on, 1U servers leave the pool for the primary AND the failover.
// The key is product_specs.rack_units (Step 0 item 4: in the V200 to V800 pool
// the 1U servers are exactly the three V200s). The column is free text an admin
// edits, so it is parsed ("1U", "1 U", "1RU" are all one unit) and a server stays
// in the SFP+ pool only when it reads as 2U or more. product_specs.sfp_addon says
// the same thing in free text, so it is cross-checked rather than used as the key.
//
// With the option off (every partner calc, Quick Calc, and any project calc
// without SFP+), the pool is the numeric pool exactly as before: same array,
// no warnings. That is what keeps the default path bit-identical.

export type PoolOptions = {
  // Leave 1U servers out of the pool. Callers set it only when SFP+ is on.
  excludeOneU?: boolean;
};

/**
 * Rack height in units, or null when the value is blank or unreadable. Accepts
 * "2U", "2 U", "2RU", "2 ru"; rejects "1.5U", "Tower", "2U/3U".
 */
export function parseRackUnits(rackUnits: string | null | undefined): number | null {
  if (typeof rackUnits !== "string") return null;
  const m = /^\s*(\d+)\s*R?U\s*$/i.exec(rackUnits);
  return m ? Number(m[1]) : null;
}

/** In the SFP+ pool: reads as 2U or taller. Blank or unreadable is left out. */
function takesSfpChassis(rackUnits: string | null | undefined): boolean {
  const u = parseRackUnits(rackUnits);
  return u !== null && u >= 2;
}

/**
 * What product_specs.sfp_addon says, read leniently. Live values (read
 * 2026-10-19) are "No" on the V200s and, on V400 to V800, either a bare
 * "Optional" or "Optional - 2x 10Gb SFP+ or 2x 25Gb SFP28 upgrade available"
 * (one SKU per family carries the long form: the V400-160, and the lowest SKU of
 * V500 to V800).
 */
export function sfpAddonOffered(sfpAddon: string | null | undefined): "yes" | "no" | "unknown" {
  if (typeof sfpAddon !== "string") return "unknown";
  const v = sfpAddon.trim().toLowerCase();
  if (/^optional\b/.test(v)) return "yes";
  if (/^(no|none|n\/a)\b/.test(v)) return "no";
  return "unknown";
}

/**
 * SKUs whose rack_units and sfp_addon disagree about SFP+ (a 1U box must say
 * "No", anything bigger must say "Optional"), or where either is blank or
 * unreadable. Empty when the two columns agree on every SKU given.
 */
export function sfpSpecDisagreements(
  specs: readonly Pick<ServerSpec, "sku" | "rackUnits" | "sfpAddon">[],
): string[] {
  const out: string[] = [];
  for (const s of specs) {
    const offered = sfpAddonOffered(s.sfpAddon);
    const units = parseRackUnits(s.rackUnits);
    if (units === null) {
      out.push(
        `${s.sku}: rack units ${s.rackUnits == null || s.rackUnits.trim() === "" ? "blank" : `"${s.rackUnits}" not recognized`}`,
      );
    } else if (units === 0) {
      out.push(`${s.sku}: rack units "${s.rackUnits}" not recognized`);
    } else if (offered === "unknown") {
      out.push(`${s.sku}: SFP add-on ${s.sfpAddon == null ? "blank" : `"${s.sfpAddon}" not recognized`}`);
    } else if (units === 1 && offered === "yes") {
      out.push(`${s.sku}: 1U but SFP add-on says "${s.sfpAddon}"`);
    } else if (units >= 2 && offered === "no") {
      out.push(`${s.sku}: ${units}U but SFP add-on says "${s.sfpAddon}"`);
    }
  }
  return out;
}

/**
 * Applies the pool options to an already numeric-only pool. Returns the input
 * array itself, with no warnings, when no option is on.
 *
 * Under excludeOneU a server whose rack units are blank or unreadable is left
 * out too: the card cannot be shown to fit, and quoting an impossible build is
 * worse than a smaller pool. A pool loaded without rack_units therefore empties
 * completely, which the callers turn into an error instead of a quiet SFP+ quote
 * on a 1U.
 */
export function applyPoolOptions(
  numericSpecs: readonly ServerSpec[],
  options: PoolOptions,
): { pool: readonly ServerSpec[]; warnings: string[] } {
  if (!options.excludeOneU) return { pool: numericSpecs, warnings: [] };

  const pool = numericSpecs.filter((s) => takesSfpChassis(s.rackUnits));
  const warnings: string[] = [];
  const disagreements = sfpSpecDisagreements(numericSpecs);
  if (disagreements.length > 0) {
    warnings.push(
      "SFP+ is on, and the product specs disagree on which servers take it: " +
        `${disagreements.join("; ")}. 1U servers and servers with blank or unreadable rack units were left out. ` +
        "Check the specs in Admin before quoting.",
    );
  }
  return { pool, warnings };
}
