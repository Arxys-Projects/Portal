// Put the V700 and V800 back on the AMD EPYC 9135 at 325 camera streams. Andy's
// decision, 2026-10-15. ADR 0149.
//
//   node --env-file=.env.local --import tsx scripts/revert-v700-v800-9135-cpu.ts            # dry run
//   node --env-file=.env.local --import tsx scripts/revert-v700-v800-9135-cpu.ts --apply    # write
//   node --env-file=.env.local --import tsx scripts/revert-v700-v800-9135-cpu.ts --rollback # undo
//
// Undoes the V700/V800 half of the 2026-09-14 CPU refresh (migrations
// 20260914000001 and 20260914000002), which moved them to the V500's 3.3GHz part
// and 275 streams. The V400 stays on the 9015; V500 and V600 are not touched.
//
// Not a verbatim restore of the pre-September rows. Three values differ, by
// Andy's call:
//   * cpu_model_full names the part (9135), as the V400's names the 9015. It
//     used to read "AMD EPYC 9005 4.3Ghz 16/32 Core", naming the series.
//   * cpu_turbo_ghz is 4.25 Ghz on both families, AMD's all-core boost. The
//     V800's old 4.55 came from an admin edit on 2026-07-27 and is not an AMD
//     figure.
//   * cpu_base_ghz is 4.3 as before. That is AMD's max boost (base is 3.65);
//     kept because it is the figure Arxys publishes.
// Unchanged and already correct: cpu_model "AMD EPYC 9005 Series", both
// cores/threads columns 16C/32T, cpu_cache 64MB.
//
// The guarded engine (read, check, write only if unchanged) is in
// product-specs-guarded-fix.ts. It writes one column per request, so a run cut
// short leaves a row half-done; re-running finishes it.

import { runSpecFixes, type SpecFix } from "./product-specs-guarded-fix";

const IDS = [
  "VX5-V700-384",
  "VX5-V700-480",
  "VX5-V700-576",
  "VX5-V800-576",
  "VX5-V800-720",
  "VX5-V800-864",
];

const FIXES: SpecFix[] = [
  {
    column: "cpu_model_full",
    ids: IDS,
    from: "AMD EPYC 9005 3.3Ghz 16/32 Core",
    to: "AMD EPYC 9135 4.3Ghz 16/32 Core",
    why: "back on the EPYC 9135, named by part",
  },
  {
    column: "cpu_base_ghz",
    ids: IDS,
    from: 3.3,
    to: 4.3,
    why: "the 9135's published 4.3GHz",
  },
  {
    column: "cpu_turbo_ghz",
    ids: IDS,
    from: "3.3 Ghz",
    to: "4.25 Ghz",
    why: "the 9135's all-core boost, same on both families",
  },
  {
    column: "cpu_passmark",
    ids: IDS,
    from: 48936,
    to: 56984,
    why: "the 9135's PassMark, as held before 2026-09-14",
  },
  {
    column: "max_cameras",
    ids: IDS,
    from: 275,
    to: 325,
    why: "V700/V800 are rated 325 streams on the 9135",
  },
  {
    column: "max_cameras_h265",
    ids: IDS,
    from: 275,
    to: 325,
    why: "always equal to max_cameras in this line",
  },
];

runSpecFixes(FIXES, process.argv.slice(2)).catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
