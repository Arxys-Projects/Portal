// Two product_specs corrections Andy decided on 2026-10-12, from the open items in
// docs/audits/price-book-spec-drift-audit.md §7.
//
//   node --env-file=.env.local --import tsx scripts/fix-product-specs-decisions-2026-10.ts            # dry run
//   node --env-file=.env.local --import tsx scripts/fix-product-specs-decisions-2026-10.ts --apply    # write
//   node --env-file=.env.local --import tsx scripts/fix-product-specs-decisions-2026-10.ts --rollback # undo
//
// 1. The V400 is rated 1600 Mbit/s. An admin set VX5-V400-128 to 1600 in the same
//    form save as the 2026-09-14 EPYC 9015 CPU fields; the refresh migration then
//    moved the CPU on every V400 row but left the other four at 2000. This brings
//    them into line. Changes what the V400 product page, datasheet, System
//    Estimate PDF and new Project Quotes print. Sizing is unaffected: the
//    recommender sizes on cameras and storage, never on this column.
// 2. VX5-V100-32 is Genetec-certified like its two siblings.
//
// Not changed, by Andy's call: the identical V700/V800 shipping weights.
//
// The guarded engine (read, check, write only if unchanged) is in
// product-specs-guarded-fix.ts.

import { runSpecFixes, type SpecFix } from "./product-specs-guarded-fix";

const FIXES: SpecFix[] = [
  {
    column: "max_bandwidth_mbps",
    // VX5-V400-128 already holds 1600 and is deliberately not listed: --rollback
    // would otherwise set it to 2000, a value it never had before this script.
    ids: ["VX5-V400-128-NCD", "VX5-V400-160", "VX5-V400-192", "VX5-V400-192-NCD"],
    from: 2000,
    to: 1600,
    why: "the V400 is rated 1600 Mbit/s on the 9015; four rows were left at 2000",
  },
  {
    column: "vms_certified",
    ids: ["VX5-V100-32"],
    from: "Milestone XProtect, Avigilon ACC",
    to: "Milestone XProtect, Avigilon ACC, Genetec",
    why: "Genetec-certified like VX5-V100-40 and -48",
  },
];

runSpecFixes(FIXES, process.argv.slice(2)).catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
